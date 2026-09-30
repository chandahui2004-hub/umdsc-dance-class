import { test, expect } from '@playwright/test';
import { loginAsAdmin, mockApi, makeEvent } from './fixtures/mockApi';

const EVENTS = [
  makeEvent(),
  makeEvent({ id: 'evt-trial', name: 'TRIAL CLASS 2027', type: 'trial', startDate: '2027-01-05', endDate: '2027-01-07', lastSyncError: "Can't read the form — share it with umdancesportc@gmail.com as Editor" }),
  makeEvent({ id: 'evt-old', name: 'SEP WORKSHOP', type: 'workshop', status: 'archived', startDate: '2026-09-01', endDate: '2026-09-02' })
];

test.describe('Admin Events page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('lists active and archived events, syncs and archives', async ({ page }) => {
    const calls = await mockApi(page, {
      'events.list': () => EVENTS,
      'events.sync': () => ({ changed: true, added: 2, updated: 0, flaggedRemoved: 0, memberCount: 5, unknownClasses: [] }),
      'events.archive': () => ({ ...EVENTS[0], status: 'archived' })
    });

    await page.goto('/admin/events');

    const active = page.getByTestId('active-events');
    await expect(active.getByText('OCT MONTHLY CLASS')).toBeVisible();
    await expect(active.getByText('TRIAL CLASS 2027')).toBeVisible();
    await expect(active.getByText(/share it with umdancesportc@gmail.com/)).toBeVisible();
    await expect(active.getByText('SEP WORKSHOP')).toHaveCount(0);

    await page.getByRole('button', { name: /ARCHIVED EVENTS/i }).click();
    await expect(page.getByTestId('archived-events').getByText('SEP WORKSHOP')).toBeVisible();

    const oct = page.getByTestId('event-card-evt-oct');
    await oct.getByRole('button', { name: /SYNC NOW/i }).click();
    await expect(oct.getByText(/\+2 new/i)).toBeVisible();
    expect(calls.find(c => c.action === 'events.sync')?.payload).toEqual({ id: 'evt-oct' });

    page.once('dialog', d => d.accept());
    await oct.getByRole('button', { name: /^ARCHIVE$/i }).click();
    await expect.poll(() => calls.find(c => c.action === 'events.archive')?.payload).toEqual({ id: 'evt-oct', version: 1 });
  });

  test('archived cards have no edit or sync buttons', async ({ page }) => {
    await mockApi(page, { 'events.list': () => EVENTS });
    await page.goto('/admin/events');
    await page.getByRole('button', { name: /ARCHIVED EVENTS/i }).click();
    const old = page.getByTestId('event-card-evt-old');
    await expect(old.getByRole('button', { name: /UNARCHIVE/i })).toBeVisible();
    await expect(old.getByRole('button', { name: /SYNC NOW/i })).toHaveCount(0);
    await expect(old.getByRole('button', { name: /^EDIT$/i })).toHaveCount(0);
  });

  test('a missing folder offers Recreate', async ({ page }) => {
    const calls = await mockApi(page, {
      'events.list': () => [makeEvent({ folderMissing: true })],
      'events.recreateFolder': () => makeEvent()
    });
    await page.goto('/admin/events');
    await page.getByRole('button', { name: /RECREATE/i }).click();
    await expect.poll(() => calls.find(c => c.action === 'events.recreateFolder')?.payload).toEqual({ id: 'evt-oct' });
  });

  test('changing the attendance master folder reports moved folders', async ({ page }) => {
    const calls = await mockApi(page, {
      'settings.get': () => ({ defaultAttendanceFolderId: 'fld-master-a' }),
      'settings.setLink': () => ({ key: 'defaultAttendanceFolderId', value: 'fld-master-b', moved: 2, created: 0, reused: 1 })
    });
    await page.goto('/admin/events');
    await page.getByRole('button', { name: /CHANGE ATTENDANCE FOLDER/i }).click();
    await page.getByLabel(/Attendance master folder link/i).fill('https://drive.google.com/drive/folders/fld-master-b');
    await page.getByRole('button', { name: /^SAVE$/i }).click();
    await expect(page.getByText('Moved 2, created 0, reused 1 event folders')).toBeVisible();
    expect(calls.find(c => c.action === 'settings.setLink')?.payload).toEqual({
      key: 'defaultAttendanceFolderId',
      url: 'https://drive.google.com/drive/folders/fld-master-b'
    });
  });
});
