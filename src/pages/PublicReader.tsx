import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, 
  Play, 
  Pause, 
  ChevronLeft,
  ChevronRight,
  Sun, 
  Moon, 
  Type,
  Volume2,
  Loader2,
  MoreVertical,
  BookMinus,
  List
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { usePublicBookReader } from '@/hooks/usePublicBookReader';
import { usePublicBookAudio } from '@/hooks/usePublicBookAudio';
import { usePublicBooks } from '@/hooks/usePublicBooks';
import { usePaginatedReader } from '@/hooks/usePaginatedReader';
import { ChapterListSheet } from '@/components/ChapterListSheet';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function PublicReader() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [showControls, setShowControls] = useState(true);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [pageDirection, setPageDirection] = useState<'next' | 'prev'>('next');

  const { removeFromLibrary, isInLibrary } = usePublicBooks();
  
  // Measure container height for dynamic pagination
  const contentContainerRef = useRef<HTMLDivElement>(null);
  const paragraphRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [containerHeight, setContainerHeight] = useState(400);
  const [avgParagraphHeight, setAvgParagraphHeight] = useState(150);

  // Measure container on mount and resize
  useEffect(() => {
    const measureContainer = () => {
      // Available height = viewport - header (64px) - footer controls (100px) - chapter title (60px) - padding (24px)
      const availableHeight = window.innerHeight - 64 - 100 - 60 - 24;
      setContainerHeight(Math.max(200, availableHeight));
    };
    
    measureContainer();
    window.addEventListener('resize', measureContainer);
    return () => window.removeEventListener('resize', measureContainer);
  }, []);

  const {
    book,
    parsedBook,
    currentChapter,
    chapterIndex,
    totalChapters,
    isLoading,
    error,
    goToChapter,
    nextChapter,
    prevChapter,
    hasNext: hasNextChapter,
    hasPrev: hasPrevChapter,
    currentChapterAudio,
  } = usePublicBookReader(id);

  // Pagination for the current chapter
  const {
    pageParagraphs,
    currentParagraphIndex,
    currentParagraphOnPage,
    currentPageIndex,
    pageCount,
    paragraphsPerPage,
    goToNextPage,
    goToPrevPage,
    goToParagraph,
    selectParagraph,
    hasNextPage,
    hasPrevPage,
  } = usePaginatedReader({
    content: currentChapter?.content || '',
    initialParagraphIndex: 0,
    containerHeight,
    paragraphHeight: avgParagraphHeight,
  });

  // Current page's absolute start index (matches pagination model inside usePaginatedReader)
  const pageStartIndex = currentPageIndex * Math.max(1, paragraphsPerPage - 1);

  const {
    isPlaying,
    isLoading: isAudioLoading,
    currentTime,
    duration,
    playbackRate,
    currentParagraphIndex: audioParagraphIndex,
    hasAudio,
    hasSyncData,
    togglePlay,
    seekTo,
    seekToParagraph,
    changePlaybackRate,
  } = usePublicBookAudio({
    audioUrl: currentChapterAudio?.audio_url || null,
    syncUrl: currentChapterAudio?.sync_url || null,
    chapterIndex,
    onChapterEnd: useCallback(() => {
      if (hasNextChapter) {
        nextChapter();
      }
    }, [hasNextChapter, nextChapter]),
  });

  // Sync audio paragraph with paginated view
  useEffect(() => {
    if (hasSyncData && isPlaying && typeof audioParagraphIndex === 'number') {
      goToParagraph(audioParagraphIndex);
    }
  }, [audioParagraphIndex, hasSyncData, isPlaying, goToParagraph]);

  const speeds = [0.75, 1, 1.25, 1.5, 2];

  // Calculate audio progress percentage
  const audioProgress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Check if book is in library
  const bookInLibrary = id ? isInLibrary(id) : false;

  const handleRemoveFromLibrary = async () => {
    if (!id) return;
    setIsRemoving(true);
    const success = await removeFromLibrary(id);
    setIsRemoving(false);
    if (success) {
      toast.success('Book removed from your library');
      navigate('/library');
    }
    setShowRemoveDialog(false);
  };

  // Handle page navigation with direction tracking
  const handleNextPage = () => {
    if (hasNextPage) {
      setPageDirection('next');
      goToNextPage();
    } else if (hasNextChapter) {
      setPageDirection('next');
      nextChapter();
    }
  };

  const handlePrevPage = () => {
    if (hasPrevPage) {
      setPageDirection('prev');
      goToPrevPage();
    } else if (hasPrevChapter) {
      setPageDirection('prev');
      prevChapter();
    }
  };

  // Handle paragraph click - detect cut-off and advance if needed
  // Only the FIRST paragraph that is >25% cut off is eligible to trigger page advance
  const handleParagraphClick = (pageRelativeIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const containerEl = contentContainerRef.current;
    if (!containerEl) return;
    
    const containerRect = containerEl.getBoundingClientRect();
    
    // Find the first eligible cut-off paragraph on this page
    let firstEligibleIndex: number | null = null;
    
    for (let i = 0; i < pageParagraphs.length; i++) {
      const el = paragraphRefs.current[i];
      if (!el) continue;
      
      const elRect = el.getBoundingClientRect();
      const cutOffPx = elRect.bottom - containerRect.bottom;
      const cutOffRatio = elRect.height > 0 ? cutOffPx / elRect.height : 0;
      const intersectsBottom = elRect.top < containerRect.bottom && elRect.bottom > containerRect.bottom;
      
      // Dev-only logging
      if (import.meta.env.DEV && intersectsBottom) {
        console.log(`[CutOff] Paragraph ${i}: cutOffRatio=${cutOffRatio.toFixed(3)}, cutOffPx=${cutOffPx.toFixed(1)}, height=${elRect.height.toFixed(1)}`);
      }
      
      if (intersectsBottom && cutOffRatio > 0.25) {
        firstEligibleIndex = i;
        break; // First one found
      }
    }
    
    // Only advance if user clicked the first eligible cut-off paragraph
    if (firstEligibleIndex !== null && pageRelativeIndex === firstEligibleIndex) {
      const absoluteIndex = pageStartIndex + pageRelativeIndex;
      
      if (import.meta.env.DEV) {
        console.log(`[CutOff] Advancing to paragraph ${absoluteIndex}`);
      }
      
      setPageDirection('next');
      goToParagraph(absoluteIndex);
      
      // Also seek audio if available
      if (hasSyncData && hasAudio) {
        seekToParagraph(absoluteIndex);
      }
      return;
    }
    
    // Normal selection behavior
    selectParagraph(pageRelativeIndex);

    // If audio has sync data, seek to this paragraph
    if (hasSyncData && hasAudio) {
      const absoluteIndex = pageStartIndex + pageRelativeIndex;
      seekToParagraph(absoluteIndex);
    }
  };

  // Page transition variants
  const pageVariants = {
    enter: (direction: 'next' | 'prev') => ({
      x: direction === 'next' ? 40 : -40,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: 'next' | 'prev') => ({
      x: direction === 'next' ? -40 : 40,
      opacity: 0,
    }),
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading your book...</p>
        </div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-destructive">{error || 'Book not found'}</p>
          <Button onClick={() => navigate('/library')}>
            Back to Library
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-300",
      isDarkMode ? "dark bg-slate-900 text-slate-100" : "bg-background text-foreground"
    )}>
      {/* Header */}
      <AnimatePresence>
        {showControls && (
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className={cn(
              "fixed top-0 left-0 right-0 z-40 backdrop-blur-md border-b",
              isDarkMode ? "bg-slate-900/80 border-slate-800" : "bg-background/80 border-border"
            )}
          >
            <div className="container max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => navigate('/library')}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="text-center flex-1 mx-4">
                <h1 className="font-serif text-sm font-medium truncate">{book.title}</h1>
                <p className="text-xs text-muted-foreground truncate">
                  {currentChapter?.title || `Chapter ${chapterIndex + 1}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsDarkMode(!isDarkMode)}
                >
                  {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </Button>
                {bookInLibrary && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="w-5 h-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-50 bg-background">
                      <DropdownMenuItem
                        onClick={() => setShowRemoveDialog(true)}
                        className="text-destructive focus:text-destructive"
                      >
                        <BookMinus className="w-4 h-4 mr-2" />
                        Remove from Library
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Main paginated content */}
      <main 
        className="container max-w-2xl mx-auto px-6 pt-20 pb-40 cursor-pointer min-h-screen"
        onClick={() => setShowControls(!showControls)}
      >
        {currentChapter ? (
          <article 
            className="prose prose-lg max-w-none"
            style={{ fontSize: `${fontSize}px`, lineHeight: 1.7 }}
          >
            {/* Chapter title */}
            <motion.h2
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={cn(
                "font-serif text-2xl mb-8 text-center",
                isDarkMode ? "text-slate-100" : "text-foreground"
              )}
            >
              {currentChapter.title}
            </motion.h2>
            
            {/* Paginated paragraphs */}
            <AnimatePresence mode="wait" custom={pageDirection}>
              <motion.div
                key={`page-${currentPageIndex}`}
                custom={pageDirection}
                variants={pageVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                ref={contentContainerRef}
                className="page-container"
                style={{ height: containerHeight, overflow: 'hidden' }}
              >
                {pageParagraphs.map((paragraph, index) => {
                  const isCurrentParagraph = currentParagraphOnPage === index;
                  const isAudioSynced = hasSyncData && isPlaying;
                  const isLastVisible = index === pageParagraphs.length - 1;
                  
                  return (
                    <motion.div
                      key={`${currentPageIndex}-${index}`}
                      ref={(el) => { paragraphRefs.current[index] = el; }}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ 
                        opacity: 1,
                        y: 0,
                      }}
                      transition={{ 
                        delay: index * 0.08,
                        duration: 0.3,
                        ease: [0.4, 0, 0.2, 1]
                      }}
                      onClick={(e) => handleParagraphClick(index, e)}
                      className={cn(
                        "reading-paragraph mb-4",
                        isDarkMode ? "text-slate-200" : "text-foreground/90",
                        isCurrentParagraph && "current",
                        isCurrentParagraph && isAudioSynced && "playing",
                        isLastVisible && "last-cutoff"
                      )}
                      role="button"
                      tabIndex={0}
                      aria-label={`Paragraph ${pageStartIndex + index + 1}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleParagraphClick(index, e as any);
                        }
                      }}
                    >
                      <p className={cn(
                        isCurrentParagraph && "paragraph-scrollable"
                      )}>
                        {paragraph}
                      </p>
                    </motion.div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </article>
        ) : (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}
      </main>

      {/* Bottom controls */}
      <AnimatePresence>
        {showControls && (
          <motion.footer
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className={cn(
              "fixed bottom-0 left-0 right-0 z-40 backdrop-blur-md border-t pb-safe",
              isDarkMode ? "bg-slate-900/90 border-slate-800" : "bg-background/90 border-border"
            )}
          >
            <div className="container max-w-2xl mx-auto px-4 py-4 space-y-4">
              {/* Audio progress slider (if audio exists) */}
              {hasAudio && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-12 text-right">
                    {formatTime(currentTime)}
                  </span>
                  <Slider
                    value={[audioProgress]}
                    onValueChange={(value) => {
                      const newTime = (value[0] / 100) * duration;
                      seekTo(newTime);
                    }}
                    max={100}
                    step={0.1}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground w-12">
                    {formatTime(duration)}
                  </span>
                </div>
              )}

              {/* Page & Audio controls */}
              <div className="flex items-center justify-between">
                {/* Left - Chapter list & Font */}
                <div className="flex items-center gap-2">
                  {parsedBook && (
                    <ChapterListSheet
                      chapters={parsedBook.chapters}
                      currentIndex={chapterIndex}
                      onSelectChapter={goToChapter}
                      isDarkMode={isDarkMode}
                    />
                  )}
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-10 h-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFontSize(prev => {
                        const newSize = prev >= 28 ? 14 : prev + 2;
                        return newSize;
                      });
                    }}
                  >
                    <Type className="w-4 h-4" />
                  </Button>
                </div>

                {/* Center - Page navigation & Play */}
                <div className="flex items-center gap-3">
                  {/* Previous Page */}
                  <button 
                    className="page-nav-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePrevPage();
                    }}
                    disabled={!hasPrevPage && !hasPrevChapter}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  
                  {/* Play/Pause button */}
                  {hasAudio ? (
                    <Button
                      variant="warm"
                      size="icon"
                      className="w-14 h-14 rounded-full shadow-lg"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePlay();
                      }}
                      disabled={isAudioLoading}
                      title={isPlaying ? "Pause" : "Play"}
                    >
                      {isAudioLoading ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : isPlaying ? (
                        <Pause className="w-6 h-6" />
                      ) : (
                        <Play className="w-6 h-6 ml-0.5" />
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="warm"
                      size="icon"
                      className="w-14 h-14 rounded-full opacity-50"
                      disabled
                      title="No audio available for this chapter"
                    >
                      <Play className="w-6 h-6 ml-0.5" />
                    </Button>
                  )}
                  
                  {/* Next Page */}
                  <button 
                    className="page-nav-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNextPage();
                    }}
                    disabled={!hasNextPage && !hasNextChapter}
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                {/* Right - Speed & Volume */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("text-xs px-2", !hasAudio && "opacity-50")}
                    disabled={!hasAudio}
                    onClick={(e) => {
                      e.stopPropagation();
                      const currentIdx = speeds.indexOf(playbackRate);
                      const nextIdx = (currentIdx + 1) % speeds.length;
                      changePlaybackRate(speeds[nextIdx]);
                    }}
                  >
                    {playbackRate}x
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={cn("w-10 h-10", !hasAudio && "opacity-50")}
                    disabled={!hasAudio}
                  >
                    <Volume2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>

      {/* Remove from Library Confirmation Dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{book?.title}" from library?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the book from your personal library. You can always add it back later from the Discover page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleRemoveFromLibrary();
              }}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove from Library'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
