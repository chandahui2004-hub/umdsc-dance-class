import { test, expect } from '@playwright/test';
import { loginAsAdmin, mockApi, makeEvent } from './fixtures/mockApi';
import { adminBootstrap } from './fixtures/mockData';

// The class lead account that authorized the Hip Hop folder; uploads must sign in with it.
const UPLOADER = 'hiphop.lead@example.com';
const STYLES = [
  { ...adminBootstrap.styles[0], videoUploaderEmail: UPLOADER },
  { ...adminBootstrap.styles[0], id: 'style-latin', name: 'Latin', aliases: ['latin'], colorKey: 'pink' }
];
const EVENT = makeEvent({ styleIds: ['style-hiphop'] });
const SESSIONS = [
  {
    id: 'ses-1', eventId: 'evt-oct', styleId: 'style-hiphop', seq: 1, date: '2026-10-08', start: '20:00', end: '22:00',
    venue: 'Dance Room 1', status: 'scheduled', instructorId: '', note: '', version: 1, updatedBy: 'admin', updatedAt: '', active: true
  }
];
const BASE = {
  'events.list': () => [EVENT],
  'styles.list': () => STYLES,
  'sessions.list': () => SESSIONS,
  'videos.list': () => [],
  'music.list': () => []
};

test.describe('Admin Media Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.addInitScript(() => {
      // Mock Google GIS and Picker SDKs
      (window as any).google = {
        accounts: {
          oauth2: {
            initTokenClient: (config: any) => ({
              requestAccessToken: () => config.callback({ access_token: 'fake-oauth-token', expires_in: 3600 })
            })
          }
        },
        picker: {
          ViewId: { FOLDERS: 'folders' },
          Action: { PICKED: 'picked', CANCEL: 'cancel' },
          DocsView: function (this: any) {
            return { setSelectFolderEnabled: () => this, setIncludeFolders: () => this, setParent: () => this };
          },
          PickerBuilder: function (this: any) {
            return {
              addView: () => this,
              setOAuthToken: () => this,
              setDeveloperKey: () => this,
              setAppId: () => this,
              setCallback: (cb: any) => {
                this._cb = cb;
                return this;
              },
              build: () => ({
                setVisible: () => this._cb?.({ action: 'picked', docs: [{ id: 'video-master', name: 'Videos' }] })
              })
            };
          }
        }
      };
      (window as any).gapi = { load: (_api: string, cb: () => void) => cb() };
    });
  });

  test('shows only the event styles and loads its classes', async ({ page }) => {
    const calls = await mockApi(page, BASE);
    await page.goto('/admin/media');
    await expect(page.getByRole('button', { name: 'Hip Hop', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Latin', exact: true })).toHaveCount(0);
    await expect.poll(() => calls.find(c => c.action === 'sessions.list')?.payload).toEqual({ eventId: 'evt-oct', styleId: 'style-hiphop' });
  });

  test('admin pastes a Spotify link, confirms a YouTube version, and saves it', async ({ page }) => {
    const SPOTIFY = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
    const calls = await mockApi(page, {
      ...BASE,
      'music.resolveLink': () => ({
        kind: 'spotify',
        spotifyUrl: SPOTIFY,
        title: 'Never Gonna Give You Up',
        artist: 'Rick Astley',
        durationSec: 214,
        candidates: [
          { youtubeId: 'aaaaaaaaaaa', title: 'Never Gonna Give You Up', channel: 'Rick Astley - Topic', durationSec: 214, thumbnailUrl: '', lengthMatch: true },
          { youtubeId: 'bbbbbbbbbbb', title: 'Never Gonna Give You Up (Extended)', channel: 'Some Label', durationSec: 252, thumbnailUrl: '', lengthMatch: false }
        ]
      }),
      'music.create': () => ({ id: 'mus-1' })
    });
    await page.goto('/admin/media');
    await page.getByRole('button', { name: /MUSIC LINK/i }).first().click();

    await page.getByPlaceholder('Paste a YouTube, Spotify, SoundCloud or Drive MP3 link').fill(SPOTIFY);
    await expect(page.getByText('Never Gonna Give You Up · Rick Astley · 3:34')).toBeVisible();
    await expect(page.getByText('✓ same length')).toBeVisible();
    await expect(page.getByText('✗ different length — check the version')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ADD MUSIC', exact: true })).toBeDisabled();

    await page.getByRole('button', { name: 'USE THIS' }).first().click();
    await page.getByRole('button', { name: 'ADD MUSIC', exact: true }).click();

    await expect
      .poll(() => calls.find(c => c.action === 'music.create')?.payload)
      .toMatchObject({ url: SPOTIFY, chosenYoutubeId: 'aaaaaaaaaaa', styleId: 'style-hiphop', eventId: 'evt-oct' });
  });

  test('.mov video file selection does not block upload with format warning', async ({ page }) => {
    await mockApi(page, BASE);
    await page.goto('/admin/media');
    await expect(page.getByRole('heading', { name: /Media Management/i })).toBeVisible();
    await page.getByRole('button', { name: /UPLOAD VIDEO/i }).click();
    await page.locator('input[type="file"][accept*="video"]').setInputFiles({
      name: 'class_recap.MOV',
      mimeType: 'video/quicktime',
      buffer: Buffer.from('fake-video-content')
    });
    await expect(page.getByText(/QuickTime \(\.mov\) or HEVC video/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^START UPLOAD/i })).toBeEnabled();
  });

  test('upload flow calls videos.register with the new file and event folder', async ({ page }) => {
    await page.route(/googleapis\.com/, async route => {
      const url = route.request().url();
      if (url.includes('/upload/drive/v3/files?uploadType=resumable')) {
        return route.fulfill({
          status: 200,
          headers: {
            Location: 'https://www.googleapis.com/upload/mock-session',
            'Access-Control-Expose-Headers': 'Location',
            'Access-Control-Allow-Origin': '*'
          },
          body: ''
        });
      }
      if (url.includes('/upload/mock-session')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'uploaded-drive-file-999', name: 'routine_recap.mp4' }) });
      }
      if (url.includes('/drive/v3/about')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { emailAddress: UPLOADER } }) });
      }
      if (url.includes('/drive/v3/about')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { emailAddress: UPLOADER } }) });
      }
      if (url.includes('/permissions')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'perm-1' }) });
      }
      if (url.includes('/drive/v3/files?')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: 'existing-folder', name: 'x' }] }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'folder-created' }) });
    });
    const calls = await mockApi(page, {
      ...BASE,
      'videos.targetFolder': () => ({
        videoMasterFolderId: 'video-master',
        eventFolderId: '',
        eventFolderName: 'OCT MONTHLY CLASS',
        classFolderName: '2026-10-08 Hip Hop Class 1',
        musicFolderName: 'Music'
      }),
      'videos.register': p => ({ id: 'vid-new-1', title: p.title, driveFileId: p.driveFileId, sessionId: p.sessionId })
    });

    await page.goto('/admin/media');
    await page.getByRole('button', { name: /UPLOAD VIDEO/i }).click();
    await page.locator('input[type="file"][accept*="video"]').setInputFiles({
      name: 'routine_recap.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('fake-mp4-data')
    });
    await page.getByRole('button', { name: /START UPLOAD/i }).click();

    await expect.poll(() => calls.find(c => c.action === 'videos.register')?.payload).toMatchObject({
      driveFileId: 'uploaded-drive-file-999',
      sessionId: 'ses-1',
      eventFolderId: 'existing-folder'
    });
  });

  test('scan folder sends the event and registers the chosen class', async ({ page }) => {
    const calls = await mockApi(page, {
      ...BASE,
      'videos.scan': () => [
        { fileId: 'scan-vid-888', name: '2026-10-08 HipHop Recap.mp4', sizeBytes: 15000000, mimeType: 'video/mp4', suggestedSessionId: 'ses-1', reason: 'filename date' }
      ],
      'videos.register': p => ({ id: 'vid-registered-888', title: p.title, driveFileId: p.driveFileId, sessionId: p.sessionId })
    });

    await page.goto('/admin/media');
    await page.getByRole('button', { name: /SCAN FOLDER/i }).click();
    await expect(page.getByText('2026-10-08 HipHop Recap.mp4')).toBeVisible();
    expect(calls.find(c => c.action === 'videos.scan')?.payload).toEqual({ styleId: 'style-hiphop', eventId: 'evt-oct' });

    await page.getByRole('button', { name: /REGISTER VIDEO/i }).click();
    await expect.poll(() => calls.find(c => c.action === 'videos.register')?.payload).toMatchObject({
      driveFileId: 'scan-vid-888',
      sessionId: 'ses-1'
    });
  });

  test('collapses and expands all recap videos', async ({ page }) => {
    await mockApi(page, {
      ...BASE,
      'videos.list': () => [
        {
          id: 'vid-1',
          sessionId: 'ses-1',
          title: 'Routine Part 1.mp4',
          driveFileId: 'drive-vid-1',
          mimeType: 'video/mp4',
          sizeBytes: 1234567,
          uploadedBy: 'admin',
          createdAt: '2026-10-08T20:30:00Z',
          version: 1,
          active: true
        },
        {
          id: 'vid-2',
          sessionId: 'ses-1',
          title: 'Routine Part 2.mp4',
          driveFileId: 'drive-vid-2',
          mimeType: 'video/mp4',
          sizeBytes: 2345678,
          uploadedBy: 'admin',
          createdAt: '2026-10-08T20:35:00Z',
          version: 1,
          active: true
        }
      ]
    });

    await page.goto('/admin/media');
    await expect(page.getByText('CLASS RECAP VIDEOS (2)')).toBeVisible();

    // Both videos visible and collapse all button available
    const collapseAllBtn = page.getByRole('button', { name: /COLLAPSE ALL/i });
    await expect(collapseAllBtn).toBeVisible();

    // Click collapse all
    await collapseAllBtn.click();
    await expect(page.getByRole('button', { name: /EXPAND ALL/i })).toBeVisible();

    // In collapsed state, collapsed summary chips or video titles are visible in compact rows
    await expect(page.getByText('Routine Part 1.mp4').first()).toBeVisible();

    // Click expand all
    await page.getByRole('button', { name: /EXPAND ALL/i }).click();
    await expect(page.getByRole('button', { name: /COLLAPSE ALL/i })).toBeVisible();
  });

  test('selects multiple video files and shows batch selection list with sizes', async ({ page }) => {
    await mockApi(page, BASE);
    await page.goto('/admin/media');
    await page.getByRole('button', { name: /UPLOAD VIDEO/i }).click();

    // Select 2 video files at once
    await page.locator('input[type="file"][accept*="video"]').setInputFiles([
      { name: 'part1.mp4', mimeType: 'video/mp4', buffer: Buffer.from('file-1-content') },
      { name: 'part2.mp4', mimeType: 'video/mp4', buffer: Buffer.from('file-2-content') }
    ]);

    // Should list both files with badge showing 2 FILES
    await expect(page.getByText('2 FILES SELECTED')).toBeVisible();
    await expect(page.getByText('part1.mp4')).toBeVisible();
    await expect(page.getByText('part2.mp4')).toBeVisible();
    await expect(page.getByRole('button', { name: /START UPLOAD \(2 VIDEOS\)/i })).toBeVisible();
  });
});

