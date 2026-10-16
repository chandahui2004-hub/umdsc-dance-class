# Music Link Fix & Automated Dancer Email Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix YouTube music link validation and error handling, implement a robust email delivery subsystem (`MailPort`), and automatically send notifications for class video recaps (to style-enrolled dancers) and new member registrations (to newly detected dancers).

**Architecture:** Extend `@umdsc/shared` music link parsing to normalize protocols and strip playlist/radio parameters. Introduce a clean `MailPort` in `api/src/ports.ts` with a `GasMailAdapter` (using Google Apps Script `MailApp.sendEmail` from the club Gmail) and `FakeMailAdapter` for testing. Hook email dispatch into `videos.register` (with admin UI checkbox) and `importEventMembers` in `events.sync`.

**Tech Stack:** TypeScript, React, Google Apps Script (`MailApp`), Vitest, Playwright.

**Spec:** [`docs/superpowers/specs/2026-10-16-music-fix-and-email-notifications-design.md`](file:///c:/Users/user/Downloads/UMDSC%20Design/UMDSC%20Dance%20Class%20System/docs/superpowers/specs/2026-10-16-music-fix-and-email-notifications-design.md)

## Global Constraints

- Never ask for or store the club Gmail password (Google Apps Script executes as the script owner `umdancesportc@gmail.com`).
- Preserve retro 8-bit aesthetic for all new UI controls (checkboxes, badges, labels).
- All emails redirect dancers exclusively to `https://umdsc-dance-class.umdancesportc.workers.dev`.
- Individual email delivery failures must be safely caught so they never break sheet sync or video upload mutations.

## Review Focus

1. Protocol-less YouTube URLs (e.g. `youtube.com/watch?v=...`, `www.youtube.com/...`) must parse cleanly without throwing `Invalid URL`.
2. YouTube URLs containing playlist or radio mix parameters (`&list=RD...`) must extract only the valid 11-character video ID.
3. YouTube video IDs that return 404 from oEmbed must produce a clear `"That YouTube video was not found. Please check that the link or video ID is correct."` error.
4. Class recap notifications must only be sent to dancers enrolled in that specific class's dance style, not the entire event roster.
5. Re-syncing an event without new members must never re-send registration confirmation emails.

---

### Task 1: YouTube Music Link Parser and 404 Error Clarification

**Files:**
- Modify: `shared/src/musicLinks.ts`
- Modify: `api/src/features/musicLinks.ts`
- Modify: `web/src/features/media/MusicForm.tsx`
- Test: `shared/src/musicLinks.test.ts`
- Test: `api/test/features/musicLinks.test.ts`

**Interfaces:**
- `parseMusicLink(input: string): ParsedMusicLink`
- `resolveYouTube(ctx: Ctx, youtubeId: string): ResolvedLink`

- [ ] **Step 1: Write failing tests in `shared/src/musicLinks.test.ts`**

Add tests for:
```typescript
it.each([
  ['www.youtube.com/watch?v=4_KN-gA6uXY'],
  ['youtube.com/watch?v=4_KN-gA6uXY'],
  ['https://www.youtube.com/watch?v=4_KN-gA6uXY&list=RD4_KN-gA6uXY&start_radio=1'],
  ['  https://youtu.be/4_KN-gA6uXY\u200B  '],
])('reads YouTube link with edge case format: %s', input => {
  expect(parseMusicLink(input)).toEqual({ kind: 'youtube', id: '4_KN-gA6uXY' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx --workspace=@umdsc/shared vitest run src/musicLinks.test.ts`  
Expected: FAIL on `www.youtube.com/...` and `youtube.com/...`

- [ ] **Step 3: Implement link normalization and query handling in `shared/src/musicLinks.ts`**

1. Strip zero-width and invisible unicode characters: `text.replace(/[\u200B-\u200D\uFEFF]/g, '').trim()`.
2. If text starts with `youtube.com/`, `youtu.be/`, `www.`, `music.youtube.com/`, `open.spotify.com/`, `soundcloud.com/`, or `drive.google.com/` without `http://` or `https://`, prepend `https://`.
3. In `shared/src/youtube.ts` / `getYouTubeVideoId`: ensure regex `[?&]v=([a-zA-Z0-9_-]{11})` matches video ID even when followed by `&list=`, `&t=`, etc.

- [ ] **Step 4: Update 404 error message in `api/src/features/musicLinks.ts`**

In `resolveYouTube`:
```typescript
if (res.status === 404) {
  throw new AppError('LINK_INVALID', 'That YouTube video was not found. Please check that the link or video ID is correct.');
}
```
Update tests in `api/test/features/musicLinks.test.ts` to expect this message.

- [ ] **Step 5: Add input polish to `web/src/features/media/MusicForm.tsx`**

Add `spellCheck={false}` and `autoCapitalize="off"` to the link `<input>` element.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx --workspace=@umdsc/shared vitest run`  
Run: `npx --workspace=@umdsc/api vitest run test/features/musicLinks.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add shared/src/musicLinks.ts shared/src/musicLinks.test.ts shared/src/youtube.ts api/src/features/musicLinks.ts api/test/features/musicLinks.test.ts web/src/features/media/MusicForm.tsx
git commit -m "fix(music): robust youtube link parsing, strip playlist params and clear 404 error"
```

---

### Task 2: MailPort & Adapters (`GasMailAdapter` and `FakeMailAdapter`)

**Files:**
- Create: `api/src/gas/mail.ts`
- Create: `api/test/fakes/mail.ts`
- Modify: `api/src/ports.ts`
- Modify: `api/src/main.ts`
- Modify: `api/test/fakes/makeCtx.ts`
- Test: `api/test/fakes/mail.test.ts`

**Interfaces:**
- `SendEmailOptions`: `{ to: string | string[]; subject: string; body: string; htmlBody?: string; }`
- `MailPort`: `{ sendEmail(options: SendEmailOptions): void; }`
- Added to `Ctx.mail: MailPort`

- [ ] **Step 1: Define `MailPort` in `api/src/ports.ts`**

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
Add `mail: MailPort;` to `Ctx`.

- [ ] **Step 2: Create `FakeMailAdapter` in `api/test/fakes/mail.ts` and update `makeCtx.ts`**

`FakeMailAdapter` implements `MailPort`, stores sent messages in `sent: SendEmailOptions[]`, and provides `reset()`.
Wire `new FakeMailAdapter()` into `api/test/fakes/makeCtx.ts`.

- [ ] **Step 3: Create `GasMailAdapter` in `api/src/gas/mail.ts` and wire into `api/src/main.ts`**

Implement `sendEmail` using `MailApp.sendEmail({ to, subject, body, htmlBody })`.
Wrap in try/catch to log warnings via `console.warn` without throwing if an individual address fails.
In `api/src/main.ts`, supply `mail: new GasMailAdapter()` to `buildCtx()`.

- [ ] **Step 4: Write unit test in `api/test/fakes/mail.test.ts`**

Verify `FakeMailAdapter` captures sent emails and handles recipient lists correctly.

- [ ] **Step 5: Run tests to verify all API tests compile and pass**

Run: `npx --workspace=@umdsc/api vitest run test/fakes/`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add api/src/ports.ts api/src/gas/mail.ts api/test/fakes/mail.ts api/test/fakes/mail.test.ts api/src/main.ts api/test/fakes/makeCtx.ts
git commit -m "feat(api): add MailPort with GasMailAdapter and FakeMailAdapter"
```

---

### Task 3: Class Video Recap Email Notification

**Files:**
- Modify: `api/src/features/videos.ts`
- Modify: `web/src/features/media/UploadDialog.tsx`
- Modify: `web/src/features/media/ScanPanel.tsx`
- Test: `api/test/features/videos.test.ts`

**Interfaces:**
- `videos.register` payload accepts `notifyDancers?: boolean` (defaults to true)
- `sendRecapEmail(ctx: Ctx, session: ClassSession, dancers: Member[]): void`

- [ ] **Step 1: Write failing test in `api/test/features/videos.test.ts`**

Test that:
1. When `videos.register` is called with `notifyDancers: true` (or omitted), dancers enrolled in the class style receive a notification email with subject `[UMDSC] Class Recap Video Uploaded - {Style} (Class #{Seq} - {Date})` containing `https://umdsc-dance-class.umdancesportc.workers.dev`.
2. Dancers enrolled only in other styles do not receive the email.
3. When `notifyDancers: false`, no emails are sent.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx --workspace=@umdsc/api vitest run test/features/videos.test.ts`  
Expected: FAIL (email not yet dispatched)

- [ ] **Step 3: Implement recap email notification in `api/src/features/videos.ts`**

In `videos.register` handler:
1. If `payload.notifyDancers !== false`:
   - Fetch event using `getEvent(ctx, session.eventId)`.
   - Read members using `readEventMembers(ctx, event)`.
   - Filter enrolled dancers using `isMemberEnrolledInStyle(member, session.styleId, allStyles)`.
   - Deduplicate emails and dispatch via `ctx.mail.sendEmail`.

- [ ] **Step 4: Update UI in `web/src/features/media/UploadDialog.tsx` and `ScanPanel.tsx`**

1. In `UploadDialog.tsx`, add a checkbox state `const [notifyDancers, setNotifyDancers] = useState(true);`.
2. Render a styled retro checkbox: `[x] Send email notification to registered class dancers`.
3. Pass `notifyDancers` in `api.post('videos.register', { ..., notifyDancers })`.
4. Apply the same in `ScanPanel.tsx` when confirming scanned video sessions.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx --workspace=@umdsc/api vitest run test/features/videos.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add api/src/features/videos.ts api/test/features/videos.test.ts web/src/features/media/UploadDialog.tsx web/src/features/media/ScanPanel.tsx
git commit -m "feat(media): send class recap notification email to enrolled dancers on video upload"
```

---

### Task 4: Automated New Member Registration Confirmation Emails

**Files:**
- Modify: `api/src/features/eventImport.ts`
- Test: `api/test/features/eventSync.test.ts`

**Interfaces:**
- `sendRegistrationConfirmationEmail(ctx: Ctx, event: EventItem, member: Member): void`

- [ ] **Step 1: Write failing test in `api/test/features/eventSync.test.ts`**

Test that:
1. When `importEventMembers` detects new members in `added`, confirmation emails are sent with subject `[UMDSC] Registration Confirmed - {Event Name}`.
2. Email contains the member's matric number, style names, and the link `https://umdsc-dance-class.umdancesportc.workers.dev`.
3. Running sync a second time sends 0 emails.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx --workspace=@umdsc/api vitest run test/features/eventSync.test.ts`  
Expected: FAIL (no confirmation email sent yet)

- [ ] **Step 3: Implement confirmation email in `api/src/features/eventImport.ts`**

In `importEventMembers`:
After finding `added`:
```typescript
for (const m of added) {
  if (m.email && m.email.includes('@')) {
    sendRegistrationConfirmation(ctx, event, m);
  }
}
```
Construct subject and body with dancer name, enrolled styles (`m.styleNames.join(', ')`), matric (`m.matricRaw || m.matricKey`), and website URL.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx --workspace=@umdsc/api vitest run test/features/eventSync.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/features/eventImport.ts api/test/features/eventSync.test.ts
git commit -m "feat(events): automatically send registration confirmation email to newly added members"
```

---

### Task 5: End-to-End Verification & Full Workspace Test Suite

**Files:**
- Test: All test suites in `shared`, `api`, and `web`

- [ ] **Step 1: Run all workspace tests**

Run: `npm test`  
Expected: All unit and integration test suites pass across `@umdsc/shared`, `@umdsc/api`, and `@umdsc/web`.

- [ ] **Step 2: Run build across all workspaces**

Run: `npm run build`  
Expected: Clean build with zero TypeScript or bundling errors.

- [ ] **Step 3: Final verification commit**

```bash
git commit --allow-empty -m "chore: verify all tests pass for music fix and email notifications"
```
