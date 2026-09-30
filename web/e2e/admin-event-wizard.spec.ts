import { test, expect } from '@playwright/test';
import { loginAsAdmin, mockApi, makeEvent } from './fixtures/mockApi';
import { adminBootstrap } from './fixtures/mockData';

const STYLES = [
  adminBootstrap.styles[0],
  { ...adminBootstrap.styles[0], id: 'style-popping', name: 'Popping', aliases: ['popping'], colorKey: 'blue' }
];

const PREVIEW = {
  headers: ['Timestamp', 'Full Name', 'Matric Number', 'Contact', 'Email', 'Classes'],
  sourceTab: 'Form Responses 1',
  columnMap: { fullName: 1, matric: 2, contact: 3, email: 4, gender: null, nationality: null },
  scores: { fullName: 1, matric: 1 },
  classIndex: 5,
  rowCount: 3,
  sampleNames: ['Ahmad', 'Sarah', 'Wei'],
  detectedStyleIds: ['style-hiphop'],
  unknownClasses: [],
  warnings: []
};

test.describe('Event wizard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('creates a trial class with one Popping class on 6 Jan', async ({ page }) => {
    const calls = await mockApi(page, {
      'styles.list': () => STYLES,
      'events.previewSource': () => PREVIEW,
      'settings.get': () => ({ defaultAttendanceFolderId: 'fld-master' }),
      'events.create': p => ({ event: makeEvent({ id: 'evt-trial', name: p.name }), import: {}, sheets: [] })
    });

    await page.goto('/admin/events/new');
    await page.getByLabel('Google Sheet Link').fill('https://docs.google.com/spreadsheets/d/test-sheet-id/edit');
    await page.getByRole('button', { name: 'READ SHEET' }).click();
    await expect(page.getByText(/Found 3 registrations/)).toBeVisible();
    await page.getByRole('button', { name: 'NEXT', exact: true }).click();

    await page.getByLabel('Event name').fill('TRIAL CLASS 2027');
    await page.getByLabel('Event type').selectOption('trial');
    await page.getByLabel('Start day').fill('2027-01-05');
    await page.getByLabel('End day').fill('2027-01-07');
    await page.getByRole('button', { name: 'NEXT', exact: true }).click();

    await page.getByRole('checkbox', { name: /Hip Hop/ }).uncheck();
    await page.getByRole('checkbox', { name: /Popping/ }).check();
    await page.getByRole('button', { name: 'NEXT', exact: true }).click();

    await page.getByRole('button', { name: 'Wed 06 Jan', exact: true }).click();
    await expect(page.getByText('1 classes selected')).toBeVisible();
    await page.getByRole('button', { name: 'NEXT', exact: true }).click();

    await expect(page.getByText('TRIAL CLASS 2027')).toBeVisible();
    await page.getByRole('button', { name: 'CREATE EVENT' }).click();
    await expect(page).toHaveURL(/\/admin\/events$/);

    const create = calls.find(c => c.action === 'events.create')!.payload;
    expect(create).toMatchObject({
      name: 'TRIAL CLASS 2027',
      type: 'trial',
      startDate: '2027-01-05',
      endDate: '2027-01-07',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/test-sheet-id/edit',
      classIndex: 5,
      styleIds: ['style-popping']
    });
    expect(create.sessions).toEqual([
      expect.objectContaining({ styleId: 'style-popping', seq: 1, date: '2027-01-06', start: '20:00', end: '22:00' })
    ]);
  });

  test('a name that already exists (different case) blocks step 2', async ({ page }) => {
    await mockApi(page, { 'styles.list': () => STYLES, 'events.previewSource': () => PREVIEW });
    await page.goto('/admin/events/new');
    await page.getByLabel('Google Sheet Link').fill('https://docs.google.com/spreadsheets/d/x/edit');
    await page.getByRole('button', { name: 'READ SHEET' }).click();
    await page.getByRole('button', { name: 'NEXT', exact: true }).click();

    await page.getByLabel('Event name').fill(' oct monthly class ');
    await expect(page.getByText('An event called "oct monthly class" already exists.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'NEXT', exact: true })).toBeDisabled();
  });

  test('editing deletes a removed class first, then saves the event and the rest, then rebuilds sheets', async ({ page }) => {
    const sessions = [
      { id: 'ses-1', version: 1, eventId: 'evt-oct', styleId: 'style-hiphop', seq: 1, date: '2026-10-08', start: '20:00', end: '22:00', instructorId: '', venue: '', status: 'scheduled', note: '', active: true },
      { id: 'ses-2', version: 1, eventId: 'evt-oct', styleId: 'style-hiphop', seq: 2, date: '2026-10-15', start: '20:00', end: '22:00', instructorId: '', venue: '', status: 'scheduled', note: '', active: true }
    ];
    const calls = await mockApi(page, {
      'styles.list': () => STYLES,
      'sessions.list': () => sessions,
      'settings.get': () => ({ defaultAttendanceFolderId: 'fld-master' }),
      'events.update': () => makeEvent(),
      'sessions.delete': () => ({ deleted: true }),
      'sessions.batchUpsert': () => ({ sessions: [] }),
      'attendance.ensureSheets': () => ({ sheets: [] })
    });

    await page.goto('/admin/events/evt-oct/edit');
    await expect(page.getByLabel('Google Sheet Link')).toHaveValue('https://docs.google.com/spreadsheets/d/src-oct/edit');
    await page.getByRole('button', { name: 'NEXT', exact: true }).click();
    await page.getByRole('button', { name: 'NEXT', exact: true }).click();
    await page.getByRole('button', { name: 'NEXT', exact: true }).click();
    await page.getByRole('button', { name: 'Thu 15 Oct', exact: true }).click();
    await page.getByRole('button', { name: 'NEXT', exact: true }).click();
    await page.getByRole('button', { name: 'SAVE CHANGES' }).click();
    await expect(page).toHaveURL(/\/admin\/events$/);

    const order = calls.map(c => c.action).filter(a => ['events.update', 'sessions.delete', 'sessions.batchUpsert', 'attendance.ensureSheets'].includes(a));
    expect(order).toEqual(['sessions.delete', 'events.update', 'sessions.batchUpsert', 'attendance.ensureSheets']);
    expect(calls.find(c => c.action === 'sessions.delete')!.payload).toEqual({ id: 'ses-2', version: 1 });
    expect(calls.find(c => c.action === 'sessions.batchUpsert')!.payload.sessions).toEqual([
      expect.objectContaining({ id: 'ses-1', eventId: 'evt-oct', styleId: 'style-hiphop', seq: 1, date: '2026-10-08' })
    ]);
  });

  test('without an attendance master folder, Create is blocked', async ({ page }) => {
    await mockApi(page, { 'styles.list': () => STYLES, 'events.previewSource': () => PREVIEW, 'settings.get': () => ({}) });
    await page.goto('/admin/events/new');
    await page.getByLabel('Google Sheet Link').fill('https://docs.google.com/spreadsheets/d/x/edit');
    await page.getByRole('button', { name: 'READ SHEET' }).click();
    await page.getByRole('button', { name: 'NEXT', exact: true }).click();
    await page.getByLabel('Event name').fill('NEW ONE');
    await page.getByRole('button', { name: 'NEXT', exact: true }).click();
    await page.getByRole('button', { name: 'NEXT', exact: true }).click();
    await page.getByRole('button', { name: 'NEXT', exact: true }).click();
    await expect(page.getByText('Set the attendance master folder on the Events page first')).toBeVisible();
    await expect(page.getByRole('button', { name: 'CREATE EVENT' })).toBeDisabled();
  });
});
