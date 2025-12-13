## implementation-plan.md

### 🛠 Step-by-Step Build Sequence

#### 🔹 Phase 1: Setup & Scaffolding (Week 1)
- [ ] Initialize Vite + React + TypeScript project
- [ ] Add Tailwind CSS and shadcn/ui for styling
- [ ] Configure routing: `/`, `/library`, `/reader`, `/discover`
- [ ] Set up Supabase project with:
  - Auth (email, Google, Apple)
  - Database schema (User, Book, AudioTrack, PlaybackProgress)
  - Storage buckets for EPUB and audio files

#### 🔹 Phase 2: Core Flows (Week 2–3)
- [ ] Implement **Landing Page** (CTA → Upload Book)
- [ ] Add EPUB upload + Supabase storage
- [ ] Create Library Page with:
  - Book cards (cover, status, play button)
  - Horizontal scroll behavior
- [ ] Book Detail Modal:
  - Metadata view
  - “Generate AI Voice” button → calls Supabase Edge function
  - Status updates in real time (processing → ready)

#### 🔹 Phase 3: AI Integration (Week 4)
- [ ] Set up Supabase Edge Function to trigger RunPod TTS
  - Input: EPUB file URL
  - Output: audio file URL
  - Store result in `AudioTrack` table
- [ ] UI: show loader, disable re-generation
- [ ] Audio player component (play/pause, speed, position)
- [ ] Add “Text + Audio” Reader View:
  - Scrollable text with sync
  - Audio playback with progress bar
  - Light/dark toggle

#### 🔹 Phase 4: Discovery + Polish (Week 5)
- [ ] Free Book Discovery Page
  - Pull from static `PublicBook` table
  - Grid layout + filters
  - “Add to Library” button
- [ ] Smooth modals (spring transition, loading dots)
- [ ] Microcopy: “Your next listen is ready.”, etc.
- [ ] Basic empty state illustrations
- [ ] Ensure mobile responsiveness

#### 🔹 Phase 5: Final QA + Deploy (Week 6)
- [ ] Add Supabase RLS rules
- [ ] Confirm GDPR-compliant delete/export logic
- [ ] Accessibility pass (keyboard, ARIA, reduced motion)
- [ ] Cross-browser testing
- [ ] Deploy frontend (Vercel recommended)
- [ ] Test RunPod limits + fallbacks

---

### 🗓️ Timeline With Checkpoints

- **Week 1** → Dev environment, Supabase, auth, routing
- **Week 2** → Upload flow + Library UI
- **Week 3** → Reader page + modals
- **Week 4** → TTS integration via RunPod
- **Week 5** → Discovery + UX polish
- **Week 6** → Final QA + launch

---

### 🧑‍💻 Team Roles & Rituals

#### Roles
- **Product Dev**: 1–2 React + TypeScript engineers
- **Backend Dev**: 1 Supabase + Edge Functions specialist
- **Designer**: 1 UI/UX generalist (familiar with Tailwind/shadcn)
- **PM/Founder**: You! (Vision + copy + decisions)

#### Rituals
- 🧪 **Weekly usability test**: 3 real users, 30 min each
- 🚦 **Monday kickoff**: Review feature priority + blockers
- 📦 **Friday wrap-up**: Demo what shipped + log learnings

---

### 🧰 Optional Integrations & Stretch Goals

- [ ] Use whisper/openAI to auto-extract book metadata (title, chapters)
- [ ] Add Resend for “Your audiobook is ready” email notifications
- [ ] Listen tracking (start/stop logs) for future smart resume
- [ ] Usage dashboard (for admin or metrics)
- [ ] Offline mode (PWA support or preloading chunks)
