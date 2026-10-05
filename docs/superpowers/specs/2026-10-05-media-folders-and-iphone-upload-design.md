# Spec — Per-DanceStyle Video Drive Folders, iPhone Video Compression & UI Scroll Fixes

**Date:** 2026-10-05  
**Topic:** Per-DanceStyle Class Lead Video Drive Folders, Media Page Panel, Events Page Cleanup, iPhone Video Compression (mediabunny), and Modal Scroll Fix  
**Supervisor Review:** Incorporates all directives from Claude Supervisor NOTE 6.

---

## 1. Objectives & Scope

1. **Events Page Attendance Header Removal**:
   - Remove `<AttendanceFolderHeader />` from `web/src/features/events/EventsPage.tsx`.
   - Attendance master folder link remains managed on `/admin/attendance`.
   - Update error messages in `api/src/features/events.ts:314` and `api/src/features/eventSheets.ts:31` from "on the Events page first" to "on the Attendance page first".

2. **Per-DanceStyle Class Lead Video Folders on Media Page**:
   - Remove `<VideoFolderHeader />` from `web/src/features/media/MediaPage.tsx` and eliminate all fallback to `defaultVideoFolderId`.
   - Add a collapsible panel at the top of `MediaPage`: "CLASS LEAD VIDEO DRIVE FOLDERS".
     - Default state: uses only styles in the current event (`event.styleIds`): `expanded = eventStyles.some(s => !s.videoFolderId)`.
     - Permission gating: Show `[+ INSERT LINK]` / `[CHANGE LINK]` only when `can(perms, 'styles.edit')`. Otherwise, the row shows `⚠ LINK NOT INSERTED — ask an admin to add it`.
     - Displays style color swatch, name, link status (`open ↗` or `⚠ LINK NOT INSERTED`), and button to edit/insert Drive link.
     - Editing uses existing `styles.update` API (accepts `videoFolderUrl` and preserves `videoFoldersJson` history) without changing the API contract.
   - Video upload gating:
     - On the Media page: If the active style lacks `videoFolderId`, disable the "UPLOAD VIDEO" button with visible warning text, and display an explanatory banner in the recaps section.
     - Inside `UploadDialog`: When a class session is selected whose style lacks `videoFolderId`, display the same warning and disable `START UPLOAD`.
   - Data preservation: Old videos stay where they are. Do not move or delete any Drive files, and do not clear `event.videoFolderId` in the database; simply cease referencing `event.videoFolderId` or `defaultVideoFolderId` for new uploads and scans.

3. **Backend Target Folder Isolation & Concurrency**:
   - In `api/src/features/videos.ts` (`videos.targetFolder` and `videos.scan`):
     - Require `style.videoFolderId`. If missing, throw `AppError('VALIDATION', 'Class lead video folder link not inserted for <style name>. Insert it on the Media page first.')`. (Scan returns `[]`).
     - Remove `ctx.db.settings.find('defaultVideoFolderId')` fallback.
     - Target hierarchy: `<style.videoFolderId> / <event.name> / <classFolderName>`.
     - Do not use global `event.videoFolderId` across multiple styles.
     - Find or create child folders safely under `ctx.lock` to avoid duplicate folder creation under concurrent uploads.

4. **iPhone Video Upload & Client-Side Compression**:
   - Diagnostic Gate (Task 1): First reproduce and diagnose the exact root cause of iPhone upload failure on the WebKit iPhone 14 profile with mocked Google endpoints. Report the root cause (file:line and evidence) as a Q in `inbox.md` and wait for Claude's response before proceeding with compression implementation.
   - Remove `window.confirm` from `videoFormatWarning`.
   - Use `mediabunny` (MPL-2.0) with dynamic `import()` in `UploadDialog.tsx`:
     - Transcode and compress video to long side <= 1280px (720p), max 30 fps, ~2.5 Mbps H.264 (`avc`).
     - Audio: Copy existing AAC track without re-encoding; re-encode only if needed and `AudioEncoder` supported. Never drop audio.
     - Skip compression if file is already H.264 MP4 and < 60 MB.
     - Fallback to original file if `VideoEncoder` is unsupported or conversion throws.
     - Show compression progress % and "Keep this screen open until the upload finishes".
     - Never use `ffmpeg.wasm` (COOP/COEP / SharedArrayBuffer issues) or `MediaRecorder` canvas recording (audio drift / real-time only).

5. **Modal Vertical Scroll Clipping Fix**:
   - In all modals (`StylesPage.tsx`, `UploadDialog.tsx`, etc.) with `fixed inset-0` overlays:
     - Replace `items-center` centering on scrollable containers with `items-start justify-center overflow-y-auto p-4` (or scrollable panel body).
     - Prevent negative scroll clipping when modal height exceeds screen height.
   - Verify with Playwright test at 360px mobile viewport: modal top is >= 0 and last field is scrollable into view.

6. **Mobile Layout & Test Coverage**:
   - Full Playwright phone layout tests (`web/e2e/phone-layout.spec.ts`) across both desktop and mobile projects.
   - Unit tests for backend target folder isolation and video compression flow.

---

## 2. Architecture & Data Flow

### 2.1 Backend Video Target Folder Resolution

```
User triggers upload for Session (styleId, eventId)
                │
                ▼
        API: videos.targetFolder
                │
        ┌───────┴────────────────────────┐
        ▼                                ▼
style.videoFolderId is empty?     style.videoFolderId present?
        │                                │
        ▼                                ▼
Throw VALIDATION error            Acquire ctx.lock
"Class lead video folder         Find or create subfolder `event.name`
link not inserted..."             inside `style.videoFolderId`
                                  Return target:
                                  - videoMasterFolderId: style.videoFolderId
                                  - eventFolderId: (style-specific event subfolder)
                                  - eventFolderName: event.name
                                  - classFolderName: `${date} ${style.name} Class ${seq}`
```

### 2.2 Client-Side Video Upload & Compression Pipeline

```
User selects file(s) in UploadDialog
                │
                ▼
Evaluate file format & size
                │
    ┌───────────┴───────────────────────────────┐
    ▼                                           ▼
Already H.264 MP4 and < 60MB?        MOV / HEVC / Non-MP4 or >= 60MB
    │                                           │
    ▼                                           ▼
Skip compression                     Dynamically load mediabunny
                                     VideoEncoder available?
                                     ┌──────────┴───────────────┐
                                     ▼                          ▼
                                   Yes                          No / Error
                                     ▼                          ▼
                         Transcode to H.264 MP4        Fallback to original
                         (max 1280px, 30fps, 2.5Mbps)   (show note)
                         AAC track copy / passthrough
                                     │                          │
                                     └──────────┬───────────────┘
                                                ▼
                                   Resumable Upload to Google Drive
                                   in 8 MiB chunks
```

---

## 3. Component & UI Specifications

### 3.1 `MediaPage.tsx`
- **Class Lead Video Drive Folders Panel**:
  - Placed below the page header.
  - Header: `CLASS LEAD VIDEO DRIVE FOLDERS` with toggle button (`▼ EXPAND` / `▲ COLLAPSE`).
  - State: initialized to `styles.some(s => !s.videoFolderId)`.
  - For each style in `event.styleIds`:
    - Row with style badge (colored by `style.colorKey`).
    - If `style.videoFolderId`:
      - Shows `Drive: <folder link> [OPEN ↗]` and button `[CHANGE LINK]`.
    - If empty:
      - Shows badge `<span className="text-[var(--neon-red)] font-bold">⚠ LINK NOT INSERTED</span>` and button `[+ INSERT LINK]`.
    - Inline edit form with input and `[SAVE]` / `[CANCEL]`.
    - Mutates via `styles.update` with payload `{ id: style.id, version: style.version, videoFolderUrl: url }`.
- **Upload Video Button Gating**:
  - If active style has no `videoFolderId`:
    - Button disabled: `disabled={!activeStyle || !activeStyle.videoFolderId}`.
    - Accompanying text or helper: `"Video folder link not set for <Style>"`.
    - Banner inside the class recaps panel prompting user to configure folder above.

### 3.2 `EventsPage.tsx`
- Remove `<AttendanceFolderHeader />`.
- Clean layout without orphaned imports.

### 3.3 Modal Container Fix (`StylesPage.tsx`, `UploadDialog.tsx`, etc.)
- Replace:
  ```html
  <div className="fixed inset-0 bg-[var(--night-1)]/80 z-[var(--z-modal)] flex items-center justify-center p-4 overflow-y-auto">
  ```
  With:
  ```html
  <div className="fixed inset-0 bg-[var(--night-1)]/80 z-[var(--z-modal)] flex items-start justify-center p-4 overflow-y-auto">
    <div className="w-full max-w-2xl my-auto py-6">
  ```
- Ensures modal top never has negative offset when overflowing, allowing natural scrolling from line 0 down to bottom buttons.

---

## 4. Testing Strategy

1. **Unit Tests**:
   - `api/test/features/videos.test.ts`:
     - Test: `videos.targetFolder` throws when `style.videoFolderId` is missing (no master fallback).
     - Test: `videos.targetFolder` creates/uses style-specific event subfolder inside `style.videoFolderId`.
     - Test: Two styles in the same event isolate their uploads to distinct root folders.
     - Test: `videos.scan` uses `style.videoFolderId` and returns empty if missing.
   - `web/src/lib/media/videoCompressor.test.ts`:
     - Test: Skip compression for small H.264 MP4.
     - Test: Compress triggers mediabunny conversion with correct target parameters.
     - Test: Fallback to original file when VideoEncoder throws or is unavailable.

2. **End-to-End Tests**:
   - `web/e2e/phone-layout.spec.ts`:
     - Test: Style edit modal opens at 360px viewport; top >= 0, bottom fields scrollable.
     - Test: Media page phone layout with expanded and collapsed class lead folders panel.
     - Test: Events page phone layout without attendance header.
   - Run both `desktop` and `mobile` projects with zero failures.

---

## 5. Review & Approval
Submitted to Claude Supervisor via `docs/superpowers/supervisor/inbox.md` for approval before implementation.
