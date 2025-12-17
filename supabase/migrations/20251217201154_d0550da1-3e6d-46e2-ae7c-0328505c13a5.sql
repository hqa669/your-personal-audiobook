-- 1. Add missing columns to public_books table
ALTER TABLE public.public_books 
ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;

-- 2. Create public_book_chapters table for pre-generated audio
CREATE TABLE public.public_book_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.public_books(id) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  sync_url TEXT,
  duration_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(book_id, chapter_index)
);

-- Enable RLS on public_book_chapters
ALTER TABLE public.public_book_chapters ENABLE ROW LEVEL SECURITY;

-- Public can read chapters
CREATE POLICY "Anyone can view public book chapters"
ON public.public_book_chapters
FOR SELECT
USING (true);

-- 3. Create user_public_books junction table (user's library of public books)
CREATE TABLE public.user_public_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  public_book_id UUID NOT NULL REFERENCES public.public_books(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, public_book_id)
);

-- Enable RLS on user_public_books
ALTER TABLE public.user_public_books ENABLE ROW LEVEL SECURITY;

-- Users can view their own library
CREATE POLICY "Users can view own public book library"
ON public.user_public_books
FOR SELECT
USING (auth.uid() = user_id);

-- Users can add books to their library
CREATE POLICY "Users can add public books to library"
ON public.user_public_books
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can remove books from their library
CREATE POLICY "Users can remove public books from library"
ON public.user_public_books
FOR DELETE
USING (auth.uid() = user_id);

-- 4. Create app_role enum and user_roles table for admin access
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 5. Create security definer function to check roles (prevents recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Users can view their own roles
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

-- 6. Admin policies for public_books (INSERT/UPDATE/DELETE)
CREATE POLICY "Admins can insert public books"
ON public.public_books
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update public books"
ON public.public_books
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete public books"
ON public.public_books
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- 7. Admin policies for public_book_chapters
CREATE POLICY "Admins can insert public book chapters"
ON public.public_book_chapters
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update public book chapters"
ON public.public_book_chapters
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete public book chapters"
ON public.public_book_chapters
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- 8. Create public_library storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('public-library', 'public-library', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for public-library bucket
CREATE POLICY "Anyone can view public library files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'public-library');

CREATE POLICY "Admins can upload to public library"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'public-library' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update public library files"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'public-library' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete public library files"
ON storage.objects
FOR DELETE
USING (bucket_id = 'public-library' AND public.has_role(auth.uid(), 'admin'));

-- 9. Create playback_progress table for public books if not exists
CREATE TABLE IF NOT EXISTS public.public_book_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  public_book_id UUID NOT NULL REFERENCES public.public_books(id) ON DELETE CASCADE,
  chapter_index INTEGER DEFAULT 0,
  position_seconds INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, public_book_id)
);

ALTER TABLE public.public_book_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own public book progress"
ON public.public_book_progress
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own public book progress"
ON public.public_book_progress
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own public book progress"
ON public.public_book_progress
FOR UPDATE
USING (auth.uid() = user_id);