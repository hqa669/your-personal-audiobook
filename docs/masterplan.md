## 📌 30-Second Elevator Pitch

BookMine transforms any EPUB into a soothing, AI-narrated audiobook—free from Audible or Amazon restrictions. Upload your library, press play, and enjoy immersive, high-quality audio in a calm, cozy reading space.

---

## 🧩 Problem & Mission

- **Problem**: Most audiobook platforms lock users into costly ecosystems (Audible, Speechify) with limited personalization and ownership.
- **Mission**: Empower people to listen to *their own* books, beautifully voiced by AI, in a quiet, intelligent interface that respects attention and autonomy.

---

## 🎯 Target Audience

- Busy listeners (commuters, multitaskers, parents)
- Students and lifelong learners (studying with classics or PDFs)
- Readers seeking privacy-friendly, cost-free alternatives to Audible

---

## 🔑 Core Features

- **Upload Your EPUBs** — Bring your own books; no purchases required
- **AI Audiobook Generator** — High-quality TTS via RunPod, triggered on-demand
- **Dual-Mode Reader** — Read and listen in sync, with adjustable fonts and audio speed
- **Book Library UI** — Serene shelf interface to browse, play, or continue listening
- **Free Classics Discovery** — Access a curated set of public-domain titles
- **Personal AI Voice Companion (Optional)** — Calm suggestions, summaries, or reminders

---

## 🛠 Tech Stack & Rationale

- **Frontend**: Vite + TypeScript + React + Tailwind + shadcn/ui  
  → Fast, composable, and ideal for custom UI with warm interactions

- **Backend**: Supabase (DB, Auth, Storage, Edge Functions)  
  → Scalable, real-time backend with great DX and native RunPod support

- **AI Voice**: RunPod serverless (Python-based TTS)  
  → Affordable, fast, and customizable voice pipeline

- **Storage**: Lovable Cloud  
  → Built for emotional UX and privacy-first file handling

- **Auth**: Email + Google + Apple  
  → Simple, user-friendly login with flexible identity support

---

## 🧱 Conceptual Data Model (in words)

- **User**  
  → Has many `Books`  
  → Can trigger `VoiceJobs` (TTS generations)

- **Book**  
  → Belongs to a `User`  
  → Stores EPUB file, cover image, metadata (title, author)  
  → Has many `AudioChapters` (linked audio segments)

- **VoiceJob**  
  → Tied to a `Book`  
  → Tracks status (pending, generating, ready)

- **AudioChapter**  
  → Linked to a specific `Book`  
  → Stores audio file URL and transcript reference

---

## 🎨 UI Design Principles

- **Start with emotion**: Feels like a cozy reading nook—warm, focused, and personal
- **Text + audio symmetry**: Balanced layout for listening and reading
- **Gentle motion**: Page-like modals, subtle feedback on actions
- **Microcopy with care**: Encouraging, non-pushy voice (“We saved your spot”)
- **Respectful pacing**: No aggressive CTAs or clutter; calm flow through the app

---

## 🔐 Security & Compliance Notes

- Store user EPUBs securely in Lovable Cloud (private by default)
- Audio jobs scoped per user to avoid data leaks
- Use Supabase Row Level Security (RLS) for strict access control
- Respect privacy by not indexing or scanning book contents unless triggered

---

## 🛣 Roadmap (Phased)

### MVP
- Upload EPUB → Generate AI audio → Listen in dual-mode reader
- Book library UI + Free classic discovery page
- Basic email login

### V1
- OAuth (Google, Apple), smarter TTS error handling
- Personal AI Voice Companion (basic recommendations)
- Book sync + resume across devices
- Mobile-first optimizations

### V2
- Bookmarking, note-taking, and highlight syncing
- Social book sharing or “send to friend” feature
- Voice customization / voice library selection

---

## ⚠️ Risks & Mitigations

- **RunPod TTS latency** → Use status polling + gentle UX (“Generating...”)  
- **EPUB parsing inconsistencies** → Pre-process on upload and validate structure  
- **User uploads of copyrighted books** → Clear ToS; optional DRM flag; explore fingerprinting

---

## 🚀 Future Expansion Ideas

- Whisper-powered audiobook transcription
- Smart chapter summaries or audio bookmarks
- Multi-language TTS (French, Spanish, etc.)
- Chrome extension: “Listen to any webpage”
- Community-curated book playlists (e.g., “Best Rainy Day Reads”)

