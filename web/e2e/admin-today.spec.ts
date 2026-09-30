import { test, expect } from '@playwright/test';
import { loginAsAdmin, mockApi, makeEvent } from './fixtures/mockApi';
import { adminBootstrap } from './fixtures/mockData';

const todayClass = (id: string, eventId: string, eventName: string, start: string) => ({
  id, eventId, eventName, styleId: 'style-hiphop', seq: 1, date: '2026-10-08', start, end: '22:00', instructorId: '',
  venue: 'Studio', status: 'scheduled', note: '', version: 1, updatedBy: 'admin', updatedAt: '', active: true
});

test.describe('Admin Today page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('lists today classes from two events, labelled by event', async ({ page }) => {
    const calls = await mockApi(page, {
      'styles.list': () => adminBootstrap.styles,
      'events.list': () => [makeEvent(), makeEvent({ id: 'evt-trial', name: 'TRIAL CLASS' })],
      'sessions.today': () => [
        todayClass('ses-a', 'evt-oct', 'OCT MONTHLY CLASS', '19:00'),
        todayClass('ses-b', 'evt-trial', 'TRIAL CLASS', '20:00')
      ]
    });
    await page.goto('/admin/today');
    await expect(page.getByText('Hip Hop Class 1 · OCT MONTHLY CLASS')).toBeVisible();
    await expect(page.getByText('Hip Hop Class 1 · TRIAL CLASS')).toBeVisible();
    expect(calls.some(c => c.action === 'sessions.today')).toBe(true);

    await page.getByRole('button', { name: /TAKE ATTENDANCE/i }).nth(1).click();
    await expect(page).toHaveURL(/\/admin\/attendance/);
    await expect(page.getByLabel('Current event')).toHaveValue('evt-trial');
  });

  test('no classes today says so', async ({ page }) => {
    await mockApi(page, { 'styles.list': () => adminBootstrap.styles, 'sessions.today': () => [] });
    await page.goto('/admin/today');
    await expect(page.getByText('NO CLASSES TODAY')).toBeVisible();
  });
});
