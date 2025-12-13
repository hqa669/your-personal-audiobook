-- Add unique constraint for book_id + user_id combination for upsert support
ALTER TABLE public.playback_progress 
ADD CONSTRAINT playback_progress_book_user_unique UNIQUE (book_id, user_id);