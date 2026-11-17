import { test, expect } from '@playwright/test';
import { loginAsAdmin, mockApi, makeEvent } from './fixtures/mockApi';
import { adminBootstrap } from './fixtures/mockData';

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
    await expect(active.getByText('SEP WORKSHOP')).toHaveCount(0);

    // Expand all active events to reveal cards, details, and errors
    await page.getByRole('button', { name: /EXPAND ALL/i }).click();
    await expect(active.getByText(/share it with umdancesportc@gmail.com/)).toBeVisible();

    await page.getByRole('button', { name: /ARCHIVED EVENTS/i }).click();
    await page.getByRole('button', { name: /2026 ARCHIVED EVENTS/i }).click();
    await expect(page.getByTestId('archived-events').getByText('SEP WORKSHOP')).toBeVisible();

    const oct = page.getByTestId('event-card-evt-oct');
    await oct.getByRole('button', { name: /SYNC NOW/i }).click();
    await expect(oct.getByText(/\+2 new/i)).toBeVisible();
    expect(calls.find(c => c.action === 'events.sync')?.payload).toMatchObject({ id: 'evt-oct' });

    page.once('dialog', d => d.accept());
    await oct.getByRole('button', { name: /^ARCHIVE$/i }).click();
    await expect.poll(() => calls.find(c => c.action === 'events.archive')?.payload).toEqual({ id: 'evt-oct', version: 1 });
  });

  test('archived cards have no edit or sync buttons', async ({ page }) => {
    await mockApi(page, { 'events.list': () => EVENTS });
    await page.goto('/admin/events');
    await page.getByRole('button', { name: /ARCHIVED EVENTS/i }).click();
    await page.getByRole('button', { name: /2026 ARCHIVED EVENTS/i }).click();
    await page.getByTestId('toggle-event-evt-old').click();
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
    await page.getByRole('button', { name: /EXPAND ALL/i }).click();
    await page.getByRole('button', { name: /RECREATE/i }).click();
    await expect.poll(() => calls.find(c => c.action === 'events.recreateFolder')?.payload).toEqual({ id: 'evt-oct' });
  });

  test('a folder that could not be moved is listed with a retry hint', async ({ page }) => {
    await mockApi(page, {
      'events.list': () => EVENTS,
      'styles.list': () => [],
      'settings.get': () => ({ defaultAttendanceFolderId: 'fld-master-a' }),
      'settings.setLink': () => ({
        __error: { code: 'VALIDATION', message: 'Could not move OCT MONTHLY CLASS: Access denied. Save the same link again to retry.' }
      })
    });
    await page.goto('/admin/settings');
    await page.waitForLoadState('networkidle');
    await page.locator('#default-attendance-folder-link').fill('fld-master-b');
    await page.getByRole('button', { name: /UPDATE ATTENDANCE LINK/i }).click();
    await expect(page.getByText(/Could not move OCT MONTHLY CLASS: Access denied/)).toBeVisible();
    await expect(page.getByText(/save the same link again to retry/i)).toBeVisible();
  });

  test('changing the attendance master folder reports moved folders', async ({ page }) => {
    const calls = await mockApi(page, {
      'events.list': () => EVENTS,
      'styles.list': () => [],
      'settings.get': () => ({ defaultAttendanceFolderId: 'fld-master-a' }),
      'settings.setLink': () => ({ key: 'defaultAttendanceFolderId', value: 'fld-master-b', moved: 2, created: 0, reused: 1 })
    });
    await page.goto('/admin/settings');
    await page.waitForLoadState('networkidle');
    await page.locator('#default-attendance-folder-link').fill('https://drive.google.com/drive/folders/fld-master-b');
    await page.getByRole('button', { name: /UPDATE ATTENDANCE LINK/i }).click();
    await expect(page.getByText(/LINK UPDATED SUCCESSFULLY!/i)).toBeVisible();
    expect(calls.find(c => c.action === 'settings.setLink')?.payload).toEqual({
      key: 'defaultAttendanceFolderId',
      url: 'https://drive.google.com/drive/folders/fld-master-b'
    });
  });

  test('reopens full class / closed form via REOPEN / + SLOTS modal', async ({ page }) => {
    let fullEvent = makeEvent({
      formUrl: 'https://docs.google.com/forms/d/f1/edit',
      formClosed: true,
      formClosedReason: 'capacity',
      styleIds: ['style-hiphop'],
      styleSlots: { 'style-hiphop': 20 },
      notifiedFullStyles: ['style-hiphop'],
      memberCount: 20
    });
    const openEvent = makeEvent({
      id: 'evt-open',
      name: 'NOV OPEN CLASS',
      formUrl: 'https://docs.google.com/forms/d/f2/edit',
      formClosed: false,
      styleIds: ['style-hiphop'],
      styleSlots: { 'style-hiphop': 25 },
      notifiedFullStyles: [],
      memberCount: 5
    });

    const calls = await mockApi(page, {
      'styles.list': () => adminBootstrap.styles,
      'events.list': () => [fullEvent, openEvent],
      'events.reopenFormSlots': p => {
        const added = Number(p?.addOnSlots?.['style-hiphop'] || 0);
        fullEvent = {
          ...fullEvent,
          formClosed: false,
          formClosedReason: 'none',
          styleSlots: { 'style-hiphop': 20 + added },
          notifiedFullStyles: []
        };
        return { event: fullEvent, styleSlots: fullEvent.styleSlots, formResult: { formClosed: false } };
      }
    });

    await page.goto('/admin/events');
    await page.getByRole('button', { name: /EXPAND ALL/i }).click();

    const reopenBtn = page.getByTestId('reopen-slots-btn-evt-oct');
    await expect(reopenBtn).toBeVisible();
    await expect(page.getByTestId('reopen-slots-btn-evt-open')).toHaveCount(0);

    await reopenBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/REOPEN & ADD SLOTS: OCT MONTHLY CLASS/i)).toBeVisible();
    await expect(dialog.getByText(/20 SLOTS/i)).toBeVisible();
    await expect(dialog.getByText(/FULL/i)).toBeVisible();

    const addOnInput = dialog.getByLabel(/Add-on slots for Hip Hop/i);
    await addOnInput.fill('5');
    await expect(dialog.getByText(/New limit: ≥ 25 slots \(reopens form\)/i)).toBeVisible();

    await dialog.getByRole('button', { name: /REOPEN FORM & ADD SLOTS/i }).click();

    await expect.poll(() => calls.find(c => c.action === 'events.reopenFormSlots')?.payload).toEqual({
      id: 'evt-oct',
      addOnSlots: { 'style-hiphop': 5 }
    });
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/Reopened Google Form \(\+5 slots added\)/i)).toBeVisible();
    await expect(page.getByTestId('form-status-evt-oct')).toHaveText(/FORM OPEN/i);
  });
});
