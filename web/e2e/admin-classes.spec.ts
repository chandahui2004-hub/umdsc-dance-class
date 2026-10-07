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

  test('+ ADD CLASS opens a pop-up; the class is added with style, instructor, times, venue and note', async ({ page }) => {
    const teacher = (id: string, name: string) => ({
      id, name, contact: '', styleIds: ['style-hiphop'], version: 1, updatedBy: 'admin', updatedAt: '', active: true
    });
    const INSTRUCTORS = [teacher('inst-1', 'Alex Tan'), teacher('inst-2', 'Bea Lim'), teacher('inst-3', 'Not Listed')];
    const calls = await mockApi(page, {
      ...BASE,
      'events.list': () => [{ ...EVENT, styleInstructors: { 'style-hiphop': ['inst-1', 'inst-2'] } }],
      'instructors.list': () => INSTRUCTORS,
      'sessions.list': () => [session('ses-1')],
      'videos.list': () => [],
      'music.list': () => [],
      'sessions.create': p => ({ ...session('ses-new', p.date), seq: p.seq })
    });
    await page.goto('/admin/calendar');
    await expect(page.getByText('1 classes in OCT MONTHLY CLASS')).toBeVisible();
    await expect(page.getByText(/ADD A CLASS ON/)).toHaveCount(0);

    await page.getByRole('button', { name: /Thu 15 Oct/ }).click();
    await page.getByRole('button', { name: '+ ADD CLASS' }).click();
    await expect(page.getByRole('heading', { name: 'ADD A CLASS' })).toBeVisible();
    await expect(page.getByLabel('Date *')).toHaveValue('2026-10-15');
    await expect(page.getByLabel('Venue')).toHaveValue('Dance Room 1');

    // Only this event's instructors for the style are offered
    const instructor = page.getByLabel('Instructor *');
    await expect(instructor.locator('option')).toHaveText(['Alex Tan', 'Bea Lim']);
    await instructor.selectOption('inst-2');
    await page.getByLabel('Note').fill('Bring water');
    await page.getByRole('button', { name: 'ADD CLASS', exact: true }).click();

    await expect.poll(() => calls.find(c => c.action === 'sessions.create')?.payload).toMatchObject({
      eventId: 'evt-oct',
      styleId: 'style-hiphop',
      seq: 2,
      date: '2026-10-15',
      start: '20:00',
      end: '22:00',
      instructorId: 'inst-2',
      venue: 'Dance Room 1',
      note: 'Bring water'
    });
    await expect(page.getByRole('heading', { name: 'ADD A CLASS' })).toHaveCount(0);
  });

  test('ADD CLASS stays disabled when the style has no instructor in the event', async ({ page }) => {
    await mockApi(page, {
      ...BASE,
      'events.list': () => [{ ...EVENT, styleInstructors: {} }],
      'sessions.list': () => [session('ses-1')],
      'videos.list': () => [],
      'music.list': () => []
    });
    await page.goto('/admin/calendar');
    await page.getByRole('button', { name: '+ ADD CLASS' }).click();
    await expect(page.getByText(/No instructor teaches Hip Hop in this event yet/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'ADD CLASS', exact: true })).toBeDisabled();
  });

  test('the chosen day shows class cards with recap videos and music, and EDIT CLASS opens the editor', async ({ page }) => {
    await mockApi(page, {
      ...BASE,
      'sessions.list': () => [session('ses-1')],
      'videos.list': () => [{ id: 'vid-1', eventId: 'evt-oct', styleId: 'style-hiphop', sessionId: 'ses-1', title: 'Week 1 Recap.mp4',
        driveFileId: 'drive-1', mimeType: 'video/mp4', sizeBytes: 1, folderId: 'f', uploadedBy: 'admin', source: 'upload', version: 1, active: true }],
      'music.list': () => [{ id: 'mus-1', eventId: 'evt-oct', styleId: 'style-hiphop', sessionId: 'ses-1', title: 'Practice Song',
        sourceType: 'youtube', driveFileId: '', youtubeId: 'aaaaaaaaaaa', version: 1, active: true }]
    });
    await page.goto('/admin/calendar');
    await page.getByRole('button', { name: /Thu 08 Oct/ }).click();
    await expect(page.getByRole('button', { name: /Thu 08 Oct/ })).toHaveAttribute('aria-pressed', 'true');

    const card = page.getByTestId('class-card-ses-1');
    await expect(card.getByText('Week 1 Recap.mp4')).toBeVisible();
    await expect(card.getByText('Practice Song')).toBeVisible();
    await expect(card.getByText(/ABSENT|ATTENDED/)).toHaveCount(0);
    await card.getByRole('button', { name: /EDIT CLASS/ }).click();
    await expect(page.getByText(/EDIT HIP HOP SESSION 1/i)).toBeVisible();
  });

  const inst = (id: string, name: string) => ({ id, name, contact: '', version: 1, updatedBy: 'admin', updatedAt: '2026-10-01T00:00:00.000Z', active: true });
  const INSTRUCTORS = [inst('inst-1', 'Alex Tan'), inst('inst-2', 'Bella Lim'), inst('inst-3', 'Carl Ong')];

  test('class editor lists only the event instructors for the style', async ({ page }) => {
    await mockApi(page, {
      ...BASE,
      'events.list': () => [makeEvent({ styleIds: ['style-hiphop'], styleInstructors: { 'style-hiphop': ['inst-1', 'inst-2'] } })],
      'instructors.list': () => INSTRUCTORS,
      'videos.list': () => [],
      'music.list': () => [],
      'sessions.list': () => [session('ses-1')]
    });
    await page.goto('/admin/calendar');
    await page.getByRole('button', { name: /Thu 08 Oct/ }).click();
    await page.getByTestId('class-card-ses-1').getByRole('button', { name: /EDIT CLASS/ }).click();
    const select = page.locator('#instructor-select');
    await expect(select.locator('option')).toHaveText(['Select Instructor...', 'Alex Tan', 'Bella Lim']);
  });

  test("a current instructor outside the list is shown as \"(not in this event's list)\"", async ({ page }) => {
    await mockApi(page, {
      ...BASE,
      'events.list': () => [makeEvent({ styleIds: ['style-hiphop'], styleInstructors: { 'style-hiphop': ['inst-2'] } })],
      'instructors.list': () => INSTRUCTORS,
      'videos.list': () => [],
      'music.list': () => [],
      'sessions.list': () => [session('ses-1')]
    });
    await page.goto('/admin/calendar');
    await page.getByRole('button', { name: /Thu 08 Oct/ }).click();
    await page.getByTestId('class-card-ses-1').getByRole('button', { name: /EDIT CLASS/ }).click();
    const select = page.locator('#instructor-select');
    await expect(select.locator('option')).toHaveText(['Select Instructor...', 'Bella Lim', "Alex Tan (not in this event's list)"]);
    await expect(select).toHaveValue('inst-1');
  });

  test('dates outside the event cannot be picked and months can be freely navigated', async ({ page }) => {
    await mockApi(page, { ...BASE, 'sessions.list': () => [session('ses-1')] });
    await page.goto('/admin/calendar');
    await expect(page.getByText('OCTOBER 2026')).toBeVisible();
    await expect(page.getByRole('button', { name: /next month/i })).toBeVisible();
    await page.getByRole('button', { name: /next month/i }).click();
    await expect(page.getByText('NOVEMBER 2026')).toBeVisible();
    await page.getByRole('button', { name: /previous month/i }).click();
    await expect(page.getByText('OCTOBER 2026')).toBeVisible();
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

  test('selecting ALL EVENTS shows all classes and allows free month switching', async ({ page }) => {
    const evt1 = makeEvent({ id: 'evt-1', name: 'OCT MONTHLY CLASS' });
    const evt2 = makeEvent({ id: 'evt-2', name: 'NOV WORKSHOP' });
    const s1 = session('ses-1', '2026-10-08');
    const s2 = { ...session('ses-2', '2026-11-05'), eventId: 'evt-2' };

    const calls = await mockApi(page, {
      'events.list': () => [evt1, evt2],
      'styles.list': () => adminBootstrap.styles,
      'sessions.list': (p) => {
        if (p?.eventId === 'ALL') return [s1, s2];
        if (p?.eventId === 'evt-1') return [s1];
        if (p?.eventId === 'evt-2') return [s2];
        return [];
      }
    });

    await page.goto('/admin/calendar');
    await page.getByLabel('Current event').selectOption('ALL');

    await expect.poll(() => calls.filter(c => c.action === 'sessions.list').map(c => c.payload)).toContainEqual({ eventId: 'ALL' });
    await expect(page.getByText(/ALL CLASSES ACROSS ALL EVENTS/i)).toBeVisible();

    // Navigate to November
    await page.getByRole('button', { name: /next month/i }).click();
    await expect(page.getByText('NOVEMBER 2026')).toBeVisible();
  });
});
