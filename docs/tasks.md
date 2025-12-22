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

## Phase 4: EPUB Upload Flow ✅ COMPLETE

### 4.1 Upload Component ✅
- [x] Create `UploadBookModal.tsx` component
- [x] File input with 10MB limit validation
- [x] EPUB file type validation (`.epub` only)
- [x] Upload progress indicator
- [x] Error handling with toast notifications
- [x] Drag & drop support

### 4.2 EPUB Processing ✅
- [x] Upload EPUB to `epub-files` bucket
- [x] Extract metadata (title, author) from EPUB using JSZip
- [x] Extract cover image from EPUB
- [x] Upload cover to `book-covers` bucket
- [x] Insert book record with `status: 'uploaded'`

### 4.3 Library Integration ✅
- [x] Replace mock data with real Supabase queries
- [x] Created `useBooks` hook for data management
- [x] Add "New Book" button that opens upload modal
- [x] Show upload success with book appearing in library
- [x] Real-time status updates using Supabase subscriptions
- [x] Empty state when no books
- [x] Search/filter books

**Files created:**
- `src/lib/epub-parser.ts` - EPUB metadata extraction
- `src/hooks/useBooks.ts` - Books data hook with realtime
- `src/components/UploadBookModal.tsx` - Upload modal

---

## Phase 5: AI Voice Generation ✅ COMPLETE (v5 - Sentence Chunking + Realtime)

### 5.1 Edge Function: `generate-chapter-audio` ✅
- [x] Chapter-scoped generation (not whole book)
- [x] Duration estimation at 160 WPM
- [x] Initial 5-minute buffer generation
- [x] **Sentence-based chunking** (v5):
  - [x] Split paragraphs into sentences
  - [x] If sentence > 400 tokens, split to max 240 tokens or 600 chars
  - [x] Hierarchical splitting: semicolons → commas → hard split
- [x] **5 concurrent workers** - submit up to 5 RunPod jobs in parallel
- [x] Paragraph state machine (NOT_GENERATED, PENDING, GENERATING, GENERATED)
- [x] Idempotent - never generates same chunk twice
- [x] Instant abort on chapter switch

### 5.2 Database Schema Updates ✅
- [x] Updated `audio_tracks` table with:
  - `chapter_index` - chapter scoping
  - `paragraph_index` - paragraph ordering
  - `chunk_index` - sentence chunk ordering within paragraph
  - `total_chunks` - number of chunks for this paragraph
  - `text` - chunk text
  - `estimated_duration_seconds` - pre-generation estimate
  - `actual_duration_seconds` - post-generation actual
  - `status` - state machine (NOT_GENERATED, PENDING, GENERATING, GENERATED)
  - `runpod_job_id` - tracks RunPod job for async completion
  - Unique constraint on (book_id, chapter_index, paragraph_index, chunk_index)
- [x] **Realtime enabled** on `audio_tracks` for instant updates

### 5.3 Hook: `useChapterAudio` ✅ (v5 Rework)
- [x] **Supabase Realtime subscription** for instant audio detection
- [x] Chapter-scoped audio management
- [x] **Auto-play on first chunk ready** - plays as soon as first sentence audio completes
- [x] **Pause when next audio not ready** - waits for generation
- [x] **Resume when audio becomes available** - continues playback automatically
- [x] Signed URL caching
- [x] Auto-advance to next chunk/paragraph on completion
- [x] Backup polling via `poll-audio-jobs` edge function

### 5.4 UI Integration ✅
- [x] "Generate Voice" button triggers chapter-scoped generation
- [x] Loading state during generation
- [x] "Waiting for audio..." state when paused for next chunk
- [x] Play/pause controls
- [x] Playback speed control

### 5.5 Book Deletion (Atomic Cleanup) ✅
- [x] Delete confirmation dialog with explicit warning
- [x] Abort active TTS generation on delete
- [x] Delete all audio files from storage
- [x] Delete audio track records
- [x] Delete playback progress
- [x] Delete EPUB file from storage
- [x] Delete cover image from storage
- [x] Delete book record
- [x] Context menu on BookCard with delete option

### 5.6 Fire-and-Forget Architecture ✅
- [x] Edge Function submits RunPod jobs and returns immediately (no polling)
- [x] Stores `runpod_job_id` in audio_tracks with `PENDING` status
- [x] `poll-audio-jobs` Edge Function checks RunPod for job completion
- [x] Completed audio uploaded to storage and status updated to `GENERATED`
- [x] Failed jobs reset to `NOT_GENERATED` for retry

**Files created/updated:**
- `supabase/functions/generate-chapter-audio/index.ts` - Sentence chunking + 5 parallel workers
- `supabase/functions/poll-audio-jobs/index.ts` - Polls RunPod and downloads completed audio
- `src/hooks/useChapterAudio.ts` - Realtime-based auto-play with pause/resume

**Files created:**
- `src/components/DeleteBookDialog.tsx` - Delete confirmation dialog

---

## Phase 6: Reader Page ✅ COMPLETE

### 6.1 Text Mode ✅
- [x] Fetch book content from EPUB
- [x] Chapter navigation (previous/next)
- [x] Chapter list dropdown (sheet)
- [x] Font size adjustment
- [x] Dark/light mode toggle (already exists)
- [x] Progress slider
- [x] Save reading progress to `playback_progress`

### 6.2 Audio Mode (Pending Phase 5)
- [ ] Fetch audio track for book
- [ ] Audio player with play/pause
- [ ] Playback speed control (0.5x, 1x, 1.25x, 1.5x, 2x)
- [ ] Progress bar with seek
- [ ] Auto-save playback position
- [ ] Resume from last position
- [x] Auto-play on first audio availability (streaming-like experience: playback starts as soon as first paragraph is ready)
- [x] Auto-continue playback when next track becomes available during generation (no pause between paragraphs)
- [x] Wait for PENDING chunks during playback (player polls and waits for in-progress audio instead of stopping)
- [x] **Audio preloading** (gapless playback): While current chunk plays, preload next chunk in background. When current ends, immediately play preloaded audio for seamless transitions between paragraphs and chunks.

### 6.3 Dual Mode
- [ ] Text + audio synchronized view
- [ ] Auto-scroll text with audio (optional)
- [x] Visual indicator of current paragraph (highlight syncs with audio playback)

### 6.4 Bug Fixes
- [x] Fix chapter index alignment between reader and audio (edge function now uses same filtering logic as frontend)
- [x] Fix paragraph highlight offset (edge function now extracts ALL block elements like frontend: p, h1-h6, div, blockquote)

**Files created:**
- `src/lib/epub-chapter-parser.ts` - EPUB chapter extraction
- `src/hooks/useBookReader.ts` - Book reader state management
- `src/components/ChapterListSheet.tsx` - Chapter navigation sheet

**Reference file:** `src/pages/Reader.tsx`

---

## Phase 7: Discovery Page (Public Library)

### 7.0 Database & Admin Setup ✅
- [x] Extend `public_books` table with `slug`, `is_featured` columns
- [x] Create `public_book_chapters` table for pre-generated audio
- [x] Create `user_public_books` junction table (add-to-library without duplication)
- [x] Create `public_book_progress` table for playback tracking
- [x] Create `user_roles` table with `app_role` enum (admin/moderator/user)
- [x] Create `has_role()` security definer function
- [x] Set up RLS: public read, admin-only write for public books/chapters
- [x] Create `public-library` storage bucket (public, CDN-backed)
- [x] Storage policies: public read, admin upload/update/delete
- [x] Admin UI page (`/admin`) for managing public books and chapters
- [x] Admin hook (`useAdmin.ts`) for CRUD operations
- [x] **Admin page enhancements:**
  - [x] Auto-parse EPUB to populate chapter list
  - [x] Remove duration column (not needed)
  - [x] Folder selection using File System Access API
  - [x] Auto-detect `audio.mp3` and `sync.json` in numbered subfolders
  - [x] Batch upload all chapters at once

### 7.1 Public Books ✅
- [x] Replace mock data with Supabase query
- [x] Genre filter (dropdown)
- [x] Search by title/author
- [x] Pagination (12 per page)
- [ ] Seed `public_books` table with Project Gutenberg classics (optional)

### 7.2 Add to Library ✅
- [x] "Add to Library" button on each book
- [x] Use `user_public_books` junction table (no file duplication)
- [x] Show toast on success
- [x] Prevent duplicate additions
- [x] Show "In Library" badge for already-added books
- [x] Public books appear mixed with user-uploaded books in Library page

### 7.3 Public Book Playback ✅
- [x] New route `/reader/public/:id` for public book reader
- [x] Stream audio directly from `public_book_chapters.audio_url`
- [x] Sync file highlighting based on `public_book_chapters.sync_url` (paragraph-level timestamps)
- [x] Track progress in `public_book_progress` table
- [x] Resume from last position
- [x] Play button instead of "Generate Voice" button (audio is pre-generated)
- [x] Created `usePublicBookReader.ts` hook for public book data
- [x] Created `usePublicBookAudio.ts` hook for audio playback with sync highlighting
- [x] Fix auto page flip on last/cut-off paragraph in Public Reader

### 7.3.1 PublicReader Cut-off Click Reliability (Debug + Fix)
- [ ] Debug & stabilize click-to-advance for cut-off paragraphs (useLayoutEffect measurement + `firstCutOffIndex`)
- [ ] Confirm only the first >25% cut-off paragraph is clickable; others ignore clicks
- [ ] Verify behavior during paragraph entrance animations and after resizing

**Files created:**
- `src/hooks/useAdmin.ts` - Admin CRUD operations
- `src/pages/Admin.tsx` - Admin UI page
- `src/hooks/usePublicBookReader.ts` - Public book reader hook
- `src/hooks/usePublicBookAudio.ts` - Public book audio with sync
- `src/pages/PublicReader.tsx` - Public book reader page

**Reference file:** `src/pages/Discover.tsx`

---

## Phase 8: Polish & Accessibility

### 8.1 UX Polish
- [x] Fix BookCard menu click/pointer propagation (prevent accidental navigation)
- [x] Fix tab-switching loading bug (visibility-aware idempotent loading with auto-retry and fail-safe timeout)
- [x] Loading skeletons for book cards (`BookCardSkeleton.tsx`)
- [x] Empty state illustrations (`EmptyState.tsx` with variants: library, search, discover, audio)
- [x] Error boundary components (`ErrorBoundary.tsx`)
- [x] **Calm Paginated Reader Experience** (PublicReader):
  - [x] Paginated view instead of scroll (3 paragraphs per page)
  - [x] Page navigation with ⏮ ⏭ buttons (page-by-page, not chapter)
  - [x] Current paragraph highlight with soft glow styling
  - [x] Interactive paragraph click to select/anchor
  - [x] Auto-sync with audio playback paragraph
  - [x] Gentle fade-slide page transitions (280ms ease-in-out)
  - [x] Page indicator dots
  - [x] Keyboard accessibility for paragraph focus
- [ ] Toast notifications for all actions
- [ ] Smooth modal transitions (spring animation)
- [ ] Microcopy updates per design guidelines

### 8.2 Accessibility
- [x] Keyboard navigation for reader paragraphs (Enter/Space to select)
- [x] ARIA labels for page navigation buttons
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
| Phase 4: Upload | ✅ Complete | EPUB upload + parsing + storage |
| Phase 5: TTS | ✅ Complete | Fire-and-forget + 15min buffer |
| Phase 6: Reader | ✅ Complete | Dual mode, chapter nav, progress |
| Phase 7: Discovery | 🔄 In Progress | Admin UI done, public playback pending |
| Phase 8: Polish | ⏳ Pending | Ongoing |
| Phase 9: QA | ⏳ Pending | Final phase |
| Phase 10: Deploy | ⏳ Pending | Launch |
