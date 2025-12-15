import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Loader2, Plus, AlertCircle, Trash2, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserBook } from '@/hooks/useBooks';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Color palette for books without covers
const coverColors = [
  'bg-gradient-to-br from-amber-100 to-amber-200',
  'bg-gradient-to-br from-rose-100 to-rose-200',
  'bg-gradient-to-br from-blue-100 to-blue-200',
  'bg-gradient-to-br from-green-100 to-green-200',
  'bg-gradient-to-br from-purple-100 to-purple-200',
  'bg-gradient-to-br from-orange-100 to-orange-200',
];

function getColorForBook(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return coverColors[Math.abs(hash) % coverColors.length];
}

interface BookCardProps {
  book: UserBook;
  onClick?: () => void;
  onDelete?: () => void;
  showStatus?: boolean;
  className?: string;
}

export function BookCard({ book, onClick, onDelete, showStatus = false, className }: BookCardProps) {
  const coverColor = getColorForBook(book.title);
  const [menuOpen, setMenuOpen] = useState(false);
  
  const handleCardClick = (e: React.MouseEvent) => {
    // Safety guard: don't navigate if clicking on menu
    if ((e.target as HTMLElement).closest('.menu-button')) return;
    if (menuOpen) return;
    onClick?.();
  };

  
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "book-card cursor-pointer flex-shrink-0 w-40 md:w-48 group relative",
        className
      )}
      onClick={handleCardClick}
    >
      <div className={cn(
        "aspect-[2/3] rounded-xl flex items-center justify-center relative overflow-hidden",
        !book.cover_url && coverColor
      )}>
        {/* Cover image or fallback */}
        {book.cover_url ? (
          <img
            src={book.cover_url}
            alt={book.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
            <h3 className="font-serif text-sm md:text-base font-medium text-foreground/90 leading-tight">
              {book.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">{book.author}</p>
          </div>
        )}

        {/* Status indicator and menu */}
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {showStatus && book.status && (
            <>
              {(book.status === 'ready' || book.status === 'uploaded') && (
                <div className="bg-success text-success-foreground p-1.5 rounded-full shadow-sm">
                  <Play className="w-3 h-3" />
                </div>
              )}
              {book.status === 'processing' && (
                <div className="bg-amber-500 text-white p-1.5 rounded-full shadow-sm">
                  <Loader2 className="w-3 h-3 animate-spin" />
                </div>
              )}
              {book.status === 'failed' && (
                <div className="bg-destructive text-destructive-foreground p-1.5 rounded-full shadow-sm">
                  <AlertCircle className="w-3 h-3" />
                </div>
              )}
            </>
          )}
          
          {/* More menu */}
          {onDelete && (
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="menu-button bg-background/80 backdrop-blur-sm p-1.5 rounded-full shadow-sm hover:bg-background opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <MoreVertical className="w-3 h-3 text-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-50">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete?.();
                    setMenuOpen(false);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Book
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors duration-300 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {showStatus && (book.status === 'ready' || book.status === 'uploaded') ? (
              <Play className="w-8 h-8 text-white drop-shadow-lg" />
            ) : !showStatus ? (
              <Plus className="w-8 h-8 text-foreground/80" />
            ) : null}
          </div>
        </div>

        {/* Title overlay for cover images */}
        {book.cover_url && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <h3 className="font-serif text-sm font-medium text-white leading-tight truncate">
              {book.title}
            </h3>
            <p className="text-xs text-white/80 truncate">{book.author}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Legacy BookCard for mock data (free books)
interface LegacyBook {
  id: string;
  title: string;
  author: string;
  coverColor?: string;
  genre?: string;
  status?: 'ready' | 'processing' | 'new';
  progress?: number;
  description?: string;
}

interface LegacyBookCardProps {
  book: LegacyBook;
  onClick?: () => void;
  showStatus?: boolean;
  className?: string;
}

export function LegacyBookCard({ book, onClick, showStatus = false, className }: LegacyBookCardProps) {
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
        book.coverColor || getColorForBook(book.title)
      )}>
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
          <h3 className="font-serif text-sm md:text-base font-medium text-foreground/90 leading-tight">
            {book.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">{book.author}</p>
        </div>

        {showStatus && book.status && (
          <div className="absolute top-2 right-2">
            {book.status === 'ready' && (
              <div className="bg-success text-success-foreground p-1.5 rounded-full">
                <Play className="w-3 h-3" />
              </div>
            )}
            {book.status === 'processing' && (
              <div className="bg-amber-500 text-white p-1.5 rounded-full">
                <Loader2 className="w-3 h-3 animate-spin" />
              </div>
            )}
          </div>
        )}

        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors duration-300 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <Plus className="w-8 h-8 text-foreground/80" />
          </div>
        </div>
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
