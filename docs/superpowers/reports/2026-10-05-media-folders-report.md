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

