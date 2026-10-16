# Music Link Fix & Automated Dancer Email Notifications Design

**Date**: 2026-10-16  
**Status**: Approved  
**Author**: Antigravity & Club Admin  

---

## 1. Overview & Goals

This project addresses two core areas of the UMDSC Dance Class System:
1. **Music Link Robustness & Error Handling**: Resolves issues where valid YouTube links (e.g. pasted without `https://`, copied with playlist/radio query parameters `&list=RD...`, or with invisible unicode whitespace) are rejected by `parseMusicLink`, and clarifies 404 video-not-found errors when a video ID is mistyped.
2. **Automated Dancer Email Notifications**:
   - **Class Recap Video Upload**: When an admin uploads or scans a class recap video, an optional (default-checked) notification email is sent from the UMDSC club Gmail account (`umdancesportc@gmail.com`) to all dancers enrolled in that specific dance style, linking them directly to the UMDSC website portal (`https://umdsc-dance-class.umdancesportc.workers.dev`).
   - **New Member Registration Confirmation**: When new members are detected and added to an event during Google Form response sheet sync (`events.sync`), the system automatically sends a personalized welcome and confirmation email from the UMDSC account with their enrolled styles and portal link.

---

## 2. YouTube Music Link Parser Fix

### 2.1 Problem Statement
1. `parseMusicLink(input)` in `shared/src/musicLinks.ts` calls `new URL(text)`. If a user pastes `www.youtube.com/...` or `youtube.com/...` without `https://`, `new URL()` throws a TypeError, triggering the catch block which rejects the link with `"Use a YouTube, Spotify, SoundCloud or Google Drive MP3 link"`.
2. When users copy links from YouTube Mixes or radios, the URL includes `&list=RD...` and other query parameters.
3. When a video ID is mistyped (e.g., `kbHO94273yY` instead of `kbHG94Z73yY`), YouTube's oEmbed endpoint returns HTTP 404. In `api/src/features/musicLinks.ts`, the error was not descriptive enough to guide the user to check their ID.
4. Input text fields lacked `spellCheck={false}` and `autoCapitalize="off"`, causing browsers to display red squiggles under URL components.

### 2.2 Solution Details
- **`shared/src/musicLinks.ts`**:
  - Sanitize input by stripping zero-width unicode characters (`\u200B`, `\uFEFF`, etc.) and non-breaking spaces before trimming.
  - Prepend `https://` if the input begins with `youtube.com/`, `youtu.be/`, `www.youtube.com/`, `music.youtube.com/`, `open.spotify.com/`, or `soundcloud.com/` without a scheme.
  - In `getYouTubeVideoId`: handle query parameters cleanly, extracting the 11-character video ID from watch URLs regardless of trailing `&list=`, `&index=`, or `&t=` parameters.
- **`api/src/features/musicLinks.ts`**:
  - When YouTube's oEmbed endpoint returns 404, throw `AppError('LINK_INVALID', 'That YouTube video was not found. Please check that the link or video ID is correct.')`.
- **`web/src/features/media/MusicForm.tsx`**:
  - Add `spellCheck={false}` and `autoCapitalize="off"` to the link input element.

---

## 3. Email Notification Subsystem Architecture

### 3.1 Port Definition (`api/src/ports.ts`)
Add `MailPort` to `ports.ts`:
```typescript
export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  body: string;
  htmlBody?: string;
}

export interface MailPort {
  sendEmail(options: SendEmailOptions): void;
}
```
Update `Ctx` to include:
```typescript
export interface Ctx {
  // ... existing fields
  mail: MailPort;
}
```

### 3.2 Adapters
1. **Google Apps Script Adapter (`api/src/gas/mail.ts`)**:
   - Implements `MailPort` via `MailApp.sendEmail({ to, subject, body, htmlBody })`.
   - Sends as the authenticated Google Apps Script identity (`umdancesportc@gmail.com`).
   - Traps sending errors for individual recipients so an invalid email does not abort the operation or break the API response.
2. **Fake Adapter for Vitest (`api/test/fakes/mail.ts`)**:
   - Records sent emails in an array `ctx.mail.sent: SendEmailOptions[]` for assertions.

---

## 4. Class Video Recap Email Notification

### 4.1 Trigger & Flow
1. In `web/src/features/media/UploadDialog.tsx` and `ScanPanel.tsx`:
   - Admin sees a checkbox: `[x] Send email notification to registered class dancers` (default: checked).
   - The checkbox state is passed as `notifyDancers: boolean` in the payload to `videos.register`.
2. In `api/src/features/videos.ts` (`videos.register`):
   - If `payload.notifyDancers !== false`:
     - Retrieve the `session` and its associated `eventId` and `styleId`.
     - Read registered members for the event via `readEventMembers(ctx, event)`.
     - Filter to members enrolled in the session's style using `isMemberEnrolledInStyle(member, session.styleId, allStyles)`.
     - Exclude members with missing or invalid email addresses.
     - Dispatch notifications via `ctx.mail.sendEmail`.

### 4.2 Recap Email Content
- **Subject**: `[UMDSC] Class Recap Video Uploaded - {Style Name} (Class #{Seq} - {Date})`
- **Text Body**:
  ```text
  Hi {Dancer Name},

  The class recap video for {Style Name} Class #{Seq} ({Date}) has been uploaded and is now available to watch!

  Access your class recap and practice music here:
  https://umdsc-dance-class.umdancesportc.workers.dev

  Keep dancing!
  Universiti Malaya Dance Sport Club (UMDSC)
  ```
- **HTML Body**: Clean, retro-accented HTML template with a primary action button linking to `https://umdsc-dance-class.umdancesportc.workers.dev`.

---

## 5. Automatic New Member Registration Confirmation Email

### 5.1 Trigger & Flow
1. In `api/src/features/eventImport.ts` (`importEventMembers`):
   - After computing `added = members.filter(m => !known.has(m.memberId) && !placed.has(m.memberId))`:
   - For each member in `added` with an email address:
     - Automatically send the registration confirmation email via `ctx.mail.sendEmail`.
     - Ensure emails are only sent for genuinely newly added members (not updated, not corrected matrics).

### 5.2 Confirmation Email Content
- **Subject**: `[UMDSC] Registration Confirmed - {Event Name}`
- **Text Body**:
  ```text
  Hi {Dancer Name},

  Welcome to UMDSC! Your registration for {Event Name} has been confirmed.

  Enrolled Style(s): {Enrolled Styles List}
  Matric Number: {Matric Number}

  You can access your class schedules, practice music, and recap videos here:
  https://umdsc-dance-class.umdancesportc.workers.dev

  Keep dancing!
  Universiti Malaya Dance Sport Club (UMDSC)
  ```
- **HTML Body**: Formatted welcome template displaying enrolled styles and a button linking to the portal.

---

## 6. Testing & Quality Verification

1. **`shared/src/musicLinks.test.ts`**:
   - Protocol-less links (`www.youtube.com/...`, `youtube.com/...`).
   - Links with radio/mix query parameters (`&list=RD...`).
   - Links with zero-width whitespace.
2. **`api/test/features/musicLinks.test.ts`**:
   - YouTube 404 response error message verification.
3. **`api/test/features/videos.test.ts`**:
   - `videos.register` sends emails to style-enrolled members when `notifyDancers: true`.
   - `videos.register` skips sending when `notifyDancers: false`.
   - Dancers enrolled in different styles do not receive the email.
4. **`api/test/features/eventSync.test.ts`**:
   - Newly added members receive confirmation emails with their matric and style names.
   - Re-syncing existing members does not send duplicate emails.
5. **`web/src/features/media/UploadDialog.test.tsx`**:
   - Checkbox renders default checked and passes `notifyDancers` to mutation.
