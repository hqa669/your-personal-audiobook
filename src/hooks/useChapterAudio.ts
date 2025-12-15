import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface AudioTrack {
  id: string;
  paragraph_index: number;
  chunk_index: number;
  total_chunks: number;
  audio_url: string | null;
  status: 'NOT_GENERATED' | 'PENDING' | 'GENERATING' | 'GENERATED';
  estimated_duration_seconds: number;
  actual_duration_seconds: number | null;
}

const WORDS_PER_MINUTE = 160.0;
const INITIAL_BUFFER_MINUTES = 5;
const ROLLING_BUFFER_MINUTES = 15;
const POLL_INTERVAL_MS = 3000; // Faster polling since we're now checking job completion
const JOB_POLL_INTERVAL_MS = 2000; // Poll for job completion

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
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
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
  const hasAutoPlayedRef = useRef<boolean>(false);
  const audioTracksRef = useRef<AudioTrack[]>([]);
  const isGeneratingRef = useRef<boolean>(false);

  // Abort all ongoing operations for the old chapter
  const abortCurrentOperations = useCallback(() => {
    console.log('[useChapterAudio] Aborting operations for chapter', activeChapterRef.current);
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }

    setAudioTracks([]);
    setCurrentParagraphIndex(0);
    setCurrentChunkIndex(0);
    setIsPlaying(false);
    setIsLoading(false);
    setIsGenerating(false);
    setCurrentTime(0);
    setDuration(0);
    signedUrlsRef.current.clear();
    hasAutoPlayedRef.current = false;
  }, []);

  // Handle chapter changes
  useEffect(() => {
    if (chapterIndex !== activeChapterRef.current) {
      console.log('[useChapterAudio] Chapter changed from', activeChapterRef.current, 'to', chapterIndex);
      abortCurrentOperations();
      activeChapterRef.current = chapterIndex;
      hasAutoPlayedRef.current = false;
    }
  }, [chapterIndex, abortCurrentOperations]);

  // Fetch audio tracks for current chapter
  const fetchAudioTracks = useCallback(async () => {
    if (!bookId || !user) return;
    
    if (chapterIndex !== activeChapterRef.current) return;

    try {
      const { data, error } = await supabase
        .from('audio_tracks')
        .select('id, paragraph_index, chunk_index, total_chunks, audio_url, status, estimated_duration_seconds, actual_duration_seconds')
        .eq('book_id', bookId)
        .eq('chapter_index', chapterIndex)
        .order('paragraph_index', { ascending: true })
        .order('chunk_index', { ascending: true });

      if (error) {
        console.error('[useChapterAudio] Failed to fetch tracks:', error);
        return;
      }

      if (chapterIndex !== activeChapterRef.current) return;

      const tracks = (data || []).map(t => ({
        ...t,
        chunk_index: t.chunk_index ?? 0,
        total_chunks: t.total_chunks ?? 1,
        status: t.status as AudioTrack['status'],
      }));
      setAudioTracks(tracks);
      audioTracksRef.current = tracks;
    } catch (err) {
      console.error('[useChapterAudio] Error fetching tracks:', err);
    }
  }, [bookId, user, chapterIndex]);

  // Initial fetch on mount/chapter change
  useEffect(() => {
    fetchAudioTracks();
  }, [fetchAudioTracks]);

  // Poll RunPod jobs for completion
  const pollAudioJobs = useCallback(async () => {
    if (!bookId || !user) return;
    if (chapterIndex !== activeChapterRef.current) return;

    try {
      const { data, error } = await supabase.functions.invoke('poll-audio-jobs', {
        body: { bookId, chapterIndex },
      });

      if (error) {
        console.error('[useChapterAudio] Poll jobs error:', error);
        return;
      }

      if (data?.completed > 0) {
        console.log(`[useChapterAudio] ${data.completed} jobs completed`);
        await fetchAudioTracks();
      }

      return data;
    } catch (err) {
      console.error('[useChapterAudio] Error polling jobs:', err);
    }
  }, [bookId, user, chapterIndex, fetchAudioTracks]);

  // Calculate future buffer duration
  const calculateFutureBuffer = useCallback((fromParagraphIndex: number): number => {
    let totalSeconds = 0;
    for (const track of audioTracks) {
      if (track.paragraph_index >= fromParagraphIndex) {
        if (track.status === 'GENERATED' || track.status === 'PENDING' || track.status === 'GENERATING') {
          totalSeconds += Number(track.estimated_duration_seconds);
        }
      }
    }
    return totalSeconds / 60;
  }, [audioTracks]);

  // Trigger audio generation for current chapter (fire-and-forget)
  const generateChapterAudio = useCallback(async (targetMinutes: number = INITIAL_BUFFER_MINUTES) => {
    if (!bookId || !user || isGenerating) return;

    if (chapterIndex !== activeChapterRef.current) {
      console.log('[useChapterAudio] Generation aborted - chapter changed');
      return;
    }

    setIsGenerating(true);
    isGeneratingRef.current = true;
    abortControllerRef.current = new AbortController();
    
    // Poll for job completion - this replaces the old approach where edge function waited
    const jobPollInterval = setInterval(async () => {
      if (chapterIndex !== activeChapterRef.current) {
        clearInterval(jobPollInterval);
        return;
      }
      
      // Poll RunPod for job completion
      await pollAudioJobs();
      
      // Refresh tracks to get latest status
      await fetchAudioTracks();
      
      // Check if any tracks are still pending
      const currentTracks = audioTracksRef.current;
      const hasPending = currentTracks.some(t => t.status === 'PENDING');
      
      if (!hasPending && currentTracks.length > 0) {
        console.log('[useChapterAudio] All jobs completed, stopping poll');
        clearInterval(jobPollInterval);
        if (chapterIndex === activeChapterRef.current) {
          setIsGenerating(false);
          isGeneratingRef.current = false;
        }
      }
    }, JOB_POLL_INTERVAL_MS);

    try {
      // Submit jobs - this returns immediately
      const { data, error } = await supabase.functions.invoke('generate-chapter-audio', {
        body: { bookId, chapterIndex, targetDurationMinutes: targetMinutes },
      });

      if (chapterIndex !== activeChapterRef.current) {
        console.log('[useChapterAudio] Generation result ignored - chapter changed');
        clearInterval(jobPollInterval);
        return;
      }

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.submitted > 0) {
        toast.success(`Submitted ${data.submitted} audio jobs`, {
          description: 'Generating audio...',
        });
      } else if (data?.submitted === 0) {
        // No new jobs needed - stop polling
        clearInterval(jobPollInterval);
        setIsGenerating(false);
        isGeneratingRef.current = false;
      }

      await fetchAudioTracks();
    } catch (err) {
      clearInterval(jobPollInterval);
      if (chapterIndex === activeChapterRef.current) {
        console.error('[useChapterAudio] Generation failed:', err);
        toast.error('Failed to generate audio', {
          description: err instanceof Error ? err.message : 'Please try again.',
        });
        setIsGenerating(false);
        isGeneratingRef.current = false;
      }
    }
  }, [bookId, user, chapterIndex, isGenerating, fetchAudioTracks, pollAudioJobs]);

  // Start background polling for buffer maintenance
  const startBufferPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;

    pollingIntervalRef.current = setInterval(async () => {
      if (chapterIndex !== activeChapterRef.current) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        return;
      }

      // Poll for job completion first
      await pollAudioJobs();
      await fetchAudioTracks();

      const futureBuffer = calculateFutureBuffer(currentParagraphIndex);
      console.log(`[useChapterAudio] Buffer check: ${futureBuffer.toFixed(1)} min ahead`);

      if (futureBuffer < ROLLING_BUFFER_MINUTES) {
        console.log('[useChapterAudio] Buffer low, triggering generation');
        await generateChapterAudio(ROLLING_BUFFER_MINUTES);
      }
    }, POLL_INTERVAL_MS);
  }, [chapterIndex, fetchAudioTracks, pollAudioJobs, calculateFutureBuffer, currentParagraphIndex, generateChapterAudio]);

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

  // Find next chunk to play (within same paragraph or next paragraph)
  const findNextChunk = useCallback((currentParaIdx: number, currentChunkIdx: number, tracks: AudioTrack[]): { paragraphIndex: number; chunkIndex: number } | null => {
    // First try next chunk in same paragraph
    const nextChunkInPara = tracks.find(t => 
      t.paragraph_index === currentParaIdx && 
      t.chunk_index === currentChunkIdx + 1 &&
      t.status === 'GENERATED' && 
      t.audio_url
    );
    
    if (nextChunkInPara) {
      return { paragraphIndex: currentParaIdx, chunkIndex: currentChunkIdx + 1 };
    }

    // Check if current paragraph is complete (all chunks generated)
    const currentParaChunks = tracks.filter(t => t.paragraph_index === currentParaIdx);
    const allChunksGenerated = currentParaChunks.length > 0 && 
      currentParaChunks.every(t => t.status === 'GENERATED');

    if (allChunksGenerated) {
      // Move to first chunk of next paragraph
      const nextParaFirstChunk = tracks.find(t => 
        t.paragraph_index === currentParaIdx + 1 && 
        t.chunk_index === 0 &&
        t.status === 'GENERATED' && 
        t.audio_url
      );
      
      if (nextParaFirstChunk) {
        return { paragraphIndex: currentParaIdx + 1, chunkIndex: 0 };
      }
    }

    return null;
  }, []);

  // Load and play a specific chunk
  const loadChunk = useCallback(async (paragraphIndex: number, chunkIndex: number) => {
    const currentTracks = audioTracksRef.current;
    const track = currentTracks.find(t => 
      t.paragraph_index === paragraphIndex && 
      t.chunk_index === chunkIndex
    );
    
    if (!track || track.status !== 'GENERATED' || !track.audio_url) {
      console.log('[useChapterAudio] Chunk not ready:', paragraphIndex, chunkIndex, 'status:', track?.status);
      return false;
    }

    if (chapterIndex !== activeChapterRef.current) return false;

    setIsLoading(true);

    try {
      const signedUrl = await getSignedUrl(track.audio_url);
      if (!signedUrl) {
        setIsLoading(false);
        return false;
      }

      if (chapterIndex !== activeChapterRef.current) {
        setIsLoading(false);
        return false;
      }

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

        // Find next chunk to play
        const currentTracks = audioTracksRef.current;
        const nextChunk = findNextChunk(paragraphIndex, chunkIndex, currentTracks);
        
        if (nextChunk) {
          setCurrentParagraphIndex(nextChunk.paragraphIndex);
          setCurrentChunkIndex(nextChunk.chunkIndex);
          loadChunk(nextChunk.paragraphIndex, nextChunk.chunkIndex);
        } else {
          // No next chunk ready - wait if still generating
          if (isGeneratingRef.current) {
            console.log('[useChapterAudio] Next chunk not ready yet, waiting...');
            const checkInterval = setInterval(() => {
              if (chapterIndex !== activeChapterRef.current) {
                clearInterval(checkInterval);
                return;
              }
              const latestTracks = audioTracksRef.current;
              const latestNext = findNextChunk(paragraphIndex, chunkIndex, latestTracks);
              if (latestNext) {
                clearInterval(checkInterval);
                setCurrentParagraphIndex(latestNext.paragraphIndex);
                setCurrentChunkIndex(latestNext.chunkIndex);
                loadChunk(latestNext.paragraphIndex, latestNext.chunkIndex);
              } else if (!isGeneratingRef.current) {
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
      setCurrentChunkIndex(chunkIndex);

      await audio.play();
      if (chapterIndex === activeChapterRef.current) {
        setIsPlaying(true);
      }

      return true;
    } catch (err) {
      console.error('[useChapterAudio] Error loading chunk:', err);
      if (chapterIndex === activeChapterRef.current) {
        setIsLoading(false);
      }
      return false;
    }
  }, [chapterIndex, getSignedUrl, playbackRate, findNextChunk]);

  // Auto-play when first chunk's audio becomes available
  useEffect(() => {
    if (!isGenerating) return;
    if (hasAutoPlayedRef.current) return;
    if (chapterIndex !== activeChapterRef.current) return;
    if (isPlaying) return;
    
    // Find the first generated chunk (paragraph 0, chunk 0 ideally)
    const firstGeneratedChunk = audioTracks.find(t => 
      t.status === 'GENERATED' && t.audio_url
    );
    
    if (firstGeneratedChunk) {
      console.log('[useChapterAudio] Auto-play triggered - first chunk ready at p', firstGeneratedChunk.paragraph_index, 'c', firstGeneratedChunk.chunk_index);
      hasAutoPlayedRef.current = true;
      
      loadChunk(firstGeneratedChunk.paragraph_index, firstGeneratedChunk.chunk_index).then((success) => {
        if (success && chapterIndex === activeChapterRef.current) {
          startBufferPolling();
        }
      });
    }
  }, [audioTracks, isGenerating, isPlaying, chapterIndex, loadChunk, startBufferPolling]);

  // Play/Pause toggle
  const togglePlay = useCallback(async () => {
    if (!audioRef.current) {
      // Find first generated chunk
      const firstGenerated = audioTracks.find(t => t.status === 'GENERATED' && t.audio_url);
      if (firstGenerated) {
        startBufferPolling();
        await loadChunk(firstGenerated.paragraph_index, firstGenerated.chunk_index);
      } else if (audioTracks.length === 0) {
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
  }, [isPlaying, audioTracks, loadChunk, generateChapterAudio, startBufferPolling, stopBufferPolling]);

  // Skip to next paragraph (first chunk)
  const nextParagraph = useCallback(() => {
    const nextIndex = currentParagraphIndex + 1;
    const nextTrack = audioTracks.find(t => 
      t.paragraph_index === nextIndex && 
      t.chunk_index === 0 &&
      t.status === 'GENERATED'
    );
    if (nextTrack) {
      loadChunk(nextIndex, 0);
    }
  }, [currentParagraphIndex, audioTracks, loadChunk]);

  // Skip to previous paragraph (first chunk)
  const prevParagraph = useCallback(() => {
    if (currentParagraphIndex > 0) {
      const prevIndex = currentParagraphIndex - 1;
      const prevTrack = audioTracks.find(t => 
        t.paragraph_index === prevIndex && 
        t.chunk_index === 0 &&
        t.status === 'GENERATED'
      );
      if (prevTrack) {
        loadChunk(prevIndex, 0);
      }
    } else if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  }, [currentParagraphIndex, audioTracks, loadChunk]);

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

  // Handle visibility changes - resume audio when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        console.log('[useChapterAudio] Tab became visible, checking audio state...');
        
        // Resume audio playback if it was playing
        if (audioRef.current && isPlaying) {
          try {
            // Check if audio is paused due to tab backgrounding
            if (audioRef.current.paused) {
              console.log('[useChapterAudio] Resuming paused audio...');
              await audioRef.current.play();
            }
          } catch (err) {
            console.error('[useChapterAudio] Failed to resume audio:', err);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortCurrentOperations();
    };
  }, [abortCurrentOperations]);

  // Check if we have any generated audio for this chapter
  const hasGeneratedAudio = audioTracks.some(t => t.status === 'GENERATED');
  const pendingCount = audioTracks.filter(t => t.status === 'PENDING').length;
  const generatingCount = audioTracks.filter(t => t.status === 'GENERATING' || t.status === 'PENDING').length;
  const generatedCount = audioTracks.filter(t => t.status === 'GENERATED').length;
  const totalChunks = audioTracks.length;

  return {
    audioTracks,
    currentParagraphIndex,
    currentChunkIndex,
    isPlaying,
    isLoading,
    isGenerating,
    currentTime,
    duration,
    playbackRate,
    hasGeneratedAudio,
    pendingCount,
    generatingCount,
    generatedCount,
    totalParagraphs: totalChunks,
    togglePlay,
    nextParagraph,
    prevParagraph,
    seek,
    changePlaybackRate,
    generateChapterAudio,
  };
}
