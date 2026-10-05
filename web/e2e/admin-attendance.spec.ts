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
