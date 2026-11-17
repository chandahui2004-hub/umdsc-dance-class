# Admin Dancer & Class Enrollment Management, Auto-Cleanup & Google Form Reopen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable admins on `/admin/members` to directly add new dancers, add/change/drop dance classes for existing dancers, and remove dancers from events (writing directly to the Google Form Response Sheet and syncing all sheets/databases), automatically purge dropped/removed dancers from per-style Attendance sheets and `MemberIndex`, and add a custom 8-bit `REOPEN / + SLOTS` workflow on `/admin/events` to reopen full classes or closed Google Forms by adding `+N` slots.

**Architecture:** Supervised by **Gemini 4 Argon (High)** using `superpowers:subagent-driven-development`, dispatching **Gemini 4 Hydrogen** (`Model: 'pro'`) implementer (`TypeName: 'self'`) and reviewer (`TypeName: 'research'`) subagents across 4 tasks: (1) Automatic Attendance & `MemberIndex` Purge on Class Drop/Change/Removal, (2) Backend Dancer/Class CRUD (`members.add`, `members.edit`, `members.remove`) & `events.reopenFormSlots`, (3) Frontend 8-Bit Icons, Dancers CRUD Dialogs & Event Reopen Slots Modal, and (4) E2E Tests, Bilingual Handover Guide/Word Updates, GAS Deployment & Final Review.

**Tech Stack:** TypeScript, Google Apps Script (`@umdsc/api` + `clasp`), React 19, Vite, Tailwind CSS v4, Vitest, Playwright, Node.js (`scripts/`).

**Spec:** `docs/superpowers/specs/2026-11-17-admin-dancer-class-crud-and-reopen-slots-design.md`

---

## Orchestrator (Argon) & Subagent (Hydrogen) Skill Matrix

| Role / Phase | Model | Antigravity Tool / Type | Active Skills |
|---|---|---|---|
| **Supervisor (Orchestrator)** | **Gemini 4 Argon (High)** | Main Session + `.superpowers/sdd/` Ledger | `using-superpowers`, `antigravity-guide`, `brainstorming`, `writing-plans`, `subagent-driven-development`, `verification-before-completion` |
| **Task 1 Implementer (Auto-Cleanup: Attendance & MemberIndex Purge)** | **Gemini 4 Hydrogen** (`Model: 'pro'`) | `invoke_subagent` (`TypeName: 'self'`) | `systematic-debugging`, `test-driven-development`, `code-simplifier` |
| **Task 2 Implementer (Backend Dancer/Class CRUD & Reopen Form Slots API)** | **Gemini 4 Hydrogen** (`Model: 'pro'`) | `invoke_subagent` (`TypeName: 'self'`) | `test-driven-development`, `systematic-debugging`, `code-simplifier` |
| **Task 3 Implementer (8-Bit Icons, Dancers CRUD UI & Reopen Slots Modal)** | **Gemini 4 Hydrogen** (`Model: 'pro'`) | `invoke_subagent` (`TypeName: 'self'`) | `ui-ux-pro-max`, `impeccable`, `ui-styling`, `test-driven-development` |
| **Task 4 Implementer (Playwright E2E, Guides/Docx Update & Deploy)** | **Gemini 4 Hydrogen** (`Model: 'pro'`) | `invoke_subagent` (`TypeName: 'self'`) | `webapp-testing`, `verification-before-completion`, `finishing-a-development-branch` |
| **Per-Task & Final Branch Reviewers** | **Gemini 4 Hydrogen** (`Model: 'pro'`) | `invoke_subagent` (`TypeName: 'research'`) | `code-review`, `requesting-code-review`, `receiving-code-review` |

---

## Global Constraints

- Never ask for, log, or commit the club Gmail password, `TOKEN_SECRET`, `SETUP_CODE`, `.admin-token`, or `.clasprc.json`.
- Do **not** use `taste-skill`, `soft-skill`, `minimalist-skill`, `brutalist-skill`, `gpt-tasteskill`, `stitch-skill`, or `redesign-skill`: the UI is strictly 8-bit retro neon pixel per Spec §13.1.
- All new icons (`PixelUnlockIcon`, `PixelPlusUserIcon`, `PixelTrashIcon`) must be custom 8-bit `<svg viewBox="0 0 20 20" shapeRendering="crispEdges">` icons in `web/src/components/ui/pixelIcons.tsx` (no generic OS emojis on new buttons).
- Enforce font size `>= 10px` across all `web/src/` files (`neon.test.tsx`), `>= 44px` tap targets, and `0` horizontal overflow at `360px` and `390px`.
- When an admin adds a dancer or changes classes into a full style (`enrolledCount >= slotLimit`), allow the override on the website while ensuring the Google Form / full style choice **stays closed** (`suppressFormReopen: true`).
- Always run workspace tests via `npm test -w <workspace>` or `npm test -ws --if-present`.

## Review Focus

1. Dancer with existing `/` attendance ticks in Hip Hop switches from Hip Hop to K-Pop (or drops Hip Hop) -> Hip Hop `Attendance` sheet row is cleared (even with ticks), `attendance.get` for Hip Hop no longer lists her, K-Pop `Attendance` sheet lists her, and `MemberIndex.eventStyles[eventId]` updates to `['style-kpop']`.
2. Last enrolled dancer in a style or event quits / is removed -> `ensureEventSheets` still runs cleanup even when `styleMembers.length === 0` or `members.length === 0`, clearing her row from `Attendance` and deactivating her `MemberIndex` record (`active: false`, `eventIds: []`) when she has 0 events left.
3. Dancer who submitted two separate rows in the Google Form Response Sheet (Row 2: Hip Hop, Row 5: K-Pop) has Hip Hop dropped via `members.edit` -> primary row is updated to `K-Pop` and the duplicate row is cleared so `buildMembers` does not re-merge Hip Hop back in.
4. Admin manually adds a 21st dancer into a style with a 20-slot limit (`members.add`) -> dancer is added (`21/20`), confirmation email is sent, and the Google Form / style choice remains **closed** (`formClosed` is not flipped to open).
5. Admin clicks `REOPEN / + SLOTS` on a full class (`21 enrolled / 20 limit`) and enters `+5` add-on slots (`events.reopenFormSlots`) -> new slot limit becomes `Math.max(20, 21) + 5 = 26`, `notifiedFullStyles` drops that style so capacity alerts re-arm, the style choice is restored on the Google Form, and `form.setAcceptingResponses(true)` reopens the form immediately.

---

### Task 1: Automatic Attendance Sheet & `MemberIndex` Purge on Class Drop / Change / Event Removal (`@umdsc/api`)

**Subagent Model:** Gemini 4 Hydrogen (`invoke_subagent`, `TypeName: 'self'`, `Model: 'pro'`)  
**Skills Used:** `systematic-debugging`, `test-driven-development`, `code-simplifier`

**Files:**
- Modify: `api/src/features/eventSheets.ts:250-342`
- Modify: `api/src/features/attendance.ts:50-245`
- Modify: `api/src/features/eventImport.ts:255-269,394-401,504-595`
- Test: `api/test/features/eventImport.test.ts`
- Test: `api/test/features/attendance.test.ts`

**Interfaces:**
- Produces:
  - Updated `ensureEventSheets(ctx, event)` in `api/src/features/eventSheets.ts`: filters active non-removed `styleMembers` per style (`!(m.flags || []).includes('removed') && !(m.flags || []).includes('removed-from-form') && isMemberEnrolledInStyle(m, styleId, allStyles)`), clears any row in that style's `Attendance` sheet whose `memberId` is not in `styleMembers` (even if the row has `/` ticks in `classCols` or if `styleMembers.length === 0`), and calls `bumpAttendanceVersion(ctx, current.id, styleId)` when any row is cleared.
  - Updated `attendance.get` & `attendance.mark` in `api/src/features/attendance.ts`: filters `grid.members` and `grid.present` against active enrolled `styleMembers` for `styleId`, caches empty grids when `grid.members.length === 0`, and restricts `attendance.mark` to active enrolled `styleMembers`.
  - Updated `dropEventFromIndex(ctx, event, matricKey)` and `importEventMembers` in `api/src/features/eventImport.ts`: when `eventIds` becomes empty after removing `event.id`, sets `active: false` (`ctx.db.memberIndex.update(..., { eventIds: [], eventStyles: {}, active: false } as any, ...)`) and clears `'mi:' + matricKey` and `'mi:' + entry.id`; also sweeps any active `MemberIndex` entries that still contain `event.id` in `entry.eventIds` when `matricKey` is no longer in `inForm` (and `!hasIncompleteRows`).

- [ ] **Step 1: Write failing unit tests in `api/test/features/eventImport.test.ts` and `api/test/features/attendance.test.ts`**
- [ ] **Step 2: Run Vitest in `api` to verify the new tests fail**
- [ ] **Step 3: Implement per-style Attendance row purge in `eventSheets.ts`, active style filtering in `attendance.ts`, and `MemberIndex` zero-event deactivation in `eventImport.ts`**
- [ ] **Step 4: Run full `api` test suite and build (`npm test -w api ; if ($LASTEXITCODE -eq 0) { npm run build -w api }`)**
- [ ] **Step 5: Commit Task 1**

---

### Task 2: Backend Admin Dancer & Class Enrollment CRUD (`members.add`, `members.edit`, `members.remove`) + `events.reopenFormSlots` (`@umdsc/api`)

**Subagent Model:** Gemini 4 Hydrogen (`invoke_subagent`, `TypeName: 'self'`, `Model: 'pro'`)  
**Skills Used:** `test-driven-development`, `systematic-debugging`, `code-simplifier`

**Files:**
- Modify: `api/src/features/members.ts`
- Modify: `api/src/features/formGating.ts`
- Modify: `api/src/features/eventImport.ts`
- Modify: `api/src/features/events.ts`
- Test: `api/test/features/members.test.ts`
- Test: `api/test/features/events.test.ts`

**Interfaces:**
- Produces:
  - `members.add` (`perm: 'members.import'`, `write: true`, `bumpsData: true`): appends a complete dancer response row to the event's Google Form Response Sheet (creating missing headers if needed, setting plain text on matric/contact, formatting `styleIds` via `styleFormLabels[sid] || style.name`), then calls `importEventMembers(ctx, event, { full: true, purgeRemoved: true, suppressFormReopen: true })`.
  - Extended `members.edit` (`perm: 'members.import'`, `write: true`, `bumpsData: true`): supports `styleIds?: string[]` in addition to the 6 profile fields; writes formatted style names to the response sheet's class column on the primary response row and clears any extra duplicate response rows for that matric in that sheet; if `styleIds` is `[]`, clears all response rows for that matric (removing from event); runs `importEventMembers(ctx, event, { full: true, purgeRemoved: true, suppressFormReopen: true })` (and updates `members.selfEdit` to pass `purgeRemoved: true`).
  - `members.remove` (`perm: 'members.import'`, `write: true`, `bumpsData: true`): clears all response rows for `memberId` (`matricKey`) in the event's Google Form Response Sheet and runs `importEventMembers(ctx, event, { full: true, purgeRemoved: true, suppressFormReopen: true })`.
  - `suppressFormReopen` support in `importEventMembers` / `checkAndNotifySlotCapacities` / `syncGoogleFormSlotChoices`: guarantees that an admin website override (`enrolledCount >= cap`) never sets `sync:adminOverride:<eventId>` and never re-opens a closed Google Form or restores a full style choice.
  - `events.reopenFormSlots` (`perm: 'members.import'`, `write: true`, `bumpsData: true`) in `api/src/features/events.ts`: accepts `{ id: string, addOnSlots: Record<string, number> }`, updates `styleSlots[styleId] = Math.max(currentCap, enrolledCount) + addOn` for each style with `addOn >= 1`, removes reopened styles from `notifiedFullStyles`, clears `formClosed` / re-opens the Google Form (`form.setAcceptingResponses(true)`), and runs `syncGoogleFormSlotChoices`.

- [ ] **Step 1: Write failing unit tests in `api/test/features/members.test.ts` and `api/test/features/events.test.ts`**
- [ ] **Step 2: Run Vitest in `api` to verify the new tests fail**
- [ ] **Step 3: Implement `members.add`, `members.edit` (`styleIds`), `members.remove`, `suppressFormReopen`, and `events.reopenFormSlots`**
- [ ] **Step 4: Run full `api` test suite and build (`npm test -w api ; if ($LASTEXITCODE -eq 0) { npm run build -w api }`)**
- [ ] **Step 5: Commit Task 2**

---

### Task 3: 8-Bit Pixel Icons, Admin Dancers CRUD UI (`AddDancerDialog`, `EditDancerDialog`, `MembersPage`) & Event Reopen Slots UI (`ReopenSlotsDialog`, `EventCard`) (`@umdsc/web`)

**Subagent Model:** Gemini 4 Hydrogen (`invoke_subagent`, `TypeName: 'self'`, `Model: 'pro'`)  
**Skills Used:** `ui-ux-pro-max`, `impeccable`, `ui-styling`, `test-driven-development`

**Files:**
- Modify: `web/src/components/ui/pixelIcons.tsx`
- Create: `web/src/features/members/AddDancerDialog.tsx`
- Modify: `web/src/features/members/EditDancerDialog.tsx`
- Modify: `web/src/features/members/MembersPage.tsx`
- Create: `web/src/features/events/ReopenSlotsDialog.tsx`
- Modify: `web/src/features/events/EventCard.tsx`
- Test: `web/src/features/members/MembersPage.test.tsx`
- Test: `web/src/features/events/EventsPage.test.tsx`

**Interfaces:**
- Produces:
  - `PixelUnlockIcon`, `PixelPlusUserIcon`, and `PixelTrashIcon` in `web/src/components/ui/pixelIcons.tsx` (`viewBox="0 0 20 20"`, `shapeRendering="crispEdges"`).
  - `AddDancerDialog.tsx`: modal/sheet on `/admin/members` to register a new dancer into an active event with `Full name`, `Matric number`, `Phone number`, `Email`, `Gender`, `Nationality`, and `Dance Classes` checkboxes (indicating when a class is full that admin override is allowed and the Google Form stays closed).
  - Updated `EditDancerDialog.tsx`: adds per-event `Dance Classes` checkboxes (`styleIds`) to add/change/drop classes, plus a `REMOVE FROM EVENT` button (with `<PixelTrashIcon />` and confirmation step) calling `members.remove`.
  - Updated `MembersPage.tsx`: adds `+ ADD DANCER` button (with `<PixelPlusUserIcon />`) in the toolbar, passes event/style metadata to `AddDancerDialog` and `EditDancerDialog`, and invalidates `['members']`, `['events']`, and `['attendance']` on save/add/remove.
  - `ReopenSlotsDialog.tsx` & updated `EventCard.tsx`: adds `REOPEN / + SLOTS` button (with `<PixelUnlockIcon />`) on `EventCard.tsx` whenever any style is full or `event.formClosed` is true; dialog requires entering `+N` Add-On Slots (`>= 1`), previews the new slot limit (`Math.max(limit, enrolled) + addOn`), and calls `events.reopenFormSlots`.

- [ ] **Step 1: Write failing component tests in `web/src/features/members/MembersPage.test.tsx` and `web/src/features/events/EventsPage.test.tsx`**
- [ ] **Step 2: Run Vitest in `web` to verify the new tests fail**
- [ ] **Step 3: Implement 8-bit icons in `pixelIcons.tsx`, `AddDancerDialog.tsx`, `EditDancerDialog.tsx`, `MembersPage.tsx`, `ReopenSlotsDialog.tsx`, and `EventCard.tsx`**
- [ ] **Step 4: Run full `web` unit test suite (including `neon.test.tsx` >=10px check) and `npm run build`**
- [ ] **Step 5: Commit Task 3**

---

### Task 4: Playwright E2E Verification, Handover Guide Updates (`en/`, `zh/`, `word/*.docx`), GAS Deployment & GitHub Push

**Subagent Model:** Gemini 4 Hydrogen (`invoke_subagent`, `TypeName: 'self'`, `Model: 'pro'`) + Final Reviewer (`TypeName: 'research'`, `Model: 'pro'`)  
**Skills Used:** `webapp-testing`, `verification-before-completion`, `requesting-code-review`, `finishing-a-development-branch`

**Files:**
- Modify: `web/e2e/admin-members-list.spec.ts`
- Modify: `web/e2e/admin-events.spec.ts`
- Modify: `docs/guides/en/2-admin-guide.md`
- Modify: `docs/guides/zh/2-admin-guide.md`
- Modify: `docs/HANDOVER.md`
- Modify: `docs/SETUP-VALUES.md`
- Regenerate: `docs/guides/word/*-{en,zh}.docx` via `node scripts/build-guide-docx.mjs`

- [ ] **Step 1: Add Playwright E2E tests in `web/e2e/admin-members-list.spec.ts` (Add Dancer, Change/Drop Class, Remove Dancer) and `web/e2e/admin-events.spec.ts` (`REOPEN / + SLOTS`) and run `phone-layout.spec.ts` + E2E specs**
- [ ] **Step 2: Update `docs/guides/en/2-admin-guide.md`, `docs/guides/zh/2-admin-guide.md`, and `docs/HANDOVER.md` to document `+ ADD DANCER`, class add/change/drop, `REMOVE FROM EVENT`, automatic attendance/database cleanup, and `REOPEN / + SLOTS`, then run `node scripts/build-guide-docx.mjs`**
- [ ] **Step 3: Run full monorepo unit tests (`npm test -ws --if-present`) and builds (`npm run build`, `npm run build -w api`), deploy to GAS (`npm run push -w api`), and run `node scripts/live-sandbox-verify.mjs`**
- [ ] **Step 4: Record final GAS `@version` in `docs/SETUP-VALUES.md`, dispatch Final Whole-Branch Reviewer (`TypeName: 'research'`, `Model: 'pro'`), clean up `.superpowers/sdd/`, and `git push origin main`**
