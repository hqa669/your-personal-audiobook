import { useState, useEffect, useRef, useCallback } from 'react';

interface SyncEntry {
  paragraph: number;
  start: number;
  end: number;
}

interface UsePublicBookAudioProps {
  audioUrl: string | null;
  syncUrl: string | null;
  chapterIndex: number;
  onChapterEnd?: () => void;
  initialTime?: number;
}

export function usePublicBookAudio({
  audioUrl,
  syncUrl,
  chapterIndex,
  onChapterEnd,
  initialTime,
}: UsePublicBookAudioProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0);
  const [syncData, setSyncData] = useState<SyncEntry[]>([]);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeChapterRef = useRef(chapterIndex);
  const initialTimeRef = useRef<number | null>(null);

  // Handle chapter changes - reset audio
  useEffect(() => {
    if (chapterIndex !== activeChapterRef.current) {
      activeChapterRef.current = chapterIndex;
      setIsPlaying(false);
      setCurrentTime(0);
      setCurrentParagraphIndex(0);
      setSyncData([]);
      initialTimeRef.current = null;
      
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    }
  }, [chapterIndex]);

  // Track initial time before audio element is created
  useEffect(() => {
    if (audioRef.current) return;
    if (typeof initialTime === 'number' && initialTime >= 0) {
      initialTimeRef.current = initialTime;
    }
  }, [initialTime]);

  // Load sync data when syncUrl changes
  useEffect(() => {
    if (!syncUrl) {
      setSyncData([]);
      return;
    }

    const loadSyncData = async () => {
      try {
        const response = await fetch(syncUrl);
        if (!response.ok) throw new Error('Failed to fetch sync data');
        const data = await response.json();
        // Ensure data is an array
        if (Array.isArray(data)) {
          setSyncData(data);
        } else if (data && typeof data === 'object' && Array.isArray(data.paragraphs)) {
          // Handle case where sync data is wrapped in an object
          setSyncData(data.paragraphs);
        } else {
          console.warn('Sync data is not in expected format:', data);
          setSyncData([]);
        }
      } catch (err) {
        console.error('Failed to load sync data:', err);
        setSyncData([]);
      }
    };

    loadSyncData();
  }, [syncUrl]);

  const getParagraphIndexForTime = useCallback((time: number) => {
    if (!Array.isArray(syncData) || syncData.length === 0) return null;

    let lastBefore: SyncEntry | null = null;

    for (const entry of syncData) {
      if (time >= entry.start && time < entry.end) {
        return entry.paragraph;
      }

      if (time >= entry.start) {
        if (!lastBefore || entry.start >= lastBefore.start) {
          lastBefore = entry;
        }
      }
    }

    if (lastBefore) return lastBefore.paragraph;
    return syncData[0]?.paragraph ?? null;
  }, [syncData]);

  // Update current paragraph based on time
  useEffect(() => {
    if (!Array.isArray(syncData) || syncData.length === 0) return;

    const paragraphIndex = getParagraphIndexForTime(currentTime);
    if (paragraphIndex !== null) {
      setCurrentParagraphIndex(paragraphIndex);
    }
  }, [currentTime, syncData, getParagraphIndexForTime]);

  // Initialize audio element
  const initAudio = useCallback(async () => {
    if (!audioUrl) return null;
    
    setIsLoading(true);
    
    try {
      const audio = new Audio(audioUrl);
      audio.playbackRate = playbackRate;
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => resolve(), 10000);
        
        audio.addEventListener('loadedmetadata', () => {
          setDuration(audio.duration);
          if (initialTimeRef.current !== null) {
            const targetTime = Math.min(initialTimeRef.current, audio.duration || initialTimeRef.current);
            audio.currentTime = targetTime;
            setCurrentTime(targetTime);
            initialTimeRef.current = null;
          }
        });
        
        audio.addEventListener('canplaythrough', () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });
        
        audio.addEventListener('error', (e) => {
          clearTimeout(timeout);
          reject(new Error('Failed to load audio'));
        }, { once: true });
        
        audio.load();
      });

      // Set up event listeners
      audio.addEventListener('timeupdate', () => {
        setCurrentTime(audio.currentTime);
      });

      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        setCurrentTime(0);
        onChapterEnd?.();
      });

      audio.addEventListener('pause', () => {
        setIsPlaying(false);
      });

      audio.addEventListener('play', () => {
        setIsPlaying(true);
      });

      audioRef.current = audio;
      setIsLoading(false);
      return audio;
    } catch (err) {
      console.error('Failed to initialize audio:', err);
      setIsLoading(false);
      return null;
    }
  }, [audioUrl, playbackRate, onChapterEnd]);

  // Toggle play/pause
  const togglePlay = useCallback(async () => {
    if (!audioUrl) return;

    // Initialize audio if needed
    if (!audioRef.current) {
      const audio = await initAudio();
      if (!audio) return;
      
      try {
        await audio.play();
        setIsPlaying(true);
      } catch (err) {
        console.error('Failed to play:', err);
      }
      return;
    }

    // Toggle existing audio
    if (audioRef.current.paused) {
      try {
        await audioRef.current.play();
      } catch (err) {
        console.error('Failed to play:', err);
      }
    } else {
      audioRef.current.pause();
    }
  }, [audioUrl, initAudio]);

  // Seek to time
  const seekTo = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  // Seek to paragraph
  const seekToParagraph = useCallback((paragraphIndex: number) => {
    const entry = syncData.find(e => e.paragraph === paragraphIndex);
    if (entry) {
      seekTo(entry.start);
    }
  }, [syncData, seekTo]);

  // Change playback rate
  const changePlaybackRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }, []);

  // Skip forward/backward
  const skip = useCallback((seconds: number) => {
    if (audioRef.current) {
      const newTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds));
      seekTo(newTime);
    }
  }, [duration, seekTo]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  return {
    isPlaying,
    isLoading,
    currentTime,
    duration,
    playbackRate,
    currentParagraphIndex,
    hasAudio: !!audioUrl,
    hasSyncData: syncData.length > 0,
    togglePlay,
    seekTo,
    seekToParagraph,
    changePlaybackRate,
    skip,
    getParagraphIndexForTime,
  };
}
