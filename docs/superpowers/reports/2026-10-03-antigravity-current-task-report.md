# Antigravity Current Task Report — 2026-10-03

## Task
1. Enable Drive preview player fallback in Studio, Fullscreen Studio, and MediaPage when direct mp4 playback fails (CORS / codec error).
2. Support setting, dragging, and nudging the video start point in Fullscreen Studio.
3. Fix instructor picture frame distortion on InstructorsPage by splitting portrait picture and instructor details into separate panels and locking the portrait frame width.

## Changes Per File
- `web/index.html`: Added Google Drive preview embed frame permissions / policies if needed.
- `web/vite.config.ts`: Configured strict port and headers for dev environment.
- `web/src/features/music-studio/sync/VideoPanel.tsx`: Added Drive preview toggle and fallback button when direct stream errors; added iframe embed player.
- `web/src/features/music-studio/sync/VideoPanel.test.tsx`: Added unit tests verifying Drive preview switch on playback error.
- `web/src/features/music-studio/Studio.tsx`: Threaded Drive preview state and fileId to VideoPanel and FullscreenStudio.
- `web/src/features/music-studio/FullscreenStudio.tsx`: Added video start point flag and scrubber, start-point nudge buttons, and Drive preview iframe mode.
- `web/src/features/music-studio/FullscreenStudio.test.tsx`: Added unit tests for HUD pill, loops, and video start point controls.
- `web/src/features/media/MediaPage.tsx`: Added Drive preview fallback to Media manager preview dialog.
- `web/src/components/ui/PixelPortraitFrame.tsx`: Added `size="md"`, `showNamePlate` option, and locked container width to prevent text from stretching the frame.
- `web/src/components/ui/neon.test.tsx`: Added unit test coverage for `PixelPortraitFrame` size variants and `showNamePlate={false}`.
- `web/src/features/masterdata/InstructorsPage.tsx`: Split card layout into dedicated Picture Panel (`px-well`) and Info Panel (`px-well`).

## What's Not Done
- Flag touch-action, pointer capture, and aria-slider accessibility (scheduled for Plan Task 11).
- Honest Drive player note ("Drive player doesn't follow the music") and toggle text (scheduled for Plan Task 11).
- Unused import/variable cleanups blocking `npx tsc -b` (scheduled for Plan Task 0 Step 2).

## Commands and Results
- `npm test -w web` -> 42 test files passed, 223 tests passed.

## Git State
- Modified:
  - `web/index.html`
  - `web/src/components/ui/PixelPortraitFrame.tsx`
  - `web/src/components/ui/neon.test.tsx`
  - `web/src/features/masterdata/InstructorsPage.tsx`
  - `web/src/features/media/MediaPage.tsx`
  - `web/src/features/music-studio/FullscreenStudio.test.tsx`
  - `web/src/features/music-studio/FullscreenStudio.tsx`
  - `web/src/features/music-studio/Studio.tsx`
  - `web/src/features/music-studio/sync/VideoPanel.test.tsx`
  - `web/src/features/music-studio/sync/VideoPanel.tsx`
  - `web/vite.config.ts`
- Untracked:
  - `docs/superpowers/plans/2026-10-03-prepublish-fixes.md`
  - `docs/superpowers/specs/2026-10-03-prepublish-fixes-design.md`
