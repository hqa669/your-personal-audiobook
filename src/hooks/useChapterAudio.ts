import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface AudioTrack {
  id: string;
  paragraph_index: number;
  chunk_index: number;
  total_chunks: number;
  audio_url: string | null;
  status: 'NOT_GENERATED' | 'PENDING' | 'GENERATING' | 'GENERATED';
  estimated_duration_seconds: number;
}

const INITIAL_BUFFER_MINUTES = 5;
const JOB_POLL_INTERVAL_MS = 3000;

export function useChapterAudio(bookId: string | undefined, chapterIndex: number) {
  const { user } = useAuth();
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isPaused, setIsPaused] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const signedUrlsRef = useRef<Map<string, string>>(new Map());
  const activeChapterRef = useRef<number>(chapterIndex);
  const jobPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waitingForAudioRef = useRef<boolean>(false);
  const hasAutoPlayedRef = useRef<boolean>(false);

  // Abort operations and reset state
  const abortCurrentOperations = useCallback(() => {
    console.log('[useChapterAudio] Aborting operations');
    
    if (jobPollIntervalRef.current) {
      clearInterval(jobPollIntervalRef.current);
      jobPollIntervalRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }

    setAudioTracks([]);
    setCurrentParagraphIndex(0);
    setCurrentChunkIndex(0);
    setIsPlaying(false);
    setIsLoading(false);
    setIsGenerating(false);
    setIsPaused(false);
    signedUrlsRef.current.clear();
    waitingForAudioRef.current = false;
    hasAutoPlayedRef.current = false;
  }, []);

  // Handle chapter changes
  useEffect(() => {
    if (chapterIndex !== activeChapterRef.current) {
      console.log('[useChapterAudio] Chapter changed:', activeChapterRef.current, '->', chapterIndex);
      abortCurrentOperations();
      activeChapterRef.current = chapterIndex;
    }
  }, [chapterIndex, abortCurrentOperations]);

  // Fetch audio tracks
  const fetchAudioTracks = useCallback(async () => {
    if (!bookId || !user) return [];
    if (chapterIndex !== activeChapterRef.current) return [];

    try {
      const { data, error } = await supabase
        .from('audio_tracks')
        .select('id, paragraph_index, chunk_index, total_chunks, audio_url, status, estimated_duration_seconds')
        .eq('book_id', bookId)
        .eq('chapter_index', chapterIndex)
        .order('paragraph_index', { ascending: true })
        .order('chunk_index', { ascending: true });

      if (error) {
        console.error('[useChapterAudio] Fetch error:', error);
        return [];
      }

      const tracks = (data || []).map(t => ({
        ...t,
        status: t.status as AudioTrack['status'],
      }));
      
      setAudioTracks(tracks);
      return tracks;
    } catch (err) {
      console.error('[useChapterAudio] Fetch failed:', err);
      return [];
    }
  }, [bookId, user, chapterIndex]);

  // Initial fetch
  useEffect(() => {
    fetchAudioTracks();
  }, [fetchAudioTracks]);

  // Subscribe to realtime updates for audio_tracks
  useEffect(() => {
    if (!bookId || !user) return;

    const channel = supabase
      .channel(`audio_tracks_${bookId}_${chapterIndex}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'audio_tracks',
          filter: `book_id=eq.${bookId}`,
        },
        (payload: RealtimePostgresChangesPayload<AudioTrack>) => {
          console.log('[useChapterAudio] Realtime update:', payload.eventType);
          
          // Refetch all tracks on any change
          fetchAudioTracks().then(tracks => {
            // Check if first chunk is ready for auto-play
            if (!hasAutoPlayedRef.current && tracks.length > 0) {
              const firstChunk = tracks.find(t => t.paragraph_index === 0 && t.chunk_index === 0);
              if (firstChunk?.status === 'GENERATED' && firstChunk.audio_url) {
                console.log('[useChapterAudio] First chunk ready, auto-playing');
                hasAutoPlayedRef.current = true;
                playChunk(0, 0, tracks);
              }
            }
            
            // If waiting for next audio, check if it's ready
            if (waitingForAudioRef.current && isPaused) {
              const nextTrack = tracks.find(
                t => t.paragraph_index === currentParagraphIndex && t.chunk_index === currentChunkIndex
              );
              if (nextTrack?.status === 'GENERATED' && nextTrack.audio_url) {
                console.log('[useChapterAudio] Waited audio ready, resuming');
                waitingForAudioRef.current = false;
                setIsPaused(false);
                playChunk(currentParagraphIndex, currentChunkIndex, tracks);
              }
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bookId, user, chapterIndex, fetchAudioTracks, isPaused, currentParagraphIndex, currentChunkIndex]);

  // Poll for job completion (backup to realtime)
  const pollJobs = useCallback(async () => {
    if (!bookId || !user) return;
    if (chapterIndex !== activeChapterRef.current) return;

    try {
      await supabase.functions.invoke('poll-audio-jobs', {
        body: { bookId, chapterIndex },
      });
    } catch (err) {
      console.error('[useChapterAudio] Poll error:', err);
    }
  }, [bookId, user, chapterIndex]);

  // Get signed URL for audio file
  const getSignedUrl = useCallback(async (audioPath: string): Promise<string | null> => {
    if (signedUrlsRef.current.has(audioPath)) {
      return signedUrlsRef.current.get(audioPath)!;
    }

    try {
      const { data, error } = await supabase.storage
        .from('audio-files')
        .createSignedUrl(audioPath, 3600);

      if (error || !data?.signedUrl) return null;
      signedUrlsRef.current.set(audioPath, data.signedUrl);
      return data.signedUrl;
    } catch {
      return null;
    }
  }, []);

  // Find next chunk (within paragraph or next paragraph)
  const findNextChunk = useCallback((paraIdx: number, chunkIdx: number, tracks: AudioTrack[]): { para: number; chunk: number } | null => {
    // Try next chunk in same paragraph
    const currentParaChunks = tracks.filter(t => t.paragraph_index === paraIdx);
    const maxChunk = Math.max(...currentParaChunks.map(t => t.chunk_index), -1);
    
    if (chunkIdx < maxChunk) {
      return { para: paraIdx, chunk: chunkIdx + 1 };
    }
    
    // Move to next paragraph's first chunk
    const nextParaExists = tracks.some(t => t.paragraph_index === paraIdx + 1);
    if (nextParaExists) {
      return { para: paraIdx + 1, chunk: 0 };
    }
    
    return null;
  }, []);

  // Play a specific chunk
  const playChunk = useCallback(async (paraIdx: number, chunkIdx: number, tracks?: AudioTrack[]) => {
    const currentTracks = tracks || audioTracks;
    const track = currentTracks.find(t => t.paragraph_index === paraIdx && t.chunk_index === chunkIdx);
    
    if (!track || track.status !== 'GENERATED' || !track.audio_url) {
      console.log('[useChapterAudio] Chunk not ready:', paraIdx, chunkIdx, track?.status);
      
      // Pause and wait for this audio
      waitingForAudioRef.current = true;
      setIsPaused(true);
      setIsPlaying(false);
      setCurrentParagraphIndex(paraIdx);
      setCurrentChunkIndex(chunkIdx);
      return;
    }

    if (chapterIndex !== activeChapterRef.current) return;

    setIsLoading(true);
    
    try {
      const signedUrl = await getSignedUrl(track.audio_url);
      if (!signedUrl || chapterIndex !== activeChapterRef.current) {
        setIsLoading(false);
        return;
      }

      // Create or reuse audio element
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      
      const audio = audioRef.current;
      audio.src = signedUrl;
      audio.playbackRate = playbackRate;
      
      // Handle audio end - play next chunk
      audio.onended = () => {
        const next = findNextChunk(paraIdx, chunkIdx, currentTracks);
        if (next) {
          setCurrentParagraphIndex(next.para);
          setCurrentChunkIndex(next.chunk);
          playChunk(next.para, next.chunk, currentTracks);
        } else {
          // End of chapter
          setIsPlaying(false);
          console.log('[useChapterAudio] Chapter audio complete');
        }
      };
      
      audio.onerror = () => {
        console.error('[useChapterAudio] Audio playback error');
        setIsLoading(false);
        setIsPlaying(false);
      };
      
      await audio.play();
      
      setCurrentParagraphIndex(paraIdx);
      setCurrentChunkIndex(chunkIdx);
      setIsPlaying(true);
      setIsPaused(false);
      setIsLoading(false);
      waitingForAudioRef.current = false;
      
    } catch (err) {
      console.error('[useChapterAudio] Play error:', err);
      setIsLoading(false);
    }
  }, [audioTracks, chapterIndex, playbackRate, getSignedUrl, findNextChunk]);

  // Generate chapter audio
  const generateChapterAudio = useCallback(async (targetMinutes: number = INITIAL_BUFFER_MINUTES) => {
    if (!bookId || !user) return;
    if (chapterIndex !== activeChapterRef.current) return;

    setIsGenerating(true);
    hasAutoPlayedRef.current = false;

    try {
      const { data, error } = await supabase.functions.invoke('generate-chapter-audio', {
        body: { bookId, chapterIndex, targetDurationMinutes: targetMinutes },
      });

      if (error) {
        console.error('[useChapterAudio] Generate error:', error);
        toast.error('Failed to start generation');
        setIsGenerating(false);
        return;
      }

      if (data?.submitted > 0) {
        toast.success(`Generating ${data.submitted} audio chunks...`);
        
        // Start polling for job completion
        if (jobPollIntervalRef.current) {
          clearInterval(jobPollIntervalRef.current);
        }
        jobPollIntervalRef.current = setInterval(pollJobs, JOB_POLL_INTERVAL_MS);
      } else {
        toast.info('Audio already generated');
        setIsGenerating(false);
        // Fetch tracks and start playing if available
        const tracks = await fetchAudioTracks();
        if (tracks.length > 0) {
          const firstChunk = tracks.find(t => t.paragraph_index === 0 && t.chunk_index === 0);
          if (firstChunk?.status === 'GENERATED') {
            playChunk(0, 0, tracks);
          }
        }
      }
    } catch (err) {
      console.error('[useChapterAudio] Generate failed:', err);
      toast.error('Generation failed');
      setIsGenerating(false);
    }
  }, [bookId, user, chapterIndex, pollJobs, fetchAudioTracks, playChunk]);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (!audioRef.current) {
      // Start from beginning or current position
      playChunk(currentParagraphIndex, currentChunkIndex);
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying, currentParagraphIndex, currentChunkIndex, playChunk]);

  // Change playback rate
  const changePlaybackRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }, []);

  // Navigate paragraphs
  const nextParagraph = useCallback(() => {
    const next = findNextChunk(currentParagraphIndex, currentChunkIndex, audioTracks);
    if (next) {
      playChunk(next.para, next.chunk);
    }
  }, [currentParagraphIndex, currentChunkIndex, audioTracks, findNextChunk, playChunk]);

  const prevParagraph = useCallback(() => {
    if (currentChunkIndex > 0) {
      playChunk(currentParagraphIndex, currentChunkIndex - 1);
    } else if (currentParagraphIndex > 0) {
      const prevParaChunks = audioTracks.filter(t => t.paragraph_index === currentParagraphIndex - 1);
      const maxChunk = Math.max(...prevParaChunks.map(t => t.chunk_index), 0);
      playChunk(currentParagraphIndex - 1, maxChunk);
    }
  }, [currentParagraphIndex, currentChunkIndex, audioTracks, playChunk]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (jobPollIntervalRef.current) {
        clearInterval(jobPollIntervalRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  // Computed values
  const hasGeneratedAudio = audioTracks.some(t => t.status === 'GENERATED');
  const generatedCount = audioTracks.filter(t => t.status === 'GENERATED').length;
  const totalParagraphs = new Set(audioTracks.map(t => t.paragraph_index)).size;

  return {
    isPlaying,
    isLoading,
    isGenerating,
    isPaused,
    playbackRate,
    currentParagraphIndex,
    hasGeneratedAudio,
    generatedCount,
    totalParagraphs,
    togglePlay,
    nextParagraph,
    prevParagraph,
    changePlaybackRate,
    generateChapterAudio,
  };
}
