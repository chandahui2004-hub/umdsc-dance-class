import { test, expect } from '@playwright/test';
import { mockApi } from './fixtures/mockApi';

async function loginAsDancer(page: any) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'umdsc:session',
      JSON.stringify({
        token: 'dancer-token-123',
        claims: {
          sub: 'M-17201234',
          role: 'dancer',
          name: 'SARAH BINTI AHMAD',
          exp: Math.floor(Date.now() / 1000) + 36000,
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

test.describe('Music Studio (DanceCue)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDancer(page);
    await mockApi(page, {
      'dancer.bootstrap': () => ({
        profile: {
          matric: 'M-17201234',
          fullName: 'SARAH BINTI AHMAD',
          eventIds: ['evt-oct'],
          styles: ['style-hiphop'],
          months: ['2026-10']
        },
        events: [
          {
            id: 'evt-oct',
            name: 'OCT MONTHLY CLASS',
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
            aliases: ['hiphop'],
            colorKey: 'orange',
            defaultWeekday: 4,
            defaultStart: '20:00',
            defaultEnd: '22:00',
            defaultInstructorId: 'inst-1',
            defaultVenue: 'Dance Room 1',
            attendanceFolderId: 'f-att-1',
            videoFolderId: 'f-vid-1',
            version: 1,
            updatedBy: 'admin',
            updatedAt: '2026-10-01T00:00:00.000Z',
            active: true
          }
        ],
        instructors: [],
        sessions: [],
        attendance: [],
        videos: [],
        music: [],
        sections: []
      })
    });
  });

  test('loads Studio page and renders DanceCue interface verbatim', async ({ page }) => {
    await page.goto('/studio');

    // Header and title
    await expect(page.locator('text=DanceCue').first()).toBeVisible();
    await expect(page.locator('text=Rehearse in motion')).toBeVisible();

    // Track source selector
    await expect(page.locator('text=Choose music source')).toBeVisible();
    await expect(page.getByRole('button', { name: 'MP3 file' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'YouTube link' })).toBeVisible();

    // Audio player controls
    await expect(page.locator('button', { hasText: 'Loop' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: '-5s' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Play' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: '+5s' })).toBeVisible();

    // Default starter markers
    await expect(page.getByRole('heading', { name: 'Markers' })).toBeVisible();
    await expect(page.locator('text=Intro').first()).toBeVisible();
    await expect(page.locator('text=Verse').first()).toBeVisible();
    await expect(page.locator('text=Chorus').first()).toBeVisible();
    await expect(page.locator('text=Bridge').first()).toBeVisible();

    // Voice Command Panel
    await expect(page.locator('text=Voice Cue')).toBeVisible();
    await expect(page.locator('text=Play').last()).toBeVisible();
    await expect(page.locator('text=Pause').last()).toBeVisible();
    await expect(page.locator('text=Go to Chorus')).toBeVisible();
    await expect(page.locator('text=Loop Chorus')).toBeVisible();
  });

  test('navigates from bottom tab bar to Studio and switches source mode', async ({ page }) => {
    await page.goto('/');

    // Click Studio tab (mobile TabBar or desktop Sidebar)
    const studioTab = page.locator('a[href="/studio"]').first();
    await studioTab.click();

    await expect(page).toHaveURL(/.*\/studio/);
    await expect(page.locator('text=DanceCue').first()).toBeVisible();

    // Switch to YouTube link
    await page.getByRole('button', { name: 'YouTube link' }).click();
    await expect(page.getByPlaceholder('Paste YouTube link')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use YouTube' })).toBeVisible();

    // Switch back to MP3 file
    await page.getByRole('button', { name: 'MP3 file' }).click();
    await expect(page.locator('text=Load MP3 or audio file')).toBeVisible();
  });
});
