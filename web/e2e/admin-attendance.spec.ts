import { test, expect } from '@playwright/test';
import { loginAsAdmin, mockApi, makeEvent, API_URL_REGEX } from './fixtures/mockApi';
import { adminBootstrap } from './fixtures/mockData';

const STYLES = [
  adminBootstrap.styles[0],
  { ...adminBootstrap.styles[0], id: 'style-popping', name: 'Popping', aliases: ['popping'], colorKey: 'blue' },
  { ...adminBootstrap.styles[0], id: 'style-latin', name: 'Latin', aliases: ['latin'], colorKey: 'pink' }
];
const EVENT = makeEvent({ styleIds: ['style-hiphop', 'style-popping'] });

const session = (id: string, seq: number, date: string) => ({
  id, eventId: 'evt-oct', styleId: 'style-hiphop', seq, date, start: '20:00', end: '22:00', instructorId: 'inst-1',
  venue: 'Dance Room 1', status: 'scheduled', note: '', version: 1, updatedBy: 'admin', updatedAt: '2026-10-01T00:00:00.000Z', active: true
});

const GRID = {
  eventId: 'evt-oct',
  styleId: 'style-hiphop',
  version: 1,
  sessions: [session('ses-1', 1, '2026-10-08'), session('ses-2', 2, '2026-10-15')],
  members: [
    { memberId: 'm-1', fullName: 'SARAH BINTI AHMAD', matric: '22001111' },
    { memberId: 'm-2', fullName: 'ALEX TAN JIA WEI', matric: '22002222' }
  ],
  present: { 'm-1': ['ses-1'], 'm-2': [] }
};

const markOk = (p: any) => ({ applied: p.marks.map((m: any) => m.opId), version: 2 });

test.describe('Admin Attendance Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('shows only the event styles and sends ticks with the event id', async ({ page }) => {
    const calls = await mockApi(page, {
      'events.list': () => [EVENT],
      'styles.list': () => STYLES,
      'attendance.get': () => GRID,
      'attendance.mark': markOk
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/attendance');

    await expect(page.getByRole('button', { name: 'Hip Hop', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Popping', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Latin', exact: true })).toHaveCount(0);
    expect(calls.find(c => c.action === 'attendance.get')?.payload).toMatchObject({ eventId: 'evt-oct', styleId: 'style-hiphop' });

    await page.getByRole('button', { name: /^EDIT$/ }).click();
    await page.locator('[data-member-id="m-2"]').getByRole('button', { name: /ABSENT/i }).click();
    await page.getByRole('button', { name: /^SUBMIT$/ }).click();
    await expect.poll(() => calls.find(c => c.action === 'attendance.mark')?.payload?.eventId).toBe('evt-oct');
  });

  test('phone attendance: tapping a dancer turns row green and increments SCORE; request batches marks', async ({ page }) => {
    const calls = await mockApi(page, {
      'events.list': () => [EVENT],
      'styles.list': () => STYLES,
      'attendance.get': () => GRID,
      'attendance.mark': markOk
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/attendance');

    await expect(page.getByRole('heading', { name: /Attendance Tracker/i })).toBeVisible();
    await expect(page.getByText(/SCORE 1\/2/i)).toBeVisible();

    const alexRow = page.locator('[data-member-id="m-2"]');
    await expect(alexRow.getByRole('button', { name: /ABSENT/i })).toBeDisabled();
    await page.getByRole('button', { name: /^EDIT$/ }).click();
    await alexRow.getByRole('button', { name: /ABSENT/i }).click();
    await expect(alexRow.getByRole('button', { name: /PRESENT/i })).toBeVisible();
    await expect(page.getByText(/SCORE 2\/2/i)).toBeVisible();
    await expect(page.getByText(/1 UNSAVED CHANGE/i)).toBeVisible();

    expect(calls.some(c => c.action === 'attendance.mark')).toBe(false);
    await page.getByRole('button', { name: /^SUBMIT$/ }).click();
    await expect.poll(() => calls.find(c => c.action === 'attendance.mark')?.payload?.marks).toContainEqual(
      expect.objectContaining({ memberId: 'm-2', sessionId: 'ses-1', present: true })
    );
  });

  test('submit waits for the saved ticks: the old 0 count never flashes', async ({ page }) => {
    let serverPresent: Record<string, string[]> = { 'm-1': [], 'm-2': [] };
    let version = 1;
    let submitted = false;
    await mockApi(page, {
      'events.list': () => [EVENT],
      'styles.list': () => STYLES,
      'attendance.get': () => ({ ...GRID, version, present: serverPresent }),
      'attendance.mark': p => {
        submitted = true;
        const next = { ...serverPresent };
        for (const m of p.marks) {
          const cur = next[m.memberId] || [];
          next[m.memberId] = m.present ? [...cur, m.sessionId] : cur.filter((s: string) => s !== m.sessionId);
        }
        serverPresent = next;
        version += 1;
        return markOk(p);
      }
    });
    // Google Sheets is slow: the reload after submit takes a while
    await page.route(API_URL_REGEX, async route => {
      const body = JSON.parse(route.request().postData() || '{}');
      if (submitted && body.action === 'attendance.get') await new Promise(r => setTimeout(r, 1500));
      return route.fallback();
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/attendance');

    await expect(page.getByText(/SCORE 0\/2/i)).toBeVisible();
    await page.getByRole('button', { name: /^EDIT$/ }).click();
    await page.locator('[data-member-id="m-1"]').getByRole('button', { name: /ABSENT/i }).click();
    await page.locator('[data-member-id="m-2"]').getByRole('button', { name: /ABSENT/i }).click();
    await expect(page.getByText(/SCORE 2\/2/i)).toBeVisible();

    await page.evaluate(() => {
      (window as any).__sawZero = false;
      new MutationObserver(() => {
        if (/SCORE 0\/2/i.test(document.body.textContent || '')) (window as any).__sawZero = true;
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await page.getByRole('button', { name: /^SUBMIT$/ }).click();
    await expect(page.getByText(/SAVING TO GOOGLE SHEET/i)).toBeVisible();
    await expect(page.getByText(/SAVED ATTENDANCE/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/SCORE 2\/2/i)).toBeVisible();
    expect(await page.evaluate(() => (window as any).__sawZero)).toBe(false);
  });

  test('a refused save shows the server reason within seconds instead of retrying for minutes', async ({ page }) => {
    let marks = 0;
    await mockApi(page, {
      'events.list': () => [EVENT],
      'styles.list': () => STYLES,
      'attendance.get': () => GRID,
      'attendance.mark': () => {
        marks++;
        return { __error: { code: 'VALIDATION', message: 'Member m-2 is not registered in style style-hiphop' } };
      }
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/attendance');
    await page.getByRole('button', { name: /^EDIT$/ }).click();
    await page.locator('[data-member-id="m-2"]').getByRole('button', { name: /ABSENT/i }).click();
    const t0 = Date.now();
    await page.getByRole('button', { name: /^SUBMIT$/ }).click();

    await expect(page.getByRole('alert')).toHaveText(/Not saved: Member m-2 is not registered/, { timeout: 8000 });
    expect(Date.now() - t0).toBeLessThan(8000);
    expect(marks).toBe(1);
    await expect(page.getByText(/SAVING…/)).toHaveCount(0);
  });

  test('a lost reply (Google 404) is re-sent with the same tick IDs and ends saved', async ({ page }) => {
    let serverPresent: Record<string, string[]> = { 'm-1': ['ses-1'], 'm-2': [] };
    const seenOps: string[][] = [];
    await mockApi(page, {
      'events.list': () => [EVENT],
      'styles.list': () => STYLES,
      'attendance.get': () => ({ ...GRID, version: seenOps.length + 1, present: serverPresent }),
      'attendance.mark': p => {
        seenOps.push(p.marks.map((m: any) => m.opId));
        serverPresent = { ...serverPresent, 'm-2': ['ses-1'] };
        return markOk(p); // the fixed server confirms already-saved ticks again
      }
    });
    // Google loses the reply of the first save, after the server has already saved it
    await page.route(API_URL_REGEX, async route => {
      const body = JSON.parse(route.request().postData() || '{}');
      if (body.action === 'attendance.mark' && seenOps.length === 0) {
        seenOps.push(body.payload.marks.map((m: any) => m.opId));
        serverPresent = { ...serverPresent, 'm-2': ['ses-1'] };
        return route.fulfill({ status: 404, contentType: 'text/html', body: '<html>Not Found</html>' });
      }
      return route.fallback();
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/attendance');
    await page.getByRole('button', { name: /^EDIT$/ }).click();
    await page.locator('[data-member-id="m-2"]').getByRole('button', { name: /ABSENT/i }).click();
    await page.getByRole('button', { name: /^SUBMIT$/ }).click();

    await expect(page.getByText('SAVED ATTENDANCE — PRESS EDIT TO CHANGE TICKS')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/SCORE 2\/2/i)).toBeVisible();
    expect(seenOps.length).toBeGreaterThanOrEqual(2);
    expect(seenOps[1]).toEqual(seenOps[0]);
  });

  test('an expired sign-in during SUBMIT goes to the login page, then back, and the ticks are saved', async ({ page }) => {
    let signedInAgain = false;
    const saved: any[] = [];
    const calls = await mockApi(page, {
      'events.list': () => [EVENT],
      'styles.list': () => STYLES,
      'attendance.get': () => GRID,
      'auth.adminLogin': () => {
        signedInAgain = true;
        return { token: 'fresh-tok', claims: { sub: 'admin', role: 'admin', name: 'Club Admin', exp: Math.floor(Date.now() / 1000) + 36000, pv: 2,
          perms: { 'attendance.edit': '*', 'attendance.view.all': '*', 'export.download': '*', 'members.view': '*', 'calendar.view': '*', 'sessions.edit': '*' } } };
      },
      'attendance.mark': p => {
        if (!signedInAgain) return { __error: { code: 'UNAUTHORIZED', message: 'Session expired due to permission update, please re-login' } };
        saved.push(...p.marks);
        return markOk(p);
      }
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/attendance');
    await page.getByRole('button', { name: /^EDIT$/ }).click();
    await page.locator('[data-member-id="m-2"]').getByRole('button', { name: /ABSENT/i }).click();
    await page.getByRole('button', { name: /^SUBMIT$/ }).click();

    await page.waitForURL('**/admin/login', { timeout: 15000 });
    await expect(page.getByText(/Your sign-in expired/)).toBeVisible();
    await page.getByLabel(/Username/i).fill('admin');
    await page.getByLabel('Password', { exact: true }).fill('pw');
    await page.getByRole('button', { name: /LOGIN|ENTER/i }).click();

    await page.waitForURL('**/admin/attendance', { timeout: 15000 });
    await expect.poll(() => saved.some(m => m.memberId === 'm-2' && m.present === true), { timeout: 20000 }).toBe(true);
    expect(calls.filter(c => c.action === 'auth.adminLogin')).toHaveLength(1);
  });

  test('desktop attendance grid renders at 1440 with sticky name column', async ({ page }) => {
    await mockApi(page, { 'events.list': () => [EVENT], 'styles.list': () => STYLES, 'attendance.get': () => GRID });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/admin/attendance');

    const gridTable = page.locator('table[data-testid="attendance-grid"]');
    await expect(gridTable).toBeVisible();
    await expect(gridTable.locator('th.sticky').first()).toBeVisible();
    await expect(gridTable.locator('[data-cell="m-2:ses-1"]')).toBeVisible();
  });

  test('offline tick shows SAVING… 1 and syncs when route is restored', async ({ page }) => {
    let fail = true;
    let received = false;
    await mockApi(page, {
      'events.list': () => [EVENT],
      'styles.list': () => STYLES,
      'attendance.get': () => GRID,
      'attendance.mark': p => {
        if (fail) return { __error: { code: 'BUSY', message: 'busy' } };
        received = true;
        return markOk(p);
      }
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/attendance');

    await page.getByRole('button', { name: /^EDIT$/ }).click();
    await page.locator('[data-member-id="m-2"]').getByRole('button', { name: /ABSENT/i }).click();
    await page.getByRole('button', { name: /^SUBMIT$/ }).click();
    await expect(page.getByText(/SAVING… 1/i)).toBeVisible();

    fail = false;
    await expect.poll(() => received, { timeout: 30_000 }).toBe(true);
    await expect(page.getByText(/SAVING…/i)).not.toBeVisible();
  });

  test('with no events, points to creating one', async ({ page }) => {
    await mockApi(page, { 'events.list': () => [], 'styles.list': () => STYLES });
    await page.goto('/admin/attendance');
    await expect(page.getByRole('link', { name: /CREATE AN EVENT/i })).toBeVisible();
  });
});
