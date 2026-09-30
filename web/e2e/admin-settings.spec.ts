import { test, expect } from '@playwright/test';
import { loginAsAdmin, mockApi } from './fixtures/mockApi';

test.describe('Settings: reset and retention', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('reset needs the exact phrase and reports the backup', async ({ page }) => {
    const calls = await mockApi(page, {
      'links.history': () => [],
      'admin.resetStatus': () => ({ needed: true }),
      'admin.resetTestData': () => ({ backupSpreadsheetId: 'backup-123' })
    });
    await page.goto('/admin/settings');

    const button = page.getByRole('button', { name: 'RESET TEST DATA' });
    const input = page.getByLabel('Type DELETE TEST DATA to confirm');
    await input.fill('delete test data');
    await expect(button).toBeDisabled();
    await input.fill('DELETE TEST DATA');
    await expect(button).toBeEnabled();
    await button.click();

    await expect(page.getByText(/Done\. Backup:/)).toBeVisible();
    await expect(page.getByRole('link', { name: /backup sheet/i })).toHaveAttribute('href', /backup-123/);
    expect(calls.find(c => c.action === 'admin.resetTestData')?.payload).toEqual({ confirm: 'DELETE TEST DATA' });
  });

  test('reset panel is hidden once the reset has been done', async ({ page }) => {
    await mockApi(page, { 'links.history': () => [], 'admin.resetStatus': () => ({ needed: false }) });
    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { name: /Settings/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'RESET TEST DATA' })).toHaveCount(0);
  });

  test('retention check lists due dancers and wipes after confirm', async ({ page }) => {
    const calls = await mockApi(page, {
      'links.history': () => [],
      'admin.resetStatus': () => ({ needed: false }),
      'retention.preview': () => ({
        due: [{ matricKey: '22001111', fullName: 'Old Dancer', lastEventName: 'SEP 2023 CLASS', lastEventEnd: '2023-09-29' }],
        formsToClean: [{ eventName: 'SEP 2023 CLASS', sourceSheetId: 'src-old' }]
      }),
      'retention.apply': p => ({ wiped: p.matricKeys.length })
    });
    await page.goto('/admin/settings');
    await page.getByRole('button', { name: 'CHECK' }).click();

    await expect(page.getByRole('cell', { name: 'Old Dancer', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /SEP 2023 CLASS/ })).toHaveAttribute('href', /src-old/);

    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'WIPE SELECTED' }).click();
    await expect(page.getByText('Removed 1 dancers')).toBeVisible();
    expect(calls.find(c => c.action === 'retention.apply')?.payload).toEqual({ matricKeys: ['22001111'] });
  });

  test('nothing due says so', async ({ page }) => {
    await mockApi(page, {
      'links.history': () => [],
      'admin.resetStatus': () => ({ needed: false }),
      'retention.preview': () => ({ due: [], formsToClean: [] })
    });
    await page.goto('/admin/settings');
    await page.getByRole('button', { name: 'CHECK' }).click();
    await expect(page.getByText('No dancer data is due for removal.')).toBeVisible();
  });
});
