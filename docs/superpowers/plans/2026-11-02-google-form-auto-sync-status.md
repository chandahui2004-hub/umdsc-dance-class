# Google Form Bidirectional Auto-Sync & Real-Time Open/Closed Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically sync and reflect the live open/closed state of Google Forms on the website every 10 minutes (and on manual sync), display pulsing neon retro status badges on Admin Event Cards (`[● FORM OPEN]` vs `[✖ FORM CLOSED]`), and honor admin manual re-openings without being overridden by dancer counts.

**Architecture:** Extend `EventItem` in `@umdsc/shared` and the `Events` table with `formClosed`, `formClosedAt`, and `formClosedReason`. In `formGating.ts`, treat live `isAcceptingResponses()` as the source of truth, respecting manual re-openings even when dancer counts are high. In `events.ts`, integrate form status checking into `events.autoSync` and `events.syncFormSlots`, bumping `DATA_VERSION` on change. On the web frontend, render retro neon badges in `EventCard.tsx` and poll every 10 minutes via `useEventAutoSync`.

**Tech Stack:** TypeScript, React, Vite, Tailwind CSS, TanStack Query, Vitest, Google Apps Script FormApp API.

**Spec:** `docs/superpowers/specs/2026-11-02-google-form-auto-sync-status-design.md`

## Global Constraints

- Never ask for or store the club Gmail password.
- Live Google Form state (`form.isAcceptingResponses()`) is master: if an admin manually re-opens a form in Google Forms, the system keeps it open and does NOT force-close it even if member count exceeds slot limit.
- 8-bit retro pixel aesthetic: Use standard CSS variables (`var(--neon-red)`, `#4ade80` / `var(--neon-green)`, `var(--night-3)`, `var(--outline)`) with 2px borders, box shadows, and pulsing dot indicator.
- Maintain strict TDD: Write failing tests before implementation code, confirm pass, and commit.

## Review Focus

1. **Manual Re-Opening Override:** When an event has reached capacity, but the admin re-opens the Google Form directly in Google Forms, the sync must set `formClosed: false` and NOT close it again.
2. **Missing or Non-Form Events:** Events with no Google Form attached must not crash or display a broken form status badge.
3. **Reactive Query Invalidation:** When `events.autoSync` detects a change in `formClosed`, `DATA_VERSION` bumps and `['events']` queries invalidate so UI updates without manual page refresh.
4. **Responder (/viewform) vs Editor (/edit) Links:** Graceful handling when only responder link is provided (logs warning, does not throw unhandled exception).
5. **Periodic Throttling:** 10-minute form check throttle prevents hitting Google Apps Script Quotas on frequent background polls.

---

### Task 1: Type Definitions & Event Draft Model

**Files:**
- Modify: `shared/src/types.ts:100-115`
- Modify: `web/src/features/events/eventDraft.ts:20-50`
- Test: `web/src/features/events/eventDraft.test.ts`

**Interfaces:**
- Produces: `EventItem.formClosed?: boolean`, `EventItem.formClosedAt?: string`, `EventItem.formClosedReason?: 'manual' | 'capacity' | 'none'`
- Consumes: `EventItem` in `shared` and `web`

- [x] **Step 1: Update `EventItem` in `shared/src/types.ts`**
  Add `formClosed?: boolean;`, `formClosedAt?: string;`, `formClosedReason?: 'manual' | 'capacity' | 'none';` to `EventItem`.

- [x] **Step 2: Update `EventDraft` in `web/src/features/events/eventDraft.ts`**
  Preserve `formClosed`, `formClosedAt`, `formClosedReason` when converting draft from event.

- [x] **Step 3: Write test in `web/src/features/events/eventDraft.test.ts`**
  Verify `draftFromEvent` preserves `formClosed` and `formClosedReason`.

- [x] **Step 4: Run test to verify it passes**
  Run: `npm test -w web -- src/features/events/eventDraft.test.ts`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add shared/src/types.ts web/src/features/events/eventDraft.ts web/src/features/events/eventDraft.test.ts
  git commit -m "feat(types): add formClosed and formClosedReason to EventItem"
  ```

---

### Task 2: Backend Form Polling & Admin Override Logic (`formGating.ts` & `events.ts`)

**Files:**
- Modify: `api/src/features/formGating.ts`
- Modify: `api/src/features/events.ts:355-520`
- Test: `api/test/features/formGating.test.ts`
- Test: `api/test/features/events.test.ts`

**Interfaces:**
- Produces: `checkEventFormStatus(ctx: Ctx, event: EventItem): FormGatingResult`
- Updates: `Events` table with `formClosed`, `formClosedAt`, `formClosedReason`
- Modifies: `events.autoSync` to check form status every 10 minutes and bump `DATA_VERSION` on change

- [x] **Step 1: Write failing tests in `api/test/features/formGating.test.ts`**
  - Test A: Detects when Google Form is manually closed by admin and persists `formClosed: true` and `formClosedReason: 'manual'`.
  - Test B: When Google Form is re-opened in Google Forms by admin, persists `formClosed: false` and does NOT re-close it even if member count >= slot limit.
  - Test C: When slot capacity is reached and form was not manually re-opened, closes form and sets `formClosed: true` with `formClosedReason: 'capacity'`.

- [x] **Step 2: Run tests to verify they fail**
  Run: `npm test -w api -- test/features/formGating.test.ts`
  Expected: FAIL

- [x] **Step 3: Implement `checkEventFormStatus` and update `syncGoogleFormSlotChoices` in `api/src/features/formGating.ts`**
  - Check `form.isAcceptingResponses()`.
  - If `isCurrentlyAccepting === true`:
    - Set `formClosed = false`, `formClosedReason = 'none'`.
    - Do NOT force-close the form, even if dancer count >= slot limit (admin intent precedence).
  - If `isCurrentlyAccepting === false`:
    - Set `formClosed = true`.
    - Check if message === `FULL_HOUSE_CLOSED_MESSAGE` ? `'capacity'` : `'manual'`.
  - Persist `formClosed`, `formClosedAt`, `formClosedReason` to `ctx.db.events.update` if changed.

- [x] **Step 4: Update `events.autoSync` and `events.syncFormSlots` in `api/src/features/events.ts`**
  - In `events.autoSync`: for each active event with a form link, check form status every 10 minutes (cached via `sync:formCheck:${event.id}`). If changed, add to `result.changed` and bump `DATA_VERSION`.
  - In `events.syncFormSlots`: persist `formClosed` and return updated event.

- [x] **Step 5: Run tests to verify they pass**
  Run: `npm test -w api -- test/features/formGating.test.ts test/features/events.test.ts`
  Expected: PASS

- [x] **Step 6: Commit**
  ```bash
  git add api/src/features/formGating.ts api/src/features/events.ts api/test/features/formGating.test.ts api/test/features/events.test.ts
  git commit -m "feat(api): implement bidirectional Google Form status sync and admin open precedence"
  ```

---

### Task 3: Frontend UI Badging & Live Auto-Sync (`EventCard.tsx` & `useEventAutoSync.ts`)

**Files:**
- Modify: `web/src/features/events/EventCard.tsx:130-220`
- Modify: `web/src/lib/useEventAutoSync.ts`
- Test: `web/src/features/events/EventCard.test.tsx`
- Test: `web/src/lib/useEventAutoSync.test.tsx`

**Interfaces:**
- Produces: Live retro pixel badge `[● FORM OPEN]` vs `[✖ FORM CLOSED]` next to the `FORM ↗` link button.
- Updates: `useEventAutoSync` checks every 10 minutes (and on tab visibility).

- [x] **Step 1: Write failing test in `web/src/features/events/EventCard.test.tsx`**
  - Test A: Renders `FORM OPEN` neon green badge with pulsing dot when event has a form and `formClosed` is false/undefined.
  - Test B: Renders `FORM CLOSED` neon red badge with pulsing dot when `formClosed` is true.
  - Test C: Does not render form badges when event has no form link.

- [x] **Step 2: Run test to verify it fails**
  Run: `npm test -w web -- src/features/events/EventCard.test.tsx`
  Expected: FAIL

- [x] **Step 3: Implement status badge in `web/src/features/events/EventCard.tsx`**
  Next to the `FORM ↗` link button:
  - If `event.formClosed`:
    ```tsx
    <span
      data-testid={`form-status-${event.id}`}
      className="px-2 py-0.5 border-2 border-[var(--outline)] bg-[var(--night-3)] font-display text-[12px] text-[var(--neon-red)] font-bold shadow-[1px_1px_0_var(--outline)] flex items-center gap-1.5"
      title="Google Form is currently closed for registration"
    >
      <span className="inline-block w-2 h-2 rounded-full bg-[var(--neon-red)] animate-pulse" />
      <span>FORM CLOSED</span>
    </span>
    ```
  - If `!event.formClosed`:
    ```tsx
    <span
      data-testid={`form-status-${event.id}`}
      className="px-2 py-0.5 border-2 border-[var(--outline)] bg-[var(--night-3)] font-display text-[12px] text-[#4ade80] font-bold shadow-[1px_1px_0_var(--outline)] flex items-center gap-1.5"
      title="Google Form is currently accepting registrations"
    >
      <span className="inline-block w-2 h-2 rounded-full bg-[#4ade80] animate-pulse" />
      <span>FORM OPEN</span>
    </span>
    ```

- [x] **Step 4: Update `useEventAutoSync.ts`**
  Ensure interval runs every 10 minutes and refetches `['events']` when changes occur.

- [x] **Step 5: Run tests to verify they pass**
  Run: `npm test -w web -- src/features/events/EventCard.test.tsx src/lib/useEventAutoSync.test.tsx`
  Expected: PASS

- [x] **Step 6: Commit**
  ```bash
  git add web/src/features/events/EventCard.tsx web/src/lib/useEventAutoSync.ts web/src/features/events/EventCard.test.tsx web/src/lib/useEventAutoSync.test.tsx
  git commit -m "feat(web): render retro neon FORM OPEN and FORM CLOSED status badges on EventCard"
  ```

---

### Task 4: Full Suite Verification, Deployment & Live Verification

**Files:**
- Entire repository

- [x] **Step 1: Run full test suite across workspace**
  - Run: `npm test -w api`
  - Run: `npm test -w web`
  - Expected: ALL tests pass.

- [x] **Step 2: Build web project**
  - Run: `npm run build -w web`
  - Expected: Build succeeds without errors.

- [x] **Step 3: Deploy backend to Google Apps Script**
  - Run: `npm run push -w api`
  - Expected: Clasp push and deploy succeed.

- [x] **Step 4: Live verification via Production API**
  - Test live endpoint for active event `testing1` (`evt_T2Z7Wt1hUJ`) and verify `formClosed` status resolution.

- [x] **Step 5: Push commits to GitHub repository**
  - Run: `git push origin main`

