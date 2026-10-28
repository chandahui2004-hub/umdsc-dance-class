# Dancer Mascot Style Names & 1-Minute Google Sheet Cache/Refresh — Design Spec

**Date:** 2026-10-28
**Status:** Draft for Review

## 1. Problem Statement

1. **Raw Dance Style ID Codes in Dancer Mode Mascot Notification:**
   - When a dancer opens the floating Mascot Notification Center in Dancer Mode (`MY CLASSES` tab), each enrolled event card renders badges for `ev.styleIds`.
   - `getDancerBootstrap` in `api/src/features/bootstrap.ts` returned all `e.styleIds` configured on the event (e.g., `["sty_n561KslQFj", "sty_EAfjAzVOI7", "sty_50WspbOjYQ", "sty_LwUkVREwMz"]`), whereas `dancerBootstrap.styles` only included the `DanceStyle` records the dancer actually enrolled in (e.g., `Locking` and `Latin`).
   - In `web/src/components/ui/NotificationWidget.tsx`, for any `stId` not present in `dancerStylesMap`, the code fell back to `stId.replace('sty_', '').toUpperCase()`, displaying raw internal ID codes such as `EAFJAZVOI7` and `50WSPBOJYQ` alongside the dancer's real style names.
   - Similar `.replace('sty_', '').toUpperCase()` fallbacks existed in the Dancer `UPCOMING` and `PRACTICE` tabs.

2. **10-Minute Google Drive / Response Sheet Cache & Refresh Delay:**
   - The frontend auto-sync hook (`web/src/lib/useEventAutoSync.ts`) only polled `events.autoSync` every 10 minutes (`INTERVAL_MS = 600_000`) and did not invalidate `'notification_members'`.
   - The backend `events.autoSync` route (`api/src/features/events.ts`) throttled checks per event for 10 minutes (`AUTO_SYNC_SECONDS = 600`).
   - Backend caches for event members (`api/src/features/eventMembers.ts`) and bootstrap/member-index/attendance (`api/src/features/bootstrap.ts`) used 5–10 minute TTLs (`300`–`600` seconds).
   - The owner requires a **1-minute (60s)** cache and refresh cycle across both frontend and backend so changes in Google Drive / Google Form response sheets appear within 1 minute.

---

## 2. Design & Architecture

### 2.1 Remove Raw Dance Style ID Codes in Dancer Mode
1. **Backend (`api/src/features/bootstrap.ts`):**
   - In `getDancerBootstrap`, scope each event's `styleIds` in `result.events` to only the styles the dancer is enrolled in for that event:
     `styleIds: (e.styleIds || []).filter(sId => eventStylesMap.get(e.id)?.has(sId))`
2. **Frontend (`web/src/components/ui/NotificationWidget.tsx`):**
   - In Dancer `MY CLASSES` tab (`dancerTab === 'my_classes'`), only render style badges for `stId` values that resolve to a known enrolled `DanceStyle` in `dancerStylesMap` (and if sessions exist for that event in `dancerBootstrap.sessions`, or `dancerStylesMap.has(stId)`, display `styleObj.name`). Never fall back to `stId.replace('sty_', '').toUpperCase()`.
   - In Dancer `UPCOMING` (`dancerTab === 'upcoming'`) and `PRACTICE` (`dancerTab === 'practice'`) tabs, resolve style names via `dancerStylesMap.get(styleId)?.name || adminStylesMap.get(styleId)` and fall back to `'Dance Class'` / `'Routine Practice'` rather than raw ID codes (`sty_...` / `st_...`).

### 2.2 1-Minute (60s) Cache & Auto-Sync Refresh
1. **Frontend (`web/src/lib/useEventAutoSync.ts`):**
   - Change `INTERVAL_MS` from `600_000` (10 minutes) to `60_000` (1 minute).
   - Add `'notification_members'` to `REFRESHED_QUERIES` (`['events', 'members', 'attendance', 'sessions', 'bootstrap', 'notification_members']`) so mascot notifications immediately refresh when `events.autoSync` detects sheet changes.
2. **Backend (`api/src/features/events.ts`, `api/src/features/eventMembers.ts`, `api/src/features/bootstrap.ts`):**
   - In `api/src/features/events.ts`: change `AUTO_SYNC_SECONDS` from `600` to `60`.
   - In `api/src/features/eventMembers.ts`: change `readEventMembers` cache TTL from `600` to `60`.
   - In `api/src/features/bootstrap.ts`: change cache TTLs in `getAdminBootstrap` (`600` → `60`), `loadDancerIndex` (`600` → `60`), `getDancerAttendance` (`600` → `60`), `getDancerChunk` (`600` → `60`), and `getDancerBootstrap` (`300` → `60`).

---

## 3. Verification Criteria
- Unit tests in `web/src/components/ui/NotificationWidget.test.tsx` verify that Dancer Mode `MY CLASSES`, `UPCOMING`, and `PRACTICE` tabs show only human-readable enrolled dance style names and never render raw `sty_...` / `st_...` ID codes.
- Unit tests in `web/src/lib/useEventAutoSync.test.tsx` verify 1-minute (`60_000` ms) polling and `'notification_members'` invalidation.
- Unit tests in `api/test/features/bootstrap.test.ts` and `api/test/features/eventSync.test.ts` verify scoped `styleIds` on `dancer.bootstrap` events and 60s cache/sync behavior.
- Both `api` (clasp deploy) and `web` (Cloudflare Workers via `git push origin main`) are deployed and verified against live endpoints.
