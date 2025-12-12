import { motion } from 'framer-motion';
import { Play, Loader2, Plus } from 'lucide-react';
import { Book } from '@/data/books';
import { cn } from '@/lib/utils';

interface BookCardProps {
  book: Book;
  onClick?: () => void;
  showStatus?: boolean;
  className?: string;
}

export function BookCard({ book, onClick, showStatus = false, className }: BookCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "book-card cursor-pointer flex-shrink-0 w-40 md:w-48 group",
        className
      )}
      onClick={onClick}
    >
      <div className={cn(
        "aspect-[2/3] rounded-xl flex items-center justify-center relative overflow-hidden",
        book.coverColor
      )}>
        {/* Book title overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
          <h3 className="font-serif text-sm md:text-base font-medium text-foreground/90 leading-tight">
            {book.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">{book.author}</p>
        </div>

        {/* Status indicator */}
        {showStatus && book.status && (
          <div className="absolute top-2 right-2">
            {book.status === 'ready' && (
              <div className="bg-success text-success-foreground p-1.5 rounded-full">
                <Play className="w-3 h-3" />
              </div>
            )}
            {book.status === 'processing' && (
              <div className="bg-amber text-foreground p-1.5 rounded-full">
                <Loader2 className="w-3 h-3 animate-spin" />
              </div>
            )}
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors duration-300 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {showStatus ? (
              <Play className="w-8 h-8 text-foreground/80" />
            ) : (
              <Plus className="w-8 h-8 text-foreground/80" />
            )}
          </div>
        </div>

        {/* Progress bar for user library */}
        {showStatus && book.progress !== undefined && book.progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-foreground/10">
            <div 
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${book.progress}%` }}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function AddBookCard({ onClick }: { onClick?: () => void }) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      className="cursor-pointer flex-shrink-0 w-40 md:w-48"
      onClick={onClick}
    >
      <div className="aspect-[2/3] rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors duration-300 flex flex-col items-center justify-center gap-2 bg-card/50">
        <Plus className="w-8 h-8 text-muted-foreground" />
        <span className="text-sm text-muted-foreground font-medium">Add Book</span>
      </div>
    </motion.div>
  );
}
