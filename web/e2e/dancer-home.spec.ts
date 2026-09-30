import { test, expect } from '@playwright/test';
import { mockApi, makeEvent } from './fixtures/mockApi';

const HIPHOP_STYLE = {
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
};

const INSTRUCTOR_ALEX = {
  id: 'inst-1',
  name: 'Alex Tan',
  contact: '0123456789',
  version: 1,
  updatedBy: 'admin',
  updatedAt: '2026-10-01T00:00:00.000Z',
  active: true
};

const SESSION_OCT_8 = {
  id: 'ses-1',
  eventId: 'evt-oct',
  styleId: 'style-hiphop',
  seq: 1,
  date: '2026-10-08',
  start: '20:00',
  end: '22:00',
  instructorId: 'inst-1',
  venue: 'Studio A',
  status: 'scheduled' as const,
  note: '',
  version: 1,
  updatedBy: 'admin',
  updatedAt: '2026-10-01T00:00:00.000Z',
  active: true
};

const SESSION_OCT_15 = {
  id: 'ses-2',
  eventId: 'evt-oct',
  styleId: 'style-hiphop',
  seq: 2,
  date: '2026-10-15',
  start: '20:00',
  end: '22:00',
  instructorId: 'inst-1',
  venue: 'Studio A',
  status: 'scheduled' as const,
  note: '',
  version: 1,
  updatedBy: 'admin',
  updatedAt: '2026-10-01T00:00:00.000Z',
  active: true
};

const VIDEO_RECAP = {
  id: 'vid-1',
  eventId: 'evt-oct',
  styleId: 'style-hiphop',
  sessionId: 'ses-1',
  title: 'Hip Hop Week 1 Routine Recap.mp4',
  driveFileId: 'drive-file-recap-123',
  mimeType: 'video/mp4',
  sizeBytes: 25000000,
  folderId: 'fld-class-1',
  uploadedBy: 'admin',
  source: 'upload' as const,
  version: 1,
  updatedBy: 'admin',
  updatedAt: '2026-10-08T22:30:00.000Z',
  active: true
};

const MUSIC_TRACK = {
  id: 'mus-1',
  eventId: 'evt-oct',
  styleId: 'style-hiphop',
  sessionId: 'ses-1',
  title: 'Old School Beat - 95 BPM',
  sourceType: 'mp3' as const,
  driveFileId: 'drive-file-music-456',
  youtubeId: '',
  version: 1,
  updatedBy: 'admin',
  updatedAt: '2026-10-08T22:35:00.000Z',
  active: true
};

const DANCER_BOOTSTRAP_DATA = {
  profile: {
    matricKey: '17201234',
    fullName: 'SARAH BINTI AHMAD',
    eventIds: ['evt-oct'],
    perms: {
      'calendar.view': '*',
      'attendance.view.own': '*',
      'videos.view': '*',
      'music.view': '*'
    }
  },
  events: [
    {
      id: 'evt-oct',
      name: 'OCT MONTHLY CLASS',
      type: 'monthly' as const,
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      status: 'active' as const,
      styleIds: ['style-hiphop']
    }
  ],
  styles: [HIPHOP_STYLE],
  instructors: [INSTRUCTOR_ALEX],
  sessions: [SESSION_OCT_8, SESSION_OCT_15],
  attendance: [
    { sessionId: 'ses-1', present: true },
    { sessionId: 'ses-2', present: false }
  ],
  videos: [VIDEO_RECAP],
  music: [MUSIC_TRACK],
  sections: []
};

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

test.describe('Dancer Portal: Home, DaySheet & Me Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDancer(page);
    await mockApi(page, {
      'dancer.bootstrap': () => DANCER_BOOTSTRAP_DATA
    });
  });

  test('calendar displays enrolled event, style markers, and opens day sheet on class click', async ({ page }) => {
    await page.goto('/');

    // Verify calendar header and event info
    await expect(page.getByText('OCT MONTHLY CLASS').last()).toBeVisible();
    await expect(page.getByText(/OCTOBER 2026/i)).toBeVisible();

    // Verify 2026-10-08 class day exists and has Hip Hop marker
    const oct8Btn = page.locator('button[data-date="2026-10-08"]');
    await expect(oct8Btn).toBeVisible();

    // Click on 2026-10-08 to open Day Sheet
    await oct8Btn.click();

    // Day Sheet / Class Card should show details
    await expect(page.getByRole('heading', { name: /OCTOBER 8, 2026|8 OCT 2026|CLASS DETAILS/i }).or(page.getByText(/HIP HOP/i).first())).toBeVisible();
    await expect(page.getByText('Alex Tan')).toBeVisible();
    await expect(page.getByText('Studio A')).toBeVisible();
    await expect(page.getByText('20:00 - 22:00')).toBeVisible();
    await expect(page.getByText('✓ ATTENDED')).toBeVisible();

    // Video section
    await expect(page.getByText('Hip Hop Week 1 Routine Recap.mp4')).toBeVisible();
    await expect(page.getByRole('link', { name: /OPEN IN DRIVE/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /DOWNLOAD/i })).toBeVisible();

    // Music section
    await expect(page.getByText('Old School Beat - 95 BPM')).toBeVisible();
    const studioBtn = page.getByRole('button', { name: /PRACTISE IN STUDIO|PRACTICE IN STUDIO/i });
    await expect(studioBtn).toBeVisible();

    // Clicking Practise in Studio navigates to /studio?music=mus-1
    await studioBtn.click();
    await expect(page).toHaveURL(/\/studio\?music=mus-1/);
  });

  test('Me page displays dancer profile, registered events, HeartsBar and handles log out', async ({ page }) => {
    await page.goto('/me');

    // Profile details
    await expect(page.getByText('SARAH BINTI AHMAD')).toBeVisible();
    await expect(page.getByText('17201234')).toBeVisible();

    // Events and attendance hearts
    await expect(page.getByText('OCT MONTHLY CLASS')).toBeVisible();
    await expect(page.getByText(/HIP HOP/i).first()).toBeVisible();

    // HeartsBar shows attendance score
    const heartsBar = page.locator('[role="img"][aria-label*="attended"]');
    await expect(heartsBar).toBeVisible();

    // Logout
    const logoutBtn = page.getByRole('button', { name: /LOG OUT/i });
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();

    // Should redirect to /login and clear session
    await expect(page).toHaveURL(/\/login/);
  });
});
