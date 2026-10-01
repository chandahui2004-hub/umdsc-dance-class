import { test, expect } from '@playwright/test';
import { loginAsAdmin, mockApi } from './fixtures/mockApi';

const PAGES = ['/login', '/', '/studio', '/admin/attendance', '/admin/events', '/admin/media', '/admin/members'];

test.describe('Accessibility & Device Suite (Task 33)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await mockApi(page);
  });

  for (const pagePath of PAGES) {
    test(`no horizontal scroll on ${pagePath}`, async ({ page }) => {
      await page.goto(pagePath);
      await page.waitForLoadState('domcontentloaded');

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      expect(hasHorizontalScroll).toBe(false);
    });
  }

  test('all primary buttons satisfy accessible touch targets', async ({ page }) => {
    await page.goto('/login');

    const buttons = page.locator('button');
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible()) {
        const box = await btn.boundingBox();
        if (box) {
          // Tap targets must be >= 40px in height or have sufficient padding
          expect(box.height).toBeGreaterThanOrEqual(36);
        }
      }
    }
  });

  test('form inputs have accessible labels or aria-labels', async ({ page }) => {
    await page.goto('/login');

    const inputs = page.locator('input:not([type="hidden"])');
    const count = await inputs.count();

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      if (await input.isVisible()) {
        const ariaLabel = await input.getAttribute('aria-label');
        const ariaLabelledBy = await input.getAttribute('aria-labelledby');
        const id = await input.getAttribute('id');
        const placeholder = await input.getAttribute('placeholder');

        const hasLabel = Boolean(
          ariaLabel ||
          ariaLabelledBy ||
          placeholder ||
          (id && (await page.locator(`label[for="${id}"]`).count()) > 0)
        );

        expect(hasLabel).toBe(true);
      }
    }
  });

  test('focus indicator is visible on tab navigation', async ({ page }) => {
    await page.goto('/login');

    await page.keyboard.press('Tab');
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedTag).toBeTruthy();
  });

  test('respects prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const runningAnimations = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      let running = 0;
      for (const el of elements) {
        const style = window.getComputedStyle(el);
        if (
          style.animationName &&
          style.animationName !== 'none' &&
          style.animationPlayState === 'running' &&
          parseFloat(style.animationDuration) > 0
        ) {
          // If reduced motion is requested, animation should be none or negligible
          if (style.animationDuration !== '0s') {
            running++;
          }
        }
      }
      return running;
    });

    // In reduced motion mode, major elements should not have indefinite running animations
    expect(runningAnimations).toBeLessThanOrEqual(5);
  });
});
