# Consolidated Video Upload Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate recap video notification emails so dancers receive exactly one summary email after all videos in an upload batch are uploaded, rather than one email per video.

**Architecture:** Create a `videos.notifyBatch` endpoint on the backend that sends a single email with the total number of uploaded videos to style-enrolled dancers. In the frontend `UploadDialog`, individual video registrations pass `notifyDancers: false`, and upon successful completion of the entire upload batch, `videos.notifyBatch` is called once with the total video count.

**Tech Stack:** TypeScript, Node.js / Google Apps Script API, React, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-consolidated-video-upload-notification-design.md`

## Global Constraints

- Retro 8-bit aesthetic must be preserved.
- Never ask for or store the club Gmail password.
- No spamming real dancers; tests must use mock/fake dancers.
- Maintain backwards compatibility for single video registrations (e.g., from `ScanPanel`).

## Review Focus

1. **Plural vs Singular Email Copy:** Exactly 1 video displays singular text ("The class recap video..."); >1 videos displays plural text ("8 new class recap videos...").
2. **Partial Upload Failure:** If any file fails to upload in a batch of 8, `videos.notifyBatch` must NOT be triggered.
3. **Recipient Deduplication:** Enrolled dancers with multiple records or shared emails only receive 1 email.
4. **Style Scoping & Permission Check:** Actor must have `videos.upload` for the session's style, and only dancers enrolled in that style are emailed.
5. **Checkbox Gating:** Unchecking "Send email notification..." in `UploadDialog` prevents calling `videos.notifyBatch`.

---

### Task 1: Backend `videos.notifyBatch` Endpoint & Shared Notification Helper (TDD)

**Files:**
- Modify: `api/src/features/videos.ts`
- Test: `api/test/features/videos.test.ts`

- [ ] **Step 1: Write failing tests for `videos.notifyBatch` and `videos.register` notification skipping**
  Add unit tests to `api/test/features/videos.test.ts`:
  - `videos.notifyBatch` dispatches 1 email with singular subject and body when `videoCount = 1`.
  - `videos.notifyBatch` dispatches 1 email with plural subject (`[UMDSC] 8 Class Recap Videos Uploaded - {style}`) and plural body ("8 new class recap videos...") when `videoCount = 8`.
  - `videos.notifyBatch` rejects requests if user lacks `videos.upload` for the style.
  - `videos.notifyBatch` skips unenrolled members and deduplicates email addresses.
  - `videos.register` with `notifyDancers: false` does not call `ctx.mail.sendEmail`.

- [ ] **Step 2: Run tests to confirm failure**
  Run: `npm test -w api api/test/features/videos.test.ts`
  Verify that the new tests fail because `videos.notifyBatch` does not exist yet.

- [ ] **Step 3: Implement `sendRecapNotification` helper and `videos.notifyBatch` route**
  In `api/src/features/videos.ts`:
  - Extract `sendRecapNotification(ctx, session, videoCount, actor)` helper.
  - Support singular phrasing for `videoCount === 1` and plural phrasing for `videoCount > 1`.
  - Add route definition for `videos.notifyBatch`:
    - `perm: 'videos.upload'`
    - `write: true`
    - `styleOf: (p, ctx) => sessionStyle(ctx, p?.sessionId)`
    - `bumpsData: false`
    - Handler validates `sessionId`, verifies permission, resolves enrolled members, sends emails via `sendRecapNotification`, records audit log `videos.notifyBatch`, and returns `{ notifiedCount, recipientCount }`.
  - Refactor `videos.register` to call `sendRecapNotification(ctx, session, 1, actor)` when `payload?.notifyDancers === true`.

- [ ] **Step 4: Run tests to confirm pass**
  Run: `npm test -w api api/test/features/videos.test.ts`
  Confirm all tests pass cleanly.

- [ ] **Step 5: Commit changes**
  Commit message: `feat(api): add videos.notifyBatch endpoint for consolidated recap notifications`

---

### Task 2: Frontend `UploadDialog` Batch Notification Integration (TDD)

**Files:**
- Modify: `web/src/features/media/UploadDialog.tsx`
- Test: `web/src/features/media/UploadDialog.test.tsx`

- [ ] **Step 1: Write failing tests in `UploadDialog.test.tsx`**
  Add tests in `web/src/features/media/UploadDialog.test.tsx`:
  - When uploading 2 video files with `notifyDancers = true`:
    - `videos.register` is called for each file with `notifyDancers: false`.
    - `videos.notifyBatch` is called once after all uploads succeed with `{ sessionId: '...', videoCount: 2 }`.
  - When `notifyDancers = false`, `videos.notifyBatch` is not called.
  - When an upload fails on file 1 or 2, `videos.notifyBatch` is not called.

- [ ] **Step 2: Run tests to confirm failure**
  Run: `npm test -w web web/src/features/media/UploadDialog.test.tsx`
  Verify the new assertions fail.

- [ ] **Step 3: Implement batch notification in `UploadDialog.tsx`**
  In `web/src/features/media/UploadDialog.tsx`:
  - In `handleStartUpload`:
    - For each file in `files`, call `api.post('videos.register', { ..., notifyDancers: false })`.
    - After the `files` loop successfully finishes:
      - If `type === 'video'` and `notifyDancers` is true:
        - Set status: `'Notifying dancers via email...'`.
        - Call `await api.post('videos.notifyBatch', { sessionId: selectedSessionId, videoCount: files.length })`.

- [ ] **Step 4: Run tests to confirm pass**
  Run: `npm test -w web web/src/features/media/UploadDialog.test.tsx`
  Confirm all tests pass.

- [ ] **Step 5: Commit changes**
  Commit message: `feat(web): consolidate video upload notifications to single batch email in UploadDialog`

---

### Task 3: Full Test Suite Verification & Production Build

**Files:**
- None (verification across workspace)

- [ ] **Step 1: Run full API test suite**
  Run: `npm test -w api`
  Verify all backend tests pass.

- [ ] **Step 2: Run full Web test suite**
  Run: `npm test -w web`
  Verify all frontend unit/component tests pass.

- [ ] **Step 3: Build production bundle**
  Run: `npm run build`
  Ensure both `@umdsc/api` and `@umdsc/web` build with 0 TypeScript and bundling errors.

---

### Task 4: Deployment & Live Verification

**Files:**
- Deployment to Google Apps Script and Cloudflare Workers

- [ ] **Step 1: Push API to Google Apps Script**
  Run: `npm run push -w api`
  Ensure deployment ID `AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA` is updated.

- [ ] **Step 2: Push changes to Git remote**
  Run: `git push origin main`
  Confirm Cloudflare Workers receives and deploys the new frontend.

- [ ] **Step 3: Verify live deployment**
  Test calling the live web app / endpoint to confirm successful deployment.
