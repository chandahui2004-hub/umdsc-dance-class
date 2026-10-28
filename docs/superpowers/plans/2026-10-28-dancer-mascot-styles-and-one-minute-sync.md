# Dancer Mascot Style Names & 1-Minute Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove raw dance style ID codes from the Dancer Mode mascot notification center (showing only the dancer's registered human-readable dance style names) and reduce Google Drive / Response Sheet auto-sync and cache intervals from 10 minutes (600s) to 1 minute (60s).

**Architecture:** Scope `dancer.bootstrap` event `styleIds` on the backend to only the styles the dancer enrolled in, and update `NotificationWidget.tsx` in Dancer Mode so it only displays resolved enrolled style names and never falls back to raw `sty_...` / `st_...` ID strings. Update `useEventAutoSync.ts` (`INTERVAL_MS = 60_000`, invalidating `'notification_members'`) and backend TTLs in `events.ts`, `eventMembers.ts`, and `bootstrap.ts` from `600`/`300` seconds to `60` seconds.

**Tech Stack:** TypeScript, React, TanStack Query, Vitest, Google Apps Script.

**Spec:** `docs/superpowers/specs/2026-10-28-dancer-mascot-styles-and-one-minute-sync-design.md`

## Global Constraints

- Preserve retro 8-bit styling and cyberpunk aesthetic.
- Never ask for or store the club Gmail password.
- Follow strict TDD: write failing tests before modifying production code.
- Never display raw internal ID codes (`sty_...` or `st_...` hashes) to dancers in `NotificationWidget.tsx`.

## Review Focus

1. **Cached LocalStorage Bootstrap in Dancer Mode:** Even if a dancer's browser has an older cached `dancerBootstrap` in `localStorage` where `ev.styleIds` still contains all 4 event style IDs (`sty_n561KslQFj`, `sty_EAfjAzVOI7`, etc.), `NotificationWidget.tsx` must filter out any `stId` not in `dancerStylesMap` and never render `EAFJAZVOI7`.
2. **Upcoming & Practice Tabs Style Fallback:** If a session or video references a style ID not in `dancerStylesMap`, resolve via `adminStylesMap` (which includes `styles.list`) and fall back to `'Dance Class'` / `'Routine Practice'`, never raw ID codes.
3. **Mascot Notification Refresh on Auto-Sync:** When `useEventAutoSync` detects `changed.length > 0`, it must invalidate `'notification_members'` in addition to `'events'`, `'members'`, `'attendance'`, `'sessions'`, and `'bootstrap'`.
4. **Backend Scoped Event `styleIds`:** `getDancerBootstrap` in `api/src/features/bootstrap.ts` must return `styleIds` filtered by `eventStylesMap.get(e.id)` so dancers only receive their enrolled style IDs per event.
5. **1-Minute Cache & Throttle Consistency:** Frontend `INTERVAL_MS` (`60_000`) and backend `AUTO_SYNC_SECONDS` (`60`), `readEventMembers` (`60`), and `bootstrap.ts` caches (`60`) must all align to 1 minute.

---

### Task 1: Backend Scoped Dancer Event `styleIds` & 1-Minute Cache/Auto-Sync TTLs (TDD)

**Files:**
- Modify: `api/src/features/bootstrap.ts`
- Modify: `api/src/features/events.ts`
- Modify: `api/src/features/eventMembers.ts`
- Test: `api/test/features/bootstrap.test.ts`
- Test: `api/test/features/eventSync.test.ts`

**Interfaces:**
- Produces:
  - `getDancerBootstrap` returns `events` where each event's `styleIds` only contains IDs present in `eventStylesMap.get(e.id)`.
  - `AUTO_SYNC_SECONDS = 60` in `api/src/features/events.ts`.
  - 60-second cache TTLs in `api/src/features/eventMembers.ts` and `api/src/features/bootstrap.ts`.

- [ ] **Step 1: Write failing test in `api/test/features/bootstrap.test.ts`**
  In `it('dancer in Popping gets only Popping sessions, videos and music of their event')`, assert that `b.events[0].styleIds` equals `['st_popping']` (excluding `'st_hiphop'` which the dancer did not register for).

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -w api test/features/bootstrap.test.ts`
  Expected: FAIL because `b.events[0].styleIds` currently returns `['st_popping', 'st_hiphop']`.

- [ ] **Step 3: Implement backend changes in `bootstrap.ts`, `events.ts`, and `eventMembers.ts`**
  - In `api/src/features/bootstrap.ts`:
    - Update `events` mapping in `getDancerBootstrap` so `styleIds: (e.styleIds || []).filter(sId => eventStylesMap.get(e.id)?.has(sId))`.
    - Update `safeCachePut` TTLs in `getAdminBootstrap`, `loadDancerIndex`, `getDancerAttendance`, `getDancerChunk`, and `getDancerBootstrap` to `60`.
  - In `api/src/features/events.ts`:
    - Update `const AUTO_SYNC_SECONDS = 60;`.
  - In `api/src/features/eventMembers.ts`:
    - Update `safeCachePut(ctx.cache, cacheKey, JSON.stringify(members), 60);`.
  - Update test description in `api/test/features/eventSync.test.ts` (`second call within 1 minute skips`).

- [ ] **Step 4: Run API tests to verify they pass**
  Run: `npm test -w api test/features/bootstrap.test.ts test/features/eventSync.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add api/src/features/bootstrap.ts api/src/features/events.ts api/src/features/eventMembers.ts api/test/features/bootstrap.test.ts api/test/features/eventSync.test.ts
  git commit -m "feat(api): scope dancer bootstrap event styleIds and set 1-minute cache/sync TTLs"
  ```

---

### Task 2: Frontend Dancer Mascot Notification Style Filtering & 1-Minute Auto-Sync (TDD)

**Files:**
- Modify: `web/src/components/ui/NotificationWidget.tsx`
- Modify: `web/src/lib/useEventAutoSync.ts`
- Test: `web/src/components/ui/NotificationWidget.test.tsx`
- Test: `web/src/lib/useEventAutoSync.test.tsx`

**Interfaces:**
- Consumes: `dancerBootstrap` from `useBootstrap('dancer')`, `adminStylesMap` in `NotificationWidget.tsx`.
- Produces:
  - Dancer Mode `MY CLASSES` tab renders only enrolled styles with known names from `dancerStylesMap` and never renders raw ID codes (`sty_...` / `st_...`).
  - Dancer Mode `UPCOMING` and `PRACTICE` tabs resolve style names via `dancerStylesMap` and `adminStylesMap` without raw ID code fallbacks.
  - `useEventAutoSync` polls every `60_000` ms (1 minute) and invalidates `'notification_members'` on change.

- [ ] **Step 1: Write failing tests in `NotificationWidget.test.tsx` and `useEventAutoSync.test.tsx`**
  - In `web/src/components/ui/NotificationWidget.test.tsx`:
    - Add a test in Dancer Mode where an enrolled event has `styleIds: ['st_house', 'sty_EAfjAzVOI7', 'sty_50WspbOjYQ']` while `dancerBootstrap.styles` only has `[{ id: 'st_house', name: 'House' }]`. Assert that `'House'` is displayed in `MY CLASSES` and raw codes `'EAFJAZVOI7'` and `'50WSPBOJYQ'` are NOT in the document.
  - In `web/src/lib/useEventAutoSync.test.tsx`:
    - Update tests to advance timer by `60_000` ms (1 minute) instead of `600_000` ms and assert `'notification_members'` is included in invalidated query keys.

- [ ] **Step 2: Run tests to verify they fail**
  Run: `npm test -w web src/components/ui/NotificationWidget.test.tsx src/lib/useEventAutoSync.test.tsx`
  Expected: FAIL (`EAFJAZVOI7` is rendered in `NotificationWidget.test.tsx`, and `useEventAutoSync` does not fire at `60_000` ms).

- [ ] **Step 3: Implement changes in `NotificationWidget.tsx` and `useEventAutoSync.ts`**
  - In `web/src/components/ui/NotificationWidget.tsx`:
    - In Dancer Tab 1 (`my_classes`), filter `ev.styleIds` to only style IDs where `dancerStylesMap.get(stId)?.name` exists, and render `styleObj.name`.
    - In Dancer Tab 2 (`upcoming`), resolve `styleName` as `dancerStylesMap.get(ses.styleId)?.name || adminStylesMap.get(ses.styleId) || 'Dance Class'`.
    - In Dancer Tab 3 (`practice` / `groupedVideos`), resolve `styleName` as `st?.name || (vid.styleId ? adminStylesMap.get(vid.styleId) : '') || 'Routine Practice'`.
  - In `web/src/lib/useEventAutoSync.ts`:
    - Set `const INTERVAL_MS = 60_000;`.
    - Add `'notification_members'` to `REFRESHED_QUERIES`.

- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm test -w web src/components/ui/NotificationWidget.test.tsx src/lib/useEventAutoSync.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add web/src/components/ui/NotificationWidget.tsx web/src/components/ui/NotificationWidget.test.tsx web/src/lib/useEventAutoSync.ts web/src/lib/useEventAutoSync.test.tsx
  git commit -m "feat(web): remove raw style codes in dancer mascot notifications and poll autoSync every 1m"
  ```

---

### Task 3: Full Verification, Clasp Backend Deployment & Cloudflare Frontend Deployment

**Files:**
- None (build, deploy, and live verification)

- [ ] **Step 1: Run full test suites (`api` and `web`) and production build**
  Run: `npm test ; npm run build`
  Expected: All test suites pass and build succeeds with 0 errors.

- [ ] **Step 2: Deploy backend to Google Apps Script and push frontend to GitHub/Cloudflare**
  - Build and push Apps Script bundle and redeploy `AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA`.
  - Push commits to `origin main`.
  - Verify live `dancer.bootstrap` response for `Chan Da Hui` (`23005147`) confirms `styleIds` on `OCT MONTHLY CLASS` only contains enrolled styles (`sty_n561KslQFj`, `sty_LwUkVREwMz`).
