import { test, expect } from '@playwright/test';
import { adminBootstrap } from './fixtures/mockData';

const API_URL_REGEX = /(script\.google\.com|:5173\/api($|\?))/;

test.describe('Admin Members Import Wizard', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'umdsc:session',
        JSON.stringify({
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
              'styles.edit': '*'
            }
          }
        })
      );
    });
  });

  test('import wizard shows mapping from preview and unknown class "Contemporary" with ADD AS STYLE', async ({ page }) => {
    await page.route(API_URL_REGEX, async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
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

        if (body.action === 'members.previewImport') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: {
                headers: ['Timestamp', 'Full Name', 'Matric Number', 'Contact', 'Email', 'Classes'],
                columnMap: {
                  fullName: 1,
                  matric: 2,
                  contact: 3,
                  email: 4,
                  gender: null,
                  nationality: null
                },
                scores: {
                  fullName: 0.95,
                  matric: 0.98,
                  contact: 0.90,
                  email: 0.99
                },
                classIndex: 5,
                countsByStyle: {
                  'style-hiphop': 12
                },
                warnings: [
                  {
                    kind: 'unknownClass',
                    row: 3,
                    detail: "Unknown class 'Contemporary'"
                  }
                ],
                rowCount: 13,
                sampleNames: ['Ahmad Albab', 'Tan Ah Kow', 'Siti Nurhaliza']
              },
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
      }
      return route.continue();
    });

    await page.goto('/admin/members/import');
    await expect(page.getByRole('heading', { name: /Import Registrations/i })).toBeVisible();

    // Step 1: Fill Google Sheet URL and Month
    await page.getByLabel(/Google Sheet Link/i).fill('https://docs.google.com/spreadsheets/d/test-sheet-id/edit');
    await page.getByRole('button', { name: /PREVIEW IMPORT/i }).click();

    // Step 2: Mapping Preview appears
    await expect(page.getByRole('heading', { name: /MAPPING PREVIEW/i })).toBeVisible();

    // Verify warning for Contemporary appears with "ADD AS STYLE" button
    await expect(page.getByText(/Contemporary/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /ADD AS STYLE/i })).toBeVisible();
  });

  test('select month range in calendar and confirm auto-generation of relative google sheets for future months', async ({ page }) => {
    const confirmedMonths: string[] = [];

    await page.route(API_URL_REGEX, async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
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

        if (body.action === 'members.previewImport') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: {
                headers: ['Timestamp', 'Full Name', 'Matric Number', 'Contact', 'Email', 'Classes'],
                columnMap: { fullName: 1, matric: 2, contact: 3, email: 4 },
                scores: { fullName: 0.95, matric: 0.98 },
                classIndex: 5,
                countsByStyle: { 'style-hiphop': 15 },
                warnings: [],
                rowCount: 15,
                sampleNames: ['Ahmad', 'Sarah']
              },
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }

        if (body.action === 'members.confirmImport') {
          confirmedMonths.push(body.payload.month);
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: {
                membersSpreadsheetId: `sheet-${body.payload.month}`,
                memberCount: 15,
                attendanceSheets: [
                  { styleId: 'style-hiphop', spreadsheetId: `att-${body.payload.month}-hiphop` }
                ]
              },
              dataVersion: 2,
              serverTime: new Date().toISOString()
            })
          });
        }
      }
      return route.continue();
    });

    await page.goto('/admin/members/import');

    // Switch to Range Mode
    await page.getByRole('button', { name: /MONTH RANGE/i }).click();

    // Select October and November tiles
    await page.getByRole('button', { name: 'Oct 2026' }).click();
    await page.getByRole('button', { name: 'Nov 2026' }).click();

    // Verify 2 months selected is displayed
    await expect(page.getByText('2 Months Selected')).toBeVisible();

    // Fill Google Sheet URL and Preview
    await page.getByLabel(/Google Sheet Link/i).fill('https://docs.google.com/spreadsheets/d/test-sheet-id/edit');
    await page.getByRole('button', { name: /PREVIEW IMPORT/i }).click();

    // Step 2: Mapping preview
    await expect(page.getByRole('heading', { name: /MAPPING PREVIEW/i })).toBeVisible();
    await page.getByRole('button', { name: /PROCEED TO CONFIRM/i }).click();

    // Step 3: Confirm & auto-generate sheets
    await expect(page.getByRole('heading', { name: /CONFIRM & AUTO-GENERATE GOOGLE SHEETS/i })).toBeVisible();
    await page.getByRole('button', { name: /CONFIRM & AUTO-GENERATE SHEETS/i }).click();

    // Step 4: Done! Verify both months were processed and relative sheets generated
    await expect(page.getByText(/SUCCESSFULLY INITIALIZED 2 MONTH\(S\)!/i)).toBeVisible();
    expect(confirmedMonths).toContain('2026-10');
    expect(confirmedMonths).toContain('2026-11');
  });
});
