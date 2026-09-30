import { test, expect } from '@playwright/test';
import { adminBootstrap } from './fixtures/mockData';
import type { ClassSession } from '@umdsc/shared';

const API_URL_REGEX = /(script\.google\.com|:5173\/api($|\?))/;

test.describe('Admin Classes & Calendar', () => {
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
            perms: { 'calendar.view': '*', 'sessions.edit': '*' }
          }
        })
      );
    });
  });

  test('generate month for Popping shows 4 sessions on Tuesdays of Oct 2026', async ({ page }) => {
    let currentSessions: ClassSession[] = [];

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
                styles: [
                  {
                    id: 'style-popping',
                    name: 'Popping',
                    aliases: ['popping'],
                    colorKey: 'blue',
                    defaultWeekday: 2, // Tuesday
                    defaultStart: '20:00',
                    defaultEnd: '22:00',
                    defaultInstructorId: 'inst-1',
                    defaultVenue: 'Studio A',
                    attendanceFolderId: 'f-1',
                    videoFolderId: 'f-2',
                    version: 1,
                    updatedBy: 'admin',
                    updatedAt: '2026-10-01T00:00:00.000Z',
                    active: true
                  }
                ],
                instructors: [
                  {
                    id: 'inst-1',
                    name: 'Alex Tan',
                    contact: '0123456789',
                    version: 1,
                    updatedBy: 'admin',
                    updatedAt: '2026-10-01T00:00:00.000Z',
                    active: true
                  }
                ]
              },
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
              data: currentSessions,
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }

        if (body.action === 'sessions.generateMonth') {
          currentSessions = [
            {
              id: 'ses-1',
              month: '2026-10',
              styleId: 'style-popping',
              seq: 1,
              date: '2026-10-06',
              start: '20:00',
              end: '22:00',
              instructorId: 'inst-1',
              venue: 'Studio A',
              status: 'scheduled',
              note: '',
              version: 1,
              updatedBy: 'admin',
              updatedAt: '2026-10-01T00:00:00.000Z',
              active: true
            },
            {
              id: 'ses-2',
              month: '2026-10',
              styleId: 'style-popping',
              seq: 2,
              date: '2026-10-13',
              start: '20:00',
              end: '22:00',
              instructorId: 'inst-1',
              venue: 'Studio A',
              status: 'scheduled',
              note: '',
              version: 1,
              updatedBy: 'admin',
              updatedAt: '2026-10-01T00:00:00.000Z',
              active: true
            },
            {
              id: 'ses-3',
              month: '2026-10',
              styleId: 'style-popping',
              seq: 3,
              date: '2026-10-20',
              start: '20:00',
              end: '22:00',
              instructorId: 'inst-1',
              venue: 'Studio A',
              status: 'scheduled',
              note: '',
              version: 1,
              updatedBy: 'admin',
              updatedAt: '2026-10-01T00:00:00.000Z',
              active: true
            },
            {
              id: 'ses-4',
              month: '2026-10',
              styleId: 'style-popping',
              seq: 4,
              date: '2026-10-27',
              start: '20:00',
              end: '22:00',
              instructorId: 'inst-1',
              venue: 'Studio A',
              status: 'scheduled',
              note: '',
              version: 1,
              updatedBy: 'admin',
              updatedAt: '2026-10-01T00:00:00.000Z',
              active: true
            }
          ];

          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: { generated: currentSessions, flags: [] },
              dataVersion: 2,
              serverTime: new Date().toISOString()
            })
          });
        }
      }
      return route.continue();
    });

    await page.goto('/admin/calendar');
    await expect(page.getByRole('heading', { name: /Calendar/i })).toBeVisible();

    // Click Generate Month
    await page.getByRole('button', { name: /GENERATE MONTH/i }).click();

    // In dialog, select Popping and submit
    await page.getByLabel(/Popping/i).check();
    await page.getByRole('button', { name: /CONFIRM GENERATE/i }).click();

    // Expect 4 sessions visible
    await expect(page.getByText('4 sessions scheduled')).toBeVisible();
    await expect(page.getByText(/2026-10-06.*Popping/i)).toBeVisible();
  });

  test('moving a session via the calendar calls sessions.update with the new date and keeps the same id', async ({ page }) => {
    let updatePayload: any = null;

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

        if (body.action === 'sessions.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: [
                {
                  id: 'ses-move-1',
                  month: '2026-10',
                  styleId: 'style-hiphop',
                  seq: 1,
                  date: '2026-10-08',
                  start: '20:00',
                  end: '22:00',
                  instructorId: 'inst-1',
                  venue: 'Dance Room 1',
                  status: 'scheduled',
                  note: '',
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

        if (body.action === 'sessions.update') {
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

    await page.goto('/admin/calendar');
    // Click on the existing session to open SessionEditor
    await page.getByText(/Hip Hop Class 1/i).click();

    // Change date to 2026-10-09
    await page.getByLabel(/Date/i).fill('2026-10-09');
    await page.getByRole('button', { name: /SAVE CHANGES/i }).click();

    expect(updatePayload).toBeDefined();
    expect(updatePayload.id).toBe('ses-move-1');
    expect(updatePayload.date).toBe('2026-10-09');
  });

  test('VERSION_CONFLICT shows reload/overwrite dialog', async ({ page }) => {
    let updateAttempts = 0;

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

        if (body.action === 'sessions.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: [
                {
                  id: 'ses-conflict-1',
                  month: '2026-10',
                  styleId: 'style-hiphop',
                  seq: 1,
                  date: '2026-10-08',
                  start: '20:00',
                  end: '22:00',
                  instructorId: 'inst-1',
                  venue: 'Dance Room 1',
                  status: 'scheduled',
                  note: '',
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

        if (body.action === 'sessions.update') {
          updateAttempts++;
          if (updateAttempts === 1) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                ok: false,
                error: {
                  code: 'VERSION_CONFLICT',
                  message: 'Conflict',
                  retryable: false,
                  latest: {
                    id: 'ses-conflict-1',
                    version: 2,
                    updatedBy: 'another-admin',
                    updatedAt: '2026-10-02T10:00:00Z',
                    date: '2026-10-08'
                  }
                }
              })
            });
          }

          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: { ...body.payload, version: 3 },
              dataVersion: 3,
              serverTime: new Date().toISOString()
            })
          });
        }
      }
      return route.continue();
    });

    await page.goto('/admin/calendar');
    await page.getByText(/Hip Hop Class 1/i).click();

    // Click Save Changes to trigger conflict
    await page.getByRole('button', { name: /SAVE CHANGES/i }).click();

    // Conflict banner appears
    await expect(page.getByText(/Changed by another-admin/i)).toBeVisible();

    // Click Overwrite
    await page.getByRole('button', { name: /OVERWRITE/i }).click();

    expect(updateAttempts).toBe(2);
  });
});
