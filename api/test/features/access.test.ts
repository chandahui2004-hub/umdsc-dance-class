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
});
