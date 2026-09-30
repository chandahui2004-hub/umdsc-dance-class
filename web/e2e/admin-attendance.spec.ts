import { test, expect } from '@playwright/test';
import { adminBootstrap } from './fixtures/mockData';

const API_URL_REGEX = /(script\.google\.com|:5173\/api($|\?))/;

const mockAttendanceGrid = {
  month: '2026-10',
  styleId: 'style-hiphop',
  version: 1,
  sessions: [
    {
      id: 'ses-1',
      month: '2026-10',
      styleId: 'style-hiphop',
      seq: 1,
      date: '2026-10-08',
      start: '20:00',
      end: '22:00',
      instructorId: 'inst-1',
      venue: 'Dance Room 1',
      status: 'scheduled',
      note: '',
      version: 1,
      updatedBy: 'admin',
      updatedAt: '2026-10-01T00:00:00.000Z',
      active: true
    },
    {
      id: 'ses-2',
      month: '2026-10',
      styleId: 'style-hiphop',
      seq: 2,
      date: '2026-10-15',
      start: '20:00',
      end: '22:00',
      instructorId: 'inst-1',
      venue: 'Dance Room 1',
      status: 'scheduled',
      note: '',
      version: 1,
      updatedBy: 'admin',
      updatedAt: '2026-10-01T00:00:00.000Z',
      active: true
    }
  ],
  members: [
    { memberId: 'm-1', fullName: 'SARAH BINTI AHMAD', matric: '22001111' },
    { memberId: 'm-2', fullName: 'ALEX TAN JIA WEI', matric: '22002222' }
  ],
  present: {
    'm-1': ['ses-1'],
    'm-2': []
  }
};

test.describe('Admin Attendance Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'umdsc:session',
        JSON.stringify({
          token: 'admin-tok',
          claims: {
            sub: 'admin',
            role: 'admin',
            name: 'Club Admin',
            exp: Math.floor(Date.now() / 1000) + 36000,
            pv: 1,
            perms: {
              'attendance.view.all': '*',
              'attendance.edit': '*',
              'export.download': '*'
            }
          }
        })
      );
    });
  });

  test('phone attendance: tapping a dancer turns row green and increments SCORE; request batches marks', async ({
    page
  }) => {
    let markCalls: any[] = [];

    await page.route(API_URL_REGEX, async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        if (body.action === 'admin.bootstrap') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: adminBootstrap,
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'styles.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: adminBootstrap.styles,
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'attendance.get') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: mockAttendanceGrid,
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'attendance.mark') {
          markCalls.push(body.payload);
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: {
                applied: body.payload.marks.map((m: any) => m.opId),
                version: 2
              },
              dataVersion: 2,
              serverTime: new Date().toISOString()
            })
          });
        }
      }
      return route.continue();
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/attendance?month=2026-10&style=style-hiphop');

    // Page title and score counter
    await expect(page.getByRole('heading', { name: /Attendance Tracker/i })).toBeVisible();
    await expect(page.getByText(/SCORE 1\/2/i)).toBeVisible();

    // Roster list shows Sarah (present) and Alex (absent)
    const alexRow = page.locator('[data-member-id="m-2"]');
    await expect(alexRow).toBeVisible();
    await expect(alexRow.getByRole('button', { name: /ABSENT/i })).toBeVisible();

    // Ticks are locked until EDIT is pressed
    await expect(alexRow.getByRole('button', { name: /ABSENT/i })).toBeDisabled();
    await page.getByRole('button', { name: /^EDIT$/ }).click();

    // Tap Alex to mark present
    await alexRow.getByRole('button', { name: /ABSENT/i }).click();

    // Alex should now show PRESENT (green) and score becomes 2/2
    await expect(alexRow.getByRole('button', { name: /PRESENT/i })).toBeVisible();
    await expect(page.getByText(/SCORE 2\/2/i)).toBeVisible();
    await expect(page.getByText(/1 UNSAVED CHANGE/i)).toBeVisible();

    // Nothing is sent until SUBMIT
    expect(markCalls.length).toBe(0);
    await page.getByRole('button', { name: /^SUBMIT$/ }).click();
    await expect.poll(() => markCalls.length).toBeGreaterThan(0);
    expect(markCalls[0].marks).toContainEqual(
      expect.objectContaining({
        memberId: 'm-2',
        sessionId: 'ses-1',
        present: true
      })
    );
  });

  test('desktop attendance grid renders at 1440 with sticky name column', async ({ page }) => {
    await page.route(API_URL_REGEX, async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        if (body.action === 'admin.bootstrap') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: adminBootstrap,
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'styles.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: adminBootstrap.styles,
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'attendance.get') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: mockAttendanceGrid,
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
      }
      return route.continue();
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/admin/attendance?month=2026-10&style=style-hiphop');

    // Desktop AttendanceGrid table is visible
    const gridTable = page.locator('table[data-testid="attendance-grid"]');
    await expect(gridTable).toBeVisible();

    // Sticky name column has sticky style or class
    const memberHeader = gridTable.locator('th.sticky');
    await expect(memberHeader.first()).toBeVisible();

    // Verify cell can be toggled
    const alexCell = gridTable.locator('[data-cell="m-2:ses-1"]');
    await expect(alexCell).toBeVisible();
  });

  test('offline tick shows SAVING… 1 and syncs when route is restored', async ({ page }) => {
    let markRequestReceived = false;
    let shouldFailMark = true;

    await page.route(API_URL_REGEX, async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        if (body.action === 'admin.bootstrap') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: adminBootstrap,
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'styles.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: adminBootstrap.styles,
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'attendance.get') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: mockAttendanceGrid,
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'attendance.mark') {
          if (shouldFailMark) {
            return route.abort('failed');
          }
          markRequestReceived = true;
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: {
                applied: body.payload.marks.map((m: any) => m.opId),
                version: 2
              },
              dataVersion: 2,
              serverTime: new Date().toISOString()
            })
          });
        }
      }
      return route.continue();
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/attendance?month=2026-10&style=style-hiphop');

    const alexRow = page.locator('[data-member-id="m-2"]');
    await expect(alexRow).toBeVisible();

    // Tick and submit while network fails for attendance.mark
    await page.getByRole('button', { name: /^EDIT$/ }).click();
    await alexRow.getByRole('button', { name: /ABSENT/i }).click();
    await page.getByRole('button', { name: /^SUBMIT$/ }).click();

    // "SAVING... 1" indicator appears
    await expect(page.getByText(/SAVING… 1/i)).toBeVisible();

    // Restore network
    shouldFailMark = false;

    // Eventually synced and saving badge clears
    await expect.poll(() => markRequestReceived).toBe(true);
    await expect(page.getByText(/SAVING…/i)).not.toBeVisible();
  });
});
