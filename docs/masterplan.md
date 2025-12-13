## masterplan.md

### 🎧 Elevator Pitch
BookMine turns any EPUB you own into a high-quality, AI-narrated audiobook. Just upload, press play, and enjoy—no subscriptions, no gatekeeping.

---

### 🔍 Problem & Mission
Most audiobook platforms are locked behind pricey memberships and limited catalogs. BookMine empowers readers to enjoy *their own* books in audio form—free, beautiful, and frictionless.

---

### 🎯 Target Audience

- **Audiobook lovers** tired of Audible’s ecosystem
- **Students and lifelong learners** converting study material to audio
- **Busy people** who prefer listening while commuting or multitasking
- **Public domain fans** discovering free classics in a new format

---

### 🧩 Core Features

- **Upload & Convert EPUBs** → Private library, voice-ready on demand
- **Dual Reading Mode** → Read and/or listen with sync, auto-scroll, and speed controls
- **Beautiful Library Interface** → Horizontal shelves, cozy cover art, clear book status
- **Free Book Discovery** → Explore classics by genre/author, no login required
- **RunPod AI Voice Generation** → Triggered manually via modal
- **Calm Audiobook UX** → Smart playback, resume, and progress memory

---

### ⚙️ High-Level Tech Stack

- **Frontend**: Vite + React + TypeScript + Tailwind + shadcn/ui  
  → Fast, modular, and easy to theme for a cozy UI  
- **Backend/Storage**: Supabase  
  → Handles auth, DB, file storage, and Edge Functions for RunPod calls  
- **AI Voice API**: RunPod (Python-based TTS)  
  → Efficient, scalable voice generation triggered on user tap  
- **Auth**: Supabase Auth (Email, Google, Apple)  
  → Low-friction login; Apple for mobile users  
- **Storage**: Lovable Cloud  
  → Optimized for security and media storage  

---

### 🗃 Conceptual Data Model (ERD in words)

- **User**
  - id, email, name, auth provider
- **Book**
  - id, user_id (FK), title, author, cover_url, epub_url, status, created_at
- **AudioTrack**
  - id, book_id (FK), audio_url, duration, voice_type, generated_at
- **PlaybackProgress**
  - id, user_id (FK), book_id (FK), last_position_seconds, updated_at
- **PublicBook**
  - id, title, author, genre, epub_url, cover_url (for discovery page)

---

### 🧠 UI Design Principles (Krug-aligned)

- **Don’t Make Me Think**: Everything feels obvious (Upload → Play)
- **Scenes Not Screens**: Reader page adapts to “reading” or “listening”
- **Emotional Intent First**: Cozy, kind, non-judgmental UI
- **Soft Transitions**: Modals slide in, pages flip—no abruptness
- **Microcopy Reassures**: “Your next listen is ready.” instead of "TTS complete."

---

### 🔐 Security & Compliance

- All uploaded books are **private by default**
- Supabase RLS rules prevent cross-user access
- Optional encryption for user-stored files
- RunPod voice generation uses only temp file access (auto-deletes after)
- Compliant with GDPR and CCPA for deletion and data export

---

### 🚀 Roadmap

#### 🥇 MVP (Launch-Ready)
- Upload EPUB → Generate AI Voice → Listen
- Text/audio dual mode with basic controls
- Free book discovery
- Basic auth (email, Google)
- Public domain starter library

#### 🥈 V1
- Resume playback across devices
- Smarter status system (e.g. “Ready soon…” with ETA)
- AI voice summaries (“Continue from last chapter?”)
- Pagination for discovery

#### 🥉 V2
- Voice picker (tone, gender, narrator type)
- Book playlists or reading queue
- Offline listening (PWA / mobile optimization)
- Custom bookmark notes

---

### ⚠️ Risks & Mitigations

- **Large EPUB files** → Size limit + pre-validation
- **TTS latency** → Show clear progress & pre-generation tips
- **Privacy concerns** → Transparent data handling + opt-in voice generation
- **RunPod downtime** → Fallback queueing system + retries

---

### 🌱 Future Expansion

- Personal “listening journals” with reading stats
- AI-summarized highlights or discussion questions
- Community features (shared libraries, read-alongs)
- Companion mobile app (offline mode, sync playback)
