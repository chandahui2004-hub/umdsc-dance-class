import { test, expect } from '@playwright/test';

test.describe('Responsive Shell Layout', () => {
  test('mobile viewport (390x844): bottom tab bar is visible and sidebar is hidden', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Only for mobile project');

    await page.goto('/');

    const tabBar = page.getByRole('navigation', { name: 'Bottom Navigation' });
    await expect(tabBar).toBeVisible();

    const sidebar = page.getByRole('complementary', { name: 'Desktop Sidebar' });
    await expect(sidebar).not.toBeVisible();

    const hasNoHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth;
    });
    expect(hasNoHorizontalScroll).toBe(true);
  });

  test('desktop viewport (1440x900): sidebar is visible and bottom tab bar is hidden', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Only for desktop project');

    await page.goto('/');

    const sidebar = page.getByRole('complementary', { name: 'Desktop Sidebar' });
    await expect(sidebar).toBeVisible();

    const tabBar = page.getByRole('navigation', { name: 'Bottom Navigation' });
    await expect(tabBar).not.toBeVisible();

    const hasNoHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth;
    });
    expect(hasNoHorizontalScroll).toBe(true);
  });
});
