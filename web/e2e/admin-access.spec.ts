import { test, expect } from '@playwright/test';
import { adminBootstrap } from './fixtures/mockData';

const API_URL_REGEX = /(script\.google\.com|:5173\/api($|\?))/;

test.describe('Admin Access Management (Admins & Roles)', () => {
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
              'admins.manage': '*',
              'roles.manage': '*',
              'settings.edit': '*'
            }
          }
        })
      );
    });
  });

  test('dancer-login role cannot tick settings.edit (checkbox disabled)', async ({ page }) => {
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

        if (body.action === 'roles.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: [
                {
                  id: 'role-lead',
                  name: 'Class Lead',
                  description: 'Dancer role for attendance taking',
                  loginType: 'dancer',
                  isSystem: false,
                  permissions: ['calendar.view', 'attendance.edit'],
                  version: 1,
                  updatedBy: 'admin',
                  updatedAt: '2026-10-01T00:00:00.000Z',
                  active: true
                }
              ],
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }

        if (body.action === 'memberRoles.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: [],
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }
      }
      return route.continue();
    });

    await page.goto('/admin/roles');
    await expect(page.getByRole('heading', { name: /Roles & Permissions/i })).toBeVisible();

    // Select the Class Lead role to view its permission matrix
    await page.getByRole('button', { name: /MANAGE PERMISSIONS/i }).first().click();

    // Verify settings.edit checkbox is disabled because Class Lead has loginType 'dancer'
    const settingsCheckbox = page.getByLabel(/settings\.edit/i);
    await expect(settingsCheckbox).toBeDisabled();
  });

  test('create admin user and verify in list', async ({ page }) => {
    let createdAdmin: any = null;

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

        if (body.action === 'roles.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: [
                {
                  id: 'role-admin',
                  name: 'Admin',
                  description: 'System administrator',
                  loginType: 'admin',
                  isSystem: true,
                  permissions: ['settings.edit', 'admins.manage', 'roles.manage'],
                  version: 1,
                  updatedBy: 'admin',
                  updatedAt: '2026-10-01T00:00:00.000Z',
                  active: true
                }
              ],
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }

        if (body.action === 'admins.list') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: createdAdmin
                ? [
                    {
                      id: 'admin-1',
                      username: 'admin',
                      displayName: 'Club Admin',
                      roleId: 'role-admin',
                      version: 1,
                      updatedBy: 'system',
                      updatedAt: '2026-10-01T00:00:00.000Z',
                      active: true
                    },
                    createdAdmin
                  ]
                : [
                    {
                      id: 'admin-1',
                      username: 'admin',
                      displayName: 'Club Admin',
                      roleId: 'role-admin',
                      version: 1,
                      updatedBy: 'system',
                      updatedAt: '2026-10-01T00:00:00.000Z',
                      active: true
                    }
                  ],
              dataVersion: 1,
              serverTime: new Date().toISOString()
            })
          });
        }

        if (body.action === 'admins.create') {
          createdAdmin = {
            id: 'admin-new',
            username: body.payload.username,
            displayName: body.payload.displayName,
            roleId: body.payload.roleId,
            version: 1,
            updatedBy: 'admin',
            updatedAt: new Date().toISOString(),
            active: true
          };
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              data: createdAdmin,
              dataVersion: 2,
              serverTime: new Date().toISOString()
            })
          });
        }
      }
      return route.continue();
    });

    await page.goto('/admin/admins');
    await expect(page.getByRole('heading', { name: /Admin Accounts/i })).toBeVisible();

    // Click + NEW ADMIN
    await page.getByRole('button', { name: /NEW ADMIN/i }).first().click();

    // Fill form
    await page.getByLabel(/Username/i).fill('treasurer');
    await page.getByLabel(/Display Name/i).fill('Club Treasurer');
    await page.getByLabel(/Password/i).fill('SecretPass123!');
    await page.getByRole('button', { name: /CREATE ADMIN/i }).click();

    // Verify treasurer is visible
    await expect(page.getByRole('cell', { name: 'treasurer', exact: true })).toBeVisible();
    await expect(page.getByText('Club Treasurer')).toBeVisible();
  });

  test('EDIT changes username and password; REFRESH reloads accounts edited in the sheet', async ({ page }) => {
    const { mockApi } = await import('./fixtures/mockApi');
    const ADMIN = { id: 'adm-1', username: 'admin', displayName: 'Club Admin', roleId: 'role_admin', version: 1, active: true };
    let refreshed = false;
    const calls = await mockApi(page, {
      'roles.list': () => [{ id: 'role_admin', name: 'Admin', loginType: 'admin', isSystem: true, permissions: [], version: 1, active: true }],
      'admins.list': () => [ADMIN],
      'admins.update': p => ({ ...ADMIN, username: p.username, displayName: p.displayName, version: 2 }),
      'admins.refresh': () => {
        refreshed = true;
        return [{ ...ADMIN, displayName: 'Changed In Sheet' }];
      }
    });
    await page.goto('/admin/admins');

    await expect(page.getByRole('button', { name: /RESET PASSWORD/ })).toHaveCount(0);
    await page.getByRole('button', { name: /EDIT/ }).first().click();
    await page.getByLabel('Username').fill('headadmin');
    await page.getByLabel('New Password').fill('NewPass789');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(page.getByLabel('New Password')).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'SAVE CHANGES' }).click();
    await expect
      .poll(() => calls.find(c => c.action === 'admins.update')?.payload)
      .toMatchObject({ id: 'adm-1', version: 1, username: 'headadmin', displayName: 'Club Admin', newPassword: 'NewPass789' });

    await page.getByRole('button', { name: /REFRESH/ }).click();
    await expect.poll(() => refreshed).toBe(true);
    await expect(page.getByText('Changed In Sheet')).toBeVisible();
  });
});
