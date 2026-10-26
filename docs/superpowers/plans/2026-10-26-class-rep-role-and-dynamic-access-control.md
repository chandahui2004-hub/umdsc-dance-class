# Class Rep Role & Dynamic Admin Access Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a dedicated attendance-only **Class Rep** role and dynamic permission-driven navigation across the Admin Portal, allowing class reps to sign in via the admin login page, access only the Attendance page (view, mark, and export), and display a distinct role badge, while enabling admins to dynamically create future custom admin roles.

**Architecture:**
- Shared Types: Add `roleName?: string` and `roleId?: string` to `TokenClaims` in `@umdsc/shared`.
- Backend (GAS / API):
  - In `api/src/features/setup.ts`, seed the built-in system role `Class Rep` (`role_class_rep`) with permissions `attendance.view.all`, `attendance.edit`, and `export.download`.
  - In `api/src/features/auth.ts`, populate `roleName` and `roleId` in admin token claims on login and bootstrap.
- Frontend Permissions & Shell:
  - In `web/src/lib/permissions.ts`, add route-permission mappings, `canAccessRoute`, and `getFirstPermittedAdminRoute`.
  - In `web/src/app/routes.tsx`, dynamically filter `ADMIN_TABS` and `ADMIN_MORE_ITEMS` by `claims.perms` and enforce route guards that redirect unauthorized paths to the first permitted route.
  - In `web/src/features/auth/AdminLogin.tsx`, redirect newly authenticated users to `getFirstPermittedAdminRoute` instead of unconditionally to `/admin/calendar`.
  - In `PhoneShell.tsx`, `DesktopShell.tsx`, and `UserInfoBoard.tsx`, display the dynamic role name (e.g. `CLASS REP`) on role badges.
- Roles Management:
  - Verify `RolesPage.tsx` and `AdminsPage.tsx` for creating custom admin roles with granular permissions.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vitest, Playwright, Cloudflare Workers static hosting, Google Apps Script API.

**Spec:** [docs/superpowers/specs/2026-10-26-class-rep-role-and-dynamic-access-control-design.md](file:///c:/Users/user/Downloads/UMDSC%20Design/UMDSC%20Dance%20Class%20System/docs/superpowers/specs/2026-10-26-class-rep-role-and-dynamic-access-control-design.md)

---

## Global Constraints
- Preserve 8-bit retro cyberpunk aesthetic per spec §13.1.
- Never modify or corrupt live database rows or club configurations outside of testing.
- Test user credentials for Class Rep: `classrep` / `ClassRep123!`.
- All automated unit and E2E tests must pass before completion.

---

### Task 1: Shared TokenClaims & Backend Role Seeding

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `api/src/features/setup.ts`
- Modify: `api/src/features/auth.ts`
- Modify: `api/src/features/adminAccounts.ts`
- Test: `api/test/features/access.test.ts`
- Test: `api/test/features/auth.test.ts`

- [ ] **Step 1: Write failing test in `api/test/features/access.test.ts`**
  Assert that setup or role directory provides a built-in `role_class_rep` role with `attendance.view.all`, `attendance.edit`, and `export.download`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -w api -- test/features/access.test.ts`
  Expected: FAIL

- [ ] **Step 3: Update `shared/src/types.ts`**
  Add `roleName?: string; roleId?: string;` to `TokenClaims`. Run `npm run build -w shared`.

- [ ] **Step 4: Update `api/src/features/setup.ts` & `api/src/features/auth.ts`**
  - In `setup.ts`, insert `role_class_rep` system role with permissions `attendance.view.all`, `attendance.edit`, and `export.download`.
  - In `auth.ts`, resolve `roleName` from `admin.roleId` and attach to `claims`.
  - In `adminAccounts.ts`, ensure `directory.roles` caches role names alongside permissions.

- [ ] **Step 5: Run tests to verify they pass**
  Run: `npm test -w api -- test/features/access.test.ts test/features/auth.test.ts`
  Expected: PASS

---

### Task 2: Frontend Route Permissions & Dynamic Filtering Logic

**Files:**
- Modify: `web/src/lib/permissions.ts`
- Test: `web/src/lib/permissions.test.ts`

- [ ] **Step 1: Write failing tests in `web/src/lib/permissions.test.ts`**
  Test `canAccessRoute`, `getFirstPermittedAdminRoute`, `filterPermittedTabs`, and `filterPermittedMoreItems` for:
  - Superadmin (`*` perms): All routes and tabs allowed.
  - Class Rep (`attendance.edit`, `attendance.view.all`, `export.download`): Only `/admin/attendance` allowed, `getFirstPermittedAdminRoute` returns `/admin/attendance`, tabs only include Attendance.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -w web -- src/lib/permissions.test.ts`
  Expected: FAIL

- [ ] **Step 3: Implement helpers in `web/src/lib/permissions.ts`**
  Implement:
  - `ADMIN_ROUTE_PERMS` mapping
  - `canAccessRoute(pathname: string, perms: PermMap): boolean`
  - `getFirstPermittedAdminRoute(perms: PermMap): string`
  - `filterPermittedTabs(tabs: TabDef[], perms: PermMap): TabDef[]`
  - `filterPermittedMoreItems(items: NavSubItem[], perms: PermMap): NavSubItem[]`

- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm test -w web -- src/lib/permissions.test.ts`
  Expected: PASS

---

### Task 3: Shell Navigation, Route Guards & Dynamic Role Badges

**Files:**
- Modify: `web/src/app/routes.tsx`
- Modify: `web/src/features/auth/AdminLogin.tsx`
- Modify: `web/src/app/PhoneShell.tsx`
- Modify: `web/src/components/ui/UserInfoBoard.tsx`
- Test: `web/src/app/routes.test.tsx`
- Test: `web/src/components/ui/UserInfoBoard.test.tsx`

- [ ] **Step 1: Write failing tests for route guards and role badge display**
  - In `web/src/app/routes.test.tsx`, assert that a user with only attendance permissions visiting `/admin/calendar` is redirected to `/admin/attendance`.
  - In `web/src/components/ui/UserInfoBoard.test.tsx`, assert that role badge displays `claims.roleName` (e.g. "CLASS REP").

- [ ] **Step 2: Run tests to verify failure**
  Run: `npm test -w web -- src/app/routes.test.tsx src/components/ui/UserInfoBoard.test.tsx`
  Expected: FAIL

- [ ] **Step 3: Implement shell filtering, guards, and badges**
  - In `routes.tsx`:
    - Read `currentSession.claims.perms`.
    - Pass filtered tabs and moreItems to `ShellLayout`.
    - In `<Route path="/admin/*">`, wrap routes with a permission check that redirects to `getFirstPermittedAdminRoute(claims.perms)` if `!canAccessRoute(location.pathname, claims.perms)`.
  - In `AdminLogin.tsx`:
    - Replace hardcoded `/admin/calendar` fallback with `getFirstPermittedAdminRoute(claims.perms)`.
  - In `PhoneShell.tsx` and `UserInfoBoard.tsx`:
    - Display `claims.roleName?.toUpperCase() || (isAdmin ? 'ADMIN' : 'DANCER')` on the role badge.

- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm test -w web -- src/app/routes.test.tsx src/components/ui/UserInfoBoard.test.tsx`
  Expected: PASS

---

### Task 4: Roles & Admins Management UI Verification

**Files:**
- Test: `web/src/features/access/RolesPage.test.tsx`
- Test: `web/src/features/access/AdminsPage.test.tsx`

- [ ] **Step 1: Write tests for role creation and assignment**
  - Test that `RolesPage` renders all roles (including Class Rep), allows creating new admin-type roles, and configuring permissions in the matrix.
  - Test that `AdminsPage` lists the Class Rep role in the role dropdown and creates accounts with that role.

- [ ] **Step 2: Run tests and ensure components pass**
  Run: `npm test -w web -- src/features/access/RolesPage.test.tsx src/features/access/AdminsPage.test.tsx`
  Expected: PASS

---

### Task 5: End-to-End Playwright Testing

**Files:**
- Create: `web/e2e/class-rep-role.spec.ts`

- [ ] **Step 1: Implement comprehensive E2E test suite**
  - Test login with `classrep` / `ClassRep123!`:
    - Verify redirect to `/admin/attendance`.
    - Verify role badge reads `CLASS REP`.
    - Verify only Attendance tab is rendered in the bottom bar / sidebar (no Calendar, Media, Dancers, More).
    - Verify direct navigation to `/admin/calendar` automatically redirects back to `/admin/attendance`.
    - Verify attendance grid loads and attendance can be marked.
  - Test login with `clubadmin`:
    - Verify full navigation bar with all tabs.
    - Verify access to `/admin/roles` and creating a new custom admin role.

- [ ] **Step 2: Run Playwright E2E suite**
  Run: `npx playwright test e2e/class-rep-role.spec.ts`
  Expected: PASS (Mobile & Desktop)

---

### Task 6: Full Verification, Commit & Publish

- [ ] **Step 1: Run all unit and integration tests**
  Run: `npm test -ws --if-present`
  Expected: All test suites PASS.

- [ ] **Step 2: Run full build**
  Run: `npm run build`
  Expected: Zero TypeScript or Vite bundle errors.

- [ ] **Step 3: Commit and deploy**
  - Commit changes to `feat/neon-pixel-ui` and `main`.
  - Push to GitHub remote to trigger Cloudflare Workers live update.
