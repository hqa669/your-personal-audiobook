-- Add ON DELETE CASCADE to public_book_chapters foreign key
ALTER TABLE public.public_book_chapters
DROP CONSTRAINT public_book_chapters_book_id_fkey;

ALTER TABLE public.public_book_chapters
ADD CONSTRAINT public_book_chapters_book_id_fkey
FOREIGN KEY (book_id) REFERENCES public.public_books(id)
ON DELETE CASCADE;