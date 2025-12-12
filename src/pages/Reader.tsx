import { useState } from 'react';
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
  List, 
  Type,
  Volume2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { userLibrary, sampleChapterText } from '@/data/books';
import { cn } from '@/lib/utils';

export default function Reader() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [progress, setProgress] = useState(25);
  const [showControls, setShowControls] = useState(true);

  const book = userLibrary.find(b => b.id === id) || {
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
  };

  const speeds = [0.75, 1, 1.25, 1.5, 2];

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
              <div className="text-center">
                <h1 className="font-serif text-sm font-medium truncate max-w-48">{book.title}</h1>
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
        className="container max-w-2xl mx-auto px-6 py-20 cursor-pointer"
        onClick={() => setShowControls(!showControls)}
      >
        <article 
          className="prose prose-lg max-w-none leading-relaxed"
          style={{ fontSize: `${fontSize}px`, lineHeight: 1.8 }}
        >
          {sampleChapterText.split('\n\n').filter(p => p.trim()).map((paragraph, index) => (
            <motion.p
              key={index}
              initial={{ opacity: 0.3 }}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.05, duration: 0.3 }}
              className={cn(
                "mb-6",
                isDarkMode ? "text-slate-200" : "text-foreground/90"
              )}
            >
              {paragraph}
            </motion.p>
          ))}
        </article>
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
              {/* Progress slider */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-10">2:45</span>
                <Slider
                  value={[progress]}
                  onValueChange={(value) => setProgress(value[0])}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground w-10">10:30</span>
              </div>

              {/* Audio controls */}
              <div className="flex items-center justify-between">
                {/* Left - Chapter & Display */}
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="w-10 h-10">
                    <List className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-10 h-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFontSize(prev => Math.min(prev + 2, 28));
                    }}
                  >
                    <Type className="w-4 h-4" />
                  </Button>
                </div>

                {/* Center - Play controls */}
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="w-10 h-10">
                    <SkipBack className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="warm"
                    size="icon"
                    className="w-14 h-14 rounded-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPlaying(!isPlaying);
                    }}
                  >
                    {isPlaying ? (
                      <Pause className="w-6 h-6" />
                    ) : (
                      <Play className="w-6 h-6 ml-0.5" />
                    )}
                  </Button>
                  <Button variant="ghost" size="icon" className="w-10 h-10">
                    <SkipForward className="w-4 h-4" />
                  </Button>
                </div>

                {/* Right - Speed & Voice */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      const currentIndex = speeds.indexOf(playbackSpeed);
                      const nextIndex = (currentIndex + 1) % speeds.length;
                      setPlaybackSpeed(speeds[nextIndex]);
                    }}
                  >
                    {playbackSpeed}x
                  </Button>
                  <Button variant="ghost" size="icon" className="w-10 h-10">
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
