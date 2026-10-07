import { test, expect, type Page } from '@playwright/test';
import { loginAsAdmin, mockApi, makeEvent } from './fixtures/mockApi';
import { adminBootstrap } from './fixtures/mockData';

const STYLES = [
  adminBootstrap.styles[0],
  { ...adminBootstrap.styles[0], id: 'style-popping', name: 'Popping', aliases: ['popping'], colorKey: 'blue' }
];

const inst = (id: string, name: string, styleIds: string[], active = true) => ({
  id, version: 1, updatedBy: 'admin', updatedAt: '2026-10-01T00:00:00.000Z', active, name, contact: '', styleIds
});

const LOCKING = { ...adminBootstrap.styles[0], id: 'locking', name: 'Locking', aliases: ['locking'], colorKey: 'green' };
const LATIN = { ...adminBootstrap.styles[0], id: 'latin', name: 'Latin', aliases: ['latin'], colorKey: 'pink' };
const MANY_STYLES = [adminBootstrap.styles[0], LOCKING, LATIN];
const MANY_INSTRUCTORS = [
  inst('kelvin', 'Kelvin', ['locking', 'popping']),
  inst('carmen', 'Carmen', ['locking']),
  inst('lam', 'Lam', ['latin']),
  inst('zed', 'Zed', ['locking'], false)
];
// Teaches the styles the older tests tick, so one instructor is auto-ticked for each.
const ONE_INSTRUCTOR = [inst('inst-1', 'Alex Tan', ['style-hiphop', 'style-popping'])];

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
      'instructors.list': () => ONE_INSTRUCTOR,
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
      'instructors.list': () => ONE_INSTRUCTOR,
      'events.list': () => [makeEvent({ styleInstructors: { 'style-hiphop': ['inst-1'] } })],
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
      expect.objectContaining({ id: 'ses-1', eventId: 'evt-oct', styleId: 'style-hiphop', seq: 1, date: '2026-10-08', instructorId: 'inst-1' })
    ]);
    expect(calls.find(c => c.action === 'events.update')!.payload.styleInstructors).toEqual({ 'style-hiphop': ['inst-1'] });
  });

  test('without an attendance master folder, Create is blocked', async ({ page }) => {
    await mockApi(page, { 'styles.list': () => STYLES, 'instructors.list': () => ONE_INSTRUCTOR, 'events.previewSource': () => PREVIEW, 'settings.get': () => ({}) });
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

  // --- instructors per style -------------------------------------------------------

  const NEXT = (page: Page) => page.getByRole('button', { name: 'NEXT', exact: true });

  /** Opens a new event on the STYLES step with no style pre-ticked. */
  async function openStylesStep(page: Page, handlers: Record<string, (p: any) => unknown> = {}) {
    const calls = await mockApi(page, {
      'styles.list': () => MANY_STYLES,
      'instructors.list': () => MANY_INSTRUCTORS,
      'events.previewSource': () => ({ ...PREVIEW, detectedStyleIds: [] }),
      'settings.get': () => ({ defaultAttendanceFolderId: 'fld-master' }),
      'events.create': p => ({ event: makeEvent({ id: 'evt-new', name: p.name }), import: {}, sheets: [] }),
      ...handlers
    });
    await page.goto('/admin/events/new');
    await page.getByLabel('Google Sheet Link').fill('https://docs.google.com/spreadsheets/d/test-sheet-id/edit');
    await page.getByRole('button', { name: 'READ SHEET' }).click();
    await expect(page.getByText(/Found 3 registrations/)).toBeVisible();
    await NEXT(page).click();
    await page.getByLabel('Event name').fill('INSTRUCTOR EVENT');
    await page.getByLabel('Start day').fill('2027-01-04');
    await page.getByLabel('End day').fill('2027-01-17');
    await NEXT(page).click();
    return calls;
  }

  test('ticking a style shows only its active instructors; single instructor is auto-ticked', async ({ page }) => {
    await openStylesStep(page);

    await page.getByRole('checkbox', { name: /Latin/ }).check();
    await expect(page.getByRole('checkbox', { name: 'Lam' })).toBeChecked();

    await page.getByRole('checkbox', { name: /Locking/ }).check();
    await expect(page.getByRole('checkbox', { name: 'Kelvin' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Carmen' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Zed' })).toHaveCount(0);
  });

  test('NEXT is blocked until every ticked style has an instructor', async ({ page }) => {
    await openStylesStep(page);
    await page.getByRole('checkbox', { name: /Locking/ }).check();
    await expect(NEXT(page)).toBeDisabled();
    await expect(page.getByText('Choose an instructor for Locking.')).toBeVisible();

    await page.getByRole('checkbox', { name: 'Kelvin' }).check();
    await expect(NEXT(page)).toBeEnabled();
    await expect(page.getByText('Choose an instructor for Locking.')).toHaveCount(0);
  });

  test('a style nobody teaches says so and links to Instructors', async ({ page }) => {
    await openStylesStep(page);
    await page.getByRole('checkbox', { name: /Hip Hop/ }).check();
    await expect(page.getByText(/No instructor teaches Hip Hop yet/)).toBeVisible();
    const link = page.getByRole('link', { name: /Instructors page/ });
    await expect(link).toHaveAttribute('href', '/admin/instructors');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(NEXT(page)).toBeDisabled();
    await expect(page.getByRole('button', { name: /RELOAD INSTRUCTORS/ })).toBeVisible();
  });

  test('RELOAD INSTRUCTORS fetches the list again', async ({ page }) => {
    let list = MANY_INSTRUCTORS;
    const calls = await openStylesStep(page, { 'instructors.list': () => list });
    await page.getByRole('checkbox', { name: /Hip Hop/ }).check();
    await expect(NEXT(page)).toBeDisabled();

    list = [...MANY_INSTRUCTORS, inst('dee', 'Dee', ['style-hiphop'])];
    const before = calls.filter(c => c.action === 'instructors.list').length;
    await page.getByRole('button', { name: /RELOAD INSTRUCTORS/ }).click();
    await expect(page.getByRole('checkbox', { name: 'Dee' })).toBeChecked();
    expect(calls.filter(c => c.action === 'instructors.list').length).toBeGreaterThan(before);
    await expect(NEXT(page)).toBeEnabled();
  });

  test('SCHEDULE has a per-class instructor drop-down only when a style has several', async ({ page }) => {
    await openStylesStep(page);
    await page.getByRole('checkbox', { name: /Latin/ }).check();
    await page.getByRole('checkbox', { name: /Locking/ }).check();
    await page.getByRole('checkbox', { name: 'Kelvin' }).check();
    await page.getByRole('checkbox', { name: 'Carmen' }).check();
    await NEXT(page).click();

    // The first ticked style is Latin (only Lam), so plain text
    await page.getByRole('button', { name: 'Mon 04 Jan', exact: true }).click();
    await expect(page.getByLabel('Instructor for class 1')).toHaveCount(0);
    await expect(page.getByText('Lam', { exact: true })).toBeVisible();

    // Locking has two, so a drop-down that starts on the first one listed (ticked first: Kelvin)
    await page.getByRole('button', { name: /Locking/ }).click();
    await page.getByRole('button', { name: 'Mon 04 Jan', exact: true }).click();
    const select = page.getByLabel('Instructor for class 1');
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('kelvin');
  });

  test('CREATE sends styleInstructors and each class instructorId', async ({ page }) => {
    const calls = await openStylesStep(page);
    await page.getByRole('checkbox', { name: /Locking/ }).check();
    await page.getByRole('checkbox', { name: 'Kelvin' }).check();
    await page.getByRole('checkbox', { name: 'Carmen' }).check();
    await NEXT(page).click();

    await page.getByRole('button', { name: 'Mon 04 Jan', exact: true }).click();
    await page.getByRole('button', { name: 'Mon 11 Jan', exact: true }).click();
    await page.getByLabel('Instructor for class 2').selectOption('carmen');
    await NEXT(page).click();

    await expect(page.getByText('Kelvin, Carmen')).toBeVisible();
    await page.getByRole('button', { name: 'CREATE EVENT' }).click();
    await expect(page).toHaveURL(/\/admin\/events$/);

    const create = calls.find(c => c.action === 'events.create')!.payload;
    expect(create.styleInstructors).toEqual({ locking: ['kelvin', 'carmen'] });
    expect(create.sessions).toHaveLength(2);
    expect(create.sessions[0]).toMatchObject({ styleId: 'locking', seq: 1, instructorId: 'kelvin' });
    expect(create.sessions[1]).toMatchObject({ styleId: 'locking', seq: 2, instructorId: 'carmen' });
  });

  test('editing an event opens with its saved instructors ticked', async ({ page }) => {
    await mockApi(page, {
      'styles.list': () => MANY_STYLES,
      'instructors.list': () => MANY_INSTRUCTORS,
      'events.list': () => [makeEvent({ styleIds: ['locking'], styleInstructors: { locking: ['carmen'] } })],
      'sessions.list': () => [
        { id: 'ses-1', version: 1, eventId: 'evt-oct', styleId: 'locking', seq: 1, date: '2026-10-08', start: '20:00', end: '22:00', instructorId: 'carmen', venue: '', status: 'scheduled', note: '', active: true }
      ]
    });
    await page.goto('/admin/events/evt-oct/edit');
    await expect(page.getByLabel('Google Sheet Link')).toBeVisible();
    await NEXT(page).click();
    await NEXT(page).click();
    await expect(page.getByRole('checkbox', { name: 'Carmen' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Kelvin' })).not.toBeChecked();
  });

  test('a class whose instructor is outside the event list is kept and labelled', async ({ page }) => {
    const calls = await mockApi(page, {
      'styles.list': () => MANY_STYLES,
      'instructors.list': () => MANY_INSTRUCTORS,
      'settings.get': () => ({ defaultAttendanceFolderId: 'fld-master' }),
      'events.list': () => [makeEvent({ styleIds: ['locking'], styleInstructors: { locking: ['kelvin'] } })],
      'sessions.list': () => [
        { id: 'ses-1', version: 1, eventId: 'evt-oct', styleId: 'locking', seq: 1, date: '2026-10-08', start: '20:00', end: '22:00', instructorId: 'carmen', venue: '', status: 'scheduled', note: '', active: true }
      ],
      'events.update': () => makeEvent(),
      'sessions.batchUpsert': () => ({ sessions: [] }),
      'attendance.ensureSheets': () => ({ sheets: [] })
    });
    await page.goto('/admin/events/evt-oct/edit');
    await expect(page.getByLabel('Google Sheet Link')).toBeVisible();
    await NEXT(page).click();
    await NEXT(page).click();
    await NEXT(page).click();
    const select = page.getByLabel('Instructor for class 1');
    await expect(select).toHaveValue('carmen');
    await expect(select.locator('option', { hasText: "Carmen (not in this event's list)" })).toHaveCount(1);
    await NEXT(page).click();
    await page.getByRole('button', { name: 'SAVE CHANGES' }).click();
    await expect(page).toHaveURL(/\/admin\/events$/);
    expect(calls.find(c => c.action === 'sessions.batchUpsert')!.payload.sessions[0]).toMatchObject({ id: 'ses-1', instructorId: 'carmen' });
  });
});
