import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface AudioTrack {
  id: string;
  paragraph_index: number;
  audio_url: string | null;
  status: 'NOT_GENERATED' | 'GENERATING' | 'GENERATED';
  estimated_duration_seconds: number;
  actual_duration_seconds: number | null;
}

const WORDS_PER_MINUTE = 160.0;
const INITIAL_BUFFER_MINUTES = 5;
const ROLLING_BUFFER_MINUTES = 15;
const POLL_INTERVAL_MS = 10000;

/**
 * Estimate duration in seconds from text
 */
function estimateDurationSeconds(text: string): number {
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  return (words / WORDS_PER_MINUTE) * 60.0;
}

export function useChapterAudio(bookId: string | undefined, chapterIndex: number) {
  const { user } = useAuth();
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const signedUrlsRef = useRef<Map<string, string>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeChapterRef = useRef<number>(chapterIndex);
  const hasAutoPlayedRef = useRef<boolean>(false); // Track if auto-play has fired for this chapter
  const audioTracksRef = useRef<AudioTrack[]>([]); // Ref for current tracks (avoids stale closure)
  const isGeneratingRef = useRef<boolean>(false); // Ref for generating state

  // Abort all ongoing operations for the old chapter
  const abortCurrentOperations = useCallback(() => {
    console.log('[useChapterAudio] Aborting operations for chapter', activeChapterRef.current);
    
    // Abort fetch requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Clear polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    // Stop audio playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }

    // Clear state
    setAudioTracks([]);
    setCurrentParagraphIndex(0);
    setIsPlaying(false);
    setIsLoading(false);
    setIsGenerating(false);
    setCurrentTime(0);
    setDuration(0);
    signedUrlsRef.current.clear();
    hasAutoPlayedRef.current = false; // Reset auto-play flag
  }, []);

  // Handle chapter changes - abort old chapter and reset
  useEffect(() => {
    if (chapterIndex !== activeChapterRef.current) {
      console.log('[useChapterAudio] Chapter changed from', activeChapterRef.current, 'to', chapterIndex);
      abortCurrentOperations();
      activeChapterRef.current = chapterIndex;
      hasAutoPlayedRef.current = false; // Reset auto-play for new chapter
    }
  }, [chapterIndex, abortCurrentOperations]);

  // Fetch audio tracks for current chapter
  const fetchAudioTracks = useCallback(async () => {
    if (!bookId || !user) return;
    
    // Check if this is still the active chapter
    if (chapterIndex !== activeChapterRef.current) return;

    try {
      const { data, error } = await supabase
        .from('audio_tracks')
        .select('id, paragraph_index, audio_url, status, estimated_duration_seconds, actual_duration_seconds')
        .eq('book_id', bookId)
        .eq('chapter_index', chapterIndex)
        .order('paragraph_index', { ascending: true });

      if (error) {
        console.error('[useChapterAudio] Failed to fetch tracks:', error);
        return;
      }

      // Verify chapter is still active before updating state
      if (chapterIndex !== activeChapterRef.current) return;

      const tracks = (data || []).map(t => ({
        ...t,
        status: t.status as AudioTrack['status'],
      }));
      setAudioTracks(tracks);
      audioTracksRef.current = tracks; // Keep ref in sync
    } catch (err) {
      console.error('[useChapterAudio] Error fetching tracks:', err);
    }
  }, [bookId, user, chapterIndex]);

  // Initial fetch on mount/chapter change
  useEffect(() => {
    fetchAudioTracks();
  }, [fetchAudioTracks]);

  // Calculate future buffer duration
  const calculateFutureBuffer = useCallback((fromParagraphIndex: number): number => {
    let totalSeconds = 0;
    for (const track of audioTracks) {
      if (track.paragraph_index >= fromParagraphIndex) {
        if (track.status === 'GENERATED' || track.status === 'GENERATING') {
          totalSeconds += Number(track.estimated_duration_seconds);
        }
      }
    }
    return totalSeconds / 60; // Return minutes
  }, [audioTracks]);

  // Trigger audio generation for current chapter
  const generateChapterAudio = useCallback(async (targetMinutes: number = INITIAL_BUFFER_MINUTES) => {
    if (!bookId || !user || isGenerating) return;

    // Verify this is still the active chapter
    if (chapterIndex !== activeChapterRef.current) {
      console.log('[useChapterAudio] Generation aborted - chapter changed');
      return;
    }

    setIsGenerating(true);
    isGeneratingRef.current = true;
    abortControllerRef.current = new AbortController();
    
    // Start fast polling to detect when first audio is ready (for auto-play)
    // This runs every 2 seconds to quickly pick up newly generated tracks
    const fastPollInterval = setInterval(async () => {
      if (chapterIndex !== activeChapterRef.current) {
        clearInterval(fastPollInterval);
        return;
      }
      await fetchAudioTracks();
    }, 2000);

    try {
      const { data, error } = await supabase.functions.invoke('generate-chapter-audio', {
        body: { bookId, chapterIndex, targetDurationMinutes: targetMinutes },
      });

      // Check if aborted or chapter changed
      if (chapterIndex !== activeChapterRef.current) {
        console.log('[useChapterAudio] Generation result ignored - chapter changed');
        clearInterval(fastPollInterval);
        return;
      }

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.generated > 0) {
        toast.success(`Generated ${data.generated} audio segments`, {
          description: 'Audio is playing!',
        });
      }

      // Final refresh to get all tracks
      await fetchAudioTracks();
    } catch (err) {
      if (chapterIndex === activeChapterRef.current) {
        console.error('[useChapterAudio] Generation failed:', err);
        toast.error('Failed to generate audio', {
          description: err instanceof Error ? err.message : 'Please try again.',
        });
      }
    } finally {
      clearInterval(fastPollInterval);
      if (chapterIndex === activeChapterRef.current) {
        setIsGenerating(false);
        isGeneratingRef.current = false;
      }
    }
  }, [bookId, user, chapterIndex, isGenerating, fetchAudioTracks]);

  // Start background polling for buffer maintenance
  const startBufferPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;

    pollingIntervalRef.current = setInterval(async () => {
      // Verify still active chapter
      if (chapterIndex !== activeChapterRef.current) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        return;
      }

      // Refresh tracks
      await fetchAudioTracks();

      // Check buffer
      const futureBuffer = calculateFutureBuffer(currentParagraphIndex);
      console.log(`[useChapterAudio] Buffer check: ${futureBuffer.toFixed(1)} min ahead`);

      if (futureBuffer < ROLLING_BUFFER_MINUTES) {
        console.log('[useChapterAudio] Buffer low, triggering generation');
        await generateChapterAudio(ROLLING_BUFFER_MINUTES);
      }
    }, POLL_INTERVAL_MS);
  }, [chapterIndex, fetchAudioTracks, calculateFutureBuffer, currentParagraphIndex, generateChapterAudio]);

  // Stop polling
  const stopBufferPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Get signed URL for audio file
  const getSignedUrl = useCallback(async (audioPath: string): Promise<string | null> => {
    if (signedUrlsRef.current.has(audioPath)) {
      return signedUrlsRef.current.get(audioPath)!;
    }

    try {
      const { data, error } = await supabase.storage
        .from('audio-files')
        .createSignedUrl(audioPath, 3600);

      if (error || !data?.signedUrl) {
        console.error('[useChapterAudio] Failed to get signed URL:', error);
        return null;
      }

      signedUrlsRef.current.set(audioPath, data.signedUrl);
      return data.signedUrl;
    } catch (err) {
      console.error('[useChapterAudio] Error getting signed URL:', err);
      return null;
    }
  }, []);

  // Load and play a specific paragraph
  const loadParagraph = useCallback(async (paragraphIndex: number) => {
    // Use ref to get latest tracks (avoids stale closure when called from event listeners)
    const currentTracks = audioTracksRef.current;
    const track = currentTracks.find(t => t.paragraph_index === paragraphIndex);
    if (!track || track.status !== 'GENERATED' || !track.audio_url) {
      console.log('[useChapterAudio] Track not ready:', paragraphIndex, 'status:', track?.status);
      return false;
    }

    // Verify still active chapter
    if (chapterIndex !== activeChapterRef.current) return false;

    setIsLoading(true);

    try {
      const signedUrl = await getSignedUrl(track.audio_url);
      if (!signedUrl) {
        setIsLoading(false);
        return false;
      }

      // Verify again after async operation
      if (chapterIndex !== activeChapterRef.current) {
        setIsLoading(false);
        return false;
      }

      // Clean up previous audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }

      const audio = new Audio(signedUrl);
      audio.playbackRate = playbackRate;

      audio.addEventListener('loadedmetadata', () => {
        if (chapterIndex === activeChapterRef.current) {
          setDuration(audio.duration);
          setIsLoading(false);
        }
      });

      audio.addEventListener('timeupdate', () => {
        if (chapterIndex === activeChapterRef.current) {
          setCurrentTime(audio.currentTime);
        }
      });

      audio.addEventListener('ended', () => {
        if (chapterIndex !== activeChapterRef.current) return;

        // Auto-advance to next paragraph - use ref to get latest tracks
        const nextIndex = paragraphIndex + 1;
        const currentTracks = audioTracksRef.current;
        const nextTrack = currentTracks.find(t => t.paragraph_index === nextIndex);
        
        if (nextTrack && nextTrack.status === 'GENERATED' && nextTrack.audio_url) {
          setCurrentParagraphIndex(nextIndex);
          loadParagraph(nextIndex);
        } else {
          // Next track not ready yet - if still generating, wait for it
          if (isGeneratingRef.current) {
            console.log('[useChapterAudio] Next track not ready yet, waiting...');
            // Set up a watcher to auto-continue when next track becomes available
            const checkInterval = setInterval(() => {
              if (chapterIndex !== activeChapterRef.current) {
                clearInterval(checkInterval);
                return;
              }
              const latestTracks = audioTracksRef.current;
              const latestNextTrack = latestTracks.find(t => t.paragraph_index === nextIndex);
              if (latestNextTrack && latestNextTrack.status === 'GENERATED' && latestNextTrack.audio_url) {
                clearInterval(checkInterval);
                setCurrentParagraphIndex(nextIndex);
                loadParagraph(nextIndex);
              } else if (!isGeneratingRef.current) {
                // Generation finished but track still not ready - stop waiting
                clearInterval(checkInterval);
                setIsPlaying(false);
              }
            }, 1000);
          } else {
            setIsPlaying(false);
          }
        }
      });

      audio.addEventListener('error', (e) => {
        console.error('[useChapterAudio] Audio playback error:', e);
        if (chapterIndex === activeChapterRef.current) {
          setIsLoading(false);
        }
      });

      audioRef.current = audio;
      setCurrentParagraphIndex(paragraphIndex);

      await audio.play();
      if (chapterIndex === activeChapterRef.current) {
        setIsPlaying(true);
      }

      return true;
    } catch (err) {
      console.error('[useChapterAudio] Error loading paragraph:', err);
      if (chapterIndex === activeChapterRef.current) {
        setIsLoading(false);
      }
      return false;
    }
  }, [chapterIndex, getSignedUrl, playbackRate]);

  // Auto-play when first paragraph's audio becomes available
  // This creates a streaming-like experience: click Generate → audio starts automatically
  useEffect(() => {
    // Only trigger during active generation
    if (!isGenerating) return;
    
    // Only trigger once per chapter
    if (hasAutoPlayedRef.current) return;
    
    // Verify this is still the active chapter
    if (chapterIndex !== activeChapterRef.current) return;
    
    // Don't auto-play if already playing
    if (isPlaying) return;
    
    // Find the first generated paragraph (index 0 ideally, but accept first available)
    const firstGeneratedTrack = audioTracks.find(t => t.status === 'GENERATED' && t.audio_url);
    
    if (firstGeneratedTrack) {
      console.log('[useChapterAudio] Auto-play triggered - first audio ready at paragraph', firstGeneratedTrack.paragraph_index);
      hasAutoPlayedRef.current = true;
      
      // Start playback and polling
      loadParagraph(firstGeneratedTrack.paragraph_index).then((success) => {
        if (success && chapterIndex === activeChapterRef.current) {
          startBufferPolling();
        }
      });
    }
  }, [audioTracks, isGenerating, isPlaying, chapterIndex, loadParagraph, startBufferPolling]);

  // Play/Pause toggle
  const togglePlay = useCallback(async () => {
    if (!audioRef.current) {
      // Find first generated track
      const firstGenerated = audioTracks.find(t => t.status === 'GENERATED');
      if (firstGenerated) {
        startBufferPolling();
        await loadParagraph(firstGenerated.paragraph_index);
      } else if (audioTracks.length === 0) {
        // No tracks yet, trigger initial generation
        await generateChapterAudio(INITIAL_BUFFER_MINUTES);
      }
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      stopBufferPolling();
    } else {
      await audioRef.current.play();
      setIsPlaying(true);
      startBufferPolling();
    }
  }, [isPlaying, audioTracks, loadParagraph, generateChapterAudio, startBufferPolling, stopBufferPolling]);

  // Skip to next paragraph
  const nextParagraph = useCallback(() => {
    const nextIndex = currentParagraphIndex + 1;
    const nextTrack = audioTracks.find(t => t.paragraph_index === nextIndex && t.status === 'GENERATED');
    if (nextTrack) {
      loadParagraph(nextIndex);
    }
  }, [currentParagraphIndex, audioTracks, loadParagraph]);

  // Skip to previous paragraph
  const prevParagraph = useCallback(() => {
    if (currentParagraphIndex > 0) {
      const prevIndex = currentParagraphIndex - 1;
      const prevTrack = audioTracks.find(t => t.paragraph_index === prevIndex && t.status === 'GENERATED');
      if (prevTrack) {
        loadParagraph(prevIndex);
      }
    } else if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  }, [currentParagraphIndex, audioTracks, loadParagraph]);

  // Seek within current track
  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  // Change playback speed
  const changePlaybackRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortCurrentOperations();
    };
  }, [abortCurrentOperations]);

  // Check if we have any generated audio for this chapter
  const hasGeneratedAudio = audioTracks.some(t => t.status === 'GENERATED');
  const generatingCount = audioTracks.filter(t => t.status === 'GENERATING').length;
  const generatedCount = audioTracks.filter(t => t.status === 'GENERATED').length;
  const totalParagraphs = audioTracks.length;

  return {
    audioTracks,
    currentParagraphIndex,
    isPlaying,
    isLoading,
    isGenerating,
    currentTime,
    duration,
    playbackRate,
    togglePlay,
    nextParagraph,
    prevParagraph,
    seek,
    changePlaybackRate,
    generateChapterAudio,
    hasGeneratedAudio,
    generatingCount,
    generatedCount,
    totalParagraphs,
  };
}
