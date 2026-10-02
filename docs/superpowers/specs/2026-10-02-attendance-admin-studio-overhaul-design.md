# Design Spec: Attendance Auto-Healing, Admin Navigation & Studio Overhaul

**Date:** 2026-10-02  
**Status:** Approved  
**Author:** UMDSC Development Team  

---

## 1. Overview & Objectives

This specification defines the architectural enhancements and UX fixes across three primary areas of the UMDSC Dance Class System:
1. **Attendance Reliability & Auto-Healing**: Ensure that attendance data for all dance styles and events correctly displays on both the Admin Attendance Tracker and the Dancer Home / Profile views, auto-healing missing sheets or style registrations.
2. **Admin UI Restructuring**:
   - Remove the `Today` page.
   - Keep the `Calendar` page as the default admin landing view.
   - Promote `Registered Dancers` (`/admin/members`) to a top-level navigation item.
   - Move `Events` (`/admin/events`) inside the `More` menu.
   - Convert `More` from a full-page link into an interactive expandable/collapsible menu with 6 specific sub-items: *Dance Styles*, *Instructors*, *Roles & Permissions*, *Admin Accounts*, *System Settings*, and *Events*.
   - Relocate the Attendance Master Folder configuration into the Attendance page, and the Video Master Folder configuration into the Media page (removing them from the Events page).
   - Multi-event combined view on the Registered Dancers page with deduplication by dancer matric number, full-screen toggle mode, and custom retro scrollbar.
3. **Dancer Studio Overhaul**:
   - Maximize viewport space utilization by removing restrictive container caps and excess padding.
   - Implement Fullscreen Mode:
     - Top area: single video playback only (prioritize Dance Video; fall back to YouTube; never display both).
     - Directly below: stacked Music and Video progress bars with time/duration labels.
     - Moveable / draggable floating HUD pill for loop controls (`Play/Pause`, `Loop ON/OFF`, `Range: 12.4s`, `Set In [A]`, `Set Out [B]`, `Speed`, and `Exit Fullscreen`).
     - Voice commands remain actively functioning in the background while hidden from view.
   - Looping & Timeline Interaction Fixes:
     - Fix the bug making the loop range undraggable by providing distinct start handle, end handle, and center draggable zone.
     - Display live time tooltips and total range duration while dragging loop handles.
     - Prevent the video start flag drag from inadvertently seeking the video progress bar.
     - Provide single-click (move nearest loop point with visual glow effect) vs double-click (seek music progress) when looping is active.

---

## 2. Attendance Data Pipeline & Auto-Healing

### 2.1 Problem Analysis
Currently, if an event was created or updated with new dance styles, or if an attendance sheet was not yet provisioned in Google Drive, `attendance.get` returns an empty members array because `ctx.db.attendanceSheets` has no active record for that `(eventId, styleId)`. Furthermore, on the dancer side, `dancer.attendance` and `dancer.bootstrap` rely on cached `eventStyles` which can be missing or stale, causing dancers not to see attendance for their enrolled styles.

### 2.2 Solution Architecture
1. **Server-Side Auto-Healing in `attendance.get` (`api/src/features/attendance.ts`):**
   - When `attendance.get` is invoked with `eventId` and `styleId`:
     - If the `attendanceSheets` record is missing or the corresponding Google Sheet is uninitialized, call `ensureEventSheets(ctx, event)` to automatically provision and sync the sheet.
     - If Google Drive is temporarily unavailable or sheets are still syncing, fall back to extracting enrolled dancers from `readEventMembers(ctx, event)` filtered by `styleId`, returning the registered members so the admin roster is never blank.
2. **Dancer Attendance Resolution (`api/src/features/bootstrap.ts`):**
   - In `resolveDancerEventStyles`, if `dancer.eventStyles?.[event.id]` is missing, empty, or outdated, fall back to reading `dancerStylesInEvent(ctx, event, matricKey)`.
   - In `getDancerAttendance`, ensure all enrolled styles across all active events for the dancer are queried and matched with attendance records.

---

## 3. Admin Navigation & Page Structure Overhaul

### 3.1 Routing & Navigation Definition (`web/src/app/routes.tsx`)
1. **Remove Today Page**:
   - Delete `/admin/today` tab definition.
   - Set the default landing page and fallback redirect to `/admin/calendar`.
2. **Top-Level Navigation Tabs (`ADMIN_TABS`)**:
   - `Calendar`: `/admin/calendar` (Icon: Calendar)
   - `Attendance`: `/admin/attendance` (Icon: Attendance / Checkmark)
   - `Media`: `/admin/media` (Icon: Video)
   - `Dancers`: `/admin/members` (Icon: Users)
   - `More`: Expandable/collapsible trigger button.
3. **Collapsible "More" Menu Architecture**:
   - "More" is no longer a static page route. Clicking "More" toggles the expanded/collapsed state.
   - Inside "More", only the following 6 destinations are available:
     1. `Dance Styles` (`/admin/styles`)
     2. `Instructors` (`/admin/instructors`)
     3. `Roles & Permissions` (`/admin/roles`)
     4. `Admin Accounts` (`/admin/admins`)
     5. `System Settings` (`/admin/settings`)
     6. `Events` (`/admin/events`)
   - **Desktop (`Sidebar.tsx`)**:
     - Rendered as an expandable accordion section beneath the primary nav links.
     - Smooth toggle state saved in component state/storage, displaying clear retro icons and active route highlighting.
   - **Mobile (`TabBar.tsx` / `PhoneShell.tsx`)**:
     - When tapping "More" on the bottom navigation bar, a retro slide-up drawer / bottom sheet opens, presenting the 6 options in a 2-column or list grid with large touch targets.
4. **Folder Settings Realignment**:
   - **Attendance Master Folder**: Embedded directly at the top of `AttendancePage.tsx` using `FolderRow`.
   - **Video Master Folder**: Embedded directly in `MediaPage.tsx` using `FolderRow`.
   - Remove `FolderLinksHeader` from `EventsPage.tsx`.
   - The "New Event" creation entry point remains accessible from `EventsPage.tsx` via `+ NEW EVENT`.

---

## 4. Registered Dancers Page (`MembersPage.tsx`) Multi-Event & Fullscreen Mode

### 4.1 Combined Multi-Event Roster
- When the event picker is set to "ALL EVENTS" (or when all events view is selected):
  - Instead of showing a blocking message, fetch members across all active events.
  - **Deduplication**: Aggregate members by `matricKey`.
  - For each unique dancer:
    - Display their combined style enrollments and event badges (e.g. `[HIP HOP · March]`, `[POPPING · April]`).
    - Contact info, email, gender, and nationality displayed accurately.
  - Display total unique dancer count.

### 4.2 Fullscreen Mode & Custom Scrollbar
- Add a `[⛶ FULLSCREEN]` action button in `MembersPage.tsx`.
- Fullscreen mode sets `fixed inset-0 z-50 bg-[var(--c-bg)] p-4 flex flex-col`.
- Renders an `overflow-y-auto` container with styled retro pixel-art scrollbar (`scrollbar-thin scrollbar-thumb-[var(--c-ink)] scrollbar-track-[var(--c-panel)]`).
- Includes a sticky search/filter bar and an `[✕ EXIT FULLSCREEN]` button.

---

## 5. Dancer Studio Overhaul & Fullscreen HUD

### 5.1 Space Maximization in `Studio.tsx`
- Remove restrictive max-width constraints (`max-w-[560px]`, `lg:max-w-[760px]`) and excessive padding.
- Responsive layout adapting from mobile screens to wide monitors.

### 5.2 Studio Fullscreen Mode
- Add a `FULLSCREEN [⛶]` button in Studio.
- In Fullscreen mode:
  - Container takes `fixed inset-0 z-50 bg-[#101114] flex flex-col`.
  - **Top Panel**: Single video display only:
    - If a class dance video is selected or available, render the dance video player.
    - If no dance video is available and a YouTube track exists, render the YouTube player.
    - If both exist, show only the dance video.
  - **Bottom Stacked Progress Bars**:
    - **Music Progress Bar**: Displays current playback position, total duration, active loop boundaries, and waveform/bar graphic.
    - **Video Progress Bar**: Displays current video playback, duration, and the draggable video start flag.
  - **Floating Looping HUD**:
    - Absolute-positioned floating pill, draggable anywhere via pointer capture.
    - Contains:
      - Play / Pause button
      - Loop ON / OFF toggle button with pulsating active indicator
      - Real-time Loop Duration Display (e.g., `12.4s [0:24 - 0:36]`)
      - Set In [A] and Set Out [B] buttons
      - Playback speed selector (`0.75x`, `0.8x`, `1.0x`, `1.25x`)
      - Exit Fullscreen [✕]
  - **Voice Command Panel**:
    - Visually hidden in Fullscreen mode to keep the viewport clean.
    - The underlying speech recognition hook (`useSpeechCommands`) remains active and continues processing commands.

### 5.3 Timeline & Looping Interaction Improvements
1. **Fix Undraggable Loop Bug in `AudioPlayer.tsx`**:
   - Replace the wide `edgeGrabDistance` (up to 10s) with 3 explicit touch zones:
     - Left Handle: Resize start point.
     - Right Handle: Resize end point.
     - Center Span: Move the entire loop range without resizing.
   - When dragging, display a floating badge directly above the handle showing the exact timestamp and total range length (e.g., `0:24.5 · 12.4s`).
2. **Fix Video Start Flag Overlap in `VideoTimeline.tsx`**:
   - Isolate pointer capture on the start flag.
   - Suppress the parent container's `onClick` when a flag drag operation occurs, preventing inadvertent seeking of the video playhead.
   - Display a real-time timestamp tooltip above the start flag while dragging (e.g. `Start: 00:04.2`).
3. **Music Progress Bar Click Actions**:
   - When loop mode is ACTIVE or in draft mode:
     - **Single click**: Moves the nearest boundary (start or end) to the clicked position and triggers a glowing pulse effect on the loop bar.
     - **Double click**: Jumps the audio playback playhead (`currentTime`) to the clicked position.
   - When loop mode is INACTIVE:
     - **Single click**: Seeks audio playback directly.
4. **Visual Loop Feedback**:
   - When loop mode is enabled, the loop bar border and background pulse with an active yellow retro glow (`shadow-[0_0_12px_rgba(255,236,39,0.5)]`) providing clear feedback that playback is looped.

---

## 6. Verification & Testing Plan

1. **Unit & Integration Tests**:
   - `attendance.get` auto-healing test: Verify that when an event has unprovisioned sheets, calling `attendance.get` ensures sheets and returns registered members.
   - `dancer.attendance` test: Verify that all styles enrolled across multiple events return attendance.
   - Navigation test: Verify removal of Today, presence of Dancers in primary tabs, and expandable More menu with the 6 items.
   - `MembersPage` deduplication test: Verify that combining multiple events deduplicates dancers by `matricKey`.
   - `AudioPlayer` loop drag & click test: Verify start/end/center dragging, single-click nearest point adjustment, and double-click seek.
   - `VideoTimeline` flag drag test: Verify dragging the start flag does not seek video progress.
2. **Browser End-to-End Verification**:
   - Admin view: Verify navigation accordion/drawer, folder links in Attendance and Media, and deduplicated dancer fullscreen table.
   - Dancer view: Verify Studio fullscreen mode with single video, floating HUD, and background voice cue recognition.
