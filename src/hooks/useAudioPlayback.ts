import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface AudioTrack {
  id: string;
  audio_url: string;
  duration_seconds: number | null;
}

export function useAudioPlayback(bookId: string | undefined) {
  const { user } = useAuth();
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const signedUrlsRef = useRef<Map<string, string>>(new Map());

  // Fetch audio tracks for this book
  useEffect(() => {
    async function fetchAudioTracks() {
      if (!bookId || !user) return;
      
      try {
        const { data, error } = await supabase
          .from('audio_tracks')
          .select('id, audio_url, duration_seconds')
          .eq('book_id', bookId)
          .order('generated_at', { ascending: true });
        
        if (error) {
          console.error('Failed to fetch audio tracks:', error);
          return;
        }
        
        setAudioTracks(data || []);
      } catch (err) {
        console.error('Error fetching audio tracks:', err);
      }
    }
    
    fetchAudioTracks();
  }, [bookId, user]);

  // Get signed URL for an audio file
  const getSignedUrl = useCallback(async (audioPath: string): Promise<string | null> => {
    // Check cache first
    if (signedUrlsRef.current.has(audioPath)) {
      return signedUrlsRef.current.get(audioPath)!;
    }
    
    try {
      const { data, error } = await supabase.storage
        .from('audio-files')
        .createSignedUrl(audioPath, 3600); // 1 hour expiry
      
      if (error || !data?.signedUrl) {
        console.error('Failed to get signed URL:', error);
        return null;
      }
      
      signedUrlsRef.current.set(audioPath, data.signedUrl);
      return data.signedUrl;
    } catch (err) {
      console.error('Error getting signed URL:', err);
      return null;
    }
  }, []);

  // Load and play a specific track
  const loadTrack = useCallback(async (trackIndex: number) => {
    if (trackIndex < 0 || trackIndex >= audioTracks.length) return;
    
    const track = audioTracks[trackIndex];
    setIsLoading(true);
    
    try {
      const signedUrl = await getSignedUrl(track.audio_url);
      if (!signedUrl) {
        console.error('Could not get signed URL for track');
        setIsLoading(false);
        return;
      }
      
      // Clean up previous audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      
      // Create new audio element
      const audio = new Audio(signedUrl);
      audio.playbackRate = playbackRate;
      
      audio.addEventListener('loadedmetadata', () => {
        setDuration(audio.duration);
        setIsLoading(false);
      });
      
      audio.addEventListener('timeupdate', () => {
        setCurrentTime(audio.currentTime);
      });
      
      audio.addEventListener('ended', () => {
        // Auto-advance to next track
        if (trackIndex < audioTracks.length - 1) {
          setCurrentTrackIndex(trackIndex + 1);
          loadTrack(trackIndex + 1);
        } else {
          setIsPlaying(false);
        }
      });
      
      audio.addEventListener('error', (e) => {
        console.error('Audio playback error:', e);
        setIsLoading(false);
      });
      
      audioRef.current = audio;
      setCurrentTrackIndex(trackIndex);
      
      // Start playing
      await audio.play();
      setIsPlaying(true);
    } catch (err) {
      console.error('Error loading track:', err);
      setIsLoading(false);
    }
  }, [audioTracks, getSignedUrl, playbackRate]);

  // Play/Pause toggle
  const togglePlay = useCallback(async () => {
    if (!audioRef.current) {
      // First time playing - load first track
      if (audioTracks.length > 0) {
        await loadTrack(0);
      }
      return;
    }
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      await audioRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying, audioTracks, loadTrack]);

  // Skip to next track
  const nextTrack = useCallback(() => {
    if (currentTrackIndex < audioTracks.length - 1) {
      loadTrack(currentTrackIndex + 1);
    }
  }, [currentTrackIndex, audioTracks.length, loadTrack]);

  // Skip to previous track
  const prevTrack = useCallback(() => {
    if (currentTrackIndex > 0) {
      loadTrack(currentTrackIndex - 1);
    } else if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  }, [currentTrackIndex, loadTrack]);

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
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  return {
    audioTracks,
    currentTrackIndex,
    totalTracks: audioTracks.length,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    playbackRate,
    togglePlay,
    nextTrack,
    prevTrack,
    seek,
    changePlaybackRate,
    hasAudioTracks: audioTracks.length > 0,
  };
}
