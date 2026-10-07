import type { Page } from '@playwright/test';
import { adminBootstrap } from './mockData';

export const API_URL_REGEX = /(script\.google\.com|:5173\/api($|\?))/;

export type Handler = (payload: any) => unknown;

/** Logs in as an admin with every permission. */
export async function loginAsAdmin(page: Page): Promise<void> {
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
            'members.import': '*', 'members.view': '*', 'styles.edit': '*', 'settings.edit': '*',
            'sessions.edit': '*', 'calendar.view': '*', 'attendance.edit': '*', 'attendance.view.all': '*',
            'export.download': '*', 'videos.upload': '*', 'videos.edit': '*', 'videos.view': '*',
            'music.edit': '*', 'music.view': '*'
          }
        }
      })
    );
  });
}

export function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-oct',
    version: 1,
    updatedBy: 'admin',
    updatedAt: '2026-10-01T00:00:00.000Z',
    active: true,
    name: 'OCT MONTHLY CLASS',
    nameKey: 'oct monthly class',
    type: 'monthly',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    sourceSheetId: 'src-oct',
    sourceTab: 'Form Responses 1',
    columnMapJson: '{}',
    classIndex: 5,
    styleIds: ['style-hiphop'],
    folderId: 'fld-oct',
    videoFolderId: '',
    membersSpreadsheetId: 'mem-oct',
    status: 'active',
    sourceRowCount: 3,
    sourceLastRowHash: 'abc',
    lastSyncAt: '2026-10-02T02:00:00.000Z',
    lastSyncError: '',
    memberCount: 3,
    folderMissing: false,
    ...overrides
  };
}

/**
 * Mocks the Apps Script API. `handlers` answer by action name; everything else gets
 * a sensible default. Returns the list of {action, payload} calls made.
 */
export async function mockApi(
  page: Page,
  handlers: Record<string, Handler> = {}
): Promise<{ action: string; payload: any }[]> {
  const calls: { action: string; payload: any }[] = [];
  const defaults: Record<string, Handler> = {
    'dancer.attendance': () => [],
    'admin.bootstrap': () => adminBootstrap,
    'styles.list': () => adminBootstrap.styles,
    'events.list': () => [makeEvent()],
    'events.autoSync': () => ({ checked: [], changed: [], skipped: [], errors: [] }),
    'settings.get': () => ({ clubEmail: 'umdancesportc@gmail.com' }),
    'instructors.list': () => adminBootstrap.instructors
  };

  await page.route(API_URL_REGEX, async route => {
    const req = route.request();
    if (req.method() !== 'POST') return route.continue();
    const body = JSON.parse(req.postData() || '{}');
    calls.push({ action: body.action, payload: body.payload });
    const handler = handlers[body.action] || defaults[body.action];
    const data = handler ? handler(body.payload) : {};
    const failure = (data as any)?.__error;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        failure
          ? {
              ok: false,
              // Like the real server: a busy server or quota hit is worth retrying, a refusal is not
              error: { code: failure.code, message: failure.message, retryable: failure.retryable ?? ['BUSY', 'QUOTA'].includes(failure.code) }
            }
          : { ok: true, data, dataVersion: 1, serverTime: new Date().toISOString() }
      )
    });
  });
  return calls;
}
