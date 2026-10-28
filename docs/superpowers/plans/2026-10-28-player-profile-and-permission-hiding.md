# Player Profile Overflow & Permission-Based UI Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `test-driven-development` and `executing-plans` / `subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Player Profile frame overflow for long role names/usernames (`UserInfoBoard.tsx`, `PhoneShell.tsx`) and hide all unauthorized action buttons and sections across Attendance, Calendar, Today, Events, Media, Members, Folder Links, and Mascot Notification Widget when a user/role lacks edit or feature permissions.

**Architecture:**
1. Update `UserInfoBoard.tsx` to stack the role badge on its own full-width wrapping row below `PLAYER PROFILE` and wrap long `USER` / `MATRIKS` values cleanly inside the box; add truncation guard to `PhoneShell.tsx`.
2. Add granular `can(perms, ...)` checks across `AttendancePage.tsx`, `ClassesPage.tsx`, `TodayPage.tsx`, `FolderLinksHeader.tsx`, `EventsPage.tsx`, `EventCard.tsx`, `MediaPage.tsx`, `MembersPage.tsx`, and `NotificationWidget.tsx` so view-only or scoped roles never see edit/upload/delete/export/sheet buttons or unauthorized sections/tabs.

**Tech Stack:** TypeScript, React 18, Vitest, Testing Library, Tailwind CSS.

---

### Task 1: Fix Player Profile Overflow (`UserInfoBoard.tsx` & `PhoneShell.tsx`)

**Files:**
- Modify: `web/src/components/ui/UserInfoBoard.tsx`
- Modify: `web/src/components/ui/UserInfoBoard.test.tsx`
- Modify: `web/src/app/PhoneShell.tsx`

- [ ] **Step 1: Write failing tests in `web/src/components/ui/UserInfoBoard.test.tsx`**
  - Add a test verifying that a long role name like `ATTENDANCE VIEWER` renders inside a full-width wrapping badge (`w-full` and `break-words`) on its own stacked row inside `user-info-board`, and that `USER:` and `MATRIKS:` value elements include `break-words`.
- [ ] **Step 2: Run test to verify it fails**
  - Run: `npx vitest run web/src/components/ui/UserInfoBoard.test.tsx`
- [ ] **Step 3: Implement layout fix in `UserInfoBoard.tsx` and `PhoneShell.tsx`**
  - In `UserInfoBoard.tsx`:
    - Change the header container to `flex flex-col gap-1.5 border-b-2 border-[var(--outline)] pb-2`.
    - Make the role badge `w-full justify-center text-center break-words leading-snug`.
    - Make `USER:` and `MATRIKS:` rows `flex items-baseline gap-2 min-w-0` with `w-[72px] shrink-0` labels and `min-w-0 flex-1 break-words` value spans.
  - In `PhoneShell.tsx`:
    - Add `max-w-[140px] truncate` to `mobile-role-badge`.
- [ ] **Step 4: Run tests to verify they pass**
  - Run: `npx vitest run web/src/components/ui/UserInfoBoard.test.tsx`

---

### Task 2: Hide Unauthorized Controls on Attendance, Calendar, Today, Events, and Folder Links

**Files:**
- Modify: `web/src/features/attendance/AttendancePage.tsx`
- Modify: `web/src/features/attendance/AttendancePage.test.tsx`
- Modify: `web/src/features/classes/ClassesPage.tsx`
- Modify: `web/src/features/classes/TodayPage.tsx`
- Modify: `web/src/features/events/FolderLinksHeader.tsx`
- Modify: `web/src/features/events/EventsPage.tsx`
- Modify: `web/src/features/events/EventCard.tsx`

- [ ] **Step 1: Write failing tests for view-only Attendance and Events/Calendar permission gating**
  - In `web/src/features/attendance/AttendancePage.test.tsx`, add a test for a role with only `attendance.view.all` (no `attendance.edit`, no `export.download`) verifying that:
    - `SAVED ATTENDANCE — VIEW ONLY` is shown instead of `SAVED ATTENDANCE — PRESS EDIT TO CHANGE TICKS`.
    - `EDIT`, `⛶ FULL SCREEN`, `EXPORT XLSX`, and `OPEN ... SHEET ↗` are hidden.
- [ ] **Step 2: Run test to verify it fails**
  - Run: `npx vitest run web/src/features/attendance/AttendancePage.test.tsx`
- [ ] **Step 3: Implement permission gating in `AttendancePage.tsx`, `ClassesPage.tsx`, `TodayPage.tsx`, `FolderLinksHeader.tsx`, `EventsPage.tsx`, `EventCard.tsx`**
  - Gate `EDIT`, `FULL SCREEN`, `OPEN ... SHEET ↗`, and `EXPORT XLSX` in `AttendancePage.tsx`.
  - Gate `+ ADD CLASS`, `✎ EDIT CLASS`, session card click-to-edit, and `CREATE AN EVENT` in `ClassesPage.tsx`.
  - Gate `TAKE ATTENDANCE` / `VIEW ATTENDANCE` in `TodayPage.tsx`.
  - Gate Drive/Sheet links in `FolderLinksHeader.tsx`.
  - Gate `+ NEW EVENT`, `EDIT`, `SYNC NOW`, `ARCHIVE`, `UNARCHIVE`, `DELETE`, `RECREATE`, `RESPONSE SHEET ↗`, `GOOGLE FORM ↗`, and `OPEN` in `EventsPage.tsx` and `EventCard.tsx`.
- [ ] **Step 4: Run tests to verify they pass**
  - Run: `npx vitest run web/src/features/attendance/AttendancePage.test.tsx web/src/features/classes/ClassesPage.test.tsx web/src/features/events/EventsPage.test.tsx`

---

### Task 3: Hide Unauthorized Sections & Controls in Media, Members, and Mascot Notification Widget

**Files:**
- Modify: `web/src/features/media/MediaPage.tsx`
- Modify: `web/src/features/media/MediaPage.test.tsx`
- Modify: `web/src/features/members/MembersPage.tsx`
- Modify: `web/src/features/members/MembersPage.test.tsx`
- Modify: `web/src/components/ui/NotificationWidget.tsx`
- Modify: `web/src/components/ui/NotificationWidget.test.tsx`

- [ ] **Step 1: Write failing tests in `MediaPage.test.tsx`, `MembersPage.test.tsx`, and `NotificationWidget.test.tsx`**
  - In `MediaPage.test.tsx`: verify that a role with only `videos.view` (no `videos.upload`, `videos.edit`, `music.view`, `music.edit`) sees the Videos panel without `+ ADD RECAP`, `SCAN DRIVE FOLDER`, or `DELETE` buttons, and does NOT see the Music panel or `ClassLeadVideoFoldersPanel`.
  - In `MembersPage.test.tsx`: verify that a role with only `members.view` (no `export.download`, no `members.import`) does not see `EXPORT CSV` or `EDIT`.
  - In `NotificationWidget.test.tsx`: verify that an admin-login role with only `attendance.view.all` (like `ATTENDANCE VIEWER`) does not render the Mascot Notification widget or unauthorized admin tabs.
- [ ] **Step 2: Run tests to verify they fail**
  - Run: `npx vitest run web/src/features/media/MediaPage.test.tsx web/src/features/members/MembersPage.test.tsx web/src/components/ui/NotificationWidget.test.tsx`
- [ ] **Step 3: Implement permission gating in `MediaPage.tsx`, `MembersPage.tsx`, and `NotificationWidget.tsx`**
- [ ] **Step 4: Run tests to verify they pass**
  - Run: `npx vitest run web/src/features/media/MediaPage.test.tsx web/src/features/members/MembersPage.test.tsx web/src/components/ui/NotificationWidget.test.tsx`

---

### Task 4: Full Verification, Build & Deploy

- [ ] **Step 1: Run full test suite and production build**
  - Run: `npm test` and `npm run build`
- [ ] **Step 2: Commit and push to `origin/main` to deploy to Cloudflare Workers**
  - Run: `git push origin main`

