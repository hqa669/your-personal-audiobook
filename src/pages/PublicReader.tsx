import { useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Sun, 
  Moon, 
  Type,
  Volume2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { usePublicBookReader } from '@/hooks/usePublicBookReader';
import { usePublicBookAudio } from '@/hooks/usePublicBookAudio';
import { ChapterListSheet } from '@/components/ChapterListSheet';
import { cn } from '@/lib/utils';

export default function PublicReader() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [showControls, setShowControls] = useState(true);

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
    hasNext,
    hasPrev,
    currentChapterAudio,
  } = usePublicBookReader(id);

  const {
    isPlaying,
    isLoading: isAudioLoading,
    currentTime,
    duration,
    playbackRate,
    currentParagraphIndex,
    hasAudio,
    hasSyncData,
    togglePlay,
    seekTo,
    changePlaybackRate,
  } = usePublicBookAudio({
    audioUrl: currentChapterAudio?.audio_url || null,
    syncUrl: currentChapterAudio?.sync_url || null,
    chapterIndex,
    onChapterEnd: useCallback(() => {
      if (hasNext) {
        nextChapter();
      }
    }, [hasNext, nextChapter]),
  });

  const speeds = [0.75, 1, 1.25, 1.5, 2];

  // Calculate reading progress percentage
  const progressPercent = totalChapters > 0 
    ? Math.round((chapterIndex / (totalChapters - 1)) * 100) 
    : 0;

  // Calculate audio progress percentage
  const audioProgress = duration > 0 ? (currentTime / duration) * 100 : 0;

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
      isDarkMode ? "bg-slate-900 text-slate-100" : "bg-background text-foreground"
    )}>
      {/* Header */}
      <AnimatePresence>
        {showControls && (
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
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
              </div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main 
        className="container max-w-2xl mx-auto px-6 py-20 cursor-pointer min-h-screen"
        onClick={() => setShowControls(!showControls)}
      >
        {currentChapter ? (
          <article 
            className="prose prose-lg max-w-none leading-relaxed"
            style={{ fontSize: `${fontSize}px`, lineHeight: 1.8 }}
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
            
            {/* Chapter content */}
            {currentChapter.content.split('\n\n').filter(p => p.trim()).map((paragraph, index) => {
              const isCurrentParagraph = hasSyncData && isPlaying && currentParagraphIndex === index;
              return (
                <motion.p
                  key={index}
                  initial={{ opacity: 0.3 }}
                  animate={{ 
                    opacity: 1,
                    backgroundColor: isCurrentParagraph 
                      ? (isDarkMode ? 'rgba(162, 123, 92, 0.15)' : 'rgba(162, 123, 92, 0.1)')
                      : 'transparent'
                  }}
                  transition={{ 
                    delay: Math.min(index * 0.02, 0.5), 
                    duration: 0.3,
                    backgroundColor: { duration: 0.3 }
                  }}
                  className={cn(
                    "mb-6 px-2 -mx-2 py-1 rounded-lg transition-colors",
                    isDarkMode ? "text-slate-200" : "text-foreground/90",
                    isCurrentParagraph && "ring-1 ring-primary/30"
                  )}
                >
                  {paragraph}
                </motion.p>
              );
            })}
            
            {/* Chapter navigation at bottom */}
            <div className="flex justify-between items-center mt-12 pt-8 border-t border-border/50">
              <Button
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  prevChapter();
                }}
                disabled={!hasPrev}
                className="gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                {chapterIndex + 1} of {totalChapters}
              </span>
              <Button
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  nextChapter();
                }}
                disabled={!hasNext}
                className="gap-2"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
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
            className={cn(
              "fixed bottom-0 left-0 right-0 z-40 backdrop-blur-md border-t pb-safe",
              isDarkMode ? "bg-slate-900/90 border-slate-800" : "bg-background/90 border-border"
            )}
          >
            <div className="container max-w-2xl mx-auto px-4 py-4 space-y-4">
              {/* Audio progress slider (if audio exists) */}
              {hasAudio && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-12">
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

              {/* Chapter progress slider */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-10">Ch {chapterIndex + 1}</span>
                <Slider
                  value={[progressPercent]}
                  onValueChange={(value) => {
                    const newIndex = Math.round((value[0] / 100) * (totalChapters - 1));
                    goToChapter(newIndex);
                  }}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground w-10">{totalChapters}</span>
              </div>

              {/* Audio controls */}
              <div className="flex items-center justify-between">
                {/* Left - Chapter & Display */}
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

                {/* Center - Play controls */}
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-10 h-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      prevChapter();
                    }}
                    disabled={!hasPrev}
                  >
                    <SkipBack className="w-4 h-4" />
                  </Button>
                  
                  {/* Play button - always shown for public books with audio */}
                  {hasAudio ? (
                    <Button
                      variant="warm"
                      size="icon"
                      className="w-14 h-14 rounded-full"
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
                  
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-10 h-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      nextChapter();
                    }}
                    disabled={!hasNext}
                  >
                    <SkipForward className="w-4 h-4" />
                  </Button>
                </div>

                {/* Right - Speed & Voice */}
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
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
