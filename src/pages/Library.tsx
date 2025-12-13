import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Plus, ChevronRight } from 'lucide-react';
import { Header } from '@/components/Header';
import { BookCard, AddBookCard } from '@/components/BookCard';
import { BookDetailModal } from '@/components/BookDetailModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { userLibrary, freeBooks, Book } from '@/data/books';
import { toast } from 'sonner';

export default function Library() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [myBooks, setMyBooks] = useState(userLibrary);

  const handleAddToLibrary = (book: Book) => {
    const newBook = { ...book, status: 'processing' as const, progress: 0 };
    setMyBooks(prev => [...prev, newBook]);
    toast.success(`"${book.title}" added to your library!`);
  };

  const handleUploadBook = () => {
    toast.info('EPUB upload coming soon!');
  };

  const handleBookClick = (book: Book, isUserBook: boolean) => {
    if (isUserBook && book.status === 'ready') {
      navigate(`/reader/${book.id}`);
    } else if (isUserBook) {
      toast.info('This book is still processing. Please wait.');
    } else {
      setSelectedBook(book);
    }
  };

  const filteredBooks = myBooks.filter(book =>
    book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    book.author.toLowerCase().includes(searchQuery.toLowerCase())
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
            <Button variant="warm" className="gap-2" onClick={handleUploadBook}>
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline">New Book</span>
            </Button>
          </div>
        </motion.div>

        {/* Your Library Section */}
        <section className="mb-12">
          <h2 className="font-serif text-xl text-foreground mb-4">Your Library</h2>
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
                  onClick={() => handleBookClick(book, true)}
                />
              </motion.div>
            ))}
            <AddBookCard onClick={handleUploadBook} />
          </div>

          {/* Progress bar for library */}
          {myBooks.length > 0 && (
            <div className="mt-4 flex items-center gap-4">
              <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${(myBooks.filter(b => b.status === 'ready').length / myBooks.length) * 100}%` }}
                />
              </div>
              <span className="text-sm text-muted-foreground">
                {myBooks.filter(b => b.status === 'ready').length}/{myBooks.length} ready
              </span>
            </div>
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
                <BookCard
                  book={book}
                  onClick={() => handleBookClick(book, false)}
                />
              </motion.div>
            ))}
          </div>
        </section>
      </main>

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
