import { test, expect } from '@playwright/test';
import { dancerBootstrap, adminBootstrap } from './fixtures/mockData';

const API_URL_REGEX = /(script\.google\.com|:5173\/api($|\?))/;

test.describe('Login, Title Screen, and Route Guards', () => {
  test('dancer logs in and lands on / with calendar visible', async ({ page }) => {
    await page.route(API_URL_REGEX, async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const body = JSON.parse(request.postData() || '{}');
        if (body.action === 'auth.dancerLogin') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: {
                token: 'dancer-token-123',
                claims: {
                  sub: '17201234',
                  role: 'dancer',
                  name: 'SARAH BINTI AHMAD',
                  exp: Math.floor(Date.now() / 1000) + 36000,
                  pv: 1,
                  perms: { 'calendar.view': '*' }
                },
                bootstrap: dancerBootstrap
              },
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'dancer.bootstrap') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: dancerBootstrap,
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
      }
      return route.continue();
    });

    await page.goto('/login');
    await expect(page.getByText('UMDSC')).toBeVisible();

    await page.getByLabel(/Full Name/i).fill('Sarah Binti Ahmad');
    await page.getByLabel(/Matric Number/i).fill('17201234');
    await page.getByRole('button', { name: /ENTER|START|PLAY/i }).click();

    await page.waitForURL('**/');
    await expect(page.getByRole('heading', { name: /Calendar/i })).toBeVisible();
  });

  test('NAME_MISMATCH shows "That name doesn\'t match this matric number"', async ({ page }) => {
    await page.route(API_URL_REGEX, async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const body = JSON.parse(request.postData() || '{}');
        if (body.action === 'auth.dancerLogin') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: false,
              error: {
                code: 'NAME_MISMATCH',
                message: "Name doesn't match",
                retryable: false
              }
            })
          });
        }
      }
      return route.continue();
    });

    await page.goto('/login');
    await page.getByLabel(/Full Name/i).fill('Wrong Name');
    await page.getByLabel(/Matric Number/i).fill('17201234');
    await page.getByRole('button', { name: /ENTER|START|PLAY/i }).click();

    await expect(page.getByText("That name doesn't match this matric number")).toBeVisible();
  });

  test('NOT_REGISTERED shows a message telling them to register via the club form', async ({ page }) => {
    await page.route(API_URL_REGEX, async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const body = JSON.parse(request.postData() || '{}');
        if (body.action === 'auth.dancerLogin') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: false,
              error: {
                code: 'NOT_REGISTERED',
                message: 'Not registered for this month',
                retryable: false
              }
            })
          });
        }
      }
      return route.continue();
    });

    await page.goto('/login');
    await page.getByLabel(/Full Name/i).fill('Unregistered Person');
    await page.getByLabel(/Matric Number/i).fill('99999999');
    await page.getByRole('button', { name: /ENTER|START|PLAY/i }).click();

    await expect(page.getByText(/register via the club form/i)).toBeVisible();
  });

  test('admin login goes to /admin/calendar; dancer visiting /admin is redirected to /', async ({ page }) => {
    await page.route(API_URL_REGEX, async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const body = JSON.parse(request.postData() || '{}');
        if (body.action === 'auth.adminLogin') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: {
                token: 'admin-token-999',
                claims: {
                  sub: 'admin',
                  role: 'admin',
                  name: 'Club Admin',
                  exp: Math.floor(Date.now() / 1000) + 36000,
                  pv: 1,
                  perms: { 'calendar.view': '*' }
                },
                bootstrap: adminBootstrap
              },
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
        if (body.action === 'admin.bootstrap') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: adminBootstrap,
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
      }
      return route.continue();
    });

    // 1. Admin logs in
    await page.goto('/admin/login');
    await page.getByLabel(/Username/i).fill('admin');
    await page.getByLabel(/Password/i).fill('correctpassword');
    await page.getByRole('button', { name: /LOGIN|ENTER/i }).click();

    await page.waitForURL('**/admin/calendar');
    await expect(page.getByRole('heading', { name: /Calendar|Classes/i })).toBeVisible();

    // 2. Set dancer session and try accessing /admin/calendar
    await page.evaluate(() => {
      localStorage.setItem('umdsc:session', JSON.stringify({
        token: 'dancer-tok',
        claims: {
          sub: '17201234',
          role: 'dancer',
          name: 'Sarah',
          exp: Math.floor(Date.now() / 1000) + 36000,
          pv: 1,
          perms: { 'calendar.view': '*' }
        }
      }));
    });

    await page.goto('/admin/calendar');
    await page.waitForURL('**/');
    await expect(page.getByRole('heading', { name: /Calendar/i })).toBeVisible();
  });

  test('second visit opens instantly from cached bootstrap before network responds', async ({ page }) => {
    // Intercept POST API requests and hold them pending (never fulfill)
    await page.route(API_URL_REGEX, async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        // never fulfill API requests to simulate pending network
        return;
      }
      return route.continue();
    });

    await page.goto('/login');
    await page.evaluate(({ dancerData }) => {
      localStorage.setItem('umdsc:session', JSON.stringify({
        token: 'cached-dancer-tok',
        claims: {
          sub: '17201234',
          role: 'dancer',
          name: 'SARAH BINTI AHMAD',
          exp: Math.floor(Date.now() / 1000) + 36000,
          pv: 1,
          perms: { 'calendar.view': '*' }
        }
      }));
      localStorage.setItem('boot:dancer:17201234', JSON.stringify({
        data: dancerData,
        dataVersion: 1
      }));
    }, { dancerData: dancerBootstrap });

    await page.goto('/');
    // Must immediately show dancer information from cache without waiting for network
    await expect(page.getByText('SARAH BINTI AHMAD').first()).toBeVisible({ timeout: 2000 });
  });
});
