import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { parseEpubMetadata, validateEpubFile } from '@/lib/epub-parser';

export type BookStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

export interface UserBook {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  epub_url: string;
  status: BookStatus;
  created_at: string;
  updated_at: string;
}

export function useBooks() {
  const { user } = useAuth();
  const [books, setBooks] = useState<UserBook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Fetch user's books
  useEffect(() => {
    if (!user) {
      setBooks([]);
      setIsLoading(false);
      return;
    }

    const fetchBooks = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching books:', error);
        toast.error('Failed to load your library');
      } else {
        setBooks(data || []);
      }
      setIsLoading(false);
    };

    fetchBooks();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('books-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'books',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setBooks((prev) => [payload.new as UserBook, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setBooks((prev) =>
              prev.map((book) =>
                book.id === (payload.new as UserBook).id
                  ? (payload.new as UserBook)
                  : book
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setBooks((prev) =>
              prev.filter((book) => book.id !== (payload.old as UserBook).id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const uploadBook = async (file: File): Promise<boolean> => {
    if (!user) {
      toast.error('Please sign in to upload books');
      return false;
    }

    // Validate file
    const validation = validateEpubFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return false;
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      // Parse EPUB metadata
      setUploadProgress(20);
      const metadata = await parseEpubMetadata(file);
      setUploadProgress(40);

      // Upload EPUB file to storage
      const epubFileName = `${user.id}/${Date.now()}-${file.name}`;
      const { error: epubError } = await supabase.storage
        .from('epub-files')
        .upload(epubFileName, file);

      if (epubError) {
        throw new Error(`Failed to upload EPUB: ${epubError.message}`);
      }
      setUploadProgress(60);

      // Get EPUB URL
      const { data: epubUrlData } = supabase.storage
        .from('epub-files')
        .getPublicUrl(epubFileName);
      
      // For private bucket, we store the path instead of public URL
      const epubUrl = epubFileName;

      // Upload cover if available
      let coverUrl: string | null = null;
      if (metadata.coverBlob) {
        const coverFileName = `${user.id}/${Date.now()}-cover.jpg`;
        const { error: coverError } = await supabase.storage
          .from('book-covers')
          .upload(coverFileName, metadata.coverBlob);

        if (!coverError) {
          const { data: coverUrlData } = supabase.storage
            .from('book-covers')
            .getPublicUrl(coverFileName);
          coverUrl = coverUrlData.publicUrl;
        }
      }
      setUploadProgress(80);

      // Insert book record
      const { error: insertError } = await supabase.from('books').insert({
        user_id: user.id,
        title: metadata.title,
        author: metadata.author,
        epub_url: epubUrl,
        cover_url: coverUrl,
        status: 'uploaded',
      });

      if (insertError) {
        throw new Error(`Failed to save book: ${insertError.message}`);
      }

      setUploadProgress(100);
      toast.success(`"${metadata.title}" added to your library!`);
      return true;
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload book');
      return false;
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const deleteBook = async (bookId: string): Promise<boolean> => {
    if (!user) {
      toast.error('Please sign in to delete books');
      return false;
    }

    try {
      // 1. Get book info for storage cleanup
      const bookToDelete = books.find((b) => b.id === bookId);
      if (!bookToDelete) {
        toast.error('Book not found');
        return false;
      }

      // 2. Get all audio tracks for this book to delete audio files
      const { data: audioTracks } = await supabase
        .from('audio_tracks')
        .select('audio_url')
        .eq('book_id', bookId);

      // 3. Delete audio files from storage
      if (audioTracks && audioTracks.length > 0) {
        const audioFilePaths = audioTracks
          .filter((t) => t.audio_url)
          .map((t) => t.audio_url as string);

        if (audioFilePaths.length > 0) {
          await supabase.storage.from('audio-files').remove(audioFilePaths);
        }
      }

      // 4. Delete audio track records
      await supabase.from('audio_tracks').delete().eq('book_id', bookId);

      // 5. Delete playback progress
      await supabase
        .from('playback_progress')
        .delete()
        .eq('book_id', bookId)
        .eq('user_id', user.id);

      // 6. Delete EPUB file from storage
      if (bookToDelete.epub_url) {
        await supabase.storage.from('epub-files').remove([bookToDelete.epub_url]);
      }

      // 7. Delete cover image from storage (if it's a user-uploaded cover)
      if (bookToDelete.cover_url && bookToDelete.cover_url.includes('book-covers')) {
        // Extract the path from the full URL
        const coverPath = bookToDelete.cover_url.split('book-covers/')[1];
        if (coverPath) {
          await supabase.storage.from('book-covers').remove([coverPath]);
        }
      }

      // 8. Finally delete the book record
      const { error } = await supabase.from('books').delete().eq('id', bookId);

      if (error) throw error;

      toast.success('Book deleted permanently');
      return true;
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete book');
      return false;
    }
  };

  return {
    books,
    isLoading,
    isUploading,
    uploadProgress,
    uploadBook,
    deleteBook,
  };
}
