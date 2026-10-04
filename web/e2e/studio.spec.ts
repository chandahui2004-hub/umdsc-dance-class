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

const BOOTSTRAP_DATA = {
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
  music: [
    {
      id: 'm-hiphop-routine',
      eventId: 'evt-oct',
      styleId: 'style-hiphop',
      sessionId: 'ses-1',
      title: 'Hip Hop Routine Song',
      sourceType: 'mp3',
      driveFileId: 'drive-mp3-999',
      youtubeId: '',
      version: 1,
      updatedBy: 'admin',
      updatedAt: '2026-10-01T00:00:00.000Z',
      active: true
    }
  ],
  sections: [
    {
      id: 'sec-chorus',
      musicId: 'm-hiphop-routine',
      name: 'Routine Chorus Part A',
      startSec: 15,
      endSec: 45,
      videoId: '',
      videoStartSec: null,
      version: 1,
      updatedBy: 'admin',
      updatedAt: '2026-10-01T00:00:00.000Z',
      active: true
    }
  ]
};

test.describe('Music Studio (DanceCue & Sources)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDancer(page);
    await mockApi(page, {
      'dancer.bootstrap': () => BOOTSTRAP_DATA,
      'videos.list': () => BOOTSTRAP_DATA.videos,
      'music.list': () => BOOTSTRAP_DATA.music,
      'sections.list': () => BOOTSTRAP_DATA.sections
    });
  });

  test('loads Studio page and displays Class Music tab with track list', async ({ page }) => {
    await page.goto('/studio');

    // Header and title
    await expect(page.locator('text=DanceCue').first()).toBeVisible();
    await expect(page.locator('text=Rehearse in motion')).toBeVisible();

    // Source picker tabs
    await expect(page.getByRole('button', { name: 'Class Music' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'My MP3' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Link' })).toBeVisible();

    // Track in list
    await expect(page.locator('text=Hip Hop Routine Song')).toBeVisible();

    // Audio player controls
    await expect(page.locator('button', { hasText: 'Loop' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: '-5s' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Play' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: '+5s' })).toBeVisible();

    // Voice Command Panel
    await expect(page.getByRole('heading', { name: 'Voice Cue' })).toBeVisible();
  });

  test('preloads class music and sections via ?music=<id> query parameter', async ({ page }) => {
    await page.goto('/studio?music=m-hiphop-routine');

    // Active music label should appear
    await expect(page.locator('text=♪ Hip Hop Routine Song')).toBeVisible();

    // The class section should be visible with Class Section badge
    await expect(page.locator('text=Routine Chorus Part A')).toBeVisible();
    await expect(page.locator('text=Class Section')).toBeVisible();

    // Add personal loop
    await page.getByRole('button', { name: 'Add Loop' }).click();
    await page.getByPlaceholder(/Loop name/i).fill('Sarah Practice 8-Count');
    await page.getByRole('button', { name: 'Save Loop' }).click();

    // Verify personal loop appears with My Loop badge
    await expect(page.locator('text=Sarah Practice 8-Count')).toBeVisible();
    await expect(page.locator('text=My Loop')).toBeVisible();

    // Delete personal loop
    await page.getByTitle('Delete personal loop').click();
    await expect(page.locator('text=Sarah Practice 8-Count')).not.toBeVisible();
  });

  test('switches source modes between Class Music, My MP3, and Link', async ({ page }) => {
    await page.goto('/studio');

    // Switch to My MP3
    await page.getByRole('button', { name: 'My MP3' }).click();
    await expect(page.locator('text=Load MP3 or audio file')).toBeVisible();

    // Switch to Link (YouTube or SoundCloud)
    await page.getByRole('button', { name: 'Link' }).click();
    await expect(page.getByPlaceholder('Paste a YouTube or SoundCloud link')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use link' })).toBeVisible();

    // Switch back to Class Music
    await page.getByRole('button', { name: 'Class Music' }).click();
    await expect(page.locator('text=Hip Hop Routine Song')).toBeVisible();
  });
});

test.describe('Music Studio YouTube class music (real YouTube, needs internet)', () => {
  test('class music picked after opening studio plays YouTube @internet', async ({ page }) => {
    await loginAsDancer(page);
    const boot = {
      ...BOOTSTRAP_DATA,
      music: [
        {
          ...BOOTSTRAP_DATA.music[0],
          id: 'm-yt',
          title: 'YT Practice Track',
          sourceType: 'youtube',
          driveFileId: '',
          youtubeId: '4_KN-gA6uXY'
        }
      ],
      sections: []
    };
    await mockApi(page, {
      'dancer.bootstrap': () => boot,
      'videos.list': () => boot.videos,
      'music.list': () => boot.music,
      'sections.list': () => boot.sections
    });

    // Regression: opening /studio with no track used to build a YouTube player with an
    // empty videoId, which the YouTube API rejects, so a track picked afterwards never loaded.
    await page.goto('/studio');
    // A real user looks at the page for a moment before picking a song. By then YouTube's script
    // has loaded and the (hidden) player has been built with no track; clicking instantly would
    // dodge the bug.
    await page.waitForFunction(() => !!(window as any).YT?.Player);
    await page.waitForTimeout(1500);
    await page.getByText('YT Practice Track').first().click();
    await expect(page.getByText('YouTube audio ready')).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: /^play$/i }).first().click();

    await expect
      .poll(
        async () => {
          const frame = page.frames().find(f => f.url().includes('youtube.com/embed'));
          if (!frame) return -1;
          return frame
            .evaluate(() => {
              const v = document.querySelector('video');
              return v && !v.paused ? v.currentTime : -1;
            })
            .catch(() => -1);
        },
        { timeout: 20000 }
      )
      .toBeGreaterThan(0);
  });
});

test.describe('Music Studio SoundCloud class music (real SoundCloud, needs internet)', () => {
  test('a SoundCloud song plays through the widget and has no speed control @internet', async ({ page }) => {
    await loginAsDancer(page);
    const boot = {
      ...BOOTSTRAP_DATA,
      music: [
        {
          ...BOOTSTRAP_DATA.music[0],
          id: 'm-sc',
          title: 'SC Practice Track',
          sourceType: 'soundcloud',
          driveFileId: '',
          youtubeId: '',
          soundcloudUrl: 'https://soundcloud.com/forss/flickermood'
        }
      ],
      sections: []
    };
    await mockApi(page, {
      'dancer.bootstrap': () => boot,
      'videos.list': () => boot.videos,
      'music.list': () => boot.music,
      'sections.list': () => boot.sections
    });

    await page.goto('/studio?music=m-sc');

    await expect(page.getByText("Speed isn't available for SoundCloud songs.")).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Playback speed' })).toBeDisabled();
    // The widget loads inside SoundCloud's own iframe.
    await expect(page.locator('iframe[title="SoundCloud player"]')).toBeVisible();

    await page.waitForFunction(() => !!(window as any).SC?.Widget);
    await page.waitForTimeout(3000); // let the widget finish loading, as a real dancer would
    await page.getByRole('button', { name: /^play$/i }).first().click();

    // The Play button turns into Pause once SoundCloud reports it is playing.
    await expect(page.getByTitle('Pause')).toBeVisible({ timeout: 25000 });
  });
});
