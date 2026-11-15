# Full-System Sustainability Testing, Code Deduplication & GitHub Handover Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate runtime double-working and code duplication across `@umdsc/shared`, `@umdsc/api`, and `@umdsc/web`, verify long-term system sustainability via full Vitest, Playwright E2E, and a self-cleaning Live Google Drive / Apps Script Sandbox test, and update all GitHub handover and user/developer guides (`docs/guides/en/`, `docs/guides/zh/`, `docs/guides/word/`, `docs/HANDOVER.md`, `docs/SETUP-VALUES.md`, `docs/ENABLE-YOUTUBE-SEARCH.md`, `AGENTS.md`, `GEMINI.md`) to match the latest website functionality.

**Architecture:** Supervised by **Gemini 4 Argon** in Orchestrator Mode using `superpowers:subagent-driven-development`, dispatching isolated **Gemini 4 Hydrogen** (`Model: 'pro'`) worker (`TypeName: 'self'`) and reviewer (`TypeName: 'research'`) subagents across 5 self-contained tasks: (1) Backend Sync/Trigger Deduplication & Quota Protection, (2) Frontend/Shared Code Deduplication & 8-Bit UI Compliance Audit, (3) Full Automated & Live GAS Sandbox Sustainability Verification, (4) Complete GitHub Handover & Bilingual Guides (`en/`, `zh/`, `word/*.docx`) Update, and (5) Final Whole-Branch Review, GAS Deployment & GitHub Push.

**Tech Stack:** TypeScript, Google Apps Script (`@umdsc/api` + `clasp`), React 19, Vite, Tailwind CSS v4, Vitest, Playwright, Node.js (`scripts/`).

**Spec:** `docs/superpowers/specs/2026-11-14-sustainability-audit-dedup-and-handover-design.md`

---

## Orchestrator (Argon) & Subagent (Hydrogen) Skill Matrix

| Role / Phase | Model | Antigravity Tool / Type | Required Skills |
|---|---|---|---|
| **Supervisor (Orchestrator)** | **Gemini 4 Argon (High)** | Main Session + Task Artifact + `.superpowers/sdd/` Ledger | `using-superpowers`, `antigravity-guide`, `subagent-driven-development`, `verification-before-completion` |
| **Task 1 Implementer (API Sync & Quota Dedup)** | **Gemini 4 Hydrogen** (`Model: 'pro'`) | `invoke_subagent` (`TypeName: 'self'`) | `systematic-debugging`, `test-driven-development`, `code-simplifier` |
| **Task 2 Implementer (Web/Shared Dedup & UI Audit)** | **Gemini 4 Hydrogen** (`Model: 'pro'`) | `invoke_subagent` (`TypeName: 'self'`) | `code-simplifier`, `test-driven-development`, `impeccable`, `ui-ux-pro-max` |
| **Task 3 Implementer (Full E2E & Live GAS Sandbox Test)** | **Gemini 4 Hydrogen** (`Model: 'pro'`) | `invoke_subagent` (`TypeName: 'self'`) | `webapp-testing`, `systematic-debugging`, `verification-before-completion` |
| **Task 4 Implementer (GitHub Handover & Guides EN/ZH/Word)** | **Gemini 4 Hydrogen** (`Model: 'pro'`) | `invoke_subagent` (`TypeName: 'self'`) | `code-simplifier`, `verification-before-completion` |
| **Per-Task & Final Branch Reviewers** | **Gemini 4 Hydrogen** (`Model: 'pro'`) | `invoke_subagent` (`TypeName: 'research'`) | `code-review`, `requesting-code-review`, `receiving-code-review` |

---

## Global Constraints

- Never ask for, log, or commit the club Gmail password, `TOKEN_SECRET`, `SETUP_CODE`, `.admin-token`, or `.clasprc.json`.
- Do **not** use `taste-skill`, `soft-skill`, `minimalist-skill`, `brutalist-skill`, `gpt-tasteskill`, `stitch-skill`, or `redesign-skill`: the UI is 8-bit retro neon pixel per `GEMINI.md` and `docs/superpowers/specs/2026-10-02-neon-pixel-ui-redesign-design.md`.
- Enforce the minimum `10px` font size rule across all `web/src/` files (zero `text-[8px]` or `text-[9px]` classes allowed) and `>= 44px` touch target height on mobile interactive controls.
- Every live sandbox test against the production GAS endpoint (`VITE_API_URL`) must clean up 100% of any temporary test data inside a `try / finally` block and never modify or delete real club events or dancer records.
- Always run workspace tests via `npm test -w <workspace>` or `npm test -ws --if-present` (never bare `npx vitest run` from the repo root, which skips `web/vite.config.ts` jsdom settings).

## Review Focus

1. `events.autoSync` with `stabilize: true` on a changed source sheet -> opens and hashes the source sheet only once (`checkSourceState`) before lock acquisition instead of reading `getDisplayValues()` twice prior to import.
2. Background 5-minute trigger `warmCaches(ctx)` when no admin browser tab is open -> checks Google Form open/closed status (`checkEventFormStatus`) every 10 minutes via `sync:formCheck:<eventId>` cache key and bumps `DATA_VERSION` when `formClosed` or `formClosedReason` changes.
3. Concurrent or back-to-back execution of `events.autoSync` (from an open admin browser tab) and `warmCaches` (from the 5-minute GAS trigger) within 60 seconds -> `warmCaches` respects `sync:check:<eventId>` and skips duplicate `sourceUnchanged` / `importEventMembers` Sheet reads.
4. Pasting a schemeless YouTube URL (`youtube.com/watch?v=dQw4w9WgXcQ`) into DanceCue Studio's link loader -> resolves `dQw4w9WgXcQ` via the consolidated `@umdsc/shared` `getYouTubeVideoId` helper instead of returning `null`.
5. Rendering `<TabBar />` on a `360px` mobile screen with 6 tabs (`Calendar`, `Studio`, `Library`, `Attendance`, `Media`, `More`) -> uses `text-[10px] sm:text-[11px]` with zero `text-[9px]` classes and zero horizontal overflow (`scrollWidth <= clientWidth`).

---

### Task 1: Backend Sync Deduplication, Quota Protection & Background Form-Status Sync (`@umdsc/api`)

**Subagent Model:** Gemini 4 Hydrogen (`invoke_subagent`, `TypeName: 'self'`, `Model: 'pro'`)  
**Skills Used:** `systematic-debugging`, `test-driven-development`, `code-simplifier`

**Files:**
- Modify: `api/src/features/eventImport.ts:112-125`
- Modify: `api/src/features/events.ts:381-474`
- Modify: `api/src/features/warmup.ts:45-88`
- Test: `api/test/features/events.test.ts`
- Test: `api/test/features/warmup.test.ts`

**Interfaces:**
- Produces:
  - `checkSourceState(ctx: Ctx, event: EventItem): { unchanged: boolean; currentHash: string; rowCount: number }` in `api/src/features/eventImport.ts` (with `sourceUnchanged(ctx, event)` delegating to `checkSourceState(ctx, event).unchanged`).
  - Updated `events.autoSync` in `api/src/features/events.ts` using `checkSourceState(ctx, event)` so `stabilize: true` reuses `currentHash` without re-opening or re-reading the source sheet.
  - Updated `warmCaches(ctx: Ctx): WarmResult` in `api/src/features/warmup.ts` that:
    1. Runs `checkEventFormStatus(ctx, event)` gated by `sync:formCheck:<eventId>` (TTL `600`s) for active events (`event.status === 'active'`) with `formId || formUrl`, bumping `DATA_VERSION` if `formClosed` or `formClosedReason` changes.
    2. Gates source sheet polling by `sync:check:<eventId>` (TTL `60`s) so `warmCaches` and `events.autoSync` never double-poll or double-import the same event within 60 seconds.

- [x] **Step 1: Write failing unit tests in `api/test/features/events.test.ts` and `api/test/features/warmup.test.ts`**

Add tests asserting:
1. In `api/test/features/events.test.ts`: when `events.autoSync` is called with `{ stabilize: true }` on a changed sheet, `sheet.getDisplayValues()` is called only once on the first stabilization check (not twice).
2. In `api/test/features/warmup.test.ts`:
   - `warmCaches` calls `checkEventFormStatus` when `event.formId` or `event.formUrl` is set and `sync:formCheck:<eventId>` is not cached, sets `sync:formCheck:<eventId>` with TTL `600`, and increments `DATA_VERSION` when form status changes.
   - `warmCaches` skips `sourceUnchanged` / `importEventMembers` when `sync:check:<eventId>` is already present in cache (set by a recent `events.autoSync`), and sets `sync:check:<eventId>` (TTL `60`) when it checks the source sheet.

- [x] **Step 2: Run Vitest in `api` to verify the new tests fail**

Run: `npm test -w api -- test/features/events.test.ts test/features/warmup.test.ts`  
Expected: FAIL on the new assertions.

- [x] **Step 3: Implement `checkSourceState` in `api/src/features/eventImport.ts` and update `events.ts` & `warmup.ts`**

1. In `api/src/features/eventImport.ts`: export `checkSourceState(ctx: Ctx, event: EventItem): { unchanged: boolean; currentHash: string; rowCount: number }` and make `sourceUnchanged(ctx, event)` return `checkSourceState(ctx, event).unchanged`.
2. In `api/src/features/events.ts`: in `'events.autoSync'`, call `const state = checkSourceState(ctx, event);` once; if `state.unchanged`, remove `pendingKey` and continue; if `stabilize`, compare `ctx.cache.get(pendingKey) !== state.currentHash` using `state.currentHash` directly without calling `openSourceTab` / `getDisplayValues()` again.
3. In `api/src/features/warmup.ts`: for active events (`event.status === 'active'`), run the `sync:formCheck:${event.id}` (TTL `600`) check via `checkEventFormStatus(ctx, event)` and bump `DATA_VERSION` (and refresh `dataVersion`) if `formRes.synced && (formRes.formClosed !== prevClosed || formRes.formClosedReason !== prevReason)`. Gate the `sourceUnchanged` + `importEventMembers` block with `sync:check:${event.id}` (TTL `60`) and use `{ full: false, purgeRemoved: true }` (matching `events.autoSync`) so unchanged sheets never force a full rewrite.

- [x] **Step 4: Run full `api` test suite and build**

Run: `npm test -w api ; if ($LASTEXITCODE -eq 0) { npm run build -w api }`  
Expected: All `api` test files pass and `dist/Code.js` builds with exit code `0`.

- [x] **Step 5: Commit Task 1**

```powershell
git add api/src/features/eventImport.ts api/src/features/events.ts api/src/features/warmup.ts api/test/features/events.test.ts api/test/features/warmup.test.ts
git commit -m "perf(api): unify background sync throttling and eliminate double sheet reads"
```

---

### Task 2: Frontend & Shared Code Deduplication + 8-Bit UI Compliance Audit (`@umdsc/shared` & `@umdsc/web`)

**Subagent Model:** Gemini 4 Hydrogen (`invoke_subagent`, `TypeName: 'self'`, `Model: 'pro'`)  
**Skills Used:** `code-simplifier`, `test-driven-development`, `impeccable`, `ui-ux-pro-max`

**Files:**
- Modify: `web/src/features/music-studio/dancecue/utils/youtube.ts`
- Modify: `web/src/components/ui/TabBar.tsx:91,118`
- Modify: `web/src/features/music-studio/Studio.tsx`
- Modify: `web/src/features/music-studio/MusicLibraryPage.tsx`
- Test: `shared/src/musicLinks.test.ts`
- Test: `web/src/components/ui/neon.test.tsx`
- Test: `web/src/features/music-studio/Studio.guard.test.tsx`

**Interfaces:**
- Consumes: `getYouTubeVideoId(value: string): string | null` from `@umdsc/shared`.
- Produces:
  - `web/src/features/music-studio/dancecue/utils/youtube.ts` re-exporting `getYouTubeVideoId` from `@umdsc/shared` (removing duplicate `new URL()` implementation).
  - Shared React Query keys and `staleTime: 60_000` for `['styles']` and `['events', 'all']` across `Studio.tsx` and `MusicLibraryPage.tsx` so switching between `Library` and `Studio` reuses cached metadata without redundant GAS calls.
  - `TabBar.tsx` updated from `text-[9px] sm:text-[11px]` to `text-[10px] sm:text-[11px]`, plus a static source test in `web/src/components/ui/neon.test.tsx` asserting zero occurrences of `text-[8px]` or `text-[9px]` across `web/src/`.

- [x] **Step 1: Write failing tests in `web/src/components/ui/neon.test.tsx` and `web/src/features/music-studio/Studio.guard.test.tsx`**

1. In `web/src/components/ui/neon.test.tsx`: add a test that scans `web/src/**/*.{ts,tsx}` (or checks `TabBar.tsx` and all UI components) to assert no `text-[8px]` or `text-[9px]` classes exist, and that `getYouTubeVideoId('youtube.com/watch?v=dQw4w9WgXcQ')` from `dancecue/utils/youtube` returns `'dQw4w9WgXcQ'`.
2. In `web/src/features/music-studio/Studio.guard.test.tsx`: assert that `Studio` configures `staleTime` on its `['styles']` and `['events', 'all']` queries so cached data is reused across tab switches.

- [x] **Step 2: Run Vitest in `web` to verify the new tests fail**

Run: `npm test -w web -- src/components/ui/neon.test.tsx src/features/music-studio/Studio.guard.test.tsx`  
Expected: FAIL (`TabBar.tsx` has `text-[9px]` and `dancecue/utils/youtube.ts` returns `null` for schemeless URLs).

- [x] **Step 3: Deduplicate `dancecue/utils/youtube.ts`, add `staleTime` to `Studio.tsx` & `MusicLibraryPage.tsx`, and fix `TabBar.tsx` font size**

1. Replace `web/src/features/music-studio/dancecue/utils/youtube.ts` body with:
   ```ts
   export { getYouTubeVideoId } from '@umdsc/shared';
   ```
2. In `web/src/components/ui/TabBar.tsx` (lines 91 and 118): change `text-[9px] sm:text-[11px]` to `text-[10px] sm:text-[11px]`.
3. In `web/src/features/music-studio/Studio.tsx` and `web/src/features/music-studio/MusicLibraryPage.tsx`: add `staleTime: 60_000` to the `['styles']` and `['events', 'all']` `useQuery` hooks (and `['music', 'library']` in `MusicLibraryPage.tsx` with `staleTime: 30_000`) to prevent redundant refetches when switching between `/library` and `/studio`.
4. Audit any other files in `web/src/` for unused imports, dead helpers, or duplicate API calls.

- [x] **Step 4: Run `shared` and `web` unit tests and production build**

Run: `npm test -w shared ; if ($LASTEXITCODE -eq 0) { npm test -w web } ; if ($LASTEXITCODE -eq 0) { npm run build }`  
Expected: All `shared` and `web` tests pass, and `npm run build` exits `0`.

- [x] **Step 5: Commit Task 2**

```powershell
git add web/src/features/music-studio/dancecue/utils/youtube.ts web/src/components/ui/TabBar.tsx web/src/features/music-studio/Studio.tsx web/src/features/music-studio/MusicLibraryPage.tsx web/src/components/ui/neon.test.tsx web/src/features/music-studio/Studio.guard.test.tsx
git commit -m "refactor(web,shared): deduplicate YouTube parser, add query staleTime, and enforce 10px min font"
```

---

### Task 3: Full Automated Playwright E2E + Self-Cleaning Live GAS Sandbox Sustainability Test

**Subagent Model:** Gemini 4 Hydrogen (`invoke_subagent`, `TypeName: 'self'`, `Model: 'pro'`)  
**Skills Used:** `webapp-testing`, `systematic-debugging`, `verification-before-completion`

**Files:**
- Create: `scripts/live-sandbox-verify.mjs`
- Modify: `web/e2e/phone-layout.spec.ts` (add `/library` and `/admin/library` routes to phone layout verification)

**Interfaces:**
- Consumes: Live API URL from `web/.env.production` (`VITE_API_URL`) and test sheet ID `1iyXlD-tknHP75vcq6I-hOWLtGueC8Sj5POiwAGLbJXg` from `docs/SETUP-VALUES.md`.
- Produces:
  - Extended `web/e2e/phone-layout.spec.ts` covering `/library` and `/admin/library` at `360px` and `390px` viewports.
  - `scripts/live-sandbox-verify.mjs` that runs live sustainability & sandbox checks against the deployed GAS API (`?action=health`, `?action=warm`, `bootstrap`, dancer login + `events.list` / `music.list` / `sections.list` cross-style access verification, and if `.admin-token` is present, creates & cleans up a temporary sandbox item in a `try / finally` block).

- [x] **Step 1: Extend `web/e2e/phone-layout.spec.ts` to include `/library` and `/admin/library`**

Add `/library` to the dancer phone-layout check list and `/admin/library` to the admin phone-layout check list in `web/e2e/phone-layout.spec.ts`.

- [x] **Step 2: Run `phone-layout.spec.ts` twice and full Playwright E2E suite (`--grep-invert @internet`)**

Run:
```powershell
cd web ; npx playwright test e2e/phone-layout.spec.ts ; if ($LASTEXITCODE -eq 0) { npx playwright test e2e/phone-layout.spec.ts } ; if ($LASTEXITCODE -eq 0) { npx playwright test --grep-invert "@internet" }
```
Expected: `phone-layout.spec.ts` passes twice with `0` failures across both desktop and mobile projects; full E2E suite passes with `0` failures. Fix any layout or E2E defects discovered.

- [x] **Step 3: Create and run `scripts/live-sandbox-verify.mjs` against the live GAS API**

Write `scripts/live-sandbox-verify.mjs` to test:
1. `GET <VITE_API_URL>?action=health` -> asserts `ok === true`.
2. `GET <VITE_API_URL>?action=warm` -> asserts `ok === true` and `data.warmed === true` with `result.errors === 0`.
3. `POST bootstrap` (unauthenticated) -> asserts `initialized === true` and `styles.length >= 4`.
4. If `.admin-token` exists locally (and still valid):
   - Calls `events.list` (`includeArchived: true`) and `events.autoSync` -> verifies response structure and zero unhandled errors.
   - Runs a self-cleaning sandbox write/delete lifecycle in a `try / finally` block (creates a temporary sandbox music track `[SANDBOX-TEST] Do Not Keep` on an active style, verifies it appears in `music.list`, creates a temporary practice section, verifies it appears in `sections.list`, and deletes both in `finally` while confirming removal from `music.list`).
5. Prints a structured JSON + human-readable sustainability summary and exits `0`.

- [x] **Step 4: Execute `node scripts/live-sandbox-verify.mjs` and verify exit code `0`**

Run: `node scripts/live-sandbox-verify.mjs`  
Expected: All live health, warm-cache, bootstrap, and sandbox checks pass with `0` errors and `100%` cleanup verified.

- [x] **Step 5: Commit Task 3**

```powershell
git add web/e2e/phone-layout.spec.ts scripts/live-sandbox-verify.mjs
git commit -m "test(e2e,scripts): add library phone-layout checks and live GAS sandbox sustainability verifier"
```

---

### Task 4: Update All GitHub Handover Guides (`en/`, `zh/`, `word/*.docx`, `HANDOVER.md`, `SETUP-VALUES.md`, `AGENTS.md`, `GEMINI.md`)

**Subagent Model:** Gemini 4 Hydrogen (`invoke_subagent`, `TypeName: 'self'`, `Model: 'pro'`)  
**Skills Used:** `code-simplifier`, `verification-before-completion`

**Files:**
- Modify: `docs/guides/README.md`
- Modify: `docs/guides/en/1-class-lead-guide.md`
- Modify: `docs/guides/en/2-admin-guide.md`
- Modify: `docs/guides/en/3-dancer-guide.md`
- Modify: `docs/guides/en/4-admin-handover-guide.md`
- Modify: `docs/guides/en/5-developer-guide.md`
- Modify: `docs/guides/zh/1-class-lead-guide.md`
- Modify: `docs/guides/zh/2-admin-guide.md`
- Modify: `docs/guides/zh/3-dancer-guide.md`
- Modify: `docs/guides/zh/4-admin-handover-guide.md`
- Modify: `docs/guides/zh/5-developer-guide.md`
- Create: `scripts/build-guide-docx.mjs`
- Modify: `docs/guides/word/1-class-lead-guide-en.docx`
- Modify: `docs/guides/word/1-class-lead-guide-zh.docx`
- Modify: `docs/guides/word/2-admin-guide-en.docx`
- Modify: `docs/guides/word/2-admin-guide-zh.docx`
- Modify: `docs/guides/word/3-dancer-guide-en.docx`
- Modify: `docs/guides/word/3-dancer-guide-zh.docx`
- Modify: `docs/guides/word/4-admin-handover-guide-en.docx`
- Modify: `docs/guides/word/4-admin-handover-guide-zh.docx`
- Modify: `docs/guides/word/5-developer-guide-en.docx`
- Modify: `docs/guides/word/5-developer-guide-zh.docx`
- Modify: `docs/HANDOVER.md`
- Modify: `docs/SETUP-VALUES.md`
- Modify: `docs/ENABLE-YOUTUBE-SEARCH.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

**Interfaces:**
- Produces: Complete, up-to-date English and Chinese handbooks + regenerated `.docx` Word files + updated `docs/HANDOVER.md`, `docs/SETUP-VALUES.md`, `docs/ENABLE-YOUTUBE-SEARCH.md`, `AGENTS.md`, and `GEMINI.md`.

- [x] **Step 1: Update English Guides (`docs/guides/en/1-class-lead-guide.md` through `5-developer-guide.md` and `docs/guides/README.md`)**

Update all 5 English guides with the latest features added through November 2026:
1. **`1-class-lead-guide.md`**:
   - Built-in **Class Rep (`class_rep`)** / Class Lead role scoped to assigned dance styles (`assignedStyleIds`).
   - Bottom/side navigation including **Library** (`/admin/library`) and **Studio** (`/admin/studio`).
   - **Walk-In QR Code** display and taking attendance for registered dancers + walk-in dancers.
   - **Hybrid Video Uploads**: Google Drive folder upload (with client-side compression options) AND **YouTube Unlisted** video upload, plus consolidated email notifications.
   - **Shared Music Library & Sessionless MP3 Uploads**: uploading MP3s or pasting Spotify/YouTube/SoundCloud/Drive links either for a specific class session OR as `-- General Style / Event Library Track --`, plus `▶ PLAY IN STUDIO` shortcut.
2. **`2-admin-guide.md`**:
   - **Event Wizard & Google Form Slot Auto-Gating**: setting per-style slot limits (`styleSlots`), pasting the Google Form edit URL (`formUrl`), automatic closing when full, automatic 10-minute bidirectional open/close status reflection when edited manually in Google Forms, and the 3-layer Incomplete Sheet Row Guard (never leave half-filled rows in the response sheet).
   - **Per-Style Multi-Instructor Assignment & Instructor Signature Colors**.
   - **Roles & Admin Accounts**: built-in `Class Rep` role (`class_rep`) with style assignment (`assignedStyleIds`), permission hiding on unauthorized tabs.
   - **Player Profile Card** (clicking a dancer in Dancers/Attendance to view profile, attendance hearts, and convert Walk-Ins to registered members).
   - **System Settings**: **Admin Email Manager** (recipient list & notification toggles) and **8-Bit Mascot Notification Center** / Top Notification Bell.
3. **`3-dancer-guide.md`**:
   - **Dancer Login Autocomplete** & Matric isolation.
   - **Shared Music Library (`/library`)**: browsing all club music categorized by **Dance Style** across all events and styles regardless of registered style, inline MP3 preview, opening in Spotify/YouTube/SoundCloud/Download MP3, and tapping `▶ PLAY IN STUDIO`.
   - **Studio (`/studio`)**: `Music Library` source tab with Dance Style category pills & search, `My MP3`, `Link`, synced class video, loop markers, fullscreen mode, and Voice Cue.
   - **Me (`/me`)**: attendance hearts, self-service **Edit Profile** (`Full Name`, `Phone`, `Email`, `Gender`, `Nationality`), and **Walk-In QR Check-in**.
4. **`4-admin-handover-guide.md`**:
   - Updated architecture table (Cloudflare Workers static assets, GAS API, Google Sheet DB, Google Forms auto-gating, Drive + YouTube video storage, Shared Music Library).
   - Updated monthly checklist, Class Rep / Class Lead onboarding (with `Class Rep` role + assigned styles), Google Form & Response Sheet best practices (share both Form and Sheet with `umdancesportc@gmail.com` as Editor; avoid leaving partial rows), and expanded troubleshooting table.
5. **`5-developer-guide.md`**:
   - Updated directory structure (`shared/`, `api/`, `web/`, `scripts/`), one-command API deploy (`npm run push -w api`), live sustainability verifier (`node scripts/live-sandbox-verify.mjs`), Word guide generator (`node scripts/build-guide-docx.mjs`), background `warmDancerCaches` trigger (cache warming + 1-min/5-min sheet sync + 10-min Google Form status check), and UI rules (`10px` min font, `44px` tap targets, `360px` phone layout).

- [x] **Step 2: Update Chinese Guides (`docs/guides/zh/1-class-lead-guide.md` through `5-developer-guide.md`)**

Mirror every addition from Step 1 into `docs/guides/zh/1-class-lead-guide.md` through `docs/guides/zh/5-developer-guide.md`, keeping English button/menu labels in bold alongside natural Chinese explanations (matching existing `zh/` style).

- [x] **Step 3: Create `scripts/build-guide-docx.mjs` and regenerate all 10 `.docx` files in `docs/guides/word/`**

Write a zero-dependency Node script `scripts/build-guide-docx.mjs` (using Node's built-in `zlib` / ZIP packaging or openxml builder matching the existing `.docx` structure in `docs/guides/word/`) that converts `docs/guides/en/*.md` and `docs/guides/zh/*.md` (including embedded images from `docs/guides/images/`) into `docs/guides/word/*-{en,zh}.docx`, and run `node scripts/build-guide-docx.mjs`.

- [x] **Step 4: Update `docs/HANDOVER.md`, `docs/SETUP-VALUES.md`, `docs/ENABLE-YOUTUBE-SEARCH.md`, `AGENTS.md`, and `GEMINI.md`**

1. Update `docs/HANDOVER.md` so all sections reflect the November 2026 system (Event Wizard + Form Auto-Gating, 1-min/5-min Auto-Sync & Incomplete Row Guard, Class Rep role, Shared Music Library, Hybrid Drive/YouTube Videos, Walk-In QR, Mascot Notifications, `npm run push -w api`, and links to `docs/guides/README.md`).
2. Update `docs/SETUP-VALUES.md` with the latest GAS deployment version and date.
3. Update `docs/ENABLE-YOUTUBE-SEARCH.md`, `AGENTS.md`, and `GEMINI.md` to reference the latest spec/plan and `npm run push -w api` deployment command.

- [x] **Step 5: Verify all markdown links and commit Task 4**

```powershell
node scripts/build-guide-docx.mjs
git add docs/ scripts/build-guide-docx.mjs AGENTS.md GEMINI.md
git commit -m "docs(handover,guides): update all EN/ZH/Word guides and handover docs to latest website version"
```

---

### Task 5: Final Whole-Branch Review, GAS Deployment & GitHub Push

**Subagent Model:** Gemini 4 Hydrogen (`invoke_subagent`, `TypeName: 'research'` for Final Review, `Model: 'pro'`)  
**Skills Used:** `requesting-code-review`, `verification-before-completion`, `finishing-a-development-branch`

**Files:**
- Modify: `docs/SETUP-VALUES.md` (record final GAS `@version` number after `npm run push -w api`)
- Modify: `docs/superpowers/plans/2026-11-14-sustainability-audit-dedup-and-handover.md` (mark all task checkboxes `[x]`)

- [x] **Step 1: Run full monorepo unit tests, build, and Playwright phone-layout & E2E verification**

Run:
```powershell
npm test -ws --if-present ; if ($LASTEXITCODE -eq 0) { npm run build } ; if ($LASTEXITCODE -eq 0) { npm run build -w api }
```
Expected: 100% of `shared`, `api`, and `web` tests pass and both builds exit `0`.

- [x] **Step 2: Deploy updated backend to Google Apps Script (`npm run push -w api`) and run `scripts/live-sandbox-verify.mjs`**

Run:
```powershell
npm run push -w api ; if ($LASTEXITCODE -eq 0) { node scripts/live-sandbox-verify.mjs }
```
Expected: `clasp deploy` prints the new `@<version>` number, and `live-sandbox-verify.mjs` passes all live checks including the new `warm` form-status/throttle behavior.

- [x] **Step 3: Record final GAS deployment version in `docs/SETUP-VALUES.md`, dispatch Final Whole-Branch Reviewer (`TypeName: 'research'`, `Model: 'pro'`), and push to `origin/main`**

```powershell
git add docs/SETUP-VALUES.md docs/superpowers/plans/2026-11-14-sustainability-audit-dedup-and-handover.md
git commit -m "chore(release): record final GAS deployment version and complete sustainability plan"
git push origin main
```
