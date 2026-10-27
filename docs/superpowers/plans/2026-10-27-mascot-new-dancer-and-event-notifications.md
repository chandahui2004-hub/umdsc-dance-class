# Mascot Notification for New Dancers and Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the floating mascot notification center proactively detects and displays newly registered dancers and newly added events (including their pre-registered dancers) within the last 7 days.

**Architecture:** Implement robust timestamp parsing in `web/src/lib/time.ts` for Malaysian Google Form date formats (`DD/MM/YYYY HH:mm:ss`). In `NotificationWidget.tsx`, run member queries in the background for admins with 60s auto-refresh, filter events and dancers within the last 7 days, include pre-registered dancers from new events, display a new event announcement banner at the top of the NEW DANCERS tab, and show event name badges on dancer cards.

**Tech Stack:** TypeScript, React, TanStack Query, Vitest, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-10-27-mascot-new-dancer-and-event-notifications-design.md`

## Global Constraints

- Retro 8-bit styling and cyberpunk aesthetic must be preserved.
- Never ask for or store the club Gmail password.
- No dummy/placeholder values that break real dancer registrations.
- Do not degrade performance (use reasonable query caching and 60s background polling).

## Review Focus

1. **Malaysian Date Parsing:** Google Forms timestamps like `26/10/2026 21:04:12` must parse to valid timestamps and not return `NaN`.
2. **Pre-Registered Dancers in New Events:** If a newly created event already has 30 dancers, all 30 must appear in the New Dancers list under that event.
3. **Mascot Badge While Closed:** The mascot avatar badge must show the alert count even before opening the drawer.
4. **Event Name Scoping:** Each dancer card must clearly display the name of the event they registered for.
5. **Search Filtering:** Searching by name, matric, style, or event name filters the recent dancers accurately.

---

### Task 1: Timestamp Parsing & Formatting Utilities (TDD)

**Files:**
- Modify: `web/src/lib/time.ts`
- Test: `web/src/lib/time.test.ts`

- [ ] **Step 1: Write failing tests for flexible timestamp parsing**
  In `web/src/lib/time.test.ts`, add test cases for `parseFlexibleTimestamp` and `formatRegistrationDate`:
  - Parses `DD/MM/YYYY HH:mm:ss` (e.g. `26/10/2026 21:04:12`).
  - Parses `D/M/YYYY H:mm:ss` (e.g. `5/10/2026 9:30:00`).
  - Parses ISO strings (e.g. `2026-10-26T21:04:12.000Z`).
  - Parses `YYYY-MM-DD HH:mm:ss`.
  - Disambiguates day and month when day or month > 12.
  - Returns `null` for empty or invalid strings.
  - Formats date cleanly as `DD/MM/YYYY, HH:mm` (or `DD/MM/YYYY` if no time).

- [ ] **Step 2: Run tests to confirm failure**
  Run: `npm test -w web web/src/lib/time.test.ts`
  Verify tests fail because functions are not implemented.

- [ ] **Step 3: Implement `parseFlexibleTimestamp` and `formatRegistrationDate` in `web/src/lib/time.ts`**
  Implement the parsing and formatting logic handling Malaysian and ISO date strings.

- [ ] **Step 4: Run tests to confirm pass**
  Run: `npm test -w web web/src/lib/time.test.ts`
  Confirm all tests pass.

- [ ] **Step 5: Commit changes**
  Commit message: `feat(web): add flexible timestamp parser and formatter for Google Form dates`

---

### Task 2: Mascot Notification Logic & Background Querying (TDD)

**Files:**
- Modify: `web/src/components/ui/NotificationWidget.tsx`
- Test: `web/src/components/ui/NotificationWidget.test.tsx`

- [ ] **Step 1: Write failing tests in `NotificationWidget.test.tsx`**
  Add unit and component tests:
  - Mascot badge displays new dancers count even when drawer is closed (`isOpen === false`).
  - Recognizes dancers with `DD/MM/YYYY` timestamps within the last 7 days.
  - Displays newly added events banner in the NEW DANCERS tab.
  - Includes pre-registered dancers from newly added events even if dancer timestamp is missing or earlier.
  - Dancer card displays Event Name badge alongside matric and full name.

- [ ] **Step 2: Run tests to confirm failure**
  Run: `npm test -w web web/src/components/ui/NotificationWidget.test.tsx`
  Verify the new test assertions fail.

- [ ] **Step 3: Update `NotificationWidget.tsx`**
  - Enable `allMembers` query in the background: `enabled: isAdmin && activeEvents.length > 0` with `refetchInterval: 60_000`.
  - Calculate `recentEvents` using 7-day window on `ev.updatedAt` or `ev.startDate`.
  - Calculate `recentDancers` using `parseFlexibleTimestamp` with 7-day window, plus all dancers belonging to `recentEvents`.
  - Render "NEW EVENT ADDED" announcement card at the top of the `new_dancers` tab.
  - Display Event Name on each dancer card (`🎪 {d._eventName}`).
  - Display formatted registration timestamp using `formatRegistrationDate(d.sourceTimestamp)`.
  - Update `alertCount` to include `recentDancers.length + recentEvents.length + systemAlerts.length`.

- [ ] **Step 4: Run tests to confirm pass**
  Run: `npm test -w web web/src/components/ui/NotificationWidget.test.tsx`
  Confirm all tests pass.

- [ ] **Step 5: Commit changes**
  Commit message: `feat(web): enhance mascot notifications for new dancers, new events, and background alerts`

---

### Task 3: Full Test Suite Verification & Production Build

**Files:**
- None (workspace verification)

- [ ] **Step 1: Run full Web test suite**
  Run: `npm test -w web`
  Ensure all 72+ test files pass.

- [ ] **Step 2: Run full API test suite**
  Run: `npm test -w api`
  Ensure all backend tests pass.

- [ ] **Step 3: Run production build**
  Run: `npm run build`
  Ensure build completes with 0 errors.

---

### Task 4: Deployment & Live Verification

**Files:**
- Deployment to Cloudflare Workers

- [ ] **Step 1: Push changes to Git remote**
  Run: `git push origin main`
  Confirm Cloudflare Workers deploys the updated frontend.

- [ ] **Step 2: Verify live deployment**
  Verify the live deployment on `https://umdsc-dance-class.umdancesportc.workers.dev`.
