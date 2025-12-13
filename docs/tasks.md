# BookMine Implementation Tasks

> **Source of Truth** for feature implementation order and progress.
> Reference: [masterplan.md](./masterplan.md) | [implementation-plan.md](./implementation-plan.md) | [app-flow-pages-and-roles.md](./app-flow-pages-and-roles.md)

---

## MVP Decisions (Confirmed)

| Decision | Choice |
|----------|--------|
| Voice Options | Single default voice (picker in V2) |
| EPUB Size Limit | 10MB max |
| Guest Access | Auth required for all reading |
| Notifications | In-app only (email in V1) |

---

## Phase 1: Setup & Scaffolding ✅ COMPLETE

### 1.1 Project Initialization ✅
- [x] Initialize Vite + React + TypeScript
- [x] Add Tailwind CSS + shadcn/ui
- [x] Enable Lovable Cloud
- [x] Configure routing (`/`, `/library`, `/reader/:bookId`, `/discover`, `/auth`)
- [x] Install fonts: `@fontsource/dm-serif-display`, `@fontsource/inter`
- [x] Install `framer-motion` for animations

### 1.2 Design System ✅
- [x] Configure color palette in `index.css` and `tailwind.config.ts`
  - Primary: `#A27B5C` (clay brown)
  - Accent: `#E8DED2` (parchment)
  - Background: `#FCFAF7` (warm off-white)
  - Audio Ready: `#71917C` (peaceful green)
- [x] Set up typography (DM Serif Display for headers, Inter for body)
- [x] Create button variants (`warm`, `parchment`, `success`)

### 1.3 Static Pages ✅
- [x] Landing Page with hero sections
- [x] Library Page (static mock data)
- [x] Discover Page with filters
- [x] Reader Page with dual mode UI
- [x] Auth Page placeholder
- [x] Header component with navigation

---

## Phase 2: Lovable Cloud Integration ✅ COMPLETE

### 2.1 Enable Lovable Cloud ✅
- [x] Enable Lovable Cloud for backend functionality
- [x] Configure auto-confirm email signups

### 2.2 Database Schema ✅
All tables created with RLS policies:

#### `profiles` table
```sql
-- Create profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Enable RLS
alter table public.profiles enable row level security;

-- RLS Policies
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Trigger for new user profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

#### `books` table
```sql
-- Create book status enum
create type public.book_status as enum ('uploaded', 'processing', 'ready', 'failed');

-- Create books table
create table public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  author text,
  cover_url text,
  epub_url text not null,
  status book_status default 'uploaded' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Enable RLS
alter table public.books enable row level security;

-- RLS Policies (users only see their own books)
create policy "Users can view own books"
  on public.books for select
  using (auth.uid() = user_id);

create policy "Users can insert own books"
  on public.books for insert
  with check (auth.uid() = user_id);

create policy "Users can update own books"
  on public.books for update
  using (auth.uid() = user_id);

create policy "Users can delete own books"
  on public.books for delete
  using (auth.uid() = user_id);

-- Index for faster queries
create index books_user_id_idx on public.books(user_id);
```

#### `audio_tracks` table
```sql
-- Create audio_tracks table
create table public.audio_tracks (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  audio_url text not null,
  duration_seconds integer,
  voice_type text default 'default',
  generated_at timestamptz default now() not null
);

-- Enable RLS
alter table public.audio_tracks enable row level security;

-- RLS: Users can view audio for their own books
create policy "Users can view audio for own books"
  on public.audio_tracks for select
  using (
    exists (
      select 1 from public.books
      where books.id = audio_tracks.book_id
      and books.user_id = auth.uid()
    )
  );

-- Index
create index audio_tracks_book_id_idx on public.audio_tracks(book_id);
```

#### `playback_progress` table
```sql
-- Create playback_progress table
create table public.playback_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  book_id uuid references public.books(id) on delete cascade not null,
  chapter_index integer default 0,
  position_seconds integer default 0,
  updated_at timestamptz default now() not null,
  unique(user_id, book_id)
);

-- Enable RLS
alter table public.playback_progress enable row level security;

-- RLS Policies
create policy "Users can view own progress"
  on public.playback_progress for select
  using (auth.uid() = user_id);

create policy "Users can upsert own progress"
  on public.playback_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update own progress"
  on public.playback_progress for update
  using (auth.uid() = user_id);

-- Index
create index playback_progress_user_book_idx on public.playback_progress(user_id, book_id);
```

#### `public_books` table (for Discovery)
```sql
-- Create public_books table (admin-managed, public read)
create table public.public_books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  genre text,
  cover_url text,
  epub_url text not null,
  description text,
  created_at timestamptz default now() not null
);

-- Enable RLS
alter table public.public_books enable row level security;

-- RLS: Anyone authenticated can read
create policy "Authenticated users can view public books"
  on public.public_books for select
  to authenticated
  using (true);
```

### 2.3 Storage Buckets
```sql
-- Create storage buckets
insert into storage.buckets (id, name, public)
values 
  ('epub-files', 'epub-files', false),
  ('audio-files', 'audio-files', false),
  ('book-covers', 'book-covers', true);

-- Storage RLS for epub-files
create policy "Users can upload own epubs"
  on storage.objects for insert
  with check (
    bucket_id = 'epub-files' 
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can read own epubs"
  on storage.objects for select
  using (
    bucket_id = 'epub-files' 
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage RLS for audio-files
create policy "Users can read own audio"
  on storage.objects for select
  using (
    bucket_id = 'audio-files' 
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage RLS for book-covers (public read)
create policy "Anyone can view covers"
  on storage.objects for select
  using (bucket_id = 'book-covers');

create policy "Users can upload covers"
  on storage.objects for insert
  with check (
    bucket_id = 'book-covers' 
    and auth.uid()::text = (storage.foldername(name))[1]
  );
```

---

## Phase 3: Authentication ✅ COMPLETE

### 3.1 Implement Auth Flow ✅
- [x] Update `Auth.tsx` with working Supabase auth
- [x] Email/password signup with `emailRedirectTo`
- [x] Email/password login
- [x] Create auth context/hook for session management
- [x] Implement `onAuthStateChange` listener
- [x] Add logout functionality to Header
- [x] Form validation with Zod

### 3.2 Protected Routes ✅
- [x] Create `ProtectedRoute` component
- [x] Wrap `/library`, `/reader/:bookId`, `/discover` routes
- [x] Redirect unauthenticated users to `/auth`
- [x] Update Header to show user state

**Files created:**
- `src/contexts/AuthContext.tsx`
- `src/components/ProtectedRoute.tsx`

---

## Phase 4: EPUB Upload Flow

### 4.1 Upload Component
- [ ] Create `UploadBookModal.tsx` component
- [ ] File input with 10MB limit validation
- [ ] EPUB file type validation (`.epub` only)
- [ ] Upload progress indicator
- [ ] Error handling with toast notifications

### 4.2 EPUB Processing
- [ ] Upload EPUB to `epub-files` bucket
- [ ] Extract metadata (title, author) from EPUB
- [ ] Generate/extract cover image
- [ ] Upload cover to `book-covers` bucket
- [ ] Insert book record with `status: 'uploaded'`

### 4.3 Library Integration
- [ ] Replace mock data with real Supabase queries
- [ ] Add "Add New Book" button that opens upload modal
- [ ] Show upload success with book appearing in library
- [ ] Real-time status updates using Supabase subscriptions

**Reference files:** 
- `src/pages/Library.tsx`
- `src/components/BookCard.tsx`
- `src/data/books.ts` (to be deprecated)

---

## Phase 5: AI Voice Generation

### 5.1 Edge Function: `generate-audio`
```typescript
// supabase/functions/generate-audio/index.ts
// Triggers RunPod TTS API
// Input: book_id, epub_url
// Output: audio_url stored in audio_tracks table

// Key steps:
// 1. Validate book belongs to user
// 2. Update book status to 'processing'
// 3. Call RunPod TTS API
// 4. Upload audio to storage
// 5. Create audio_track record
// 6. Update book status to 'ready'
```

- [ ] Create edge function scaffold
- [ ] Add RUNPOD_API_KEY secret
- [ ] Implement RunPod API call
- [ ] Handle audio file storage
- [ ] Update book status on completion/failure
- [ ] Add error handling and retries

### 5.2 UI Integration
- [ ] Update `BookDetailModal.tsx` with "Generate AI Voice" button
- [ ] Show generation status (loading animation)
- [ ] Disable button during processing
- [ ] Show success state when complete
- [ ] Add "Play" button when audio ready

**Reference file:** `src/components/BookDetailModal.tsx`

---

## Phase 6: Reader Page

### 6.1 Text Mode
- [ ] Fetch book content from EPUB
- [ ] Chapter navigation (previous/next)
- [ ] Chapter list dropdown
- [ ] Font size adjustment
- [ ] Dark/light mode toggle (already exists)
- [ ] Progress slider
- [ ] Save reading progress to `playback_progress`

### 6.2 Audio Mode
- [ ] Fetch audio track for book
- [ ] Audio player with play/pause
- [ ] Playback speed control (0.5x, 1x, 1.25x, 1.5x, 2x)
- [ ] Progress bar with seek
- [ ] Auto-save playback position
- [ ] Resume from last position

### 6.3 Dual Mode
- [ ] Text + audio synchronized view
- [ ] Auto-scroll text with audio (optional)
- [ ] Visual indicator of current section

**Reference file:** `src/pages/Reader.tsx`

---

## Phase 7: Discovery Page

### 7.1 Public Books
- [ ] Seed `public_books` table with Project Gutenberg classics
- [ ] Replace mock data with Supabase query
- [ ] Genre filter (dropdown)
- [ ] Search by title/author
- [ ] Pagination (12 per page)

### 7.2 Add to Library
- [ ] "Add to Library" button on each book
- [ ] Copy book to user's library (creates new book record)
- [ ] Show toast on success
- [ ] Prevent duplicate additions

**Reference file:** `src/pages/Discover.tsx`

---

## Phase 8: Polish & Accessibility

### 8.1 UX Polish
- [ ] Loading skeletons for book cards
- [ ] Empty state illustrations
- [ ] Error boundary components
- [ ] Toast notifications for all actions
- [ ] Smooth modal transitions (spring animation)
- [ ] Microcopy updates per design guidelines

### 8.2 Accessibility
- [ ] Keyboard navigation for all interactive elements
- [ ] ARIA labels for buttons, modals, controls
- [ ] Focus management in modals
- [ ] `prefers-reduced-motion` support
- [ ] Screen reader testing

### 8.3 Mobile Optimization
- [ ] Responsive layouts (all breakpoints)
- [ ] Touch-friendly tap targets (44px min)
- [ ] Sticky audio controls on mobile
- [ ] Swipe gestures for chapter navigation

---

## Phase 9: Testing & QA

### 9.1 Testing
- [ ] Test EPUB upload flow end-to-end
- [ ] Test TTS generation flow
- [ ] Test playback resume
- [ ] Test auth flow (signup, login, logout)
- [ ] Cross-browser testing (Chrome, Safari, Firefox)
- [ ] Mobile testing (iOS, Android)

### 9.2 Security Audit
- [ ] Verify RLS policies work correctly
- [ ] Test that users cannot access other users' data
- [ ] Validate file upload security
- [ ] Check for XSS vulnerabilities
- [ ] Review edge function error handling

---

## Phase 10: Deployment

### 10.1 Pre-launch
- [ ] Environment variables configured
- [ ] Custom domain setup (optional)
- [ ] SEO meta tags on all pages
- [ ] robots.txt and sitemap

### 10.2 Launch
- [ ] Final QA pass
- [ ] Deploy frontend via Lovable
- [ ] Monitor edge function logs
- [ ] Set up error tracking (optional)

---

## Future (V1/V2)

### V1 Features
- [ ] Resume playback across devices
- [ ] Email notifications (Resend integration)
- [ ] AI voice summaries
- [ ] Smart status with ETA

### V2 Features
- [ ] Voice picker (gender, tone, narrator type)
- [ ] Book playlists / reading queue
- [ ] Offline listening (PWA)
- [ ] Custom bookmark notes
- [ ] Reading stats / listening journal

---

## Progress Tracking

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Setup | ✅ Complete | Core UI scaffolded |
| Phase 2: Cloud | ✅ Complete | Database schema + storage buckets created |
| Phase 3: Auth | ✅ Complete | Auth context, protected routes, login/signup |
| Phase 4: Upload | 🔄 Next | EPUB upload flow |
| Phase 5: TTS | ⏳ Pending | Need RunPod API key |
| Phase 6: Reader | ⏳ Pending | Partial UI exists |
| Phase 7: Discovery | ⏳ Pending | Partial UI exists |
| Phase 8: Polish | ⏳ Pending | Ongoing |
| Phase 9: QA | ⏳ Pending | Final phase |
| Phase 10: Deploy | ⏳ Pending | Launch |
