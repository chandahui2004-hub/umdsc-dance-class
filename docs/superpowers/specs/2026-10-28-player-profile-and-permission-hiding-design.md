# Player Profile Overflow Fix & Permission-Based UI Gating — Design Spec

**Date:** 2026-10-28
**Status:** Approved

---

## 1. Problem Statement

1. **Player Profile Frame Overflow (`UserInfoBoard.tsx` & `PhoneShell.tsx`):**
   - In the desktop sidebar (`w-64`), `UserInfoBoard` places `PLAYER PROFILE` and the role badge (e.g., `[👑 ATTENDANCE VIEWER]`) side-by-side on a single non-wrapping flex row (`flex items-center justify-between`), causing long role names to overflow out of the right border of the frame.
   - The `USER:` and `MATRIKS:` rows use a wide `w-[88px]` label column without explicit `min-w-0 break-words` on the value container, leaving insufficient width for long usernames or `STAFF (username)` strings.
   - On mobile (`PhoneShell.tsx`), `mobile-role-badge` lacks a max-width/truncation guard for long role names.

2. **Unauthorized Action Buttons & Sections Shown to View-Only / Scoped Roles:**
   - **Attendance (`AttendancePage.tsx`):** Users with `attendance.view.all` (such as `ATTENDANCE VIEWER`) who lack `attendance.edit` still see the `SAVED ATTENDANCE — PRESS EDIT TO CHANGE TICKS` prompt, the `EDIT` button, the `⛶ FULL SCREEN` tick-mode button, and `OPEN {STYLE} SHEET ↗`. Users without `export.download` still see `EXPORT XLSX`.
   - **Calendar & Today (`ClassesPage.tsx`, `TodayPage.tsx`, `FolderLinksHeader.tsx`):** Users with `calendar.view` who lack `sessions.edit` still see `+ ADD CLASS`, `✎ EDIT CLASS`, clickable session cards in "ALL CLASSES" that open `SessionEditor`, and Google Drive/Sheet links in `FolderLinksHeader`.
   - **Events (`EventsPage.tsx`, `EventCard.tsx`):** Users who can view `/admin/events` without `members.import` / `sessions.edit` still see `+ NEW EVENT`, `EDIT`, `SYNC NOW`, `ARCHIVE`, `UNARCHIVE`, `DELETE`, `RECREATE`, `RESPONSE SHEET ↗`, and `GOOGLE FORM ↗`.
   - **Videos & Music (`MediaPage.tsx`, `ClassLeadVideoFoldersPanel.tsx`):**
     - `ClassLeadVideoFoldersPanel` is shown even to users who have neither `styles.edit` nor `videos.upload`.
     - `CLASSES IN THIS EVENT` shows `✎ EDIT` and `ADD CLASSES IN EVENTS › EDIT` even without `sessions.edit`.
     - `CLASS RECAP VIDEOS` is shown even if the user lacks `videos.view`, `videos.upload`, and `videos.edit` for that style; inside it, `+ ADD RECAP` / `ADD RECAP NOW` are shown without `videos.upload`, and `SCAN DRIVE FOLDER` / `DELETE` are shown without `videos.edit`.
     - `PRACTICE MUSIC` is shown even if the user lacks `music.view`, `music.edit`, and `sections.edit` for that style; inside it, `+ MUSIC LINK` / `+ MP3` / `DELETE` are shown without `music.edit`, and `MANAGE SECTIONS` is shown without `sections.edit` / `music.edit`.
   - **Registered Dancers (`MembersPage.tsx`):** `EXPORT CSV` is shown even when the user lacks both `export.download` and `members.import`.
   - **Mascot Notification Widget (`NotificationWidget.tsx`):** Checks `isAdmin = role === 'admin'` globally rather than checking per-tab permissions (`members.view`, `calendar.view`, `settings.edit`). As a result, a staff user with only `attendance.view.all` (like `ATTENDANCE VIEWER`) sees a badge count and admin notification tabs for Dancers, Slot Progress, and System & Audit.

---

## 2. Solution Architecture

### 2.1 Player Profile Box (`UserInfoBoard.tsx`) & Mobile Header (`PhoneShell.tsx`)
- In `UserInfoBoard.tsx`:
  - Change the header container from `flex items-center justify-between` to `flex flex-col gap-1.5 border-b-2 border-[var(--outline)] pb-2`.
  - Render `PLAYER PROFILE` on the top row and the `[👑 {ROLE}]` badge on its own full-width row (`w-full justify-center text-center break-words leading-snug`) so long role names wrap cleanly inside the box.
  - Change `USER:` and `MATRIKS:` rows to `flex items-baseline gap-2 min-w-0` with `w-[72px] shrink-0` labels and `min-w-0 flex-1 break-words` value spans so long names and matric/staff strings wrap cleanly inside the frame.
- In `PhoneShell.tsx`:
  - Add `max-w-[140px] truncate` to `mobile-role-badge` so long role names fit in the mobile top bar.

### 2.2 Permission Gating Across Pages
- **`AttendancePage.tsx`:**
  - Compute `canEdit = can(perms, 'attendance.edit', styleId || undefined)` and `canExport = can(perms, 'export.download', styleId || undefined)`.
  - When `!canEdit`:
    - Render `SAVED ATTENDANCE — VIEW ONLY` instead of `SAVED ATTENDANCE — PRESS EDIT TO CHANGE TICKS`.
    - Hide the `EDIT` button, `⛶ FULL SCREEN` button, and `OPEN {STYLE} SHEET ↗` link.
  - When `!canExport`:
    - Hide the `EXPORT XLSX` button.
- **`ClassesPage.tsx`, `TodayPage.tsx`, `FolderLinksHeader.tsx`:**
  - In `ClassesPage.tsx`:
    - Compute `canEditCurrentStyle = styleId === 'all' ? can(perms, 'sessions.edit') : can(perms, 'sessions.edit', styleId)` and `canImport = can(perms, 'members.import')`.
    - Pass `onAddSession={canEditCurrentStyle ? handleAddForDate : undefined}` (or hide `+ ADD CLASS` in `MonthCalendar` when `!canAddSession`).
    - In `DaySheet` and `ClassCard`, only render `✎ EDIT CLASS` when `can(perms, 'sessions.edit', session.styleId)`.
    - In `ALL CLASSES` list, only allow clicking a session card to open `SessionEditor` when `can(perms, 'sessions.edit', s.styleId)`.
    - In EmptyState, only show `CREATE AN EVENT` when `canImport`.
  - In `FolderLinksHeader.tsx`:
    - Gate `EVENT FOLDER ↗` behind `can(perms, 'sessions.edit') || can(perms, 'members.import') || can(perms, 'settings.edit')`.
    - Gate `ATTENDANCE FOLDER ↗` behind `can(perms, 'attendance.edit') || can(perms, 'settings.edit')`.
    - Gate `MEMBERS SHEET ↗` behind `can(perms, 'members.import') || can(perms, 'settings.edit')`.
    - Return `null` if no links are visible.
  - In `TodayPage.tsx`:
    - Check `canEditAtt = can(perms, 'attendance.edit', session.styleId)` and `canViewAtt = can(perms, 'attendance.view.all', session.styleId) || canEditAtt`.
    - Hide the attendance button if `!canViewAtt`; show `TAKE ATTENDANCE` if `canEditAtt`, or `VIEW ATTENDANCE` if view-only.
- **`EventsPage.tsx` & `EventCard.tsx`:**
  - In `EventsPage.tsx`:
    - Gate `+ NEW EVENT` (header and EmptyState) behind `can(perms, 'members.import')`.
  - In `EventCard.tsx`:
    - Gate `RESPONSE SHEET ↗`, `GOOGLE FORM ↗`, `SYNC NOW`, `ARCHIVE`, `UNARCHIVE`, `DELETE`, and `RECREATE` behind `can(perms, 'members.import')`.
    - Gate `EDIT` behind `can(perms, 'members.import') || can(perms, 'sessions.edit')`.
    - Gate `OPEN` behind `canAccessRoute('/admin/attendance', perms)`.
- **`MediaPage.tsx` & `ClassLeadVideoFoldersPanel.tsx`:**
  - In `MediaPage.tsx`:
    - Gate `ClassLeadVideoFoldersPanel` behind `can(perms, 'styles.edit') || can(perms, 'videos.upload')` (and keep the `REFRESH` button accessible in the page header if `ClassLeadVideoFoldersPanel` is hidden).
    - Gate `✎ EDIT` on session cards behind `can(perms, 'sessions.edit', sess.styleId)` and `ADD CLASSES IN EVENTS › EDIT` behind `can(perms, 'sessions.edit', styleId) || can(perms, 'members.import')`.
    - Compute per-style permissions:
      - `canViewVideos = can(perms, 'videos.view', styleId) || can(perms, 'videos.upload', styleId) || can(perms, 'videos.edit', styleId)`
      - `canUploadVideos = can(perms, 'videos.upload', styleId)`
      - `canEditVideos = can(perms, 'videos.edit', styleId)`
      - `canViewMusic = can(perms, 'music.view', styleId) || can(perms, 'music.edit', styleId) || can(perms, 'sections.edit', styleId)`
      - `canEditMusic = can(perms, 'music.edit', styleId)`
      - `canEditSections = can(perms, 'sections.edit', styleId) || can(perms, 'music.edit', styleId)`
    - Filter `orphanVideos` to `canEditVideos ? orphanVideos : []` and `orphanMusic` to `canEditMusic ? orphanMusic : []`.
    - Only render `CLASS RECAP VIDEOS` panel when `canViewVideos`; inside it, gate `+ ADD RECAP`, `ADD RECAP NOW`, and missing-folder alert behind `canUploadVideos`, and gate `SCAN DRIVE FOLDER` and `DEL` / `DELETE` behind `canEditVideos`.
    - Only render `PRACTICE MUSIC` panel when `canViewMusic`; inside it, gate `+ MUSIC LINK`, `+ MP3`, `ADD MUSIC LINK`, `UPLOAD MP3`, and `DELETE` behind `canEditMusic`, and gate `MANAGE SECTIONS` behind `canEditSections`.
- **`MembersPage.tsx`:**
  - Gate `EXPORT CSV` behind `can(perms, 'export.download') || can(perms, 'members.import')`.
- **`NotificationWidget.tsx`:**
  - For `isAdmin` (`role === 'admin'`), compute per-tab permissions:
    - `canNewDancersTab = can(perms, 'members.view') || can(perms, 'members.import')`
    - `canSlotProgressTab = can(perms, 'members.view') || can(perms, 'members.import') || can(perms, 'calendar.view') || can(perms, 'sessions.edit')`
    - `canSystemAuditTab = can(perms, 'settings.edit') || can(perms, 'members.import')`
  - Only enable `notification_members` query when `isAdmin && (canNewDancersTab || canSlotProgressTab) && can(perms, 'members.view')`.
  - Only enable `notification_audit` query when `isOpen && isAdmin && canSystemAuditTab`.
  - Only compute `recentEvents` / `recentDancers` when `canNewDancersTab`, `slotProgressList` when `canSlotProgressTab`, and `systemAlerts` when `canSystemAuditTab`.
  - If `isAdmin && !canNewDancersTab && !canSlotProgressTab && !canSystemAuditTab`, return `null` so roles like `ATTENDANCE VIEWER` do not see the Mascot Notification widget or unauthorized badge counts.

