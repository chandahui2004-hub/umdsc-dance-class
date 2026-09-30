import { test, expect } from '@playwright/test';

test.describe('Responsive Shell Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'umdsc:session',
        JSON.stringify({
          token: 'mock-dancer-tok',
          claims: {
            sub: '17201234',
            role: 'dancer',
            name: 'Sarah',
            exp: Math.floor(Date.now() / 1000) + 36000,
            pv: 1,
            perms: { 'calendar.view': '*' }
          }
        })
      );
    });
  });

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

  test('desktop: displays user info board with role, username, matriks, and live clock', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Only for desktop project');

    await page.goto('/');

    const sidebar = page.getByRole('complementary', { name: 'Desktop Sidebar' });
    await expect(sidebar).toBeVisible();

    const roleBadge = sidebar.getByTestId('user-role-badge');
    await expect(roleBadge).toHaveText('DANCER');

    const usernameDisplay = sidebar.getByTestId('user-name-display');
    await expect(usernameDisplay).toHaveText('Sarah');

    const matriksDisplay = sidebar.getByTestId('user-matriks-display');
    await expect(matriksDisplay).toHaveText('17201234');

    const clock = sidebar.getByTestId('live-clock');
    await expect(clock).toBeVisible();
  });

  test('desktop: collapses and expands navigation sidebar with toggle button', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Only for desktop project');

    await page.goto('/');

    const sidebar = page.getByRole('complementary', { name: 'Desktop Sidebar' });
    const toggleBtn = page.getByTestId('sidebar-toggle-btn');
    await expect(toggleBtn).toBeVisible();

    // Initially expanded
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false');

    // Click to collapse
    await toggleBtn.click();
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    await expect(sidebar.getByTestId('user-info-board-compact')).toBeVisible();

    // Click to expand
    await toggleBtn.click();
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false');
    await expect(sidebar.getByTestId('user-info-board')).toBeVisible();
  });

  test('desktop: signs out user and redirects to /login', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Only for desktop project');

    await page.goto('/');

    const signOutBtn = page.getByTestId('sign-out-btn');
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();

    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('mobile: shows live clock and collapsible user info board with sign out', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Only for mobile project');

    await page.goto('/');

    // Compact clock and role badge visible in top bar
    const mobileRoleBadge = page.getByTestId('mobile-role-badge');
    await expect(mobileRoleBadge).toHaveText('DANCER');

    // Toggle user info board dropdown
    const userInfoToggleBtn = page.getByTestId('user-info-toggle-btn');
    await expect(userInfoToggleBtn).toBeVisible();
    await userInfoToggleBtn.click();

    const dropdown = page.getByTestId('mobile-user-info-dropdown');
    await expect(dropdown).toBeVisible();
    await expect(dropdown.getByTestId('user-name-display')).toHaveText('Sarah');
    await expect(dropdown.getByTestId('user-matriks-display')).toHaveText('17201234');

    // Sign out from mobile dropdown
    const signOutBtn = dropdown.getByTestId('sign-out-btn');
    await signOutBtn.click();

    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('mobile: collapses and expands bottom navigation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Only for mobile project');

    await page.goto('/');

    const tabBar = page.getByRole('navigation', { name: 'Bottom Navigation' });
    await expect(tabBar).toBeVisible();

    const navToggleBtn = page.getByTestId('mobile-nav-toggle-btn');
    await expect(navToggleBtn).toHaveText(/HIDE NAV/);
    await navToggleBtn.click();

    // Now tab bar is collapsed/hidden
    await expect(tabBar).not.toBeVisible();
    const showNavBtn = page.getByTestId('mobile-nav-toggle-btn');
    await expect(showNavBtn).toHaveText(/SHOW NAV/);

    // Expand again
    await showNavBtn.click();
    await expect(tabBar).toBeVisible();
  });
});
