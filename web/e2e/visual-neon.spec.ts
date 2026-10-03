import { test, expect } from '@playwright/test';
import { loginAsAdmin, mockApi } from './fixtures/mockApi';
import { adminBootstrap } from './fixtures/mockData';

const ROUTES = [
  '/login',
  '/',
  '/admin/calendar',
  '/admin/attendance',
  '/admin/media',
  '/admin/members',
  '/admin/events',
  '/admin/styles',
  '/admin/instructors',
  '/admin/settings',
  '/studio',
];

function routeToFilename(route: string): string {
  return route.replace(/\//g, '_') || '_root';
}

test.describe('Neon Pixel UI — Visual Verification', () => {
  // ── 1. Screenshots @390 ─────────────────────────────────────────────
  for (const route of ROUTES) {
    test(`screenshot ${route} @390`, async ({ page }) => {
      if (route !== '/login') {
        await loginAsAdmin(page);
        await mockApi(page);
      }
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.screenshot({
        path: `test-results/neon/390${routeToFilename(route)}.png`,
        fullPage: true,
      });
    });
  }

  // ── 2. No sideways scroll @360 ──────────────────────────────────────
  test.describe('no sideways scroll @360', () => {
    const longStyles = adminBootstrap.styles.map((s, i) =>
      i === 0 ? { ...s, name: 'Contemporary Lyrical Jazz' } : s
    );
    const longInstructors = [
      {
        id: 'inst-long',
        name: 'Alexandra Catherine Tan-Rodriguez',
        contact: '0123456789',
        version: 1,
        updatedBy: 'admin',
        updatedAt: '2026-10-01T00:00:00.000Z',
        active: true,
      },
    ];

    for (const route of ROUTES) {
      test(`no horizontal overflow on ${route}`, async ({ page }) => {
        await page.setViewportSize({ width: 360, height: 780 });

        if (route !== '/login') {
          await loginAsAdmin(page);
          await mockApi(page, {
            'admin.bootstrap': () => ({
              ...adminBootstrap,
              styles: longStyles,
              instructors: longInstructors,
            }),
            'styles.list': () => longStyles,
            'instructors.list': () => longInstructors,
          });
        }

        await page.goto(route);
        await page.waitForLoadState('networkidle');

        const hasOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth
        );
        expect(hasOverflow).toBe(false);

        await page.screenshot({
          path: `test-results/neon/360${routeToFilename(route)}.png`,
          fullPage: true,
        });
      });
    }
  });

  // ── 3. Login readable when art fails ────────────────────────────────
  test('login readable when art fails', async ({ page }) => {
    // Block only image requests under /art/
    await page.route(/\/art\/.*\.webp/, (r) => r.abort());
    await page.goto('/login');

    // Wait for the form to appear
    await expect(page.getByPlaceholder(/SARAH/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /ENTER|START|PLAY/i })).toBeVisible();

    // Background should be the night-1 base colour
    const bgColor = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );
    expect(bgColor).toBe('rgb(14, 10, 36)');
  });

  // ── 4. Reduced motion stops pixel animation ─────────────────────────
  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('pixel animations are disabled', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      const animatedSelectors = '.px-twinkle, .px-drift-far, .px-drift-mid, .px-bounce, .px-blink';
      const allNone = await page.evaluate((sel) => {
        const els = document.querySelectorAll(sel);
        if (els.length === 0) return true; // no animated elements = passes
        return Array.from(els).every(
          (el) => getComputedStyle(el).animationName === 'none'
        );
      }, animatedSelectors);

      expect(allNone).toBe(true);
    });
  });

  // ── 5. Inputs are at least 16px ─────────────────────────────────────
  for (const route of ['/login', '/admin/attendance']) {
    test(`inputs >= 16px on ${route}`, async ({ page }) => {
      if (route !== '/login') {
        await loginAsAdmin(page);
        await mockApi(page);
      }
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const tooSmall = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input, select, textarea');
        const results: { tag: string; fontSize: string }[] = [];
        inputs.forEach((el) => {
          const htmlEl = el as HTMLElement;
          if (htmlEl.offsetWidth === 0 && htmlEl.offsetHeight === 0) return; // hidden
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs < 16) {
            results.push({ tag: el.tagName, fontSize: getComputedStyle(el).fontSize });
          }
        });
        return results;
      });

      expect(tooSmall).toEqual([]);
    });
  }

  // ── 6. Text floor 8px ───────────────────────────────────────────────
  for (const route of ['/admin/attendance', '/studio']) {
    test(`text floor >= 8px on ${route}`, async ({ page }) => {
      await loginAsAdmin(page);
      await mockApi(page);
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const tooSmall = await page.evaluate(() => {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode(node) {
              const text = node.textContent?.trim();
              if (!text) return NodeFilter.FILTER_REJECT;
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              if (parent.offsetWidth === 0 && parent.offsetHeight === 0)
                return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            },
          }
        );

        const results: { text: string; fontSize: string; selector: string }[] = [];
        while (walker.nextNode()) {
          const parent = walker.currentNode.parentElement!;
          const fs = parseFloat(getComputedStyle(parent).fontSize);
          if (fs < 8) {
            results.push({
              text: (walker.currentNode.textContent || '').trim().slice(0, 40),
              fontSize: getComputedStyle(parent).fontSize,
              selector: parent.tagName + (parent.className ? '.' + parent.className.split(' ')[0] : ''),
            });
          }
        }
        return results;
      });

      expect(tooSmall).toEqual([]);
    });
  }
});
