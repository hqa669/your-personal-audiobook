-- Drop the old constraint that's preventing multiple chunks per paragraph
ALTER TABLE public.audio_tracks DROP CONSTRAINT IF EXISTS audio_tracks_book_id_chapter_index_paragraph_index_key;