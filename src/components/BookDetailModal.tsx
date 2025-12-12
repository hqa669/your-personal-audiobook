import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Book } from '@/data/books';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BookDetailModalProps {
  book: Book | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToLibrary: (book: Book) => void;
}

export function BookDetailModal({ book, isOpen, onClose, onAddToLibrary }: BookDetailModalProps) {
  if (!book) return null;

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
                <div className={cn(
                  "w-32 aspect-[2/3] rounded-xl flex items-center justify-center shadow-card",
                  book.coverColor
                )}>
                  <div className="text-center p-3">
                    <h3 className="font-serif text-sm font-medium text-foreground/90 leading-tight">
                      {book.title}
                    </h3>
                  </div>
                </div>
              </div>

              {/* Book details */}
              <div className="text-center space-y-2 mb-6">
                <h2 className="font-serif text-2xl text-foreground">{book.title}</h2>
                <p className="text-muted-foreground">by {book.author}</p>
                <span className="inline-block px-3 py-1 bg-secondary text-secondary-foreground rounded-full text-sm">
                  {book.genre}
                </span>
              </div>

              <p className="text-muted-foreground text-center leading-relaxed mb-8">
                {book.description}
              </p>

              {/* Actions */}
              <div className="flex gap-3">
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
                <Button
                  variant="outline"
                  size="lg"
                  onClick={onClose}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
