import { test, expect } from '@playwright/test';
import { adminBootstrap } from './fixtures/mockData';
import { mockApi, makeEvent } from './fixtures/mockApi';

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
    await page.getByRole('group', { name: /Dance styles taught/i }).getByRole('button', { name: 'Hip Hop' }).click();
    await page.getByRole('button', { name: /SAVE INSTRUCTOR/i }).click();

    // Expect instructor to appear
    await expect(page.getByText('Kenji Popping')).toBeVisible();
    await expect(page.getByText('+60111223344')).toBeVisible();
  });
});

const STYLE_BASE = {
  aliases: [], colorKey: 'green', defaultWeekday: 1, defaultStart: '20:00', defaultEnd: '22:00',
  defaultInstructorId: '', defaultVenue: '', attendanceFolderId: '', videoFolderId: '',
  version: 1, updatedBy: 'admin', updatedAt: '2026-10-01T00:00:00.000Z', active: true
};
const INST_BASE = { contact: '', version: 1, updatedBy: 'admin', updatedAt: '2026-10-01T00:00:00.000Z', active: true };

const STYLES = [
  { ...STYLE_BASE, id: 'locking', name: 'Locking', aliases: ['locking'] },
  { ...STYLE_BASE, id: 'popping', name: 'Popping', aliases: ['popping'] },
  { ...STYLE_BASE, id: 'waacking', name: 'Waacking', aliases: ['waacking'] }
];
const INSTRUCTORS = [
  { ...INST_BASE, id: 'carmen', name: 'Carmen', styleIds: ['locking'] },
  { ...INST_BASE, id: 'kelvin', name: 'Kelvin', styleIds: ['locking', 'popping'] },
  { ...INST_BASE, id: 'zed', name: 'Zed', styleIds: ['locking'], active: false }
];

test.describe('Style / instructor relationship', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'umdsc:session',
        JSON.stringify({
          token: 'admin-tok',
          claims: {
            sub: 'admin', role: 'admin', name: 'Club Admin', exp: Math.floor(Date.now() / 1000) + 36000, pv: 1,
            perms: { 'styles.edit': '*', 'instructors.edit': '*', 'settings.edit': '*' }
          }
        })
      );
    });
  });

  test('instructor form requires a style and saves styleIds', async ({ page }) => {
    const calls = await mockApi(page, {
      'styles.list': () => STYLES,
      'instructors.list': () => [],
      'instructors.create': (p) => ({ id: 'inst-new', ...p, version: 1, active: true })
    });
    await page.goto('/admin/instructors');
    await page.getByRole('button', { name: /NEW INSTRUCTOR/i }).first().click();
    await page.getByLabel(/Full Name/i).fill('Nina');

    const save = page.getByRole('button', { name: /SAVE INSTRUCTOR/i });
    await expect(save).toBeDisabled();

    const group = page.getByRole('group', { name: /Dance styles taught/i });
    await group.getByRole('button', { name: 'Locking' }).click();
    await group.getByRole('button', { name: 'Popping' }).click();
    await expect(save).toBeEnabled();

    // Unticking everything disables SAVE again
    await group.getByRole('button', { name: 'Popping' }).click();
    await group.getByRole('button', { name: 'Locking' }).click();
    await expect(save).toBeDisabled();
    await group.getByRole('button', { name: 'Locking' }).click();
    await group.getByRole('button', { name: 'Popping' }).click();

    await save.click();
    await expect
      .poll(() => calls.find((c) => c.action === 'instructors.create')?.payload?.styleIds)
      .toEqual(['locking', 'popping']);
  });

  test('instructor cards show their style chips', async ({ page }) => {
    await mockApi(page, { 'styles.list': () => STYLES, 'instructors.list': () => INSTRUCTORS });
    await page.goto('/admin/instructors');
    const kelvin = page.locator('.px-panel', { hasText: 'Kelvin' });
    await expect(kelvin.getByText('Locking', { exact: true })).toBeVisible();
    await expect(kelvin.getByText('Popping', { exact: true })).toBeVisible();
    const carmen = page.locator('.px-panel', { hasText: 'Carmen' });
    await expect(carmen.getByText('Locking', { exact: true })).toBeVisible();
    await expect(carmen.getByText('Popping', { exact: true })).toHaveCount(0);
  });

  test('a deactivated style is not shown on the card and is not sent when saving', async ({ page }) => {
    const calls = await mockApi(page, {
      'styles.list': () => [...STYLES, { ...STYLE_BASE, id: 'jazz', name: 'Jazz', aliases: ['jazz'], active: false }],
      'instructors.list': () => [{ ...INST_BASE, id: 'nina', name: 'Nina', styleIds: ['locking', 'style-gone', 'jazz'] }],
      'instructors.update': (p) => ({ ...p, version: 2, active: true })
    });
    await page.goto('/admin/instructors');
    const nina = page.locator('.px-panel', { hasText: 'Nina' });
    await expect(nina.getByText('Locking', { exact: true })).toBeVisible();
    await expect(nina.getByText('style-gone')).toHaveCount(0);
    await expect(nina.getByText('Jazz')).toHaveCount(0);

    await nina.getByRole('button', { name: 'EDIT' }).click();
    await page.getByRole('button', { name: /SAVE INSTRUCTOR/i }).click();
    await expect
      .poll(() => calls.find((c) => c.action === 'instructors.update')?.payload?.styleIds)
      .toEqual(['locking']);
  });

  test('unticking a style still used by an event shows the note', async ({ page }) => {
    await mockApi(page, {
      'styles.list': () => STYLES,
      'instructors.list': () => INSTRUCTORS,
      'events.list': () => [
        makeEvent({ styleIds: ['locking', 'popping'], styleInstructors: { locking: ['kelvin'], popping: ['carmen'] } })
      ]
    });
    await page.goto('/admin/instructors');
    await page.locator('.px-panel', { hasText: 'Kelvin' }).getByRole('button', { name: 'EDIT' }).click();
    const group = page.getByRole('group', { name: /Dance styles taught/i });
    await expect(page.getByText(/Still teaching/)).toHaveCount(0);
    await group.getByRole('button', { name: 'Locking' }).click();
    await expect(page.getByText('Still teaching Locking in OCT MONTHLY CLASS.')).toBeVisible();
    // Popping is assigned to someone else in that event, so unticking it adds nothing
    await group.getByRole('button', { name: 'Popping' }).click();
    await expect(page.getByText(/Still teaching Popping/)).toHaveCount(0);
  });

  test('the still-teaching note only covers styles the instructor had on opening', async ({ page }) => {
    await mockApi(page, {
      'styles.list': () => STYLES,
      'instructors.list': () => INSTRUCTORS,
      'events.list': () => [
        makeEvent({ styleIds: ['locking', 'waacking'], styleInstructors: { locking: ['carmen'], waacking: ['carmen'] } })
      ]
    });
    await page.goto('/admin/instructors');
    await page.locator('.px-panel', { hasText: 'Carmen' }).getByRole('button', { name: 'EDIT' }).click();
    // Waacking is unticked and assigned in the event, but Carmen did not have it when the form opened
    await expect(page.getByRole('group', { name: /Dance styles taught/i })).toBeVisible();
    await expect(page.getByText(/Still teaching/)).toHaveCount(0);
  });

  test('style form has no default instructor field', async ({ page }) => {
    const calls = await mockApi(page, {
      'styles.list': () => STYLES,
      'instructors.list': () => INSTRUCTORS,
      'styles.update': (p) => ({ ...p, version: 2 })
    });
    await page.goto('/admin/styles');
    await page.getByRole('button', { name: /EDIT/i }).first().click();
    await expect(page.getByLabel(/Default Venue/i)).toBeVisible();
    await expect(page.getByText(/Default Instructor/i)).toHaveCount(0);
    await page.getByRole('button', { name: /SAVE STYLE/i }).click();
    await expect.poll(() => calls.some((c) => c.action === 'styles.update')).toBe(true);
    const payload = calls.find((c) => c.action === 'styles.update')!.payload;
    expect('defaultInstructorId' in payload).toBe(false);
  });

  test('style cards list active instructors or "No instructors yet"', async ({ page }) => {
    await mockApi(page, { 'styles.list': () => STYLES, 'instructors.list': () => INSTRUCTORS });
    await page.goto('/admin/styles');
    await expect(page.getByText('Instructors: Carmen, Kelvin')).toBeVisible();
    await expect(page.getByText('Instructors: Kelvin')).toBeVisible();
    await expect(page.getByText('No instructors yet')).toBeVisible();
    await expect(page.getByRole('link', { name: /Add one/i })).toHaveAttribute('href', /\/admin\/instructors$/);
    await expect(page.getByText('Zed')).toHaveCount(0);
  });

  test('saving a duplicate style name shows the server message', async ({ page }) => {
    await mockApi(page, {
      'styles.list': () => STYLES,
      'instructors.list': () => INSTRUCTORS,
      'styles.create': () => ({ __error: { code: 'VALIDATION', message: 'A style named "Locking" already exists.' } })
    });
    await page.goto('/admin/styles');
    await page.getByRole('button', { name: /NEW STYLE/i }).first().click();
    await page.getByLabel('Style Name').fill('Locking');
    await page.getByRole('button', { name: /SAVE STYLE/i }).click();
    await expect(page.getByRole('alert')).toContainText('A style named "Locking" already exists.');
  });
});
