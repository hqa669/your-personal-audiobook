import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [chapterIndex, setChapterIndex] = useState<number | null>(null);
  const [initialProgressLoaded, setInitialProgressLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<PlaybackProgress>({ chapterIndex: 0, positionSeconds: 0 });
  
  // Refs for idempotent loading
  const isLoadingBookRef = useRef(false);
  const isLoadingEpubRef = useRef(false);
  const loadedBookIdRef = useRef<string | null>(null);

  // Idempotent book fetch function
  const fetchBook = useCallback(async () => {
    if (!bookId || !user) return;
    if (isLoadingBookRef.current) {
      console.log('[useBookReader] Book fetch already in progress, skipping');
      return;
    }
    // Skip if already loaded this book
    if (loadedBookIdRef.current === bookId && book) {
      console.log('[useBookReader] Book already loaded, skipping fetch');
      return;
    }
    
    isLoadingBookRef.current = true;
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('[useBookReader] Fetching book:', bookId);
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
      loadedBookIdRef.current = bookId;
      
      // Fetch existing progress
      const { data: progressData } = await supabase
        .from('playback_progress')
        .select('chapter_index, position_seconds')
        .eq('book_id', bookId)
        .eq('user_id', user.id)
        .single();
      
      const savedChapter = progressData?.chapter_index || 0;
      const savedPosition = progressData?.position_seconds || 0;
      setProgress({ chapterIndex: savedChapter, positionSeconds: savedPosition });
      setChapterIndex(savedChapter);
      setInitialProgressLoaded(true);
      console.log('[useBookReader] Restored progress - chapter:', savedChapter, 'position:', savedPosition);
    } catch (err) {
      console.error('[useBookReader] Failed to fetch book:', err);
      setError('Failed to load book');
      setIsLoading(false);
    } finally {
      isLoadingBookRef.current = false;
    }
  }, [bookId, user, book]);

  // Idempotent EPUB parsing function - waits for progress to load first
  const loadEpub = useCallback(async () => {
    if (!book?.epubUrl || !initialProgressLoaded) return;
    if (isLoadingEpubRef.current) {
      console.log('[useBookReader] EPUB parse already in progress, skipping');
      return;
    }
    // Skip if already parsed for this book
    if (parsedBook && loadedBookIdRef.current === book.id) {
      console.log('[useBookReader] EPUB already parsed, skipping');
      setIsLoading(false);
      return;
    }
    
    isLoadingEpubRef.current = true;
    const targetChapter = chapterIndex ?? 0;
    
    try {
      console.log('[useBookReader] Parsing EPUB for book:', book.id, 'target chapter:', targetChapter);
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
      if (parsed.chapters[targetChapter]) {
        setCurrentChapter(parsed.chapters[targetChapter]);
      } else {
        setCurrentChapter(parsed.chapters[0]);
        setChapterIndex(0);
      }
    } catch (err) {
      console.error('[useBookReader] Failed to parse EPUB:', err);
      setError('Failed to parse book content');
    } finally {
      isLoadingEpubRef.current = false;
      setIsLoading(false);
    }
  }, [book?.epubUrl, book?.id, chapterIndex, parsedBook, initialProgressLoaded]);

  // Handle page visibility changes - retry loading if stuck
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('[useBookReader] Tab became visible, checking state...');
        // If still loading and no active fetch, retry
        if (isLoading && !isLoadingBookRef.current && !isLoadingEpubRef.current) {
          console.log('[useBookReader] Detected stuck loading state, retrying...');
          if (!book) {
            fetchBook();
          } else if (!parsedBook) {
            loadEpub();
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isLoading, book, parsedBook, fetchBook, loadEpub]);

  // Fail-safe timeout to retry stuck loading
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (isLoading && !isLoadingBookRef.current && !isLoadingEpubRef.current) {
        console.log('[useBookReader] Fail-safe timeout triggered, retrying...');
        if (!book) {
          fetchBook();
        } else if (!parsedBook) {
          loadEpub();
        }
      }
    }, 8000);

    return () => clearTimeout(timeout);
  }, [isLoading, book, parsedBook, fetchBook, loadEpub]);

  // Initial book fetch
  useEffect(() => {
    fetchBook();
  }, [fetchBook]);

  // Parse EPUB when book is loaded
  useEffect(() => {
    loadEpub();
  }, [loadEpub]);

  // Save progress
  const saveProgress = useCallback(async (newChapterIndex?: number, positionSeconds?: number) => {
    if (!bookId || !user) return;
    
    const chapterToSave = newChapterIndex ?? chapterIndex ?? 0;
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

  return {
    book,
    parsedBook,
    currentChapter,
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
  };
}
