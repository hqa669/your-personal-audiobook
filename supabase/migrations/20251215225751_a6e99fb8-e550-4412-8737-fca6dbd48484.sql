-- Add runpod_job_id column to track pending jobs
ALTER TABLE public.audio_tracks ADD COLUMN IF NOT EXISTS runpod_job_id text;

-- Create index for efficient pending job queries
CREATE INDEX IF NOT EXISTS idx_audio_tracks_pending_jobs ON public.audio_tracks(status, runpod_job_id) WHERE status = 'PENDING';