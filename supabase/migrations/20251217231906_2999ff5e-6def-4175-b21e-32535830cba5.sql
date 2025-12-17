-- Enable realtime for audio_tracks table for instant updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.audio_tracks;