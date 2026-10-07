import { test, expect, type Page } from '@playwright/test';
import { loginAsAdmin, mockApi, makeEvent } from './fixtures/mockApi';
import { adminBootstrap } from './fixtures/mockData';

const STYLES = [
  adminBootstrap.styles[0],
  { ...adminBootstrap.styles[0], id: 'style-popping', name: 'Popping', aliases: ['popping'], colorKey: 'blue' }
];
const EVENT = makeEvent({ styleIds: ['style-hiphop', 'style-popping'] });
const SESSION = {
  id: 'ses-1', eventId: 'evt-oct', styleId: 'style-hiphop', seq: 1, date: '2026-10-08', start: '20:00', end: '22:00',
  instructorId: '', venue: 'Dance Room 1', status: 'scheduled', note: '', version: 1, updatedBy: 'admin', updatedAt: '', active: true
};
const GRID = {
  eventId: 'evt-oct', styleId: 'style-hiphop', version: 1, spreadsheetId: 'sheet-1',
  sessions: [SESSION],
  members: [{ memberId: 'm-1', fullName: 'SARAH BINTI AHMAD', matric: '22001111' }],
  present: { 'm-1': [] }
};
const BASE = {
  'events.list': () => [EVENT],
  'styles.list': () => STYLES,
  'attendance.get': () => GRID,
  'sessions.list': () => [SESSION],
  'videos.list': () => [],
  'music.list': () => []
};

/** Step I sits directly above Step II. */
async function expectStepsInOrder(page: Page) {
  const one = await page.getByTestId('step-I').boundingBox();
  const two = await page.getByTestId('step-II').boundingBox();
  expect(one && two && one.y < two.y).toBe(true);
}

test.describe('Event (I) and dance style (II) steps', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('attendance: steps in order, tools inside the roster, refresh reloads the ticks', async ({ page }) => {
    const calls = await mockApi(page, BASE);
    await page.goto('/admin/attendance');

    await expect(page.getByText('CHOOSE EVENT', { exact: true })).toBeVisible();
    await expect(page.getByText('CHOOSE DANCE STYLE', { exact: true })).toBeVisible();
    await expectStepsInOrder(page);

    const tools = page.getByRole('toolbar', { name: 'Roster tools' });
    await expect(tools.getByRole('button', { name: /FULL SCREEN/ })).toBeVisible();
    await expect(tools.getByRole('button', { name: /EXPORT XLSX/ })).toBeVisible();
    await expect(tools.getByRole('link', { name: /OPEN HIP HOP SHEET/ })).toBeVisible();

    const before = calls.filter(c => c.action === 'attendance.get').length;
    await page.getByRole('button', { name: /REFRESH/ }).click();
    await expect.poll(() => calls.filter(c => c.action === 'attendance.get').length).toBeGreaterThan(before);
  });

  test('attendance: with no event chosen, step II waits for step I', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('umdsc:currentEvent', 'ALL'));
    await mockApi(page, BASE);
    await page.goto('/admin/attendance');

    await expect(page.getByTestId('step-II')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('Choose an event first.')).toBeVisible();
    await page.getByLabel('Current event').selectOption('evt-oct');
    await expect(page.getByRole('button', { name: 'Hip Hop', exact: true })).toBeVisible();
  });

  test('media: no duplicate upload buttons at the top, scan lives in the recap panel, refresh reloads', async ({ page }) => {
    const calls = await mockApi(page, BASE);
    await page.goto('/admin/media');

    await expectStepsInOrder(page);
    await expect(page.getByRole('button', { name: /^UPLOAD VIDEO$/ })).toHaveCount(0);
    // The music panel's own empty-state UPLOAD MP3 stays; nothing above the steps
    const mp3 = await page.getByRole('button', { name: /^UPLOAD MP3$/ }).boundingBox();
    const stepTwo = await page.getByTestId('step-II').boundingBox();
    expect(mp3 && stepTwo && mp3.y > stepTwo.y).toBe(true);
    await expect(page.getByRole('button', { name: /^SCAN FOLDER$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /SCAN DRIVE FOLDER/ })).toBeVisible();

    const before = calls.filter(c => c.action === 'videos.list').length;
    await page.getByRole('button', { name: /REFRESH/ }).click();
    await expect.poll(() => calls.filter(c => c.action === 'videos.list').length).toBeGreaterThan(before);
  });

  test('dancers: event step above the style step, list tools below the style step', async ({ page }) => {
    await mockApi(page, { ...BASE, 'members.list': () => [] });
    await page.goto('/admin/members');
    await expectStepsInOrder(page);
    const tools = await page.getByRole('toolbar', { name: 'Dancer list tools' }).boundingBox();
    const two = await page.getByTestId('step-II').boundingBox();
    expect(tools && two && tools.y > two.y).toBe(true);
    await expect(page.getByRole('toolbar', { name: 'Dancer list tools' }).getByRole('button', { name: /EXPORT CSV/ })).toBeVisible();
  });

  test('dance styles page has no event picker', async ({ page }) => {
    await mockApi(page, BASE);
    await page.goto('/admin/styles');
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expect(page.getByLabel('Current event')).toHaveCount(0);
  });
});
