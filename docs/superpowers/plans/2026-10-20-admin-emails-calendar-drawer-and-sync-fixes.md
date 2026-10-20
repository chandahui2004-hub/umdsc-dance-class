# Admin Emails, Calendar Drawer, Dropdown Scroll & Form Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement individual Admin Notification Email cards with edit/delete popconfirm, a right-side drawer and hover tooltip for the calendar, custom retro pixel dropdowns with max-5 scrolling, remove default day/venue from dance styles, scope dancers style filter to the selected event, and purge removed form responses during sync so Freestyle matches 21 responses.

**Architecture:** 
- Backend: Update `eventImport.ts` and `events.ts` so full sync (`opts.full === true`) purges absent Google Form responses from the event's Members sheet, counts only active members, and re-evaluates slot capacity.
- Frontend: Build a reusable `PixelDropdown` component with 5-item max scroll, a slide-in `SideDrawer` for calendar day classes, date hover tooltips in `MonthCalendar`, multi-email card management with popconfirms in `SettingsPage`, cleanup `StylesPage` fields, and scope `MembersPage` styles to the current event.

**Tech Stack:** TypeScript, React, Tailwind CSS, TanStack Query, Vitest, Google Apps Script, Clasp.

**Spec:** `docs/superpowers/specs/2026-10-20-admin-emails-calendar-drawer-and-sync-fixes-design.md`

## Global Constraints
- Retro 8-bit neon pixel aesthetic (font-display, font-mono, font-body, pixel borders, glowing accents, no rounded pill designs).
- Every Google Drive link requires Editor permission for `umdancesportc@gmail.com`.
- Apps Script deployment ID: `AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA`.
- Test-driven development (TDD) for all logic changes; all existing 812+ tests must remain green.

## Review Focus
1. Email parsing: Handles ASCII commas, full-width Chinese commas (`，`), semicolons (`；`), whitespace, and newlines without creating blank or malformed email cards.
2. Form Sync member purge: Legitimate deletions in Google Form response sheet (e.g. 8 deleted rows in Freestyle) must be purged on SYNC NOW without breaking existing attendance ticks for retained dancers.
3. SideDrawer overlay behavior: Closes cleanly with Escape key, backdrop click, or close button; locks scroll via `useOverlayOpen`.
4. Dropdown scrolling: 5 items visible height on all screen sizes, arrow key navigation, closes on outside click.
5. Filter scoping: Switching events correctly resets or validates the selected dance style filter.

---

### Task 1: Backend Sync Member Purge & Active Member Count

**Skills:** `test-driven-development`, `systematic-debugging`

**Files:**
- Modify: `api/src/features/eventImport.ts`
- Modify: `api/src/features/events.ts`
- Test: `api/test/features/eventImport.test.ts`

**Interfaces:**
- Consumes: `importEventMembers(ctx, event, { full: true })`, `openSourceTab`, `buildEventMembers`
- Produces: Purged `Members` sheet with accurate `memberCount` matching active responses only.

- [x] **Step 1: Write the failing tests**
In `api/test/features/eventImport.test.ts`:
```typescript
it('purges removed responses during full sync and updates memberCount to active members', () => {
  // Event with 3 initial members
  const { event } = makeEvent([
    row('Dancer 1', '24001', ''),
    row('Dancer 2', '24002', ''),
    row('Dancer 3', '24003', '')
  ]);
  importEventMembers(ctx, event, { full: true });
  expect(fresh(event).memberCount).toBe(3);

  // Now source form has only 1 member (2 removed)
  updateSourceSheet([row('Dancer 1', '24001', '')]);
  importEventMembers(ctx, event, { full: true });

  const members = readEventMembers(ctx, fresh(event));
  expect(members.length).toBe(1);
  expect(fresh(event).memberCount).toBe(1);
});
```

- [x] **Step 2: Run test to verify it fails**
Run: `npm --workspace=@umdsc/api test api/test/features/eventImport.test.ts`
Expected: FAIL (memberCount remains 3 or removed rows still exist).

- [x] **Step 3: Implement member purging and active member count in `eventImport.ts`**
In `importEventMembers`:
- When `opts.full === true`, filter `body` to keep only rows present in `incoming` (or update/purge absent rows from `body`).
- Calculate `memberCount` from non-removed active rows:
  `const activeBody = body.filter(r => r[col('memberId')] && !String(r[col('flags')] || '').split(',').includes(REMOVED_FLAG));`
  `const memberCount = activeBody.length + added.length;`
- In `events.sync` and `events.autoSync`, ensure `opts.full === true` clears `lastSyncError` if the sync succeeds.

- [x] **Step 4: Run test to verify it passes**
Run: `npm --workspace=@umdsc/api test`
Expected: PASS (all tests pass).

- [x] **Step 5: Commit**
```bash
git add api/src/features/eventImport.ts api/src/features/events.ts api/test/features/eventImport.test.ts
git commit -m "fix(api): purge deleted form responses on full sync and count active members"
```

---

### Task 2: Admin Notification Emails Management UI

**Skills:** `ui-ux-pro-max`, `impeccable`, `test-driven-development`

**Files:**
- Modify: `web/src/features/settings/SettingsPage.tsx`
- Create: `web/src/features/settings/AdminEmailManager.tsx`
- Test: `web/src/features/settings/AdminEmailManager.test.tsx`

**Interfaces:**
- Consumes: `settings.adminNotificationEmails`, `settings.clubEmail`, `api.post('settings.set')`
- Produces: `<AdminEmailManager />` component with individual email cards, Add Email input, Edit inline, and Delete Popconfirm modal.

- [x] **Step 1: Write the failing tests**
In `web/src/features/settings/AdminEmailManager.test.tsx`:
- Test parsing multiple emails separated by comma, full-width comma, space, semicolon, newline.
- Test rendering 4 distinct email cards for `charlotteyee923@gmail.com, zhihan260805@gmail.com, 24078221@siswa.um.edu.my, vernicedingjiemin@gmail.com`.
- Test adding a new email calls `onSave`.
- Test clicking Delete opens the Popconfirm modal; confirming triggers delete.

- [x] **Step 2: Run test to verify it fails**
Run: `npm --workspace=@umdsc/web test AdminEmailManager`
Expected: FAIL (component not found).

- [x] **Step 3: Implement `AdminEmailManager.tsx` and integrate into `SettingsPage.tsx`**
- Normalize string parsing: `emailsRaw.split(/[,，;；\n\s]+/).map(s => s.trim()).filter(Boolean)`.
- Render list of cards: each email has `font-mono`, green live indicator, EDIT button, DELETE button.
- Delete Popconfirm: Retro pixel modal asking *"Delete notification email {email}? You can re-add it anytime."* with buttons `CONFIRM DELETE` (danger) and `CANCEL`.
- Add Bar: Input field with `ADD EMAIL` button supporting single or multiple delimited entries.
- Wire into `SettingsPage.tsx`.

- [x] **Step 4: Run test to verify it passes**
Run: `npm --workspace=@umdsc/web test AdminEmailManager`
Expected: PASS.

- [x] **Step 5: Commit**
```bash
git add web/src/features/settings/AdminEmailManager.tsx web/src/features/settings/AdminEmailManager.test.tsx web/src/features/settings/SettingsPage.tsx
git commit -m "feat(web): add individual admin email cards with edit and delete popconfirm"
```

---

### Task 3: Custom Retro Pixel Dropdown Component

**Skills:** `ui-styling`, `impeccable`, `test-driven-development`

**Files:**
- Create: `web/src/components/ui/PixelDropdown.tsx`
- Test: `web/src/components/ui/PixelDropdown.test.tsx`

**Interfaces:**
- Produces: `PixelDropdown<{ value: string; label: string; group?: string }>`
- Props: `value`, `onChange`, `options`, `placeholder`, `disabled`, `ariaLabel`, `maxVisibleItems?: number` (default: 5)

- [x] **Step 1: Write the failing tests**
In `web/src/components/ui/PixelDropdown.test.tsx`:
- Test renders current label and closed menu initially.
- Test clicking trigger button opens menu.
- Test menu has `max-h-[200px]` and `overflow-y-auto pixel-scrollbar`.
- Test selecting an item fires `onChange` and closes menu.
- Test pressing Escape closes menu.

- [x] **Step 2: Run test to verify it fails**
Run: `npm --workspace=@umdsc/web test PixelDropdown`
Expected: FAIL (component not found).

- [x] **Step 3: Implement `PixelDropdown.tsx`**
- Retro pixel button with downward indicator `▼`.
- Dropdown container with `border-2 border-[var(--outline)] bg-[var(--night-2)] shadow-[4px_4px_0_var(--outline)]`.
- Style container height to show max 5 items: `max-h-[200px] overflow-y-auto pixel-scrollbar`.
- Click-outside detection and keyboard navigation.

- [x] **Step 4: Run test to verify it passes**
Run: `npm --workspace=@umdsc/web test PixelDropdown`
Expected: PASS.

- [x] **Step 5: Commit**
```bash
git add web/src/components/ui/PixelDropdown.tsx web/src/components/ui/PixelDropdown.test.tsx
git commit -m "feat(ui): create PixelDropdown component with max 5 scrollable items"
```

---

### Task 4: Integrate PixelDropdown in Step I & Step II Navigation

**Skills:** `ui-ux-pro-max`, `test-driven-development`

**Files:**
- Modify: `web/src/components/ui/EventStyleSteps.tsx`
- Test: `web/src/components/ui/EventStyleSteps.test.tsx` (create or update)

**Interfaces:**
- Consumes: `PixelDropdown` from Task 3
- Produces: `EventStep` and `StyleStep` with scrollable 5-item max lists.

- [x] **Step 1: Write the failing tests**
- Verify `EventStep` uses `PixelDropdown` for event selection.
- Verify `StyleStep` provides a dropdown selection when styles list is presented.

- [x] **Step 2: Run test to verify it fails**
Run: `npm --workspace=@umdsc/web test EventStyleSteps`
Expected: FAIL.

- [x] **Step 3: Implement `PixelDropdown` in `EventStyleSteps.tsx`**
- In `EventStep`: replace `<select>` with `<PixelDropdown options={eventOptions} value={...} onChange={...} />`.
- In `StyleStep`: provide `<PixelDropdown options={styleOptions} value={...} onChange={...} />` alongside/in place of horizontal buttons.

- [x] **Step 4: Run test to verify it passes**
Run: `npm --workspace=@umdsc/web test EventStyleSteps`
Expected: PASS.

- [x] **Step 5: Commit**
```bash
git add web/src/components/ui/EventStyleSteps.tsx web/src/components/ui/EventStyleSteps.test.tsx
git commit -m "feat(ui): update EventStep and StyleStep to use scrollable PixelDropdown"
```

---

### Task 5: Calendar Class Hover Tooltip

**Skills:** `ui-ux-pro-max`, `impeccable`, `test-driven-development`

**Files:**
- Modify: `web/src/components/ui/MonthCalendar.tsx`
- Test: `web/src/components/ui/MonthCalendar.test.tsx`

**Interfaces:**
- Consumes: `CalendarMark`, `marks` prop on `MonthCalendar`
- Produces: Hover tooltip displaying class name, time, instructor when mouse moves near/over a date tile.

- [x] **Step 1: Write the failing tests**
In `MonthCalendar.test.tsx`:
- Test hovering over a calendar date tile with class marks renders tooltip with class details.

- [x] **Step 2: Run test to verify it fails**
Run: `npm --workspace=@umdsc/web test MonthCalendar`
Expected: FAIL.

- [x] **Step 3: Implement hover tooltip in `MonthCalendar.tsx`**
- Add `hoveredDate` state or hover listener to date tiles with marks.
- Position a floating pixel tooltip near the date tile with class name, time, and instructor.
- Style with `px-panel bg-[var(--night-1)] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)] p-2 text-xs font-mono pointer-events-none z-50`.

- [x] **Step 4: Run test to verify it passes**
Run: `npm --workspace=@umdsc/web test MonthCalendar`
Expected: PASS.

- [x] **Step 5: Commit**
```bash
git add web/src/components/ui/MonthCalendar.tsx web/src/components/ui/MonthCalendar.test.tsx
git commit -m "feat(ui): add calendar class hover tooltip with instructor and time"
```

---

### Task 6: Calendar Selected Date Class Side Drawer

**Skills:** `ui-ux-pro-max`, `impeccable`, `test-driven-development`

**Files:**
- Create: `web/src/components/ui/SideDrawer.tsx`
- Modify: `web/src/features/calendar/DaySheet.tsx`
- Modify: `web/src/features/calendar/DancerHome.tsx`
- Modify: `web/src/features/classes/ClassesPage.tsx`
- Test: `web/src/components/ui/SideDrawer.test.tsx`

**Interfaces:**
- Produces: `<SideDrawer isOpen={boolean} onClose={fn} title={string} />`
- Updates `DaySheet` and `ClassesPage` to slide in from the right edge on desktop and mobile.

- [x] **Step 1: Write the failing tests**
In `web/src/components/ui/SideDrawer.test.tsx`:
- Test drawer renders at right edge with slide-in animation when `isOpen={true}`.
- Test close button and backdrop click fire `onClose`.
- Test Escape key fires `onClose`.

- [x] **Step 2: Run test to verify it fails**
Run: `npm --workspace=@umdsc/web test SideDrawer`
Expected: FAIL (component not found).

- [x] **Step 3: Implement `SideDrawer.tsx` and integrate into `DaySheet.tsx` and `ClassesPage.tsx`**
- `SideDrawer`: `fixed right-0 top-0 bottom-0 w-full max-w-md bg-[var(--night-2)] border-l-2 border-[var(--neon-cyan)] shadow-[-4px_0_0_var(--outline)] z-[var(--z-overlay)]`.
- In `DaySheet.tsx`: Use `SideDrawer` instead of centered popup modal.
- In `ClassesPage.tsx`: When `selectedDate` is set on calendar, display classes in `SideDrawer` (with option to pin or dismiss).

- [x] **Step 4: Run test to verify it passes**
Run: `npm --workspace=@umdsc/web test SideDrawer`
Expected: PASS.

- [x] **Step 5: Commit**
```bash
git add web/src/components/ui/SideDrawer.tsx web/src/components/ui/SideDrawer.test.tsx web/src/features/calendar/DaySheet.tsx web/src/features/calendar/DancerHome.tsx web/src/features/classes/ClassesPage.tsx
git commit -m "feat(ui): replace calendar class popup with slide-in right side drawer"
```

---

### Task 7: Dance Styles Master Data Cleanup

**Skills:** `code-simplifier`, `test-driven-development`

**Files:**
- Modify: `web/src/features/masterdata/StylesPage.tsx`
- Test: `web/src/features/masterdata/StylesPage.test.tsx` (create or update)

**Interfaces:**
- Produces: `StylesPage` with `defaultWeekday`, `defaultVenue`, and start/end times removed from UI.

- [x] **Step 1: Write the failing tests**
- Verify Create and Edit modals do not render Default Day or Default Venue inputs.
- Verify Style cards do not display default schedule or venue text.

- [x] **Step 2: Run test to verify it fails**
Run: `npm --workspace=@umdsc/web test StylesPage`
Expected: FAIL.

- [x] **Step 3: Remove default schedule and venue from `StylesPage.tsx`**
- Remove `defaultWeekday`, `defaultVenue`, `defaultStart`, `defaultEnd` form inputs.
- Remove schedule/venue display from Style cards.

- [x] **Step 4: Run test to verify it passes**
Run: `npm --workspace=@umdsc/web test StylesPage`
Expected: PASS.

- [x] **Step 5: Commit**
```bash
git add web/src/features/masterdata/StylesPage.tsx
git commit -m "refactor(web): remove default day and venue from dance styles master data"
```

---

### Task 8: Dancers Page Dance Style Filter Scoped to Selected Event

**Skills:** `code-simplifier`, `test-driven-development`

**Files:**
- Modify: `web/src/features/members/MembersPage.tsx`
- Test: `web/src/features/members/MembersPage.test.tsx`

**Interfaces:**
- Produces: `MembersPage` passing only `event.styleIds` styles to `StyleStep`.

- [x] **Step 1: Write the failing tests**
In `MembersPage.test.tsx`:
- When an event is selected that only has Popping, verify `StyleStep` only displays Popping and not unrelated styles (Locking, Latin, etc.).

- [x] **Step 2: Run test to verify it fails**
Run: `npm --workspace=@umdsc/web test MembersPage`
Expected: FAIL.

- [x] **Step 3: Implement filtered styles in `MembersPage.tsx`**
- Compute `eventStyles`: when `event` is selected, filter `(bootstrap?.styles || [])` by `event.styleIds`.
- Pass `styles={eventStyles}` into `<StyleStep />`.

- [x] **Step 4: Run test to verify it passes**
Run: `npm --workspace=@umdsc/web test MembersPage`
Expected: PASS.

- [x] **Step 5: Commit**
```bash
git add web/src/features/members/MembersPage.tsx web/src/features/members/MembersPage.test.tsx
git commit -m "fix(web): filter dancers page style selector to selected event styles"
```

---

### Task 9: Full Verification, Clasp Push & Cloudflare Deployment

**Skills:** `verification-before-completion`, `finishing-a-development-branch`

**Files:**
- Verify: Full test suite (`api/`, `web/`, `shared/`)
- Build: Full project (`npm run build`)
- Deploy Backend: `npm run push` in `api/` + `npx clasp update-deployment AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA`
- Deploy Frontend: `git push origin main`

- [x] **Step 1: Run all test suites**
Run: `npm test`
Expected: PASS (all tests pass).

- [x] **Step 2: Run production build**
Run: `npm run build`
Expected: PASS.

- [x] **Step 3: Deploy backend to Google Apps Script**
Run: `cd api && npm run push && npx clasp update-deployment AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA`
Expected: PASS with version bump.

- [x] **Step 4: Commit and push to main for Cloudflare Workers**
Run: `git push origin main`
Expected: Successfully pushed to `origin/main`.
