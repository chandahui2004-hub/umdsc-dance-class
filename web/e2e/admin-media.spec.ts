import { test, expect } from '@playwright/test';
import { loginAsAdmin, mockApi, makeEvent } from './fixtures/mockApi';
import { adminBootstrap } from './fixtures/mockData';

const STYLES = [
  adminBootstrap.styles[0],
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

  test('.mov video file selection shows format warning', async ({ page }) => {
    await mockApi(page, BASE);
    await page.goto('/admin/media');
    await expect(page.getByRole('heading', { name: /Media Management/i })).toBeVisible();
    await page.getByRole('button', { name: /UPLOAD VIDEO/i }).click();
    await page.locator('input[type="file"][accept*="video"]').setInputFiles({
      name: 'class_recap.MOV',
      mimeType: 'video/quicktime',
      buffer: Buffer.from('fake-video-content')
    });
    await expect(page.getByText(/QuickTime \(\.mov\) or HEVC video/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /CONTINUE ANYWAY/i })).toBeVisible();
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
});
