# UMDSC Dance Class System — Design Spec

- **Date:** 2026-09-28
- **Status:** Draft, awaiting owner review
- **Builder:** Gemini Flash in Antigravity. This spec is the source of truth. The implementation plan (`docs/superpowers/plans/`) is derived from it.
- **Visual design:** owner brief is "2D pixel texture, 8-bit retro game aesthetic, bright colours on a simple background, nostalgic video game style". It is specified in §13.1.

---

## 1. Purpose

UM Dancesport Club (UMDSC) runs monthly street-dance classes (Hip Hop, Popping, Latin, Locking…). Today, registration comes in through a Google Form, and attendance is taken by hand in Google Sheets. This website replaces the manual work:

- **Admins** manage class schedules and import each month's registrations. They take attendance on their phone, upload class videos and attach class music.
- **Dancers** log in with name and matric number. They see a calendar of *their own* classes, attendance, videos and music, and practise in a **Music Studio**: the DanceCue player plus a synced class video.

**Success criteria**
1. An admin can go from "new month's form link" to "attendance sheets ready" in under 5 minutes, without opening Google Sheets.
2. A tick in the website appears in the Google Sheet within 3 seconds. Two admins ticking at the same time never lose a tick.
3. 100+ dancers can use it at the same time without errors (after automatic retries). p95 response time < 4 s.
4. Every Drive link can be replaced from the website at any time. A wrong or unshared link produces a clear fix-it message, not a crash.
5. It works as a phone "app-like" website and as a desktop website from the same URL.

## 2. Decisions log (agreed with the owner)

| # | Decision |
|---|---|
| D1 | Roles: **Dancer** and **Admin** are built in. Admins can, **in the web UI**: edit any role's permissions (including Dancer's), **create new roles** (e.g. "Class Lead"), and assign extra roles to individual dancers, optionally limited to certain styles (§7.3). Admins also edit all master data (styles, instructors, class sessions, links) in the web UI. |
| D2 | A dancer can log in if they appear in **any** month. They see only the months and styles they registered for. |
| D3 | Music search = search the club's own music list. No YouTube-wide search. |
| D4 | Folders belong to different people. The backend runs as a **new club Gmail** ("system account"). Every linked folder or sheet must be shared with it as **Editor**. |
| D5 | Videos live in each **admin's own Drive folder**, shared with the club Gmail. Uploads go through an in-browser **"Sign in with Google"** step, so each file is owned by, and uses the storage of, the admin who uploads it. |
| D6 | The website creates **subfolders per class** inside the linked video folder. |
| D7 | Uploaded videos and MP3s get **"Anyone with the link can view"** sharing. This is required for in-app streaming and looping. |
| D8 | Attendance is **Present / Absent** only. The sheet stores `/` for present and blank for absent, matching the club's current sheets. |
| D9 | **Music Studio = DanceCue** (github.com/JzeAnson/DanceCue, used with the author's approval) ported with a new skin. Adds: admin-published class sections, a quick "load class music" action, and a **user-aligned synced class video** with mute. |
| D10 | Loop sections: the admin publishes named sections for everyone, and each dancer can save personal loops on their device. |
| D11 | Dancers can still load **their own** MP3 or YouTube link (kept on their device only). |
| D12 | DanceCue **voice commands are kept**. |
| D13 | It is a **responsive website**, not an installable app: an app-like phone layout plus a desktop layout. |
| D14 | Frontend hosting: **Cloudflare Pages** (free). |
| D15 | UI: **8-bit retro game aesthetic**, bright colours on a simple background, nostalgic video-game feel, with 2D pixel texture (§13.1). |
| D16 | DanceCue source is obtained with `gh repo clone JzeAnson/DanceCue` (fallback: `git clone https://github.com/JzeAnson/DanceCue`). |

## 3. Architecture

```
 Phone / desktop browser
 ┌──────────────────────────────────────────────┐
 │ React SPA (Cloudflare Pages)                 │
 │  · TanStack Query cache + localStorage cache │
 │  · retry queue (attendance ticks)            │
 │  · Google Identity Services + Picker         │──(admin upload only)──▶ Google Drive API
 │  · <video>/<audio> stream via Drive API key  │──(read, public files)─▶ (admin's folders)
 └───────────────┬──────────────────────────────┘
                 │ HTTPS POST (text/plain JSON, no custom headers)
                 ▼
 Google Apps Script Web App  (executes as club Gmail, access: Anyone)
  · router → auth → permission check → feature handler
  · CacheService (read cache)   · LockService (write lock)
  · SpreadsheetApp / DriveApp   · PropertiesService (secrets, versions)
                 │
                 ▼
 Google Drive (every folder shared with club Gmail as Editor)
  · Club DB folder: UMDSC_System spreadsheet, Members/ monthly spreadsheets
  · Per-style attendance folders → monthly attendance spreadsheets
  · Per-style video folders (admins' Drives) → month / class subfolders → videos, music
```

**Why this and not alternatives**
- *Serverless functions + service account* was rejected: service accounts have no Drive storage quota, so they cannot create the monthly Google Sheets in personal folders.
- *Apps Script serving the UI* (HtmlService) was rejected: it runs in a sandboxed iframe with a script.google.com URL, is slow, and is hard to give a custom UI.

### 3.1 Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite 6 + Tailwind CSS 4 + React Router 7 | Same stack as DanceCue, so its code ports unchanged |
| Server state | @tanstack/react-query | caching, retries, dedupe of in-flight requests |
| Dates | date-fns (+ `date-fns-tz`), zone **Asia/Kuala_Lumpur** | |
| 8-bit UI assets | `@fontsource/press-start-2p`, `@fontsource/pixelify-sans`, `@fontsource/vt323`, `pixelarticons` | self-hosted pixel fonts + pixel icon set (§13.1) |
| Local storage | localStorage (small), IndexedDB via `idb-keyval` (DanceCue audio file, retry queue) | |
| Backend | Google Apps Script (V8), written in TypeScript, bundled by esbuild into one file, pushed with `@google/clasp` | lets tests run in Node |
| Tests | Vitest (api logic + web units), Playwright (e2e, via `webapp-testing` skill) | |
| Hosting | Cloudflare Pages (web), Apps Script deployment (api) | free |

### 3.2 Repository layout

```
umdsc-dance/
  web/                          React app
    src/app/                    router, layouts (PhoneShell, DesktopShell), route guards
    src/lib/api.ts              the ONLY place that calls the backend
    src/lib/google/             gis.ts (sign-in), picker.ts, resumableUpload.ts, driveUrls.ts
    src/lib/time.ts             all date/time helpers (KL zone)
    src/components/ui/          primitives (Button, Sheet, Calendar, TimePicker, Toast…)
    src/theme/tokens.css        8-bit theme tokens (§13.1) — the ONLY place colours/fonts are defined
    src/assets/sprites/         pixel sprites (logo, coin, heart, flags) — whole-number scaling only
    src/features/
      auth/  calendar/  attendance/  classes/  members/  videos/  music/  settings/  admin/
      music-studio/
        dancecue/               ported DanceCue files (credit header in each)
        sync/                   useSyncedVideo.ts, VideoTimeline.tsx
  api/
    src/main.ts                 doGet/doPost → router
    src/router.ts               action → {permission, handler}
    src/auth.ts  src/tokens.ts  src/passwords.ts
    src/db/                     sheetTable.ts (typed table access), cache.ts, lock.ts, ids.ts
    src/logic/                  pure functions: normalize.ts, headerMatch.ts, classDetect.ts,
                                sessionGen.ts, attendanceGrid.ts   ← 100% unit tested
    src/features/               settings.ts, styles.ts, sessions.ts, members.ts, attendance.ts,
                                videos.ts, music.ts, admins.ts, setup.ts
    test/                       vitest tests for src/logic and handlers (with fakes)
    appsscript.json  .clasp.json  build.mjs
  scripts/loadtest.mjs          concurrency test (§12.4)
  docs/superpowers/specs/  docs/superpowers/plans/  docs/HANDOVER.md
  CREDITS.md                    DanceCue attribution
```

## 4. Google setup (manual, done once by the owner; the plan gives click-by-click steps)

1. Create the club Gmail (e.g. `umdsc.system@gmail.com`). Record its credentials in the committee handover.
2. In that account: create the **Club DB folder**, and create the Apps Script project via clasp.
3. `appsscript.json`: `timeZone: "Asia/Kuala_Lumpur"`, `runtimeVersion: "V8"`, `webapp: { executeAs: "USER_DEPLOYING", access: "ANYONE_ANONYMOUS" }`, explicit `oauthScopes` (spreadsheets, drive, script.scriptapp, script.external_request). Enable the **Advanced Drive Service (v3)** for file capabilities, listing and permissions.
4. Deploy **once**, then always redeploy to the **same deployment ID** (`clasp deploy -i <id>`) so the API URL never changes.
5. Google Cloud project (same club Gmail). **Free: no billing account or credit card is needed** for the Drive API, the Picker API, API keys or OAuth clients. Dismiss any "Start free trial" banner.
   - Enable **Drive API** and **Google Picker API**.
   - Create an **API key**, restricted to those two APIs and to HTTP referrers (the Cloudflare domain and `localhost`).
   - Create an **OAuth Web client ID** (authorized JS origins: the Cloudflare domain and `http://localhost:5173`).
   - OAuth consent screen: External, scope `drive.file`.
6. Script Properties: `TOKEN_SECRET` (random 64 chars), `SETUP_CODE` (one-time code used for first-run setup).
7. `web/.env`: `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_ID` (Cloud project number).

## 5. Data model

All tables are tabs in one spreadsheet, **UMDSC_System**, inside the Club DB folder, except where noted. Rules for every table:
- Row 1 holds the column keys exactly as written below. The system finds columns **by header name, never by position**.
- Every row has `id` (short random id), `version` (int), `updatedBy`, `updatedAt`, and a soft delete (`active` TRUE/FALSE). Rows are never physically deleted by the app.
- Dates are stored as text `YYYY-MM-DD`, times as `HH:mm`, and timestamps as ISO text. Before writing, set the column's number format to plain text (`@`); **otherwise Sheets auto-converts them into Date objects.**
- Matric and phone columns are also plain text. Numbers must never lose leading zeros or turn into `2.2003949E7`.

| Tab | Columns (plus the common columns) |
|---|---|
| `Settings` | `key`, `value` — keys: `dbFolderId`, `defaultAttendanceFolderId`, `defaultVideoFolderId`, `clubName` |
| `LinkHistory` | `key`, `oldValue`, `newValue`, `changedBy`, `changedAt` |
| `DanceStyles` | `name`, `aliases` (comma list, e.g. `hip hop,hiphop,hip-hop`), `colorKey`, `defaultWeekday` (1–7), `defaultStart`, `defaultEnd`, `defaultInstructorId`, `defaultVenue`, `attendanceFolderId`, `videoFolderId` |
| `Instructors` | `name`, `contact` |
| `ClassSessions` | `month` (`YYYY-MM`), `styleId`, `seq` (1..n), `date`, `start`, `end`, `instructorId`, `venue`, `status` (`scheduled`/`replacement`/`cancelled`), `note` |
| `MemberMonths` | `month`, `sourceSheetId`, `sourceTab`, `columnMapJson`, `membersSpreadsheetId`, `importedBy`, `importedAt`, `lastSyncAt`, `memberCount` |
| `MemberIndex` | `matricKey`, `nameKey`, `fullName`, `months` (comma list), `lastMonth` — the fast login lookup across all months |
| `AttendanceSheets` | `month`, `styleId`, `spreadsheetId` |
| `Admins` | `username`, `displayName`, `passwordHash`, `salt`, `iterations`, `roleId` |
| `Roles` | `name`, `description`, `loginType` (`admin` = username+password, `dancer` = name+matric), `isSystem` (TRUE for seeded `Admin` and `Dancer`: these can be edited but not deactivated) |
| `RolePermissions` | `roleId`, `permission` (codes in §7.3) |
| `MemberRoles` | `matricKey`, `roleId`, `styleIds` (comma list; blank = all styles). Extra roles given to a dancer on top of the default `Dancer` role. |
| `Videos` | `styleId`, `month`, `sessionId`, `title`, `driveFileId`, `mimeType`, `sizeBytes`, `folderId`, `uploadedBy`, `source` (`upload`/`scan`) |
| `Music` | `styleId`, `month`, `sessionId` (blank = whole month), `title`, `sourceType` (`mp3`/`youtube`), `driveFileId`, `youtubeId` |
| `Sections` | `musicId`, `name`, `startSec`, `endSec`, `videoId` (optional), `videoStartSec` (optional) |
| `AuditLog` | `ts`, `actor`, `action`, `target`, `detail` (append-only) |

**Members spreadsheet**: `Members/Members_YYYY-MM`, tab `Members`. Columns: `memberId`, `fullName`, `matricRaw`, `matricKey`, `nameKey`, `contact`, `email`, `gender`, `nationality`, `styleIds`, `styleNames`, `sourceTimestamp`, `flags`.
- `memberId` = `M-` + `matricKey`, so it stays the same across months.

**Attendance spreadsheet**: `<style attendance folder>/YYYY-MM <Style> Attendance`, tab `Attendance`.
- **Row 1 (hidden, protected with warning):** machine keys: `memberId`, `fullName`, `matric`, `contact`, `gender`, `nationality`, then one `sessionId` per class.
- **Row 2:** human headers: `Full Name`, …, `C1 07/10 Tue`, `C2 14/10 Tue`…
- **Rows 3+:** one row per member. Present = `/`, absent = blank.
- Cells are always located through row 1 and the `memberId` column, so renaming headers or sorting rows never breaks the mapping.

## 6. Link handling (links can change at any time)

- `lib/driveIds` extracts file and folder IDs from every URL shape: `/drive/folders/<id>`, `/file/d/<id>`, `/spreadsheets/d/<id>`, `?id=<id>`, `open?id=`, `/u/0/`, and trailing `?usp=…`.
- On save, the server:
  1. opens the item as the club Gmail;
  2. checks it is the right *kind* (folder vs spreadsheet);
  3. checks write access with a harmless probe (`getAccess`/`getEditors`).

  Failure codes, all with fix-it text naming the club Gmail address:
  - `LINK_INVALID`: not a Drive link.
  - `LINK_NO_ACCESS`: "Share this folder with umdsc.system@gmail.com as **Editor**, then try again."
  - `LINK_WRONG_KIND`
  - `LINK_READ_ONLY`
- Every change is written to `LinkHistory`. Old months keep pointing at their own sheet IDs, so changing a link never breaks history.

## 7. Authentication and permissions

### 7.1 Dancer login (name + matric)
- `normalizeMatric(raw)`:
  1. Convert to string. If it looks numeric or scientific (`2.2003949E7`), convert to an integer string (`22003949`).
  2. Trim, uppercase, remove spaces and hyphens.
  3. Remove a trailing `/n` suffix (`22004591/1` → `22004591`).
  4. Keep letter prefixes (`S2199647`, `U2012345`).
- `nameKey(raw)`: lowercase, strip accents, keep letters and spaces, collapse spaces.
- **Match rule:**
  1. Look up `MemberIndex` by `matricKey`.
  2. Accept if the name similarity is ≥ 0.8: the max of token-set ratio and normalized Levenshtein, where "BIN"/"BINTI"/"A/L"/"A/P" are optional tokens.
  3. Matric found but name doesn't match → `NAME_MISMATCH`. Not found → `NOT_REGISTERED`.
- Throttling: 5 failed attempts per matricKey within 10 min → locked 10 min (CacheService).
- Token lifetime: 30 days, stored in localStorage (dancers use their own phones).

### 7.2 Admin login (username + password)
- Passwords are stored as salted, iterated `HMAC-SHA256` (`Utilities.computeHmacSha256Signature`). Iterations are tuned so hashing takes ~300–600 ms in Apps Script (target ≥ 2,000). The iteration count is stored per row so it can be raised later.
- Never log or return passwords or hashes. Throttling: 5 fails → 5-minute lock per username.
- Token lifetime: 12 h. It is stored in sessionStorage by default, or localStorage when "Remember this device" is ticked.
- First-run setup (`setup.init`) needs `SETUP_CODE`. It creates the system spreadsheet, tabs and seed data (roles, permissions, and styles Hip Hop / Popping / Latin / Locking with aliases), plus the first admin. After that it is disabled.
- The last active admin cannot be deactivated.

### 7.3 Tokens and permission checks
- Token = `base64url(JSON{sub, role, name, exp, pv})` + `.` + HMAC-SHA256 signature using `TOKEN_SECRET`. It is stateless, so there is no session sheet lookup per request. `pv` = permission version; bumping it forces a re-login after role changes.
- The token travels **in the request body**, not a header, so no CORS preflight is needed.
- The server checks every action against the router's permission map. **The client hiding a button is never the security boundary.**
- Permission codes:
  - `calendar.view`, `attendance.view.own`, `attendance.view.all`, `attendance.edit`
  - `sessions.edit`, `styles.edit`, `instructors.edit`, `members.view`, `members.import`
  - `videos.view`, `videos.upload`, `videos.edit`, `music.view`, `music.edit`, `sections.edit`
  - `settings.edit`, `admins.manage`, `roles.manage`, `export.download`
- **Dancer data scoping is enforced on the server.** Every dancer query is filtered to the dancer's `(month, styleId)` pairs from the Members sheets.
- **Effective permissions:**
  - For an **admin:** the permissions of their role (the `Admins.roleId` role).
  - For a **dancer:** the `Dancer` role's permissions **plus** every role in `MemberRoles` for their matricKey.
  - A permission that comes from a style-scoped assignment only applies to those styles. For example, a "Class Lead" role with `attendance.edit` and `styleIds = Popping` lets that dancer tick Popping attendance only.
  - The server resolves this at login and puts `{perm: styleIds|"*"}` into the token. Any change to roles, permissions or assignments bumps `pv`, so affected users re-login on their next request.
- **Guard rails:**
  - The `Admin` role always keeps `roles.manage` and `admins.manage`, so nobody can lock everyone out.
  - Dancer-login roles can never receive `admins.manage`, `roles.manage` or `settings.edit`; the UI greys these out and the server rejects them.
- **Roles & Permissions page** (admin, under More):
  - a list of roles and **+ New role**;
  - for each role, a checkbox matrix of permission codes grouped by area (Calendar, Attendance, Members, Videos, Music, Master data, Settings, Admin);
  - a "Members with this role" list with **Assign dancer** (search by name or matric, then pick styles).
  - Every change is written to `AuditLog`.

## 8. API contract

- **One endpoint:** `POST {VITE_API_URL}` with `Content-Type: text/plain;charset=utf-8`.
- **Request:** body `{ action, token?, payload?, opId?, sinceVersion? }`.
- **Response:** `{ ok: true, data, dataVersion, serverTime }` or `{ ok: false, error: { code, message, retryable } }`. `fetch` must use `redirect: "follow"`, because Apps Script answers through a 302 to googleusercontent.com.
- `GET ?action=health` returns `{ok:true, version}` for uptime checks.

| Group | Actions |
|---|---|
| setup | `setup.status`, `setup.init` |
| auth | `auth.dancerLogin` (returns token **and** bootstrap in one call), `auth.adminLogin` (same), `auth.me` |
| bootstrap | `dancer.bootstrap {sinceVersion}` → months, styles, sessions, own attendance, videos, music, sections (or `{notModified:true}`); `admin.bootstrap {sinceVersion}` |
| settings | `settings.get`, `settings.setLink {key, url}`, `links.history` |
| styles / instructors | `.list`, `.create`, `.update {id, version, …}`, `.deactivate` |
| sessions | `sessions.list {month}`, `sessions.generateMonth {month, styleIds}`, `sessions.create`, `sessions.update {id, version, date?, start?, end?, instructorId?, status?}`, `sessions.cancel` |
| members | `members.previewImport {sheetUrl, month}`, `members.confirmImport {month, sheetUrl, columnMap}`, `members.resync {month}`, `members.list {month, styleId?}`, `members.update` |
| attendance | `attendance.get {month, styleId, ifVersion?}`, `attendance.mark {marks:[{opId, sessionId, memberId, present}]}`, `attendance.export {month, styleId}` → `{fileName, base64}`. The server fetches the sheet's xlsx export with `UrlFetchApp` and `ScriptApp.getOAuthToken()`, so admins need no direct Drive access to the sheet. |
| videos | `videos.list {month?, styleId?, sessionId?}`, `videos.register {driveFileId, sessionId, title}`, `videos.update`, `videos.deactivate`, `videos.scan {styleId, month}` → suggestions, `videos.targetFolder {sessionId}` → IDs of the style's video root and the expected subfolder names |
| music / sections | `music.list`, `music.create`, `music.update`, `music.deactivate`, `sections.list {musicId}`, `sections.create`, `sections.update`, `sections.deactivate` |
| admins / roles | `admins.list`, `admins.create`, `admins.update`, `admins.resetPassword`, `roles.list`, `roles.create`, `roles.update`, `roles.deactivate`, `roles.setPermissions {roleId, permissions[]}`, `memberRoles.list {roleId?}`, `memberRoles.assign {matricKey, roleId, styleIds}`, `memberRoles.remove` |

Error codes: `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION`, `NOT_FOUND`, `VERSION_CONFLICT` (with the latest row), `LINK_*` (§6), `NAME_MISMATCH`, `NOT_REGISTERED`, `LOCKED_OUT`, `BUSY` (lock timeout, retryable), `QUOTA` (Apps Script rate limit, retryable), `INTERNAL`.

## 9. Monthly registration import

### 9.1 Header matching (`logic/headerMatch.ts`)
- Normalize each header: first line only, lowercase, alphanumerics and spaces only.
- Score each target field against its synonyms. Containing a synonym scores 1.0; otherwise use Dice bigram similarity. Assign each field the best column with score ≥ 0.6. Use each column at most once, highest scores first.

| Field | Synonyms |
|---|---|
| fullName | full name, name, nama, nama penuh |
| matric | matric number, matric no, matrik, student id, no matrik |
| contact | contact number, phone, phone number, whatsapp, tel, mobile |
| email | email, email address, e mail |
| gender | gender, sex, jantina |
| nationality | nationality, citizenship, warganegara |

Verified against the real form: `Full Name`, `Matric Number\n17XXXXXX OR U20XXXXX`, `Contact Number (able to contact via WhatsApp)`, `Gender`, `Nationality` and `Email` all match. Extra columns (Faculty, Course, Year, Payment Receipt) are ignored.

### 9.2 Class column detection (`logic/classDetect.ts`)
1. For each column, compute the hit rate: the fraction of non-empty cells that contain at least one active style alias. Compare after normalizing both sides to lowercase letters only, so `Hip Hop (RM60/month)` → `hiphoprmmonth` contains `hiphop`.
2. The class column is the one with the highest hit rate (must be ≥ 0.5). Break ties by a header containing "class".
3. Per row: `styleIds` = every style whose alias appears.
4. Split each cell on commas and strip `(…)`. Any leftover token that matches no style is reported as **"Unknown class 'X' (n rows) — add as a new style?"**
5. Verified against the real form: the answer column mixes `Popping (RM60/month)`, `Hip Hop (RM60/month), Latin (RM60/month)`, etc.

### 9.3 Import flow
1. `members.previewImport` reads the source sheet as the club Gmail using `getDisplayValues()`, so matric numbers show as text, never `2.2003949E7`. It returns:
   - the proposed column map with scores;
   - the detected class column;
   - the count per style;
   - warnings: rows with no style, unknown class tokens, duplicate matric in the month (merged: union of styles, latest timestamp wins), missing name or matric, and phone numbers repaired (digits only; a 9–10 digit number starting with `1` gets a `0` prefix).
2. The admin reviews the mapping on the preview screen (each field is a dropdown), picks the **month** (default = current month), and confirms.
3. `members.confirmImport` runs under the script lock. If the month was already imported, it behaves exactly like `members.resync` (step 4) and never deletes rows or ticks. Otherwise it:
   - creates or overwrites `Members_YYYY-MM`;
   - upserts `MemberIndex`;
   - records `MemberMonths`;
   - creates or updates each style's attendance spreadsheet for that month, with sessions from `ClassSessions` as columns. If a month has no sessions yet, it prompts to generate them first.
4. `members.resync` re-reads the same source. It adds new members and styles, and appends rows to attendance sheets. It **never removes rows or ticks**. Removed registrations are only flagged.

## 10. Classes, calendar and attendance

- `sessions.generateMonth` creates one session per week on each style's `defaultWeekday` within the month. Default is 4; a month with 5 such weekdays produces 5 and flags it for the admin to cancel one.
- The admin edits any session from the calendar: tap a date to move it, tap the time to change it, and pick an instructor. A moved session keeps its `sessionId`, so its attendance column follows it; only the header label changes. `cancelled` sessions stay, greyed out.
- **All date and time input is a calendar or time picker, never free text** (owner requirement).
- **Taking attendance (phone):**
  1. Pick the style and the class date (chips).
  2. Search and see a list of big toggle rows, with a present count.
- **Taking attendance (desktop):** the full grid of members × sessions.
- **Tick pipeline:**
  1. A tap updates the UI instantly (optimistic).
  2. The mark goes into a persistent queue (IndexedDB) with an `opId`.
  3. The queue sends batches every 1 s.
  4. The server takes the script lock (`waitLock(20000)`), maps cells via row 1 and the memberId column (cached 60 s per sheet), writes each cell, bumps the per-sheet version in CacheService, and remembers the `opId` for 6 h, so a resend is ignored (idempotent).
  5. On `BUSY`/`QUOTA`/network error: retry with exponential backoff plus jitter (1 s, 2 s, 4 s, 8 s, max 30 s). The UI shows "N ticks waiting to sync" until the queue is empty.
- Other admins see changes by polling `attendance.get {ifVersion}` every 20 s while the page is visible. The response is `notModified` if nothing changed.
- Dancer view: their own ✓/✗/upcoming per session and "3/4 attended" for the month.

## 11. Videos, music and Music Studio

### 11.1 Upload (admin), per D5 and D6
1. The admin picks a class session on the calendar, then taps **Upload video** (or **Upload MP3**).
2. **Google sign-in:** Google Identity Services token client, scope `drive.file`. The token is kept in memory only, for about 1 h.
3. **One-time folder grant:** Google Picker opens pre-navigated to the style's linked video folder (`setParent`) with folder selection enabled. The admin taps Select. This grants the app `drive.file` access to that folder. Remember the grant per style in localStorage.
4. The web app finds or creates `YYYY-MM/` and then `YYYY-MM-DD <Style> Class <seq>/` (music goes into `…/Music/`).
5. **Resumable upload:**
   - `POST …/upload/drive/v3/files?uploadType=resumable` returns a session URI.
   - `PUT` 8 MiB chunks (a multiple of 256 KiB) with `Content-Range`, continuing on `308`.
   - On a network drop, query `bytes */total` and resume.
   - Show a progress bar and a "keep this page open" notice, and hold a screen wake lock where supported.
6. Set sharing `anyone` / `reader` on the new file with the admin's token, then call `videos.register`. The server verifies the file is readable by the club Gmail and records it.
7. **Format check** before upload: warn on `.mov` / HEVC ("won't play on Android/Windows — record in 'Most Compatible' / export MP4 H.264"). Allow override.
8. Only `drive.file` is used, never the full `drive` scope, so there is no unverified-app warning.

**⚠️ Spike first (plan task 1):** prove that after the Picker folder grant, `drive.file` can create a subfolder and upload into it. If it cannot, fall back to the `drive` scope with the OAuth app in *Testing* status and admins added as test users (≤100), and record the outcome in the plan.

### 11.2 Scan folder
`videos.scan` lists video and audio files under the style's video folder for the month that are not yet in `Videos`. It suggests a session using a date parsed from the filename (`YYYY-MM-DD`, `DD-MM-YYYY`, `DD/MM`, `7 Oct`), or else from the parent class-folder name, or else from the created date. The admin confirms each one in a list. This catches videos admins put into Drive directly.

### 11.3 Playback URLs (`lib/google/driveUrls.ts`)
- **Stream (video and MP3):** `https://www.googleapis.com/drive/v3/files/{id}?alt=media&key={API_KEY}`. It supports range requests, so seeking works, and it has no virus-scan interstitial. Drive's `/preview` iframe **cannot be controlled** (seek, sync, loop), so it is only a fallback "Open in Drive" link.
- **Download:** `https://drive.google.com/uc?export=download&id={id}`.
- **YouTube:** IFrame Player API, video ID parsed with DanceCue's `getYouTubeVideoId`.

### 11.4 Music Studio: port of DanceCue
- **Port these files verbatim first**, then restyle only:
  - `useAudioPlayer.ts`, `YouTubePlayer.tsx`, `AudioPlayer.tsx` (timeline drag: select, edge-grab, move range), `MarkerList.tsx`
  - `SourceLoader.tsx`, `VoiceCommandPanel.tsx`, `useSpeechCommands.ts`, `storedAudioFile.ts`, `youtube.ts`, `types/marker.ts`
  - Add a credit header to each and a `CREDITS.md`.
- **Kept behaviour:**
  - play/pause/restart/seek/skip, speed 0.75–1.25×, whole-track loop;
  - named markers `{id, name, time, endTime}` created by dragging on the timeline, loop a marker, jump to a marker, active-marker highlight;
  - voice commands (en-US) with fallback buttons;
  - localStorage session and IndexedDB for the last local MP3.
- **Changes and additions:**
  1. **Source picker** with three tabs:
     - **Class music**: the dancer's styles and months from bootstrap (the default tab);
     - **My MP3**: DanceCue's local file;
     - **YouTube link**: DanceCue's loader.
     Plus a **"Practise in Studio"** quick action on every music item in the calendar day view, which opens the Studio with that track and its sections loaded.
  2. A new source type `drive`: an MP3 streamed from the Drive URL through the same `<audio>` path as DanceCue's file source.
  3. **Markers split in two:**
     - *Class sections* (from `Sections`, read-only for dancers; admins with `sections.edit` can publish from the Studio);
     - *My loops* (localStorage, keyed per track: `studio:loops:{sourceKey}`).
  4. **Loop precision:** DanceCue checks loop end on `timeupdate` (~250 ms) or a 250 ms poll (YouTube). The port checks in a `requestAnimationFrame` loop while playing.
  5. **YouTube speed:** YouTube only accepts its own rates (`getAvailablePlaybackRates`). After `setPlaybackRate`, read back `getPlaybackRate()` and show the real rate (DanceCue's 0.8 and 0.9 get snapped). The synced video uses the rate actually in effect.

### 11.5 Synced class video (new, owner's rule: the user decides the alignment)
- **UI:** below the music timeline, a **video panel** with a picker listing class videos for the chosen class or month, a **video timeline** with a draggable **start point** marker (`videoStart`), and a **mute** toggle.
- **Alignment (user-defined):** the pair `(musicAnchor, videoStart)`.
  - `musicAnchor` = the active loop's start (a marker loop), or else the music position when Play is pressed.
  - Expected video time = `videoStart + (musicTime − musicAnchor)`.
- **Play:** from the same user tap, call `audio.play()` / `yt.playVideo()` **and** `video.play()`. Both elements use `playsinline`, which iOS requires.
- **Loop restart:** when music jumps back to the loop start, the video seeks to `videoStart`.
- **Speed:** `video.playbackRate` = the master's effective rate.
- **Drift control** (runs in the rAF loop while playing):
  - |drift| > 0.2 s (0.35 s when the master is YouTube): hard seek the video.
  - 0.05–0.2 s: nudge `video.playbackRate` by ±5% until corrected.
- **Buffering:** if the video stalls (`waiting`) for more than 0.5 s, pause the master; resume both on `canplay`. If the master buffers (YouTube state 3), pause the video.
- **Mute:** `video.muted`. It defaults to muted, so the music is heard clearly.
- **Save:** "Save loop + video" stores `{markerId, videoId, videoStart}` in *My loops*. Admin class sections may carry `videoId` and `videoStartSec` as a suggested alignment.
- **Implementation:** a hook `useSyncedVideo({ master, videoRef, anchor, videoStart })`. The `master` interface is exposed by the ported `useAudioPlayer` (`getTime()`, `isPlaying`, `rate`, `onLoopRestart`). The drift maths lives in a pure `syncMath.ts` with unit tests.

## 12. Scale and reliability (100+ dancers, several admins)

### 12.1 Known limits and how the design stays under them
| Limit | Value (consumer Gmail) | Mitigation |
|---|---|---|
| Apps Script simultaneous executions | ~30 per account (all web-app calls run as the club Gmail) | keep calls short (cache hits < 300 ms); one bootstrap call per visit; `notModified` responses; client backoff on `QUOTA` |
| Execution time | 6 min | imports processed in bulk `getValues`/`setValues` only; no per-cell read loops |
| CacheService value size | 100 KB per key | `cache.putLarge/getLarge` chunking helper |
| Script Properties writes | 50k/day | only bump `dataVersion` on master-data writes; per-sheet attendance versions go in CacheService |
| Drive download bandwidth per file | popular files can hit "download quota exceeded" for 24 h | admins upload 720p compressed MP4s (upload screen hint); Scan/Upload support replacing a file |
| Spreadsheet size | 10M cells | data is split per month and per style |

### 12.2 Read path
- **Server caches:**
  - `boot:dancer:{month}:{styleId}:{dataVersion}` (TTL 10 min);
  - `boot:admin:{dataVersion}`;
  - per-sheet attendance grids (TTL 60 s, keyed on sheet version).
- The server assembles a dancer's bootstrap from per-(month, style) chunks. It does not build one per dancer, so 100 dancers in the same style share one cached chunk.
- **Client:** TanStack Query with `staleTime` 60 s and refetch-on-focus. The last bootstrap is persisted to localStorage, so the app opens instantly and refreshes in the background with `sinceVersion`.
- In-flight dedupe: two components asking for the same data trigger one request.

### 12.3 Write path
- **Every** write handler runs inside `withScriptLock(fn, 20000)`. On lock timeout it returns `BUSY` (retryable).
- Master-data updates require `version`. A mismatch returns `VERSION_CONFLICT` with the current row, and the UI shows "Changed by {updatedBy} at {time} — reload / overwrite".
- Idempotency: every write carries an `opId`. Processed opIds are kept in CacheService for 6 h.
- Writes use batched `setValues` / `RangeList` where possible, and `SpreadsheetApp.flush()` once at the end.
- `AuditLog` is appended for every write.

### 12.4 Load test (acceptance gate)
`scripts/loadtest.mjs` uses real test tokens against a **staging** deployment. It runs:
- (a) 100 `dancer.bootstrap` calls over 10 s;
- (b) 50 calls fired simultaneously;
- (c) 2 simulated admins each sending 40 attendance marks concurrently to the same sheet.

Pass criteria: 0 lost marks, 0 failures after client-style retries, p95 < 4 s. Results are recorded in the plan.

## 13. Frontend structure

- **Layouts:** `PhoneShell` (< 768 px): top title bar, bottom tab bar, full-screen pages, bottom sheets for details. `DesktopShell` (≥ 1024 px): sidebar and wide content. 768–1023 px uses the phone shell at a centred max width.
- **Tap targets ≥ 44 px.** Safe-area insets for notched phones.
- **Dancer tabs:** Home (calendar) · Studio · Me (profile, attendance summary, logout).
  - Home = a big month calendar. Class days are marked per style colour, only for the dancer's styles. The month switcher is limited to the months they were registered for.
  - Tapping a day opens a sheet showing each class that day: style, time, instructor, attendance status, videos (play, download) and music (play, "Practise in Studio").
- **Admin tabs:** Today · Calendar · Attendance · Media · More (Members/Import, Styles, Instructors, Admins & Roles, Settings & Links).
- **Calendar and time pickers:** custom components in `components/ui` (month grid, time picker) so they can take the pixel theme later. No heavy date-picker library.
- **Theme:** `src/theme/tokens.css` holds CSS custom properties: colours, font families, radii, shadows, spacing, and per-style colours. Every component uses tokens, never hardcoded colours or fonts. Tailwind 4 `@theme` maps to these tokens. The values are defined in §13.1.
- **Loading, empty and error states** exist for every screen. Error messages come from the error `code`, never raw server text. There is an offline banner and a "ticks waiting to sync" indicator.

### 13.1 Visual design: 8-bit retro game

**Brief (owner):** 2D pixel texture · 8-bit retro game aesthetic · bright colours on a simple background · nostalgic video-game style.

**Palette.** Use the PICO-8 16-colour palette: a well-known, bright, "fantasy console" set that reads as 8-bit instantly. Use only these colours; no gradients or blends.

| Token | Hex | Use |
|---|---|---|
| `--c-bg` | `#FFF1E8` (cream) | the one simple page background, flat |
| `--c-ink` | `#000000` | text, 4 px outlines, hard shadows |
| `--c-panel` | `#FFFFFF` | cards and panels (white on cream, black outline) |
| `--c-muted` | `#C2C3C7` / `#5F574F` | disabled, secondary text (dark grey on cream only) |
| `--c-navy` | `#1D2B53` | top bar, tab bar, video / Studio stage background |
| `--c-red` | `#FF004D` | danger, absent, recording |
| `--c-orange` | `#FFA300` | primary action (START buttons) |
| `--c-yellow` | `#FFEC27` | highlights, selected day, active loop range |
| `--c-green` | `#00E436` | present / success / synced |
| `--c-blue` | `#29ADFF` | links, info, playhead |
| `--c-pink` | `#FF77A8` | secondary accent |
| `--c-lavender`, `--c-peach`, `--c-darkgreen`, `--c-brown`, `--c-darkpurple` | `#83769C`, `#FFCCAA`, `#008751`, `#AB5236`, `#7E2553` | extra style colours, chart and marker colours |

- **Style colours** are stored in `DanceStyles.colorKey`, with defaults Hip Hop = orange, Popping = blue, Latin = pink, Locking = green. Admins can pick from the palette only.
- **Contrast rule:** text is always `--c-ink` on bright fills, or cream/white on `--c-navy`/`--c-red`/`--c-darkpurple`. **Never** white text on yellow, green, orange or blue. Check every pairing for WCAG AA.

**Type**
- **Display:** "Press Start 2P" (Google Fonts). Use it only for titles, button labels, tab labels and big numbers. Minimum 10 px, uppercase, `letter-spacing: 0`.
- **Body:** "Pixelify Sans" (Google Fonts), 16 px minimum on phones, used for names, lists, forms and paragraphs. Press Start 2P is unreadable for long text or long Malay names.
- **Timecodes** (Studio, attendance counts) use Press Start 2P with `font-variant-numeric: tabular-nums`, or "VT323" if the widths jump.
- Load fonts with `font-display: swap` and self-host them through `@fontsource` packages, so there is no layout jump and it works on slow campus Wi-Fi.

**Pixel rules**
- `border-radius: 0` everywhere. Borders are 4 px `--c-ink` on phones and 3 px on dense desktop tables.
- **Hard shadows:** `box-shadow: 4px 4px 0 var(--c-ink)`, never blurred.
- **Buttons** look like game buttons. On `:active` they translate `4px 4px` and drop the shadow, as if pressed down. The disabled state is flat grey with no shadow.
- **Pixel-stepped corners** on cards and dialogs, made with a `clip-path` polygon that notches the 4 corners by 4 px (a utility class `.px-corners`). No real rounding.
- **Texture:** "2D pixel texture" = an optional 2×2 dither or checker pattern on `--c-bg`. It is a tiny inline SVG, opacity ≤ 6%, `image-rendering: pixelated`, and must never sit behind body text blocks. The background stays simple.
- **Icons:** `pixelarticons` (MIT, SVG) at 24 px, or 48 px for tab icons. No emoji and no smooth icon sets.
- **Images:** logos and sprites use `image-rendering: pixelated`, scaled only by whole-number factors (2×, 3×). The owner's `UMDSC Design/Pixel.ai` and logo files are the source for a pixel UMDSC logo sprite.
- **Motion:** stepped animations only (`animation-timing-function: steps(n)`). Blinking "PRESS START" cursor, 2–4 frame sprite bounces, and a screen "wipe" between pages (≤ 250 ms). Everything is disabled under `prefers-reduced-motion`.
- **Sound:** none by default. Optional 8-bit click sounds are out of scope (YAGNI).

**Game metaphors.** Keep these light. They are labels and visuals, not new features.

| Screen | Treatment |
|---|---|
| Login | Title screen: pixel UMDSC logo, blinking "PRESS START", name and matric fields styled as a "player select" card. Admin login is a smaller "ADMIN MODE" link. |
| Dancer calendar | "Stage select" month grid. Class days are pixel tiles in the style colour. Attended days show a ✓ coin sprite, missed days a grey X, upcoming days a blinking outline. |
| Monthly attendance | A **hearts bar** (♥♥♥♡ = 3 of 4 classes attended), like an HP bar. |
| Day sheet | "Level card" per class: style, time and instructor as a stats block, with video and music as item slots. |
| Music Studio | The player is a "cartridge / boombox" panel on the navy stage. The timeline is a pixel track: loop range in yellow, playhead in blue, markers as flags, speed as a chunky segmented selector. The video sits in a pixel-bordered screen with an 8-bit mute icon. |
| Admin attendance | A "roster" list with big toggle blocks: green `✓ PRESENT` / empty `ABSENT`. Present count as a score counter ("SCORE 12/18"). A floating "SAVING…" pixel spinner while ticks sync. |
| Loading / empty / error | "LOADING…" with a stepped progress bar. Empty states use a small sprite with one line of text. Errors are a "GAME OVER"-style panel only for fatal errors; normal errors are plain toasts with a fix hint. |

**Layout on a simple background.** One flat cream background, with content in white outlined panels and generous 16–24 px spacing. Avoid crowding; bright colour goes on actions and status, not everywhere. Desktop uses the same panels in a wider grid, and the attendance grid becomes a table with 3 px borders and a sticky name column.

**Accessibility.** Pixel style must not cost usability:
- Visible focus ring: 4 px yellow outline + ink offset.
- Tap targets ≥ 44 px.
- Status never shown by colour alone (✓ / X icon + text).
- `lang="en"`, labels on every input.
- Test with 200% text zoom.

## 14. Testing strategy

- **Unit (Vitest, TDD):** `normalize`, `headerMatch` and `classDetect` (fixtures built from the real registration file's headers and class answers), `sessionGen`, `attendanceGrid` (cell mapping), `tokens`, `passwords`, `syncMath`, `driveIds`, and the `resumableUpload` chunk maths.
- **Handler tests:** each api feature runs against an in-memory fake of `SpreadsheetApp`, `DriveApp`, `CacheService` and `LockService` (`api/test/fakes/`).
- **E2E (Playwright via `webapp-testing`):** iPhone 12 viewport (390×844) and desktop (1440×900). Flows:
  - dancer login → calendar → day sheet → Studio loop with video;
  - admin login → generate month → import preview → confirm → tick attendance → the sheet shows `/`.
- **Manual device checks (required):** iPhone Safari (music + video sync, `playsinline`, mute), Android Chrome, desktop Chrome. Upload a 500 MB video on 4G and turn airplane mode on and off mid-upload to confirm resume.
- **Load test:** §12.4.

## 15. Out of scope (YAGNI)

- Payment verification.
- Notifications (WhatsApp, email).
- A native or installable app.
- A Class Lead role (can be added later through Roles).
- YouTube-wide search.
- Editing the Google Form.
- Offline mode beyond the tick retry queue.
- Automatic deletion of old videos.

## 16. Risks

| Risk | Mitigation |
|---|---|
| `drive.file` + Picker cannot write into a pasted folder | spike first; `drive` scope in Testing mode as the fallback (§11.1) |
| HEVC `.mov` videos won't play on Android or Windows | pre-upload warning + recording guidance |
| iOS Safari refusing to start two media elements at once | start both in the same tap; video muted by default; test on a real iPhone |
| Apps Script concurrency cap | caching, `notModified`, backoff, load test gate |
| Club Gmail password lost at committee handover | `docs/HANDOVER.md` checklist |
| Sheets auto-converting dates, matric numbers and phone numbers | plain-text formats before every write; `getDisplayValues` on import |
| DanceCue has no licence file | keep the author's written approval; credit in `CREDITS.md` and in the Studio's About section |
