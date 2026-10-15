import { describe, it, expect, beforeEach, vi } from 'vitest';
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
        eventIds: ['evt_test'],
        lastEventEnd: '2026-10-31'
      },
      'system',
      new Date()
    );

    ctx.db.memberIndex.insert(
      {
        matricKey: 'S2199647',
        nameKey: 'tan wei jie',
        fullName: 'Tan Wei Jie',
        eventIds: ['evt_test'],
        lastEventEnd: '2026-10-31'
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

  it('adminLogin ignores the capital letter a phone keyboard adds to the username', () => {
    const res = handleRequest({ action: 'auth.adminLogin', payload: { username: 'Clubadmin', password: 'SecretAdminPass' } }, ctx, secrets);

    expect(res.ok).toBe(true);
    expect(res.ok && (res.data as any).claims.sub).toBe('clubadmin');
    const wrong = handleRequest({ action: 'auth.adminLogin', payload: { username: 'Clubadmin', password: 'secretadminpass' } }, ctx, secrets);
    expect(wrong.ok).toBe(false);
  });

  describe('admin login speed', () => {
    const login = (password: string, s: typeof secrets = secrets) =>
      handleRequest({ action: 'auth.adminLogin', payload: { username: 'clubadmin', password } }, ctx, s);

    function countingSecrets() {
      const counter = { calls: 0 };
      const hmac: Hmac = (key, message) => {
        counter.calls++;
        return nodeHmac(key, message);
      };
      return { counter, s: { ...secrets, hmac } };
    }

    it('returns the token without building the admin starting data when it is not cached', () => {
      const res = login('SecretAdminPass');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect((res.data as any).token).toBeTruthy();
        expect((res.data as any).bootstrap).toBeUndefined();
      }
    });

    it('includes the admin starting data when it is already cached', () => {
      const first = login('SecretAdminPass');
      const token = first.ok ? (first.data as any).token : '';
      handleRequest({ action: 'admin.bootstrap', token }, ctx, secrets);

      const res = login('SecretAdminPass');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect((res.data as any).bootstrap?.profile?.username).toBe('clubadmin');
      }
    });

    it('a repeat login with the same password skips the slow hashing', () => {
      const { counter, s } = countingSecrets();
      expect(login('SecretAdminPass', s).ok).toBe(true);
      expect(counter.calls).toBeGreaterThanOrEqual(PASSWORD_ITERATIONS);

      counter.calls = 0;
      expect(login('SecretAdminPass', s).ok).toBe(true);
      expect(counter.calls).toBeLessThan(10);
    });

    it('a wrong password is still rejected after a fast login', () => {
      expect(login('SecretAdminPass').ok).toBe(true);
      const res = login('WrongPassword');
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe('UNAUTHORIZED');
    });

    it('a password reset makes the old password fail at once', () => {
      const first = login('SecretAdminPass');
      expect(first.ok).toBe(true);
      const admin = ctx.db.admins.find(a => a.username === 'clubadmin')[0];
      const reset = handleRequest(
        {
          action: 'admins.resetPassword',
          token: first.ok ? (first.data as any).token : '',
          payload: { id: admin.id, version: admin.version, newPassword: 'NewPass456' }
        },
        ctx,
        secrets
      );
      expect(reset.ok).toBe(true);
      expect(login('SecretAdminPass').ok).toBe(false);
      expect(login('NewPass456').ok).toBe(true);
    });
  });

  describe('admin accounts kept in the server cache', () => {
    const login = (username: string, password: string) =>
      handleRequest({ action: 'auth.adminLogin', payload: { username, password } }, ctx, secrets);
    const tokenOf = (res: any) => (res.ok ? res.data.token : '');

    it('a repeat login reads neither the Admins nor the RolePermissions sheet', () => {
      expect(login('clubadmin', 'SecretAdminPass').ok).toBe(true);
      const admins = vi.spyOn(ctx.db.admins, 'find');
      const perms = vi.spyOn(ctx.db.rolePermissions, 'find');
      expect(login('clubadmin', 'SecretAdminPass').ok).toBe(true);
      expect(admins).not.toHaveBeenCalled();
      expect(perms).not.toHaveBeenCalled();
    });

    it('editing the username and password on the website updates login at once', () => {
      const token = tokenOf(login('clubadmin', 'SecretAdminPass'));
      const admin = ctx.db.admins.find(a => a.username === 'clubadmin')[0];
      const res = handleRequest(
        { action: 'admins.update', token, payload: { id: admin.id, version: admin.version, username: 'headadmin', newPassword: 'NewPass789' } },
        ctx,
        secrets
      );
      expect(res.ok).toBe(true);
      expect(login('clubadmin', 'SecretAdminPass').ok).toBe(false);
      expect(login('headadmin', 'SecretAdminPass').ok).toBe(false);
      expect(login('headadmin', 'NewPass789').ok).toBe(true);
    });

    it('a change made straight in the sheet shows after admins.refresh', () => {
      const token = tokenOf(login('clubadmin', 'SecretAdminPass'));
      const admin = ctx.db.admins.find(a => a.username === 'clubadmin')[0];
      ctx.db.admins.update(admin.id, admin.version, { displayName: 'Renamed In Sheet' }, 'sheet', new Date());

      const before = login('clubadmin', 'SecretAdminPass');
      expect(before.ok && (before.data as any).claims.name).toBe('Club Administrator');

      const refreshed = handleRequest({ action: 'admins.refresh', token, payload: {} }, ctx, secrets);
      expect(refreshed.ok).toBe(true);
      expect(JSON.stringify(refreshed.ok ? refreshed.data : '')).not.toContain('passwordHash');

      const after = login('clubadmin', 'SecretAdminPass');
      expect(after.ok && (after.data as any).claims.name).toBe('Renamed In Sheet');
    });
  });

  it('wrong password 10x → correct password still logs in', () => {
    for (let i = 0; i < 10; i++) {
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

    const successRes = handleRequest(
      {
        action: 'auth.adminLogin',
        payload: { username: 'clubadmin', password: 'SecretAdminPass' }
      },
      ctx,
      secrets
    );
    expect(successRes.ok).toBe(true);
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
      // Token only: the calendar and attendance load afterwards, so login is not slowed by sheet reads.
      expect(data.bootstrap).toBeUndefined();
      const claims = verifyToken(data.token, secrets.tokenSecret, nodeHmac, Math.floor(ctx.now().getTime() / 1000));
      expect(claims.role).toBe('dancer');
      expect(claims.sub).toBe('M-22004591');
      expect(claims.perms['calendar.view']).toBe('*');
    }
  });

  it('dancerLogin returns per-step timings only when debugTimings is true', () => {
    const login = (extra: Record<string, unknown>) =>
      handleRequest(
        {
          action: 'auth.dancerLogin',
          payload: { fullName: 'ahmad fiqri mohd zamri', matric: '22004591', ...extra }
        },
        ctx,
        secrets
      );

    const plain = login({});
    const debug = login({ debugTimings: true });

    expect(plain.ok && (plain.data as any).timings).toBeUndefined();
    expect(debug.ok).toBe(true);
    if (debug.ok) {
      const timings = (debug.data as any).timings as Record<string, number>;
      expect(Object.keys(timings)).toEqual(expect.arrayContaining(['memberIndex', 'sign']));
      expect(Object.values(timings).every(ms => typeof ms === 'number' && ms >= 0)).toBe(true);
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

  it('dancerLogin: right matric, different person name → NOT_REGISTERED with shared message', () => {
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
      expect(res.error.code).toBe('NOT_REGISTERED');
      expect(res.error.message).toContain("Matric number and name don't match a registered dancer. Type your full name as on the registration form.");
    }
  });

  it('dancerLogin: unknown matric → NOT_REGISTERED with shared message', () => {
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
      expect(res.error.message).toContain("Matric number and name don't match a registered dancer. Type your full name as on the registration form.");
    }
  });

  it('dancerLogin: one word of the name is rejected', () => {
    const res = handleRequest(
      {
        action: 'auth.dancerLogin',
        payload: {
          fullName: 'ahmad',
          matric: '22004591'
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('NOT_REGISTERED');
      expect(res.error.message).toContain("Matric number and name don't match a registered dancer. Type your full name as on the registration form.");
    }
  });

  it('dancerLogin: 10 wrong names then the right one logs in', () => {
    for (let i = 0; i < 10; i++) {
      const failRes = handleRequest(
        {
          action: 'auth.dancerLogin',
          payload: {
            fullName: `Wrong Name ${i}`,
            matric: '22004591'
          }
        },
        ctx,
        secrets
      );
      expect(failRes.ok).toBe(false);
      if (!failRes.ok) {
        expect(failRes.error.code).toBe('NOT_REGISTERED');
      }
    }

    const okRes = handleRequest(
      {
        action: 'auth.dancerLogin',
        payload: {
          fullName: 'Ahmad Fiqri Mohd Zamri',
          matric: '22004591'
        }
      },
      ctx,
      secrets
    );
    expect(okRes.ok).toBe(true);
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
          fullName: 'Ahmad Fiqri Mohd Zamri',
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

  describe('auth.suggestDancers (Autocomplete with masked matric)', () => {
    it('suggests by name when query length >= 2 and returns masked matric', () => {
      const res = handleRequest(
        {
          action: 'auth.suggestDancers',
          payload: { query: 'Ahmad', type: 'name' }
        },
        ctx,
        secrets
      );

      expect(res.ok).toBe(true);
      if (res.ok) {
        const data = res.data as { suggestions: { fullName: string; matricMasked: string }[] };
        expect(data.suggestions.length).toBeGreaterThanOrEqual(1);
        expect(data.suggestions[0].fullName).toBe('Ahmad Fiqri Bin Mohd Zamri');
        expect(data.suggestions[0].matricMasked).not.toBe('22004591');
        expect(data.suggestions[0].matricMasked).toMatch(/^22.*91$/);
        expect(data.suggestions[0].matricMasked).toContain('•');
      }
    });

    it('returns at least 1 closest dancer if no close match found', () => {
      const res = handleRequest(
        {
          action: 'auth.suggestDancers',
          payload: { query: 'Zzzzz Nonexistent', type: 'name' }
        },
        ctx,
        secrets
      );

      expect(res.ok).toBe(true);
      if (res.ok) {
        const data = res.data as { suggestions: { fullName: string; matricMasked: string }[] };
        expect(data.suggestions.length).toBe(1);
        expect(data.suggestions[0].matricMasked).toContain('•');
      }
    });

    it('suggests by matric when query length >= 3', () => {
      const res = handleRequest(
        {
          action: 'auth.suggestDancers',
          payload: { query: '220', type: 'matric' }
        },
        ctx,
        secrets
      );

      expect(res.ok).toBe(true);
      if (res.ok) {
        const data = res.data as { suggestions: { fullName: string; matricMasked: string }[] };
        expect(data.suggestions.length).toBeGreaterThanOrEqual(1);
        expect(data.suggestions[0].fullName).toBe('Ahmad Fiqri Bin Mohd Zamri');
      }
    });

    it('returns empty suggestions when query is too short', () => {
      const shortName = handleRequest(
        {
          action: 'auth.suggestDancers',
          payload: { query: 'A', type: 'name' }
        },
        ctx,
        secrets
      );
      expect(shortName.ok).toBe(true);
      expect(shortName.ok && (shortName.data as any).suggestions).toEqual([]);

      const shortMatric = handleRequest(
        {
          action: 'auth.suggestDancers',
          payload: { query: '22', type: 'matric' }
        },
        ctx,
        secrets
      );
      expect(shortMatric.ok).toBe(true);
      expect(shortMatric.ok && (shortMatric.data as any).suggestions).toEqual([]);
    });
  });

  describe('Walk-In Pass Authentication (auth.walkInLogin)', () => {
    it('authenticates walk-in dancer, appends to Walk-ins tab, and returns scoped bootstrap', () => {
      // Create event, style, and session
      const event = ctx.db.events.insert(
        {
          name: 'OCT 2026',
          type: 'monthly',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          status: 'active',
          styleIds: ['st_locking'],
          sourceSheetId: 'src_ss',
          sourceTab: 'Responses'
        },
        'admin1',
        ctx.now()
      );

      const style = ctx.db.styles.insert(
        {
          id: 'st_locking',
          name: 'Locking',
          colorKey: 'orange',
          defaultVenue: 'Studio A'
        },
        'admin1',
        ctx.now()
      );

      const session = ctx.db.sessions.insert(
        {
          eventId: event.id,
          styleId: 'st_locking',
          seq: 1,
          date: '2026-10-15',
          start: '20:00',
          end: '22:00',
          venue: 'Studio A',
          status: 'scheduled',
          walkInCode: 'LCK-7X9'
        },
        'admin1',
        ctx.now()
      );

      // Create attendance spreadsheet
      const ss = ctx.drive.createSpreadsheet('Locking Attendance', 'folder_1');
      ss.addSheet('Attendance', ['memberId', 'name', session.id]);
      ctx.db.attendanceSheets.insert(
        {
          eventId: event.id,
          styleId: 'st_locking',
          spreadsheetId: ss.id
        },
        'admin1',
        ctx.now()
      );

      const res = handleRequest(
        {
          action: 'auth.walkInLogin',
          payload: { code: 'lck-7x9', name: 'Alex Tan' }
        },
        ctx,
        secrets
      );

      expect(res.ok).toBe(true);
      if (res.ok) {
        const data = res.data as any;
        expect(data.token).toBeDefined();
        expect(data.claims.name).toBe('Alex Tan (Walk-In)');
        expect(data.claims.sub).toContain(session.id);
        expect(data.claims.sub).toContain('alex%20tan');
        // ~10 years
        const tenYearsSec = 9 * 365 * 24 * 3600;
        const nowSec = Math.floor(ctx.now().getTime() / 1000);
        expect(data.claims.exp - nowSec).toBeGreaterThan(tenYearsSec);

        // Bootstrap verification
        expect(data.bootstrap).toBeDefined();
        expect(data.bootstrap.sessions.length).toBe(1);
        expect(data.bootstrap.sessions[0].id).toBe(session.id);
        expect(data.bootstrap.attendance).toEqual([{ sessionId: session.id, present: true }]);

        // Check that Walk-ins tab in spreadsheet exists and has attendee row
        const walkInSheet = ss.sheet('Walk-ins');
        expect(walkInSheet).not.toBeNull();
        const displayVals = walkInSheet!.getDisplayValues();
        expect(displayVals.length).toBe(2); // Header + 1 row
        expect(displayVals[1][1]).toBe('Alex Tan');
        expect(displayVals[1][4]).toBe('LCK-7X9');
      }
    });

    it('rejects invalid or missing walk-in code', () => {
      const missing = handleRequest(
        {
          action: 'auth.walkInLogin',
          payload: { code: '', name: 'Alex Tan' }
        },
        ctx,
        secrets
      );
      expect(missing.ok).toBe(false);
      if (!missing.ok) expect(missing.error.code).toBe('VALIDATION');

      const notFound = handleRequest(
        {
          action: 'auth.walkInLogin',
          payload: { code: 'NONEXISTENT', name: 'Alex Tan' }
        },
        ctx,
        secrets
      );
      expect(notFound.ok).toBe(false);
      if (!notFound.ok) expect(notFound.error.code).toBe('NOT_FOUND');
    });
  });
});
