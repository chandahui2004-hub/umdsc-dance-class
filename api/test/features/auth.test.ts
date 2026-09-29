import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { Hmac, verifyToken } from '../../src/security/tokens';
import { hashPassword, PASSWORD_ITERATIONS } from '../../src/security/passwords';

const nodeHmac: Hmac = (key: string, message: string) => {
  return new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
};

const secrets = {
  tokenSecret: 'test_secret_key_123456789012345678901234567890',
  hmac: nodeHmac
};

describe('Feature: Auth (Admin and Dancer Login)', () => {
  let ctx: ReturnType<typeof makeCtx>;

  beforeEach(() => {
    ctx = makeCtx();
    ctx.props.set('SYSTEM_SPREADSHEET_ID', 'test_system_ss');

    // Create Admin user
    const salt = 'testsalt123';
    const passwordHash = hashPassword('SecretAdminPass', salt, PASSWORD_ITERATIONS, nodeHmac);

    ctx.db.admins.insert(
      {
        username: 'clubadmin',
        displayName: 'Club Administrator',
        passwordHash,
        salt,
        iterations: PASSWORD_ITERATIONS,
        roleId: 'role_admin'
      },
      'system',
      new Date()
    );

    // Create Admin Role
    ctx.db.roles.insert(
      {
        id: 'role_admin',
        name: 'Admin',
        description: 'Superadmin',
        loginType: 'admin',
        isSystem: true
      },
      'system',
      new Date()
    );

    // Role Permissions for Admin
    ctx.db.rolePermissions.insert(
      { roleId: 'role_admin', permission: 'admins.manage' as any },
      'system',
      new Date()
    );
    ctx.db.rolePermissions.insert(
      { roleId: 'role_admin', permission: 'roles.manage' as any },
      'system',
      new Date()
    );

    // Create Dancer Member in MemberIndex
    ctx.db.memberIndex.insert(
      {
        matricKey: '22004591',
        nameKey: 'ahmad fiqri mohd zamri',
        fullName: 'Ahmad Fiqri Bin Mohd Zamri',
        months: ['2026-10'],
        lastMonth: '2026-10'
      },
      'system',
      new Date()
    );

    ctx.db.memberIndex.insert(
      {
        matricKey: 'S2199647',
        nameKey: 'tan wei jie',
        fullName: 'Tan Wei Jie',
        months: ['2026-10'],
        lastMonth: '2026-10'
      },
      'system',
      new Date()
    );

    // Default Dancer Role
    ctx.db.roles.insert(
      {
        id: 'role_dancer',
        name: 'Dancer',
        description: 'Standard dancer role',
        loginType: 'dancer',
        isSystem: true
      },
      'system',
      new Date()
    );

    ctx.db.rolePermissions.insert(
      { roleId: 'role_dancer', permission: 'calendar.view' as any },
      'system',
      new Date()
    );
  });

  it('adminLogin ok → token verifies, claims.role==="admin"', () => {
    const res = handleRequest(
      {
        action: 'auth.adminLogin',
        payload: {
          username: 'clubadmin',
          password: 'SecretAdminPass'
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as any;
      expect(data.token).toBeTruthy();
      const claims = verifyToken(data.token, secrets.tokenSecret, nodeHmac, Math.floor(ctx.now().getTime() / 1000));
      expect(claims.role).toBe('admin');
      expect(claims.sub).toBe('clubadmin');
      expect(claims.perms['admins.manage']).toBe('*');
    }
  });

  it('wrong password 5x → 6th LOCKED_OUT', () => {
    for (let i = 0; i < 5; i++) {
      const failRes = handleRequest(
        {
          action: 'auth.adminLogin',
          payload: { username: 'clubadmin', password: 'WrongPassword' }
        },
        ctx,
        secrets
      );
      expect(failRes.ok).toBe(false);
      if (!failRes.ok) {
        expect(failRes.error.code).toBe('UNAUTHORIZED');
      }
    }

    const lockedRes = handleRequest(
      {
        action: 'auth.adminLogin',
        payload: { username: 'clubadmin', password: 'SecretAdminPass' }
      },
      ctx,
      secrets
    );
    expect(lockedRes.ok).toBe(false);
    if (!lockedRes.ok) {
      expect(lockedRes.error.code).toBe('LOCKED_OUT');
    }
  });

  it('dancerLogin: sheet matric "22004591/1", typed "22004591" + name without BIN → ok', () => {
    const res = handleRequest(
      {
        action: 'auth.dancerLogin',
        payload: {
          fullName: 'ahmad fiqri mohd zamri',
          matric: ' 22004591/1 '
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as any;
      expect(data.token).toBeTruthy();
      const claims = verifyToken(data.token, secrets.tokenSecret, nodeHmac, Math.floor(ctx.now().getTime() / 1000));
      expect(claims.role).toBe('dancer');
      expect(claims.sub).toBe('M-22004591');
      expect(claims.perms['calendar.view']).toBe('*');
    }
  });

  it('dancerLogin: typed "s2199647" matches stored "S2199647"', () => {
    const res = handleRequest(
      {
        action: 'auth.dancerLogin',
        payload: {
          fullName: 'Tan Wei Jie',
          matric: 's2199647'
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as any;
      expect(data.token).toBeTruthy();
    }
  });

  it('dancerLogin: right matric, different person name → NAME_MISMATCH', () => {
    const res = handleRequest(
      {
        action: 'auth.dancerLogin',
        payload: {
          fullName: 'Completely Wrong Name',
          matric: '22004591'
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('NAME_MISMATCH');
    }
  });

  it('dancerLogin: unknown matric → NOT_REGISTERED', () => {
    const res = handleRequest(
      {
        action: 'auth.dancerLogin',
        payload: {
          fullName: 'John Doe',
          matric: '99999999'
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('NOT_REGISTERED');
    }
  });

  it('dancerLogin claims.perms include MemberRoles extras scoped to styles', () => {
    // Give dancer extra role 'lead' scoped to popping
    ctx.db.roles.insert(
      {
        id: 'role_lead',
        name: 'Class Lead',
        description: 'Lead',
        loginType: 'dancer',
        isSystem: false
      },
      'system',
      new Date()
    );

    ctx.db.rolePermissions.insert(
      { roleId: 'role_lead', permission: 'attendance.edit' as any },
      'system',
      new Date()
    );

    ctx.db.memberRoles.insert(
      {
        matricKey: '22004591',
        roleId: 'role_lead',
        styleIds: ['popping']
      },
      'system',
      new Date()
    );

    const res = handleRequest(
      {
        action: 'auth.dancerLogin',
        payload: {
          fullName: 'Ahmad Fiqri',
          matric: '22004591'
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as any;
      const claims = verifyToken(data.token, secrets.tokenSecret, nodeHmac, Math.floor(ctx.now().getTime() / 1000));
      expect(claims.perms['attendance.edit']).toEqual(['popping']);
      expect(claims.perms['attendance.view.all']).toEqual(['popping']);
      expect(claims.perms['calendar.view']).toBe('*');
    }
  });
});
