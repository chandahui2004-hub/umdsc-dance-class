# Consolidated Video Upload Notification Design Spec

**Date:** 2026-10-27  
**Status:** Approved via Grill-Me  
**Related Specs:** `docs/superpowers/specs/2026-10-16-music-fix-and-email-notifications-design.md`

## 1. Problem Statement
When an admin uploads multiple class recap videos in a batch (e.g. 8 videos for a class session in `UploadDialog`), the current system calls `videos.register` for each file with `notifyDancers: true`. Each call immediately queries all enrolled dancers for the class style and dispatches an individual email. For 8 videos, dancers receive 8 separate emails within minutes.

## 2. Goals & Success Criteria
- **Single Email Digest:** Enrolled dancers receive exactly **one** consolidated recap email after all videos in an upload batch are uploaded and registered.
- **Clear Information:** The email clearly states the class details and the total number of videos uploaded (e.g. "8 new class recap videos for Bachata Class #1 (2026-10-26) have been uploaded...").
- **Error Safety:** If an upload fails or is cancelled before all files complete, no notification email is sent.
- **Backward Compatibility:** Existing single-video registration routes (such as from `ScanPanel`) remain fully supported.

## 3. Architecture & Design

### 3.1 Backend Route: `videos.notifyBatch`
- **Action:** `videos.notifyBatch`
- **Permission:** `videos.upload` scoped to the session's style (`sessionStyle(ctx, p?.sessionId)`)
- **Payload:**
  ```ts
  {
    sessionId: string;
    videoCount?: number;
  }
  ```
- **Validation:**
  - `sessionId` is required and must reference an active `ClassSession`.
  - Actor must possess `videos.upload` for `session.styleId`.
  - `videoCount` defaults to 1 if omitted or invalid.
- **Email Dispatching Logic:**
  - Query dancers enrolled in `session.styleId` using `readEventMembers(ctx, event)` and `isMemberEnrolledInStyle(...)`.
  - Deduplicate recipient email addresses.
  - Subject:
    - If `videoCount === 1`: `[UMDSC] Class Recap Video Uploaded - {styleName} (Class #{seq} - {date})`
    - If `videoCount > 1`: `[UMDSC] {videoCount} Class Recap Videos Uploaded - {styleName} (Class #{seq} - {date})`
  - Plain text & HTML body formatted with exact count and link to web app: `https://umdsc-dance-class.umdancesportc.workers.dev`.
  - Audit log recorded via `logAudit(ctx, actor, 'videos.notifyBatch', session.id, `${count} videos notified`)`.
  - Returns `{ notifiedCount: number, recipientCount: number }`.

### 3.2 Backend Route: `videos.register` Refinement
- Extract email dispatch logic into a reusable helper `sendRecapNotification(ctx, session, videoCount)`.
- If `payload?.notifyDancers === true` on `videos.register`, call `sendRecapNotification(ctx, session, 1)`.
- If `payload?.notifyDancers === false`, skip sending email.

### 3.3 Frontend: `UploadDialog.tsx`
- While looping through `files`:
  - Pass `notifyDancers: false` to `videos.register`.
- After all files in `files` have successfully finished uploading and registering:
  - If `notifyDancers` is `true`:
    - Display status: `"Notifying dancers via email..."`.
    - Call `api.post('videos.notifyBatch', { sessionId: selectedSessionId, videoCount: files.length })`.
- If an error occurs during any file upload or registration, the loop aborts and `videos.notifyBatch` is never called.

### 3.4 Frontend: `ScanPanel.tsx`
- Retains single-video registration using `videos.register` with `notifyDancers`.

## 4. Testing & Verification
1. **API Unit Tests (`api/test/features/videos.test.ts`):**
   - Verify `videos.notifyBatch` sends 1 email with singular subject/body when `videoCount = 1`.
   - Verify `videos.notifyBatch` sends 1 email with plural subject/body ("8 new class recap videos...") when `videoCount = 8`.
   - Verify permission gating (`videos.upload` required).
   - Verify email deduplication and style enrollment filtering.
   - Verify `videos.register` with `notifyDancers: false` does not send emails.
2. **Web Component Tests (`web/src/features/media/UploadDialog.test.tsx`):**
   - Uploading 2 files calls `videos.register` with `notifyDancers: false` for each file, then calls `videos.notifyBatch` once with `videoCount: 2`.
   - Unchecking "Send email notification..." does not call `videos.notifyBatch`.
   - Upload error aborts and does not call `videos.notifyBatch`.
