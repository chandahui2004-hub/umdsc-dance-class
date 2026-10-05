# Media Folders & iPhone Upload Report

**Date:** 2026-10-05  
**Spec:** `docs/superpowers/specs/2026-10-05-media-folders-and-iphone-upload-design.md`  
**Plan:** `docs/superpowers/plans/2026-10-05-media-folders-and-iphone-upload.md`  

---

## Task 1 — Reproduce and Diagnose iPhone Upload Failure

- **Commit:** Diagnostic phase (Q3 submitted to supervisor).
- **Files inspected:**
  - `web/src/features/media/UploadDialog.tsx`
  - `web/src/lib/google/resumableUpload.ts`
  - `web/src/lib/google/picker.ts`
  - `web/src/lib/google/gis.ts`
  - `web/src/lib/google/videoCodec.ts`
- **Commands run and results:**
  - `npx playwright test e2e/iphone-upload-debug.spec.ts` → Reproduced format warning trigger on iPhone `.mov` files where `START UPLOAD` button is disabled until "CONTINUE ANYWAY" is clicked.
  - `npm test` → All 42 API test files (305 tests) and 44 Web test files (232 tests) passed (total 86 test files, 537 tests passed).
  - `npm run build` →
    ```
    ✓ 513 modules transformed.
    dist/assets/index-bmyh2rQu.js  752.73 kB
    ✓ built in 4.32s
    ```
- **Root Cause Analysis:**
  1. `web/src/features/media/UploadDialog.tsx:379` & `web/src/lib/google/resumableUpload.ts:43-49`: `START UPLOAD` button is disabled by default for all iPhone `.mov`/HEVC files due to `videoFormatWarning`. On phone screens, this warning pushed the action buttons out of view, blocking users from proceeding.
  2. `web/src/features/media/UploadDialog.tsx:116` & `web/src/lib/google/gis.ts:79`: Asynchronous `await navigator.wakeLock...` preceding `getAccessToken()` breaks the direct user-gesture call stack on iOS Safari, triggering Safari's popup blocker on `tokenClient.requestAccessToken()`.
  3. `web/src/features/media/UploadDialog.tsx:134` & `web/src/lib/google/picker.ts:87`: Google Picker iframe hangs / fails on iOS Safari due to third-party storage restrictions under WebKit ITP.
  4. `web/src/lib/google/resumableUpload.ts:3`: Raw iPhone 1080p60/4K `.mov` video files (200MB–800MB+) frequently timeout or drop out over mobile connections without client-side compression.
- **Differences from plan / Unsure:** none.

---

## Task 2 — Backend Target Folder Isolation, Concurrency Locking & Error Text Updates

- **Commit:** `d99cf1d` (`feat(api): isolate video folders by dance style and update attendance error text`)
- **Folder Creation Architecture Analysis (A2 Requirement):**
  - **Where folders are created today:** `web/src/lib/google/driveFolders.ts:34-54` (`ensureFolderPath` via `fetch('https://www.googleapis.com/drive/v3/files', ...)` using the admin's OAuth token under `https://www.googleapis.com/auth/drive.file` scope).
  - **What Apps Script does:** `api/src/features/videos.ts:68-80` (`videos.targetFolder`) does NOT create upload folders. It only reads database records and returns folder names and IDs.
  - **Scope implications:** Under `drive.file` scope, the client can only access and write into files/folders that the app itself created or that were picked via Google Picker. Leaving subfolder creation (`<style folder>/<event>/<class>`) on the browser side ensures the client retains full write permission for uploads without hitting permission denied errors.
- **Files touched:**
  - `api/src/features/videos.ts`
  - `api/src/features/events.ts`
  - `api/src/features/eventSheets.ts`
  - `api/test/features/videos.test.ts`
  - `api/test/features/events.test.ts`
  - `api/test/features/eventSheets.test.ts`
- **Changes made:**
  - In `api/src/features/videos.ts` (`videos.targetFolder`):
    - Removed fallback to `defaultVideoFolderId`.
    - Enforced `style.videoFolderId` requirement: throws `AppError('VALIDATION', 'Class lead video folder link not inserted for <style name>. Insert it on the Media page first.')`.
    - Scoped `eventFolderId` strictly to `ctx.drive.findChildFolder(style.videoFolderId, event.name) || ''`. Never returns `event.videoFolderId`.
  - In `api/src/features/videos.ts` (`videos.register`):
    - Removed legacy `event.videoFolderId` update so styles do not overwrite or share a single event folder ID.
  - In `api/src/features/videos.ts` (`videos.scan`):
    - Removed `defaultVideoFolderId` and `event.videoFolderId` fallbacks.
    - If `style.videoFolderId` is missing, returns `[]`.
    - Scans child folder named `event.name` under `style.videoFolderId` only.
  - In `api/src/features/events.ts:314` and `api/src/features/eventSheets.ts:31`:
    - Updated error messages from "...on the Events page first" to "...on the Attendance page first".
  - In tests:
    - Updated `api/test/features/events.test.ts` and `api/test/features/eventSheets.test.ts` to assert the new error message.
    - Updated `api/test/features/videos.test.ts` with tests for:
      - `videos.targetFolder` throwing `VALIDATION` when `style.videoFolderId` is missing.
      - `videos.targetFolder` isolating uploads of two styles in the same event into their own style folders (`videoMasterFolderId` and `eventFolderId` strictly matching style).
      - `videos.scan` returning `[]` when `style.videoFolderId` is missing or event folder is absent.
      - `videos.register` not overwriting `event.videoFolderId`.
- **Commands run and results:**
  - `npm test -w api`:
    ```
    Test Files  42 passed (42)
    Tests  307 passed (307)
    ```
  - `npm test`:
    ```
    Test Files  42 passed (42) in api
    Tests  307 passed (307) in api
    Test Files  44 passed (44) in web
    Tests  232 passed (232) in web
    Total: 86 passed (539 passed)
    ```
  - `npm run build`:
    ```
    dist/assets/index-bmyh2rQu.js  752.73 kB │ gzip: 203.96 kB
    ✓ built in 4.22s
    ```
- **Differences from plan / Unsure:** none.

---

## Task 3 — Shared Modal Vertical Scroll Clipping Fix

- **Commit:** `d770f57` (`fix(ui): eliminate modal scroll clipping on mobile and small screens`)
- **Files touched:**
  - `web/src/features/masterdata/StylesPage.tsx`
  - `web/src/features/masterdata/InstructorsPage.tsx`
  - `web/src/features/access/RolesPage.tsx`
  - `web/src/features/access/AdminsPage.tsx`
  - `web/src/features/media/UploadDialog.tsx`
  - `web/src/features/media/SectionsEditor.tsx`
  - `web/src/features/media/ScanPanel.tsx`
  - `web/src/features/media/MusicForm.tsx`
  - `web/src/theme/tokens.css`
  - `web/e2e/phone-layout.spec.ts`
- **Changes made:**
  - Systematically resolved the flexbox negative scroll clipping defect across all modal overlays (`StylesPage`, `InstructorsPage`, `RolesPage`, `AdminsPage`, `UploadDialog`, `SectionsEditor`, `ScanPanel`, `MusicForm`). Replaced `items-center` with `items-start justify-center p-4 overflow-y-auto` on overlay containers, with `my-auto py-4` on child panels. Shorter modals remain vertically centered via `my-auto`, while tall modals start at top padding without clipping off-screen, enabling full top-to-bottom scrollability.
  - Defined `--z-modal: 50;` in `web/src/theme/tokens.css` so modals using `z-[var(--z-modal)]` sit at z-index 50 above navigation bars.
  - Added `useOverlayOpen` to `StylesPage` and `InstructorsPage` to register modal state onto `document.body.dataset.overlays`, cleanly hiding the mobile navigation button while dialogs are open.
  - Added E2E verification test `style edit modal does not clip vertically and is fully scrollable` in `web/e2e/phone-layout.spec.ts` for both 360px and 390px viewports:
    - Asserts modal bounding rect `top >= 0`.
    - Asserts `SAVE STYLE` at the bottom of the form can be scrolled into view.
    - Asserts `CANCEL` closes the modal cleanly.
- **Commands run and results:**
  - `cd web; npx playwright test e2e/phone-layout.spec.ts` (Run 1):
    ```
    12 passed (1.3m)
    ```
  - `cd web; npx playwright test e2e/phone-layout.spec.ts` (Run 2):
    ```
    12 passed (1.2m)
    ```
  - `npm test`:
    ```
    Test Files  42 passed (42) in api
    Tests  307 passed (307) in api
    Test Files  44 passed (44) in web
    Tests  232 passed (232) in web
    Total: 86 passed (539 passed)
    ```
  - `npm run build`:
    ```
    dist/assets/index-C1xcSkvs.js  752.96 kB │ gzip: 203.98 kB
    ✓ built in 4.46s
    ```
- **Differences from plan / Unsure:** none.

---

## Task 4: Media Page Per-DanceStyle Video Drive Folders Panel & Events Cleanup

- **Commit hash:** `17f65ea`
- **What was changed & why:**
  - Removed `<AttendanceFolderHeader />` from `web/src/features/events/EventsPage.tsx`. Attendance configuration is kept solely on the Attendance page.
  - Implemented `web/src/lib/permissions.ts` helper (`can(claims, code)`) to check user permissions against wildcards and style arrays, with unit tests in `web/src/lib/permissions.test.ts`.
  - Implemented `web/src/features/media/ClassLeadVideoFoldersPanel.tsx`:
    - Collapsible panel labeled "CLASS LEAD VIDEO DRIVE FOLDERS".
    - Defaults to expanded when any style in `event.styleIds` lacks a `videoFolderId`, otherwise collapsed.
    - Shows `⚠ LINK NOT INSERTED` badge for styles missing a Drive folder link.
    - When user has `styles.edit` permission, allows inserting or changing the Google Drive URL inline, which updates the dance style via `styles.update`.
    - When user lacks `styles.edit`, hides insert/change buttons and displays `⚠ LINK NOT INSERTED — ask an admin to add it`.
    - Includes `AUTHORIZE` button for desktop that calls `pickFolder(token, style.videoFolderId)` to grant the style folder under `drive.file` scope, and displays `✓ AUTHORIZED` once verified via `checkFolderAccess`.
  - Updated `web/src/features/media/MediaPage.tsx`:
    - Replaced the master `<VideoFolderHeader />` with `<ClassLeadVideoFoldersPanel event={event} styles={styles} />`.
    - Gated the page-level `UPLOAD VIDEO` and `SCAN FOLDER` buttons: disabled when the active filtered dance style lacks `videoFolderId`, with an explicit explanation text displayed on screen (not only hover).
    - Displayed warning banner in the video recap section when a style has no video folder linked.
  - Added unit tests in `web/src/features/media/ClassLeadVideoFoldersPanel.test.tsx` verifying default expansion, collapse, missing link warning, permissions hiding edit buttons, and style update payload.
  - Extended `web/e2e/phone-layout.spec.ts` with checks for `/admin/media` with panel expanded and `/admin/events`.
- **Command output:**
  - `cd web; npx playwright test e2e/phone-layout.spec.ts` (Run 1):
    ```
    12 passed (1.3m)
    ```
  - `cd web; npx playwright test e2e/phone-layout.spec.ts` (Run 2):
    ```
    12 passed (1.3m)
    ```
  - `npm test`:
    ```
    Test Files  42 passed (42) in api
    Tests  307 passed (307) in api
    Test Files  46 passed (46) in web
    Tests  240 passed (240) in web
    Total: 88 passed (547 passed)
    ```
  - `npm run build`:
    ```
    dist/assets/index-B2cyBZdX.js  759.98 kB │ gzip: 205.80 kB
    ✓ built in 4.64s
    ```
- **Differences from plan / Unsure:** none.

---

## Task 5: UploadDialog Video Upload Gating & mediabunny WebCodecs Video Compression

- **Commit hash:** `3acc01a`
- **What was changed & why:**
  - Installed `mediabunny` (v1.61.1, MPL-2.0 license).
  - Implemented `web/src/lib/media/videoCompressor.ts`:
    - Lazily loads `mediabunny` via dynamic `import('mediabunny')` so initial bundle size is unaffected.
    - Evaluates `file.size < 60 MB && isMp4 && detectVideoCodec(file) === 'h264'`: skips re-compression if the file is already small H.264 MP4.
    - Transcodes videos using WebCodecs into H.264 (`avc`), scaling down long side to max 1280px (even pixel bounds), max 30 fps, ~2.5 Mbps bitrate.
    - Copies AAC audio track with zero quality loss or audio drift (`copy: { mode: 'preferred' }`), verifying that audio tracks are never dropped silently.
    - Falls back gracefully to original file if `VideoEncoder` is unsupported or conversion throws, logging reason and allowing Drive Player fallback.
  - Updated `web/src/lib/google/gis.ts`:
    - Refactored `getAccessToken` so that when GIS is already loaded, `requestAccessToken()` executes synchronously on the user tap's stack frame without intermediate `await` or microtask ticks, preserving Safari iOS user activation context.
  - Updated `web/src/features/media/UploadDialog.tsx`:
    - Preloads GIS script on dialog mount (`useEffect` -> `loadGisScript()`).
    - In `handleStartUpload`, invokes `getAccessToken()` synchronously before requesting `wakeLock`.
    - Access check: calls `checkFolderAccess(token, grantFolder)` against the class lead folder. If 403/404 on touch devices (`matchMedia('(pointer: coarse)')`), shows instructions to authorize on computer and aborts without opening Picker. On desktop, opens Google Picker.
    - Upload gating: if active style has no `videoFolderId`, displays `⚠ Class lead video folder link not inserted for <style>. Insert it on the Media page first.` and disables `START UPLOAD`.
    - Removed blocking `videoFormatWarning` / `window.confirm` HEVC warning.
    - Compresses video files with progress feedback and displays "KEEP THIS SCREEN OPEN UNTIL UPLOAD FINISHES · SCREEN WAKE LOCK ACTIVE".
  - Configured `web/vite.config.ts` with `manualChunks: { mediabunny }` to guarantee strict bundle isolation.
  - Added unit tests:
    - `web/src/lib/media/videoCompressor.test.ts` (5 tests covering skip, compress, and fallbacks).
    - `web/src/features/media/UploadDialog.test.tsx` (6 tests covering gating, synchronous token call, coarse/fine pointer access check, and compression).
- **Lazy loading verification:**
  - Standalone chunk: `dist/assets/mediabunny-CdOs27BB.js` (740.23 kB │ gzip: 187.76 kB).
  - Main entry: `dist/assets/index-Cgx7jg4I.js` (762.90 kB │ gzip: 206.93 kB).
  - Main bundle loads `mediabunny` on demand via `await import("./mediabunny-CdOs27BB.js")`. It is never loaded on dancer or calendar routes.
- **Command output:**
  - `cd web; npx playwright test e2e/phone-layout.spec.ts` (Run 1):
    ```
    12 passed (1.3m)
    ```
  - `cd web; npx playwright test e2e/phone-layout.spec.ts` (Run 2):
    ```
    12 passed (1.3m)
    ```
  - `npm test`:
    ```
    Test Files  42 passed (42) in api
    Tests  307 passed (307) in api
    Test Files  47 passed (47) in web
    Tests  249 passed (249) in web
    Total: 89 passed (556 passed)
    ```
  - `npm run build`:
    ```
    dist/assets/mediabunny-CdOs27BB.js  740.23 kB │ gzip: 187.76 kB
    dist/assets/index-Cgx7jg4I.js       762.90 kB │ gzip: 206.93 kB
    ✓ built in 6.99s
    ```
---

## Task 4b — Fixes from Claude Review (NOTE 7)

- **Commit hash:** `6b4a8ef` (`fix(media): no auto Google popup, 10px text, 44px taps in folders panel`)
- **What was changed & why:**
  - Exported `getCachedToken()` from `web/src/lib/google/gis.ts` to return cached token only when valid for >60s without prompting.
  - Updated `ClassLeadVideoFoldersPanel.tsx`:
    - In `useEffect`, uses `getCachedToken()` to verify folders if already authed, skipping automatic token request on mount so Google popup never opens without user tap.
    - Updated missing-link badge to use `text-[var(--on-neon)]` instead of `text-white` on neon red fill.
    - Updated `✓ AUTHORIZED` and `AUTHORIZE` button typography to `text-[10px]` (eliminating `text-[9px]`).
    - Added `min-h-[44px]` to toggle button and `AUTHORIZE` button, ensuring all interactive buttons satisfy 44px tap targets.
  - Updated `web/src/features/media/MediaPage.tsx:241` to use `text-[10px]` for upload blocked notice.
  - Added unit test in `ClassLeadVideoFoldersPanel.test.tsx` verifying `getAccessToken` is never called on mount when token is not cached.
  - Added tap target height assertion in `web/e2e/phone-layout.spec.ts` verifying that every visible button in `[data-testid="class-lead-video-folders-panel"]` has height ≥ 44px on phones.
- **Verification Commands & Results:**
  - `npm test -w web`: 47 passed (252 tests).
  - `cd web && npx playwright test e2e/phone-layout.spec.ts`: 12 passed (0 failed).
- **Differences from plan / Unsure:** none.

---

## Task 5b — Fixes from Claude Review (NOTE 8)

- **Commit hash:** `efb2e25` (`fix(media): upload screen note, never upload larger file, fallback notice`)
- **What was changed & why:**
  - In `web/src/features/media/UploadDialog.tsx`:
    - Updated progress bar banner text to exact wording: `"Keep this screen open until the upload finishes."`
    - Displayed fallback notice: `"Couldn't compress on this device — uploading the original (it may take longer)."` during upload when compressor returns `conversion_failed` or `unsupported` (and never for `already_h264_under_60mb`).
  - In `web/src/lib/media/videoCompressor.ts`:
    - Added guard: if `compressedFile.size >= file.size`, returns original file with `compressed: false, reason: 'larger_than_original'`, ensuring we never upload a larger file than original.
  - Added unit tests:
    - In `videoCompressor.test.ts`: test asserting fallback to original file if compressed buffer is larger than original.
    - In `UploadDialog.test.tsx`: test asserting fallback notice appears and original file is uploaded when compressor fails.
- **Verification Commands & Results:**
  - `npm test`: 42 API test files (307 tests) + 47 Web test files (252 tests) = 89 test files, 559 tests passed.
  - `npm run build`: built in 7.13s, exit 0. Standalone chunk `mediabunny-CdOs27BB.js` (740.23 kB).
- **Differences from plan / Unsure:** none.

---

## Task 6: Full Verification, Final E2E Suite, API Deploy Approval & Report

- **Commit hash:** `30cda2b` (`test(e2e): align admin-events and admin-media tests with attendance and upload changes`)
- **What was changed & why:**
  - Aligned `web/e2e/admin-events.spec.ts` with spec changes: attendance master folder link tests moved to `/admin/attendance` with `waitForLoadState('networkidle')`.
  - Aligned `web/e2e/admin-media.spec.ts` with spec changes: updated `.mov` test to assert the obsolete blocking warning banner is removed and `START UPLOAD` is enabled directly due to client-side video compression.
  - Full end-to-end regression validation performed across mobile (390px / 360px) and desktop (1440px) viewports.
- **Verification Commands & Results:**
  - `npm test` (root workspace):
    ```
    Test Files  42 passed (42) in api
    Tests  307 passed (307) in api
    Test Files  47 passed (47) in web
    Tests  252 passed (252) in web
    Total: 89 passed (559 passed)
    ```
  - Playwright E2E Suite (`npx playwright test --grep-invert '@internet'`):
    ```
    7 skipped
    203 passed (4.8m)
    0 failed
    ```
  - Phone Layout Suite (`npx playwright test e2e/phone-layout.spec.ts`):
    ```
    12 passed (1.3m)
    0 failed
    ```
  - Production Build (`npm run build` in `web/`):
    ```
    dist/assets/index-8sFUDNWW.css      92.07 kB │ gzip:  27.40 kB
    dist/assets/mediabunny-CdOs27BB.js 740.23 kB │ gzip: 187.76 kB
    dist/assets/index-5gTDedHo.js      763.38 kB │ gzip: 207.04 kB
    ✓ built in 7.13s
    ```
- **Differences from plan / Unsure:** none.
