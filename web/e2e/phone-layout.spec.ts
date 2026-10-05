import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { mockApi, makeEvent } from './fixtures/mockApi';
import { dancerBootstrap, adminBootstrap } from './fixtures/mockData';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DANCER_SESSION = {
  token: 'dancer-token-123',
  claims: {
    sub: 'M-17201234',
    role: 'dancer',
    name: 'SARAH BINTI AHMAD',
    exp: Math.floor(Date.now() / 1000) + 36000,
    pv: 1,
    perms: {
      'calendar.view': '*',
      'attendance.view.own': '*',
      'videos.view': '*',
      'music.view': '*'
    }
  }
};

const ADMIN_SESSION = {
  token: 'admin-tok',
  claims: {
    sub: 'admin',
    role: 'admin',
    name: 'Club Admin',
    exp: Math.floor(Date.now() / 1000) + 36000,
    pv: 1,
    perms: {
      'members.import': '*',
      'members.view': '*',
      'styles.edit': '*',
      'settings.edit': '*',
      'sessions.edit': '*',
      'calendar.view': '*',
      'attendance.edit': '*',
      'attendance.view.all': '*',
      'export.download': '*',
      'videos.upload': '*',
      'videos.edit': '*',
      'videos.view': '*',
      'music.edit': '*',
      'music.view': '*'
    }
  }
};

const testMusicItem = {
  id: 'm-1',
  styleId: 'style-hiphop',
  eventId: 'evt-oct',
  sessionId: 'ses-1',
  title: 'Hip Hop Routine Song With A Fairly Long Title (Official Audio)',
  sourceType: 'youtube' as const,
  driveFileId: '',
  youtubeId: 'vid-m-1',
  active: true,
  version: 1,
  updatedBy: 'admin',
  updatedAt: '2026-10-01T00:00:00.000Z'
};

const testSection = {
  id: 'sec-1',
  musicId: 'm-1',
  name: 'Intro Part 1',
  startSec: 0,
  endSec: 15,
  videoId: '',
  videoStartSec: null,
  active: true,
  version: 1,
  updatedBy: 'admin',
  updatedAt: '2026-10-01T00:00:00.000Z'
};

const customDancerBootstrap = {
  ...dancerBootstrap,
  music: [testMusicItem],
  sections: [testSection],
  videos: []
};

const EVENT = makeEvent({ styleIds: ['style-hiphop'] });

const mockHandlers = {
  'dancer.bootstrap': () => customDancerBootstrap,
  'dancer.attendance': () => customDancerBootstrap.attendance,
  'videos.list': () => customDancerBootstrap.videos,
  'music.list': () => customDancerBootstrap.music,
  'sections.list': () => customDancerBootstrap.sections,
  'sessions.list': () => customDancerBootstrap.sessions,
  'admin.bootstrap': () => adminBootstrap,
  'events.list': () => [EVENT],
  'styles.list': () => customDancerBootstrap.styles,
  'instructors.list': () => customDancerBootstrap.instructors,
  'settings.get': () => ({ clubEmail: 'umdancesportc@gmail.com' })
};

async function setupPage(page: Page) {
  await page.addInitScript(
    ({ dancerSess, adminSess }) => {
      // Mock Google GIS / Picker for admin pages
      (window as any).google = {
        accounts: {
          oauth2: {
            initTokenClient: (config: any) => ({
              requestAccessToken: () => config.callback({ access_token: 'fake-oauth-token', expires_in: 3600 })
            })
          }
        },
        picker: {
          ViewId: { FOLDERS: 'folders' },
          Action: { PICKED: 'picked', CANCEL: 'cancel' },
          DocsView: function (this: any) {
            return { setSelectFolderEnabled: () => this, setIncludeFolders: () => this, setParent: () => this };
          },
          PickerBuilder: function (this: any) {
            return {
              addView: () => this,
              setOAuthToken: () => this,
              setDeveloperKey: () => this,
              setAppId: () => this,
              setCallback: () => this,
              build: () => ({ setVisible: () => {} })
            };
          }
        }
      };

      // Control auth state via sessionStorage
      const role = sessionStorage.getItem('__test_role') || 'dancer';
      if (role === 'dancer') {
        localStorage.setItem('umdsc:session', JSON.stringify(dancerSess));
      } else if (role === 'admin') {
        localStorage.setItem('umdsc:session', JSON.stringify(adminSess));
      } else if (role === 'none') {
        localStorage.removeItem('umdsc:session');
      }
    },
    { dancerSess: DANCER_SESSION, adminSess: ADMIN_SESSION }
  );

  await mockApi(page, mockHandlers);
}

async function checkLayout(page: Page, pageName: string): Promise<string[]> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(pageName => {
    const failures: string[] = [];
    const innerWidth = window.innerWidth;

    // 1. Whole document scroll width
    if (document.documentElement.scrollWidth > innerWidth + 1) {
      failures.push(
        `[${pageName}] document scrollWidth ${document.documentElement.scrollWidth} > innerWidth ${innerWidth}`
      );
    }

    function isVisible(el: HTMLElement): boolean {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      return true;
    }

    function getLabel(el: HTMLElement): string {
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel.trim();
      if (el.tagName.toLowerCase() === 'select') {
        const sel = el as HTMLSelectElement;
        const selected = sel.options[sel.selectedIndex]?.text;
        if (selected) return selected.trim();
        if (sel.id) return sel.id;
      }
      if (el.id) {
        return el.id;
      }
      const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
      return text.slice(0, 30);
    }

    function hasAllowedScroller(el: HTMLElement): boolean {
      let cur = el.parentElement;
      while (cur && cur !== document.body && cur !== document.documentElement) {
        const cs = window.getComputedStyle(cur);
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return true;
        cur = cur.parentElement;
      }
      return false;
    }

    const elements = Array.from(
      document.querySelectorAll<HTMLElement>('button, select, a[href], [role="tab"]')
    );

    for (const el of elements) {
      if (!isVisible(el)) continue;

      const rect = el.getBoundingClientRect();
      const tag = el.tagName.toLowerCase();
      const label = getLabel(el);
      const desc = `[${pageName}] ${tag} "${label}" L=${Math.round(rect.left)} R=${Math.round(rect.right)}`;

      // 2. Rect goes past 0..innerWidth (unless in an allowed scroller)
      if (!hasAllowedScroller(el)) {
        if (rect.left < -1 || rect.right > innerWidth + 1) {
          failures.push(`${desc} (past 0..${innerWidth})`);
        }
      }

      // 3. Rect goes past ancestor with overflow-x: hidden | clip
      let cur = el.parentElement;
      while (cur && cur !== document.body && cur !== document.documentElement) {
        const cs = window.getComputedStyle(cur);
        if (cs.overflowX === 'hidden' || cs.overflowX === 'clip') {
          const aRect = cur.getBoundingClientRect();
          if (rect.left < aRect.left - 1 || rect.right > aRect.right + 1) {
            failures.push(`${desc} (clipped by ${cur.tagName.toLowerCase()})`);
            break;
          }
        }
        cur = cur.parentElement;
      }

      // 4. Button label cut-off: scrollWidth > clientWidth + 1
      if (tag === 'button') {
        const hasTruncateOk = el.hasAttribute('data-truncate-ok') || !!el.closest('[data-truncate-ok]');
        if (!hasTruncateOk && el.scrollWidth > el.clientWidth + 1) {
          failures.push(`${desc} (cut-off label: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth})`);
        }
      }
    }

    return failures;
  }, pageName);
}

for (const width of [360, 390]) {
  test.describe(`phone-layout @ ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test('phone-layout check across all pages', async ({ page }, testInfo) => {
      await setupPage(page);
      const failures: string[] = [];
      const isMobile390 = width === 390 && testInfo.project.name === 'mobile';
      const shotsDir = path.resolve(__dirname, '../../docs/superpowers/reports/shots');
      if (isMobile390) {
        fs.mkdirSync(shotsDir, { recursive: true });
      }

      // 1. Dancer on /
      await page.goto('/');
      failures.push(...(await checkLayout(page, '/')));
      if (isMobile390) {
        await page.screenshot({ path: path.join(shotsDir, 'home-390px.png') });
      }

      // 2. / with day sheet open
      const dayBtn = page.locator('button[data-date]').first();
      if (await dayBtn.isVisible()) {
        await dayBtn.click();
        await page.waitForTimeout(300);
        failures.push(...(await checkLayout(page, '/ (day sheet)')));
        const closeBtn = page.getByRole('button', { name: 'Close' });
        if (await closeBtn.isVisible()) {
          await closeBtn.click();
          await page.waitForTimeout(200);
        }
      }

      // 3. /studio?music=m-1
      await page.goto('/studio?music=m-1');
      failures.push(...(await checkLayout(page, '/studio?music=m-1')));
      if (isMobile390) {
        await page.screenshot({ path: path.join(shotsDir, 'studio-390px.png') });
      }

      // 4. Studio fullscreen
      const fullscreenBtn = page.getByRole('button', { name: /full ?screen/i });
      if (await fullscreenBtn.isVisible()) {
        await fullscreenBtn.click();
        await page.waitForTimeout(300);
        failures.push(...(await checkLayout(page, '/studio (fullscreen)')));
        if (isMobile390) {
          await page.screenshot({ path: path.join(shotsDir, 'studio-fullscreen-390px.png') });
        }

        // Task 10: on Studio fullscreen page, every visible button has height >= 44
        const buttonHeightFailures = await page.evaluate(() => {
          const bad: string[] = [];
          const container = document.querySelector('[data-testid="fullscreen-studio"]');
          const btns = container ? Array.from(container.querySelectorAll<HTMLElement>('button')) : [];
          for (const b of btns) {
            const style = window.getComputedStyle(b);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
            const r = b.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              if (r.height < 43.5) {
                const label = (b.getAttribute('aria-label') || b.innerText || b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
                bad.push(`[/studio (fullscreen)] button "${label}" height ${r.height.toFixed(1)}px < 44px`);
              }
            }
          }
          return bad;
        });
        failures.push(...buttonHeightFailures);

        const exitBtn = page.getByRole('button', { name: /exit/i });
        if (await exitBtn.isVisible()) {
          await exitBtn.click();
          await page.waitForTimeout(200);
        }
      }

      // 5. /me
      await page.goto('/me');
      failures.push(...(await checkLayout(page, '/me')));
      if (isMobile390) {
        await page.screenshot({ path: path.join(shotsDir, 'me-390px.png') });
      }

      // 6. /login (logged out)
      await page.evaluate(() => {
        sessionStorage.setItem('__test_role', 'none');
        localStorage.removeItem('umdsc:session');
      });
      await page.goto('/login');
      failures.push(...(await checkLayout(page, '/login')));

      // 7. /admin/login (logged out)
      await page.goto('/admin/login');
      failures.push(...(await checkLayout(page, '/admin/login')));

      // 8. /admin/calendar (as admin)
      await page.evaluate(() => {
        sessionStorage.setItem('__test_role', 'admin');
        localStorage.removeItem('umdsc:session');
      });
      await page.goto('/admin/calendar');
      failures.push(...(await checkLayout(page, '/admin/calendar')));

      // 9. /admin/media (as admin)
      await page.goto('/admin/media');
      failures.push(...(await checkLayout(page, '/admin/media')));

      expect(failures, `Found ${failures.length} layout failures:\n${failures.join('\n')}`).toEqual([]);
    });

    test('nav toggle hidden in overlays', async ({ page }) => {
      await setupPage(page);

      // On /, nav toggle is visible initially
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('mobile-nav-toggle-btn')).toBeVisible();

      // Open day sheet -> nav toggle must be hidden
      const dayBtn = page.locator('button[data-date]').first();
      await dayBtn.click();
      await page.waitForTimeout(300);
      await expect(page.getByTestId('mobile-nav-toggle-btn')).toBeHidden();

      // Close day sheet -> nav toggle visible again
      await page.getByRole('button', { name: 'Close' }).click();
      await page.waitForTimeout(200);
      await expect(page.getByTestId('mobile-nav-toggle-btn')).toBeVisible();

      // Open Studio fullscreen -> nav toggle must be hidden
      await page.goto('/studio?music=m-1');
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('mobile-nav-toggle-btn')).toBeVisible();

      await page.getByRole('button', { name: /full ?screen/i }).click();
      await page.waitForTimeout(300);
      await expect(page.getByTestId('mobile-nav-toggle-btn')).toBeHidden();

      // Exit fullscreen -> nav toggle visible again
      await page.getByRole('button', { name: /exit/i }).click();
      await page.waitForTimeout(200);
      await expect(page.getByTestId('mobile-nav-toggle-btn')).toBeVisible();
    });

    test('style edit modal does not clip vertically and is fully scrollable', async ({ page }) => {
      await page.addInitScript(() => {
        sessionStorage.setItem('__test_role', 'admin');
      });
      await setupPage(page);

      await page.goto('/admin/styles');
      await page.waitForLoadState('networkidle');

      // Click EDIT button on first style
      const editBtn = page.getByRole('button', { name: 'EDIT' }).first();
      await expect(editBtn).toBeVisible();
      await editBtn.click();
      await page.waitForTimeout(200);

      // Find modal panel
      const modal = page.locator('div.fixed.inset-0 .px-corners').first();
      await expect(modal).toBeVisible();

      // Assert modal top >= 0 (no negative scroll clipping)
      const top = await modal.evaluate(el => el.getBoundingClientRect().top);
      expect(top).toBeGreaterThanOrEqual(0);

      // Assert the last button (SAVE STYLE) can be scrolled into view
      const saveBtn = page.getByRole('button', { name: 'SAVE STYLE' });
      await saveBtn.scrollIntoViewIfNeeded();
      await expect(saveBtn).toBeVisible();
      const saveTop = await saveBtn.evaluate(el => el.getBoundingClientRect().top);
      expect(saveTop).toBeGreaterThan(0);

      // Close modal
      const cancelBtn = page.getByRole('button', { name: 'CANCEL' });
      await cancelBtn.scrollIntoViewIfNeeded();
      await cancelBtn.click();
      await expect(modal).toBeHidden();
    });
  });
}
