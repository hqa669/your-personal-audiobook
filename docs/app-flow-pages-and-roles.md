## 🗺 Site Map (Top-Level Pages)

- `/` → **Landing Page**
- `/library` → **Your Library**
- `/read/:bookId` → **Reader (Dual Mode)**
- `/discover` → **Free Book Discovery**
- `/login` → **Auth Modal or Redirect**
- `/settings` → (optional, later phase)

---

## 🎯 Purpose of Each Page

- **Landing Page** — Invite users to explore; clean CTA to upload or sign in
- **Library** — Home base for uploaded and discovered books
- **Reader** — Dual-mode text + audio experience
- **Discovery** — Curated classics; free books to add
- **Login** — Handles sign-in and account setup

---

## 👥 User Roles & Access Levels

| Role       | Access                                  |
|------------|------------------------------------------|
| Guest      | Can browse landing + discovery only      |
| Signed-in  | Can upload, generate audio, access reader|
| Admin (future) | Manage flagged uploads, analytics     |

- **Voice Companion AI** available only to signed-in users

---

## 🧭 Primary User Journeys (≤ 3 Steps Each)

### 🎧 1. Turn My Book Into Audio
1. Upload EPUB from Library page
2. Tap “Generate Voice”
3. Get notified when ready → tap Play

### 📖 2. Resume Where I Left Off
1. Open Library
2. See “Resume” button on last read/listened book
3. Tap → Jump back to Reader page

### 📚 3. Explore Free Books
1. Visit Discovery page
2. Filter by genre or search author
3. Tap “Add to Library” on interesting title

