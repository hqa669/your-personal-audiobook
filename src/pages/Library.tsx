import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Plus, ChevronRight, Loader2, BookOpen } from 'lucide-react';
import { Header } from '@/components/Header';
import { BookCard, LegacyBookCard, AddBookCard } from '@/components/BookCard';
import { BookDetailModal } from '@/components/BookDetailModal';
import { UploadBookModal } from '@/components/UploadBookModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { freeBooks, Book } from '@/data/books';
import { useBooks } from '@/hooks/useBooks';
import { toast } from 'sonner';

export default function Library() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  
  const { books, isLoading, isUploading, uploadProgress, uploadBook } = useBooks();

  const handleBookClick = (bookId: string, status: string) => {
    // 'uploaded' and 'ready' are both readable (Phase 5 AI voice deferred)
    if (status === 'ready' || status === 'uploaded') {
      navigate(`/reader/${bookId}`);
    } else if (status === 'processing') {
      toast.info('This book is still processing. Please wait.');
    } else if (status === 'failed') {
      toast.error('Processing failed. Try re-uploading the book.');
    }
  };

  const handleFreeBookClick = (book: Book) => {
    setSelectedBook(book);
  };

  const handleAddToLibrary = (book: Book) => {
    toast.success(`"${book.title}" added to your library!`);
    setSelectedBook(null);
  };

  const filteredBooks = books.filter(book =>
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
          <h2 className="font-serif text-xl text-foreground mb-4">Your Library</h2>
          
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
                  : 'Upload your first EPUB to get started'}
              </p>
              {!searchQuery && (
                <Button variant="warm" onClick={() => setIsUploadModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Book
                </Button>
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
                      book={book}
                      showStatus
                      onClick={() => handleBookClick(book.id, book.status)}
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
                      width: `${(books.filter(b => b.status === 'ready').length / books.length) * 100}%` 
                    }}
                  />
                </div>
                <span className="text-sm text-muted-foreground">
                  {books.filter(b => b.status === 'ready').length}/{books.length} ready
                </span>
              </div>
            </>
          )}
        </section>

        {/* Explore Free Books Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-xl text-foreground">Explore Free Books</h2>
            <Button variant="ghost" size="sm" asChild className="gap-1 text-primary">
              <Link to="/discover">
                More <ChevronRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
          <div className="scroll-smooth-x">
            {freeBooks.slice(0, 5).map((book, index) => (
              <motion.div
                key={book.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
              >
                <LegacyBookCard
                  book={book}
                  onClick={() => handleFreeBookClick(book)}
                />
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      {/* Upload Modal */}
      <UploadBookModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={uploadBook}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
      />

      {/* Book Detail Modal */}
      <BookDetailModal
        book={selectedBook}
        isOpen={!!selectedBook}
        onClose={() => setSelectedBook(null)}
        onAddToLibrary={handleAddToLibrary}
      />
    </div>
  );
}
