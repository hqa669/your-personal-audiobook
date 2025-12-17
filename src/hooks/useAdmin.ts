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

export interface PublicBookChapter {
  id: string;
  book_id: string;
  chapter_index: number;
  title: string;
  audio_url: string;
  sync_url: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface NewPublicBook {
  title: string;
  author?: string;
  genre?: string;
  description?: string;
  cover_url?: string;
  epub_url: string;
  slug?: string;
  is_featured?: boolean;
}

export interface NewPublicBookChapter {
  book_id: string;
  chapter_index: number;
  title: string;
  audio_url: string;
  sync_url?: string;
  duration_seconds?: number;
}

export function useAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [books, setBooks] = useState<PublicBook[]>([]);
  const [chapters, setChapters] = useState<PublicBookChapter[]>([]);

  // Check if current user is admin
  useEffect(() => {
    async function checkAdminRole() {
      if (!user) {
        setIsAdmin(false);
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'admin'
        });

        if (error) {
          console.error('Error checking admin role:', error);
          setIsAdmin(false);
        } else {
          setIsAdmin(data === true);
        }
      } catch (err) {
        console.error('Error checking admin role:', err);
        setIsAdmin(false);
      } finally {
        setIsLoading(false);
      }
    }

    checkAdminRole();
  }, [user]);

  // Fetch all public books
  async function fetchPublicBooks() {
    const { data, error } = await supabase
      .from('public_books')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching public books:', error);
      toast.error('Failed to fetch public books');
      return;
    }

    setBooks(data || []);
  }

  // Fetch chapters for a specific book
  async function fetchChapters(bookId: string) {
    const { data, error } = await supabase
      .from('public_book_chapters')
      .select('*')
      .eq('book_id', bookId)
      .order('chapter_index', { ascending: true });

    if (error) {
      console.error('Error fetching chapters:', error);
      toast.error('Failed to fetch chapters');
      return;
    }

    setChapters(data || []);
  }

  // Add a new public book
  async function addPublicBook(book: NewPublicBook): Promise<string | null> {
    const { data, error } = await supabase
      .from('public_books')
      .insert(book)
      .select()
      .single();

    if (error) {
      console.error('Error adding public book:', error);
      toast.error('Failed to add book: ' + error.message);
      return null;
    }

    toast.success('Book added successfully');
    await fetchPublicBooks();
    return data.id;
  }

  // Update a public book
  async function updatePublicBook(id: string, updates: Partial<NewPublicBook>): Promise<boolean> {
    const { error } = await supabase
      .from('public_books')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating book:', error);
      toast.error('Failed to update book: ' + error.message);
      return false;
    }

    toast.success('Book updated successfully');
    await fetchPublicBooks();
    return true;
  }

  // Delete a public book
  async function deletePublicBook(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('public_books')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting book:', error);
      toast.error('Failed to delete book: ' + error.message);
      return false;
    }

    toast.success('Book deleted successfully');
    await fetchPublicBooks();
    return true;
  }

  // Add a chapter to a book
  async function addChapter(chapter: NewPublicBookChapter): Promise<boolean> {
    const { error } = await supabase
      .from('public_book_chapters')
      .insert(chapter);

    if (error) {
      console.error('Error adding chapter:', error);
      toast.error('Failed to add chapter: ' + error.message);
      return false;
    }

    toast.success('Chapter added successfully');
    await fetchChapters(chapter.book_id);
    return true;
  }

  // Update a chapter
  async function updateChapter(id: string, updates: Partial<NewPublicBookChapter>): Promise<boolean> {
    const { error } = await supabase
      .from('public_book_chapters')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating chapter:', error);
      toast.error('Failed to update chapter: ' + error.message);
      return false;
    }

    toast.success('Chapter updated successfully');
    if (updates.book_id) {
      await fetchChapters(updates.book_id);
    }
    return true;
  }

  // Delete a chapter
  async function deleteChapter(id: string, bookId: string): Promise<boolean> {
    const { error } = await supabase
      .from('public_book_chapters')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting chapter:', error);
      toast.error('Failed to delete chapter: ' + error.message);
      return false;
    }

    toast.success('Chapter deleted successfully');
    await fetchChapters(bookId);
    return true;
  }

  // Upload file to public-library bucket
  async function uploadFile(file: File, path: string): Promise<string | null> {
    const { error } = await supabase.storage
      .from('public-library')
      .upload(path, file, { upsert: true });

    if (error) {
      console.error('Error uploading file:', error);
      toast.error('Failed to upload file: ' + error.message);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('public-library')
      .getPublicUrl(path);

    return urlData.publicUrl;
  }

  return {
    isAdmin,
    isLoading,
    books,
    chapters,
    fetchPublicBooks,
    fetchChapters,
    addPublicBook,
    updatePublicBook,
    deletePublicBook,
    addChapter,
    updateChapter,
    deleteChapter,
    uploadFile,
  };
}
