# UMDSC Shared Music Library & Studio Integration — Design Spec

**Date:** 2026-11-13
**Status:** Approved

## 1. Goal & Problem Statement

Currently:
1. When Class Reps or Admins insert music links (`MusicForm.tsx`) or upload MP3s (`UploadDialog.tsx`) on the Media page, those tracks are stored in `ctx.db.music` with `styleId`, `eventId`, and optional `sessionId`.
2. However, `visibleMusic` in `api/src/features/music.ts` restricts dancers (`role === 'dancer'`) using `dancerCanSee(ctx, auth)` and style-scoped `music.view` permissions so dancers can only see music for the specific `(eventId, styleId)` classes they personally registered for.
3. Furthermore, `UploadDialog.tsx` requires a specific class session (`selectedSessionId`) even when uploading an MP3, preventing Class Reps from uploading general Dance Style / Event practice MP3s before or outside a specific class session.
4. Dancers and Admins/Class Reps lack a dedicated, Dance-Style-categorized **Music Library** where any registered member (from any previous or current event) can browse all club music across all dance styles, download/open the music link (`Spotify`, `YouTube`, `SoundCloud`, `Download MP3`), or immediately **Play in Studio** with practice sections.

## 2. Requirements

1. **Global Music Library Access for All Registered Members (Past & Current):**
   - All signed-in registered members (`role === 'dancer'` in `MemberIndex` from any past or current event, as well as `role === 'admin'` / Class Reps) can access all active music tracks (`music.list`) and their Studio practice sections (`sections.list`) across **all Dance Styles and all Events**, regardless of which dance style or event they registered for.
   - **Recap Videos (`videos.list`) remain restricted** to the dancer's personally registered `(eventId, styleId)` classes.
   - Temporary QR walk-in tokens (`sub` starting with `W-`) remain scoped to their walk-in session.
   - All active dance styles and event metadata (`id`, `name`, `startDate`, `endDate`, `status`) must be available to the Music Library and Studio so every track displays its Dance Style and Event label accurately.

2. **Categorized Music Library UI (Top-Level Tab + Inside Studio Track Source):**
   - Add a top-level **`Library`** navigation tab in Dancer mode (`/library` in `DANCER_TABS`) and Admin mode (`/admin/library` in `ADMIN_TABS`, plus `/admin/studio` route so Admins/Class Reps can also open Studio directly).
   - Categorize tracks by **Dance Style** (interactive Dance Style category pills/cards with track counts + grouped Dance Style sections when viewing `ALL STYLES`, plus search by song title/style/event and optional event filter).
   - For each track in the Music Library:
     - Show track title, source badge (`MP3`, `YouTube`, `SoundCloud`, `Spotify`), Dance Style badge, Event name, and Practice Sections count (if any).
     - Provide **"PLAY IN STUDIO"** button (for `canPractise(item)` tracks: navigates to `/studio?music=<id>` for dancers or `/admin/studio?music=<id>` for admins, or selects the track directly when already inside Studio).
     - Provide **"GET MUSIC / OPEN LINK"** buttons via `musicAppLinks(item)` (`Spotify`, `YouTube`, `SoundCloud`, `Download MP3`) so members can always open or download the music directly.
   - Upgrade `ClassMusicList.tsx` / `SourcePicker.tsx` inside the Music Studio so the first tab (`Music Library`) also uses Dance Style category pills, search input, and `musicAppLinks` buttons alongside `SELECT` / `ACTIVE`.

3. **Class Rep / Admin General Library MP3 Upload (Optional Session):**
   - Allow Class Reps and Admins to upload MP3 files in `UploadDialog.tsx` either for a specific class session OR as a **`-- General Style / Event Library Track --`** (`sessionId = ""`), matching `MusicForm.tsx`.
   - Update `videos.targetFolder` in `api/src/features/videos.ts` to accept either `{ sessionId }` OR `{ eventId, styleId }` (when uploading a general MP3 without a session, returning `classFolderName: ''` so `ensureClassFolder` places the MP3 in `<StyleMasterFolder>/<Year>/<EventName>/Music`) and permit callers with either `videos.upload` or `music.edit` for that style.

## 3. Architecture & Data Flow

```mermaid
flowchart LR
  subgraph ClassRep["Class Rep / Admin (Media Page)"]
    MF["MusicForm (Link: YT / Spotify / SC / Drive MP3)"]
    UD["UploadDialog (MP3 Upload - Session or General Style Track)"]
  end

  subgraph Backend["GAS Backend (api)"]
    DB[("Music & Sections Tables")]
    VM["visibleMusic() & sections.list\n(All Registered Members & Admins)"]
  end

  subgraph MemberUI["All Registered Members (Past & Current) + Admins"]
    LIB["Music Library Page (/library & /admin/library)\nCategorized by Dance Style"]
    STU["Music Studio (/studio & /admin/studio)\nCategorized Library Picker + Player"]
  end

  MF -->|music.create| DB
  UD -->|videos.targetFolder + music.create| DB
  DB --> VM
  VM --> LIB
  VM --> STU
  LIB -->|Play in Studio (?music=id)| STU
```

## 4. Component & API Changes

### 4.1 Backend (`api/`)
- **`api/src/features/music.ts`**:
  - Update `visibleMusic(ctx, auth, filters)`:
    - Keep `onLiveClass(ctx)` filter (unless `includeOrphans === true && auth?.claims.role === 'admin'`).
    - Remove the per-style / `dancerCanSee` restriction for registered dancers (`role === 'dancer'` where `!auth.claims.sub.startsWith('W-')`).
    - For walk-in tokens (`auth?.claims.sub.startsWith('W-')`), restrict to the walk-in session's music.
    - Change `music.list` route `perm` from `'music.view'` to `'signedIn'` so any signed-in registered member or admin/class rep can load the full Music Library.
    - `sections.list` already uses `perm: 'signedIn'` and filters by `visibleMusic(ctx, auth, {})`, so it automatically unlocks all practice sections for visible library tracks.
- **`api/src/features/events.ts`**:
  - In `events.list`, only check `ctx.drive.info(e.folderId).exists` when `auth?.claims.role === 'admin'` so dancer requests for event names (`events.list` with `{ includeArchived: true }`) never make slow Google Drive API calls.
- **`api/src/features/videos.ts`**:
  - In `videos.targetFolder`:
    - Support `{ sessionId, eventId, styleId }`:
      - If `sessionId` is provided, resolve `session` as before (`classFolderName: "${session.date} ${style.name} Class ${session.seq}"`).
      - If `sessionId` is empty and `eventId` + `styleId` are provided, validate `eventId` and `styleId`, and return `classFolderName: ''` so `ensureClassFolder` creates/uses `<Year>/<EventName>/Music`.
    - Allow callers who have either `videos.upload` OR `music.edit` permission for the target `styleId` (set route `perm: 'signedIn'` and check `can(perms, 'videos.upload', styleId) || can(perms, 'music.edit', styleId)` inside `videos.targetFolder`).

### 4.2 Frontend (`web/`)
- **`web/src/features/music-studio/MusicLibraryPage.tsx` (New)**:
  - Standalone Music Library page accessible at `/library` (Dancer) and `/admin/library` (Admin).
  - Loads `music.list`, `sections.list`, `styles.list`, and `events.list` (`{ includeArchived: true }`).
  - Displays:
    - Header with total tracks & dance styles count and a quick button to open Music Studio.
    - Search bar (filters by track title, dance style name, or event name) + Event filter dropdown (`All Events` including past & current).
    - Interactive **Dance Style Category Bar** (`ALL STYLES` + pill per Dance Style showing track count).
    - Categorized track list grouped by **Dance Style** (each style section has a neon pixel header with style name and track count).
    - Each track card displays:
      - Title, source badge (`MP3`, `YouTube`, `SoundCloud`, `Spotify`), Event badge, and section count badge (e.g., `3 SECTIONS`).
      - Action buttons:
        - **`PLAY IN STUDIO`** (for `canPractise(item)` tracks — navigates to `/studio?music=<id>` or `/admin/studio?music=<id>`).
        - External link / download buttons from `musicAppLinks(item)` (`Spotify ↗`, `YouTube ↗`, `SoundCloud ↗`, `Download MP3 ↗`).
- **`web/src/features/music-studio/sources/ClassMusicList.tsx` & `SourcePicker.tsx` & `Studio.tsx`**:
  - Rename the first tab in `SourcePicker.tsx` from `Class Music` to `Music Library`.
  - Update `Studio.tsx` to also fetch `styles.list` and `events.list` (`{ includeArchived: true }`) so all dance styles and past/current events are shown in Studio even for dancers who only registered for one style.
  - Enhance `ClassMusicList.tsx` with:
    - Search input (`Search song, style, or event...`).
    - Clickable Dance Style category pills (`ALL` + each Dance Style with track count) in addition to the Event & Style filter selects.
    - Direct `musicAppLinks(item)` action links (`Spotify`, `YouTube`, `SoundCloud`, `Download MP3`) on each row (using `e.stopPropagation()` so clicking an external link doesn't accidentally trigger row selection) alongside the `SELECT` / `ACTIVE` Studio playback button (or `LISTEN ONLY` badge for Spotify-only tracks).
- **`web/src/features/media/UploadDialog.tsx`**:
  - When `type === 'mp3'`, allow selecting `-- General Style / Event Library Track --` (`selectedSessionId = ''`) in the Target Class Session dropdown (and default to `initialSessionId ?? ''` if no sessions exist yet).
  - Pass `{ sessionId: selectedSessionId, eventId, styleId: style.id }` to `videos.targetFolder`.
- **`web/src/app/routes.tsx` & `web/src/lib/permissions.ts`**:
  - Add `{ id: 'library', label: 'Library', icon: <MusicIcon />, path: '/library' }` to `DANCER_TABS` and route `/library` → `<MusicLibraryPage />`.
  - Add `{ id: 'library', label: 'Library', icon: <MusicIcon />, path: '/admin/library' }` to `ADMIN_TABS` (or `ADMIN_MORE_ITEMS` / routes) and routes `/admin/library` → `<MusicLibraryPage />` and `/admin/studio` → `<StudioPage />`.
  - Register `/admin/library` and `/admin/studio` in `ADMIN_ROUTE_PERMS` (`['music.view', 'music.edit', 'videos.view', 'videos.upload', 'videos.edit']`).

