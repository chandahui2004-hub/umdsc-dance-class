import { test, expect } from '@playwright/test';
import { mockApi } from './fixtures/mockApi';

async function loginAsDancer(page: any) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'umdsc:session',
      JSON.stringify({
        token: 'test-token',
        claims: {
          sub: '22004591',
          role: 'dancer',
          name: 'Jane Doe',
          exp: Math.floor(Date.now() / 1000) + 3600,
          pv: 1,
          perms: {
            'calendar.view': '*',
            'attendance.view.own': '*',
            'videos.view': '*',
            'music.view': '*'
          }
        }
      })
    );
  });
}

const BOOTSTRAP_DATA = {
  profile: {
    matricKey: '22004591',
    fullName: 'Jane Doe',
    eventIds: ['evt-oct'],
    perms: { 'calendar.view': '*', 'attendance.view.own': '*', 'videos.view': '*', 'music.view': '*' }
  },
  events: [
    {
      id: 'evt-oct',
      name: 'OCTOBER 2026 CLASSES',
      type: 'monthly',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      status: 'active',
      styleIds: ['style-hiphop']
    }
  ],
  styles: [
    {
      id: 'style-hiphop',
      name: 'Hip Hop',
      colorKey: 'orange',
      aliases: ['hiphop'],
      defaultWeekday: 5,
      defaultStart: '20:00',
      defaultEnd: '22:00',
      defaultInstructorId: 'inst-1',
      defaultVenue: 'Studio A',
      attendanceFolderId: 'fld-att',
      videoFolderId: 'fld-vid',
      active: true
    }
  ],
  instructors: [],
  sessions: [],
  attendance: [],
  videos: [
    {
      id: 'v-hiphop-routine',
      eventId: 'evt-oct',
      styleId: 'style-hiphop',
      sessionId: 'sess-1',
      title: 'Hip Hop Routine Video',
      driveFileId: 'drive-vid-123',
      mimeType: 'video/mp4',
      sizeBytes: 2500000,
      folderId: 'fld-vid',
      uploadedBy: 'admin',
      source: 'upload',
      active: true,
      version: 1,
      updatedBy: 'admin',
      updatedAt: '2026-10-01T00:00:00Z'
    }
  ],
  music: [
    {
      id: 'm-hiphop-routine',
      eventId: 'evt-oct',
      styleId: 'style-hiphop',
      sessionId: 'sess-1',
      title: 'Hip Hop Routine Track',
      sourceType: 'mp3',
      driveFileId: 'drive-mp3-123',
      youtubeId: '',
      active: true,
      version: 1,
      updatedBy: 'admin',
      updatedAt: '2026-10-01T00:00:00Z'
    }
  ],
  sections: [
    {
      id: 'sec-chorus',
      musicId: 'm-hiphop-routine',
      name: 'Chorus Drill',
      startSec: 2,
      endSec: 4,
      videoId: 'v-hiphop-routine',
      videoStartSec: 1,
      active: true,
      version: 1,
      updatedBy: 'admin',
      updatedAt: '2026-10-01T00:00:00Z'
    }
  ]
};

test.describe('Synced Class Video in Music Studio', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDancer(page);
    await mockApi(page, {
      'dancer.bootstrap': () => BOOTSTRAP_DATA
    });
  });

  test('displays VideoPanel, mounts video element, and toggles mute', async ({ page }) => {
    await page.goto('/studio?music=m-hiphop-routine');

    // Video panel header
    await expect(page.getByRole('heading', { name: 'Synced Class Video' })).toBeVisible();

    // Video selector dropdown
    const videoSelect = page.getByLabel('Select class video');
    await expect(videoSelect).toBeVisible();

    // Select the video
    await videoSelect.selectOption('v-hiphop-routine');

    // Video element should now be rendered with muted
    const videoLocator = page.locator('video');
    await expect(videoLocator).toBeVisible();
    await expect(page.getByText('MUTED', { exact: true })).toBeVisible();

    // Mute toggle button
    const muteBtn = page.getByRole('button', { name: /Muted/i });
    await expect(muteBtn).toBeVisible();

    // Toggle mute
    await muteBtn.click();
    await expect(page.getByRole('button', { name: /Audio On/i })).toBeVisible();

    // Toggle back
    await page.getByRole('button', { name: /Audio On/i }).click();
    await expect(page.getByRole('button', { name: /Muted/i })).toBeVisible();
  });

  test('preselects video and aligns start flag when looping a class section with video alignment', async ({
    page
  }) => {
    await page.goto('/studio?music=m-hiphop-routine');

    // Section list should show Chorus Drill
    await expect(page.locator('text=Chorus Drill')).toBeVisible();

    // Click Loop on the Chorus Drill class section
    const loopBtn = page
      .getByRole('region', { name: 'Section markers' })
      .getByRole('button', { name: 'Loop', exact: true });
    await loopBtn.click();

    // Video should automatically be selected
    const videoSelect = page.getByLabel('Select class video');
    await expect(videoSelect).toHaveValue('v-hiphop-routine');

    // Start flag should be set to 00:01.0
    await expect(page.locator('text=⚑ START:')).toBeVisible();
    await expect(page.locator('text=00:01.0')).toBeVisible();
  });

  test('sets start flag and saves loop + video alignment', async ({ page }) => {
    await page.goto('/studio?music=m-hiphop-routine');

    // Select video
    const videoSelect = page.getByLabel('Select class video');
    await videoSelect.selectOption('v-hiphop-routine');

    // Start a loop on Chorus Drill
    const loopBtn = page
      .getByRole('region', { name: 'Section markers' })
      .getByRole('button', { name: 'Loop', exact: true });
    await loopBtn.click();

    // Set Start Here button
    const setStartBtn = page.getByRole('button', { name: /Set Start Here/i });
    await expect(setStartBtn).toBeVisible();
    await setStartBtn.click();

    // Save Loop + Video button
    const saveBtn = page.getByRole('button', { name: /Save Loop \+ Video/i });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Confirmation indicator
    await expect(page.locator('text=SAVED!')).toBeVisible();
  });
});
