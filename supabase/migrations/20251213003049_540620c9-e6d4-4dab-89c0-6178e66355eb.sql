-- Create book status enum
CREATE TYPE public.book_status AS ENUM ('uploaded', 'processing', 'ready', 'failed');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Trigger for new user profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, new.raw_user_meta_data ->> 'display_name');
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Create books table
CREATE TABLE public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  cover_url TEXT,
  epub_url TEXT NOT NULL,
  status book_status DEFAULT 'uploaded' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on books
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

-- RLS Policies for books
CREATE POLICY "Users can view own books"
  ON public.books FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own books"
  ON public.books FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own books"
  ON public.books FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own books"
  ON public.books FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX books_user_id_idx ON public.books(user_id);

-- Create audio_tracks table
CREATE TABLE public.audio_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  audio_url TEXT NOT NULL,
  duration_seconds INTEGER,
  voice_type TEXT DEFAULT 'default',
  generated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on audio_tracks
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

-- Index for audio_tracks
CREATE INDEX audio_tracks_book_id_idx ON public.audio_tracks(book_id);

-- Create playback_progress table
CREATE TABLE public.playback_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  chapter_index INTEGER DEFAULT 0,
  position_seconds INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, book_id)
);

-- Enable RLS on playback_progress
ALTER TABLE public.playback_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies for playback_progress
CREATE POLICY "Users can view own progress"
  ON public.playback_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress"
  ON public.playback_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
  ON public.playback_progress FOR UPDATE
  USING (auth.uid() = user_id);

-- Index for playback_progress
CREATE INDEX playback_progress_user_book_idx ON public.playback_progress(user_id, book_id);

-- Create public_books table (for Discovery)
CREATE TABLE public.public_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT,
  genre TEXT,
  cover_url TEXT,
  epub_url TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on public_books
ALTER TABLE public.public_books ENABLE ROW LEVEL SECURITY;

-- RLS: Anyone authenticated can read public books
CREATE POLICY "Authenticated users can view public books"
  ON public.public_books FOR SELECT
  TO authenticated
  USING (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_books_updated_at
  BEFORE UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_playback_progress_updated_at
  BEFORE UPDATE ON public.playback_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('epub-files', 'epub-files', false),
  ('audio-files', 'audio-files', false),
  ('book-covers', 'book-covers', true);

-- Storage RLS for epub-files
CREATE POLICY "Users can upload own epubs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'epub-files' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can read own epubs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'epub-files' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage RLS for audio-files
CREATE POLICY "Users can read own audio"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'audio-files' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can upload own audio"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'audio-files' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage RLS for book-covers (public read)
CREATE POLICY "Anyone can view covers"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'book-covers');

CREATE POLICY "Users can upload covers"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'book-covers' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Enable realtime for books table (for status updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.books;