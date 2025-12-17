import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Generic book interface that works with both user books and public books
export interface BookModalData {
  id: string;
  title: string;
  author?: string | null;
  genre?: string | null;
  description?: string | null;
  cover_url?: string | null;
  coverColor?: string;
  is_featured?: boolean | null;
}

interface BookDetailModalProps {
  book: BookModalData | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToLibrary?: (book: BookModalData) => void;
  isInLibrary?: boolean;
  showAddButton?: boolean;
}

// Generate a gradient color based on book title for books without covers
const getBookGradient = (title: string) => {
  const colors = [
    'bg-gradient-to-br from-rose-100 to-rose-200',
    'bg-gradient-to-br from-amber-100 to-yellow-200',
    'bg-gradient-to-br from-slate-200 to-slate-300',
    'bg-gradient-to-br from-purple-100 to-purple-200',
    'bg-gradient-to-br from-blue-100 to-cyan-200',
    'bg-gradient-to-br from-green-100 to-emerald-200',
    'bg-gradient-to-br from-red-100 to-red-200',
    'bg-gradient-to-br from-violet-100 to-violet-200',
  ];
  const hash = title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
};

export function BookDetailModal({ 
  book, 
  isOpen, 
  onClose, 
  onAddToLibrary, 
  isInLibrary = false,
  showAddButton = true 
}: BookDetailModalProps) {
  if (!book) return null;

  const coverClass = book.coverColor || getBookGradient(book.title);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 z-50 max-w-md mx-auto"
          >
            <div className="bg-card rounded-t-3xl md:rounded-3xl p-6 shadow-card border border-border/50">
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-accent transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>

              {/* Book cover */}
              <div className="flex justify-center mb-6">
                {book.cover_url ? (
                  <div className="w-32 aspect-[2/3] rounded-xl overflow-hidden shadow-card">
                    <img
                      src={book.cover_url}
                      alt={book.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className={cn(
                    "w-32 aspect-[2/3] rounded-xl flex items-center justify-center shadow-card",
                    coverClass
                  )}>
                    <div className="text-center p-3">
                      <h3 className="font-serif text-sm font-medium text-foreground/90 leading-tight">
                        {book.title}
                      </h3>
                    </div>
                  </div>
                )}
              </div>

              {/* Book details */}
              <div className="text-center space-y-2 mb-6">
                <h2 className="font-serif text-2xl text-foreground">{book.title}</h2>
                <p className="text-muted-foreground">by {book.author || 'Unknown Author'}</p>
                <div className="flex justify-center gap-2 flex-wrap">
                  {book.genre && (
                    <span className="inline-block px-3 py-1 bg-secondary text-secondary-foreground rounded-full text-sm">
                      {book.genre}
                    </span>
                  )}
                  {book.is_featured && (
                    <span className="inline-block px-3 py-1 bg-primary text-primary-foreground rounded-full text-sm">
                      Featured
                    </span>
                  )}
                </div>
              </div>

              {book.description && (
                <p className="text-muted-foreground text-center leading-relaxed mb-8">
                  {book.description}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                {showAddButton && onAddToLibrary ? (
                  isInLibrary ? (
                    <Button
                      variant="outline"
                      size="lg"
                      className="flex-1"
                      disabled
                    >
                      <Check className="w-4 h-4 mr-2" />
                      In Your Library
                    </Button>
                  ) : (
                    <Button
                      variant="warm"
                      size="lg"
                      className="flex-1"
                      onClick={() => {
                        onAddToLibrary(book);
                        onClose();
                      }}
                    >
                      + Add to Library
                    </Button>
                  )
                ) : (
                  <Button
                    variant="warm"
                    size="lg"
                    className="flex-1"
                    onClick={onClose}
                  >
                    Close
                  </Button>
                )}
                {showAddButton && onAddToLibrary && (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={onClose}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
