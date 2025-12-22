import { motion } from "framer-motion";
import { Book, Headphones, Search, Library as LibraryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  variant: "library" | "search" | "discover" | "audio";
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const variants = {
  library: {
    icon: Book,
    defaultTitle: "Your library is empty",
    defaultDescription: "Explore timeless classics and add your first audiobook to start listening.",
  },
  search: {
    icon: Search,
    defaultTitle: "No books found",
    defaultDescription: "Try adjusting your search or filters to find what you're looking for.",
  },
  discover: {
    icon: LibraryIcon,
    defaultTitle: "No classics available",
    defaultDescription: "Check back soon for free public domain audiobooks.",
  },
  audio: {
    icon: Headphones,
    defaultTitle: "No audio yet",
    defaultDescription: "Generate AI voice to start listening to this book.",
  },
};

export const EmptyState = ({
  variant,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) => {
  const config = variants[variant];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col items-center justify-center py-16 px-4 text-center"
    >
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="w-20 h-20 rounded-full bg-accent/50 flex items-center justify-center mb-6"
      >
        <Icon className="w-10 h-10 text-primary/60" />
      </motion.div>

      <h3 className="font-serif text-xl text-foreground mb-2">
        {title || config.defaultTitle}
      </h3>
      
      <p className="text-muted-foreground text-sm max-w-[280px] mb-6">
        {description || config.defaultDescription}
      </p>

      {actionLabel && onAction && (
        <Button onClick={onAction} variant="warm">
          {actionLabel}
        </Button>
      )}
    </motion.div>
  );
};
