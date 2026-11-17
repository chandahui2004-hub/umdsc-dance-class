# Admin Dancer & Class Enrollment Management, Automatic Attendance/Database Cleanup & Google Form Reopen with Add-On Slots — Design Spec

**Date:** 2026-11-17  
**Supervisor:** Gemini 4 Argon (High)  
**Subagents (Implementers & Reviewers):** Gemini 4 Hydrogen (`Model: 'pro'`)  
**Execution Method:** `superpowers:subagent-driven-development`

---

## 1. Problem Statement & Root Cause Analysis

1. **Missing Direct Admin Dancer & Class Enrollment Management on the Website:**
   - Currently, `EditDancerDialog.tsx` only allows editing 6 personal metadata fields (`fullName`, `matricRaw`, `contact`, `email`, `gender`, `nationality`) and states *"Dance classes can only be changed in the form."*
   - Admins cannot add a new dancer directly on the Dancers page (`/admin/members`), cannot add/change/drop a dancer's enrolled dance classes (`styleIds`) on the website, and cannot remove a dancer who quit an event directly from the website.
2. **Ghost Rows Remaining in Attendance & Database After a Dancer Changes/Drops a Class or Quits an Event:**
   - In `api/src/features/eventSheets.ts` (`ensureEventSheets`, lines 280–292):
     - Cleanup computed `const listed = new Set(members.map(m => m.memberId))` across **all** members of the event (including dancers enrolled in *other* dance styles and dancers only flagged `removed-from-form`), instead of scoping to `styleMembers` (the active, non-removed dancers enrolled in **that specific style**).
     - Line 287 skipped clearing any row where `classCols.some(c => row[c])` was truthy (keeping any dancer with a past `/` attendance tick forever) and skipped cleanup completely when `members.length === 0`.
   - In `api/src/features/attendance.ts` (`attendance.get`, lines 116–125):
     - `attendance.get` returned every non-empty row in the `Attendance` sheet without filtering against the event's active enrolled `styleMembers` for `styleId`.
   - In `api/src/features/eventImport.ts` (`dropEventFromIndex`, lines 259–268):
     - Removing `event.id` from `entry.eventIds` left the `MemberIndex` record `active: true` even when `entry.eventIds.length === 0`, and `members.edit` / `members.selfEdit` ran `importEventMembers(..., { full: true })` without `purgeRemoved: true`.
3. **Slot Capacity Override & Reopening Closed Classes / Google Forms:**
   - When an admin overrides a full class slot limit by manually adding a dancer or switching a dancer into a full class on `/admin/members`, the Google Form / full style option must **remain closed** (never auto-reopening due to admin website override).
   - When an admin wants to reopen a full class or a capacity-closed Google Form, they need a dedicated **`REOPEN / + SLOTS`** button on the Event Card (`/admin/events`) with a custom 8-bit pixel icon (`<PixelUnlockIcon />`) that requires entering **`+N` Add-On Slots (`>= 1`)**, increases the style's slot capacity to `Math.max(currentSlotLimit, currentEnrolledCount) + addOnSlots`, re-arms slot capacity notifications, restores the style choice on the Google Form, and reopens the Google Form immediately.

---

## 2. Architecture & Data Flow

### 2.1 Response-Sheet-First Single Source of Truth
Because background `warmCaches` (every 5 minutes) and `events.autoSync` (every 60 seconds) continuously synchronize from each event's Google Form Response Sheet, every admin dancer/class mutation (`members.add`, `members.edit`, `members.remove`) **writes to the event's Google Form Response Sheet first**, then immediately executes `importEventMembers(ctx, event, { full: true, purgeRemoved: true })` inside the script lock.

### 2.2 Automatic Attendance Sheet & `MemberIndex` Cleanup
1. **Per-Style Attendance Sheet Pruning (`ensureEventSheets` in `api/src/features/eventSheets.ts`):**
   - Filter `activeMembers = members.filter(m => !(m.flags || []).includes('removed') && !(m.flags || []).includes('removed-from-form'))`.
   - For each `styleId` in `event.styleIds`, compute `styleMembers = activeMembers.filter(m => isMemberEnrolledInStyle(m, styleId, allStyles))` and `enrolledStyleMemberIds = new Set(styleMembers.map(m => m.memberId))`.
   - For every existing row (`i >= 2`) in that style's `Attendance` sheet where `row[idCol]` is non-empty and `!enrolledStyleMemberIds.has(row[idCol])`:
     - Unconditionally clear the row (`sheet.setValues(i + 1, 1, [keyRow.map(() => '')])`, `row[idCol] = ''`) **regardless of whether `classCols` had prior `/` ticks or whether `styleMembers.length === 0`**.
     - Call `bumpAttendanceVersion(ctx, current.id, styleId)` whenever any row is cleared or added so cached attendance grids invalidate immediately.
2. **Active Style Enrollment Filtering in `attendance.get` & `attendance.mark` (`api/src/features/attendance.ts`):**
   - In `attendance.get`: filter sheet rows against the event's active enrolled `styleMembers` for `styleId` so dropped or removed dancers never appear in `grid.members` or `grid.present`. Also cache empty grids cleanly when `grid.members.length === 0` after the last dancer is removed.
   - In `attendance.mark`: validate `mark.memberId` against currently enrolled `styleMembers` for `styleId` (removing the legacy fallback that allowed marking a dropped dancer who still had an old row).
3. **`MemberIndex` Complete Deactivation When 0 Events Remain (`api/src/features/eventImport.ts`):**
   - In `dropEventFromIndex(ctx, event, matricKey)`: after removing `event.id` from `entry.eventIds` and deleting `entry.eventStyles[event.id]`, if `eventIds.length === 0`, update `{ eventIds: [], eventStyles: {}, active: false } as any` (or deactivate the row) and evict `'mi:' + matricKey` and `'mi:' + entry.id` from cache. If `eventIds.length > 0` (the dancer is still enrolled in other past/current events), keep `active: true` with the remaining `eventIds` and `eventStyles`.
   - During `importEventMembers`, also check all active `MemberIndex` entries that currently list `event.id` in `entry.eventIds`: if `entry.matricKey` is no longer in `inForm` (and `!hasIncompleteRows`), call `dropEventFromIndex(ctx, event, entry.matricKey)` so any previously unpurged removal is cleaned up automatically.

### 2.3 Backend Dancer & Class Enrollment Routes (`api/src/features/members.ts`)
1. **Resolving & Formatting the Class Column in Google Form Response Sheets:**
   - Helper `resolveClassColumn(event, headers, rows, styles)`: uses `event.classIndex >= 0 ? event.classIndex : (detectClassColumn(rows, styles, headers)?.index ?? -1)`. If the sheet has no class column and `event.styleIds.length > 1`, appends a `"Dance Class"` header column to row 1 of the response sheet and updates `event.classIndex`.
   - Helper `formatStyleCell(event, styleIds, allStyles)`: maps each `styleId` to `formLabels[styleId] || style.name || styleId` and joins with `', '`.
2. **`members.add` (`perm: 'members.import'`, `write: true`, `bumpsData: true`):**
   - Input: `{ eventId, fullName, matricRaw, contact?, email?, gender?, nationality?, styleIds: string[] }`.
   - Validates active non-archived event within retention, non-empty `fullName`, valid `matricKey` (`normalizeMatric(matricRaw).length >= 4`), non-empty `styleIds` subset of `event.styleIds`, and checks that `matricKey` does not already belong to another active dancer in the event or to a different person in `MemberIndex`.
   - Opens the event's Google Form Response Sheet (`openSourceTab`). Ensures columns exist in header row 1 for any provided fields (`Timestamp`, `Full Name`, `Matric Number`, `Contact Number`, `Email`, `Gender`, `Nationality`, and `Dance Class` when `event.styleIds.length > 1` or `classCol >= 0`), setting plain-text format on Matric and Contact columns.
   - Appends the new response row with an ISO timestamp (`ctx.now().toISOString()`) so the 3-layer Incomplete Sheet Row Guard recognizes it as a complete, valid entry.
   - Calls `importEventMembers(ctx, event, { full: true, purgeRemoved: true, suppressFormReopen: true })`:
     - Sends the `[UMDSC] Registration Confirmed` email if a valid email was provided.
     - Updates `Members` sheet, per-style `Attendance` sheets, and `MemberIndex`.
     - Evaluates slot capacities and Google Form choices while **never** re-opening a closed Google Form or restoring a full style choice when an admin overrides slot capacity.
3. **Extended `members.edit` (`perm: 'members.import'`, `write: true`, `bumpsData: true`):**
   - Accepts `{ eventId, memberId, fullName?, matricRaw?, contact?, email?, gender?, nationality?, styleIds?: string[] }`.
   - If `styleIds` is provided:
     - If `styleIds.length === 0`, delegates to removing the dancer's response rows in `eventId` (same as `members.remove`).
     - Otherwise validates all `styleIds` belong to `event.styleIds`, formats the class cell (`formatStyleCell`), writes the updated fields + class cell into the primary response row (`responseRows[0]`), and **clears any duplicate response rows** (`responseRows.slice(1)`) for that dancer in that event's response sheet so `buildMembers` does not re-union a dropped style from an older duplicate form submission.
   - Calls `importEventMembers(ctx, event, { full: true, purgeRemoved: true, suppressFormReopen: true })`.
4. **`members.remove` (`perm: 'members.import'`, `write: true`, `bumpsData: true`):**
   - Input: `{ eventId, memberId }`.
   - Finds all rows matching `member.matricKey` in the event's Google Form Response Sheet and clears them (`sheet.setValues(rowIdx + 1, 1, [headers.map(() => '')])`).
   - Calls `importEventMembers(ctx, event, { full: true, purgeRemoved: true, suppressFormReopen: true })`, purging the dancer from `Members`, all `Attendance` sheets for that event, and `MemberIndex` (deactivating her `MemberIndex` entry if `eventIds` becomes empty).

### 2.4 Google Form Stay-Closed Guarantee & `events.reopenFormSlots` (`api/src/features/formGating.ts` & `events.ts`)
1. **Stay-Closed Guarantee on Admin Override:**
   - In `syncGoogleFormSlotChoices(ctx, event, providedMembers, opts?: { suppressFormReopen?: boolean })`:
     - When `enrolledCount >= cap`, `styleId` is in `fullStyleIds` (even when `enrolledCount > cap` from an admin override, e.g., `21 / 20`).
     - When `opts?.suppressFormReopen` is true (or during any website roster mutation), never set `sync:adminOverride:<eventId>` and never call `form.setAcceptingResponses(true)`. If the style/form reached capacity, close that style choice or close the Google Form (`FULL_HOUSE_CLOSED_MESSAGE`).
2. **New Route `events.reopenFormSlots` (`perm: 'members.import'`, `write: true`, `bumpsData: true`):**
   - Input: `{ id: string, addOnSlots: Record<string, number> }`.
   - Validates `event` is active and at least one `styleId` in `event.styleIds` has an integer `addOnSlots[styleId] >= 1`.
   - Reads active enrolled members (`readEventMembers`) to compute current `enrolledCount` per style.
   - For each `styleId` with `addOn >= 1`:
     - `currentCap = Number(styleSlots[styleId]) || 0`
     - `newCap = Math.max(currentCap, enrolledCount) + addOn`
     - `styleSlots[styleId] = newCap`
     - Removes `styleId` from `notifiedFullStyles` so the slot-full alert email re-arms for `newCap`.
   - Saves `styleSlots`, `styleSlotsJson`, `notifiedFullStyles`, `notifiedFullStylesJson` on the event.
   - If the Google Form is linked and currently closed, explicitly calls `form.setAcceptingResponses(true)` and `form.setCustomClosedFormMessage('')`, clears `formClosed` (`false`) and `formClosedReason` (`'none'`), and runs `syncGoogleFormSlotChoices(ctx, updatedEvent, activeMembers)` so all reopened style choices are restored on the live Google Form immediately.

### 2.5 Frontend 8-Bit Icons, Dancers CRUD UI & Event Reopen Slots UI (`@umdsc/web`)
1. **8-Bit Pixel Icons (`web/src/components/ui/pixelIcons.tsx`):**
   - `PixelUnlockIcon`: 8-bit pixel open padlock with neon keyhole (`viewBox="0 0 20 20"`, `shapeRendering="crispEdges"`).
   - `PixelPlusUserIcon`: 8-bit pixel dancer silhouette with a crisp `+` pixel badge.
   - `PixelTrashIcon`: 8-bit pixel bin with lid and vertical ridges.
2. **Dancers Page (`/admin/members` — `MembersPage.tsx`, `AddDancerDialog.tsx`, `EditDancerDialog.tsx`):**
   - `+ ADD DANCER` button (with `<PixelPlusUserIcon />`) in `MembersPage.tsx` toolbar (and fullscreen toolbar) when `canImport` is true.
   - `AddDancerDialog.tsx`: selects target active event (pre-filled with current event), collects `Full name`, `Matric number`, `Phone number`, `Email`, `Gender`, `Nationality`, and **Dance Classes (`styleIds`)** checkboxes (showing `FULL — ADMIN OVERRIDE (FORM STAYS CLOSED)` badge if a style is at capacity).
   - `EditDancerDialog.tsx`: adds per-event **Dance Classes (`styleIds`)** checkboxes so the admin can add, change, or drop classes, plus a **`REMOVE FROM EVENT`** button (with `<PixelTrashIcon />` and confirmation prompt) that calls `members.remove`. Also invalidates `['members']`, `['events']`, and `['attendance']` on save/remove.
3. **Event Card Reopen Slots UI (`/admin/events` — `EventCard.tsx`, `ReopenSlotsDialog.tsx`):**
   - On `EventCard.tsx`: when `!archived && canManageEvent` and any style is full (`notifiedFullStyles?.includes(id)` or single-style `memberCount >= slots`) or `event.formClosed` is true, renders a **`REOPEN / + SLOTS`** button with `<PixelUnlockIcon />` (next to `FORM CLOSED` / full style badges and in card actions).
   - `ReopenSlotsDialog.tsx`: lists the event's dance styles with current `Enrolled` vs `Slot Limit`, lets the admin input **`Add-On Slots (+N)`** (`>= 1`) for the style(s) to reopen (pre-selecting clicked style if triggered from a style badge), displays the new total limit preview (`Math.max(limit, enrolled) + addOn`), and calls `events.reopenFormSlots`.
