import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parseEpubChapters, ParsedBook, Chapter } from '@/lib/epub-chapter-parser';
import { useAuth } from '@/contexts/AuthContext';

interface PublicBookData {
  id: string;
  title: string;
  author: string;
  epubUrl: string;
  coverUrl: string | null;
}

interface PublicChapter {
  id: string;
  chapter_index: number;
  title: string;
  audio_url: string;
  sync_url: string | null;
  duration_seconds: number | null;
}

interface PlaybackProgress {
  chapterIndex: number;
  positionSeconds: number;
}

export function usePublicBookReader(publicBookId: string | undefined) {
  const { user } = useAuth();
  const [book, setBook] = useState<PublicBookData | null>(null);
  const [parsedBook, setParsedBook] = useState<ParsedBook | null>(null);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [chapterIndex, setChapterIndex] = useState<number | null>(null);
  const [publicChapters, setPublicChapters] = useState<PublicChapter[]>([]);
  const [initialProgressLoaded, setInitialProgressLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<PlaybackProgress>({ chapterIndex: 0, positionSeconds: 0 });
  
  const isLoadingBookRef = useRef(false);
  const isLoadingEpubRef = useRef(false);
  const loadedBookIdRef = useRef<string | null>(null);

  // Fetch public book and chapters
  const fetchBook = useCallback(async () => {
    if (!publicBookId) return;
    if (isLoadingBookRef.current) return;
    if (loadedBookIdRef.current === publicBookId && book) return;
    
    isLoadingBookRef.current = true;
    setIsLoading(true);
    setError(null);
    
    try {
      // Fetch public book
      const { data: bookData, error: bookError } = await supabase
        .from('public_books')
        .select('id, title, author, epub_url, cover_url')
        .eq('id', publicBookId)
        .single();
      
      if (bookError) throw bookError;
      if (!bookData) throw new Error('Book not found');
      
      setBook({
        id: bookData.id,
        title: bookData.title,
        author: bookData.author || 'Unknown Author',
        epubUrl: bookData.epub_url,
        coverUrl: bookData.cover_url,
      });
      loadedBookIdRef.current = publicBookId;
      
      // Fetch chapters with audio
      const { data: chaptersData, error: chaptersError } = await supabase
        .from('public_book_chapters')
        .select('id, chapter_index, title, audio_url, sync_url, duration_seconds')
        .eq('book_id', publicBookId)
        .order('chapter_index', { ascending: true });
      
      if (chaptersError) {
        console.error('Failed to fetch chapters:', chaptersError);
      } else {
        setPublicChapters(chaptersData || []);
      }
      
      // Fetch existing progress if user is logged in
      let savedChapter = 0;
      let savedPosition = 0;
      
      if (user) {
        const { data: progressData } = await supabase
          .from('public_book_progress')
          .select('chapter_index, position_seconds')
          .eq('public_book_id', publicBookId)
          .eq('user_id', user.id)
          .single();
        
        if (progressData) {
          savedChapter = progressData.chapter_index || 0;
          savedPosition = progressData.position_seconds || 0;
        }
      }
      
      setProgress({ chapterIndex: savedChapter, positionSeconds: savedPosition });
      setChapterIndex(savedChapter);
      setInitialProgressLoaded(true);
    } catch (err) {
      console.error('Failed to fetch public book:', err);
      setError('Failed to load book');
      setIsLoading(false);
    } finally {
      isLoadingBookRef.current = false;
    }
  }, [publicBookId, user, book]);

  // Parse EPUB
  const loadEpub = useCallback(async () => {
    if (!book?.epubUrl || !initialProgressLoaded) return;
    if (isLoadingEpubRef.current) return;
    if (parsedBook && loadedBookIdRef.current === book.id) {
      setIsLoading(false);
      return;
    }
    
    isLoadingEpubRef.current = true;
    const targetChapter = chapterIndex ?? 0;
    
    try {
      // Public books use direct URLs from public storage
      const parsed = await parseEpubChapters(book.epubUrl);
      setParsedBook(parsed);
      
      if (parsed.chapters[targetChapter]) {
        setCurrentChapter(parsed.chapters[targetChapter]);
      } else {
        setCurrentChapter(parsed.chapters[0]);
        setChapterIndex(0);
      }
    } catch (err) {
      console.error('Failed to parse EPUB:', err);
      setError('Failed to parse book content');
    } finally {
      isLoadingEpubRef.current = false;
      setIsLoading(false);
    }
  }, [book?.epubUrl, book?.id, chapterIndex, parsedBook, initialProgressLoaded]);

  useEffect(() => {
    fetchBook();
  }, [fetchBook]);

  useEffect(() => {
    loadEpub();
  }, [loadEpub]);

  // Save progress
  const saveProgress = useCallback(async (newChapterIndex?: number, positionSeconds?: number) => {
    if (!publicBookId || !user) return;
    
    const chapterToSave = newChapterIndex ?? chapterIndex ?? 0;
    const positionToSave = positionSeconds ?? progress.positionSeconds;
    
    try {
      const { error: upsertError } = await supabase
        .from('public_book_progress')
        .upsert({
          public_book_id: publicBookId,
          user_id: user.id,
          chapter_index: chapterToSave,
          position_seconds: positionToSave,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'public_book_id,user_id',
        });
      
      if (upsertError) {
        console.error('Failed to save progress:', upsertError);
      }
      
      setProgress({ chapterIndex: chapterToSave, positionSeconds: positionToSave });
    } catch (err) {
      console.error('Failed to save progress:', err);
    }
  }, [publicBookId, user, chapterIndex, progress.positionSeconds]);

  // Navigate to chapter
  const goToChapter = useCallback((index: number) => {
    if (!parsedBook || index < 0 || index >= parsedBook.chapters.length) return;
    
    setChapterIndex(index);
    setCurrentChapter(parsedBook.chapters[index]);
    saveProgress(index);
  }, [parsedBook, saveProgress]);

  const nextChapter = useCallback(() => {
    goToChapter((chapterIndex ?? 0) + 1);
  }, [chapterIndex, goToChapter]);

  const prevChapter = useCallback(() => {
    goToChapter((chapterIndex ?? 0) - 1);
  }, [chapterIndex, goToChapter]);

  // Get current chapter audio info - match by title since EPUB may have extra chapters (preface, title page, etc.)
  const currentChapterAudio = (() => {
    if (!currentChapter || publicChapters.length === 0) return undefined;
    
    // First try exact title match
    const byTitle = publicChapters.find(c => 
      c.title.toLowerCase().trim() === currentChapter.title.toLowerCase().trim()
    );
    if (byTitle) return byTitle;
    
    // Try partial match (chapter title contains the audio chapter title or vice versa)
    const byPartialMatch = publicChapters.find(c => 
      currentChapter.title.toLowerCase().includes(c.title.toLowerCase()) ||
      c.title.toLowerCase().includes(currentChapter.title.toLowerCase())
    );
    if (byPartialMatch) return byPartialMatch;
    
    // Fallback: try matching by chapter number extraction
    const chapterNumMatch = currentChapter.title.match(/chapter\s*(\d+)/i);
    if (chapterNumMatch) {
      const chapterNum = parseInt(chapterNumMatch[1], 10);
      const byChapterNum = publicChapters.find(c => {
        const audioChapterMatch = c.title.match(/chapter\s*(\d+)/i);
        return audioChapterMatch && parseInt(audioChapterMatch[1], 10) === chapterNum;
      });
      if (byChapterNum) return byChapterNum;
    }
    
    return undefined;
  })();

  return {
    book,
    parsedBook,
    currentChapter,
    progress,
    chapterIndex: chapterIndex ?? 0,
    totalChapters: parsedBook?.chapters.length || 0,
    isLoading,
    error,
    goToChapter,
    nextChapter,
    prevChapter,
    saveProgress,
    hasNext: parsedBook ? (chapterIndex ?? 0) < parsedBook.chapters.length - 1 : false,
    hasPrev: (chapterIndex ?? 0) > 0,
    publicChapters,
    currentChapterAudio,
  };
}
