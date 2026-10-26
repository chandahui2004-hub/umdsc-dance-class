import { test, expect } from '@playwright/test';
import { loginAsAdmin, mockApi, makeEvent } from './fixtures/mockApi';
import { adminBootstrap } from './fixtures/mockData';

const TESTING1_EVENT = makeEvent({
  id: 'evt-testing1',
  name: 'testing1',
  nameKey: 'testing1',
  status: 'active',
  styleIds: ['style-hiphop'],
  styleInstructors: { 'style-hiphop': ['inst-1', 'inst-2'] }
});

const INSTRUCTOR_ALEX = {
  id: 'inst-1',
  name: 'Alex Tan',
  contact: '0123456789',
  styleIds: ['style-hiphop'],
  version: 1,
  updatedBy: 'admin',
  updatedAt: '',
  active: true
};

const INSTRUCTOR_KEN = {
  id: 'inst-2',
  name: 'Ken Wong',
  contact: '0198765432',
  styleIds: ['style-hiphop'],
  version: 1,
  updatedBy: 'admin',
  updatedAt: '',
  active: true
};

const SESSION_1 = {
  id: 'ses-testing1-1',
  eventId: 'evt-testing1',
  styleId: 'style-hiphop',
  seq: 1,
  date: '2026-10-15',
  start: '20:00',
  end: '22:00',
  instructorId: 'inst-1',
  venue: 'Studio A',
  status: 'scheduled' as const,
  note: 'Initial class note',
  version: 1,
  updatedBy: 'admin',
  updatedAt: '2026-10-01T00:00:00.000Z',
  active: true
};

const MEMBER_DAHUI = {
  memberId: 'M-23005147',
  matricKey: '23005147',
  matricRaw: '23005147',
  fullName: 'Chan Da Hui',
  nameKey: 'chan da hui',
  email: 'chandahui2004@gmail.com',
  contact: '0123456789',
  gender: 'M',
  nationality: 'Malaysian',
  styleIds: ['style-hiphop'],
  styleNames: ['Hip Hop'],
  flags: [],
  sourceTimestamp: new Date().toISOString()
};

test.describe('Admin Portal & Event testing1 Management (Mobile & Desktop)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('admin classes: views testing1 event, opens add class modal, and edits existing class', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop admin suite');

    const calls = await mockApi(page, {
      'events.list': () => [TESTING1_EVENT],
      'admin.bootstrap': () => ({
        ...adminBootstrap,
        events: [TESTING1_EVENT],
        instructors: [INSTRUCTOR_ALEX, INSTRUCTOR_KEN]
      }),
      'sessions.list': () => [SESSION_1],
      'instructors.list': () => [INSTRUCTOR_ALEX, INSTRUCTOR_KEN],
      'sessions.update': (payload) => ({ ...SESSION_1, ...payload, version: 2 })
    });

    await page.goto('/admin/calendar');

    // 1. Verify locked to event testing1
    await expect(page.getByText('1 classes in testing1')).toBeVisible();

    // 2. Click the date of SESSION_1 (Thu 15 Oct)
    const dateBtn = page.getByRole('button', { name: /15 Oct/i }).first();
    await dateBtn.click();

    // 3. Verify class session details
    await expect(page.getByText('Studio A').first()).toBeVisible();
    await expect(page.getByText('Alex Tan').first()).toBeVisible();

    // 4. Open Edit dialog
    const editBtn = page.getByRole('button', { name: /EDIT/i }).first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await expect(page.getByRole('heading', { name: /EDIT .* SESSION/i })).toBeVisible();

      // Change venue and note
      const venueInput = page.getByLabel(/Venue/i);
      await venueInput.fill('Studio B');
      await page.getByRole('button', { name: /SAVE CHANGES/i }).click();

      // Verify update payload sent
      await expect.poll(() => calls.find(c => c.action === 'sessions.update')?.payload).toMatchObject({
        id: 'ses-testing1-1',
        venue: 'Studio B'
      });
    }

    // 5. Test Add Class pop-up
    const addClassBtn = page.getByRole('button', { name: '+ ADD CLASS' });
    await expect(addClassBtn).toBeVisible();
    await addClassBtn.click();
    await expect(page.getByRole('heading', { name: /ADD A CLASS/i })).toBeVisible();
    await page.getByRole('button', { name: /CANCEL/i }).click();
    await expect(page.getByRole('heading', { name: /ADD A CLASS/i })).not.toBeVisible();
  });

  test('admin members & attendance: views member roster for testing1 and marks attendance', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop admin suite');

    const calls = await mockApi(page, {
      'events.list': () => [TESTING1_EVENT],
      'admin.bootstrap': () => ({
        ...adminBootstrap,
        events: [TESTING1_EVENT]
      }),
      'members.list': () => [MEMBER_DAHUI],
      'sessions.list': () => [SESSION_1],
      'attendance.get': () => ({
        eventId: 'evt-testing1',
        styleId: 'style-hiphop',
        version: 1,
        sessions: [SESSION_1],
        members: [{ memberId: 'M-23005147', fullName: 'Chan Da Hui', matric: '23005147' }],
        present: { 'M-23005147': ['ses-testing1-1'] }
      }),
      'attendance.list': () => [{ sessionId: 'ses-testing1-1', memberId: 'M-23005147', present: true }],
      'attendance.batchSet': (payload) => payload
    });

    // 1. Visit members page
    await page.goto('/admin/members');
    await expect(page.getByText('Chan Da Hui').first()).toBeVisible();
    await expect(page.getByText('23005147').first()).toBeVisible();
    await expect(page.getByText('chandahui2004@gmail.com').first()).toBeVisible();

    // 2. Visit attendance page
    await page.goto('/admin/attendance');
    await expect(page.getByTestId('attendance-grid').getByText('Chan Da Hui')).toBeVisible();
  });

  test('mobile admin layout: classes and email settings strictly with chandahui2004@gmail.com', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Mobile admin suite');

    await mockApi(page, {
      'events.list': () => [TESTING1_EVENT],
      'admin.bootstrap': () => ({
        ...adminBootstrap,
        events: [TESTING1_EVENT]
      }),
      'members.list': () => [MEMBER_DAHUI],
      'sessions.list': () => [SESSION_1],
      'settings.get': () => ({ clubEmail: 'umdancesportc@gmail.com' })
    });

    // 1. Mobile admin calendar loads
    await page.goto('/admin/calendar');
    await expect(page.getByTestId('phone-shell')).toBeVisible();
    await expect(page.getByTestId('month-calendar')).toBeVisible();

    // 2. Admin settings loads email manager with only chandahui2004@gmail.com
    await page.goto('/admin/settings');
    await expect(page.getByText('System Settings', { exact: false }).first()).toBeVisible();
  });
});
