# Audio-Only Enforcement, Fast YouTube Audio & Instant Dancer Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce strict MP3/audio-only file selection (prevent MP4 video uploads in music features), optimize YouTube audio loading to be non-blocking and minimal bandwidth (144p quality), and accelerate dancer login from 15s to <500ms via Google Drive/Sheets server-side caching.

**Architecture:** 
1. Client-side input validation in `SourcePicker` and `UploadDialog` restricting music tracks strictly to audio (`.mp3`, `audio/*`), rejecting `video/mp4`.
2. YouTube IFrame API optimization with non-blocking ready states, origin pre-connects, and `setPlaybackQuality('small')` to eliminate video data overhead.
3. Google Apps Script server-side caching in `eventMembers` and `bootstrap` to eliminate repetitive `Drive.openSpreadsheet` latency during dancer authentication.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Google Apps Script API adapter, Playwright.

---

## Global Constraints
- Retro 8-bit theme per spec §13.1, minimum font size strictly >= 5px.
- Music Studio and music tracks must strictly accept MP3/audio only, not video MP4.
- All existing API and Web tests must pass with zero regressions.

---

### Task 1: Strict Audio/MP3 Enforcement (Exclude MP4/Video)

**Files:**
- Modify: `web/src/features/music-studio/sources/SourcePicker.tsx`
- Modify: `web/src/features/media/UploadDialog.tsx`
- Test: `web/src/features/music-studio/sources/SourcePicker.test.tsx`
- Test: `web/src/features/media/UploadDialog.test.tsx`

- [ ] **Step 1: Write test for audio file validation in `SourcePicker.test.tsx`**
  Verify that when an MP4 or video file is selected, an error message is displayed and `onFileSelected` is not called. When an MP3 is selected, `onFileSelected` is called.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -w web -- SourcePicker.test.tsx`
  Expected: FAIL (test file or assertions not yet matching).

- [ ] **Step 3: Implement validation in `SourcePicker.tsx`**
  - Reject files where `file.type.startsWith('video/')` or `/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name)`.
  - Set `errorMessage = 'Only MP3 or audio files are accepted. Video files (MP4) cannot be used as music.'`
  - Only accept files with `file.type.startsWith('audio/') || /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(file.name)`.

- [ ] **Step 4: Update `UploadDialog.tsx` for MP3 uploads**
  - When `type === 'mp3'`, validate selected files: if any file is video, display warning and disable upload.
  - Fix button text when `type === 'mp3'` to display `START UPLOAD (${files.length} TRACKS)` instead of `VIDEOS`.

- [ ] **Step 5: Run tests and verify they pass**
  Run: `npm test -w web -- SourcePicker.test.tsx`
  Expected: PASS

- [ ] **Step 6: Commit Task 1**
  ```bash
  git add web/src/features/music-studio/sources web/src/features/media
  git commit -m "feat(media): enforce mp3 and audio only for music, rejecting mp4 video"
  ```

---

### Task 2: Fast Non-Blocking YouTube Audio Engine

**Files:**
- Modify: `web/src/features/music-studio/dancecue/components/YouTubePlayer.tsx`
- Modify: `web/src/features/music-studio/dancecue/hooks/useAudioPlayer.ts`
- Test: `web/src/features/music-studio/dancecue/components/YouTubePlayer.test.tsx`

- [ ] **Step 1: Write test for non-blocking YouTube ready state**
  Verify that when `onReady` or `cued` fires, `isApiLoading` becomes false immediately without requiring `getDuration() > 0`.

- [ ] **Step 2: Run test to verify it fails or needs updates**
  Run: `npm test -w web -- YouTubePlayer.test.tsx`

- [ ] **Step 3: Implement optimizations in `YouTubePlayer.tsx`**
  - Add DNS pre-connection / preconnect links for `www.youtube.com`, `s.ytimg.com`, `googlevideo.com`.
  - Set player options: `playerVars: { modestbranding: 1, playsinline: 1, rel: 0, controls: 0, disablekb: 1, fs: 0 }`.
  - In `onReady`: set quality `(event.target as any).setPlaybackQuality?.('small')` to stream minimal 144p video frames, preserving 100% audio fidelity.
  - In `onReady` and `onStateChange`: immediately set `setIsApiLoading(false)`. Do not lock loading behind duration polling.

- [ ] **Step 4: Run tests and verify they pass**
  Run: `npm test -w web -- YouTubePlayer.test.tsx`
  Expected: PASS

- [ ] **Step 5: Commit Task 2**
  ```bash
  git add web/src/features/music-studio/dancecue
  git commit -m "perf(studio): fast non-blocking youtube audio player with 144p stream footprint"
  ```

---

### Task 3: Server-Side Drive/Sheets Caching & Fast Dancer Login

**Files:**
- Modify: `api/src/features/eventMembers.ts`
- Modify: `api/src/features/bootstrap.ts`
- Modify: `api/src/features/auth.ts`
- Test: `api/test/features/bootstrap.test.ts`
- Test: `api/test/features/auth.test.ts`

- [ ] **Step 1: Write tests for caching in `bootstrap.test.ts`**
  Verify that repeated calls to `getDancerBootstrap` do not call `drive.openSpreadsheet` if cached in `ctx.cache`.

- [ ] **Step 2: Run test to verify current behavior**
  Run: `npm test -w api -- bootstrap.test.ts`

- [ ] **Step 3: Implement caching in `eventMembers.ts` & `bootstrap.ts`**
  - In `readEventMembers(ctx, event)`: check cache for `members:${event.id}:${event.membersSpreadsheetId}`. If present, return parsed members. Otherwise fetch and store in cache (600s TTL).
  - In `getDancerBootstrap`: save attendance grid `presentMap` and `gridSessions` into `ctx.cache.put(attKey, ...)` so subsequent logins don't re-read sheets.
  - Cache dancer bootstrap chunk with key `boot:dancer:${matricKey}:${dataVersion}`.

- [ ] **Step 4: Run tests and verify all API tests pass**
  Run: `npm test -w api`
  Expected: ALL 34 test suites PASS.

- [ ] **Step 5: Commit Task 3**
  ```bash
  git add api/src/features api/test/features
  git commit -m "perf(auth): cache event members and attendance sheets for instant dancer login"
  ```

---

### Task 4: Full System Verification & Browser Validation

- [ ] **Step 1: Run all unit and component tests**
  Run: `npm test` across all workspaces.

- [ ] **Step 2: Run Playwright E2E tests**
  Run: `npx playwright test`

- [ ] **Step 3: Verification report**
  Produce clean summary of latency reduction and audio-only enforcement.
