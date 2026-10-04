import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './fixtures/mockApi';

test.describe('Admin Today page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('/admin/today redirects to the calendar', async ({ page }) => {
    await page.goto('/admin/today');
    await expect(page).toHaveURL(/\/admin\/calendar$/);
  });
});
