import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsClassRep, mockApi, makeEvent } from './fixtures/mockApi';
import { adminBootstrap } from './fixtures/mockData';

const TEST_EVENT = makeEvent({
  id: 'evt-rep-test',
  name: 'OCTOBER WORKSHOP',
  nameKey: 'october workshop',
  status: 'active',
  styleIds: ['style-hiphop']
});

test.describe('Class Rep Role & Dynamic Admin Access Control', () => {
  test('Class Rep signs in and is directed straight to Attendance with restricted navigation', async ({ page }) => {
    let loginCalled = false;

    await mockApi(page, {
      'auth.adminLogin': ({ username, password }) => {
        loginCalled = true;
        expect(username).toBe('classrep');
        expect(password).toBe('ClassRep123!');
        return {
          token: 'tok-classrep-123',
          claims: {
            sub: 'classrep',
            role: 'admin',
            roleName: 'Class Rep',
            name: 'Class Rep',
            exp: Math.floor(Date.now() / 1000) + 36000,
            pv: 1,
            perms: {
              'attendance.view.all': '*',
              'attendance.edit': '*',
              'export.download': '*'
            }
          },
          bootstrap: {
            ...adminBootstrap,
            events: [TEST_EVENT]
          }
        };
      },
      'admin.bootstrap': () => ({
        ...adminBootstrap,
        events: [TEST_EVENT]
      }),
      'attendance.get': () => ({
        eventId: 'evt-rep-test',
        styleId: 'style-hiphop',
        version: 1,
        sessions: [],
        members: [],
        present: {}
      })
    });

    await page.goto('/admin/login');

    // Fill in credentials
    await page.fill('input[autocomplete="username"]', 'classrep');
    await page.fill('input[type="password"]', 'ClassRep123!');
    await page.click('button[type="submit"]');

    // Verify redirected directly to /admin/attendance (not /admin/calendar)
    await page.waitForURL('**/admin/attendance');
    expect(page.url()).toContain('/admin/attendance');
    expect(loginCalled).toBe(true);

    // Verify role badge displays CLASS REP
    const roleBadge = page.locator('[data-testid="user-role-badge"], [data-testid="mobile-role-badge"]').first();
    await expect(roleBadge).toHaveText(/CLASS REP/i);

    // Verify that Calendar and More are NOT present in navigation
    const calendarTab = page.locator('a[href="/admin/calendar"]');
    await expect(calendarTab).toHaveCount(0);

    const mediaTab = page.locator('a[href="/admin/media"]');
    await expect(mediaTab).toHaveCount(0);

    // Verify Attendance tab is present
    const attendanceTab = page.locator('a[href="/admin/attendance"]');
    await expect(attendanceTab.first()).toBeVisible();
  });

  test('Class Rep attempting to access unauthorized routes (/admin/calendar, /admin/settings) is auto-redirected to /admin/attendance', async ({ page }) => {
    await loginAsClassRep(page);

    await mockApi(page, {
      'admin.bootstrap': () => ({
        ...adminBootstrap,
        events: [TEST_EVENT]
      }),
      'attendance.get': () => ({
        eventId: 'evt-rep-test',
        styleId: 'style-hiphop',
        version: 1,
        sessions: [],
        members: [],
        present: {}
      })
    });

    // Direct URL navigation to /admin/calendar
    await page.goto('/admin/calendar');
    await page.waitForURL('**/admin/attendance');
    expect(page.url()).toContain('/admin/attendance');

    // Direct URL navigation to /admin/settings
    await page.goto('/admin/settings');
    await page.waitForURL('**/admin/attendance');
    expect(page.url()).toContain('/admin/attendance');

    // Role badge check
    const roleBadge = page.locator('[data-testid="user-role-badge"], [data-testid="mobile-role-badge"]').first();
    await expect(roleBadge).toHaveText(/CLASS REP/i);
  });

  test('Club Admin retains full navigation access and can view Roles management', async ({ page }) => {
    await loginAsAdmin(page);

    await mockApi(page, {
      'admin.bootstrap': () => ({
        ...adminBootstrap,
        events: [TEST_EVENT]
      }),
      'roles.list': () => [
        {
          id: 'role_admin',
          name: 'Admin',
          description: 'Superadmin',
          loginType: 'admin',
          isSystem: true,
          version: 1,
          permissions: ['admins.manage', 'roles.manage']
        },
        {
          id: 'role_class_rep',
          name: 'Class Rep',
          description: 'Attendance Taker',
          loginType: 'admin',
          isSystem: true,
          version: 1,
          permissions: ['attendance.view.all', 'attendance.edit', 'export.download']
        }
      ],
      'styles.list': () => []
    });

    await page.goto('/admin/calendar');
    await expect(page).toHaveURL(/\/admin\/calendar/);

    // All primary tabs should be available for Super Admin
    await expect(page.locator('a[href="/admin/calendar"]').first()).toBeVisible();
    await expect(page.locator('a[href="/admin/attendance"]').first()).toBeVisible();

    // Navigate to /admin/roles
    await page.goto('/admin/roles');
    await expect(page).toHaveURL(/\/admin\/roles/);
    await expect(page.getByRole('heading', { name: 'Roles & Permissions' })).toBeVisible();
    await expect(page.getByText('Class Rep').first()).toBeVisible();
  });
});
