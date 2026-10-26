import { test, expect } from '@playwright/test';
import { loginAsAdmin, mockApi } from './fixtures/mockApi';

test.describe('Shell & Mascot Interactive E2E (Mobile & Desktop)', () => {
  test('renders mobile phone shell with header, dropdown, bottom tabs, and draggable mascot', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Only for mobile project');

    await loginAsAdmin(page);
    await mockApi(page);
    await page.goto('/admin/calendar');

    // 1. Verify mobile shell topbar and role badge
    await expect(page.getByTestId('phone-shell')).toBeVisible();
    await expect(page.getByTestId('mobile-role-badge')).toHaveText('ADMIN');

    // 2. Test UserInfoBoard toggle
    const userToggle = page.getByTestId('user-info-toggle-btn');
    await expect(userToggle).toBeVisible();
    await userToggle.click();
    await expect(page.getByTestId('mobile-user-info-dropdown')).toBeVisible();
    await userToggle.click();
    await expect(page.getByTestId('mobile-user-info-dropdown')).not.toBeVisible();

    // 3. Test Floating Mascot Button visibility and interaction
    const mascotBtn = page.getByTestId('notification-bell-btn');
    const mascotContainer = page.getByTestId('notification-bell-container');
    await expect(mascotBtn).toBeVisible();
    await expect(mascotContainer).toBeVisible();

    // 4. Click mascot to open retro Cyberpunk drawer
    await mascotBtn.click();
    await expect(page.getByTestId('notification-drawer')).toBeVisible();

    // 5. Close the drawer
    const closeBtn = page.getByRole('button', { name: /CLOSE/i });
    await closeBtn.click();
    await expect(page.getByTestId('notification-drawer')).not.toBeVisible();

    // 6. Verify mascot is NOT stuck: not disabled, no pointer-events-none on container or button
    await expect(mascotBtn).not.toBeDisabled();
    await expect(mascotBtn).not.toHaveClass(/pointer-events-none/);
    await expect(mascotContainer).not.toHaveClass(/pointer-events-none/);

    // 7. Test dragging mascot across mobile viewport
    const boxBefore = await mascotBtn.boundingBox();
    expect(boxBefore).not.toBeNull();
    await page.mouse.move(boxBefore!.x + 20, boxBefore!.y + 20);
    await page.mouse.down();
    await page.mouse.move(boxBefore!.x - 80, boxBefore!.y + 60, { steps: 5 });
    await page.mouse.up();

    const boxAfter = await mascotBtn.boundingBox();
    expect(boxAfter).not.toBeNull();
    expect(boxAfter!.x).not.toEqual(boxBefore!.x);
  });

  test('renders desktop shell with navigation sidebar and desktop layout', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Only for desktop project');

    await loginAsAdmin(page);
    await mockApi(page);
    await page.goto('/admin/calendar');

    // Desktop view elements
    await expect(page.getByTestId('desktop-shell')).toBeVisible();
    await expect(page.getByTestId('notification-bell-btn')).toBeVisible();
    await expect(page.getByTestId('month-calendar')).toBeVisible();
  });
});
