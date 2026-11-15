# Full-System Sustainability Testing, Code Deduplication & GitHub Handover Update — Design Specification

**Date:** 2026-11-14  
**Supervisor Model:** Gemini 4 Argon (Orchestrator Mode)  
**Subagent Worker / Reviewer Model:** Gemini 4 Hydrogen (`invoke_subagent` with `Model: 'pro'`)  
**Execution Method:** `superpowers:subagent-driven-development`

---

## 1. Goal & Scope

Ensure the **UMDSC Dance Class System** is bug-free, quota-sustainable for future club terms, free of code duplication and runtime "double working" across `@umdsc/shared`, `@umdsc/api`, and `@umdsc/web`, verified end-to-end (including a live Google Drive / Google Apps Script sandbox event lifecycle test that cleans up after itself), and documented in GitHub with all existing handover guides (`docs/guides/en/`, `docs/guides/zh/`, `docs/guides/word/`, `docs/HANDOVER.md`, `docs/SETUP-VALUES.md`, `docs/ENABLE-YOUTUBE-SEARCH.md`, `AGENTS.md`, `GEMINI.md`) updated to reflect the latest website version and features.

---

## 2. Multi-Agent Orchestration & Skill Architecture

### 2.1 Supervisor & Subagent Hierarchy
- **Supervisor (Gemini 4 Argon — Orchestrator Mode):**
  - Owns the Subagent-Driven Development ledger (`.superpowers/sdd/2026-11-14-sustainability-audit-dedup-and-handover/progress.md`) and task checklist artifact.
  - Dispatches one scoped task brief at a time to **Gemini 4 Hydrogen** subagents (`invoke_subagent` with `Model: 'pro'`).
  - Uses `TypeName: 'self'` for implementation, refactoring, test execution, and documentation updates, and `TypeName: 'research'` for independent per-task and final branch code reviews.
  - Enforces the `no-subagents` rule inside worker dispatches so workers never spawn duplicate reviewers.

### 2.2 Active Skills Assigned Per Phase
| Skill | Role in This Plan |
|---|---|
| `using-superpowers` & `antigravity-guide` | Enforces Antigravity tool mappings (`invoke_subagent`, task artifacts, background task management) and model tier routing. |
| `subagent-driven-development` | Governs the per-task implementer -> review-package -> task-reviewer -> fix-loop workflow and ledger persistence. |
| `systematic-debugging` | Guides root-cause analysis across backend GAS triggers, Sheet caching, and frontend React Query polling before any fix is written. |
| `code-simplifier` | Eliminates duplicated helpers across `shared/`, `api/`, and `web/` and removes redundant runtime Sheet/Drive/API calls. |
| `test-driven-development` | Requires failing unit/integration tests before fixing any bug, race condition, or deduplication target. |
| `webapp-testing` | Runs Playwright E2E suites (`--grep-invert @internet`), `phone-layout.spec.ts` (360px & 390px), `a11y.spec.ts`, and the live GAS sandbox verification script. |
| `impeccable` & `ui-ux-pro-max` | Audits 8-bit Neon Pixel UI constraints (minimum `10px` font size, `>= 44px` mobile touch targets, `--on-neon` contrast, zero horizontal overflow). |
| `code-review` & `requesting-code-review` | Performs per-task spec/quality reviews and final whole-branch review. |
| `verification-before-completion` | Requires fresh, zero-failure command outputs from all test suites, builds, and live health/sandbox checks before completion. |

---

## 3. Technical Design

### 3.1 Eliminate Runtime "Double Working" & Protect Google Quotas (`@umdsc/api` & `@umdsc/web`)
Google Apps Script enforces daily quotas on `SpreadsheetApp`, `DriveApp`, `FormApp`, `UrlFetchApp`, and script execution time. To ensure multi-year sustainability:

1. **Unify Background Sync (`warmCaches` in `api/src/features/warmup.ts`) and Admin Auto-Sync (`events.autoSync` in `api/src/features/events.ts`):**
   - **Problem 1 (Double Sheet Reads in `events.autoSync`):** In `api/src/features/events.ts`, `sourceUnchanged(ctx, event)` opens the source spreadsheet and hashes all cells; when `stabilize: true`, `events.autoSync` opens the source spreadsheet and hashes all cells a second time; then `importEventMembers` opens and hashes it a third time.
   - **Problem 2 (Split & Overlapping Work Between `warmCaches` and `events.autoSync`):**
     - `warmCaches` (run every 5 minutes by the `warmDancerCaches` trigger) calls `importEventMembers(..., { full: true, purgeRemoved: true, force: true })` without respecting the `sync:check:<eventId>` throttle key or running `checkEventFormStatus(ctx, event)`. Consequently, when an admin has the web app open, `useEventAutoSync` (calling `events.autoSync` every 60s) and `warmCaches` both run imports independently; conversely, when no admin tab is open, `checkEventFormStatus` (the 10-minute Google Form open/closed sync) never runs in the background.
   - **Solution:**
     - Enhance `sourceUnchanged(ctx, event)` (or add `checkSourceHash(ctx, event): { unchanged: boolean; currentHash: string }` in `api/src/features/eventImport.ts`) so `events.autoSync` computes the sheet hash **at most once** per check before acquiring the lock.
     - Have `warmCaches(ctx)` in `api/src/features/warmup.ts` run the same throttled `sync:formCheck:<eventId>` (10-minute Google Form open/closed sync via `checkEventFormStatus`) and `sync:check:<eventId>` throttle key for active non-archived events within retention, avoiding duplicate imports when `events.autoSync` just ran within `AUTO_SYNC_SECONDS` (60s).

2. **Frontend Polling Hygiene (`web/src/lib/useEventAutoSync.ts` & `web/src/components/ui/NotificationWidget.tsx`):**
   - Audit `useEventAutoSync.ts`, `NotificationWidget.tsx`, `useBootstrap.ts`, and `Studio.tsx` to ensure:
     - `useEventAutoSync` only invalidates queries when `res.data?.changed?.length > 0`.
     - No duplicate concurrent `events.list` or `styles.list` requests are fired with mismatched query keys across pages (`['events', 'all']`, `['events']`, `['styles']`), and `staleTime` is set appropriately so navigating between tabs does not hammer the GAS endpoint.

### 3.2 Consolidate Duplicated Code Across `@umdsc/shared`, `@umdsc/api`, and `@umdsc/web`
1. **YouTube Video ID Parser Consolidation:**
   - `web/src/features/music-studio/dancecue/utils/youtube.ts` duplicates `getYouTubeVideoId` from `shared/src/youtube.ts` using `new URL()`, which fails on schemeless URLs (`youtube.com/watch?v=...`) that `@umdsc/shared`'s regex parser supports.
   - Replace the implementation in `web/src/features/music-studio/dancecue/utils/youtube.ts` with a direct re-export from `@umdsc/shared` (`export { getYouTubeVideoId } from '@umdsc/shared';`).
2. **Drive URL Builders & Permission Helpers Audit:**
   - Audit `shared/src/driveIds.ts`, `shared/src/musicLinks.ts`, `web/src/lib/google/driveUrls.ts`, `api/src/logic/permissions.ts`, and `web/src/lib/permissions.ts`.
   - Ensure download/stream/preview URL formatting and permission checks have a single source of truth without dead or unused exports.
3. **8-Bit Neon Pixel UI & Mobile Layout Compliance Fix (`web/src/components/ui/TabBar.tsx`):**
   - `web/src/components/ui/TabBar.tsx` currently uses `text-[9px] sm:text-[11px]` on lines 91 and 118, violating the project-wide minimum `10px` typography constraint (`no text-[8px] or text-[9px]` in `web/src/`).
   - Fix `TabBar.tsx` to use `text-[10px] sm:text-[11px]` while keeping `min-w-0 basis-0` and `truncate` so all 6 tabs fit cleanly at `360px` and `390px` viewports without horizontal overflow.

### 3.3 Full Automated + Live Sandbox Sustainability Verification
1. **Unit & Integration Test Suites (`Vitest`):**
   - `@umdsc/shared`, `@umdsc/api`, and `@umdsc/web` must pass 100% with new regression tests covering single-hash `checkSourceHash`, unified `warmCaches` + `checkEventFormStatus` throttling, shared `getYouTubeVideoId`, and zero `text-[8px]`/`text-[9px]` classes in `web/src/`.
2. **Browser E2E, Mobile Layout & Accessibility Suites (`Playwright`):**
   - Run `npx playwright test e2e/phone-layout.spec.ts` (twice across both desktop and mobile projects, verifying `360px` and `390px` viewports and `>= 44px` tap targets).
   - Run `npx playwright test --grep-invert "@internet"` across the full E2E suite (`login`, `dancer-home`, `dancer-portal-full`, `studio`, `studio-sync`, `class-rep-role`, `admin-*`, `shell`, `shell-mascot-interactive`, `visual-neon`, `a11y`).
3. **Live GAS Sandbox End-to-End Lifecycle Test (`scripts/live-sandbox-verify.mjs`):**
   - Create a repeatable, self-cleaning Node script (`scripts/live-sandbox-verify.mjs`) that connects to the live deployed GAS API (`VITE_API_URL`) and exercises:
     1. `GET ?action=health` and `GET ?action=warm` (verifying cache warm-up & trigger health).
     2. Admin authentication / token verification and read-only smoke checks (`bootstrap`, `events.list`, `styles.list`, `music.list`, `sections.list`).
     3. Sandbox lifecycle test: creates a temporary sandbox test record (e.g., a temporary music link / section or sandbox event check using the test response sheet `1iyXlD-tknHP75vcq6I-hOWLtGueC8Sj5POiwAGLbJXg` if admin credentials/token are available, or exercises safe write + immediate cleanup in a `try / finally` block), verifies dancer/member visibility and isolation, and **guarantees 100% cleanup** in `finally` so zero test artifacts remain in the live database.

### 3.4 Complete GitHub Handover & Guides Update
Update all existing documentation and handover files in the repository so future UMDSC Executive Committees, Class Reps/Leads, Dancers, and Developers have accurate, up-to-date instructions matching the latest website functionality:

1. **Bilingual Guides (`docs/guides/en/` and `docs/guides/zh/`) + Word Copies (`docs/guides/word/`) + Guide Index (`docs/guides/README.md`):**
   - **`1-class-lead-guide.md` (EN & ZH):**
     - Update terminology and features for **Class Lead / Class Rep (`class_rep`)** role (style-scoped access to assigned dance styles).
     - Document **Hybrid Video Upload** (uploading to **Google Drive** with automatic client-side compression >60MB/150MB OR uploading **YouTube Unlisted** videos, plus consolidated email notifications).
     - Document **Shared Music Library & Sessionless MP3 Uploads** (`-- General Style / Event Library Track --`, Spotify/YouTube/SoundCloud/Drive MP3 links, `▶ PLAY IN STUDIO`, and top-level **Library** tab `/admin/library`).
     - Document **Walk-In QR Code Display** and taking attendance for registered dancers + walk-ins.
   - **`2-admin-guide.md` (EN & ZH):**
     - Document **Google Form Slot Auto-Gating & Bidirectional Auto-Sync** (per-style capacity limits `styleSlots`, pasting the Google Form edit URL `formUrl`, automatic form closing when full, automatic 10-minute detection when an admin manually closes or reopens the Google Form, and the 3-layer Incomplete Sheet Row Guard).
     - Document **Built-in `Class Rep` Role & Assigned Dance Styles** (`assignedStyleIds` in Admin Accounts / Member Roles).
     - Document **Per-Style Multi-Instructor Assignment & Instructor Signature Colors**.
     - Document **Admin Email Manager** (customizing email templates & notification toggles in System Settings) and **Animated 8-Bit Mascot Notification Center**.
     - Document **Player Profile Card** (clicking a dancer to view/manage their profile, attendance, and walk-in conversion).
   - **`3-dancer-guide.md` (EN & ZH):**
     - Document **Dancer Login Autocomplete** and **Self-Service Profile Editing** (`Edit Profile` on the `Me` page).
     - Document the new top-level **Library** tab (`/library`) where all registered members (past and current events) can browse and play music categorized by **Dance Style** across all styles and events, preview MP3s inline, open external links (`Spotify`, `YouTube`, `SoundCloud`, `Download MP3`), or tap **`▶ PLAY IN STUDIO`**.
     - Document **Studio (`Music Library` source tab)**, **Walk-In QR Check-in**, and **Mascot Notifications**.
   - **`4-admin-handover-guide.md` (EN & ZH):**
     - Update regular tasks, Class Rep / Class Lead onboarding (including style assignment), Google Form / Sheet sharing rules (do not leave half-typed rows without required fields; how auto-close/reopen works), YouTube & Drive storage management, and updated troubleshooting table.
   - **`5-developer-guide.md` (EN & ZH):**
     - Update architecture diagram and feature map (`shared/`, `api/`, `web/`), current database tables, `npm run push -w api` one-step build + push + deploy workflow, background triggers (`warmDancerCaches` warming caches + syncing active sheets & form status), testing commands (`npm test -ws --if-present`, Playwright E2E, `scripts/live-sandbox-verify.mjs`), and UI rules (`10px` min font, `44px` touch targets, `360px` phone width).
   - **Regenerate `docs/guides/word/*.docx` (all 10 EN & ZH Word files):**
     - Write a repeatable Node script (`scripts/build-guide-docx.mjs`) so all 10 `.docx` files in `docs/guides/word/` are regenerated directly from the updated Markdown guides in `docs/guides/en/` and `docs/guides/zh/` and never fall out of sync again.
2. **Core Operations & Config Docs (`docs/HANDOVER.md`, `docs/SETUP-VALUES.md`, `docs/ENABLE-YOUTUBE-SEARCH.md`, `AGENTS.md`, `GEMINI.md`):**
   - Update `docs/HANDOVER.md` with the complete operational workflow, latest deployment commands, role summary (`admin`, `class_rep`, `dancer`), and direct links to `docs/guides/README.md`.
   - Update `docs/SETUP-VALUES.md` with the latest GAS deployment version and live Cloudflare Workers status.
   - Verify `docs/ENABLE-YOUTUBE-SEARCH.md`, `AGENTS.md`, and `GEMINI.md` reflect current workflows and active specs/plans.
