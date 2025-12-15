-- Add chunk_index column to audio_tracks for sub-chunk audio generation
-- A paragraph can now have multiple audio chunks (chunk_index 0, 1, 2, ...)
-- Default to 0 for single-chunk paragraphs (backward compatible)
ALTER TABLE public.audio_tracks 
ADD COLUMN IF NOT EXISTS chunk_index integer DEFAULT 0 NOT NULL;

-- Add total_chunks column to know how many chunks a paragraph has
ALTER TABLE public.audio_tracks 
ADD COLUMN IF NOT EXISTS total_chunks integer DEFAULT 1 NOT NULL;

-- Drop the old unique constraint if it exists
ALTER TABLE public.audio_tracks DROP CONSTRAINT IF EXISTS audio_tracks_book_chapter_paragraph_key;

-- Create new unique constraint including chunk_index
ALTER TABLE public.audio_tracks 
ADD CONSTRAINT audio_tracks_book_chapter_paragraph_chunk_key 
UNIQUE (book_id, chapter_index, paragraph_index, chunk_index);

-- Add index for efficient querying of chunks for a paragraph
CREATE INDEX IF NOT EXISTS audio_tracks_paragraph_chunks_idx 
ON public.audio_tracks(book_id, chapter_index, paragraph_index, chunk_index);