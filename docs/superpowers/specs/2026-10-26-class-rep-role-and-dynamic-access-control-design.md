# Class Rep Role & Dynamic Admin Access Control Specification

## 1. Executive Summary

This feature introduces a dedicated **Class Rep** role (attendance taker only) and establishes a dynamic, permission-driven access control architecture for the UMDSC Admin Portal.
Users logging in through the Admin Portal (`/admin/login`) will have their portal experience, navigation tabs, and accessible routes dynamically filtered according to their assigned role's permissions. This allows the club to safely delegate attendance marking and reporting to class representatives without granting access to member directories, system settings, financial/session management, or media configurations.

---

## 2. User & System Requirements

1. **Class Rep Role Definition**:
   - Role ID: `role_class_rep`
   - Role Name: `Class Rep`
   - Login Type: `admin` (authenticates via `/admin/login`)
   - System Role: `true` (built-in, protected from accidental deletion)
   - Permissions Granted:
     - `attendance.view.all`: View attendance roster and grid for all styles/events
     - `attendance.edit`: Mark/edit attendance ticks
     - `export.download`: Download attendance spreadsheet as Excel (`.xlsx`)
2. **Dynamic Admin Shell Navigation**:
   - Tabs in `DesktopShell` (Sidebar) and `PhoneShell` (Bottom TabBar & More menu) must only display routes the authenticated user has permission to access.
   - For a `Class Rep`, the only visible tab in the bottom bar or sidebar is **Attendance** (no Calendar, Media, Dancers, or More menu).
3. **Intelligent Route Guards & Landing Page**:
   - On login via `/admin/login`, users are routed to their first permitted route (e.g. `/admin/attendance` for Class Rep) instead of hardcoded `/admin/calendar`.
   - Direct URL access to unauthorized admin routes automatically redirects to the user's first permitted route.
4. **Dynamic Role Badge Display**:
   - The status bar in `PhoneShell`, `DesktopShell`, and `UserInfoBoard` will display the actual role name (e.g. `CLASS REP`, `ADMIN`, or custom role names) rather than a hardcoded `ADMIN` label.
5. **Admin Role Creation & Delegation**:
   - Club Administrators (`Admin` role) can continue to create new custom admin roles via `/admin/roles` with any combination of permissions and assign users via `/admin/admins`.
6. **Initial Test Account**:
   - Username: `classrep`
   - Password: `ClassRep123!`
   - Role: `Class Rep` (`role_class_rep`)

---

## 3. Architecture & Data Flow

### 3.1 Token Claims & Identity
In `@umdsc/shared/src/types.ts`:
```ts
export interface TokenClaims {
  sub: string;
  role: 'admin' | 'dancer';
  name: string;
  roleName?: string;
  roleId?: string;
  exp: number;
  pv: number;
  perms: PermMap;
}
```

In `api/src/features/auth.ts`:
When `auth.adminLogin` succeeds:
1. Lookup the admin user's role from `directory.roles` / `ctx.db.roles`.
2. Populate `roleName: role?.name || 'Admin'` and `roleId: admin.roleId` into `TokenClaims`.
3. Sign token and return `claims` + `bootstrap`.

### 3.2 Permission-to-Route Mapping
In `web/src/lib/permissions.ts`:
Define map of admin routes to required permissions:
```ts
export const ADMIN_ROUTE_PERMS: Record<string, PermissionCode[]> = {
  '/admin/calendar': ['calendar.view', 'sessions.edit'],
  '/admin/attendance': ['attendance.view.all', 'attendance.edit'],
  '/admin/media': ['videos.view', 'videos.upload', 'videos.edit', 'music.view', 'music.edit'],
  '/admin/members': ['members.view', 'members.import'],
  '/admin/events': ['calendar.view', 'sessions.edit'],
  '/admin/styles': ['styles.edit'],
  '/admin/instructors': ['instructors.edit'],
  '/admin/roles': ['roles.manage'],
  '/admin/admins': ['admins.manage'],
  '/admin/settings': ['settings.edit']
};
```
A route is accessible if the user possesses **at least one** matching permission for that route.

### 3.3 Dynamic Navigation & Redirection
- `canAccessRoute(pathname: string, perms: PermMap): boolean`
- `getFirstPermittedAdminRoute(perms: PermMap): string`
- `filterPermittedTabs(tabs: TabDef[], perms: PermMap): TabDef[]`
- `filterPermittedMoreItems(items: NavSubItem[], perms: PermMap): NavSubItem[]`

---

## 4. Testing & Verification

1. **Unit Tests (Vitest)**:
   - `api/test/features/access.test.ts`: Class Rep role seeding, permission resolution, and admin account creation.
   - `api/test/features/auth.test.ts`: Admin login returns `roleName` and `roleId` in claims.
   - `web/src/lib/permissions.test.ts`: Route permission checks and first-permitted route determination.
   - `web/src/app/routes.test.tsx`: Route guards redirecting unauthorized access to permitted route.
   - `web/src/components/ui/UserInfoBoard.test.tsx`: Role name badge display.
2. **E2E Tests (Playwright)**:
   - Mobile and Desktop testing for `classrep`:
     - Sign in at `/admin/login` with `classrep` / `ClassRep123!`.
     - Verify landing directly at `/admin/attendance`.
     - Verify only Attendance tab is visible in navigation.
     - Verify role badge displays `CLASS REP`.
     - Attempt to navigate to `/admin/calendar` or `/admin/settings` -> auto-redirects back to `/admin/attendance`.
     - Mark attendance and verify success.
     - Sign in as `clubadmin` -> verify full access and ability to create new custom admin roles.
