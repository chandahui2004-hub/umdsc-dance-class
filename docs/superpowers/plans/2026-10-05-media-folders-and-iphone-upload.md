# Implementation Plan — Per-DanceStyle Video Drive Folders, iPhone Video Compression & UI Scroll Fixes

**Spec:** `docs/superpowers/specs/2026-10-05-media-folders-and-iphone-upload-design.md`  
**Report:** `docs/superpowers/reports/2026-10-05-media-folders-report.md`  
**Supervisor Directives:** NOTE 6 and A1 incorporated.

---

## Task 1: Reproduce and Diagnose the iPhone Upload Failure

- **Files touched:**
  - `web/e2e/iphone-upload-debug.spec.ts` (temporary / diagnostic test)
  - `web/src/features/media/UploadDialog.tsx`
  - `web/src/lib/google/resumableUpload.ts`
  - `web/src/lib/google/picker.ts`
  - `web/src/lib/google/gis.ts`
- **Actions:**
  1. Inspect the upload flow on Mobile Safari / WebKit iPhone 14 profile (`projects: [{ name: 'Mobile Safari', use: { ...devices['iPhone 14'] } }]`) with mocked Drive API endpoints.
  2. Analyze the code path for iOS-specific blockers:
     - OAuth popup blocked if `tokenClient.requestAccessToken()` is called asynchronously or separated from user gesture.
     - `videoFormatWarning` triggering blocking alerts or format warnings disabling the submit button.
     - Memory / buffer consumption in `detectVideoCodec`.
     - Google Picker iframe failure under Safari ITP.
     - Screen sleep / tab suspension handling.
  3. Formulate the precise root cause (file:line and evidence).
  4. Write `## Q3 — Task 1 — iPhone Upload Failure Root Cause` in `docs/superpowers/supervisor/inbox.md` and run `node docs/superpowers/supervisor/wait.mjs 3`.
  5. Wait for Claude's answer before starting compression implementation.
- **Verification:**
  - Diagnosis documented with reproducible trace; Q3 answered by Claude.
  - Run `npm test` (all workspaces) and `npm run build`.
  - Append Task 1 report section to `docs/superpowers/reports/2026-10-05-media-folders-report.md`.

---

## Task 2: Backend Target Folder Isolation, Concurrency Locking & Error Text Updates

- **Files touched:**
  - `api/src/features/videos.ts`
  - `api/src/features/events.ts`
  - `api/src/features/eventSheets.ts`
  - `api/test/features/videos.test.ts`
- **Actions:**
  1. Investigate who creates folders today:
     - Identify whether Apps Script (`ctx.drive`, full Drive access as club account) or the browser (`web/src/lib/google/driveFolders.ts` via OAuth token with `drive.file` scope) creates subfolders.
     - Document the exact findings (`file:line`) in the Task 2 report section.
     - Keep that same side creating `<style folder>/<event>/<class>` subfolders to preserve upload permissions.
  2. In `api/src/features/videos.ts`:
     - In `videos.targetFolder`: Require `style.videoFolderId`. If empty, throw `AppError('VALIDATION', 'Class lead video folder link not inserted for <style name>. Insert it on the Media page first.')`.
     - Remove fallback to `ctx.db.settings.find('defaultVideoFolderId')`.
     - Under `ctx.lock`, find or create child folder named `event.name` under `style.videoFolderId`.
     - Return `{ videoMasterFolderId: style.videoFolderId, eventFolderId, eventFolderName: event.name, classFolderName, musicFolderName }`.
     - In `videos.scan`: Only scan folder named `event.name` under `style.videoFolderId`. If `style.videoFolderId` is missing, return `[]`.
     - In `videos.register`: Retain existing videos; do not clear `event.videoFolderId` in database for past data.
  3. In `api/src/features/events.ts:314` and `api/src/features/eventSheets.ts:31`:
     - Update error text from "Set the attendance master folder on the Events page first" to "Set the attendance master folder on the Attendance page first".
  4. Tests in `api/test/features/videos.test.ts`:
     - Test `videos.targetFolder` throws when `style.videoFolderId` is missing.
     - Test `videos.targetFolder` isolates uploads of two styles in the same event into their own style folders.
     - Test `videos.scan` uses `style.videoFolderId` and returns empty if missing.
- **Verification:**
  - `npm test` (all workspaces) passes.
  - `npm run build` exits 0.
  - Append Task 2 report section with folder creation findings.
  - Commit: `feat(api): isolate video folders by dance style and update attendance error text`.

---

## Task 3: Shared Modal Vertical Scroll Clipping Fix

- **Files touched:**
  - `web/src/features/masterdata/StylesPage.tsx`
  - `web/src/features/media/UploadDialog.tsx`
  - `web/src/features/events/steps/EventFormDialog.tsx` (and any other modal overlay using `fixed inset-0` with `items-center`)
  - `web/e2e/phone-layout.spec.ts`
- **Actions:**
  1. Grep all `fixed inset-0` overlays across `web/src/`.
  2. For every modal with scrollable content, replace `items-center` centering with `items-start justify-center overflow-y-auto p-4` (with `my-auto` or `max-h-[calc(100vh-2rem)]` scroll body).
  3. Ensure the top title and first fields have `top >= 0` and are never pushed above the scroll boundary.
  4. In `web/e2e/phone-layout.spec.ts`:
     - Add test: Open the style edit modal at 360px viewport.
     - Assert modal bounding rect `top >= 0`.
     - Assert the bottom-most button/field can be scrolled into view.
- **Verification:**
  - `cd web && npx playwright test e2e/phone-layout.spec.ts` passes on both `desktop` and `mobile` projects.
  - `npm test` (all workspaces) passes.
  - `npm run build` exits 0.
  - Append Task 3 report section.
  - Commit: `fix(ui): eliminate modal scroll clipping on mobile and small screens`.

---

## Task 4: Media Page Per-DanceStyle Video Drive Folders Panel & Events Page Cleanup

- **Files touched:**
  - `web/src/features/events/EventsPage.tsx`
  - `web/src/features/media/MediaPage.tsx`
  - `web/src/features/media/ClassLeadVideoFoldersPanel.tsx` (new component)
  - `web/src/features/media/ClassLeadVideoFoldersPanel.test.tsx` (new unit test)
  - `web/e2e/phone-layout.spec.ts`
- **Actions:**
  1. In `web/src/features/events/EventsPage.tsx`:
     - Remove `<AttendanceFolderHeader />` and unused imports.
  2. In `web/src/features/media/MediaPage.tsx`:
     - Remove `<VideoFolderHeader />`.
     - Add `<ClassLeadVideoFoldersPanel />`:
       - Default `expanded = eventStyles.some(s => !s.videoFolderId)`.
       - For each style in `event.styleIds`:
         - Style swatch, name, link status (`open ↗` or `⚠ LINK NOT INSERTED`).
         - If user has `styles.edit` permission: show `[+ INSERT LINK]` / `[CHANGE LINK]`.
         - If user lacks permission: show `⚠ LINK NOT INSERTED — ask an admin to add it`.
         - Inline URL input with `styles.update` mutation.
     - In `MediaPage.tsx`:
       - If active style lacks `videoFolderId`:
         - Disable `UPLOAD VIDEO` button with clear visible status text explaining the folder is required.
         - Show banner in class recap section prompting configuration.
  3. Unit test `ClassLeadVideoFoldersPanel.test.tsx`:
     - Expanded when one event style has no link.
     - Collapsed when all event styles have links.
     - `⚠ LINK NOT INSERTED` shown for the missing one.
     - `[+ INSERT LINK]` / `[CHANGE LINK]` buttons hidden without `styles.edit`, with "ask an admin" text shown instead.
     - Saving calls `styles.update` with `{ id, version, videoFolderUrl }`.
  4. Update `web/e2e/phone-layout.spec.ts` to test `/admin/media` (expanded & collapsed) and `/admin/events`.
- **Verification:**
  - `npm test` (all workspaces) passes.
  - `cd web && npx playwright test e2e/phone-layout.spec.ts` passes (both projects).
  - `npm run build` exits 0.
  - Append Task 4 report section.
  - Commit: `feat(media): per-dancestyle video drive folders panel and upload gating`.

---

## Task 5: UploadDialog Video Upload Gating & mediabunny WebCodecs Video Compression

- **Files touched:**
  - `web/package.json`
  - `web/src/features/media/UploadDialog.tsx`
  - `web/src/features/media/UploadDialog.test.tsx`
  - `web/src/lib/media/videoCompressor.ts` (new module)
  - `web/src/lib/media/videoCompressor.test.ts` (new test)
- **Actions:**
  1. Install `mediabunny` in `web/` (MPL-2.0 license).
  2. In `UploadDialog.tsx`:
     - Gating: If selected class's style has no `videoFolderId`, show warning and disable `START UPLOAD`.
     - Remove `window.confirm` HEVC warning.
  3. In `web/src/lib/media/videoCompressor.ts`:
     - Lazily load `mediabunny` via dynamic `import('mediabunny')`.
     - Skip compression if file is already H.264 MP4 and < 60 MB.
     - Transcode to H.264 MP4 with max 1280px long side, max 30 fps, ~2.5 Mbps.
     - Passthrough / copy AAC audio track.
     - Fallback to original file if VideoEncoder is unsupported or conversion throws.
     - Progress callback during compression; display "Keep this screen open until the upload finishes".
  4. Tests:
     - `videoCompressor.test.ts` mocking mediabunny (skip, compress, fallback).
     - `UploadDialog.test.tsx`: test that `START UPLOAD` is disabled for a class whose style has no link.
  5. Lazy-loading verification:
     - Run `npm run build`.
     - Inspect `web/dist/assets/` to verify `mediabunny` is in its own standalone chunk, not bundled in main `index-*.js`. Grep for a mediabunny identifier and record chunk name and size in the report.
- **Verification:**
  - `npm test` (all workspaces) passes.
  - `npm run build` exits 0.
  - Append Task 5 report section.
  - Commit: `feat(media): client-side video compression with mediabunny and upload gating`.

---

## Task 6: Full Verification, Final E2E Suite, API Deploy Approval & Report

- **Files touched:**
  - `docs/superpowers/reports/2026-10-05-media-folders-report.md`
- **Actions:**
  1. Run full test suites:
     - `npm test` across root workspaces.
     - `cd web && npx playwright test --grep-invert @internet` (FULL e2e suite: 0 failed).
     - `npm run build` (must exit 0).
  2. Write Q to Claude in `inbox.md`: "Ready to deploy API?" with test summary lines, and run `wait.mjs`.
  3. Once Claude approves, execute API deploy:
     - `cd api && npm run push`
     - Run the redeploy command from `docs/SETUP-VALUES.md`.
  4. Write final Q in `inbox.md`: "READY FOR CLAUDE REVIEW" and run `wait.mjs`.
  5. Claude performs the final review and `git push`, then prompts the owner to test on iPhone.
  6. Finalize report in `docs/superpowers/reports/2026-10-05-media-folders-report.md`.
- **Verification:**
  - Clean build, all tests pass, report documented.
