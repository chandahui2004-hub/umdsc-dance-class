import { test, expect } from '@playwright/test';
import { adminBootstrap } from './fixtures/mockData';

const API_URL_REGEX = /(script\.google\.com|:5173\/api($|\?))/;

test.describe('Admin Media Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'umdsc:session',
        JSON.stringify({
          token: 'admin-tok',
          claims: {
            sub: 'admin',
            role: 'admin',
            name: 'Club Admin',
            exp: Math.floor(Date.now() / 1000) + 36000,
            pv: 1,
            perms: {
              'videos.view': '*',
              'videos.upload': '*',
              'videos.edit': '*',
              'music.view': '*',
              'music.edit': '*',
              'sections.edit': '*'
            }
          }
        })
      );

      // Mock Google GIS and Picker SDKs
      window.google = {
        accounts: {
          oauth2: {
            initTokenClient: (config: any) => ({
              requestAccessToken: () => {
                config.callback({
                  access_token: 'fake-oauth-token',
                  expires_in: 3600
                });
              }
            })
          }
        },
        picker: {
          ViewId: { FOLDERS: 'folders' },
          Action: { PICKED: 'picked', CANCEL: 'cancel' },
          DocsView: function () {
            return {
              setSelectFolderEnabled: () => this,
              setIncludeFolders: () => this,
              setParent: () => this
            };
          },
          PickerBuilder: function () {
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
                setVisible: () => {
                  this._cb?.({
                    action: 'picked',
                    docs: [{ id: 'f-vid-1', name: 'Popping Videos' }]
                  });
                }
              })
            };
          }
        }
      };

      (window as any).gapi = {
        load: (api: string, cb: () => void) => {
          cb();
        }
      };
    });
  });

  test('.mov video file selection shows format warning', async ({ page }) => {
    await page.route(API_URL_REGEX, async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        if (body.action === 'admin.bootstrap') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: adminBootstrap,
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'styles.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: adminBootstrap.styles,
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'sessions.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: [
                {
                  id: 'ses-1',
                  month: '2026-10',
                  styleId: 'style-hiphop',
                  seq: 1,
                  date: '2026-10-08',
                  start: '20:00',
                  end: '22:00',
                  venue: 'Dance Room 1',
                  status: 'scheduled'
                }
              ],
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'videos.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, data: [], dataVersion: 1, serverTime: new Date().toISOString() })
          });
        }
        if (body.action === 'music.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, data: [], dataVersion: 1, serverTime: new Date().toISOString() })
          });
        }
      }
      return route.continue();
    });

    await page.goto('/admin/media');
    await expect(page.getByRole('heading', { name: /Media Management/i })).toBeVisible();

    // Click "UPLOAD VIDEO" button
    await page.getByRole('button', { name: /UPLOAD VIDEO/i }).click();

    // Set a .mov file in the file input
    const fileInput = page.locator('input[type="file"][accept*="video"]');
    await fileInput.setInputFiles({
      name: 'class_recap.MOV',
      mimeType: 'video/quicktime',
      buffer: Buffer.from('fake-video-content')
    });

    // Warning message appears
    await expect(page.getByText(/QuickTime \(\.mov\) or HEVC video/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /CONTINUE ANYWAY/i })).toBeVisible();
  });

  test('upload flow calls videos.register with new file ID', async ({ page }) => {
    let registeredPayload: any = null;

    // Mock Google Drive APIs (files, permissions, upload)
    await page.route(/googleapis\.com/, async (route) => {
      const req = route.request();
      const url = req.url();

      if (url.includes('/upload/drive/v3/files?uploadType=resumable')) {
        return route.fulfill({
          status: 200,
          headers: {
            'Location': 'https://www.googleapis.com/upload/mock-session',
            'Access-Control-Expose-Headers': 'Location',
            'Access-Control-Allow-Origin': '*'
          },
          body: ''
        });
      }

      if (url.includes('/upload/mock-session')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'uploaded-drive-file-999',
            name: 'class_recap.mp4',
            mimeType: 'video/mp4'
          })
        });
      }

      if (url.includes('/drive/v3/files/uploaded-drive-file-999/permissions')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'perm-1' })
        });
      }

      if (url.includes('/drive/v3/files?')) {
        // query for existing folders
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ files: [{ id: 'class-folder-id', name: '2026-10-08 Class 1' }] })
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'folder-created' })
      });
    });

    await page.route(API_URL_REGEX, async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        if (body.action === 'admin.bootstrap') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: adminBootstrap,
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'styles.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: adminBootstrap.styles,
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'sessions.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: [
                {
                  id: 'ses-1',
                  month: '2026-10',
                  styleId: 'style-hiphop',
                  seq: 1,
                  date: '2026-10-08',
                  start: '20:00',
                  end: '22:00',
                  venue: 'Dance Room 1',
                  status: 'scheduled'
                }
              ],
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'videos.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, data: [], dataVersion: 1, serverTime: new Date().toISOString() })
          });
        }
        if (body.action === 'music.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, data: [], dataVersion: 1, serverTime: new Date().toISOString() })
          });
        }
        if (body.action === 'videos.targetFolder') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: {
                rootFolderId: 'f-vid-1',
                monthFolderName: '2026-10',
                classFolderName: '2026-10-08 Hip Hop Class 1',
                musicFolderName: 'Music'
              },
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'videos.register') {
          registeredPayload = body.payload;
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: {
                id: 'vid-new-1',
                title: body.payload.title,
                driveFileId: body.payload.driveFileId,
                sessionId: body.payload.sessionId
              },
              dataVersion: 2,
              serverTime: new Date().toISOString()
            })
          });
        }
      }
      return route.continue();
    });

    await page.goto('/admin/media');

    // Click "UPLOAD VIDEO"
    await page.getByRole('button', { name: /UPLOAD VIDEO/i }).click();

    // Select MP4 file
    const fileInput = page.locator('input[type="file"][accept*="video"]');
    await fileInput.setInputFiles({
      name: 'routine_recap.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('fake-mp4-data')
    });

    // Click Start Upload
    await page.getByRole('button', { name: /START UPLOAD/i }).click();

    // Verify videos.register was invoked with new file ID
    await expect.poll(() => registeredPayload).not.toBeNull();
    expect(registeredPayload.driveFileId).toBe('uploaded-drive-file-999');
    expect(registeredPayload.sessionId).toBe('ses-1');
  });

  test('scan folder confirms and registers chosen session', async ({ page }) => {
    let scanRegisteredPayload: any = null;

    await page.route(API_URL_REGEX, async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        if (body.action === 'admin.bootstrap') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: adminBootstrap,
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'styles.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: adminBootstrap.styles,
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'sessions.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: [
                {
                  id: 'ses-1',
                  month: '2026-10',
                  styleId: 'style-hiphop',
                  seq: 1,
                  date: '2026-10-08',
                  start: '20:00',
                  end: '22:00',
                  venue: 'Dance Room 1',
                  status: 'scheduled'
                }
              ],
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'videos.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, data: [], dataVersion: 1, serverTime: new Date().toISOString() })
          });
        }
        if (body.action === 'music.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, data: [], dataVersion: 1, serverTime: new Date().toISOString() })
          });
        }
        if (body.action === 'videos.scan') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: [
                {
                  fileId: 'scan-vid-888',
                  name: '2026-10-08 HipHop Recap.mp4',
                  sizeBytes: 15000000,
                  mimeType: 'video/mp4',
                  suggestedSessionId: 'ses-1',
                  reason: 'Filename date matched 2026-10-08'
                }
              ],
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'videos.register') {
          scanRegisteredPayload = body.payload;
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: {
                id: 'vid-registered-888',
                title: body.payload.title,
                driveFileId: body.payload.driveFileId,
                sessionId: body.payload.sessionId
              },
              dataVersion: 2,
              serverTime: new Date().toISOString()
            })
          });
        }
      }
      return route.continue();
    });

    await page.goto('/admin/media');

    // Click "SCAN FOLDER" button
    await page.getByRole('button', { name: /SCAN FOLDER/i }).click();

    // Verify scanned file appears with suggested session
    await expect(page.getByText('2026-10-08 HipHop Recap.mp4')).toBeVisible();

    // Click "REGISTER" button for the file
    await page.getByRole('button', { name: /REGISTER VIDEO/i }).click();

    // Verify videos.register was invoked
    await expect.poll(() => scanRegisteredPayload).not.toBeNull();
    expect(scanRegisteredPayload.driveFileId).toBe('scan-vid-888');
    expect(scanRegisteredPayload.sessionId).toBe('ses-1');
  });
});
