import { test, expect } from '@playwright/test';
import { loginAsAdmin, mockApi, makeEvent } from './fixtures/mockApi';
import { adminBootstrap } from './fixtures/mockData';

const TWO_STYLES = [
  ...adminBootstrap.styles,
  {
    ...adminBootstrap.styles[0],
    id: 'style-popping',
    name: 'Popping',
    aliases: ['popping'],
    colorKey: 'blue'
  }
];

const member = (matric: string, name: string, styleIds = ['style-hiphop'], styleNames = ['Hip Hop']) => ({
  memberId: 'M-' + matric, fullName: name, matricRaw: matric, matricKey: matric, nameKey: name.toLowerCase(),
  contact: '0123456789', email: `${matric}@t.com`, gender: 'F', nationality: 'Malaysian',
  styleIds, styleNames, sourceTimestamp: '', flags: []
});

test.describe('Registered dancers by event', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('follows the event picker', async ({ page }) => {
    const calls = await mockApi(page, {
      'styles.list': () => adminBootstrap.styles,
      'events.list': () => [makeEvent(), makeEvent({ id: 'evt-trial', name: 'TRIAL CLASS', startDate: '2026-09-01' })],
      'members.list': p => (p.eventId === 'evt-trial' ? [member('22002222', 'Trial Dancer')] : [member('22001111', 'Oct Dancer')])
    });
    await page.goto('/admin/members');

    await expect(page.getByText('Oct Dancer').locator('visible=true').first()).toBeVisible();
    expect(calls.some(c => c.action === 'members.list' && c.payload?.eventId === 'evt-oct')).toBe(true);

    await page.getByRole('button', { name: /Current event/i }).click();
    await page.getByRole('option', { name: /TRIAL CLASS/i }).click();
    await expect(page.getByText('Trial Dancer').locator('visible=true').first()).toBeVisible();
    expect(calls.some(c => c.action === 'members.list' && c.payload?.eventId === 'evt-trial')).toBe(true);
  });

  test('adds a new dancer with selected dance classes via + ADD DANCER (including full class override)', async ({ page }) => {
    let dancers = [member('22001111', 'Oct Dancer')];
    const fullHipHopEvent = makeEvent({
      styleIds: ['style-hiphop', 'style-popping'],
      styleSlots: { 'style-hiphop': 1, 'style-popping': 20 },
      notifiedFullStyles: ['style-hiphop'],
      memberCount: 1
    });

    const calls = await mockApi(page, {
      'admin.bootstrap': () => ({ ...adminBootstrap, styles: TWO_STYLES }),
      'styles.list': () => TWO_STYLES,
      'events.list': () => [fullHipHopEvent],
      'members.list': () => dancers,
      'members.add': p => {
        const styleNames = (p.styleIds || []).map((id: string) => TWO_STYLES.find(s => s.id === id)?.name || id);
        dancers = [
          ...dancers,
          {
            memberId: `M-${p.matricRaw}`,
            fullName: p.fullName,
            matricRaw: p.matricRaw,
            matricKey: p.matricRaw,
            nameKey: p.fullName.toLowerCase(),
            contact: p.contact || '',
            email: p.email || '',
            gender: p.gender || '',
            nationality: p.nationality || '',
            styleIds: p.styleIds,
            styleNames,
            sourceTimestamp: '2026-10-02T03:00:00.000Z',
            flags: []
          }
        ];
        return { memberId: `M-${p.matricRaw}`, result: { added: 1 } };
      }
    });

    await page.goto('/admin/members');
    await expect(page.getByText('Oct Dancer').locator('visible=true').first()).toBeVisible();

    await page.getByRole('button', { name: /\+ ADD DANCER/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/ADD NEW DANCER/i)).toBeVisible();
    await expect(dialog.getByText(/FULL — ADMIN OVERRIDE \(FORM STAYS CLOSED\)/i)).toBeVisible();

    await dialog.getByLabel(/Full name/i).fill('Zoe Lim');
    await dialog.getByLabel(/Matric number/i).fill('24009999');
    await dialog.getByLabel(/Phone number/i).fill('0123334444');
    await dialog.getByLabel(/Email/i).fill('zoe@um.edu.my');
    await dialog.getByLabel(/Gender/i).fill('Female');
    await dialog.getByLabel(/Nationality/i).fill('Malaysian');
    await dialog.getByLabel(/Hip Hop/i).check();
    await dialog.getByLabel(/Popping/i).check();

    await dialog.getByRole('button', { name: /^ADD DANCER$/i }).click();

    await expect.poll(() => calls.find(c => c.action === 'members.add')?.payload).toEqual({
      eventId: 'evt-oct',
      fullName: 'Zoe Lim',
      matricRaw: '24009999',
      contact: '0123334444',
      email: 'zoe@um.edu.my',
      gender: 'Female',
      nationality: 'Malaysian',
      styleIds: ['style-hiphop', 'style-popping']
    });
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Zoe Lim').locator('visible=true').first()).toBeVisible();
  });

  test('edits dance classes via EDIT DETAILS and removes a dancer via REMOVE FROM EVENT', async ({ page }) => {
    let dancers = [member('22001111', 'Alice Tan', ['style-hiphop'], ['Hip Hop'])];
    const multiEvent = makeEvent({ styleIds: ['style-hiphop', 'style-popping'] });

    const calls = await mockApi(page, {
      'admin.bootstrap': () => ({ ...adminBootstrap, styles: TWO_STYLES }),
      'styles.list': () => TWO_STYLES,
      'events.list': () => [multiEvent],
      'members.list': () => dancers,
      'members.edit': p => {
        dancers = dancers.map(d =>
          d.memberId === p.memberId
            ? {
                ...d,
                ...(p.styleIds
                  ? {
                      styleIds: p.styleIds,
                      styleNames: p.styleIds.map((id: string) => TWO_STYLES.find(s => s.id === id)?.name || id)
                    }
                  : {})
              }
            : d
        );
        return { memberId: p.memberId, result: { updated: 1 } };
      },
      'members.remove': p => {
        dancers = dancers.filter(d => d.memberId !== p.memberId);
        return { memberId: p.memberId, removed: true, result: { purged: 1 } };
      }
    });

    await page.goto('/admin/members');
    await expect(page.getByText('Alice Tan').locator('visible=true').first()).toBeVisible();

    // Open DETAILS (desktop) or INFO (mobile) -> EDIT DETAILS -> change Hip Hop to Popping
    await page.getByRole('button', { name: /^(DETAILS|INFO)$/i }).locator('visible=true').first().click();
    await page.getByRole('button', { name: /EDIT DETAILS/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel(/Hip Hop/i)).toBeChecked();
    await expect(dialog.getByLabel(/Popping/i)).not.toBeChecked();

    await dialog.getByLabel(/Hip Hop/i).uncheck();
    await dialog.getByLabel(/Popping/i).check();
    await dialog.getByRole('button', { name: /SAVE TO FORM SHEET/i }).click();

    await expect.poll(() => calls.find(c => c.action === 'members.edit')?.payload).toEqual({
      eventId: 'evt-oct',
      memberId: 'M-22001111',
      styleIds: ['style-popping']
    });
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Popping').locator('visible=true').first()).toBeVisible();

    // Re-open DETAILS / INFO -> EDIT DETAILS -> REMOVE FROM EVENT -> CONFIRM REMOVE
    await page.getByRole('button', { name: /^(DETAILS|INFO)$/i }).locator('visible=true').first().click();
    await page.getByRole('button', { name: /EDIT DETAILS/i }).click();

    const removeDialog = page.getByRole('dialog');
    await removeDialog.getByRole('button', { name: /REMOVE FROM EVENT/i }).click();
    const confirmBox = removeDialog.getByTestId('confirm-remove-dancer');
    await expect(confirmBox).toBeVisible();
    await confirmBox.getByRole('button', { name: /CONFIRM REMOVE/i }).click();

    await expect.poll(() => calls.find(c => c.action === 'members.remove')?.payload).toEqual({
      eventId: 'evt-oct',
      memberId: 'M-22001111'
    });
    await expect(removeDialog).toBeHidden();
    await expect(page.getByText(/NO DANCERS FOUND/i)).toBeVisible();
  });
});
