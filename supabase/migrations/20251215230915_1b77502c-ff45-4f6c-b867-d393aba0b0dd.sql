-- Drop the existing status check constraint and add a new one that includes PENDING
ALTER TABLE public.audio_tracks DROP CONSTRAINT IF EXISTS audio_tracks_status_check;

ALTER TABLE public.audio_tracks 
ADD CONSTRAINT audio_tracks_status_check 
CHECK (status IN ('NOT_GENERATED', 'GENERATING', 'GENERATED', 'PENDING', 'FAILED'));