## 🏗 Step-by-Step Build Sequence

### 🔹 Phase 1: MVP Build

1. **Set up project repo**
   - Initialize monorepo (Vite + React + Tailwind)
   - Configure shadcn/ui and global styles

2. **Auth setup**
   - Enable Supabase project with Email login
   - Implement login/signup modals

3. **Book upload pipeline**
   - Create `Upload Book` UI and EPUB file input
   - Store file + metadata in Supabase Storage & DB

4. **Library page**
   - Fetch & render user’s books in a horizontal shelf layout
   - Add “Add New Book” button with file upload trigger

5. **AI voice generation**
   - Connect to RunPod serverless TTS endpoint
   - Add “Generate Voice” modal with spring-in animation
   - Handle job status: processing → ready

6. **Audio-ready book cards**
   - Show status icon (e.g., dot animation for processing)
   - Add play/pause interaction per book

7. **Dual-mode Reader page**
   - Build text + audio interface
   - Add font size toggle, dark/light mode
   - Audio controls: speed, play/pause, auto-scroll

8. **Free classics page**
   - Grid of public domain EPUBs (filterable by genre/author)
   - Add “Add to Library” buttons
   - Pagination (gentle fade between pages)

### 🔹 Phase 2: V1 Features

9. **OAuth providers**
   - Add Google and Apple sign-in via Supabase

10. **Cross-device sync**
   - Resume last played book/chapter from Supabase metadata

11. **AI Companion (beta)**
   - Create a calm sidebar assistant (whispers book suggestions)
   - Trigger summaries or resume prompts

12. **Mobile layout pass**
   - Prioritize spacing, button tap zones, bottom navigation

13. **Accessibility sweep**
   - ARIA roles, keyboard nav, reduced motion support

---

## 🗓 Timeline with Checkpoints (6 Weeks)

| Week | Milestone                                  |
|------|--------------------------------------------|
| 1    | Project scaffolding, auth, upload flow     |
| 2    | Library + Reader layout + basic TTS hook   |
| 3    | Voice generation modal + RunPod integration|
| 4    | Audio-ready state, dual-mode polish        |
| 5    | Free classics + AI Companion (lite)        |
| 6    | Mobile testing, accessibility, QA          |

---

## 🧑‍💻 Team Roles & Rituals

- **Frontend Dev**: UI implementation, Tailwind layout, responsive tweaks
- **Backend Dev**: Supabase config, RunPod pipeline, edge functions
- **Product Designer**: UX flows, motion, mobile layout
- **PM/Founder**: Test weekly builds, validate emotional tone

**Weekly Rituals**:
- 1x Build review
- 1x 3-user usability test (record feedback)
- Async Loom demos after each checkpoint

---

## 🔌 Optional Integrations & Stretch Goals

- **AI Summarization** — Use GPT API to summarize chapters
- **Voice Library** — Let users choose narrator tone/style
- **Chrome Extension** — “Send to BookMine” from any webpage
- **Bookmarks & Highlights** — Markdown exportable notes
- **Offline Mode** — Download audio for travel

