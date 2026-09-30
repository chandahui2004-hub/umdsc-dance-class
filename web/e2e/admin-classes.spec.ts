import { test, expect } from '@playwright/test';
import { loginAsAdmin, mockApi, makeEvent } from './fixtures/mockApi';
import { adminBootstrap } from './fixtures/mockData';

const EVENT = makeEvent({ styleIds: ['style-hiphop'] });
const session = (id: string, date = '2026-10-08') => ({
  id, eventId: 'evt-oct', styleId: 'style-hiphop', seq: 1, date, start: '20:00', end: '22:00', instructorId: 'inst-1',
  venue: 'Dance Room 1', status: 'scheduled', note: '', version: 1, updatedBy: 'admin', updatedAt: '2026-10-01T00:00:00.000Z', active: true
});
const BASE = { 'events.list': () => [EVENT], 'styles.list': () => adminBootstrap.styles };

test.describe('Admin Classes & Calendar', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('lists the event classes and adds a class on the selected day', async ({ page }) => {
    const calls = await mockApi(page, {
      ...BASE,
      'sessions.list': () => [session('ses-1')],
      'sessions.create': p => ({ ...session('ses-new', p.date), seq: p.seq })
    });
    await page.goto('/admin/calendar');
    await expect(page.getByRole('heading', { name: /Calendar/i })).toBeVisible();
    await expect.poll(() => calls.find(c => c.action === 'sessions.list')?.payload).toEqual({ eventId: 'evt-oct' });
    await expect(page.getByText('1 classes in OCT MONTHLY CLASS')).toBeVisible();

    await page.getByRole('button', { name: /Thu 15 Oct/ }).click();
    await page.getByLabel('Style for new class').selectOption('style-hiphop');
    await page.getByRole('button', { name: /ADD CLASS ON 2026-10-15/ }).click();
    await expect.poll(() => calls.find(c => c.action === 'sessions.create')?.payload).toMatchObject({
      eventId: 'evt-oct',
      styleId: 'style-hiphop',
      seq: 2,
      date: '2026-10-15'
    });
  });

  test('dates outside the event cannot be picked', async ({ page }) => {
    await mockApi(page, { ...BASE, 'sessions.list': () => [session('ses-1')] });
    await page.goto('/admin/calendar');
    await expect(page.getByText('OCTOBER 2026')).toBeVisible();
    await expect(page.getByRole('button', { name: /next month/i })).toHaveCount(0);
    await page.getByText(/Hip Hop Class 1/i).first().click();
    const date = page.getByLabel(/Date/i);
    await expect(date).toHaveAttribute('min', '2026-10-01');
    await expect(date).toHaveAttribute('max', '2026-10-31');
  });

  test('moving a session via the calendar calls sessions.update with the new date and keeps the same id', async ({ page }) => {
    const calls = await mockApi(page, {
      ...BASE,
      'sessions.list': () => [session('ses-move-1')],
      'sessions.update': p => ({ ...p, version: 2 })
    });
    await page.goto('/admin/calendar');
    await page.getByText(/Hip Hop Class 1/i).first().click();
    await page.getByLabel(/Date/i).fill('2026-10-09');
    await page.getByRole('button', { name: /SAVE CHANGES/i }).click();
    await expect.poll(() => calls.find(c => c.action === 'sessions.update')?.payload).toMatchObject({ id: 'ses-move-1', date: '2026-10-09' });
  });

  test('VERSION_CONFLICT shows reload/overwrite dialog', async ({ page }) => {
    let attempts = 0;
    await mockApi(page, {
      ...BASE,
      'sessions.list': () => [session('ses-conflict-1')],
      'sessions.update': p => {
        attempts++;
        return attempts === 1 ? { __error: { code: 'VERSION_CONFLICT', message: 'Conflict' } } : { ...p, version: 3 };
      }
    });
    await page.goto('/admin/calendar');
    await page.getByText(/Hip Hop Class 1/i).first().click();
    await page.getByRole('button', { name: /SAVE CHANGES/i }).click();
    await expect(page.getByText(/modified by someone else|Changed by/i)).toBeVisible();
  });
});
