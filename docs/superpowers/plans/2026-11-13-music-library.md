# UMDSC Shared Music Library & Studio Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared, Dance-Style-categorized **Music Library** where all music links (YouTube, Spotify, SoundCloud, Drive MP3) and MP3 uploads inserted by Class Reps or Admins are accessible to **all registered members (both past and current events)** regardless of their registered dance style, with direct **Play in Studio** and **Get Music / Open Link** actions, plus support for Class Reps uploading general Dance Style MP3 tracks without requiring a specific class session.

**Architecture:**
1. **Backend (`api/src/features/music.ts`, `api/src/features/events.ts`, `api/src/features/videos.ts`)**:
   - Unlock `visibleMusic()` and `music.list` (`perm: 'signedIn'`) for all registered members (`role === 'dancer'` not starting with `W-`, plus `role === 'admin'`) across all dance styles and events, while keeping `videos.list` restricted to registered classes (`dancerCanSee`) and keeping `W-` walk-in tokens restricted to their walk-in session.
   - Skip `ctx.drive.info(e.folderId)` in `events.list` for non-admin callers so dancer queries for event names (`events.list` with `includeArchived: true`) are fast and zero-Drive-I/O.
   - Extend `videos.targetFolder` to accept `{ sessionId?, eventId?, styleId? }` so MP3 uploads without a `sessionId` resolve `<StyleMasterFolder>/<Year>/<EventName>/Music` (`classFolderName: ''`) and allow callers with `videos.upload` or `music.edit` permission for that style.
2. **Frontend (`web/src/features/music-studio/`, `web/src/features/media/`, `web/src/app/routes.tsx`, `web/src/lib/permissions.ts`)**:
   - Create `MusicLibraryPage.tsx` with Dance Style category pills, grouped Dance Style sections, search input, event filter, **Play in Studio** button (`/studio?music=<id>` or `/admin/studio?music=<id>`), and `musicAppLinks(item)` download/open buttons (`Spotify`, `YouTube`, `SoundCloud`, `Download MP3`).
   - Add top-level `Library` navigation tab in Dancer mode (`/library`) and Admin mode (`/admin/library`), plus `/admin/studio` route so Admins and Class Reps can also practice tracks in Studio.
   - Upgrade `ClassMusicList.tsx` and `Studio.tsx` so Studio fetches all styles (`styles.list`) and events (`events.list` with `includeArchived: true`), displays Dance Style category pills and search in the Studio picker, and offers external music links on each track.
   - Update `UploadDialog.tsx` so MP3 uploads can target either a specific class session or `-- General Style / Event Library Track --` (`sessionId = ""`).

**Tech Stack:** TypeScript, React 18, React Router v6, TanStack React Query, Tailwind CSS (8-bit retro neon pixel UI), Vitest, Google Apps Script (`clasp`).

---

### Task 1: Backend — Global Music Library Access & General Style MP3 Upload Target Folder

**Files:**
- Modify: `api/src/features/music.ts`
- Modify: `api/src/features/events.ts`
- Modify: `api/src/features/videos.ts`
- Modify: `api/test/features/music.test.ts`
- Modify: `api/test/features/bootstrap.test.ts`
- Modify: `api/test/features/styleScopedMedia.test.ts`

- [ ] **Step 1: Write failing backend tests in `api/test/features/music.test.ts`, `api/test/features/bootstrap.test.ts`, and `api/test/features/styleScopedMedia.test.ts`**
  - In `api/test/features/music.test.ts`:
    - Update `dancer listing music of a style they are not in` → verify that a registered dancer CAN list music from any Dance Style (`st_hiphop` even if only registered in `st_popping`) and any Event (past or current) for the shared Music Library.
    - Update `sections.list without musicId` → verify that a registered dancer receives practice sections for all active library music across styles and events, while walk-in tokens (`W-...`) only see their walk-in session's music/sections.
  - In `api/test/features/bootstrap.test.ts`:
    - Update `Studio lists (videos.list, music.list, sections.list) for a dancer`:
      - Verify `videos.list` STILL only returns videos for the dancer's registered event + style (`['Popping Class 1 Video']`), and `[]` for a dancer with no events.
      - Verify `music.list` and `sections.list` return all active music (`['Hip Hop Song', 'Popping Song']`) and sections (`['Hip Hop Chorus', 'Popping Intro']`) for any registered member in `MemberIndex` (even from another style or past event), while still hiding music of a deleted class (`onLiveClass`).
  - In `api/test/features/styleScopedMedia.test.ts`:
    - Add a test verifying `videos.targetFolder` works without `sessionId` when `{ eventId, styleId }` are passed by a Class Rep with `music.edit` or `videos.upload` for `st_popping` (returning `classFolderName: ''` and `musicFolderName: 'Music'`), and rejects `st_locking` with `FORBIDDEN`.

- [ ] **Step 2: Run `npm test -w api` to confirm the new/updated tests fail as expected**

- [ ] **Step 3: Implement backend changes in `api/src/features/music.ts`, `api/src/features/events.ts`, and `api/src/features/videos.ts`**
  - In `api/src/features/music.ts`:
    - Change `'music.list'` route `perm` from `'music.view'` to `'signedIn'`.
    - In `visibleMusic(ctx, auth, filters)`:
      - If `auth?.claims.role === 'dancer' && auth.claims.sub.startsWith('W-')`, filter to the walk-in session's music (`withoutPrefix = auth.claims.sub.replace(/^W-/, '')`, matching session id).
      - For all registered dancers (`role === 'dancer'` not starting with `W-`) and admins (`role === 'admin'`), return all active `musicList` matching `onLiveClass(ctx)` and the optional `{ eventId, styleId, sessionId }` filters, without restricting by `dancerCanSee` or `perms['music.view']`.
  - In `api/src/features/events.ts`:
    - In `'events.list'`, compute `folderMissing` only when `auth?.claims.role === 'admin'` (`const isAdmin = auth?.claims.role === 'admin'; folderMissing: isAdmin && e.status === 'active' && Boolean(e.folderId) && !ctx.drive.info(e.folderId).exists`).
  - In `api/src/features/videos.ts`:
    - In `'videos.targetFolder'`:
      - Set `perm: 'signedIn'` and `styleOf: (p: any, ctx) => sessionStyle(ctx, p?.sessionId) || (p?.styleId ? String(p.styleId) : undefined)`.
      - Support two modes:
        1. `sessionId` provided: look up `session`, check `can(perms, 'videos.upload', session.styleId) || can(perms, 'music.edit', session.styleId)`, resolve `style` and `event`, return `classFolderName: "${session.date} ${style.name} Class ${session.seq}"`.
        2. `sessionId` omitted, `eventId` and `styleId` provided: validate `eventId` and `styleId`, check `can(perms, 'videos.upload', styleId) || can(perms, 'music.edit', styleId)`, resolve `style` and `event`, return `classFolderName: ''` and `musicFolderName: 'Music'`.

- [ ] **Step 4: Run `npm test -w api` and verify all backend tests pass**

---

### Task 2: Frontend — Categorized Music Library Page, Studio Integration & Navigation Routes

**Files:**
- Create: `web/src/features/music-studio/MusicLibraryPage.tsx`
- Create: `web/src/features/music-studio/MusicLibraryPage.test.tsx`
- Modify: `web/src/features/music-studio/sources/ClassMusicList.tsx`
- Modify: `web/src/features/music-studio/sources/ClassMusicList.test.tsx`
- Modify: `web/src/features/music-studio/Studio.tsx`
- Modify: `web/src/app/routes.tsx`
- Modify: `web/src/app/routes.test.tsx`
- Modify: `web/src/lib/permissions.ts`

- [ ] **Step 1: Write failing frontend tests in `MusicLibraryPage.test.tsx`, `ClassMusicList.test.tsx`, and `routes.test.tsx`**
  - In `web/src/features/music-studio/MusicLibraryPage.test.tsx`:
    - Test that `MusicLibraryPage` renders all music tracks grouped by Dance Style categories regardless of the dancer's registered style.
    - Test clicking a Dance Style category pill filters to that style's tracks, and typing in the search box filters tracks by title.
    - Test that each playable track has a `PLAY IN STUDIO` button that navigates to `/studio?music=<id>` (for dancers) or `/admin/studio?music=<id>` (for admins), and renders external links (`Open YouTube ↗`, `Open Spotify ↗`, `Open SoundCloud ↗`, `Download MP3 ↗`) from `musicAppLinks`.
  - In `web/src/features/music-studio/sources/ClassMusicList.test.tsx`:
    - Add tests verifying Dance Style category pills, search input filtering, and external `musicAppLinks` buttons on tracks in `ClassMusicList`.
  - In `web/src/app/routes.test.tsx`:
    - Add assertions verifying `library` tab is present in `DANCER_TABS` (`/library`) and `ADMIN_TABS` (`/admin/library`).

- [ ] **Step 2: Run `npx vitest run` on those test files to confirm they fail as expected**

- [ ] **Step 3: Implement `MusicLibraryPage.tsx`, `ClassMusicList.tsx`, `Studio.tsx`, `routes.tsx`, and `permissions.ts`**
  - In `web/src/features/music-studio/MusicLibraryPage.tsx`:
    - Fetch `music.list`, `sections.list`, `styles.list`, and `events.list` (`{ includeArchived: true }`) with fallback to `useBootstrap` data.
    - Render 8-bit retro neon pixel UI:
      - Header banner (`MUSIC LIBRARY`) with total tracks & dance styles count and `OPEN STUDIO` button.
      - Search input (`Search by song title, dance style, or event...`) and Event filter dropdown (`ALL EVENTS` + past/current events).
      - Interactive **Dance Style Category Bar** (`ALL STYLES (N)` + button per style with track count).
      - Grouped Dance Style panels: each style group shows a header with style name + track count and cards for each track.
      - Each track card shows title, source badge (`MP3`, `YouTube`, `SoundCloud`, `Spotify`), Event name, Practice Sections count badge, `PLAY IN STUDIO` button (when `canPractise(item)` is true), and external `musicAppLinks(item)` buttons (`Open Spotify ↗`, `Open YouTube ↗`, `Open SoundCloud ↗`, `Download MP3 ↗`).
  - In `web/src/features/music-studio/sources/ClassMusicList.tsx`:
    - Add search input (`aria-label="Search music library"`) and clickable Dance Style category pills above the track list while preserving the existing `Filter music by event` and `Filter music by style` `<select>` controls.
    - Render `musicAppLinks(item)` external action links (`Open ${link.label} ↗` or `${link.label} ↗` with `onClick={e => e.stopPropagation()}`) on each track card alongside the `SELECT` / `ACTIVE` button (or `LISTEN ONLY` when `!canPractise(item)`).
  - In `web/src/features/music-studio/Studio.tsx`:
    - Add live queries for `styles.list` and `events.list` (`{ includeArchived: true }`) so `stylesList` and `eventsList` include all club dance styles and past/current events even for dancers who only registered for a single style.
  - In `web/src/app/routes.tsx` & `web/src/lib/permissions.ts`:
    - Add `{ id: 'library', label: 'Library', icon: <MusicIcon />, path: '/library' }` to `DANCER_TABS` and route `<Route path="library" element={<MusicLibraryPage />} />` in Dancer routes.
    - Add `{ id: 'library', label: 'Library', icon: <MusicIcon />, path: '/admin/library' }` to `ADMIN_TABS` and routes `<Route path="library" element={<AdminRouteGuard path="/admin/library"><MusicLibraryPage /></AdminRouteGuard>} />` and `<Route path="studio" element={<AdminRouteGuard path="/admin/studio"><StudioPage /></AdminRouteGuard>} />` in Admin routes.
    - Add `'/admin/library'` and `'/admin/studio'` to `ADMIN_ROUTE_PERMS` in `web/src/lib/permissions.ts`.

- [ ] **Step 4: Run `npx vitest run` on the frontend test files and verify they pass**

---

### Task 3: Frontend — Class Rep General MP3 Upload without Session (`UploadDialog.tsx` & `MediaPage.tsx`)

**Files:**
- Modify: `web/src/features/media/UploadDialog.tsx`
- Modify: `web/src/features/media/UploadDialog.test.tsx`
- Modify: `web/src/features/media/MediaPage.tsx`

- [ ] **Step 1: Write failing test in `web/src/features/media/UploadDialog.test.tsx`**
  - Add a test for `type="mp3"` verifying:
    - The Target Class Session dropdown includes `-- General Style / Event Library Track --` (`value=""`), and works even when `sessions` is empty (`sessions={[]}`).
    - Uploading an MP3 with `-- General Style / Event Library Track --` calls `videos.targetFolder` with `{ sessionId: '', eventId: 'e1', styleId: 'st1' }` and `music.create` with `sessionId: ''`.

- [ ] **Step 2: Run `npx vitest run src/features/media/UploadDialog.test.tsx` in `web` to confirm the new test fails**

- [ ] **Step 3: Implement changes in `web/src/features/media/UploadDialog.tsx` and `web/src/features/media/MediaPage.tsx`**
  - In `UploadDialog.tsx`:
    - Check `const isFolderMissing = !style.videoFolderId;` for both video and mp3 uploads.
    - In `handleStartUpload`: only require `selectedSessionId` when `type === 'video'` (`if (files.length === 0 || (type === 'video' && !selectedSessionId) || isFolderMissing) return;`).
    - Pass `{ sessionId: selectedSessionId, eventId, styleId: style.id }` to `api.post('videos.targetFolder', ...)`.
    - When `type === 'mp3'`, always show the Target Class Session `<select>` (even if `sessions.length === 0`) with `<option value="">-- General Style / Event Library Track --</option>` at the top, plus any scheduled sessions below.
  - In `MediaPage.tsx`:
    - Add a `PLAY IN STUDIO` button on playable music tracks in the Admin Media page (`navigate('/admin/studio?music=' + m.id)`) so Class Reps and Admins can also test/play tracks in Studio directly from Media Management.

- [ ] **Step 4: Run `npx vitest run src/features/media/UploadDialog.test.tsx` and verify all tests pass**

---

### Task 4: Full Verification, Build, Deployment & Git Push

**Files:**
- Verify all modified files in `api/` and `web/`

- [ ] **Step 1: Run full backend test suite (`npm test -w api`)**
- [ ] **Step 2: Run full frontend test suite (`npm test -w web`) and production build (`npm run build -w web`)**
- [ ] **Step 3: Deploy backend to Google Apps Script (`npm run push -w api` & `npx clasp deploy` if needed) and push commits to `origin/main`**

