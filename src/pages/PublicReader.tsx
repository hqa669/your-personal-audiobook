import { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
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
import { useDynamicPaginatedReader } from '@/hooks/useDynamicPaginatedReader';
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
  const [suppressAutoSelection, setSuppressAutoSelection] = useState(false);
  const [autoPlayNextChapter, setAutoPlayNextChapter] = useState(false);
  const [isTimeScrubSelection, setIsTimeScrubSelection] = useState(false);
  const [isPageNavSelection, setIsPageNavSelection] = useState(false);

  const { removeFromLibrary, isInLibrary } = usePublicBooks();
  
  // Measure container height for dynamic pagination
  const contentContainerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(400);

  // Cut-off detection: first paragraph visually cut off at the bottom (page-relative)
  // NOTE: In Kindle-style reading, cut-off paragraphs are intentional and expected
  const [firstCutOffIndex, setFirstCutOffIndex] = useState<number | null>(null);

  // Gate layout reads until page transition animations settle (prevents measure/cutoff thrash)
  const [pageLayoutStable, setPageLayoutStable] = useState(false);

  // Track whether measurements have been taken this page cycle (cut-off waits for this)
  const measurementsDoneRef = useRef(false);
  const [paragraphOverflow, setParagraphOverflow] = useState<boolean[]>([]);
  const pendingPageSeekRef = useRef(false);

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

  // Dynamic pagination for the current chapter
  const {
    paragraphs,
    pageParagraphs,
    currentParagraphIndex,
    currentParagraphOnPage,
    currentPageIndex,
    pageCount,
    goToNextPage,
    goToPrevPage,
    goToParagraph,
    selectParagraph,
    hasNextPage,
    hasPrevPage,
    measureParagraphs,
    paragraphRefs,
  } = useDynamicPaginatedReader({
    content: currentChapter?.content || '',
    initialParagraphIndex: 0,
    containerHeight,
    fallbackParagraphHeight: 120,
  });

  // Effective "advance" paragraph: either the cut-off paragraph OR the last paragraph on the page
  // This is the paragraph that, when clicked, advances to the next page
  const effectiveAdvanceIndex = useMemo(() => {
    if (pageParagraphs.length === 0) return null;
    return firstCutOffIndex ?? (pageParagraphs.length - 1);
  }, [firstCutOffIndex, pageParagraphs.length]);

  // Current page's absolute start index
  const pageStartIndex = useMemo(() => {
    // Find the start index from the current page
    if (pageParagraphs.length === 0) return 0;
    return currentParagraphIndex - currentParagraphOnPage;
  }, [currentParagraphIndex, currentParagraphOnPage, pageParagraphs.length]);

  // Reset layout stability on page/chapter/layout changes
  useEffect(() => {
    setPageLayoutStable(false);
    setFirstCutOffIndex(null);
    measurementsDoneRef.current = false;
    setSuppressAutoSelection(true);
  }, [currentPageIndex, chapterIndex, fontSize, containerHeight]);

  // Measure paragraphs after they render (only once page layout is stable)
  useLayoutEffect(() => {
    if (!pageLayoutStable) return;

    // Delay measurement to ensure DOM is ready after animation
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        measureParagraphs();
        measurementsDoneRef.current = true;
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [pageLayoutStable, currentPageIndex, fontSize, containerHeight, measureParagraphs]);

  // Cut-off analysis (runs after measurements are done)
  useLayoutEffect(() => {
    if (!pageLayoutStable || !measurementsDoneRef.current) return;

    const containerEl = contentContainerRef.current;
    if (!containerEl) return;

    // Clear immediately to avoid stale click gating while page swaps
    setFirstCutOffIndex(null);

    let raf = 0;
    let tries = 0;

    const analyze = () => {
      const containerRect = containerEl.getBoundingClientRect();

      const refs = paragraphRefs.current.slice(0, pageParagraphs.length);
      const readyCount = refs.filter(Boolean).length;
      const allReady = readyCount === pageParagraphs.length;

      // If refs aren’t ready yet (AnimatePresence / staggered mount), try again next frame.
      if (!allReady && tries < 6) {
        tries += 1;
        raf = requestAnimationFrame(analyze);
        return;
      }

      let found: number | null = null;

      if (import.meta.env.DEV) {
        console.groupCollapsed(
          `[CutOff] Page ${currentPageIndex} analysis (paras=${pageParagraphs.length}, ready=${readyCount})`
        );
      }

      for (let i = 0; i < pageParagraphs.length; i++) {
        const el = paragraphRefs.current[i];
        if (!el) {
          if (import.meta.env.DEV) {
            console.log(`Paragraph ${i}: <missing ref>`);
          }
          continue;
        }

        const elRect = el.getBoundingClientRect();
        const cutOffPx = elRect.bottom - containerRect.bottom;
        const cutOffRatio = elRect.height > 0 ? cutOffPx / elRect.height : 0;
        const intersectsBottom =
          elRect.top < containerRect.bottom && elRect.bottom > containerRect.bottom;

        if (import.meta.env.DEV) {
          console.log(`Paragraph ${i}`, {
            cutOffRatio: Number(cutOffRatio.toFixed(3)),
            cutOffPx: Number(cutOffPx.toFixed(1)),
            height: Number(elRect.height.toFixed(1)),
            intersectsBottom,
          });
        }

        if (intersectsBottom && cutOffRatio > 0.25) {
          found = i;
          break;
        }
      }

      if (import.meta.env.DEV) {
        console.log('First eligible cut-off index:', found);
        console.groupEnd();
      }

      setFirstCutOffIndex((prev) => (prev === found ? prev : found));
    };

    // Run on the next paint to reduce sensitivity to initial transforms
    raf = requestAnimationFrame(() => requestAnimationFrame(analyze));

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [pageLayoutStable, currentPageIndex, pageParagraphs, containerHeight, fontSize]);

  // Detect per-paragraph overflow after layout settles
  useLayoutEffect(() => {
    if (!pageLayoutStable) return;

    const raf = requestAnimationFrame(() => {
      const nextOverflow: boolean[] = [];

      for (let i = 0; i < pageParagraphs.length; i++) {
        const el = paragraphRefs.current[i];
        if (!el) {
          nextOverflow[i] = false;
          continue;
        }

        const p = el.querySelector('p');
        if (!p) {
          nextOverflow[i] = false;
          continue;
        }

        nextOverflow[i] = p.scrollHeight > p.clientHeight;
      }

      setParagraphOverflow((prev) => {
        if (prev.length !== nextOverflow.length) return nextOverflow;
        for (let i = 0; i < nextOverflow.length; i++) {
          if (prev[i] !== nextOverflow[i]) {
            return nextOverflow;
          }
        }
        return prev;
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [pageLayoutStable, pageParagraphs.length, currentPageIndex]);

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
    getParagraphIndexForTime,
  } = usePublicBookAudio({
    audioUrl: currentChapterAudio?.audio_url || null,
    syncUrl: currentChapterAudio?.sync_url || null,
    chapterIndex,
    onChapterEnd: useCallback(() => {
      if (hasNextChapter) {
        setAutoPlayNextChapter(true);
        nextChapter();
      } else {
        setAutoPlayNextChapter(false);
      }
    }, [hasNextChapter, nextChapter]),
  });

  // Sync audio paragraph with paginated view
  useEffect(() => {
    if (hasSyncData && isPlaying && typeof audioParagraphIndex === 'number') {
      goToParagraph(audioParagraphIndex);
    }
  }, [audioParagraphIndex, hasSyncData, isPlaying, goToParagraph]);

  // Sync audio position when user navigates pages
  useEffect(() => {
    if (!pendingPageSeekRef.current) return;
    if (!hasAudio || !hasSyncData || pageParagraphs.length === 0) return;

    const targetParagraph = Math.max(0, currentParagraphIndex - currentParagraphOnPage);
    seekToParagraph(targetParagraph);

    pendingPageSeekRef.current = false;
  }, [
    currentPageIndex,
    currentParagraphIndex,
    currentParagraphOnPage,
    pageParagraphs.length,
    hasAudio,
    hasSyncData,
    seekToParagraph,
  ]);

  // Auto-play next chapter after audio ends
  useEffect(() => {
    if (!autoPlayNextChapter) return;
    if (!hasAudio || isAudioLoading) return;
    togglePlay();
    setAutoPlayNextChapter(false);
  }, [autoPlayNextChapter, hasAudio, isAudioLoading, togglePlay, chapterIndex]);

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
      setSuppressAutoSelection(true);
      setIsTimeScrubSelection(false);
      setIsPageNavSelection(true);
      pendingPageSeekRef.current = true;
      goToNextPage();
    } else if (hasNextChapter) {
      setPageDirection('next');
      setIsPageNavSelection(false);
      nextChapter();
    }
  };

  const handlePrevPage = () => {
    if (hasPrevPage) {
      setPageDirection('prev');
      setSuppressAutoSelection(true);
      setIsTimeScrubSelection(false);
      setIsPageNavSelection(true);
      pendingPageSeekRef.current = true;
      goToPrevPage();
    } else if (hasPrevChapter) {
      setPageDirection('prev');
      setIsPageNavSelection(false);
      prevChapter();
    }
  };

  // Handle paragraph click - select paragraph and sync audio
  const handleParagraphClick = (pageRelativeIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSuppressAutoSelection(false);
    setIsTimeScrubSelection(false);
    setIsPageNavSelection(false);

    const absoluteIndex = pageStartIndex + pageRelativeIndex;

    if (import.meta.env.DEV) {
      console.log({
        pageRelativeIndex,
        pageParagraphsLength: pageParagraphs.length,
        pageStartIndex,
        currentPageIndex,
      });
      console.log('[Reader] Clicked paragraph:', pageRelativeIndex, '(absolute:', absoluteIndex, ')');
    }

    selectParagraph(pageRelativeIndex);

    if (hasSyncData && hasAudio) {
      seekToParagraph(absoluteIndex);
    }
  };

  // Handle double-click - advance to next paragraph (useful for long paragraphs)
  const handleParagraphDoubleClick = (pageRelativeIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSuppressAutoSelection(false);
    setIsTimeScrubSelection(false);
    setIsPageNavSelection(false);

    const absoluteIndex = pageStartIndex + pageRelativeIndex;
    const nextParagraphIndex = absoluteIndex + 1;

    if (import.meta.env.DEV) {
      console.log('[Reader] Double-click: advancing from paragraph', absoluteIndex, 'to', nextParagraphIndex);
    }

    // Check if there's a next paragraph
    if (nextParagraphIndex < paragraphs.length) {
      setPageDirection('next');
      goToParagraph(nextParagraphIndex);

      if (hasSyncData && hasAudio) {
        seekToParagraph(nextParagraphIndex);
      }
    } else if (hasNextChapter) {
      // At the end of chapter, go to next chapter
      setPageDirection('next');
      nextChapter();
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
                onAnimationStart={() => setPageLayoutStable(false)}
                onAnimationComplete={() => setPageLayoutStable(true)}
                ref={contentContainerRef}
                className="page-container"
                style={{
                  height: pageParagraphs.length <= 1 ? 'auto' : containerHeight,
                  overflow: 'hidden',
                }}
              >
                {pageParagraphs.map((paragraph, index) => {
                  const isAudioSynced = hasSyncData && isPlaying;
                  const isAutoHighlightEnabled =
                    !suppressAutoSelection ||
                    isAudioSynced ||
                    isTimeScrubSelection ||
                    isPageNavSelection;
                  const isCurrentParagraph = isAutoHighlightEnabled && currentParagraphOnPage === index;
                  const isAdvanceParagraph = effectiveAdvanceIndex === index;
                  
                  const shouldScroll = isCurrentParagraph && paragraphOverflow[index];

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
                      onDoubleClick={(e) => handleParagraphDoubleClick(index, e)}
                      className={cn(
                        "reading-paragraph mb-4",
                        isDarkMode ? "text-slate-200" : "text-foreground/90",
                        isCurrentParagraph && "current",
                        isCurrentParagraph && isAudioSynced && "playing",
                        isAdvanceParagraph && "advance-paragraph"
                      )}
                      role="button"
                      tabIndex={0}
                      aria-label={`Paragraph ${pageStartIndex + index + 1}${isAdvanceParagraph ? ' - tap to continue' : ''}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleParagraphClick(index, e as any);
                        }
                      }}
                    >
                      <p className={cn(
                        shouldScroll && "paragraph-scrollable"
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
                    onValueCommit={(value) => {
                      const newTime = (value[0] / 100) * duration;
                      seekTo(newTime);

                      if (!hasSyncData) return;
                      const targetParagraph = getParagraphIndexForTime(newTime);
                      if (typeof targetParagraph !== 'number') return;

                      setSuppressAutoSelection(false);
                      setIsTimeScrubSelection(true);
                      setIsPageNavSelection(false);
                      goToParagraph(targetParagraph);
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
