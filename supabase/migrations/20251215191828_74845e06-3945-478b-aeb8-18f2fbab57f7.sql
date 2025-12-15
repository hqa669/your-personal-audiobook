-- Drop existing audio_tracks table and recreate with paragraph-level tracking
DROP TABLE IF EXISTS public.audio_tracks;

-- Create audio_tracks table with paragraph-level tracking and state machine
CREATE TABLE public.audio_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  chapter_index integer NOT NULL,
  paragraph_index integer NOT NULL,
  text text NOT NULL,
  estimated_duration_seconds numeric(10, 2) NOT NULL,
  actual_duration_seconds numeric(10, 2),
  audio_url text,
  status text NOT NULL DEFAULT 'NOT_GENERATED' CHECK (status IN ('NOT_GENERATED', 'GENERATING', 'GENERATED')),
  generated_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(book_id, chapter_index, paragraph_index)
);

-- Enable RLS
ALTER TABLE public.audio_tracks ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view audio for their own books
CREATE POLICY "Users can view audio for own books"
  ON public.audio_tracks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.books
      WHERE books.id = audio_tracks.book_id
      AND books.user_id = auth.uid()
    )
  );

-- RLS: Service role can insert/update audio tracks
CREATE POLICY "Service can insert audio tracks"
  ON public.audio_tracks FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service can update audio tracks"
  ON public.audio_tracks FOR UPDATE
  USING (true);

-- Index for efficient queries
CREATE INDEX audio_tracks_book_chapter_idx ON public.audio_tracks(book_id, chapter_index);
CREATE INDEX audio_tracks_status_idx ON public.audio_tracks(book_id, chapter_index, status);