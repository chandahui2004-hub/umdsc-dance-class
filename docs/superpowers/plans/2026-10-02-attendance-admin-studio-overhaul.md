# Attendance Auto-Healing, Admin Navigation & Studio Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement auto-healing attendance pipelines, restructure admin navigation (collapsible More menu, folder links realignment, and deduplicated fullscreen dancer roster), and overhaul Dancer Studio (maximized space, interactive loop/timeline bug fixes, and fullscreen mode with a floating HUD).

**Architecture:** Auto-heal unprovisioned attendance sheets in `attendance.get` and dynamically resolve registered styles across events in `getDancerAttendance`. Restructure navigation in `routes.tsx`, `Sidebar.tsx`, and `TabBar.tsx` to support a 6-item collapsible "More" menu and relocate folder settings to their respective pages. Enhance `MembersPage.tsx` with multi-event deduplication and fullscreen scrolling. Overhaul `AudioPlayer.tsx` and `VideoTimeline.tsx` with dedicated drag handles and click behaviors, and build a Fullscreen HUD in `Studio.tsx`.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, Vitest, Node.js.

**Spec:** [`docs/superpowers/specs/2026-10-02-attendance-admin-studio-overhaul-design.md`](file:///c:/Users/user/Downloads/UMDSC%20Design/UMDSC%20Dance%20Class%20System/docs/superpowers/specs/2026-10-02-attendance-admin-studio-overhaul-design.md)

## Global Constraints

- Preserve 8-bit retro theme (`--c-ink`, `--c-panel`, `--c-yellow`, `--c-peach`, `--c-navy`, etc.) and `Press Start 2P` styling.
- Do not use TailwindCSS or utility replacements that break retro pixel-art aesthetic.
- Zero placeholder or TODO comments; full implementation code only.
- Stop at every owner action step if any external permissions are required.

## Review Focus

1. `attendance.get` when no attendance sheet exists in Google Drive: must not throw; must auto-provision or fall back to registered event members so the admin roster is never blank.
2. Dancer attendance for events without cached `eventStyles`: must dynamically read member registrations so attendance reflects enrolled classes.
3. Mobile "More" menu interaction: must open cleanly as a responsive drawer/sheet without overflowing bottom viewport.
4. Dragging loop handle in `AudioPlayer`: must never fail to drag for small loop ranges (e.g. < 5s) and must clearly show live drag tooltips.
5. Dragging start flag in `VideoTimeline`: must never trigger the parent click handler to seek video playback.

---

### Task 1: Attendance Pipeline Auto-Healing & Style Resolution

**Files:**
- Modify: `api/src/features/attendance.ts:50-107`
- Modify: `api/src/features/bootstrap.ts:85-200`
- Test: `api/test/features/attendance.test.ts`
- Test: `api/test/features/bootstrap.test.ts`

**Interfaces:**
- Consumes: `ensureEventSheets(ctx, event)`, `readEventMembers(ctx, event)`, `dancerStylesInEvent(ctx, event, matricKey)`.
- Produces: Robust `attendance.get` returning valid member rosters even if sheet records were missing; `dancer.attendance` returning records for all active event styles.

- [ ] **Step 1: Write failing test in `api/test/features/attendance.test.ts` for auto-healing missing attendance sheet**

```ts
it('attendance.get auto-heals missing attendance sheet and returns enrolled members', () => {
  const event = addEvent('evt_autoheal', 'Autoheal Event', ['st_popping']);
  // Member registered in event, but no attendanceSheet row in DB
  const res = handleRequest({ action: 'attendance.get', token: adminToken, eventId: event.id, styleId: 'st_popping' }, ctx, secrets);
  expect(res.data.sessions.length).toBeGreaterThan(0);
  expect(res.data.members.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix api test -- api/test/features/attendance.test.ts`
Expected: FAIL (missing sheet returns `members: []` or throws)

- [ ] **Step 3: Implement auto-healing in `api/src/features/attendance.ts` and dynamic fallback in `api/src/features/bootstrap.ts`**

In `attendance.get`:
- If `!rec`, call `ensureEventSheets(ctx, getEvent(ctx, eventId))` or fall back to `readEventMembers(ctx, event).filter(m => m.styleIds.includes(styleId))`.
- Populate `grid.members` with enrolled members even if the sheet was newly created.

In `bootstrap.ts` (`resolveDancerEventStyles` & `getDancerAttendance`):
- When `stored` is empty or missing, call `dancerStylesInEvent(ctx, event, matricKey)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix api test -- api/test/features/attendance.test.ts api/test/features/bootstrap.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/features/attendance.ts api/src/features/bootstrap.ts api/test/features/attendance.test.ts api/test/features/bootstrap.test.ts
git commit -m "feat(api): auto-heal attendance sheets and resolve dancer styles dynamically"
```

---

### Task 2: Admin Navigation Restructure & Folder Link Realignment

**Files:**
- Modify: `web/src/app/routes.tsx`
- Modify: `web/src/components/ui/Sidebar.tsx`
- Modify: `web/src/components/ui/TabBar.tsx`
- Modify: `web/src/features/attendance/AttendancePage.tsx`
- Modify: `web/src/features/media/MediaPage.tsx`
- Modify: `web/src/features/events/EventsPage.tsx`
- Test: `web/src/app/routes.test.tsx` (or new navigation unit test)

**Interfaces:**
- Consumes: Navigation tab definitions, `FolderRow` component from `features/events/FolderLinksHeader.tsx`.
- Produces: Streamlined `ADMIN_TABS` (Calendar, Attendance, Media, Dancers, More trigger) with expandable 6-item menu, and relocated master folder configuration.

- [ ] **Step 1: Write test for new admin navigation structure**

Create or update test verifying that `Today` is absent from `ADMIN_TABS`, `Dancers` is present, `Events` is inside the expandable "More" list, and `/admin` defaults to `/admin/calendar`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web test -- web/src/app/routes.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement admin navigation changes & folder settings realignment**

1. In `web/src/app/routes.tsx`:
   - Remove Today tab; add Dancers (`/admin/members`) tab.
   - Redirect `/admin/today` and fallback `*` to `/admin/calendar`.
2. In `web/src/components/ui/Sidebar.tsx`:
   - Add expandable "More" accordion button displaying the 6 sub-items:
     - Dance Styles (`/admin/styles`)
     - Instructors (`/admin/instructors`)
     - Roles & Permissions (`/admin/roles`)
     - Admin Accounts (`/admin/admins`)
     - System Settings (`/admin/settings`)
     - Events (`/admin/events`)
3. In `web/src/components/ui/TabBar.tsx`:
   - Add "More" trigger button that toggles a mobile drawer containing the 6 sub-items.
4. Move Master Attendance Folder configuration to `web/src/features/attendance/AttendancePage.tsx`.
5. Move Master Video Folder configuration to `web/src/features/media/MediaPage.tsx`.
6. Remove `FolderLinksHeader` from `web/src/features/events/EventsPage.tsx`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/app/routes.tsx web/src/components/ui/Sidebar.tsx web/src/components/ui/TabBar.tsx web/src/features/attendance/AttendancePage.tsx web/src/features/media/MediaPage.tsx web/src/features/events/EventsPage.tsx
git commit -m "feat(web): restructure admin navigation with expandable More menu and realign folder links"
```

---

### Task 3: Registered Dancers Multi-Event Roster & Fullscreen Mode

**Files:**
- Modify: `web/src/features/members/MembersPage.tsx`
- Test: `web/src/features/members/MembersPage.test.tsx`

**Interfaces:**
- Consumes: `useCurrentEvent()`, `call('members.list', { eventId })`.
- Produces: Aggregated and deduplicated dancer view when "ALL EVENTS" is active, with fullscreen modal/overlay mode and custom retro scrollbar.

- [ ] **Step 1: Write failing test in `web/src/features/members/MembersPage.test.tsx` for combined deduplication**

```tsx
it('combines and deduplicates dancers across events when isAll is true', async () => {
  // Mock members across two events with same matricKey
  // Expect dancer to appear once with badges for both events/styles
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web test -- web/src/features/members/MembersPage.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement multi-event aggregation, deduplication & Fullscreen mode in `MembersPage.tsx`**

1. If `isAll`: query members across all `events`, deduplicate by `m.matricKey`, merging their `styleNames` and event names into combined tag badges.
2. Add `[⛶ FULLSCREEN]` button that toggles fullscreen view (`fixed inset-0 z-50 bg-[var(--c-bg)] p-4 flex flex-col`).
3. Add a retro scrollbar class (`overflow-y-auto max-h-[calc(100vh-140px)]`) with sticky table headers and quick search filter.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test -- web/src/features/members/MembersPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/features/members/MembersPage.tsx web/src/features/members/MembersPage.test.tsx
git commit -m "feat(web): add combined multi-event deduplication and fullscreen mode to registered dancers"
```

---

### Task 4: Studio Looping & Timeline Interaction Fixes

**Files:**
- Modify: `web/src/features/music-studio/dancecue/components/AudioPlayer.tsx`
- Modify: `web/src/features/music-studio/sync/VideoTimeline.tsx`
- Test: `web/src/features/music-studio/dancecue/components/AudioPlayer.test.tsx`
- Test: `web/src/features/music-studio/sync/VideoTimeline.test.tsx`

**Interfaces:**
- Consumes: `AudioPlayerProps`, `VideoTimelineProps`.
- Produces: Reliable dragging for start, end, and center loop ranges with tooltips; separated pointer event handling preventing start flag clicks from seeking video progress; single-click nearest point move vs double-click seek when loop is active.

- [ ] **Step 1: Write failing test for loop dragging precision and click behaviors**

Test:
- Dragging a 4-second loop in `AudioPlayer` moves the entire range.
- Single-click when loop mode is active updates nearest loop boundary.
- Double-click seeks playback.
- Flag drag in `VideoTimeline` does not fire `onSeek`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix web test -- AudioPlayer VideoTimeline`
Expected: FAIL

- [ ] **Step 3: Implement interaction fixes in `AudioPlayer.tsx` and `VideoTimeline.tsx`**

1. In `AudioPlayer.tsx`:
   - Replace broad `edgeGrabDistance` with 3 dedicated interactive elements: left handle, right handle, center span.
   - Display a floating drag tooltip with current timestamp and total duration range.
   - On single-click while loop mode is active: calculate distance to `markerDraftRange.start` vs `end`, move the closest point to `pointerTime`, and apply a pulsating CSS animation.
   - On double-click: trigger `onSeek(pointerTime)`.
2. In `VideoTimeline.tsx`:
   - Use `pointerCapture` or drag state flag on the start flag.
   - Call `e.stopPropagation()` and record `isDraggingFlag = true` to prevent `handleBarClick` from triggering on flag release.
   - Display live tooltip above flag showing `Start: MM:SS.t`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test -- AudioPlayer VideoTimeline`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/features/music-studio/dancecue/components/AudioPlayer.tsx web/src/features/music-studio/sync/VideoTimeline.tsx web/src/features/music-studio/dancecue/components/AudioPlayer.test.tsx web/src/features/music-studio/sync/VideoTimeline.test.tsx
git commit -m "fix(studio): resolve loop dragging bugs, flag collision, and click seek interactions"
```

---

### Task 5: Studio Space Maximization & Fullscreen Mode with Floating HUD

**Files:**
- Modify: `web/src/features/music-studio/Studio.tsx`
- Create: `web/src/features/music-studio/FullscreenStudio.tsx`
- Test: `web/src/features/music-studio/FullscreenStudio.test.tsx`

**Interfaces:**
- Consumes: Player engine, video sync engine, speech commands hook.
- Produces: Space-maximized studio layout and full-viewport mode displaying single priority video, stacked progress bars, and a draggable floating HUD pill.

- [ ] **Step 1: Write test for `FullscreenStudio`**

Test:
- When dance video is present, only dance video is rendered (YouTube player is suppressed).
- Floating HUD renders Play/Pause, Loop toggle, duration label, Set In/Out, and Exit Fullscreen.
- Voice commands remain initialized.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web test -- FullscreenStudio`
Expected: FAIL (file not found)

- [ ] **Step 3: Implement `FullscreenStudio.tsx` and integrate into `Studio.tsx`**

1. In `Studio.tsx`:
   - Remove restrictive `max-w-[560px] lg:max-w-[760px]` wrapper and excessive padding.
   - Add a `[⛶ FULLSCREEN]` action button in the studio header.
2. In `FullscreenStudio.tsx`:
   - Render fixed full-viewport container (`fixed inset-0 z-50 bg-[#101114] flex flex-col p-3`).
   - Top area: single video display (Dance Video if available; YouTube player fallback; never both).
   - Below video: stacked Music progress bar and Video progress bar with labels.
   - Draggable floating HUD pill with pointer drag listeners:
     - Drag handle with title `LOOP HUD [::]`
     - Play / Pause button
     - Loop toggle with pulsating border
     - Range label (e.g. `12.4s [0:24 - 0:36]`)
     - Set In [A] & Set Out [B] buttons
     - Speed selector
     - Exit Fullscreen [✕]
   - Keep `useSpeechCommands` active in the background without rendering the UI card.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test -- FullscreenStudio Studio`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/features/music-studio/Studio.tsx web/src/features/music-studio/FullscreenStudio.tsx web/src/features/music-studio/FullscreenStudio.test.tsx
git commit -m "feat(studio): add space maximization and fullscreen mode with draggable floating HUD"
```

---

### Task 6: End-to-End System Verification & Polish

**Files:**
- Test: Run full API and Web test suites (`npm test` in root/api/web)
- Verify in browser: Check admin navigation, attendance auto-healing, combined registered dancers, and studio fullscreen.

- [ ] **Step 1: Run complete API test suite**

Run: `npm --prefix api test`
Expected: All tests pass.

- [ ] **Step 2: Run complete Web test suite**

Run: `npm --prefix web test`
Expected: All tests pass.

- [ ] **Step 3: Run web production build check**

Run: `npm --prefix web run build`
Expected: Build succeeds with 0 errors.

- [ ] **Step 4: Final commit & tag**

```bash
git commit --allow-empty -m "chore: complete attendance, admin navigation, and studio overhaul"
```
