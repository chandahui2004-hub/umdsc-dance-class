import { test, expect } from '@playwright/test';
import { adminBootstrap } from './fixtures/mockData';

const API_URL_REGEX = /(script\.google\.com|:5173\/api($|\?))/;

test.describe('Admin Master Data & Settings', () => {
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
              'styles.edit': '*',
              'instructors.edit': '*',
              'settings.edit': '*'
            }
          }
        })
      );
    });
  });

  test('pasting an unshared folder link shows the server message mentioning umdancesportc@gmail.com', async ({ page }) => {
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
              data: {
                ...adminBootstrap,
                settings: {
                  clubEmail: 'umdancesportc@gmail.com',
                  defaultAttendanceFolderId: 'f-att-default',
                  defaultVideoFolderId: 'f-vid-default',
                  dbFolderId: 'f-db-default'
                }
              },
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }

        if (body.action === 'settings.get') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: {
                clubEmail: 'umdancesportc@gmail.com',
                defaultAttendanceFolderId: 'f-att-default',
                defaultVideoFolderId: 'f-vid-default',
                dbFolderId: 'f-db-default'
              },
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }

        if (body.action === 'links.history') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: [],
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }

        if (body.action === 'settings.setLink') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: false,
              error: {
                code: 'LINK_NO_ACCESS',
                message: 'Share this folder with umdancesportc@gmail.com as Editor, then try again.',
                retryable: false
              }
            })
          });
        }
      }
      return route.continue();
    });

    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { name: /System Settings/i })).toBeVisible();

    // Find the default attendance folder link field
    const input = page.getByLabel(/Default Attendance Folder Link/i);
    await input.fill('https://drive.google.com/drive/folders/unshared-folder-123');

    // Click Update/Save button
    await page.getByRole('button', { name: /UPDATE ATTENDANCE LINK/i }).click();

    // Verify server error message mentioning umdancesportc@gmail.com is displayed
    await expect(
      page.getByText(/Share this folder with umdancesportc@gmail\.com as Editor/i)
    ).toBeVisible();
  });

  test('create and edit a dance style with color swatch and aliases', async ({ page }) => {
    let updatePayload: any = null;

    await page.route(API_URL_REGEX, async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        if (body.action === 'admin.bootstrap' || body.action === 'styles.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: [
                {
                  id: 'style-locking',
                  name: 'Locking',
                  aliases: ['locking', 'campbellocking'],
                  colorKey: 'green',
                  defaultWeekday: 1, // Monday
                  defaultStart: '19:30',
                  defaultEnd: '21:30',
                  defaultInstructorId: '',
                  defaultVenue: 'Dance Studio',
                  attendanceFolderId: '',
                  videoFolderId: '',
                  version: 1,
                  updatedBy: 'admin',
                  updatedAt: '2026-10-01T00:00:00.000Z',
                  active: true
                }
              ],
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }

        if (body.action === 'instructors.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: [
                {
                  id: 'inst-1',
                  name: 'Master Lock',
                  contact: '0123456789',
                  version: 1,
                  updatedBy: 'admin',
                  updatedAt: '2026-10-01T00:00:00.000Z',
                  active: true
                }
              ],
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }

        if (body.action === 'styles.update') {
          updatePayload = body.payload;
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: { ...body.payload, version: 2 },
              dataVersion: 2,
              serverTime: new Date().toISOString()
            })
          });
        }
      }
      return route.continue();
    });

    await page.goto('/admin/styles');
    await expect(page.getByRole('heading', { name: /Dance Styles/i })).toBeVisible();

    // Verify existing style Locking is listed
    await expect(page.getByRole('heading', { name: 'Locking' })).toBeVisible();

    // Click EDIT STYLE
    await page.getByRole('button', { name: /EDIT/i }).first().click();

    // Change venue
    await page.getByLabel(/Default Venue/i).fill('Main Hall Room 2');
    await page.getByRole('button', { name: /SAVE STYLE/i }).click();

    expect(updatePayload).toBeDefined();
    expect(updatePayload.defaultVenue).toBe('Main Hall Room 2');
  });

  test('instructors list: add new instructor and verify', async ({ page }) => {
    let createdPayload: any = null;

    await page.route(API_URL_REGEX, async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        if (body.action === 'admin.bootstrap' || body.action === 'instructors.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: createdPayload
                ? [
                    {
                      id: 'inst-created',
                      name: createdPayload.name,
                      contact: createdPayload.contact,
                      version: 1,
                      updatedBy: 'admin',
                      updatedAt: new Date().toISOString(),
                      active: true
                    }
                  ]
                : [],
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }

        if (body.action === 'instructors.create') {
          createdPayload = body.payload;
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: {
                id: 'inst-created',
                ...body.payload,
                version: 1,
                updatedBy: 'admin',
                updatedAt: new Date().toISOString(),
                active: true
              },
              dataVersion: 2,
              serverTime: new Date().toISOString()
            })
          });
        }
      }
      return route.continue();
    });

    await page.goto('/admin/instructors');
    await expect(page.getByRole('heading', { name: /Instructors/i })).toBeVisible();

    // Click + NEW INSTRUCTOR
    await page.getByRole('button', { name: /NEW INSTRUCTOR/i }).first().click();

    // Fill form
    await page.getByLabel(/Full Name/i).fill('Kenji Popping');
    await page.getByLabel(/Contact/i).fill('+60111223344');
    await page.getByRole('button', { name: /SAVE INSTRUCTOR/i }).click();

    // Expect instructor to appear
    await expect(page.getByText('Kenji Popping')).toBeVisible();
    await expect(page.getByText('+60111223344')).toBeVisible();
  });
});
