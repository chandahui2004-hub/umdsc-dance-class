# Google Sheets Incomplete-Edit Protection & Full Section Subagent QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the website and background sync from reading or acting on incomplete/mid-edit rows when admins edit Google Sheets directly, and run a 4-track subagent-driven try-run across all website sections (`chandahui2004@gmail.com`, `testing1` event, `testing1`/`testing2` dancers) to detect and fix any bugs before deploying.

**Architecture:** Implement a 3-layer Google Sheets protection in `@umdsc/api` (Layer 1: Complete-row validation in `buildMembers.ts` + existing-member preservation and unlocked hash in `eventImport.ts`; Layer 2: Incomplete-row filtering in `readEventMembers` and `attendance.get`; Layer 3: 2-consecutive-check hash stability gate in `events.autoSync`), followed by 4 parallel/sequential subagents auditing and testing every section of the app and fixing any discovered defects with TDD.

**Tech Stack:** TypeScript, Google Apps Script (`@umdsc/api`), React 18, Vite, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-28-sheet-incomplete-data-guard-and-full-qa-design.md`

## Global Constraints

- Never import a Form Response Sheet row that is missing any mapped required column (`fullName`, `matric` >= 4 chars, `contact` >= 6 digits, `email` matching `^[^\s@]+@[^\s@]+\.[^\s@]+$`, or `classCell` when `classIndex >= 0`).
- Never mark existing members as `removed-from-form`, purge them, or run matric corrections while the Form Response Sheet contains any incomplete non-blank row (`incompleteRowCount > 0`), and keep `sourceLastRowHash` unlocked (`''`) so the next sync re-reads once the admin finishes editing.
- Background `events.autoSync` must verify that a changed sheet's hash remains identical across 2 consecutive auto-sync checks (`sync:pendingHash:<eventId>`) before importing, while manual `events.sync` imports complete rows immediately.
- Never ask for or store the club Gmail password.

## Review Focus

1. Admin typing a new row in the Form Response Sheet with Matric filled in but Name, Email, Contact, or Class still blank -> row is skipped (`incompleteRow`), no member created, no confirmation email sent, and `sourceLastRowHash` is not locked so the next sync picks it up once completed.
2. Admin editing an existing dancer's row in the Form Response Sheet and temporarily clearing their Matric or Email or Class -> existing dancer is preserved in `Members` and `Attendance` (not marked `removed-from-form` and not purged).
3. Admin typing a name or style edit in the Form Response Sheet while `events.autoSync` runs -> 1st `events.autoSync` check records `sync:pendingHash:<eventId>` and waits; 2nd consecutive `events.autoSync` check with the same hash imports the change.
4. Admin directly editing the `Members` or `Attendance` Google Sheet and leaving a row without `fullName` or `matric` -> `readEventMembers` and `attendance.get` ignore the incomplete row.
5. `testing1` and `testing2` test dancers (`TEST9001` and `TEST9002`) and `testing1` event flows across Events, Members, Attendance, Calendar, Media, Studio, Dancer Portal, and Mascot Notification Center.

---

### Task 1: Implement 3-Layer Google Sheets Incomplete-Data Protection in `@umdsc/api`

**Files:**
- Modify: `api/src/logic/buildMembers.ts`
- Modify: `api/src/features/eventImport.ts`
- Modify: `api/src/features/eventMembers.ts`
- Modify: `api/src/features/attendance.ts`
- Modify: `api/src/features/events.ts`
- Test: `api/test/logic/buildMembers.test.ts`
- Test: `api/test/features/eventImport.test.ts`
- Test: `api/test/features/events.test.ts`

**Interfaces:**
- Produces: `buildMembers` returning `incompleteRowCount: number` and `incompleteRow` warnings; `importEventMembers` preserving existing members and unlocking `sourceLastRowHash` when `incompleteRowCount > 0`; `events.autoSync` enforcing a 2-check `sync:pendingHash:<eventId>` stability gate.

- [x] **Step 1: Write failing tests in `api/test/logic/buildMembers.test.ts`, `api/test/features/eventImport.test.ts`, and `api/test/features/events.test.ts`**
- [x] **Step 2: Run Vitest in `api` to verify the new tests fail**
- [x] **Step 3: Implement the 3-layer protection in `buildMembers.ts`, `eventImport.ts`, `eventMembers.ts`, `attendance.ts`, and `events.ts`**
- [x] **Step 4: Run Vitest in `api` to verify all tests pass**

---

### Task 2: Subagent Track 1 & Track 2 — Events, Sheet Sync, Members Directory & Attendance Try-Run & Bug Fixes

**Files:**
- Audit & Test: `api/src/features/events.ts`, `api/src/features/eventImport.ts`, `api/src/features/members.ts`, `api/src/features/attendance.ts`, `web/src/features/events/*`, `web/src/features/members/*`, `web/src/features/attendance/*`

- [x] **Step 1: Dispatch subagents to audit and test Track 1 (Events & Sheet Sync with `testing1` event & `chandahui2004@gmail.com`) and Track 2 (Members & Attendance with `testing1`/`testing2` dancers)**
- [x] **Step 2: Fix any discovered bugs with TDD tests**

---

### Task 3: Subagent Track 3 & Track 4 — Calendar, Media, Studio, Dancer Portal, Mascot Notifications & Access/Settings Try-Run & Bug Fixes

**Files:**
- Audit & Test: `api/src/features/sessions.ts`, `api/src/features/videos.ts`, `api/src/features/music.ts`, `web/src/features/classes/*`, `web/src/features/media/*`, `web/src/features/music-studio/*`, `web/src/features/calendar/*`, `web/src/components/ui/NotificationWidget.tsx`, `web/src/features/access/*`, `web/src/features/settings/*`

- [x] **Step 1: Dispatch subagents to audit and test Track 3 (Calendar, Today, Media, Studio) and Track 4 (Dancer Portal, Mascot Notification Center, Access & Settings)**
- [x] **Step 2: Fix any discovered bugs with TDD tests**

---

### Task 4: Full Verification, Build & Deploy (GAS Backend + Cloudflare Frontend)

- [x] **Step 1: Run `npm test` and `npm run build` across all workspaces**
- [x] **Step 2: Deploy GAS backend (`clasp push` + `clasp deploy`) and push to `origin/main`**

