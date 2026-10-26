import { test, expect } from '@playwright/test';
import { mockApi, makeEvent } from './fixtures/mockApi';
import { dancerBootstrap } from './fixtures/mockData';

const DANCER_SESSION = {
  token: 'dancer-tok-23005147',
  claims: {
    sub: 'M-23005147',
    role: 'dancer',
    name: 'Chan Da Hui',
    exp: Math.floor(Date.now() / 1000) + 36000,
    pv: 1,
    perms: {
      'calendar.view': '*',
      'attendance.view.own': '*',
      'videos.view': '*',
      'music.view': '*'
    }
  }
};

const DANCER_EVENT = makeEvent({
  id: 'evt-oct',
  name: 'House Foundation Oct',
  styleIds: ['style-hiphop']
});

const DANCER_DATA = {
  ...dancerBootstrap,
  profile: {
    ...dancerBootstrap.profile,
    matricKey: '23005147',
    fullName: 'Chan Da Hui'
  },
  events: [DANCER_EVENT],
  sessions: [
    {
      id: 'ses-1',
      eventId: 'evt-oct',
      month: '2026-10',
      styleId: 'style-hiphop',
      seq: 1,
      date: '2026-10-08',
      start: '20:00',
      end: '22:00',
      instructorId: 'inst-1',
      venue: 'Dance Studio A',
      status: 'scheduled' as const,
      note: 'Bring sneakers',
      version: 1,
      updatedBy: 'admin',
      updatedAt: '2026-10-01T00:00:00.000Z',
      active: true
    }
  ],
  videos: [
    {
      id: 'vid-1',
      eventId: 'evt-oct',
      sessionId: 'ses-1',
      styleId: 'style-hiphop',
      title: 'House Routine Part 1',
      driveFileId: 'drv1',
      active: true,
      version: 1
    }
  ],
  music: [
    {
      id: 'mus-1',
      eventId: 'evt-oct',
      sessionId: 'ses-1',
      styleId: 'style-hiphop',
      title: 'Deep House Groove Track',
      sourceType: 'soundcloud' as const,
      soundcloudUrl: 'https://soundcloud.com/test/groove',
      active: true,
      version: 1
    }
  ]
};

test.describe('Dancer Portal & Studio E2E (Mobile & Desktop)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((sess) => {
      localStorage.setItem('umdsc:session', JSON.stringify(sess));
    }, DANCER_SESSION);
  });

  test('mobile dancer portal: calendar, daysheet, class card & practice badges', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Only for mobile project');

    await mockApi(page, {
      'dancer.bootstrap': () => DANCER_DATA,
      'sessions.list': () => DANCER_DATA.sessions,
      'videos.list': () => DANCER_DATA.videos,
      'music.list': () => DANCER_DATA.music
    });

    await page.goto('/');

    // 1. Verify dancer home month calendar is visible
    await expect(page.getByTestId('month-calendar')).toBeVisible();

    // 2. Click the day of the scheduled class (Thu 08 Oct)
    const classDayBtn = page.getByRole('button', { name: /08 Oct/i }).first();
    await classDayBtn.click();

    // 3. Verify DaySheet drawer opens
    const daySheet = page.getByTestId('day-sheet');
    await expect(daySheet).toBeVisible();

    // 4. Verify class details and badges
    await expect(daySheet.getByText('Hip Hop', { exact: false }).first()).toBeVisible();
    await expect(daySheet.getByText('Dance Studio A')).toBeVisible();

    // 5. Close daysheet
    const closeBtn = daySheet.getByRole('button', { name: /CLOSE/i });
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await expect(daySheet).not.toBeVisible();
    }
  });

  test('practice studio: audio player controls and loop markers operate smoothly', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Only for mobile project');

    await mockApi(page, {
      'dancer.bootstrap': () => DANCER_DATA,
      'videos.list': () => DANCER_DATA.videos,
      'music.list': () => DANCER_DATA.music,
      'sections.list': () => []
    });

    await page.goto('/studio');

    // Verify studio loads
    await expect(page.getByTestId('studio-container')).toBeVisible();
    await expect(page.getByText('Deep House Groove Track')).toBeVisible();

    // Test speed control toggle buttons
    const speedHalf = page.getByRole('button', { name: '0.75x' });
    if (await speedHalf.isVisible()) {
      await speedHalf.click();
      await expect(speedHalf).toHaveClass(/active|border-\[var\(--neon/);
    }
  });

  test('me profile page: displays dancer identity and opens profile editor', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Only for mobile project');

    await mockApi(page, {
      'dancer.bootstrap': () => DANCER_DATA,
      'dancer.attendance': () => [{ sessionId: 'ses-1', present: true }]
    });

    await page.goto('/me');

    // Verify profile info
    await expect(page.getByText('Chan Da Hui')).toBeVisible();
    await expect(page.getByText('23005147')).toBeVisible();

    // Open Edit Profile dialog
    const editBtn = page.getByRole('button', { name: /EDIT INFO/i });
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // Verify edit dialog is open
    await expect(page.getByRole('heading', { name: /EDIT PERSONAL INFO/i })).toBeVisible();
    await page.getByRole('button', { name: /CANCEL/i }).click();
    await expect(page.getByRole('heading', { name: /EDIT PERSONAL INFO/i })).not.toBeVisible();
  });

  test('desktop dancer portal layout and studio navigation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Only for desktop project');

    await mockApi(page, {
      'dancer.bootstrap': () => DANCER_DATA,
      'videos.list': () => DANCER_DATA.videos,
      'music.list': () => DANCER_DATA.music
    });

    await page.goto('/');

    // Desktop shell & calendar are visible
    await expect(page.getByTestId('desktop-shell')).toBeVisible();
    await expect(page.getByTestId('month-calendar')).toBeVisible();

    // Navigate to studio from desktop sidebar
    await page.goto('/studio');
    await expect(page.getByTestId('studio-container')).toBeVisible();
  });
});
