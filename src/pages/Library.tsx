import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Plus, Loader2, BookOpen } from 'lucide-react';
import { Header } from '@/components/Header';
import { BookCard, AddBookCard } from '@/components/BookCard';
import { UploadBookModal } from '@/components/UploadBookModal';
import { DeleteBookDialog } from '@/components/DeleteBookDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBooks, UserBook } from '@/hooks/useBooks';
import { usePublicBooks, PublicBook } from '@/hooks/usePublicBooks';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Unified library book type
interface LibraryBook {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  status: 'uploaded' | 'processing' | 'ready' | 'failed';
  isPublicBook: boolean;
  publicBookId?: string; // Original public book ID for routing
}

export default function Library() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<LibraryBook | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [userPublicBooks, setUserPublicBooks] = useState<PublicBook[]>([]);
  const [isLoadingPublicBooks, setIsLoadingPublicBooks] = useState(true);
  
  const { books: userBooks, isLoading: isLoadingUserBooks, isUploading, uploadProgress, uploadBook, deleteBook } = useBooks();
  const { books: allPublicBooks, isLoading: isLoadingAllPublicBooks, addToLibrary, isInLibrary } = usePublicBooks();

  // Fetch user's added public books
  useEffect(() => {
    if (!user) {
      setUserPublicBooks([]);
      setIsLoadingPublicBooks(false);
      return;
    }

    const fetchUserPublicBooks = async () => {
      setIsLoadingPublicBooks(true);
      
      // First get the public book IDs the user has added
      const { data: userBookLinks, error: linksError } = await supabase
        .from('user_public_books')
        .select('public_book_id')
        .eq('user_id', user.id);

      if (linksError) {
        console.error('Error fetching user public book links:', linksError);
        setIsLoadingPublicBooks(false);
        return;
      }

      if (!userBookLinks || userBookLinks.length === 0) {
        setUserPublicBooks([]);
        setIsLoadingPublicBooks(false);
        return;
      }

      // Then fetch the actual public books
      const publicBookIds = userBookLinks.map(link => link.public_book_id);
      const { data: publicBooks, error: booksError } = await supabase
        .from('public_books')
        .select('*')
        .in('id', publicBookIds);

      if (booksError) {
        console.error('Error fetching public books:', booksError);
      } else {
        setUserPublicBooks(publicBooks || []);
      }
      setIsLoadingPublicBooks(false);
    };

    fetchUserPublicBooks();
  }, [user]);

  // Merge user books and public books into unified list
  const allBooks: LibraryBook[] = [
    // User uploaded books
    ...userBooks.map(book => ({
      id: book.id,
      title: book.title,
      author: book.author,
      cover_url: book.cover_url,
      status: book.status,
      isPublicBook: false,
    })),
    // User's added public books (always "ready" since audio is pre-generated)
    ...userPublicBooks.map(book => ({
      id: `public-${book.id}`,
      title: book.title,
      author: book.author,
      cover_url: book.cover_url,
      status: 'ready' as const,
      isPublicBook: true,
      publicBookId: book.id,
    })),
  ];

  const isLoading = isLoadingUserBooks || isLoadingPublicBooks;

  const handleBookClick = (book: LibraryBook) => {
    if (book.isPublicBook) {
      navigate(`/reader/public/${book.publicBookId}`);
    } else {
      // User uploaded books
      if (book.status === 'ready' || book.status === 'uploaded') {
        navigate(`/reader/${book.id}`);
      } else if (book.status === 'processing') {
        toast.info('This book is still processing. Please wait.');
      } else if (book.status === 'failed') {
        toast.error('Processing failed. Try re-uploading the book.');
      }
    }
  };

  const handleDeleteClick = (book: LibraryBook) => {
    setBookToDelete(book);
  };

  const handleConfirmDelete = async () => {
    if (!bookToDelete || !user) return;
    
    setIsDeleting(true);
    
    if (bookToDelete.isPublicBook && bookToDelete.publicBookId) {
      // Remove public book from user's library
      const { error } = await supabase
        .from('user_public_books')
        .delete()
        .eq('user_id', user.id)
        .eq('public_book_id', bookToDelete.publicBookId);
      
      if (error) {
        toast.error('Failed to remove book from library');
      } else {
        setUserPublicBooks(prev => prev.filter(b => b.id !== bookToDelete.publicBookId));
        toast.success('Book removed from your library');
      }
    } else {
      // Delete user uploaded book
      await deleteBook(bookToDelete.id);
    }
    
    setIsDeleting(false);
    setBookToDelete(null);
  };

  const filteredBooks = allBooks.filter(book =>
    book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (book.author?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8"
        >
          <h1 className="font-serif text-3xl md:text-4xl text-foreground">Library</h1>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search books..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 input-warm"
              />
            </div>
            <Button variant="warm" className="gap-2" onClick={() => setIsUploadModalOpen(true)}>
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline">New Book</span>
            </Button>
          </div>
        </motion.div>

        {/* Your Library Section */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-xl text-foreground">Your Library</h2>
            <Button variant="ghost" size="sm" asChild className="gap-1 text-primary">
              <Link to="/discover">
                Discover More
              </Link>
            </Button>
          </div>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : filteredBooks.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12 bg-secondary/30 rounded-2xl"
            >
              <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-serif text-lg text-foreground mb-2">
                {searchQuery ? 'No books found' : 'Your library is empty'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery 
                  ? 'Try a different search term' 
                  : 'Upload your own EPUB or browse free audiobooks'}
              </p>
              {!searchQuery && (
                <div className="flex justify-center gap-3">
                  <Button variant="warm" onClick={() => setIsUploadModalOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Upload Book
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/discover">Browse Free Books</Link>
                  </Button>
                </div>
              )}
            </motion.div>
          ) : (
            <>
              <div className="scroll-smooth-x">
                {filteredBooks.map((book, index) => (
                  <motion.div
                    key={book.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <BookCard
                      book={{
                        id: book.id,
                        title: book.title,
                        author: book.author,
                        cover_url: book.cover_url,
                        status: book.status,
                        user_id: '',
                        epub_url: '',
                        created_at: '',
                        updated_at: '',
                      }}
                      showStatus={!book.isPublicBook}
                      onClick={() => handleBookClick(book)}
                      onDelete={() => handleDeleteClick(book)}
                    />
                  </motion.div>
                ))}
                <AddBookCard onClick={() => setIsUploadModalOpen(true)} />
              </div>

              {/* Progress bar for library */}
              <div className="mt-4 flex items-center gap-4">
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ 
                      width: `${(allBooks.filter(b => b.status === 'ready').length / allBooks.length) * 100}%` 
                    }}
                  />
                </div>
                <span className="text-sm text-muted-foreground">
                  {allBooks.filter(b => b.status === 'ready').length}/{allBooks.length} ready
                </span>
              </div>
            </>
          )}
        </section>

        {/* Explore Free Classics Section */}
        {!isLoadingAllPublicBooks && allPublicBooks.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-xl text-foreground">Explore Free Classics</h2>
              <Button variant="ghost" size="sm" asChild className="gap-1 text-primary">
                <Link to="/discover">
                  View All
                </Link>
              </Button>
            </div>
            
            <div className="scroll-smooth-x">
              {(() => {
                const shuffled = [...allPublicBooks].sort(() => Math.random() - 0.5);
                return shuffled.slice(0, 5);
              })().map((book, index) => (
                  <motion.div
                    key={book.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="relative"
                  >
                    <BookCard
                      book={{
                        id: book.id,
                        title: book.title,
                        author: book.author,
                        cover_url: book.cover_url,
                        status: 'ready' as const,
                        user_id: '',
                        epub_url: book.epub_url,
                        created_at: book.created_at,
                        updated_at: book.created_at,
                      }}
                      showStatus={false}
                      onClick={() => navigate(`/reader/public/${book.id}`)}
                    />
                    {isInLibrary(book.id) && (
                      <div className="absolute top-2 left-2 bg-primary/90 text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                        In Library
                      </div>
                    )}
                  </motion.div>
                ))}
            </div>
          </section>
        )}
      </main>

      {/* Upload Modal */}
      <UploadBookModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={uploadBook}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteBookDialog
        isOpen={!!bookToDelete}
        onClose={() => setBookToDelete(null)}
        onConfirm={handleConfirmDelete}
        bookTitle={bookToDelete?.title || ''}
        isDeleting={isDeleting}
      />
    </div>
  );
}
