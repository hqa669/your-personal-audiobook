import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { List, Check } from 'lucide-react';
import { Chapter } from '@/lib/epub-chapter-parser';
import { cn } from '@/lib/utils';

interface ChapterListSheetProps {
  chapters: Chapter[];
  currentIndex: number;
  onSelectChapter: (index: number) => void;
  isDarkMode: boolean;
}

export function ChapterListSheet({ 
  chapters, 
  currentIndex, 
  onSelectChapter,
  isDarkMode 
}: ChapterListSheetProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="w-10 h-10">
          <List className="w-4 h-4" />
        </Button>
      </SheetTrigger>
      <SheetContent 
        side="left" 
        className={cn(
          "w-80",
          isDarkMode ? "bg-slate-900 border-slate-800" : "bg-background"
        )}
      >
        <SheetHeader>
          <SheetTitle className={isDarkMode ? "text-slate-100" : ""}>
            Chapters
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-8rem)] mt-4">
          <div className="space-y-1 pr-4">
            {chapters.map((chapter, index) => (
              <button
                key={chapter.id}
                onClick={() => onSelectChapter(index)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-md transition-colors",
                  "flex items-center gap-2 text-sm",
                  index === currentIndex
                    ? isDarkMode 
                      ? "bg-slate-800 text-primary" 
                      : "bg-accent text-primary"
                    : isDarkMode
                      ? "text-slate-300 hover:bg-slate-800"
                      : "text-foreground/80 hover:bg-accent/50"
                )}
              >
                {index === currentIndex && (
                  <Check className="w-4 h-4 flex-shrink-0" />
                )}
                <span className={cn(
                  "truncate",
                  index !== currentIndex && "ml-6"
                )}>
                  {chapter.title}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
