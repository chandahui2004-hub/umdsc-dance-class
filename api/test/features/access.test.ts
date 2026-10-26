import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { Hmac, signToken } from '../../src/security/tokens';
import { getAccessRoutes } from '../../src/features/access';
import { hashPassword, PASSWORD_ITERATIONS } from '../../src/security/passwords';

const nodeHmac: Hmac = (key: string, message: string) => {
  return new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
};

const secrets = {
  tokenSecret: 'test_secret_key_123456789012345678901234567890',
  hmac: nodeHmac
};

describe('Feature: Access (Admins, Roles, Permissions, MemberRoles)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let adminToken: string;

  beforeEach(() => {
    ctx = makeCtx();
    registerRoutes(getAccessRoutes());

    // Create System Admin Role
    ctx.db.roles.insert(
      {
        id: 'role_admin',
        name: 'Admin',
        description: 'Superadmin',
        loginType: 'admin',
        isSystem: true
      },
      'system',
      ctx.now()
    );

    // Create Admin user
    const salt = 'salt123';
    const passwordHash = hashPassword('AdminPass', salt, PASSWORD_ITERATIONS, nodeHmac);
    ctx.db.admins.insert(
      {
        username: 'superadmin',
        displayName: 'Super Admin',
        passwordHash,
        salt,
        iterations: PASSWORD_ITERATIONS,
        roleId: 'role_admin'
      },
      'system',
      ctx.now()
    );

    adminToken = signToken(
      {
        sub: 'superadmin',
        role: 'admin',
        name: 'Super Admin',
        exp: Math.floor(ctx.now().getTime() / 1000) + 3600,
        pv: 1,
        perms: { 'admins.manage': '*', 'roles.manage': '*' }
      },
      secrets.tokenSecret,
      secrets.hmac
    );
  });

  it('roles.setPermissions removing roles.manage from Admin → VALIDATION', () => {
    const res = handleRequest(
      {
        action: 'roles.setPermissions',
        token: adminToken,
        payload: {
          roleId: 'role_admin',
          permissions: ['calendar.view']
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('VALIDATION');
    }
  });

  it('roles.setPermissions giving settings.edit to a dancer-login role → VALIDATION', () => {
    const dancerRole = ctx.db.roles.insert(
      {
        id: 'role_lead',
        name: 'Class Lead',
        description: 'Dancer lead',
        loginType: 'dancer',
        isSystem: false
      },
      'superadmin',
      ctx.now()
    );

    const res = handleRequest(
      {
        action: 'roles.setPermissions',
        token: adminToken,
        payload: {
          roleId: dancerRole.id,
          permissions: ['settings.edit']
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('VALIDATION');
    }
  });

  it('roles.deactivate on isSystem role → VALIDATION', () => {
    const adminRole = ctx.db.roles.find(r => r.id === 'role_admin')[0];

    const res = handleRequest(
      {
        action: 'roles.deactivate',
        token: adminToken,
        payload: {
          id: adminRole.id,
          version: adminRole.version
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('VALIDATION');
    }
  });

  it('admins.update deactivating the last active admin → VALIDATION', () => {
    const admin = ctx.db.admins.find(a => a.username === 'superadmin')[0];

    const res = handleRequest(
      {
        action: 'admins.update',
        token: adminToken,
        payload: {
          id: admin.id,
          version: admin.version,
          active: false
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('VALIDATION');
    }
  });

  it('admins.update can change the username, refusing one already taken', () => {
    const admin = ctx.db.admins.find(a => a.username === 'superadmin')[0];
    ctx.db.admins.insert(
      { username: 'second', displayName: 'Second', passwordHash: 'x', salt: 'y', iterations: PASSWORD_ITERATIONS, roleId: admin.roleId },
      'system',
      new Date()
    );
    const update = (username: string, version: number) =>
      handleRequest({ action: 'admins.update', token: adminToken, payload: { id: admin.id, version, username } }, ctx, secrets);

    const taken = update(' second ', admin.version);
    expect(taken.ok).toBe(false);
    if (!taken.ok) expect(taken.error.message).toContain('Admin username "second" is already taken');
    // Sign-in ignores capitals, so a name differing only in capitals is taken too
    const takenCaps = update('Second', admin.version);
    expect(takenCaps.ok).toBe(false);
    if (!takenCaps.ok) expect(takenCaps.error.message).toContain('is already taken');

    const ok = update(' chief ', admin.version);
    expect(ok.ok).toBe(true);
    expect(ok.ok && (ok.data as any).username).toBe('chief');
    expect(JSON.stringify(ok.ok ? ok.data : '')).not.toContain('passwordHash');
  });

  it('memberRoles.assign increments PERM_VERSION; old token then → UNAUTHORIZED', () => {
    // Current PV = 1
    ctx.props.set('PERM_VERSION', '1');

    const res = handleRequest(
      {
        action: 'memberRoles.assign',
        token: adminToken,
        payload: {
          matricKey: '22004591',
          roleId: 'role_admin',
          styleIds: []
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);

    // PV should now be 2
    expect(ctx.props.get('PERM_VERSION')).toBe('2');

    // Admin token with PV=1 should now be rejected as UNAUTHORIZED
    const probeRes = handleRequest(
      {
        action: 'roles.list',
        token: adminToken
      },
      ctx,
      secrets
    );

    expect(probeRes.ok).toBe(false);
    if (!probeRes.ok) {
      expect(probeRes.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('every write appends an AuditLog row (actor, action, target)', () => {
    const initialCount = ctx.db.auditLog.all().length;

    handleRequest(
      {
        action: 'roles.create',
        token: adminToken,
        payload: {
          name: 'DJ',
          description: 'Music DJ',
          loginType: 'dancer'
        }
      },
      ctx,
      secrets
    );

    const afterCount = ctx.db.auditLog.all().length;
    expect(afterCount).toBe(initialCount + 1);

    const lastLog = ctx.db.auditLog.all()[afterCount - 1];
    expect(lastLog.actor).toBe('superadmin');
    expect(lastLog.action).toBe('roles.create');
    expect(lastLog.target).toBe('DJ');
  });

  it('roles.list automatically provisions Class Rep system role with attendance and export permissions', () => {
    const res = handleRequest(
      {
        action: 'roles.list',
        token: adminToken
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const roles = res.data as any[];
      const classRep = roles.find(r => r.name === 'Class Rep');
      expect(classRep).toBeDefined();
      expect(classRep.isSystem).toBe(true);
      expect(classRep.loginType).toBe('admin');
      expect(classRep.permissions).toContain('attendance.view.all');
      expect(classRep.permissions).toContain('attendance.edit');
      expect(classRep.permissions).toContain('export.download');
    }
  });

  it('allows creating custom admin roles with custom permissions and assigning accounts', () => {
    // 1. Create custom admin role
    const createRoleRes = handleRequest(
      {
        action: 'roles.create',
        token: adminToken,
        payload: {
          name: 'Media Specialist',
          description: 'Manages videos and audio only',
          loginType: 'admin'
        }
      },
      ctx,
      secrets
    );
    expect(createRoleRes.ok).toBe(true);
    const roleId = (createRoleRes as any).data.id;

    // Token with updated PERM_VERSION
    const currentToken = () =>
      signToken(
        {
          sub: 'superadmin',
          role: 'admin',
          name: 'Super Admin',
          exp: Math.floor(ctx.now().getTime() / 1000) + 3600,
          pv: Number(ctx.props.get('PERM_VERSION') || 1),
          perms: { 'admins.manage': '*', 'roles.manage': '*' }
        },
        secrets.tokenSecret,
        secrets.hmac
      );

    // 2. Set permissions for custom role
    const setPermsRes = handleRequest(
      {
        action: 'roles.setPermissions',
        token: currentToken(),
        payload: {
          roleId,
          permissions: ['videos.view', 'videos.upload', 'music.view']
        }
      },
      ctx,
      secrets
    );
    expect(setPermsRes.ok).toBe(true);

    // 3. Create admin user with this custom role
    const createAdminRes = handleRequest(
      {
        action: 'admins.create',
        token: currentToken(),
        payload: {
          username: 'mediapro',
          displayName: 'Media Pro',
          password: 'Password123!',
          roleId
        }
      },
      ctx,
      secrets
    );
    expect(createAdminRes.ok).toBe(true);
  });

  it('returns refreshedToken and refreshedClaims when PERM_VERSION is bumped during a request', () => {
    const createRoleRes = handleRequest(
      {
        action: 'roles.create',
        token: adminToken,
        payload: {
          name: 'Class Coordinator',
          description: 'Coordinates schedules',
          loginType: 'admin'
        }
      },
      ctx,
      secrets
    );

    expect(createRoleRes.ok).toBe(true);
    const refreshed = createRoleRes as any;
    expect(refreshed.refreshedToken).toBeDefined();
    expect(refreshed.refreshedClaims).toBeDefined();
    expect(refreshed.refreshedClaims.pv).toBe(Number(ctx.props.get('PERM_VERSION')));
    expect(refreshed.refreshedClaims.pv).toBeGreaterThan(1);

    // Subsequent request with the refreshedToken succeeds without UNAUTHORIZED
    const listRes = handleRequest(
      {
        action: 'roles.list',
        token: refreshed.refreshedToken
      },
      ctx,
      secrets
    );
    expect(listRes.ok).toBe(true);
  });
});

