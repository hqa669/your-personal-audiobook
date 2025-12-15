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
const BUFFER_CHECK_INTERVAL_MS = 5000; // Check buffer every 5 seconds
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
  const bufferCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeChapterRef = useRef<number>(chapterIndex);
  const hasAutoPlayedRef = useRef<boolean>(false);
  const audioTracksRef = useRef<AudioTrack[]>([]);
  const currentParagraphIndexRef = useRef<number>(0);
  const isGeneratingRef = useRef<boolean>(false);
  const bufferMaintenanceActiveRef = useRef<boolean>(false);

  // Keep refs in sync
  useEffect(() => {
    currentParagraphIndexRef.current = currentParagraphIndex;
  }, [currentParagraphIndex]);

  useEffect(() => {
    audioTracksRef.current = audioTracks;
  }, [audioTracks]);

  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  // Abort all ongoing operations for the old chapter
  const abortCurrentOperations = useCallback(() => {
    console.log('[useChapterAudio] Aborting operations for chapter', activeChapterRef.current);
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (bufferCheckIntervalRef.current) {
      clearInterval(bufferCheckIntervalRef.current);
      bufferCheckIntervalRef.current = null;
    }

    if (jobPollIntervalRef.current) {
      clearInterval(jobPollIntervalRef.current);
      jobPollIntervalRef.current = null;
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
    bufferMaintenanceActiveRef.current = false;
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
    if (!bookId || !user) return [];
    
    if (chapterIndex !== activeChapterRef.current) return [];

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
        return [];
      }

      if (chapterIndex !== activeChapterRef.current) return [];

      const tracks = (data || []).map(t => ({
        ...t,
        chunk_index: t.chunk_index ?? 0,
        total_chunks: t.total_chunks ?? 1,
        status: t.status as AudioTrack['status'],
      }));
      setAudioTracks(tracks);
      audioTracksRef.current = tracks;
      return tracks;
    } catch (err) {
      console.error('[useChapterAudio] Error fetching tracks:', err);
      return [];
    }
  }, [bookId, user, chapterIndex]);

  // Initial fetch on mount/chapter change
  useEffect(() => {
    fetchAudioTracks();
  }, [fetchAudioTracks]);

  // Poll RunPod jobs for completion
  const pollAudioJobs = useCallback(async () => {
    if (!bookId || !user) return null;
    if (chapterIndex !== activeChapterRef.current) return null;

    try {
      const { data, error } = await supabase.functions.invoke('poll-audio-jobs', {
        body: { bookId, chapterIndex },
      });

      if (error) {
        console.error('[useChapterAudio] Poll jobs error:', error);
        return null;
      }

      if (data?.completed > 0) {
        console.log(`[useChapterAudio] ${data.completed} jobs completed`);
      }

      return data;
    } catch (err) {
      console.error('[useChapterAudio] Error polling jobs:', err);
      return null;
    }
  }, [bookId, user, chapterIndex]);

  /**
   * Calculate future buffer duration from current playback position
   * Includes GENERATED + PENDING + GENERATING (optimistic)
   */
  const calculateFutureBufferMinutes = useCallback((tracks: AudioTrack[], fromParagraphIndex: number): number => {
    let totalSeconds = 0;
    for (const track of tracks) {
      if (track.paragraph_index >= fromParagraphIndex) {
        if (track.status === 'GENERATED' || track.status === 'PENDING' || track.status === 'GENERATING') {
          totalSeconds += Number(track.estimated_duration_seconds);
        }
      }
    }
    return totalSeconds / 60;
  }, []);

  /**
   * Request generation for target duration - fire and forget
   * This does NOT block; it returns immediately after submitting jobs
   */
  const requestGeneration = useCallback(async (targetMinutes: number): Promise<{ submitted: number } | null> => {
    if (!bookId || !user) return null;
    if (chapterIndex !== activeChapterRef.current) return null;

    try {
      const { data, error } = await supabase.functions.invoke('generate-chapter-audio', {
        body: { bookId, chapterIndex, targetDurationMinutes: targetMinutes },
      });

      if (error) {
        console.error('[useChapterAudio] Generation request error:', error);
        return null;
      }
      if (data?.error) {
        console.error('[useChapterAudio] Generation error:', data.error);
        return null;
      }

      return { submitted: data?.submitted || 0 };
    } catch (err) {
      console.error('[useChapterAudio] Generation request failed:', err);
      return null;
    }
  }, [bookId, user, chapterIndex]);

  /**
   * CORE: Ensure buffer loop - runs continuously to maintain 15-minute buffer
   * This is the critical function that must run repeatedly
   */
  const ensureBuffer = useCallback(async () => {
    if (chapterIndex !== activeChapterRef.current) return;

    // Poll for job completions
    await pollAudioJobs();
    
    // Refresh tracks
    const tracks = await fetchAudioTracks();
    if (!tracks || chapterIndex !== activeChapterRef.current) return;

    const currentIdx = currentParagraphIndexRef.current;
    const bufferMinutes = calculateFutureBufferMinutes(tracks, currentIdx);
    
    console.log(`[useChapterAudio] Buffer check: ${bufferMinutes.toFixed(1)} min (need ${ROLLING_BUFFER_MINUTES} min, from p${currentIdx})`);

    // Check if we have pending jobs
    const hasPending = tracks.some(t => t.status === 'PENDING');
    
    // If buffer is insufficient and no pending jobs, request more generation
    if (bufferMinutes < ROLLING_BUFFER_MINUTES && !hasPending) {
      console.log('[useChapterAudio] Buffer low and no pending jobs, requesting generation');
      setIsGenerating(true);
      
      const result = await requestGeneration(ROLLING_BUFFER_MINUTES);
      
      if (result && result.submitted > 0) {
        toast.info(`Generating ${result.submitted} audio chunks...`);
      } else if (result && result.submitted === 0) {
        // No more paragraphs to generate
        setIsGenerating(false);
      }
    } else if (hasPending) {
      setIsGenerating(true);
    } else if (bufferMinutes >= ROLLING_BUFFER_MINUTES) {
      // Buffer is sufficient
      setIsGenerating(false);
    }
  }, [chapterIndex, pollAudioJobs, fetchAudioTracks, calculateFutureBufferMinutes, requestGeneration]);

  /**
   * Start buffer maintenance loop
   * This must run continuously while playback is active
   */
  const startBufferMaintenance = useCallback(() => {
    if (bufferMaintenanceActiveRef.current) return;
    
    bufferMaintenanceActiveRef.current = true;
    console.log('[useChapterAudio] Starting buffer maintenance loop');

    // Immediate first check
    ensureBuffer();

    // Continuous buffer check interval
    if (bufferCheckIntervalRef.current) {
      clearInterval(bufferCheckIntervalRef.current);
    }
    bufferCheckIntervalRef.current = setInterval(() => {
      if (chapterIndex !== activeChapterRef.current) {
        if (bufferCheckIntervalRef.current) {
          clearInterval(bufferCheckIntervalRef.current);
          bufferCheckIntervalRef.current = null;
        }
        bufferMaintenanceActiveRef.current = false;
        return;
      }
      ensureBuffer();
    }, BUFFER_CHECK_INTERVAL_MS);
  }, [ensureBuffer, chapterIndex]);

  /**
   * Stop buffer maintenance loop
   */
  const stopBufferMaintenance = useCallback(() => {
    console.log('[useChapterAudio] Stopping buffer maintenance');
    
    if (bufferCheckIntervalRef.current) {
      clearInterval(bufferCheckIntervalRef.current);
      bufferCheckIntervalRef.current = null;
    }
    bufferMaintenanceActiveRef.current = false;
  }, []);

  /**
   * Initial generation trigger - called by Generate Voice button
   */
  const generateChapterAudio = useCallback(async (targetMinutes: number = INITIAL_BUFFER_MINUTES) => {
    if (!bookId || !user) return;
    if (chapterIndex !== activeChapterRef.current) return;

    setIsGenerating(true);
    
    const result = await requestGeneration(targetMinutes);
    
    if (result && result.submitted > 0) {
      toast.success(`Submitted ${result.submitted} audio jobs`, {
        description: 'Generating audio...',
      });
      
      // Start buffer maintenance to poll for completion and maintain buffer
      startBufferMaintenance();
    } else if (result && result.submitted === 0) {
      setIsGenerating(false);
      toast.info('Audio already generated');
    } else {
      setIsGenerating(false);
      toast.error('Failed to start generation');
    }
  }, [bookId, user, chapterIndex, requestGeneration, startBufferMaintenance]);

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
        const latestTracks = audioTracksRef.current;
        const nextChunk = findNextChunk(paragraphIndex, chunkIndex, latestTracks);
        
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
          startBufferMaintenance();
        }
      });
    }
  }, [audioTracks, isGenerating, isPlaying, chapterIndex, loadChunk, startBufferMaintenance]);

  // Play/Pause toggle
  const togglePlay = useCallback(async () => {
    if (!audioRef.current) {
      // Find first generated chunk
      const firstGenerated = audioTracks.find(t => t.status === 'GENERATED' && t.audio_url);
      if (firstGenerated) {
        startBufferMaintenance();
        await loadChunk(firstGenerated.paragraph_index, firstGenerated.chunk_index);
      } else if (audioTracks.length === 0) {
        await generateChapterAudio(INITIAL_BUFFER_MINUTES);
      }
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      stopBufferMaintenance();
    } else {
      await audioRef.current.play();
      setIsPlaying(true);
      startBufferMaintenance();
    }
  }, [isPlaying, audioTracks, loadChunk, generateChapterAudio, startBufferMaintenance, stopBufferMaintenance]);

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
            if (audioRef.current.paused) {
              console.log('[useChapterAudio] Resuming paused audio...');
              await audioRef.current.play();
            }
          } catch (err) {
            console.error('[useChapterAudio] Failed to resume audio:', err);
          }
        }
        
        // Re-run buffer check
        if (bufferMaintenanceActiveRef.current) {
          ensureBuffer();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying, ensureBuffer]);

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
