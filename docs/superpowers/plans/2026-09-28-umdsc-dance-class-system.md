# UMDSC Dance Class System — Implementation Plan

> **For agentic workers (Gemini in Antigravity):** REQUIRED SUB-SKILL: use `executing-plans` (in `.agents/skills/executing-plans`) to run this plan task by task. If you can run parallel agents, use `subagent-driven-development` instead. Steps use checkbox (`- [ ]`) syntax: tick each one when done. **Read the spec before starting any task.**

**Goal:** Build a free, responsive, 8-bit-styled website where UMDSC admins run monthly dance classes (import registrations, schedule, attendance, videos, music) and dancers see their own calendar, videos and attendance, and practise in a DanceCue-based Music Studio with a synced class video.

**Architecture:**
- A React SPA on Cloudflare Pages talks to one Google Apps Script web app, which runs as the club Gmail.
- Google Sheets and Drive are the database; all Drive/Sheets access is behind small "port" interfaces so logic is unit-tested in Node.
- Admin video/MP3 uploads go browser → Drive directly with the admin's own Google sign-in (`drive.file`), and media streams from the Drive API with a public API key.

**Tech Stack:**
- Web: React 19, TypeScript 5, Vite 6, Tailwind CSS 4, React Router 7, @tanstack/react-query 5, date-fns 4 + date-fns-tz, idb-keyval, @fontsource (Press Start 2P, Pixelify Sans, VT323), pixelarticons.
- Backend: Google Apps Script (V8) in TypeScript, bundled by esbuild and pushed with `@google/clasp` 3.
- Tests: Vitest, fake-indexeddb, Playwright.
- Workspace: Node 24, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-09-28-umdsc-dance-class-system-design.md`, the source of truth. When this plan and the spec disagree, the spec wins; stop and tell the owner.

**Setup values:** `docs/SETUP-VALUES.md` (Google Cloud IDs, club Gmail, test Drive links).

---

## Global Constraints

- Repo root = `C:\Users\user\Downloads\UMDSC Design\UMDSC Dance Class System` (the spec's `umdsc-dance/`). npm workspaces: `shared`, `api`, `web`.
- Time zone everywhere: `Asia/Kuala_Lumpur`.
  - Across the API and in Sheets, dates are strings `YYYY-MM-DD`, months `YYYY-MM`, times `HH:mm`, timestamps ISO strings. Never send JS `Date` objects over the API.
  - Before writing dates, times, matric or phone numbers, set the Sheet column to plain text (`@`). On import, read the source with `getDisplayValues()`.
- Rows are found by `id` / header name, never by row or column position.
- Every table row has `id, version, updatedBy, updatedAt, active`. Nothing is ever physically deleted.
- API calls: `POST` with `Content-Type: text/plain;charset=utf-8`, the token **in the body**, no custom headers, `redirect: "follow"`.
- Every write handler runs inside the script lock (`waitLock(20000)`, timeout → `BUSY` retryable) and carries an `opId` (idempotent for 6 h).
- The server enforces permissions and dancer scoping on every action. Hiding buttons in the UI is never the security boundary.
- Google OAuth scope in the browser: `https://www.googleapis.com/auth/drive.file` **only** (unless Task 2's spike fails; see there).
- **Colours and fonts come only from `web/src/theme/tokens.css`** (PICO-8 palette + Press Start 2P / Pixelify Sans / VT323, spec §13.1).
  - `border-radius: 0`; hard shadows `4px 4px 0 var(--c-ink)`; no gradients, no blur.
  - Tap targets ≥ 44 px; body text ≥ 16 px Pixelify Sans; Press Start 2P ≥ 10 px for labels only.
  - Never put white text on yellow, green, orange or blue.
- Layout breakpoints: `< 768px` PhoneShell; `768–1023px` PhoneShell centred at max-width 560 px; `≥ 1024px` DesktopShell.
- **Never commit:** `*.xlsx` (the registration file has personal data), `.env.local`, `reference/`, any password, `TOKEN_SECRET`, `SETUP_CODE`, or the OAuth client secret. The GitHub repo is **private**.
- DanceCue code (from `reference/DanceCue`, author JzeAnson, used with permission) keeps a credit header in every ported file. `CREDITS.md` names the author.
- Seed dance styles: Locking (colorKey `green`), Popping (`blue`), Hip Hop (`orange`), Latin (`pink`).
- Club system Gmail: `umdancesportc@gmail.com`. It appears in every "share this with…" error message (read it from `Settings`/config, not hardcoded in several places).

## Review Focus

These failure modes are implied by the spec but easy to miss. Each one is pinned by a test in the task named.

1. **Next month's form changes wording** (`Name` instead of `Full Name`, `HipHop class` instead of `Hip Hop (RM60/month)`, extra columns). Import must still map correctly or let the admin fix it in the preview. Tests in **Task 11**.
2. **A dancer types login details differently from the form** (`22004591` vs sheet `22004591/1`, lower-case `s2199647`, name without "BIN", swapped name order, one-letter typo). Login must succeed; a wrong name must fail with `NAME_MISMATCH`. Tests in **Task 4** and **Task 8**.
3. **An admin edits the Google Sheet by hand** (sorts rows, renames header labels, inserts a column). Ticks must still land in the right cell. Test in **Task 14**.
4. **The network drops, or the tab closes, with ticks still pending.** Ticks must survive and sync later, and toggling a dancer twice must send only the final state. Test in **Task 22**.
5. **A class is moved to another date after attendance was taken.** The ticks must stay, and only the label changes. Test in **Task 15**.

---

## How to run this plan (read once)

1. **🧑 OWNER ACTION steps:** stop, tell the owner exactly what to do (copy the step text), and wait for their reply. Never ask the owner for the club Gmail password. Owner actions only ever need the owner's own browser or terminal.
2. **Test commands:** `npm test -w api`, `npm test -w web`, `npm run e2e -w web`, `npm run build -w web`, `npm run build -w api`.
3. **TDD:** for every task with a test step, write the test, see it fail, implement, see it pass (skill `test-driven-development`). Do not skip the "see it fail" run.
4. **Output:** write complete files. Never leave `// ...rest unchanged` or placeholder bodies. If output gets long, use the skill `output-skill`.
5. **Bugs:** on any bug or failing test you don't understand, use `systematic-debugging` before changing code.
6. **Finishing a task:** use `verification-before-completion` (run the listed commands and paste the result) before ticking a task done.
7. **Reviews:** at the end of each milestone, use `requesting-code-review`. When review feedback arrives, use `receiving-code-review` (verify each point before changing code; don't agree blindly).
8. **Commits:** one commit per task, conventional message, on branch `main`. The repo is private.

### Skills map (Antigravity: `.agents/skills/`)

| When | Use | Do NOT use |
|---|---|---|
| Running this plan | `executing-plans` (or `subagent-driven-development` / `dispatching-parallel-agents` for independent tasks, e.g. M2 vs M6) | `brainstorming`, `writing-plans` (already done) |
| Any logic / API / hook | `test-driven-development`, `systematic-debugging` | |
| UI work (M6–M9) | `ui-ux-pro-max` (search "pixel art", "retro game", "8-bit" for patterns and palette checks), `design-system` (tokens → components), `frontend-design` + `impeccable` (polish, a11y, motion, responsive), `ui-styling` (Tailwind 4 specifics) | `taste-skill`, `soft-skill`, `minimalist-skill`, `brutalist-skill`, `gpt-tasteskill`, `stitch-skill`, `redesign-skill`: each imposes its own aesthetic and fights the 8-bit spec |
| Optional art | `imagegen-frontend-web` (generate one reference mockup per screen in 8-bit style before building it), `brand` (pixel UMDSC logo sprite from the owner's `UMDSC Design/Pixel.ai` + logo PNGs) | `banner-design`, `slides` (not needed) |
| Testing | `webapp-testing` (Playwright at 390×844 and 1440×900) | |
| Quality | `code-simplifier` at the end of each milestone, `requesting-code-review` / `receiving-code-review`, `code-review` before go-live, `verification-before-completion` always | |
| Long outputs | `output-skill` | |
| Session went wrong | the owner runs `diagnosing-superpowers` (Claude Code) on the transcript | |
| After several sessions | the owner can use `claude-mem:knowledge-agent` (Claude Code) to build a "UMDSC decisions" knowledge base | |

---

## File structure (locked)

```
package.json                     workspaces ["shared","api","web"], scripts: test, build, e2e
.gitignore                       node_modules, dist, .env.local, reference/, *.xlsx, .clasprc.json, playwright-report, test-results
CREDITS.md
docs/HANDOVER.md                 (Task 33)
scripts/call.mjs                 CLI to call the API (setup, smoke tests) — prompts for secrets locally
scripts/loadtest.mjs             (Task 32)
spikes/drive-upload/index.html   (Task 2, never deployed)

shared/src/types.ts              API + entity types, ErrorCode, PermissionCode, PERMISSIONS
shared/src/driveIds.ts           Drive link parser (Task 5)
shared/src/youtube.ts            DanceCue's getYouTubeVideoId (Task 17)
shared/src/index.ts

api/appsscript.json  api/build.mjs  api/.clasp.json  api/tsconfig.json  api/vitest.config.ts
api/src/main.ts                  doGet/doPost entry → handleRequest
api/src/router.ts                ROUTES table + handleRequest(req, ctx)
api/src/errors.ts                AppError, toErrorBody
api/src/ports.ts                 SheetPort, SpreadsheetPort, DrivePort, CachePort, LockPort, PropsPort, HttpPort, Ctx
api/src/gas/                     adapters.ts (real GAS implementations of ports), setupHelpers.ts (initSecrets, authorizeOnce)
api/src/logic/                   normalize.ts, headerMatch.ts, classDetect.ts, buildMembers.ts,
                                 sessionGen.ts, attendanceGrid.ts, filenameDate.ts, permissions.ts
api/src/security/                tokens.ts, passwords.ts, throttle.ts
api/src/db/                      schema.ts, table.ts, cache.ts, lock.ts, ids.ts, db.ts
api/src/features/                setup.ts, auth.ts, settings.ts, masterData.ts, access.ts, sessions.ts,
                                 members.ts, attendance.ts, videos.ts, music.ts, bootstrap.ts
api/test/fakes/                  fakeSheets.ts, fakeDrive.ts, fakeCache.ts, fakeLock.ts, fakeProps.ts, makeCtx.ts
api/test/**/*.test.ts

web/index.html  web/vite.config.ts  web/.env.production (public values only)  web/.env.local (ignored)
web/src/main.tsx  web/src/app/ (App.tsx, routes.tsx, PhoneShell.tsx, DesktopShell.tsx, guards.tsx)
web/src/theme/tokens.css  web/src/theme/pixel.css  web/src/assets/sprites/
web/src/components/ui/           PixelButton, Panel, Sheet, Toast, TabBar, Sidebar, MonthCalendar, TimePicker,
                                 HeartsBar, Spinner, EmptyState, Field
web/src/lib/                     api.ts, session.ts, queryClient.ts, time.ts, tickQueue.ts, csv.ts
web/src/lib/google/              gis.ts, picker.ts, resumableUpload.ts, driveUrls.ts, driveFolders.ts
web/src/features/                auth/, setup/, calendar/, classes/, masterdata/, access/, settings/,
                                 members/, attendance/, media/, me/, music-studio/ (dancecue/, sync/, sources/)
web/e2e/*.spec.ts  web/e2e/fixtures/*.json
```

---

# Milestone M0 — Foundation and risk spike

### Task 1: Repository init

**Files:** Create `package.json`, `.gitignore`, `CREDITS.md`, `shared/package.json`, `shared/tsconfig.json`, `shared/src/types.ts`, `shared/src/index.ts`.

**Interfaces — Produces** (`@umdsc/shared`), used by every later task:
```ts
export type Month = string;      // 'YYYY-MM'
export type ISODate = string;    // 'YYYY-MM-DD'
export type HHmm = string;       // 'HH:mm'
export type ErrorCode = 'UNAUTHORIZED'|'FORBIDDEN'|'VALIDATION'|'NOT_FOUND'|'VERSION_CONFLICT'
  |'LINK_INVALID'|'LINK_NO_ACCESS'|'LINK_WRONG_KIND'|'LINK_READ_ONLY'|'NAME_MISMATCH'
  |'NOT_REGISTERED'|'LOCKED_OUT'|'BUSY'|'QUOTA'|'INTERNAL'|'SETUP_DONE'|'SETUP_REQUIRED';
export const PERMISSIONS: readonly { code: PermissionCode; group: string; adminOnly?: true }[];
// codes exactly as spec §7.3; adminOnly on settings.edit, admins.manage, roles.manage
export type PermissionCode = 'calendar.view'|'attendance.view.own'|'attendance.view.all'|'attendance.edit'
  |'sessions.edit'|'styles.edit'|'instructors.edit'|'members.view'|'members.import'|'videos.view'
  |'videos.upload'|'videos.edit'|'music.view'|'music.edit'|'sections.edit'|'settings.edit'
  |'admins.manage'|'roles.manage'|'export.download';
export type PermMap = Partial<Record<PermissionCode, '*' | string[]>>;   // string[] = styleIds
export interface ApiRequest { action: string; token?: string; payload?: unknown; opId?: string; sinceVersion?: number }
export type ApiResponse<T> = { ok: true; data: T; dataVersion: number; serverTime: string }
  | { ok: false; error: { code: ErrorCode; message: string; retryable: boolean; latest?: unknown } };
export interface RowMeta { id: string; version: number; updatedBy: string; updatedAt: string; active: boolean }
export interface DanceStyle extends RowMeta { name: string; aliases: string[]; colorKey: string; defaultWeekday: number|null;
  defaultStart: HHmm; defaultEnd: HHmm; defaultInstructorId: string; defaultVenue: string; attendanceFolderId: string; videoFolderId: string }
export interface Instructor extends RowMeta { name: string; contact: string }
export interface ClassSession extends RowMeta { month: Month; styleId: string; seq: number; date: ISODate; start: HHmm; end: HHmm;
  instructorId: string; venue: string; status: 'scheduled'|'replacement'|'cancelled'; note: string }
export interface Member { memberId: string; fullName: string; matricRaw: string; matricKey: string; nameKey: string; contact: string;
  email: string; gender: string; nationality: string; styleIds: string[]; styleNames: string[]; sourceTimestamp: string; flags: string[] }
export interface VideoItem extends RowMeta { styleId: string; month: Month; sessionId: string; title: string; driveFileId: string;
  mimeType: string; sizeBytes: number; folderId: string; uploadedBy: string; source: 'upload'|'scan' }
export interface MusicItem extends RowMeta { styleId: string; month: Month; sessionId: string; title: string;
  sourceType: 'mp3'|'youtube'; driveFileId: string; youtubeId: string }
export interface Section extends RowMeta { musicId: string; name: string; startSec: number; endSec: number; videoId: string; videoStartSec: number|null }
export interface Role extends RowMeta { name: string; description: string; loginType: 'admin'|'dancer'; isSystem: boolean; permissions: PermissionCode[] }
export interface AdminUser extends RowMeta { username: string; displayName: string; roleId: string }
export interface TokenClaims { sub: string; role: 'admin'|'dancer'; name: string; exp: number; pv: number; perms: PermMap }
export interface DancerBootstrap { profile: { matricKey: string; fullName: string; months: Month[]; perms: PermMap };
  styles: DanceStyle[]; instructors: Instructor[]; sessions: ClassSession[]; attendance: { sessionId: string; present: boolean }[];
  videos: VideoItem[]; music: MusicItem[]; sections: Section[] }
export interface AdminBootstrap { profile: { username: string; displayName: string; perms: PermMap }; styles: DanceStyle[];
  instructors: Instructor[]; sessions: ClassSession[]; roles: Role[]; months: Month[]; settings: Record<string,string> }
export interface AttendanceGrid { month: Month; styleId: string; version: number; sessions: ClassSession[];
  members: { memberId: string; fullName: string; matric: string }[]; present: Record<string, string[]> } // memberId -> sessionIds
export interface LoginResult<B> { token: string; claims: TokenClaims; bootstrap: B }
```

- [ ] **Step 1:** `git init`, set branch `main`. Write `.gitignore` exactly as in the file structure above. Create root `package.json` with `"private": true`, `"workspaces": ["shared","api","web"]`, and scripts `"test": "npm test -ws --if-present"`, `"build": "npm run build -ws --if-present"`.
- [ ] **Step 2:** Write `shared/src/types.ts` with the Interfaces block above (verbatim names). `shared/package.json` name `@umdsc/shared`, `"main": "src/index.ts"`, `"types": "src/index.ts"`.
- [ ] **Step 3:** `CREDITS.md`: "Music Studio is based on DanceCue by JzeAnson (https://github.com/JzeAnson/DanceCue), used with the author's permission."
- [ ] **Step 4:** Run `git status`. Expected: no `.xlsx`, no `reference/` listed.
- [ ] **Step 5:** 🧑 **OWNER ACTION:** "Please confirm you want a **private** GitHub repo named `umdsc-dance-class` under `chandahui2004-hub`." After a yes, run `gh repo create umdsc-dance-class --private --source . --remote origin`.
- [ ] **Step 6:** Commit `chore: init workspace, shared types, credits` and `git push -u origin main`.

### Task 2: Spike — Drive upload with `drive.file` + Picker, and streaming with the API key

This decides spec §11.1. The code is throwaway; only the result matters.

**Files:** Create `spikes/drive-upload/index.html` (a single file with inline JS, loading `https://accounts.google.com/gsi/client` and `https://apis.google.com/js/api.js`).

- [ ] **Step 1:** Build one page with 4 buttons, each logging to an on-page `<pre>`:
  1. **Sign in:** `google.accounts.oauth2.initTokenClient({client_id, scope:'https://www.googleapis.com/auth/drive.file', callback})`, then `requestAccessToken()`.
  2. **Pick folder:** `google.picker.PickerBuilder` with `DocsView(ViewId.FOLDERS).setSelectFolderEnabled(true).setIncludeFolders(true).setParent(TEST_VIDEO_FOLDER_ID)`, `.setOAuthToken(token).setDeveloperKey(API_KEY).setAppId('764158079871')`.
  3. **Create subfolder + upload:** `POST https://www.googleapis.com/drive/v3/files` with `{name:'spike-test', mimeType:'application/vnd.google-apps.folder', parents:[pickedId]}`. Then a resumable upload of a user-chosen small `.mp4` into it (`uploadType=resumable`, one PUT). Then `POST /drive/v3/files/{id}/permissions` with `{type:'anyone', role:'reader'}`.
  4. **Play:** set `<video src="https://www.googleapis.com/drive/v3/files/{id}?alt=media&key=API_KEY" controls playsinline>`.

  Constants come from `docs/SETUP-VALUES.md`. Serve it with `npx vite spikes/drive-upload --port 5173`; the port must be 5173 because that origin is authorized.
- [ ] **Step 2:** 🧑 **OWNER ACTION:** "Open http://localhost:5173 in Chrome signed in as an admin Gmail that is listed as a test user. Click the 4 buttons in order, pick the *test video folder*, choose any small MP4, and send me the text in the log box."
- [ ] **Step 3:** Record the result in `docs/SETUP-VALUES.md` under a new heading `## Spike result (Task 2)`:
  - `PASS`: subfolder created, upload OK, video plays and seeks.
  - `FAIL at step N: <error>`.
- [ ] **Step 4:** If it **FAILS** at step 3 with 403/404 on the parent folder:
  - Switch the scope to `https://www.googleapis.com/auth/drive`.
  - 🧑 **OWNER ACTION:** add that scope in Google Auth Platform → Data Access, and confirm admins are Test users.
  - Retry. Record that `lib/google/gis.ts` (Task 25) must use the `drive` scope, and put the scope in `docs/SETUP-VALUES.md`.
- [ ] **Step 5:** If **playback** fails, record the error and stop. Tell the owner the spec §11.3 streaming approach needs revisiting before M8.
- [ ] **Step 6:** Commit `chore: drive upload spike + result`.

# Milestone M1 — API foundation

### Task 3: Apps Script project scaffold, build and deploy pipeline

**Files:** Create `api/package.json`, `api/tsconfig.json`, `api/vitest.config.ts`, `api/build.mjs`, `api/appsscript.json`, `api/src/main.ts`, `api/src/gas/setupHelpers.ts`, `scripts/call.mjs`. Modify `docs/SETUP-VALUES.md`.

**Interfaces — Produces:**
- Global GAS functions exposed by the bundle footer: `doGet(e)`, `doPost(e)`, `initSecrets()`, `authorizeOnce()`.
- `scripts/call.mjs <action> [jsonPayload]`: POSTs to `API_URL` (from `web/.env.local`, `VITE_API_URL`) and prints the JSON. For `setup.init` it prompts for the setup code, username and password with hidden input (node `readline`), so secrets never appear in chat or in files.

- [ ] **Step 1:** `api/package.json`:
  - devDeps: `typescript`, `esbuild`, `vitest`, `@types/google-apps-script`, `@google/clasp@^3`.
  - scripts: `"build": "node build.mjs"`, `"test": "vitest run"`, `"push": "npm run build && clasp push -f"`.
- [ ] **Step 2:** `build.mjs`: esbuild bundles `src/main.ts` → `dist/Code.js` (`format: 'iife'`, `globalName: 'UMDSC'`, `target: 'es2019'`) and copies `appsscript.json` to `dist/`. Use this footer verbatim, because Apps Script only sees top-level function declarations:
  ```js
  function doGet(e){return UMDSC.doGet(e)}
  function doPost(e){return UMDSC.doPost(e)}
  function initSecrets(){return UMDSC.initSecrets()}
  function authorizeOnce(){return UMDSC.authorizeOnce()}
  ```
- [ ] **Step 3:** `appsscript.json`:
  ```json
  { "timeZone": "Asia/Kuala_Lumpur", "runtimeVersion": "V8", "exceptionLogging": "STACKDRIVER",
    "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" },
    "dependencies": { "enabledAdvancedServices": [{ "userSymbol": "Drive", "serviceId": "drive", "version": "v3" }] },
    "oauthScopes": ["https://www.googleapis.com/auth/spreadsheets","https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/script.scriptapp","https://www.googleapis.com/auth/script.external_request"] }
  ```
- [ ] **Step 4:** `main.ts` exports:
  - `doGet(e)`: `?action=health` → `{ok:true, data:{version:'0.1.0'}}`;
  - `doPost(e)`: temporarily echoes `{ok:true, data:{echo: action}}`;
  - `initSecrets()` and `authorizeOnce()` from `setupHelpers.ts`.
  - `initSecrets` sets Script Properties `TOKEN_SECRET` (64 random chars from `Utilities.getUuid()` ×2, dashes removed) **only if missing**, and `SETUP_CODE` (8 chars). It logs **only** `SETUP_CODE`.
  - `authorizeOnce` just calls `DriveApp.getRootFolder().getName()` and returns it. Running any function makes Google ask for every scope in the manifest, so one run authorizes everything.
  - Responses: `ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON)`.
- [ ] **Step 5:** 🧑 **OWNER ACTION:** "In a terminal in this folder run `npx clasp login` and sign in as **umdancesportc@gmail.com**. Then tell me 'done'."
- [ ] **Step 6:** Run `npx clasp create-script --type standalone --title "UMDSC API" --rootDir dist` from `api/` (clasp 3 name; if it's missing, check `npx clasp --help` for the create command). Commit `api/.clasp.json`; the script ID is not secret.
- [ ] **Step 7:** `npm run push -w api`, then `npx clasp create-deployment --description "prod"` (clasp 3; check `--help`). Record the **deployment ID** and the URL `https://script.google.com/macros/s/<deploymentId>/exec` in `docs/SETUP-VALUES.md`. Write `web/.env.local` with `VITE_API_URL=<url>` plus the three Google values.
- [ ] **Step 8:** 🧑 **OWNER ACTION:** "Open https://script.google.com as umdancesportc@gmail.com → project **UMDSC API** → choose function `authorizeOnce` → Run → Allow all permissions. Then choose `initSecrets` → Run → open *Execution log* and keep the SETUP_CODE shown there **private** (you'll type it once in a later step). Tell me 'done' — do not send me the code."
- [ ] **Step 9:** Verify: `curl -L "<url>?action=health"`. Expected: `{"ok":true,"data":{"version":"0.1.0"}}`. Then `node scripts/call.mjs ping`. Expected: `{"ok":true,"data":{"echo":"ping"}}`.
- [ ] **Step 10:** Every later redeploy uses `npx clasp update-deployment <deploymentId>` so the URL never changes. Write this line into `docs/SETUP-VALUES.md`.
- [ ] **Step 11:** Commit `feat(api): apps script scaffold, build, deploy pipeline`.

### Task 4: Normalizers (matric, name, phone, similarity)

**Files:** Create `api/src/logic/normalize.ts`. Test: `api/test/logic/normalize.test.ts`.

**Interfaces — Produces:**
`normalizeMatric(raw: string|number): string`, `nameKey(raw: string): string`, `normalizePhone(raw: string|number): { value: string; repaired: boolean }`, `nameSimilarity(a: string, b: string): number` (0..1).

- [ ] **Step 1: Write the failing tests**
```ts
expect(normalizeMatric('2.2003949E7')).toBe('22003949');
expect(normalizeMatric(22003949)).toBe('22003949');
expect(normalizeMatric(' 22004591/1 ')).toBe('22004591');
expect(normalizeMatric('s2199647')).toBe('S2199647');
expect(normalizeMatric('u2012-345')).toBe('U2012345');
expect(normalizeMatric('')).toBe('');
expect(nameKey('  AHMAD Fiqri  bin Mohd  ')).toBe('ahmad fiqri bin mohd');
expect(nameKey('José')).toBe('jose');
expect(normalizePhone('1.37545173E8')).toEqual({ value: '0137545173', repaired: true });
expect(normalizePhone('012-6015423')).toEqual({ value: '0126015423', repaired: false });
expect(normalizePhone('0173303973')).toEqual({ value: '0173303973', repaired: false });
expect(normalizePhone('+60 12-345 6789')).toEqual({ value: '60123456789', repaired: false });
expect(nameSimilarity('AHMAD FIQRI BIN MOHD ZAMRI', 'ahmad fiqri mohd zamri')).toBeGreaterThanOrEqual(0.8);
expect(nameSimilarity('Wong Jin Wui', 'Jin Wui Wong')).toBeGreaterThanOrEqual(0.8);
expect(nameSimilarity('Yee Jia Xuan', 'Yee Jia Xuen')).toBeGreaterThanOrEqual(0.8);
expect(nameSimilarity('Wong Jin Wui', 'Tan Mei Ling')).toBeLessThan(0.5);
expect(nameSimilarity('Kumar a/l Ravi', 'Kumar Ravi')).toBeGreaterThanOrEqual(0.8);
```
- [ ] **Step 2:** Run `npm test -w api -- normalize`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement. Rules (spec §7.1):
  - **Scientific notation:** `/^\d+(\.\d+)?e\+?\d+$/i` → `Number(x).toFixed(0)`.
  - **Phone:** strip non-digits; if the result is 9–10 digits starting with `1`, prefix `0` and set `repaired: true`.
  - **Similarity:** the max of (a) token-set ratio and (b) `1 - levenshtein/maxLen` on joined keys. Drop optional tokens `bin, binti, bt, a/l, a/p, al, ap` (after `nameKey`) from both sides first.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(api): matric/name/phone normalizers`.

### Task 5: Drive link parsing

**Files:** Create `shared/src/driveIds.ts` (re-exported from `shared/src/index.ts`). Test: `api/test/logic/driveIds.test.ts` (imports from `@umdsc/shared`).

**Interfaces — Produces:** `extractDriveId(url: string): { id: string; kind: 'folder'|'spreadsheet'|'file'|'unknown' } | null`, used by both api and web.

- [ ] **Step 1: Failing tests**
```ts
expect(extractDriveId('https://drive.google.com/drive/folders/10rrxr82U3sSX16i8AksvFbMeWmsLxgST?usp=sharing'))
  .toEqual({ id: '10rrxr82U3sSX16i8AksvFbMeWmsLxgST', kind: 'folder' });
expect(extractDriveId('https://drive.google.com/drive/u/0/folders/1_tr8IiPBvY36c1UQ5PTF9yKpZ-neMiZ6'))
  .toEqual({ id: '1_tr8IiPBvY36c1UQ5PTF9yKpZ-neMiZ6', kind: 'folder' });
expect(extractDriveId('https://docs.google.com/spreadsheets/d/1iyXlD-tknHP75vcq6I-hOWLtGueC8Sj5POiwAGLbJXg/edit?usp=sharing'))
  .toEqual({ id: '1iyXlD-tknHP75vcq6I-hOWLtGueC8Sj5POiwAGLbJXg', kind: 'spreadsheet' });
expect(extractDriveId('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123/view?usp=drive_link'))
  .toEqual({ id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123', kind: 'file' });
expect(extractDriveId('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz0123'))
  .toEqual({ id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123', kind: 'unknown' });
expect(extractDriveId('  1AbCdEfGhIjKlMnOpQrStUvWxYz0123  ')).toEqual({ id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123', kind: 'unknown' });
expect(extractDriveId('hello')).toBeNull();
expect(extractDriveId('https://youtube.com/watch?v=abc')).toBeNull();
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement: ID charset `[A-Za-z0-9_-]{20,}`, and only accept `drive.google.com` / `docs.google.com` hosts or a bare ID. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(shared): drive link parser`.

### Task 6: Ports, fakes, table layer, cache and lock helpers

**Files:**
- Create `api/src/ports.ts`, `api/src/db/schema.ts`, `api/src/db/table.ts`, `api/src/db/cache.ts`, `api/src/db/lock.ts`, `api/src/db/ids.ts`, `api/src/db/db.ts`, `api/src/errors.ts`, `api/src/gas/adapters.ts`, and `api/test/fakes/*.ts`.
- Tests: `api/test/db/table.test.ts`, `api/test/db/cache.test.ts`, `api/test/db/lock.test.ts`.

**Interfaces — Produces:**
```ts
// ports.ts
export type Cell = string | number | boolean;
export interface SheetPort { name: string; getDisplayValues(): string[][]; getLastRow(): number; getLastColumn(): number;
  setValues(row1: number, col1: number, values: Cell[][]): void; appendRows(values: Cell[][]): void;
  setPlainTextColumns(col1s: number[]): void; hideRow(row1: number): void; protectRowWarningOnly(row1: number): void }
export interface SpreadsheetPort { id: string; url: string; name: string; sheet(name: string): SheetPort | null;
  addSheet(name: string, headers: string[]): SheetPort; setName(name: string): void }
export interface DriveItemInfo { exists: boolean; kind: 'folder'|'spreadsheet'|'file'; name: string; canEdit: boolean }
export interface DriveFileInfo { id: string; name: string; mimeType: string; sizeBytes: number; createdTime: string; parentId: string; parentName: string }
export interface DrivePort { info(id: string): DriveItemInfo; openSpreadsheet(id: string): SpreadsheetPort;
  createSpreadsheet(name: string, folderId: string): SpreadsheetPort; createFolder(parentId: string, name: string): string;
  findChildFolder(parentId: string, name: string): string | null; listFilesRecursive(folderId: string): DriveFileInfo[];
  setAnyoneReader(fileId: string): void; exportXlsxBase64(spreadsheetId: string): string }
export interface CachePort { get(key: string): string | null; put(key: string, value: string, ttlSec: number): void; remove(key: string): void }
export interface LockPort { tryLock(ms: number): boolean; release(): void }
export interface PropsPort { get(key: string): string | null; set(key: string, value: string): void }
export interface Ctx { now(): Date; drive: DrivePort; cache: CachePort; lock: LockPort; props: PropsPort; db: Db; clubEmail: string }
// errors.ts
export class AppError extends Error { constructor(public code: ErrorCode, message: string, public retryable = false, public latest?: unknown) }
// table.ts
export class Table<T extends RowMeta> {
  constructor(sheet: SheetPort, columns: readonly string[], codec: RowCodec<T>);
  all(opts?: { includeInactive?: boolean }): T[]; get(id: string): T | null; find(pred: (r: T) => boolean): T[];
  insert(data: Omit<T, keyof RowMeta>, actor: string, now: Date): T;
  update(id: string, version: number, patch: Partial<Omit<T, keyof RowMeta>>, actor: string, now: Date): T; // throws VERSION_CONFLICT
  deactivate(id: string, version: number, actor: string, now: Date): T;
  upsertBy(key: keyof T, data: Omit<T, keyof RowMeta>, actor: string, now: Date): T; }
export interface RowCodec<T> { toCells(row: T): Record<string, Cell>; fromCells(cells: Record<string, string>): T }
// schema.ts: SCHEMA: Record<TabName, readonly string[]> — tabs/columns exactly as spec §5, common columns appended:
//   id, version, updatedBy, updatedAt, active. Also MEMBERS_COLUMNS, ATTENDANCE_FIXED_KEYS
// db.ts: export interface Db { settings: Table<SettingRow>; styles: Table<DanceStyle>; ... one per SCHEMA tab }
//   export function openDb(drive: DrivePort, systemSpreadsheetId: string): Db   (lazy — opens a sheet on first use)
// cache.ts
export function putLarge(cache: CachePort, key: string, value: string, ttlSec: number): void; // 90_000-char chunks
export function getLarge(cache: CachePort, key: string): string | null;
// lock.ts
export function withScriptLock<R>(lock: LockPort, fn: () => R, ms?: number /*20000*/): R; // throws AppError('BUSY', ..., true)
// ids.ts
export function newId(prefix: string): string; // prefix + '_' + 10 url-safe random chars
```

- [ ] **Step 1: Failing tests** (using `fakeSheet(headers, rows)`):
```ts
test('insert assigns id, version 1, audit fields', ...)  // version===1, updatedBy==='admin1', updatedAt===now.toISOString(), active===true
test('columns are found by header name even when reordered', ...) // sheet headers shuffled → get(id) returns same object
test('update with stale version throws VERSION_CONFLICT with latest row', ...) // err.code==='VERSION_CONFLICT'; err.latest.version===2
test('update bumps version and never touches other rows', ...)
test('deactivate keeps the row and sets active=false; all() hides it; all({includeInactive:true}) shows it', ...)
test('plain-text columns: insert calls setPlainTextColumns for date/time/matric/phone columns', ...)
test('putLarge/getLarge round-trips a 250_000-char string across chunks', ...)
test('getLarge returns null if any chunk expired', ...)
test('withScriptLock throws BUSY retryable when lock not acquired and always releases', ...)
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
  - `Table` reads `getDisplayValues()` once per instance and caches it for the request.
  - `SCHEMA` marks plain-text columns with the list `PLAIN_TEXT = ['date','start','end','month','matricKey','matricRaw','contact','defaultStart','defaultEnd','updatedAt','sourceTimestamp','importedAt','lastSyncAt','changedAt','ts']`.
  - Array fields (`aliases`, `styleIds`, `permissions`, `flags`, `months`) are stored comma-joined.
  - Implement the GAS adapters with `SpreadsheetApp`, `DriveApp`, the Advanced `Drive` service (`Drive.Files.get(id,{fields:'id,name,mimeType,capabilities(canEdit)'})` and `Drive.Permissions.create({type:'anyone',role:'reader'}, id)`), `CacheService.getScriptCache()`, `LockService.getScriptLock()`, and `PropertiesService.getScriptProperties()`.
  - `exportXlsxBase64` uses `UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/'+id+'/export?format=xlsx', {headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()}})`, then `Utilities.base64Encode(blob.getBytes())`.
  - The adapters are not unit tested; they are exercised by Task 9's smoke test.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(api): ports, fakes, table layer, cache, lock`.

### Task 7: Tokens, passwords, throttle, permission resolution

**Files:** Create `api/src/security/tokens.ts`, `api/src/security/passwords.ts`, `api/src/security/throttle.ts`, `api/src/logic/permissions.ts`. Tests: `api/test/security/*.test.ts`, `api/test/logic/permissions.test.ts`.

**Interfaces — Produces:**
```ts
export type Hmac = (key: string, message: string) => Uint8Array;  // GAS: Utilities.computeHmacSha256Signature(message, key) → map signed bytes to Uint8Array
export function signToken(claims: TokenClaims, secret: string, hmac: Hmac): string;            // base64url(json) + '.' + base64url(sig)
export function verifyToken(token: string, secret: string, hmac: Hmac, nowSec: number): TokenClaims; // throws AppError UNAUTHORIZED
export function hashPassword(password: string, salt: string, iterations: number, hmac: Hmac): string;
export function verifyPassword(password: string, stored: { hash: string; salt: string; iterations: number }, hmac: Hmac): boolean; // constant-time compare
export const PASSWORD_ITERATIONS = 2000;  // raise if a single hash takes < 300 ms in Apps Script (measure in Task 9)
export function checkThrottle(cache: CachePort, key: string, max: number, windowSec: number): void; // throws LOCKED_OUT
export function recordFailure(cache: CachePort, key: string, windowSec: number): void;
export function clearFailures(cache: CachePort, key: string): void;
export function resolvePermissions(input: { roleIds: string[]; memberRoles: { roleId: string; styleIds: string[] }[];
  rolePerms: Record<string, PermissionCode[]> }): PermMap;
export function can(perms: PermMap, code: PermissionCode, styleId?: string): boolean;
export function validateRolePermissions(role: { name: string; loginType: 'admin'|'dancer'; isSystem: boolean }, perms: PermissionCode[]): void; // throws VALIDATION
```

- [ ] **Step 1: Failing tests** (Node `crypto.createHmac('sha256', key).update(msg).digest()` as `Hmac`):
```ts
const claims = { sub: 'M-22003949', role: 'dancer', name: 'X', exp: 1000, pv: 1, perms: { 'calendar.view': '*' } };
const t = signToken(claims, 'sek', hmac);
expect(t.split('.').length).toBe(2);
expect(verifyToken(t, 'sek', hmac, 999)).toEqual(claims);
expect(() => verifyToken(t, 'sek', hmac, 1001)).toThrow(/UNAUTHORIZED/);
expect(() => verifyToken(t.replace(/^./, 'x'), 'sek', hmac, 999)).toThrow(/UNAUTHORIZED/);
expect(() => verifyToken(t, 'other', hmac, 999)).toThrow(/UNAUTHORIZED/);
const h = hashPassword('pw', 'salt', 3, hmac);
expect(verifyPassword('pw', { hash: h, salt: 'salt', iterations: 3 }, hmac)).toBe(true);
expect(verifyPassword('pW', { hash: h, salt: 'salt', iterations: 3 }, hmac)).toBe(false);
// throttle: 5 failures within window → 6th checkThrottle throws LOCKED_OUT; clearFailures resets
expect(resolvePermissions({ roleIds: ['dancer'], memberRoles: [{ roleId: 'lead', styleIds: ['popping'] }],
  rolePerms: { dancer: ['calendar.view'], lead: ['attendance.edit', 'calendar.view'] } }))
  .toEqual({ 'calendar.view': '*', 'attendance.edit': ['popping'] });
expect(can({ 'attendance.edit': ['popping'] }, 'attendance.edit', 'popping')).toBe(true);
expect(can({ 'attendance.edit': ['popping'] }, 'attendance.edit', 'latin')).toBe(false);
expect(can({ 'attendance.edit': '*' }, 'attendance.edit', 'latin')).toBe(true);
expect(() => validateRolePermissions({ name: 'Admin', loginType: 'admin', isSystem: true }, ['calendar.view'])).toThrow(/VALIDATION/); // Admin must keep roles.manage+admins.manage
expect(() => validateRolePermissions({ name: 'Class Lead', loginType: 'dancer', isSystem: false }, ['settings.edit'])).toThrow(/VALIDATION/);
```
Add this test too: `resolvePermissions({ roleIds: [], memberRoles: [{ roleId: 'lead', styleIds: ['popping'] }], rolePerms: { lead: ['attendance.edit'] } })` → `{ 'attendance.edit': ['popping'], 'attendance.view.all': ['popping'] }`, because edit implies view with the same scope.

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. Merging rules: `'*'` beats any list; lists union; `attendance.edit` implies `attendance.view.all` with the same scope. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(api): tokens, password hashing, throttle, permission resolution`.

### Task 8: Router, setup and auth

**Files:**
- Create `api/src/router.ts`, `api/src/features/setup.ts`, `api/src/features/auth.ts`, `api/test/fakes/makeCtx.ts`.
- Modify `api/src/main.ts` (replace the echo with `handleRequest`).
- Tests: `api/test/router.test.ts`, `api/test/features/setup.test.ts`, `api/test/features/auth.test.ts`.

**Interfaces — Produces:**
```ts
export interface AuthInfo { claims: TokenClaims }
export interface Route<P = any, R = any> { perm: PermissionCode | 'public' | 'signedIn'; write: boolean; bumpsData?: boolean;
  styleOf?: (p: P) => string | undefined;   // for style-scoped permission checks
  handler: (ctx: Ctx, auth: AuthInfo | null, payload: P) => R }
export const ROUTES: Record<string, Route>;   // later tasks register their actions here via registerRoutes()
export function registerRoutes(routes: Record<string, Route>): void;
export function handleRequest(req: ApiRequest, ctx: Ctx, secrets: { tokenSecret: string; hmac: Hmac }): ApiResponse<unknown>;
// handleRequest order: parse → route lookup (unknown → VALIDATION) → verify token unless 'public' → can(perm, styleOf(payload))
//   → if write: withScriptLock + opId dedupe (cache key 'op:'+opId, 6h) → handler → if bumpsData: props DATA_VERSION++
//   → envelope with dataVersion + serverTime. Map GAS errors containing 'Service invoked too many times' or
//   'Exceeded maximum execution' → QUOTA retryable; unknown errors → INTERNAL (log the stack, never return it).
// setup.ts actions: 'setup.status' (public) → { initialized: boolean };
//   'setup.init' (public, write) payload { setupCode, dbFolderUrl, adminUsername, adminDisplayName, adminPassword }
// auth.ts actions: 'auth.adminLogin' (public) { username, password } → LoginResult<AdminBootstrap>
//   'auth.dancerLogin' (public) { fullName, matric } → LoginResult<DancerBootstrap>; 'auth.me' (signedIn) → TokenClaims
// Token lifetimes: dancer 30 days, admin 12 h. Throttle keys 'fail:admin:'+username, 'fail:dancer:'+matricKey (5 fails / 10 min).
// Bootstrap is filled in by Task 18; until then return { profile } with empty arrays.
```

- [ ] **Step 1: Failing tests**:
```ts
test('unknown action → VALIDATION', ...)
test('protected action without token → UNAUTHORIZED; with dancer token lacking perm → FORBIDDEN', ...)
test('style-scoped perm: attendance.mark for popping allowed, for latin FORBIDDEN', ...)
test('same opId twice runs handler once and returns the first result', ...)
test('GAS "Service invoked too many times" → QUOTA retryable=true', ...)
test('setup.init with wrong code → FORBIDDEN; with right code creates UMDSC_System with every SCHEMA tab and headers', ...)
test('setup.init seeds roles Admin(all perms, loginType admin) + Dancer(calendar.view, attendance.view.own, videos.view, music.view)', ...)
test('setup.init seeds styles Locking/green, Popping/blue, Hip Hop/orange (aliases "hip hop,hiphop,hip-hop"), Latin/pink', ...)
test('setup.init twice → SETUP_DONE', ...)
test('setup.init with a folder the club cannot edit → LINK_NO_ACCESS mentioning umdancesportc@gmail.com', ...)
test('adminLogin ok → token verifies, claims.role==="admin"; wrong password 5x → 6th LOCKED_OUT', ...)
test('dancerLogin: sheet matric "22004591/1", typed "22004591" + name without BIN → ok', ...)
test('dancerLogin: typed "s2199647" matches stored "S2199647"', ...)
test('dancerLogin: right matric, different person name → NAME_MISMATCH', ...)
test('dancerLogin: unknown matric → NOT_REGISTERED', ...)
test('dancerLogin claims.perms include MemberRoles extras scoped to styles', ...)
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. Store the system spreadsheet ID in Script Property `SYSTEM_SPREADSHEET_ID`; `openDb` in `main.ts` uses it. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(api): router, setup, admin and dancer login`.

### Task 9: Deploy and smoke-test the real backend

**Files:** Modify `docs/SETUP-VALUES.md`.

- [ ] **Step 1:** `npm run build -w api && npm run push -w api && npx clasp update-deployment <deploymentId>` (from `api/`).
- [ ] **Step 2:** 🧑 **OWNER ACTION:** "Run `node scripts/call.mjs setup.init` in this folder. When asked, paste the SETUP_CODE from the Apps Script log, the Club DB folder link, and choose your admin username and password (typed only in your terminal). Tell me whether it printed ok:true."
- [ ] **Step 3:** Verify that `node scripts/call.mjs setup.status` → `{"ok":true,"data":{"initialized":true}}`.
- [ ] **Step 4:** 🧑 **OWNER ACTION:** "Open the Club DB folder and confirm a spreadsheet **UMDSC_System** exists with tabs Settings, LinkHistory, DanceStyles, … AuditLog, and that DanceStyles has 4 rows."
- [ ] **Step 5:** Measure the password hashing time: `auth.adminLogin` via `scripts/call.mjs` (owner types credentials) and read the execution time in the Apps Script *Executions* page. If hashing takes < 300 ms, raise `PASSWORD_ITERATIONS` and note the new value in `docs/SETUP-VALUES.md`.
- [ ] **Step 6:** Commit `chore(api): first real deployment verified`.

# Milestone M2 — Master data API

### Task 10: Settings/links, master data CRUD, roles and access

**Files:** Create `api/src/features/settings.ts`, `api/src/features/masterData.ts`, `api/src/features/access.ts`. Tests: `api/test/features/settings.test.ts`, `api/test/features/masterData.test.ts`, `api/test/features/access.test.ts`.

**Interfaces — Produces (actions):**
- `settings.get` (`settings.edit`) → `Record<string,string>` plus `clubEmail`.
- `settings.setLink {key, url}` (`settings.edit`, write, bumpsData).
  - Keys: `dbFolderId | defaultAttendanceFolderId | defaultVideoFolderId`.
  - Style links use `styles.update` with `attendanceFolderUrl`/`videoFolderUrl`, which the server converts to IDs through the same validator.
- `links.history {key?}` → `LinkHistoryRow[]`.
- `validateLink(ctx, url, expected: 'folder'|'spreadsheet'): string` → id. Throws `LINK_INVALID | LINK_NO_ACCESS | LINK_WRONG_KIND | LINK_READ_ONLY`, with message `Share this ${kind} with ${ctx.clubEmail} as Editor, then try again.` for the no-access and read-only cases.
- A generic `crudRoutes(prefix, tableName, perm, validate?)` producing `${prefix}.list`, `.create`, `.update`, `.deactivate`. Used for `styles` (perm `styles.edit`, list is `signedIn`) and `instructors` (`instructors.edit`).
- `admins.list | admins.create {username, displayName, password, roleId} | admins.update | admins.resetPassword {id, newPassword}`, all `admins.manage`.
- `roles.list` (`roles.manage`), `roles.create {name, description, loginType}`, `roles.update`, `roles.deactivate`, `roles.setPermissions {roleId, permissions}`.
- `memberRoles.list {roleId?}`, `memberRoles.assign {matricKey, roleId, styleIds}`, `memberRoles.remove {id, version}`.
- Every role, permission or assignment change increments Script Property `PERM_VERSION` (`pv`). `handleRequest` rejects tokens whose `pv` is older with `UNAUTHORIZED`, which forces a re-login.

- [ ] **Step 1: Failing tests**:
```ts
test('setLink with sheet URL for a folder key → LINK_WRONG_KIND', ...)
test('setLink on item without access → LINK_NO_ACCESS, message contains "umdancesportc@gmail.com"', ...)
test('setLink on view-only item → LINK_READ_ONLY', ...)
test('setLink success writes Settings and a LinkHistory row with old and new value', ...)
test('styles.update with stale version → VERSION_CONFLICT carrying latest row', ...)
test('styles.update converts videoFolderUrl to videoFolderId after validation', ...)
test('roles.setPermissions removing roles.manage from Admin → VALIDATION', ...)
test('roles.setPermissions giving settings.edit to a dancer-login role → VALIDATION', ...)
test('roles.deactivate on isSystem role → VALIDATION', ...)
test('admins.update deactivating the last active admin → VALIDATION', ...)
test('memberRoles.assign increments PERM_VERSION; old token then → UNAUTHORIZED', ...)
test('every write appends an AuditLog row (actor, action, target)', ...)
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(api): settings/links, master data CRUD, roles and access`.

# Milestone M3 — Sessions and monthly import

### Task 11: Header matching and class detection

**Files:** Create `api/src/logic/headerMatch.ts`, `api/src/logic/classDetect.ts`. Tests: `api/test/logic/headerMatch.test.ts`, `api/test/logic/classDetect.test.ts`, fixture `api/test/fixtures/formHeaders.ts` (headers only, **no personal data**).

**Interfaces — Produces:**
```ts
export type Field = 'fullName'|'matric'|'contact'|'email'|'gender'|'nationality';
export function matchHeaders(headers: string[]): { map: Record<Field, number|null>; scores: Record<Field, number> };
export function detectClassColumn(rows: string[][], styles: { id: string; aliases: string[] }[], headers: string[]):
  { index: number; hitRate: number } | null;
export function parseStyles(cell: string, styles: { id: string; name: string; aliases: string[] }[]):
  { styleIds: string[]; unknownTokens: string[] };
```

- [ ] **Step 1: Failing tests**:
```ts
const REAL = ['Timestamp','Email','Full Name','Matric Number\n17XXXXXX OR U20XXXXX',
  'Contact Number (able to contact via WhatsApp)','Gender','Faculty','Course/Major','Year','Nationality',
  'Please select the classes that you want to join/continue\n(You may choose more than 1)\n\n🌟 SPECIAL PROMOTION!  🌟',
  'Payment Receipt'];
expect(matchHeaders(REAL).map).toEqual({ email: 1, fullName: 2, matric: 3, contact: 4, gender: 5, nationality: 9 });
expect(matchHeaders(['Nama Penuh','No Matrik','Phone','Jantina','Citizenship','E-mail Address']).map)
  .toEqual({ fullName: 0, matric: 1, contact: 2, gender: 3, nationality: 4, email: 5 });
expect(matchHeaders(['Name','Student ID','WhatsApp No']).map.fullName).toBe(0);  // Review Focus #1
expect(matchHeaders(['Faculty','Year']).map.fullName).toBeNull();
const styles = [{ id: 'hh', name: 'Hip Hop', aliases: ['hip hop','hiphop','hip-hop'] },
  { id: 'pp', name: 'Popping', aliases: ['popping'] }, { id: 'lt', name: 'Latin', aliases: ['latin'] },
  { id: 'lk', name: 'Locking', aliases: ['locking'] }];
const rows = [['A','Popping (RM60/month)','Faculty of Law'], ['B','Hip Hop (RM60/month), Latin (RM60/month)','Engineering'],
  ['C','Latin (RM60/month), Popping (RM60/month)','PASUM']];
expect(detectClassColumn(rows, styles, ['Name','Classes','Faculty'])).toEqual({ index: 1, hitRate: 1 });
expect(parseStyles('Hip Hop (RM60/month), Latin (RM60/month)', styles)).toEqual({ styleIds: ['hh','lt'], unknownTokens: [] });
expect(parseStyles('HipHop class, Contemporary (RM60/month)', styles)).toEqual({ styleIds: ['hh'], unknownTokens: ['Contemporary'] }); // Review Focus #1
expect(detectClassColumn([['A','x'],['B','y']], styles, ['Name','Other'])).toBeNull();
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement per spec §9.1–9.2:
  - Headers: first line only, lower-case, alphanumerics and spaces.
  - A header that contains a synonym scores 1.0; otherwise Dice bigram similarity. Threshold 0.6. Assign fields greedily from the highest score, one column per field.
  - For style matching, compare letters-only lower-case on both sides.
  - An unknown token = a comma-split piece with `(…)` removed that matches no alias, after also stripping the words `class`/`classes`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(api): header matching and class column detection`.

### Task 12: Build members from rows

**Files:** Create `api/src/logic/buildMembers.ts`. Test: `api/test/logic/buildMembers.test.ts`.

**Interfaces — Produces:**
```ts
export interface ImportWarning { kind: 'noStyle'|'unknownClass'|'duplicate'|'missingName'|'missingMatric'|'phoneRepaired'; row: number; detail: string }
export function buildMembers(input: { headers: string[]; rows: string[][]; map: Record<Field, number|null>; classIndex: number;
  styles: { id: string; name: string; aliases: string[] }[]; timestampIndex: number | null }):
  { members: Member[]; warnings: ImportWarning[]; countsByStyle: Record<string, number> };
```

- [ ] **Step 1: Failing tests**:
```ts
test('memberId = "M-" + matricKey; matric "2.2003949E7" → matricKey "22003949"', ...)
test('duplicate matric in same month: styles unioned, latest timestamp kept, one "duplicate" warning', ...)
test('row with empty matric → skipped with "missingMatric" warning', ...)
test('phone "1.37545173E8" stored "0137545173" with "phoneRepaired" warning', ...)
test('row whose class cell matches nothing → kept with styleIds [] and "noStyle" warning', ...)
test('countsByStyle counts each member once per style', ...)
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. **Step 5:** Commit `feat(api): build members from registration rows`.

### Task 13: Class sessions (generate and edit)

**Files:** Create `api/src/logic/sessionGen.ts`, `api/src/features/sessions.ts`. Tests: `api/test/logic/sessionGen.test.ts`, `api/test/features/sessions.test.ts`.

**Interfaces — Produces:**
```ts
export function weekdaysInMonth(month: Month, isoWeekday: number /*1=Mon..7=Sun*/): ISODate[]; // pure Y-M-D arithmetic, no local TZ
export function generateMonthSessions(month: Month, style: DanceStyle): { sessions: Omit<ClassSession, keyof RowMeta>[]; extraWeekFlag: boolean };
// actions: sessions.list {month} (calendar.view — dancer results filtered to own styles),
//   sessions.generateMonth {month, styleIds} (sessions.edit, write) → skips styles that already have sessions that month,
//   sessions.create, sessions.update {id, version, date?, start?, end?, instructorId?, venue?, status?, note?},
//   sessions.cancel {id, version} (status='cancelled').
export function onSessionChanged(fn: (ctx: Ctx, s: ClassSession) => void): void; // listeners called after update/cancel; Task 15 registers attendance.relabel
```

- [ ] **Step 1: Failing tests**:
```ts
expect(weekdaysInMonth('2026-10', 2)).toEqual(['2026-10-06','2026-10-13','2026-10-20','2026-10-27']); // Tuesdays
expect(weekdaysInMonth('2026-10', 4)).toEqual(['2026-10-01','2026-10-08','2026-10-15','2026-10-22','2026-10-29']); // Thursdays
const style = { id: 'st1', defaultWeekday: 2, defaultStart: '20:00', defaultEnd: '22:00', defaultInstructorId: 'in1', defaultVenue: 'DK1' } as DanceStyle;
const g = generateMonthSessions('2026-10', style);
expect(g.sessions.map(s => [s.seq, s.date, s.start, s.status])).toEqual([[1,'2026-10-06','20:00','scheduled'],[2,'2026-10-13','20:00','scheduled'],[3,'2026-10-20','20:00','scheduled'],[4,'2026-10-27','20:00','scheduled']]);
expect(g.extraWeekFlag).toBe(false);
expect(generateMonthSessions('2026-10', { ...style, defaultWeekday: 4 }).extraWeekFlag).toBe(true);
test('generateMonth for a style without defaultWeekday → VALIDATION "Set a default weekday for Latin first"', ...)
test('sessions.update keeps id and seq when date changes', ...)
test('sessions.list for a dancer returns only sessions of their styles and months', ...)
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. **Step 5:** Commit `feat(api): class session generation and editing`.

### Task 14: Attendance grid logic

**Files:** Create `api/src/logic/attendanceGrid.ts`. Test: `api/test/logic/attendanceGrid.test.ts`.

**Interfaces — Produces:**
```ts
export const ATTENDANCE_FIXED_KEYS = ['memberId','fullName','matric','contact','gender','nationality'] as const;
export const FIXED_LABELS = ['Member ID','Full Name','Matric','Contact','Gender','Nationality'];
export function sessionLabel(s: Pick<ClassSession,'seq'|'date'|'status'>): string; // 'C1 07/10 Wed' ; cancelled → 'C1 07/10 Wed (cancelled)'
export function buildLayout(members: Member[], sessions: ClassSession[]): { keyRow: string[]; labelRow: string[]; rows: string[][] };
export function locateCell(keyRow: string[], memberIdColumn: string[], memberId: string, sessionId: string): { row1: number; col1: number } | null;
// keyRow = sheet row 1; memberIdColumn = the whole column under 'memberId' incl. rows 1–2; row1/col1 are 1-based sheet coords
export function planSync(existingKeyRow: string[], existingMemberIds: string[], members: Member[], sessions: ClassSession[]):
  { appendColumns: string[]; appendRows: Member[] };   // never removes anything
```

- [ ] **Step 1: Failing tests**:
```ts
expect(sessionLabel({ seq: 1, date: '2026-10-07', status: 'scheduled' })).toBe('C1 07/10 Wed');
expect(sessionLabel({ seq: 2, date: '2026-10-14', status: 'cancelled' })).toBe('C2 14/10 Wed (cancelled)');
test('locateCell finds the right cell after rows are sorted by name and a manual column is inserted', ...) // Review Focus #3
test('locateCell returns null for unknown member or session', ...)
test('planSync appends only missing session columns and members, never removes', ...)
test('buildLayout marks nothing present initially (all session cells empty strings)', ...)
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. **Step 5:** Commit `feat(api): attendance sheet layout and cell location`.

### Task 15: Members import, attendance sheets, marking and export

**Files:** Create `api/src/features/members.ts`, `api/src/features/attendance.ts`. Tests: `api/test/features/members.test.ts`, `api/test/features/attendance.test.ts`.

**Interfaces — Produces (actions):**
- `members.previewImport {sheetUrl, month}` (`members.import`) → `{ headers, columnMap, scores, classIndex, countsByStyle, warnings, rowCount, sampleNames: string[] /* first 3 */ }`.
- `members.confirmImport {sheetUrl, month, columnMap, classIndex}` (`members.import`, write, bumpsData) → `{ membersSpreadsheetId, memberCount, attendanceSheets: {styleId, spreadsheetId}[] }`. If the month was already imported, it behaves as resync.
- `members.resync {month}` (same result shape).
- `members.list {month, styleId?}` (`members.view`) → `Member[]`.
- `members.update {month, memberId, fullName?, matricRaw?}` (`members.import`, write). Updates the Members sheet and `MemberIndex`.
- `attendance.ensureSheets(ctx, month): {styleId, spreadsheetId}[]` (internal):
  - uses each style's `attendanceFolderId`, falling back to `Settings.defaultAttendanceFolderId`;
  - names the file `YYYY-MM <Style> Attendance`, tab `Attendance`;
  - row 1 = keys (hidden, protected warning-only), row 2 = labels;
  - applies `planSync`.
- `attendance.relabel(ctx, session): void` (internal): rewrites only that session's row-2 label. Registered with `onSessionChanged` from Task 13.
- `attendance.get {month, styleId, ifVersion?}` (`attendance.view.all`, styleOf) → `AttendanceGrid | { notModified: true, version }`.
- `attendance.mark {month, styleId, marks: {opId, sessionId, memberId, present}[]}` (`attendance.edit`, write, styleOf) → `{ applied: string[] /* opIds */, version }`.
  - Writes `/` or `''`.
  - A missing member row is appended **only if** the member exists in that month's Members sheet with that style; otherwise `VALIDATION`.
  - A missing session column is appended.
  - Bumps cache key `attv:{month}:{styleId}`.
  - Grid cache is `att:{month}:{styleId}:{version}` for 60 s.
- `attendance.export {month, styleId}` (`export.download`) → `{ fileName: 'YYYY-MM <Style> Attendance.xlsx', base64 }`.
- A dancer's own attendance is read by Task 18's bootstrap, not by `attendance.get`.

- [ ] **Step 1: Failing tests**:
```ts
test('previewImport on an unshared sheet → LINK_NO_ACCESS', ...)
test('previewImport reads display values: matric shows 22003949 not 2.2003949E7', ...)
test('confirmImport creates Members_2026-10 with plain-text matric/contact, upserts MemberIndex (months "2026-10"), records MemberMonths', ...)
test('confirmImport creates one attendance sheet per style with members of that style only and one column per session', ...)
test('confirmImport again (resync) adds a new form row, keeps existing ticks, removes nothing', ...)
test('MemberIndex for someone in 2026-09 and 2026-10 has months "2026-09,2026-10"', ...)
test('mark twice with same opId writes once', ...)
test('two admins marking different cells in the same sheet: both applied', ...)
test('get with ifVersion equal to current → notModified', ...)
test('session moved to 2026-10-09 after ticks: column keeps ticks, label becomes "C2 09/10 Fri"', ...) // Review Focus #5
test('mark for a memberId not registered in that style → VALIDATION', ...)
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. Batch all reads with one `getDisplayValues()` per sheet and all writes per request before `flush`. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(api): monthly import, attendance sheets, marking, export`.

# Milestone M4 — Media API and bootstrap

### Task 16: Videos (register, scan, target folder)

**Files:** Create `api/src/logic/filenameDate.ts`, `api/src/features/videos.ts`. Tests: `api/test/logic/filenameDate.test.ts`, `api/test/features/videos.test.ts`.

**Interfaces — Produces:**
```ts
export function parseDateFromName(name: string, month: Month): ISODate | null;
// actions: videos.list {month?, styleId?, sessionId?} (videos.view; dancers scoped),
//   videos.targetFolder {sessionId} (videos.upload, styleOf) → { rootFolderId, monthFolderName: 'YYYY-MM',
//      classFolderName: 'YYYY-MM-DD <Style> Class <seq>', musicFolderName: 'Music' }
//   videos.register {driveFileId, sessionId, title} (videos.upload, write, bumpsData): ctx.drive.info must succeed
//      (else LINK_NO_ACCESS text), then setAnyoneReader, then insert Videos row
//   videos.update / videos.deactivate (videos.edit)
//   videos.scan {styleId, month} (videos.edit) → { fileId, name, sizeBytes, mimeType, suggestedSessionId: string|null, reason }[]
//      for video/* and audio/* files under the style's video folder not already registered
```

- [ ] **Step 1: Failing tests**:
```ts
expect(parseDateFromName('2026-10-07 Popping.mp4', '2026-10')).toBe('2026-10-07');
expect(parseDateFromName('07-10-2026 class.mp4', '2026-10')).toBe('2026-10-07');
expect(parseDateFromName('VID 7/10.mp4', '2026-10')).toBe('2026-10-07');
expect(parseDateFromName('Popping 7 Oct.mp4', '2026-10')).toBe('2026-10-07');
expect(parseDateFromName('20261007_203000.mp4', '2026-10')).toBe('2026-10-07');
expect(parseDateFromName('IMG_4512.MOV', '2026-10')).toBeNull();
test('scan suggests session by filename date, else by parent class-folder name, else by createdTime date', ...)
test('scan excludes files already in Videos', ...)
test('register on a file the club cannot read → LINK_NO_ACCESS', ...)
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. **Step 5:** Commit `feat(api): videos register, scan, target folders`.

### Task 17: Music and sections

**Files:** Create `api/src/features/music.ts`. Test: `api/test/features/music.test.ts`.

**Interfaces — Produces:**
- `music.list {month?, styleId?}` (`music.view`, dancers scoped).
- `music.create {styleId, month, sessionId?, title, sourceType, driveFileId?, youtubeUrl?}` (`music.edit`, write, bumpsData):
  - `youtubeUrl` is converted to `youtubeId` with the same rules as DanceCue's `getYouTubeVideoId`. Copy that function to `shared/src/youtube.ts` with a credit header.
  - `mp3` requires `driveFileId` and calls `setAnyoneReader`.
- `music.update`, `music.deactivate`.
- `sections.list {musicId}` (`music.view`); `sections.create {musicId, name, startSec, endSec, videoId?, videoStartSec?}`, `sections.update`, `sections.deactivate` (`sections.edit`). Validation: `0 ≤ startSec < endSec`.

- [ ] **Step 1: Failing tests**: bad YouTube URL → `VALIDATION`; `https://youtu.be/dQw4w9WgXcQ?t=5` → youtubeId `dQw4w9WgXcQ`; section with endSec ≤ startSec → `VALIDATION`; dancer listing music of a style they're not in → empty.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat(api): music and sections`.

### Task 18: Bootstrap with caching

**Files:** Create `api/src/features/bootstrap.ts`. Modify `api/src/features/auth.ts` (logins return the real bootstrap). Test: `api/test/features/bootstrap.test.ts`.

**Interfaces — Produces:**
- `dancer.bootstrap {sinceVersion?}` (signedIn dancer) → `DancerBootstrap | { notModified: true }`.
- `admin.bootstrap {sinceVersion?}` (signedIn admin) → `AdminBootstrap | { notModified: true }`.
- Server cache keys:
  - `boot:chunk:{month}:{styleId}:{dataVersion}` (10 min, `putLarge`) = sessions, videos, music and sections of that pair;
  - `boot:admin:{dataVersion}`;
  - `mi:{matricKey}` (10 min) = the dancer's MemberIndex row.
- A dancer's attendance = for each (month, style) pair, read that attendance grid (it's cached per sheet version) and pick their row.

- [ ] **Step 1: Failing tests**:
```ts
test('dancer in Popping 2026-10 gets only Popping sessions/videos/music of 2026-10 and 2026-09 if registered then', ...)
test('dancer never receives other dancers\' attendance or any contact/email fields', ...)
test('second dancer of the same style hits the chunk cache (fake cache get count increases, sheet reads do not)', ...)
test('sinceVersion equal to dataVersion → { notModified: true }', ...)
test('dancerLogin now returns bootstrap in the same call', ...)
```
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Deploy (`update-deployment`). Smoke test: `node scripts/call.mjs members.previewImport '{"sheetUrl":"<live form link>","month":"2026-10"}'` with the owner's admin token (the script asks for login). Expected: the column map equals Task 11's `REAL` mapping, and countsByStyle is non-empty.
- [ ] **Step 6:** Commit `feat(api): cached bootstraps`. Then run milestone review (`requesting-code-review`) and `code-simplifier` over `api/src`.

# Milestone M5 — Web foundation (8-bit shell)

### Task 19: Web scaffold, theme tokens and pixel primitives

**Skills:** `ui-ux-pro-max` (search: "pixel art", "8-bit", "retro game"), `design-system`, `frontend-design`, `impeccable`, `ui-styling`. Optionally `imagegen-frontend-web` for one mockup each of Login, Dancer Home and Studio before building.

**Files:**
- Create `web/*` scaffold (`npm create vite@latest web -- --template react-ts`, then adjust).
- Create `web/src/theme/tokens.css`, `web/src/theme/pixel.css`, `web/src/components/ui/{PixelButton,Panel,Sheet,Toast,TabBar,Sidebar,Spinner,EmptyState,Field,HeartsBar}.tsx`, `web/src/app/{App,routes,PhoneShell,DesktopShell}.tsx`, `web/.env.production`.
- Test: `web/src/components/ui/HeartsBar.test.tsx`, `web/e2e/shell.spec.ts`.

**Interfaces — Produces:**
- `tokens.css` defines exactly the PICO-8 tokens from spec §13.1 (`--c-bg:#FFF1E8`, `--c-ink:#000000`, `--c-panel:#FFFFFF`, `--c-navy:#1D2B53`, `--c-red:#FF004D`, `--c-orange:#FFA300`, `--c-yellow:#FFEC27`, `--c-green:#00E436`, `--c-blue:#29ADFF`, `--c-pink:#FF77A8`, `--c-lavender:#83769C`, `--c-peach:#FFCCAA`, `--c-darkgreen:#008751`, `--c-brown:#AB5236`, `--c-darkpurple:#7E2553`, `--c-grey:#C2C3C7`, `--c-darkgrey:#5F574F`).
  - Fonts: `--font-display:'Press Start 2P'`, `--font-body:'Pixelify Sans'`, `--font-mono:'VT323'`.
  - `--border:4px`, `--shadow:4px 4px 0 var(--c-ink)`, spacing scale 4/8/16/24/32.
  - Tailwind 4 `@theme` maps them.
- `pixel.css`: `.px-corners` (4 px notched `clip-path`), `.px-dither` (2×2 checker SVG background at ≤ 6% opacity), `.px-blink` (`steps(2)`), focus ring (4 px yellow outline + ink offset), and a `prefers-reduced-motion` block that disables animation.
- `STYLE_COLOR: Record<string,string>` maps colorKey → CSS var (`green → var(--c-green)`…).
- `<PixelButton variant="primary|secondary|danger|ghost" size="md|lg">`: orange primary with ink text; pressed state translates `4px 4px` and drops the shadow; min height 44.
- `<HeartsBar attended={n} total={m} />`: renders m hearts, n filled, with `aria-label="3 of 4 classes attended"`.
- `<PhoneShell tabs={TabDef[]}>` (bottom TabBar with pixelarticons at 48 px) / `<DesktopShell nav={TabDef[]}>`. `useLayout()` returns `'phone'|'desktop'` from `matchMedia('(min-width:1024px)')`.
- `web/.env.production`: the three public Google values from `docs/SETUP-VALUES.md` plus `VITE_API_URL`. It is committed; the values are public.

- [ ] **Step 1:** Scaffold. Install `react-router-dom@7 @tanstack/react-query date-fns date-fns-tz idb-keyval pixelarticons @fontsource/press-start-2p @fontsource/pixelify-sans @fontsource/vt323 tailwindcss @tailwindcss/vite`, plus dev deps `vitest @testing-library/react @testing-library/jest-dom jsdom fake-indexeddb @playwright/test`. Scripts: `dev`, `build` (`tsc -b && vite build`), `test` (`vitest run`), `e2e` (`playwright test`). Dev server port **5173**.
- [ ] **Step 2: Failing test:** `HeartsBar attended=3 total=4` renders 4 hearts, 3 with `data-filled="true"`, and the aria-label `"3 of 4 classes attended"`.
- [ ] **Step 3:** Run `npm test -w web` → FAIL. **Step 4:** Implement the tokens, pixel CSS, primitives and shells. Every colour and font comes from tokens (grep check: `grep -rnE "#[0-9a-fA-F]{3,6}" web/src --include=*.tsx` → no matches). **Step 5:** Run → PASS.
- [ ] **Step 6:** `web/e2e/shell.spec.ts`: at 390×844 the bottom tab bar is visible and the sidebar hidden; at 1440×900 the reverse; no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`). Run `npm run e2e -w web` → PASS.
- [ ] **Step 7:** Commit `feat(web): scaffold, 8-bit tokens, pixel primitives, responsive shells`.

### Task 20: API client, session, query cache

**Files:** Create `web/src/lib/api.ts`, `web/src/lib/session.ts`, `web/src/lib/queryClient.ts`. Test: `web/src/lib/api.test.ts`.

**Interfaces — Produces:**
```ts
export class ApiError extends Error { code: ErrorCode; retryable: boolean; latest?: unknown }
export async function call<T>(action: string, payload?: unknown, opts?: { opId?: string; sinceVersion?: number; retries?: number /*4*/ }): Promise<{ data: T; dataVersion: number }>;
// fetch(VITE_API_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({action, token, payload, opId, sinceVersion}), redirect:'follow' })
// retry on retryable errors and network TypeError: delays 1s,2s,4s,8s with ±30% jitter, capped at 30s
// UNAUTHORIZED → session.clear() then onUnauthorized handlers fire (router sends user to /login)
export const session: { get(): { token: string; claims: TokenClaims } | null; set(token: string, claims: TokenClaims, remember: boolean): void;
  clear(): void; onUnauthorized(fn: () => void): () => void };
// dancer → localStorage; admin → sessionStorage unless remember; claims.exp checked on get()
export function newOpId(): string;   // crypto.randomUUID()
export function errorMessage(e: unknown): string;  // maps every ErrorCode to friendly text, e.g. LINK_NO_ACCESS passes server text through, QUOTA → "Busy right now — retrying…"
```

- [ ] **Step 1: Failing tests** (mock `fetch`):
```ts
test('sends text/plain with token in body and no Authorization header', ...)
test('retries QUOTA three times then resolves', ...)          // uses fake timers
test('does not retry VALIDATION', ...)
test('UNAUTHORIZED clears session and calls onUnauthorized once', ...)
test('network TypeError is retried', ...)
```
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat(web): api client with retries, session storage`.

### Task 21: Setup, login and route guards

**Files:** Create `web/src/features/setup/SetupPage.tsx`, `web/src/features/auth/{TitleScreen,DancerLogin,AdminLogin}.tsx`, `web/src/app/guards.tsx`, `web/src/features/auth/useBootstrap.ts`. Test: `web/e2e/login.spec.ts` (Playwright `page.route` mocks the API with fixtures in `web/e2e/fixtures/`).

**Interfaces — Produces:**
- `useBootstrap<'dancer'|'admin'>()`:
  - React Query key `['bootstrap', role]`;
  - initial data comes from localStorage `boot:{role}:{sub}`;
  - refetches with `sinceVersion`; on `notModified` keeps the cached data;
  - persists new data to localStorage.
- `<RequireRole role="dancer"|"admin">` redirects to `/login` and remembers the target path.
- Routes: `/login` (TitleScreen with dancer form and an "ADMIN MODE" link to `/admin/login`), `/setup` (shown when `setup.status` says not initialized), `/` (dancer home), `/studio`, `/me`, `/admin/*`.
- The TitleScreen follows spec §13.1: pixel logo sprite (use `brand` on the owner's logo files, or pixelated `UMDSC LOGO (white).png` at 2×), blinking "PRESS START", and a "PLAYER SELECT" card with Full Name and Matric Number fields.

- [ ] **Step 1: Failing e2e**:
```ts
test('dancer logs in and lands on / with calendar visible', ...)
test('NAME_MISMATCH shows "That name doesn\'t match this matric number"', ...)
test('NOT_REGISTERED shows a message telling them to register via the club form', ...)
test('admin login goes to /admin/today; dancer visiting /admin is redirected to /', ...)
test('second visit opens instantly from cached bootstrap before network responds', ...)
```
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat(web): title screen, logins, guards, cached bootstrap`.

# Milestone M6 — Admin features

### Task 22: Tick queue

**Files:** Create `web/src/lib/tickQueue.ts`. Test: `web/src/lib/tickQueue.test.ts` (`fake-indexeddb/auto`).

**Interfaces — Produces:**
```ts
export interface Tick { opId: string; month: Month; styleId: string; sessionId: string; memberId: string; present: boolean; queuedAt: number }
export function createTickQueue(deps: { send: (month: Month, styleId: string, marks: Omit<Tick,'month'|'styleId'|'queuedAt'>[]) => Promise<{ applied: string[] }>;
  now?: () => number; storeKey?: string /* 'umdsc:ticks' */ }): {
  enqueue(t: Omit<Tick,'opId'|'queuedAt'>): void;  // replaces any pending tick for the same (month,styleId,sessionId,memberId)
  pending(): Tick[]; flush(): Promise<void>;        // batches ≤ 50 per (month,styleId), every 1 s while non-empty
  subscribe(fn: (pendingCount: number) => void): () => void; load(): Promise<void> /* restore from IndexedDB */ };
```

- [ ] **Step 1: Failing tests**:
```ts
test('toggling the same dancer twice before flush sends only the final state', ...)   // Review Focus #4
test('ticks survive a reload: new queue instance .load() restores pending', ...)       // Review Focus #4
test('on retryable failure items stay pending and are retried with backoff', ...)
test('applied opIds are removed; unapplied stay', ...)
test('subscribe reports pending count changes', ...)
```
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat(web): persistent attendance tick queue`.

### Task 23: Calendar and time picker components

**Files:** Create `web/src/components/ui/MonthCalendar.tsx`, `web/src/components/ui/TimePicker.tsx`, `web/src/lib/time.ts`. Tests: `web/src/lib/time.test.ts`, `web/src/components/ui/MonthCalendar.test.tsx`.

**Interfaces — Produces:**
```ts
export function monthGrid(month: Month): ISODate[][];   // weeks start Monday; always full weeks
export function todayKL(): ISODate; export function addMonths(month: Month, n: number): Month; export function formatDayLabel(d: ISODate): string; // 'Wed 07 Oct'
<MonthCalendar month={Month} onMonthChange={(m)=>void} allowedMonths?={Month[]} marks={Record<ISODate, {colorKey: string; kind: 'present'|'absent'|'upcoming'|'class'}[]>}
  selected?={ISODate} onSelect={(d)=>void} />   // "stage select" tiles; arrow keys move focus; each tile ≥ 44px
<TimePicker value={HHmm} onChange={(v)=>void} stepMinutes?={15} />  // chunky hour/minute steppers, no free text
```

- [ ] **Step 1: Failing tests**:
```ts
const g = monthGrid('2026-10');
expect(g[0][0]).toBe('2026-09-28'); expect(g[0][3]).toBe('2026-10-01'); expect(g.at(-1)!.at(-1)).toBe('2026-11-01');
expect(formatDayLabel('2026-10-07')).toBe('Wed 07 Oct');
test('MonthCalendar hides the next-month arrow when allowedMonths excludes it', ...)
test('a day with two class marks renders two coloured markers and an accessible label listing both styles', ...)
```
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat(web): pixel month calendar and time picker`.

### Task 24: Admin pages — Today, Classes, Master data, Access, Settings, Members import, Attendance

These pages have no new API. Each uses the Task 10–15 actions and ships with a Playwright e2e spec using `page.route` fixtures. **Skills:** `frontend-design`, `impeccable`, `webapp-testing`.

**Files:** Create:
- `web/src/features/classes/{TodayPage,ClassesPage,SessionEditor}.tsx`
- `web/src/features/masterdata/{StylesPage,InstructorsPage}.tsx`
- `web/src/features/access/{AdminsPage,RolesPage,MemberRolesPanel}.tsx`
- `web/src/features/settings/SettingsPage.tsx`
- `web/src/features/members/{ImportWizard,MembersPage}.tsx`
- `web/src/features/attendance/{AttendancePage,RosterList,AttendanceGrid}.tsx`
- `web/src/lib/csv.ts`
- Tests: `web/e2e/admin-*.spec.ts`

**Behaviour to implement (spec §10, §13):**
1. **Today:** today's classes (KL date) with a "TAKE ATTENDANCE" button each.
2. **Classes:**
   - The MonthCalendar shows all styles' sessions.
   - A "GENERATE MONTH" dialog with style checkboxes; it shows the extra-week warning when flagged.
   - Tapping a session opens `SessionEditor`: date via MonthCalendar, start/end via TimePicker, instructor select, venue, status (scheduled/replacement/cancelled), note.
   - On `VERSION_CONFLICT`, show "Changed by X at T" with RELOAD / OVERWRITE. Overwrite resends using the `latest.version`.
3. **Styles:**
   - Edit name, aliases (chips), colour (palette swatches only, from `STYLE_COLOR`), default weekday/time/instructor/venue.
   - Attendance folder link and video folder link. Paste a link → server validation → show the exact server message on failure.
   - **Instructors:** a simple list.
4. **Admins:** create admin (username, display name, password, role); reset password; deactivate.
5. **Roles:**
   - A role list with + NEW ROLE (name, description, login type).
   - A permission matrix grouped by `PERMISSIONS[].group`. `adminOnly` codes are disabled for dancer-login roles, with a tooltip explaining why.
   - "Members with this role" + ASSIGN DANCER (search `members.list` of the latest month by name or matric, then pick styles).
   - A banner explains that affected users re-login after changes.
6. **Settings:** default attendance/video folder links, the DB folder link, and link history.
7. **Members import wizard** (4 steps):
   1. Paste the response sheet link and pick the month (MonthCalendar in month mode).
   2. Mapping preview: a dropdown per field, pre-filled from `columnMap` with scores; a class-column dropdown; counts per style; grouped warnings. Unknown classes get "ADD AS STYLE" (opens the style form pre-filled).
   3. Confirm.
   4. Result links: "Open attendance for <style>".
   - **Members page:** month picker, style filter, search, RE-SYNC, EXPORT CSV (`csv.ts`, client-side from `members.list`, only with `export.download`).
8. **Attendance:**
   - Style + month picker.
   - **Phone:** session chips, then `RosterList` with big green `✓ PRESENT` / empty `ABSENT` toggles, search, and a "SCORE n/m" counter.
   - **Desktop:** `AttendanceGrid` table (sticky name column, 3 px borders, click a cell to toggle).
   - All toggles go through `tickQueue`. A "SAVING… n" pixel indicator shows while pending. Poll `attendance.get` with `ifVersion` every 20 s while `document.visibilityState==='visible'`.
   - EXPORT XLSX downloads `attendance.export`'s base64 as a Blob.

- [ ] **Step 1: Failing e2e specs** (one file per area):
```ts
test('generate month for Popping shows 4 sessions on Tuesdays of Oct 2026', ...)
test('moving a session via the calendar calls sessions.update with the new date and keeps the same id', ...)
test('VERSION_CONFLICT shows reload/overwrite dialog', ...)
test('pasting an unshared folder link shows the server message mentioning umdancesportc@gmail.com', ...)
test('dancer-login role cannot tick settings.edit (checkbox disabled)', ...)
test('import wizard shows mapping from preview and unknown class "Contemporary" with ADD AS STYLE', ...)
test('phone attendance: tapping a dancer turns their row green and increments SCORE; request batches marks', ...)
test('desktop attendance grid renders at 1440 with sticky name column', ...)
test('offline tick shows SAVING… 1 and syncs when route is restored', ...)
```
- [ ] **Step 2–4:** FAIL → implement page by page → PASS. Use `impeccable` for polish after each page passes.
- [ ] **Step 5:** Commit one commit per area, e.g. `feat(web): classes calendar and session editor`, `feat(web): attendance roster and grid`.

# Milestone M7 — Media and dancer experience

### Task 25: Google sign-in, Picker, resumable upload, Drive URLs

**Files:** Create `web/src/lib/google/{gis,picker,resumableUpload,driveUrls,driveFolders}.ts`. Tests: `web/src/lib/google/resumableUpload.test.ts`, `web/src/lib/google/driveUrls.test.ts`, `web/src/lib/google/driveFolders.test.ts`.

**Interfaces — Produces:**
```ts
// gis.ts — loads https://accounts.google.com/gsi/client once; scope from Task 2 result (default drive.file)
export function getAccessToken(opts?: { prompt?: '' | 'consent' }): Promise<string>;   // in-memory only; reuse until 60 s before expiry
// picker.ts — loads https://apis.google.com/js/api.js + gapi.load('picker'); grant remembered in localStorage 'umdsc:pickerGrant:{folderId}'
export function pickFolder(token: string, parentFolderId: string): Promise<string /* picked folder id */>;
// driveFolders.ts
export function ensureFolderPath(token: string, rootId: string, names: string[]): Promise<string>; // find-or-create each level via Drive API v3 files.list q="'<parent>' in parents and name='<n>' and mimeType='application/vnd.google-apps.folder' and trashed=false"
// resumableUpload.ts
export const CHUNK_SIZE = 8 * 1024 * 1024;   // multiple of 256 KiB
export function chunkRanges(total: number, chunk?: number): [number, number][];
export function contentRange(start: number, end: number, total: number): string;       // 'bytes 0-8388607/20000000'
export function nextOffsetFromRange(rangeHeader: string | null): number;              // 'bytes=0-8388607' → 8388608; null → 0
export function uploadResumable(opts: { token: string; file: File; parentId: string; name: string;
  onProgress: (sent: number, total: number) => void; signal?: AbortSignal }): Promise<{ id: string; mimeType: string; size: number }>;
// on network error: PUT with 'Content-Range: bytes */total' → resume from nextOffsetFromRange; up to 10 retries with backoff
export async function makePublic(token: string, fileId: string): Promise<void>; // permissions {type:'anyone', role:'reader'}
export function videoFormatWarning(file: File): string | null;  // .mov / video/quicktime / hevc → warning text from spec §11.1
// driveUrls.ts
export function streamUrl(fileId: string): string;   // https://www.googleapis.com/drive/v3/files/{id}?alt=media&key={VITE_GOOGLE_API_KEY}
export function downloadUrl(fileId: string): string; // https://drive.google.com/uc?export=download&id={id}
export function openInDriveUrl(fileId: string): string; // https://drive.google.com/file/d/{id}/view
```

- [ ] **Step 1: Failing tests**:
```ts
expect(CHUNK_SIZE % 262144).toBe(0);
expect(chunkRanges(20_000_000)).toEqual([[0,8388607],[8388608,16777215],[16777216,19999999]]);
expect(contentRange(0, 8388607, 20000000)).toBe('bytes 0-8388607/20000000');
expect(nextOffsetFromRange('bytes=0-8388607')).toBe(8388608);
expect(nextOffsetFromRange(null)).toBe(0);
expect(videoFormatWarning(new File([], 'a.MOV', { type: 'video/quicktime' }))).toMatch(/MP4/);
expect(videoFormatWarning(new File([], 'a.mp4', { type: 'video/mp4' }))).toBeNull();
expect(streamUrl('abc')).toBe(`https://www.googleapis.com/drive/v3/files/abc?alt=media&key=${import.meta.env.VITE_GOOGLE_API_KEY}`);
test('uploadResumable resumes from the server-reported offset after a failed PUT', ...)   // mock fetch
test('ensureFolderPath reuses an existing folder and creates only missing levels', ...)
```
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat(web): google sign-in, picker, resumable upload, drive urls`.

### Task 26: Admin Media page (upload, scan, music)

**Files:** Create `web/src/features/media/{MediaPage,UploadDialog,ScanPanel,MusicForm,SectionsEditor}.tsx`. Test: `web/e2e/admin-media.spec.ts`.

**Behaviour:**
- Pick a session on the MonthCalendar, then UPLOAD VIDEO or UPLOAD MP3:
  1. `videoFormatWarning` (the admin may continue anyway);
  2. `getAccessToken()`;
  3. `pickFolder` the first time per style video folder;
  4. `videos.targetFolder`;
  5. `ensureFolderPath(root, [month, classFolder])`, or `[month, classFolder, 'Music']` for MP3;
  6. `uploadResumable`, with a progress bar and a "KEEP THIS PAGE OPEN" notice; request `navigator.wakeLock.request('screen')` when available;
  7. `makePublic`;
  8. `videos.register` or `music.create {sourceType:'mp3'}`.
- **Add YouTube music:** paste a link, then `music.create`.
- **SCAN FOLDER:** lists `videos.scan` suggestions with a session dropdown each → CONFIRM → `videos.register`.
- **SectionsEditor:** list, add or edit named sections (start/end via the Studio timeline in Task 30; here only numeric mm:ss steppers).

- [ ] **Step 1: Failing e2e:** `.mov` shows the warning; the upload flow (with GIS, Picker and the Drive API stubbed through `page.addInitScript` fakes on `window.google`) calls `videos.register` with the new file ID; scan confirm registers the chosen session.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** 🧑 **OWNER ACTION:** "Run `npm run dev -w web`, log in as admin, upload one real short video to a test class, and tell me if it appears in the test video folder under `YYYY-MM/…Class n/`."
- [ ] **Step 6:** Commit `feat(web): admin media upload, scan, music`.

### Task 27: Dancer Home, day sheet and Me

**Files:** Create `web/src/features/calendar/{DancerHome,DaySheet,ClassCard}.tsx`, `web/src/features/me/MePage.tsx`. Test: `web/e2e/dancer-home.spec.ts`.

**Behaviour (spec §13, §13.1 metaphors):**
- **Home:** MonthCalendar limited to `profile.months`. Marks: class days in style colour; `present` shows the ✓ coin sprite, `absent` a grey X, `upcoming` a blinking outline.
- **Day sheet** (bottom sheet on phone, side panel on desktop): one `ClassCard` per class. It shows the style, time, instructor, venue and attendance status, then:
  - videos: PLAY (inline `<video src={streamUrl} playsinline controls>`), DOWNLOAD (`downloadUrl`), OPEN IN DRIVE;
  - music: PLAY (small inline player: `<audio>` for mp3, a YouTube embed for youtube), **▶ PRACTISE IN STUDIO** (navigates to `/studio?music=<id>`).
- **Me:** name, matric, months registered, a HeartsBar per style per month, LOG OUT.
- Empty state: "NO CLASSES THIS MONTH" with a sprite.

- [ ] **Step 1: Failing e2e:** a dancer in Popping sees only Popping days; tapping 2026-10-06 shows the class card with a video; PRACTISE IN STUDIO navigates to `/studio?music=…`; the month arrows stop at registered months; the Me hearts show 3/4.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat(web): dancer calendar home, day sheet, me page`.

# Milestone M8 — Music Studio (DanceCue port + synced video)

### Task 28: Port DanceCue verbatim

**Files:**
- Copy from `reference/DanceCue/src/` into `web/src/features/music-studio/dancecue/`: `components/{AudioPlayer,MarkerList,SourceLoader,VoiceCommandPanel,YouTubePlayer}.tsx`, `hooks/{useAudioPlayer,useSpeechCommands}.ts`, `types/marker.ts`, `utils/{storedAudioFile,youtube}.ts`, and `App.tsx` → `DanceCueApp.tsx`.
- Create `web/src/features/music-studio/StudioPage.tsx`.

- [ ] **Step 1:** If `reference/DanceCue` is missing, run `gh repo clone JzeAnson/DanceCue reference/DanceCue`.
- [ ] **Step 2:** Copy the files unchanged except for import paths. Prepend to each: `// Ported from DanceCue by JzeAnson (https://github.com/JzeAnson/DanceCue), used with permission.`
- [ ] **Step 3:** `StudioPage` renders `DanceCueApp` at `/studio`. Scope DanceCue's `styles.css` to a `.dancecue-root` wrapper so it doesn't leak.
- [ ] **Step 4:** Verify: `npm run build -w web` passes. 🧑 **OWNER ACTION:** "Open /studio, load an MP3 and a YouTube link, drag a range, loop it, try 'loop chorus' by voice. Tell me if anything behaves differently from DanceCue's own site."
- [ ] **Step 5:** Commit `feat(studio): port DanceCue verbatim with credits`.

### Task 29: Engine changes (Drive source, precise loops, true YouTube rate, master interface)

**Files:**
- Modify `web/src/features/music-studio/dancecue/hooks/useAudioPlayer.ts`.
- Create `web/src/features/music-studio/sync/loopMath.ts`.
- Test: `web/src/features/music-studio/sync/loopMath.test.ts`.

**Interfaces — Produces:**
```ts
export function shouldRestartLoop(time: number, loop: { start: number; end: number } | null, duration: number): boolean; // time >= (end || duration) && end > start
// useAudioPlayer additions:
loadUrl(url: string, label: string): void;          // 'drive' source: same <audio> path as 'file', src = streamUrl(id)
effectiveRate: number;                              // YouTube: player.getPlaybackRate() read back after setPlaybackRate
master: Master;
export interface Master { getTime(): number; isPlaying: boolean; rate: number; source: 'file'|'drive'|'youtube'|null;
  onLoopRestart(fn: (loopStart: number) => void): () => void; pauseForBuffer(): void; resumeFromBuffer(): void }
// Master lives in web/src/features/music-studio/sync/types.ts; Task 31 imports it from there
// Loop-end check moves from 'timeupdate' / the 250 ms poll into a requestAnimationFrame loop while playing
```

- [ ] **Step 1: Failing tests:** `shouldRestartLoop(45.99, {start:30,end:46}, 200)` → false; `(46.0, …)` → true; `(10, {start:30,end:0}, 200)` → false; `(200, {start:30,end:0}, 200)` → true.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Manual check: a YouTube source at 0.9× shows the rate YouTube actually applied (DanceCue's 0.8/0.9 may snap).
- [ ] **Step 6:** Commit `feat(studio): drive source, rAF loop precision, true youtube rate, master interface`.

### Task 30: Sources and markers (class music, my music, class sections, my loops)

**Files:** Create `web/src/features/music-studio/sources/{SourcePicker,ClassMusicList}.tsx`, `web/src/features/music-studio/markers/{useMarkers,ClassSectionsList}.ts(x)`. Modify `DanceCueApp.tsx` → rename to `Studio.tsx` and wire them in. Test: `web/src/features/music-studio/markers/useMarkers.test.ts`.

**Interfaces — Produces:**
- `SourcePicker` tabs: **CLASS MUSIC** (default; `DancerBootstrap.music` grouped by style and month), **MY MP3** (DanceCue file loader), **YOUTUBE LINK** (DanceCue loader).
- `/studio?music=<id>` preloads that track and its sections.
- `sourceKey(src)` → `drive:<fileId>` | `yt:<videoId>` | `file:<name>:<size>`.
- `useMarkers(sourceKey, classSections: Section[])` → `{ classMarkers: Marker[]; myLoops: Marker[]; addMyLoop; updateMyLoop; deleteMyLoop }`. My loops live in localStorage `studio:loops:{sourceKey}`. Class sections map to DanceCue `Marker` (`time=startSec`, `endTime=endSec`) and are read-only.
- Admins with `sections.edit` see **PUBLISH AS CLASS SECTION** on a drafted range, which calls `sections.create`.

- [ ] **Step 1: Failing tests:**
  - my loops are keyed per source and survive a reload;
  - class sections are read-only (`updateMyLoop` on a class marker id throws);
  - switching source switches the loop lists.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat(studio): class music source, class sections and personal loops`.

### Task 31: Synced class video

**Files:**
- Create `web/src/features/music-studio/sync/{syncMath.ts,useSyncedVideo.ts,VideoPanel.tsx,VideoTimeline.tsx}`. `Master` comes from `sync/types.ts` (Task 29).
- Tests: `web/src/features/music-studio/sync/syncMath.test.ts`, `web/e2e/studio-sync.spec.ts`.

**Interfaces — Produces:**
```ts
export function expectedVideoTime(musicTime: number, musicAnchor: number, videoStart: number): number; // videoStart + (musicTime - musicAnchor)
export type Correction = { type: 'none' } | { type: 'seek'; to: number } | { type: 'nudge'; rate: number };
export function decideCorrection(expected: number, actual: number, baseRate: number, master: 'audio'|'youtube'): Correction;
// seekThreshold = master==='youtube' ? 0.35 : 0.2 ; |d| > seekThreshold → seek ; 0.05 < |d| ≤ seekThreshold → nudge baseRate*(d>0 ? 0.95 : 1.05) (d = actual-expected) ; else none
export function useSyncedVideo(opts: { master: Master; videoRef: RefObject<HTMLVideoElement>; videoStart: number; enabled: boolean }):
  { muted: boolean; setMuted(v: boolean): void; status: 'idle'|'playing'|'buffering' };
// anchor = active loop start if a marker loop is active, else master.getTime() at the moment play is pressed
```

**Behaviour (spec §11.5):**
- `VideoPanel`: a class-video picker (videos of the loaded music's style and month; for own music, all of the dancer's videos), a `<video playsinline muted>` in a pixel-bordered "screen", a MUTE toggle (default muted), and a `VideoTimeline` with a draggable yellow **start flag**.
- Play starts both media in the **same tap handler**. A loop restart seeks the video to `videoStart`. The video's `playbackRate` follows `master.rate`.
- Buffering: video `waiting` > 0.5 s → `master.pauseForBuffer()`; `canplay` → resume both. YouTube state 3 → pause the video.
- SAVE LOOP + VIDEO stores `{markerId, videoId, videoStart}` with the loop in `studio:loops:{sourceKey}`. A class section with `videoId`/`videoStartSec` pre-selects the video and flag.

- [ ] **Step 1: Failing tests**:
```ts
expect(expectedVideoTime(50, 45, 12)).toBe(17);
expect(decideCorrection(17, 17.3, 1, 'audio')).toEqual({ type: 'seek', to: 17 });
expect(decideCorrection(17, 17.1, 1, 'audio')).toEqual({ type: 'nudge', rate: 0.95 });
expect(decideCorrection(17, 16.9, 1, 'audio')).toEqual({ type: 'nudge', rate: 1.05 });
expect(decideCorrection(17, 17.03, 1, 'audio')).toEqual({ type: 'none' });
expect(decideCorrection(17, 17.3, 1, 'youtube')).toEqual({ type: 'nudge', rate: 0.95 });
expect(decideCorrection(17, 17.4, 1, 'youtube')).toEqual({ type: 'seek', to: 17 });
// e2e (local MP3 + local MP4 fixtures in web/e2e/fixtures/media/): set loop 2–4 s, video start 1 s, play 5 s →
//   video.currentTime stays within 0.25 s of 1 + (audio.currentTime - 2); after loop restart video ≈ 1.0; mute toggles video.muted
```
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Restyle the whole Studio per spec §13.1: navy stage, "cartridge/boombox" panel, pixel track timeline (yellow loop range, blue playhead, flag markers), chunky segmented speed selector, VT323 or tabular timecodes. Use `frontend-design` and `impeccable`. Keep DanceCue's behaviour and tests green.
- [ ] **Step 6:** Commit `feat(studio): user-aligned synced class video with mute`.

# Milestone M9 — Hardening and launch

### Task 32: Load test (acceptance gate)

**Files:** Create `scripts/loadtest.mjs`. Modify `docs/SETUP-VALUES.md`.

- [ ] **Step 1:** Write `scripts/loadtest.mjs` (Node 24 built-in `fetch`; no extra dependencies). It:
  1. logs in once as a test dancer and once as an admin, prompting for credentials locally;
  2. runs scenario **A**: 100 `dancer.bootstrap` calls spread over 10 s;
  3. runs scenario **B**: 50 simultaneous calls;
  4. runs scenario **C**: 2 simulated admins each sending 40 `attendance.mark` ticks concurrently (in batches like `tickQueue`) to month `2099-01`, then reads the grid back and counts the ticks.
  - It uses the same retry policy as `web/src/lib/api.ts` and prints p50/p95 latency, the failure count after retries, and lost ticks.
- [ ] **Step 2:** 🧑 **OWNER ACTION:** "Import the live form as test month **2099-01** from the website (Members → Import), generate sessions for 2099-01, then run `node scripts/loadtest.mjs` and paste the summary."
- [ ] **Step 3:** Pass criteria: **0 lost ticks, 0 failures after retries, p95 < 4 s**. On failure, use `systematic-debugging`. Likely levers: cache hit rate, lock hold time, batch size. Re-run until it passes, then record the numbers in `docs/SETUP-VALUES.md`.
- [ ] **Step 4:** 🧑 **OWNER ACTION:** "Delete the 2099-01 attendance sheets and Members_2099-01 from Drive." (The MemberMonths row stays; deactivate it from the Members page.)
- [ ] **Step 5:** Commit `test: load test script and results`.

### Task 33: E2E suite, accessibility, device checks and handover doc

**Files:** Create `web/e2e/a11y.spec.ts`, `docs/HANDOVER.md`.

- [ ] **Step 1:** `a11y.spec.ts` checks:
  - every page at 390×844 and 1440×900 has no horizontal scroll;
  - all buttons are ≥ 44 px tall;
  - every input has a label;
  - focus is visible after Tab;
  - with `prefers-reduced-motion` emulated, no element has a running animation.
- [ ] **Step 2:** Run `npm run e2e -w web` → all pass (use `webapp-testing`).
- [ ] **Step 3:** 🧑 **OWNER ACTION — device checklist** (reply with ✓/✗ for each):
  1. iPhone Safari: dancer login, calendar, video plays inline.
  2. iPhone Safari Studio: class MP3 + class video start together, loop restarts both, mute works.
  3. Android Chrome: the same two checks.
  4. Admin on phone: tick 5 dancers with Wi-Fi off, turn Wi-Fi on, and the ticks appear in the Google Sheet.
  5. Upload a ~500 MB video on 4G, toggle airplane mode for 5 s mid-upload, and the upload finishes.
  6. Desktop Chrome: attendance grid, import wizard, roles page.
- [ ] **Step 4:** Fix every ✗ with `systematic-debugging` and re-check it.
- [ ] **Step 5:** Write `docs/HANDOVER.md`:
  - who owns the club Gmail (no password in the file) and how to hand it over;
  - how to redeploy the API (`npm run push -w api` + `npx clasp update-deployment <id>`);
  - how to deploy the web (push to `main`);
  - the monthly routine: generate sessions → import the form link → share folders → take attendance → upload videos;
  - what to do when Drive storage is full;
  - how to add a role;
  - where `SETUP-VALUES.md` is.
- [ ] **Step 6:** Commit `test: e2e a11y suite; docs: handover`.

### Task 34: Go live on Cloudflare Pages

**Files:** Modify `docs/SETUP-VALUES.md`.

- [ ] **Step 1:** Run `code-review` over the whole repo. Handle findings with `receiving-code-review`, then `verification-before-completion`: `npm test && npm run build && npm run e2e -w web` all green.
- [ ] **Step 2:** 🧑 **OWNER ACTION:** "On https://dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git → pick `umdsc-dance-class`:
  - Framework preset: **None**
  - Build command: `npm run build -w web`
  - Build output directory: `web/dist`
  - Root directory: `/`
  - Environment variable: `NODE_VERSION` = `24`

  Deploy, then send me the `*.pages.dev` URL."
  - Cloudflare Pages serves `index.html` for unknown paths when there's no `404.html`, so deep links work. Do not add a `404.html`.
- [ ] **Step 3:** 🧑 **OWNER ACTION:** "In Google Cloud (project umdsc-class):
  - (a) Google Auth Platform → Clients → UMDSC Web → Authorized JavaScript origins → add `https://<your>.pages.dev`.
  - (b) APIs & Services → Credentials → API UMDSC → Website restrictions → add `https://<your>.pages.dev/*`.
  - (c) Google Auth Platform → Audience → **Publish app** (only if the Task 2 spike used `drive.file`; if it used `drive`, keep Testing and add every admin as a test user).

  Save all three."
- [ ] **Step 4:** Record the Pages URL in `docs/SETUP-VALUES.md`. Smoke-test on the live URL: dancer login, admin login, one tick, one video play.
- [ ] **Step 5:** Commit `chore: go-live values` and push.

---

## Spec coverage check (done by plan author)

| Spec section | Task(s) |
|---|---|
| §2 decisions D1–D16 | D1: 7, 10, 24 · D2: 8, 18, 27 · D3: 26, 30 · D4: 3, 10 · D5–D7: 2, 25, 26 · D8: 14, 15, 24 · D9–D12: 28–31 · D13: 19 · D14: 34 · D15: 19, 21, 27, 31 · D16: 28 |
| §4 Google setup | 2, 3, 9, 34 |
| §5 data model | 6, 8 |
| §6 links | 5, 10, 24 |
| §7 auth / permissions / roles UI | 7, 8, 10, 21, 24 |
| §8 API contract | 8, 10, 13, 15–18 |
| §9 import | 4, 11, 12, 15, 24 |
| §10 classes / attendance | 13, 14, 15, 22, 23, 24 |
| §11 media / Studio / sync | 2, 16, 17, 25–31 |
| §12 scale | 6, 8, 15, 18, 20, 22, 32 |
| §13 / §13.1 frontend & 8-bit | 19, 21, 23, 24, 27, 31, 33 |
| §14 testing | every task + 32, 33 |
| §16 risks | 2 (drive.file), 25 (HEVC), 31/33 (iOS), 32 (concurrency), 33 (handover), 4/15 (auto-convert) |
