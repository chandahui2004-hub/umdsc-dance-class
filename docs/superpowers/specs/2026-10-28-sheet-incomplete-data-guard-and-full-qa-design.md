# Google Sheets Incomplete-Edit Protection & Full Section Subagent QA Design

**Date:** 2026-10-28  
**Status:** Draft for User Review

---

## 1. Problem Statement

1. **Incomplete Data from Live Google Sheet Edits:**  
   Because admins can edit Google Sheets directly (the Form Response Sheet, the Event `Members` Sheet, and the Style `Attendance` Sheets) while the website runs 1-minute background auto-sync (`events.autoSync`), an admin typing a new row or editing an existing row cell-by-cell can be caught mid-edit. Currently:
   - `buildMembers` imports rows even if `fullName` is empty, `email` is half-typed, `contact` is empty, or `styleIds` is empty, immediately writing incomplete records to `Members` and `Attendance` and sending confirmation emails with blank/incomplete details.
   - If an admin temporarily clears a cell (such as Matric Number or Name) while editing an existing row in the Form Response Sheet, `importEventMembers` treats the member as removed (`removed-from-form` / purged) or triggers a false matric correction.
   - Even when all required cells are non-empty, an admin typing a longer name or adding multiple styles in Google Sheets can be polled mid-keystroke by `events.autoSync`.

2. **Full-Website Section-by-Section Try-Run & Hybrid Bug Fixing:**  
   We need to run a systematic, subagent-driven QA try-run across all website sections using the test accounts/fixtures (`chandahui2004@gmail.com`, `testing1` event, `testing1` / `testing2` dancers) to identify any edge-case bugs and fix them immediately with TDD tests.

---

## 2. Design: 3-Layer Google Sheets Incomplete-Data Protection

### Layer 1: Complete-Row Gate & Existing-Member Preservation (`api/src/logic/buildMembers.ts` & `api/src/features/eventImport.ts`)

1. **Row Completeness Check (`isRowComplete`):**
   - Ignore completely blank rows (all cells empty).
   - For any non-blank row in the Form Response Sheet, check every required field that is mapped in the sheet's headers (`map` + `classIndex`):
     - **Full Name (`map.fullName !== null`):** Must be non-empty after trimming.
     - **Matric / ID (`map.matric !== null`):** Normalized `matricKey` must be at least 4 characters (`matricKey.length >= 4`).
     - **Contact (`map.contact !== null`):** Must contain at least 6 digits (`contactRaw.replace(/\D/g, '').length >= 6`).
     - **Email (`map.email !== null`):** Must be a valid email shape (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)`).
     - **Dance Style (`classIndex !== null && classIndex >= 0`):** The class cell must be non-empty after trimming (`classCell.trim().length > 0`).
   - If a non-blank row fails any of these checks, `buildMembers` records an `incompleteRow` warning and skips building a partial `Member` from that row, returning `incompleteRowCount` (and any partial identifiers such as `matricKey` / `nameKey` / `sourceTimestamp` seen on incomplete rows).

2. **Preserving Existing Members During Mid-Edit (`importEventMembers`):**
   - When `incompleteRowCount > 0`:
     - New incomplete rows are not in `members`, so they are not added to `Members` or `Attendance`, and no registration confirmation or slot-full email is sent for them.
     - Existing members in the `Members` sheet are **protected**: while `incompleteRowCount > 0` (meaning an admin is actively editing a row in the Form Response Sheet), `importEventMembers` will **not** mark existing members as `removed-from-form`, will **not** purge existing members, and will **not** run `findCorrections` to move matrics—preventing a half-edited existing row from wiping or mutating a dancer's record or attendance ticks.
     - Furthermore, `sourceLastRowHash` is set to `''` (not locked to the incomplete sheet's hash) whenever `incompleteRowCount > 0`, ensuring that once the admin finishes filling in the row, the next sync detects the completed sheet and imports it.

### Layer 2: Direct `Members` & `Attendance` Sheet Read Filtering (`api/src/features/eventMembers.ts` & `api/src/features/attendance.ts`)

- **`readEventMembers` (`api/src/features/eventMembers.ts`):**
  - Skip any row in the `Members` tab where `memberId`, `fullName`, or `matricKey || matricRaw` is empty after trimming.
- **`attendance.get` (`api/src/features/attendance.ts`):**
  - Skip any row in the `Attendance` tab where `memberId` is empty or both `fullName` and `matric` are empty after trimming.

### Layer 3: 2-Consecutive-Check Stability Gate for Background Auto-Sync (`api/src/features/events.ts`)

- **`events.autoSync` Stability Verification:**
  - When `events.autoSync` detects that an active event's Form Response Sheet has changed (`!sourceUnchanged(ctx, event)`):
    - Compute the current sheet hash `currentHash = hashSheet(data)`.
    - Read `pendingHash = ctx.cache.get('sync:pendingHash:' + event.id)`.
    - If `pendingHash !== currentHash`:
      - Store `ctx.cache.put('sync:pendingHash:' + event.id, currentHash, 600)` (10 minutes) and clear `checkKey` / wait for the next 1-minute auto-sync cycle before importing.
    - If `pendingHash === currentHash`:
      - The sheet has remained unchanged across 2 consecutive auto-sync checks (the admin has finished typing). Remove `sync:pendingHash:${event.id}` and run `importEventMembers`.
  - **Manual `SYNC NOW` / `REFRESH` (`events.sync`):**
    - Executes `importEventMembers` immediately (still protected by Layer 1's complete-row gate and existing-member preservation) without waiting for a second cycle.

---

## 3. Subagent-Driven Section-by-Section Try-Run & Hybrid Bug Fixing

After implementing and testing the 3-layer Google Sheets protection, we will dispatch specialized subagents across 4 tracks to try-run and audit both live/simulated flows and code paths, fixing any discovered bugs with TDD:

1. **Track 1 — Events & Google Sheets Sync (`testing1` event, `chandahui2004@gmail.com`):**
   - Verify event creation/editing, `testing1` event sync, incomplete row protection, 2-cycle auto-sync stability, slot capacity alerts, and form slot syncing.
2. **Track 2 — Members Directory & Attendance (`testing1` / `testing2` dancers — `TEST9001` / `TEST9002`):**
   - Verify `testing1` and `testing2` auto-remapping, dancer directory search/filter/deduplication, `members.edit`, and attendance grid marking/syncing.
3. **Track 3 — Calendar, Today, Media Management & DanceCue Studio:**
   - Verify class session creation/editing, video folder linking (`chandahui2004@gmail.com`), batch video upload notification, music track management, and DanceCue Studio playback/sections.
4. **Track 4 — Dancer Portal, Mascot Notification Center & Access/Settings:**
   - Verify dancer sign-in with `testing1` (`TEST9001`) and `testing2` (`TEST9002`), dancer mascot notifications (`MY CLASSES`, `UPCOMING`, `PRACTICE`), admin mascot notifications (`NEW DANCERS`, `SLOT PROGRESS`, `SYSTEM & AUDIT`), Player Profile layout, and permission hiding.

---

## 4. Deployment Plan

- Run full unit and integration test suites (`npm test`) across `shared`, `api`, and `web`.
- Build production bundles (`npm run build`).
- Deploy backend to Google Apps Script (`clasp push` + `clasp deploy -i AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA`) and frontend to Cloudflare Workers (`git push origin main`).
