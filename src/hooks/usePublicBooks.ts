import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface PublicBook {
  id: string;
  title: string;
  author: string | null;
  genre: string | null;
  description: string | null;
  cover_url: string | null;
  epub_url: string;
  slug: string | null;
  is_featured: boolean | null;
  created_at: string;
}

export function usePublicBooks() {
  const { user } = useAuth();
  const [books, setBooks] = useState<PublicBook[]>([]);
  const [userLibraryIds, setUserLibraryIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [genres, setGenres] = useState<string[]>(['All']);

  // Fetch all public books
  useEffect(() => {
    async function fetchBooks() {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('public_books')
        .select('*')
        .order('is_featured', { ascending: false })
        .order('title', { ascending: true });

      if (error) {
        console.error('Error fetching public books:', error);
        toast.error('Failed to load books');
      } else {
        setBooks(data || []);
        
        // Extract unique genres
        const uniqueGenres = new Set<string>();
        data?.forEach(book => {
          if (book.genre) uniqueGenres.add(book.genre);
        });
        setGenres(['All', ...Array.from(uniqueGenres).sort()]);
      }
      setIsLoading(false);
    }

    fetchBooks();
  }, []);

  // Fetch user's library (books they've added)
  useEffect(() => {
    if (!user) {
      setUserLibraryIds(new Set());
      return;
    }

    async function fetchUserLibrary() {
      const { data, error } = await supabase
        .from('user_public_books')
        .select('public_book_id')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching user library:', error);
      } else {
        setUserLibraryIds(new Set(data?.map(d => d.public_book_id) || []));
      }
    }

    fetchUserLibrary();
  }, [user]);

  // Add book to user's library
  async function addToLibrary(bookId: string): Promise<boolean> {
    if (!user) {
      toast.error('Please sign in to add books to your library');
      return false;
    }

    if (userLibraryIds.has(bookId)) {
      toast.info('This book is already in your library');
      return false;
    }

    const { error } = await supabase
      .from('user_public_books')
      .insert({
        user_id: user.id,
        public_book_id: bookId,
      });

    if (error) {
      console.error('Error adding to library:', error);
      toast.error('Failed to add book to library');
      return false;
    }

    setUserLibraryIds(prev => new Set([...prev, bookId]));
    toast.success('Book added to your library!');
    return true;
  }

  // Remove book from user's library
  async function removeFromLibrary(bookId: string): Promise<boolean> {
    if (!user) return false;

    const { error } = await supabase
      .from('user_public_books')
      .delete()
      .eq('user_id', user.id)
      .eq('public_book_id', bookId);

    if (error) {
      console.error('Error removing from library:', error);
      toast.error('Failed to remove book from library');
      return false;
    }

    setUserLibraryIds(prev => {
      const next = new Set(prev);
      next.delete(bookId);
      return next;
    });
    toast.success('Book removed from your library');
    return true;
  }

  // Check if book is in user's library
  function isInLibrary(bookId: string): boolean {
    return userLibraryIds.has(bookId);
  }

  return {
    books,
    genres,
    isLoading,
    addToLibrary,
    removeFromLibrary,
    isInLibrary,
  };
}
