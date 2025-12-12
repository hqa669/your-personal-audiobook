import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, ArrowLeft } from 'lucide-react';
import { Header } from '@/components/Header';
import { BookDetailModal } from '@/components/BookDetailModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { freeBooks, genres, Book } from '@/data/books';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function Discover() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const booksPerPage = 6;

  const filteredBooks = freeBooks.filter(book => {
    const matchesSearch = book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.author.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGenre = selectedGenre === 'All' || book.genre === selectedGenre;
    return matchesSearch && matchesGenre;
  });

  const totalPages = Math.ceil(filteredBooks.length / booksPerPage);
  const paginatedBooks = filteredBooks.slice(
    (currentPage - 1) * booksPerPage,
    currentPage * booksPerPage
  );

  const handleAddToLibrary = (book: Book) => {
    toast.success(`"${book.title}" added to your library!`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header isLoggedIn onLogout={() => navigate('/')} />

      <main className="container max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-6 mb-8"
        >
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/library')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="font-serif text-3xl md:text-4xl text-foreground">Free Classics</h1>
          </div>

          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4">
            {/* Genre filter */}
            <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
              {genres.slice(0, 6).map(genre => (
                <Button
                  key={genre}
                  variant={selectedGenre === genre ? 'warm' : 'parchment'}
                  size="sm"
                  onClick={() => {
                    setSelectedGenre(genre);
                    setCurrentPage(1);
                  }}
                  className="flex-shrink-0"
                >
                  {genre}
                </Button>
              ))}
            </div>

            {/* Search */}
            <div className="relative flex-1 md:max-w-xs md:ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search books..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10 input-warm"
              />
            </div>
          </div>
        </motion.div>

        {/* Books Grid */}
        <div className="space-y-6">
          {paginatedBooks.map((book, index) => (
            <motion.div
              key={book.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex gap-4 p-4 bg-card rounded-2xl border border-border/50 hover:shadow-card transition-shadow cursor-pointer"
              onClick={() => setSelectedBook(book)}
            >
              {/* Cover */}
              <div className={cn(
                "w-20 md:w-24 aspect-[2/3] rounded-xl flex-shrink-0 flex items-center justify-center",
                book.coverColor
              )}>
                <span className="font-serif text-xs text-center px-2 text-foreground/80">
                  {book.title}
                </span>
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <h3 className="font-serif text-lg text-foreground mb-1 truncate">{book.title}</h3>
                <p className="text-sm text-muted-foreground mb-2">{book.author}</p>
                <span className="inline-block px-2 py-0.5 bg-secondary text-secondary-foreground rounded-full text-xs mb-2">
                  {book.genre}
                </span>
                <p className="text-sm text-muted-foreground line-clamp-2 hidden md:block">
                  {book.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <Button
                key={page}
                variant={currentPage === page ? 'warm' : 'ghost'}
                size="sm"
                onClick={() => setCurrentPage(page)}
                className="w-10 h-10"
              >
                {page}
              </Button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {filteredBooks.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No books found matching your criteria.</p>
          </div>
        )}
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
