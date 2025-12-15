-- Allow edge functions (service role) to insert audio tracks
CREATE POLICY "Service can insert audio tracks"
ON public.audio_tracks
FOR INSERT
TO service_role
WITH CHECK (true);

-- Add storage policy for audio files upload by service role
CREATE POLICY "Service can upload audio files"
ON storage.objects
FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'audio-files');