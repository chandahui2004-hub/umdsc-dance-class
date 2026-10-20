# Admin Emails Management, Calendar Side Drawer, Dropdown Scroll & Form Sync Design

- **Date:** 2026-10-20
- **Status:** Proposed
- **Author:** Antigravity & Club Admin

---

## 1. Overview & Goals

This specification details the design and architecture for seven key system enhancements across Admin Settings, Calendar, Navigation Controls, Dance Styles, Dancers Roster, and Form Sync:

1. **Admin Notification Emails Management (Settings)**:
   - Provide individual email cards for each configured recipient instead of a single comma-separated string blob.
   - Support adding new emails (single or comma/space/semicolon/newline-delimited).
   - Support inline editing and deleting with a retro pixel popconfirm modal ("Are you sure you want to delete this email?").
   - Automatically split and display the four previously entered emails (`charlotteyee923@gmail.com`, `zhihan260805@gmail.com`, `24078221@siswa.um.edu.my`, `vernicedingjiemin@gmail.com`) as 4 distinct recipient cards.

2. **Calendar Selected Date Class Side Drawer**:
   - In both Admin Mode (`ClassesPage`) and Dancer Mode (`DancerHome`), replace the centered popup window with a smooth slide-in **Right Side Drawer**.
   - Allows dancers and admins to easily browse day classes, time, venue, instructors, music, and videos while keeping context of the calendar month.

3. **Calendar Class Hover Tooltip**:
   - When hovering over a calendar date tile that has scheduled classes, display a retro neon tooltip with the class name, time, and instructor.

4. **Max 5 Selection with Scroll for Step I & Step II Dropdowns**:
   - Replace native unscrollable OS select menus in `EventStep` (Step I: Choose Event) and `StyleStep` (Step II: Choose Dance Style) with custom retro pixel dropdowns.
   - Enforce a visible height of 5 items with an internal retro pixel scrollbar for remaining items.

5. **Dance Styles Master Data Cleanup**:
   - In *More › Dance Styles* (`StylesPage.tsx`), remove `Default Day` (`defaultWeekday`), `Default Venue`, and default start/end times from the style creation/edit form and cards.
   - Venues and dates vary per event and are configured during event creation.

6. **Dancers Page Style Filter Scoped to Selected Event**:
   - In *Dancers* (`MembersPage.tsx`), filter the `StyleStep` dance styles so only styles present in the currently selected event (`event.styleIds`) are shown, instead of all styles in the entire club database.

7. **Freestyle Event Registration Discrepancy & Sync Fix**:
   - Resolve the issue where the Freestyle event shows 29 registered members while the Google Form response sheet only contains 21 responses.
   - When responses are deleted from Google Form response sheets, permanently delete those rows from the event's Members sheet during `SYNC NOW` (or exclude removed flags from active member counts).
   - Clear the "Many matric numbers changed at once" sync warning when an admin explicitly triggers a full sync.

---

## 2. Technical Architecture & Component Design

### 2.1 Admin Notification Emails Management (`web/src/features/settings/SettingsPage.tsx`)

#### State & Data Handling
- Stored in database table `Settings` under key `adminNotificationEmails` as a normalized string of email addresses joined by commas.
- Email parsing utility extracts distinct emails by splitting on `[,;\n\s]+` and removing whitespace and empty tokens.
- Each email is rendered as an individual card in a list with:
  - Email address (font-mono, bold, neon text)
  - Active status indicator (live green dot)
  - **EDIT** button (opens inline edit input with SAVE / CANCEL)
  - **DELETE** button (triggers retro pixel Popconfirm modal: *"Delete notification email [address]? You can re-add it anytime."*)
- At the top of the panel:
  - "ADD NOTIFICATION EMAIL" input field + "ADD EMAIL" button.
  - Supports adding a single email or pasting multiple comma-separated emails.
- Persisting any change (add, edit, delete) sends `settings.set` with the updated list of email addresses, invalidates the `settings` query, and shows a green success banner.

---

### 2.2 Calendar Selected Date Class Side Drawer (`web/src/components/ui/SideDrawer.tsx` & `DaySheet.tsx`)

#### Component Architecture
- Create or update `SideDrawer` / `Sheet` component:
  - Desktop / Tablet (`sm` and up): Fixed right side panel (`fixed right-0 top-0 bottom-0 w-full max-w-md z-[var(--z-overlay)] bg-[var(--night-2)] border-l-2 border-[var(--neon-cyan)] shadow-[-4px_0_0_var(--outline)] animate-slide-in-right`).
  - Mobile (`< 640px`): Full height or high bottom sheet/drawer with grab handle and slide-in transition.
  - Backdrop: `fixed inset-0 bg-[var(--night-0)]/80 px-dither cursor-pointer`.
  - Header: Day title (e.g. `FRIDAY, 23 OCTOBER 2026`), class count badge, and retro red `✕` close button.
  - Content: Vertical list of `ClassCard` items for that date with scrollbar.
- Used in:
  - `DancerHome.tsx`: Clicking a date tile opens the right side drawer.
  - `ClassesPage.tsx`: Selecting a date tile opens the side drawer (or displays in a responsive side drawer), replacing the full bottom panel or popup.

---

### 2.3 Calendar Class Hover Tooltip (`web/src/components/ui/MonthCalendar.tsx`)

#### Hover Tooltip Architecture
- In `MonthCalendar.tsx`, when a calendar day tile has `marks` or class sessions, add hover listeners or CSS tooltip overlay:
  - Desktop hover: When the mouse enters a date button with classes, display an absolute/fixed retro tooltip near the day tile.
  - Tooltip content:
    - Date heading (e.g. `23 Oct`)
    - List of classes: `Style Name` · `Time (e.g. 8:00 PM - 10:00 PM)` · `Instructor Name`
    - Color indicator matching the instructor's signature color.
  - Styling: `px-panel bg-[var(--night-1)] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)] p-2 text-xs font-mono z-50 pointer-events-none`.

---

### 2.4 Custom Retro Pixel Dropdown with Max 5 Items & Scroll (`web/src/components/ui/PixelDropdown.tsx`)

#### Dropdown Architecture
- Create reusable component `PixelDropdown`:
  - Props: `value`, `onChange`, `options: { value: string; label: string; group?: string }[]`, `placeholder`, `disabled`.
  - Trigger button: Retro pixel button showing currently selected label + downward pixel triangle `▼`.
  - Menu popover: Absolute floating container anchored below the trigger:
    - Pixel borders: `border-2 border-[var(--outline)] bg-[var(--night-2)] shadow-[4px_4px_0_var(--outline)]`.
    - Maximum height: `max-h-[200px] overflow-y-auto pixel-scrollbar` (fits exactly 5 items before scrolling).
    - Items: Minimum height 40px each, hover highlights with `bg-[var(--violet-2)]`, selected item marked with gold accent.
    - Keyboard navigation: Arrow Up/Down, Enter to select, Escape to close.
- Integrations:
  - In `EventStyleSteps.tsx`:
    - `EventStep`: Uses `PixelDropdown` for event selection.
    - `StyleStep`: Offers `PixelDropdown` (or styled dropdown view) showing max 5 styles with scroll.

---

### 2.5 Dance Styles Master Data Cleanup (`web/src/features/masterdata/StylesPage.tsx`)

#### Changes
- In `StylesPage.tsx`:
  - Remove fields `Default Day` (`defaultWeekday`), `Start Time` (`defaultStart`), `End Time` (`defaultEnd`), and `Default Venue` (`defaultVenue`) from the Create and Edit modal.
  - Remove "Schedule: ..." and "Venue: ..." from the Style card details.
  - Retain style name, aliases, attendance folder, and video folder configurations.
- In `api/src/features/styles.ts`:
  - Keep fields optional in schema/types so existing data remains safe and migrations are non-breaking.

---

### 2.6 Dancers Page Style Filter Scoped to Selected Event (`web/src/features/members/MembersPage.tsx`)

#### Filter Scoping
- In `MembersPage.tsx`:
  ```typescript
  const eventStyles = useMemo(() => {
    if (isAll) {
      // Combined mode: show styles across active events
      const activeEventStyleIds = new Set(
        events.filter(e => e.status !== 'archived').flatMap(e => e.styleIds || [])
      );
      return (bootstrap?.styles || []).filter(s => activeEventStyleIds.has(s.id));
    }
    if (!event) return [];
    return (bootstrap?.styles || []).filter(s => (event.styleIds || []).includes(s.id));
  }, [bootstrap?.styles, event, isAll, events]);
  ```
- Pass `styles={eventStyles}` into `StyleStep`.
- If `selectedStyleId !== 'all'` is no longer in `eventStyles`, reset to `'all'`.

---

### 2.7 Freestyle Event Registration Discrepancy & Sheet Sync Fix (`api/src/features/eventImport.ts` & `events.ts`)

#### Problem Analysis
- **Symptom**: Freestyle event displays "29 DANCERS", but the Google Form response sheet only contains 21 responses.
- **Root Causes**:
  1. Members removed or deleted from the Google Form response sheet were previously retained in the event's `Members` spreadsheet and marked with the `removed` flag.
  2. `event.memberCount` was calculated via `body.filter(r => r[col('memberId')]).length + added.length`, which counted all 29 rows regardless of whether they were flagged `removed`.
  3. `tooManyCorrections` held back synchronization when 8 rows were deleted at once, triggering the warning: *"Many matric numbers changed at once, so no dancer was moved"*.

#### Solution
1. **Purge Removed Members during Full Sync (`opts.full`)**:
   - In `importEventMembers`: When `opts.full === true` (triggered by admin clicking "SYNC NOW"), if rows in the `Members` spreadsheet no longer exist in the Google Form response sheet, purge those deleted rows from the `Members` spreadsheet (and remove their entries from the `MemberIndex` table for this event).
2. **Count Only Active Enrolled Dancers**:
   - Calculate `memberCount` as:
     ```typescript
     const activeMembers = body.filter(r => r[col('memberId')] && !String(r[col('flags')] || '').split(',').includes(REMOVED_FLAG));
     const memberCount = activeMembers.length + added.length;
     ```
3. **Handle Sync Threshold Warning Gracefully**:
   - For `opts.full`, bypass or re-arm `tooManyCorrections` when the admin explicitly executes SYNC NOW, allowing the event's member list to immediately synchronize with the 21 rows in the response sheet.
4. **Capacity Recalculation**:
   - Re-evaluate slot capacity alert against the 21 active members. If the cap is 20, 21 is still full (1 over capacity), and slot alert status remains accurate.

---

## 3. Testing & Verification Plan

### 3.1 Automated Tests
- **API Tests** (`api/test/features/eventImport.test.ts`):
  - Test verifying that during full sync (`opts.full === true`), members deleted from the source form sheet are purged from the `Members` sheet.
  - Test verifying `memberCount` reflects only active dancers (21 instead of 29).
  - Test verifying `adminNotificationEmails` correctly parses multi-delimiter inputs (commas, semicolons, whitespace, newlines).
- **Web Tests** (`web/src/`):
  - Test `PixelDropdown`: displays max 5 items with scrollbar, keyboard navigation, and selection callbacks.
  - Test `SideDrawer`: verifies slide-in behavior and close events.
  - Test `SettingsPage`: verifies adding, editing, and deleting individual email items with popconfirm.
  - Test `MembersPage`: verifies dance style filter dropdown only displays styles for the selected event.
  - Test `StylesPage`: verifies default day and venue fields are removed.

### 3.2 Visual & Manual Verification
- Verify Settings page displays the 4 existing emails as separate interactive cards with Edit and Delete.
- Verify clicking a calendar date opens the right side drawer.
- Verify hovering over calendar class dots displays tooltip with class name, time, instructor.
- Verify Step I and Step II dropdowns show 5 items max with retro pixel scrollbar.
- Run `npm test` and `npm run build` across all packages.
