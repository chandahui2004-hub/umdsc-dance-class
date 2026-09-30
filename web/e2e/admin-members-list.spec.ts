import { test, expect } from '@playwright/test';
import { loginAsAdmin, mockApi, makeEvent } from './fixtures/mockApi';
import { adminBootstrap } from './fixtures/mockData';

const member = (matric: string, name: string) => ({
  memberId: 'M-' + matric, fullName: name, matricRaw: matric, matricKey: matric, nameKey: name.toLowerCase(),
  contact: '0123456789', email: `${matric}@t.com`, gender: 'F', nationality: 'Malaysian',
  styleIds: ['style-hiphop'], styleNames: ['Hip Hop'], sourceTimestamp: '', flags: []
});

test.describe('Registered dancers by event', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('follows the event picker', async ({ page }) => {
    const calls = await mockApi(page, {
      'styles.list': () => adminBootstrap.styles,
      'events.list': () => [makeEvent(), makeEvent({ id: 'evt-trial', name: 'TRIAL CLASS', startDate: '2026-09-01' })],
      'members.list': p => (p.eventId === 'evt-oct' ? [member('22001111', 'Oct Dancer')] : [member('22002222', 'Trial Dancer')])
    });
    await page.goto('/admin/members');

    await expect(page.getByText('Oct Dancer').locator('visible=true').first()).toBeVisible();
    expect(calls.filter(c => c.action === 'members.list').at(-1)?.payload).toMatchObject({ eventId: 'evt-oct' });

    await page.getByLabel('Current event').selectOption('evt-trial');
    await expect(page.getByText('Trial Dancer').locator('visible=true').first()).toBeVisible();
    expect(calls.filter(c => c.action === 'members.list').at(-1)?.payload).toMatchObject({ eventId: 'evt-trial' });
  });
});
