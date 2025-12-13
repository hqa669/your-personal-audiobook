import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parseEpubChapters, ParsedBook, Chapter } from '@/lib/epub-chapter-parser';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface PlaybackProgress {
  chapterIndex: number;
  positionSeconds: number;
}

export function useBookReader(bookId: string | undefined) {
  const { user } = useAuth();
  const [book, setBook] = useState<{ id: string; title: string; author: string; epubUrl: string; status: string } | null>(null);
  const [parsedBook, setParsedBook] = useState<ParsedBook | null>(null);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<PlaybackProgress>({ chapterIndex: 0, positionSeconds: 0 });

  // Fetch book data from database
  useEffect(() => {
    async function fetchBook() {
      if (!bookId || !user) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        const { data, error: fetchError } = await supabase
          .from('books')
          .select('id, title, author, epub_url, status')
          .eq('id', bookId)
          .eq('user_id', user.id)
          .single();
        
        if (fetchError) throw fetchError;
        if (!data) throw new Error('Book not found');
        
        setBook({
          id: data.id,
          title: data.title,
          author: data.author || 'Unknown Author',
          epubUrl: data.epub_url,
          status: data.status,
        });
        
        // Fetch existing progress
        const { data: progressData } = await supabase
          .from('playback_progress')
          .select('chapter_index, position_seconds')
          .eq('book_id', bookId)
          .eq('user_id', user.id)
          .single();
        
        if (progressData) {
          setProgress({
            chapterIndex: progressData.chapter_index || 0,
            positionSeconds: progressData.position_seconds || 0,
          });
          setChapterIndex(progressData.chapter_index || 0);
        }
      } catch (err) {
        console.error('Failed to fetch book:', err);
        setError('Failed to load book');
        setIsLoading(false);
      }
    }
    
    fetchBook();
  }, [bookId, user]);

  // Parse EPUB when book is loaded
  useEffect(() => {
    async function loadEpub() {
      if (!book?.epubUrl) return;
      
      try {
        // Get signed URL for the EPUB file
        const epubPath = book.epubUrl.split('/').slice(-2).join('/');
        const { data: signedData, error: signError } = await supabase.storage
          .from('epub-files')
          .createSignedUrl(epubPath, 3600);
        
        if (signError || !signedData?.signedUrl) {
          throw new Error('Failed to get EPUB access');
        }
        
        const parsed = await parseEpubChapters(signedData.signedUrl);
        setParsedBook(parsed);
        
        // Set current chapter based on saved progress
        if (parsed.chapters[chapterIndex]) {
          setCurrentChapter(parsed.chapters[chapterIndex]);
        } else {
          setCurrentChapter(parsed.chapters[0]);
        }
      } catch (err) {
        console.error('Failed to parse EPUB:', err);
        setError('Failed to parse book content');
      } finally {
        setIsLoading(false);
      }
    }
    
    loadEpub();
  }, [book?.epubUrl, chapterIndex]);

  // Navigate to chapter
  const goToChapter = useCallback((index: number) => {
    if (!parsedBook || index < 0 || index >= parsedBook.chapters.length) return;
    
    setChapterIndex(index);
    setCurrentChapter(parsedBook.chapters[index]);
  }, [parsedBook]);

  const nextChapter = useCallback(() => {
    goToChapter(chapterIndex + 1);
  }, [chapterIndex, goToChapter]);

  const prevChapter = useCallback(() => {
    goToChapter(chapterIndex - 1);
  }, [chapterIndex, goToChapter]);

  // Save progress
  const saveProgress = useCallback(async (newChapterIndex?: number, positionSeconds?: number) => {
    if (!bookId || !user) return;
    
    const chapterToSave = newChapterIndex ?? chapterIndex;
    const positionToSave = positionSeconds ?? progress.positionSeconds;
    
    try {
      const { error: upsertError } = await supabase
        .from('playback_progress')
        .upsert({
          book_id: bookId,
          user_id: user.id,
          chapter_index: chapterToSave,
          position_seconds: positionToSave,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'book_id,user_id',
        });
      
      if (upsertError) {
        // If conflict resolution fails, try insert
        await supabase
          .from('playback_progress')
          .insert({
            book_id: bookId,
            user_id: user.id,
            chapter_index: chapterToSave,
            position_seconds: positionToSave,
          });
      }
      
      setProgress({ chapterIndex: chapterToSave, positionSeconds: positionToSave });
    } catch (err) {
      console.error('Failed to save progress:', err);
    }
  }, [bookId, user, chapterIndex, progress.positionSeconds]);

  // Save progress when chapter changes
  useEffect(() => {
    if (parsedBook && currentChapter) {
      saveProgress(chapterIndex);
    }
  }, [chapterIndex]);

  return {
    book,
    parsedBook,
    currentChapter,
    chapterIndex,
    totalChapters: parsedBook?.chapters.length || 0,
    isLoading,
    error,
    goToChapter,
    nextChapter,
    prevChapter,
    saveProgress,
    hasNext: parsedBook ? chapterIndex < parsedBook.chapters.length - 1 : false,
    hasPrev: chapterIndex > 0,
  };
}
