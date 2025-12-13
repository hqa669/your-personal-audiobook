## app-flow-pages-and-roles.md

### 🗺️ Site Map (Top-Level Pages)

- `/` → **Landing Page**
- `/library` → **Your Library**
- `/reader/:bookId` → **Reader (Text + Audio)**
- `/discover` → **Free Book Discovery**
- `/auth` → **Sign In / Create Account**
- `Modal:` → **Book Detail / Voice Generator**

---

### 🧭 Page Purpose (1-line each)

- **Landing Page** → Introduce BookMine with cozy visual tone and clear CTA
- **Library** → View your personal books; check status, upload, or play
- **Reader** → Immersive reading + audio interface (dual mode)
- **Discovery** → Explore free public-domain classics; add to your library
- **Auth** → Email, Google, or Apple login (soft prompt only)
- **Voice Generator Modal** → Trigger AI voice creation for any book

---

### 👥 User Roles & Permissions

#### 1. **Guest**
- Can view landing + discovery page
- Cannot upload or listen
- Prompted to sign in on action

#### 2. **Authenticated User**
- Full access to:
  - Personal library
  - EPUB upload
  - Voice generation
  - Reader view
- Only sees their own data (Supabase RLS)

#### 3. **Admin (Optional, Future)**
- View system-wide usage
- Upload public domain books to Discovery
- Trigger backend reprocessing

---

### 🚶 Primary User Journeys (≤ 3 steps each)

#### Journey 1: Upload and Listen
1. Go to Library → Click “Add New Book”
2. Upload EPUB → Book appears with “Processing” status
3. Tap “Generate AI Voice” → Wait → Tap Play when ready

#### Journey 2: Read and Listen Together
1. Open any book in Library
2. Enter Reader mode → Tap Play
3. Scroll or auto-scroll as you listen

#### Journey 3: Add Free Classic
1. Browse `/discover`
2. Filter by author or genre
3. Click “Add to Library” → Appears in your shelf

---

### 🧩 Notes

- All modals triggered inline (no page reload)
- Reader is mobile-friendly with sticky audio controls
- Auth is passive: soft CTA on landing, but not blocking until needed
