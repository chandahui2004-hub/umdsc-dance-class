import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { Hmac, signToken } from '../../src/security/tokens';
import { getMemberRoutes } from '../../src/features/members';
import { getAttendanceRoutes } from '../../src/features/attendance';
import { getSessionRoutes } from '../../src/features/sessions';

const nodeHmac: Hmac = (key: string, message: string) => {
  return new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
};

const secrets = {
  tokenSecret: 'test_secret_key_123456789012345678901234567890',
  hmac: nodeHmac
};

describe('Feature: Attendance (features/attendance)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let adminToken: string;
  let admin2Token: string;
  let poppingSession1: any;
  let poppingSession2: any;

  beforeEach(() => {
    ctx = makeCtx();
    registerRoutes(getMemberRoutes());
    registerRoutes(getAttendanceRoutes());
    registerRoutes(getSessionRoutes());

    adminToken = signToken(
      {
        sub: 'admin1',
        role: 'admin',
        name: 'Admin One',
        exp: Math.floor(ctx.now().getTime() / 1000) + 3600,
        pv: 1,
        perms: {
          'members.import': '*',
          'members.view': '*',
          'sessions.edit': '*',
          'attendance.edit': '*',
          'attendance.view.all': '*',
          'export.download': '*'
        }
      },
      secrets.tokenSecret,
      secrets.hmac
    );

    admin2Token = signToken(
      {
        sub: 'admin2',
        role: 'admin',
        name: 'Admin Two',
        exp: Math.floor(ctx.now().getTime() / 1000) + 3600,
        pv: 1,
        perms: {
          'attendance.edit': '*',
          'attendance.view.all': '*'
        }
      },
      secrets.tokenSecret,
      secrets.hmac
    );

    // Seed styles
    ctx.db.styles.insert(
      {
        id: 'st_popping',
        name: 'Popping',
        aliases: ['popping'],
        colorKey: 'blue',
        defaultWeekday: 2,
        defaultStart: '20:00',
        defaultEnd: '22:00',
        defaultInstructorId: '',
        defaultVenue: 'Studio A',
        attendanceFolderId: '',
        videoFolderId: ''
      },
      'system',
      ctx.now()
    );

    // Generate sessions for month 2026-10
    handleRequest(
      {
        action: 'sessions.generateMonth',
        token: adminToken,
        payload: { month: '2026-10' }
      },
      ctx,
      secrets
    );

    const sessions = ctx.db.sessions.find(s => s.month === '2026-10' && s.styleId === 'st_popping');
    poppingSession1 = sessions.find(s => s.seq === 1);
    poppingSession2 = sessions.find(s => s.seq === 2);

    // Import members
    const sourceSs = ctx.drive.createSpreadsheet('Responses', 'root');
    const sheet = sourceSs.getSheet('Sheet1') || sourceSs.addSheet('Sheet1', []);
    sheet.setValues(1, 1, [
      ['Timestamp', 'Full Name', 'Matric Number', 'Phone', 'Email', 'Classes'],
      ['2026-10-01 12:00:00', 'Popper One', '22001111', '0123456789', 'p1@test.com', 'Popping'],
      ['2026-10-01 12:00:00', 'Popper Two', '22002222', '0123456789', 'p2@test.com', 'Popping']
    ]);

    handleRequest(
      {
        action: 'members.confirmImport',
        token: adminToken,
        payload: {
          sheetUrl: 'https://docs.google.com/spreadsheets/d/' + sourceSs.id + '/edit',
          month: '2026-10'
        }
      },
      ctx,
      secrets
    );
  });

  it('changing the master folder moves existing sheets into the new style folder', () => {
    const rec = ctx.db.attendanceSheets.find(s => s.month === '2026-10' && s.styleId === 'st_popping' && s.active)[0];
    expect(rec).toBeTruthy();

    const newMaster = ctx.drive.createFolder('root', 'Attendance');
    ctx.db.settings.insert({ key: 'defaultAttendanceFolderId', value: newMaster }, 'admin1', ctx.now());

    const settingsToken = signToken(
      {
        sub: 'admin1',
        role: 'admin',
        name: 'Admin One',
        exp: Math.floor(ctx.now().getTime() / 1000) + 3600,
        pv: 1,
        perms: { 'settings.edit': '*' }
      },
      secrets.tokenSecret,
      secrets.hmac
    );

    const res = handleRequest(
      { action: 'attendance.ensureSheets', token: settingsToken, payload: { month: '2026-10' } },
      ctx,
      secrets
    );
    expect(res.ok).toBe(true);

    const poppingFolder = ctx.drive.findChildFolder(newMaster, 'Popping');
    expect(poppingFolder).toBeTruthy();
    expect(ctx.drive.parentOf(rec.spreadsheetId)).toBe(poppingFolder);
  });

  it('mark twice with same opId writes once', () => {
    const res1 = handleRequest(
      {
        action: 'attendance.mark',
        token: adminToken,
        payload: {
          month: '2026-10',
          styleId: 'st_popping',
          marks: [{ opId: 'op_dup_1', sessionId: poppingSession1.id, memberId: 'M-22001111', present: true }]
        }
      },
      ctx,
      secrets
    );

    expect(res1.ok).toBe(true);
    if (res1.ok) {
      expect((res1.data as any).applied).toEqual(['op_dup_1']);
    }

    const res2 = handleRequest(
      {
        action: 'attendance.mark',
        token: adminToken,
        payload: {
          month: '2026-10',
          styleId: 'st_popping',
          marks: [{ opId: 'op_dup_1', sessionId: poppingSession1.id, memberId: 'M-22001111', present: true }]
        }
      },
      ctx,
      secrets
    );

    expect(res2.ok).toBe(true);
    if (res2.ok) {
      // Already applied, not reapplied
      expect((res2.data as any).applied).toEqual([]);
    }
  });

  it('two admins marking different cells in the same sheet: both applied', () => {
    const res1 = handleRequest(
      {
        action: 'attendance.mark',
        token: adminToken,
        payload: {
          month: '2026-10',
          styleId: 'st_popping',
          marks: [{ opId: 'op_adm1', sessionId: poppingSession1.id, memberId: 'M-22001111', present: true }]
        }
      },
      ctx,
      secrets
    );
    expect(res1.ok).toBe(true);

    const res2 = handleRequest(
      {
        action: 'attendance.mark',
        token: admin2Token,
        payload: {
          month: '2026-10',
          styleId: 'st_popping',
          marks: [{ opId: 'op_adm2', sessionId: poppingSession2.id, memberId: 'M-22002222', present: true }]
        }
      },
      ctx,
      secrets
    );
    expect(res2.ok).toBe(true);

    // Verify grid
    const getRes = handleRequest(
      {
        action: 'attendance.get',
        token: adminToken,
        payload: { month: '2026-10', styleId: 'st_popping' }
      },
      ctx,
      secrets
    );

    expect(getRes.ok).toBe(true);
    if (getRes.ok) {
      const grid = getRes.data as any;
      expect(grid.present['M-22001111']).toContain(poppingSession1.id);
      expect(grid.present['M-22002222']).toContain(poppingSession2.id);
    }
  });

  it('get with ifVersion equal to current → notModified', () => {
    const res1 = handleRequest(
      {
        action: 'attendance.get',
        token: adminToken,
        payload: { month: '2026-10', styleId: 'st_popping' }
      },
      ctx,
      secrets
    );

    expect(res1.ok).toBe(true);
    if (res1.ok) {
      const currentVersion = (res1.data as any).version;
      const res2 = handleRequest(
        {
          action: 'attendance.get',
          token: adminToken,
          payload: { month: '2026-10', styleId: 'st_popping', ifVersion: currentVersion }
        },
        ctx,
        secrets
      );

      expect(res2.ok).toBe(true);
      if (res2.ok) {
        expect(res2.data).toEqual({ notModified: true, version: currentVersion });
      }
    }
  });

  it('session moved to 2026-10-09 after ticks: column keeps ticks, label becomes "C2 09/10 Fri"', () => {
    // Mark session 2 for Popper One
    handleRequest(
      {
        action: 'attendance.mark',
        token: adminToken,
        payload: {
          month: '2026-10',
          styleId: 'st_popping',
          marks: [{ opId: 'op_s2', sessionId: poppingSession2.id, memberId: 'M-22001111', present: true }]
        }
      },
      ctx,
      secrets
    );

    // Update session date: moved to 2026-10-09 (Friday)
    const updateRes = handleRequest(
      {
        action: 'sessions.update',
        token: adminToken,
        payload: {
          id: poppingSession2.id,
          version: poppingSession2.version,
          date: '2026-10-09'
        }
      },
      ctx,
      secrets
    );
    expect(updateRes.ok).toBe(true);

    // Check attendance sheet directly
    const sheetRec = ctx.db.attendanceSheets.find(s => s.month === '2026-10' && s.styleId === 'st_popping')[0];
    const ss = ctx.drive.openSpreadsheet(sheetRec.spreadsheetId);
    const sheet = ss.getSheet('Attendance');
    const rows = sheet.getDataRange();

    const colIndex = rows[0].indexOf(poppingSession2.id);
    expect(colIndex).toBeGreaterThan(-1);

    // Row 2 label updated to "C2 09/10 Fri"
    expect(rows[1][colIndex]).toBe('C2 09/10 Fri');

    // Popper One's tick is still preserved in row 3
    const popperOneRow = rows.find(r => r[0] === 'M-22001111');
    expect(popperOneRow?.[colIndex]).toBe('/');
  });

  it('mark for a memberId not registered in that style → VALIDATION', () => {
    const res = handleRequest(
      {
        action: 'attendance.mark',
        token: adminToken,
        payload: {
          month: '2026-10',
          styleId: 'st_popping',
          marks: [{ opId: 'op_invalid', sessionId: poppingSession1.id, memberId: 'M-99999999', present: true }]
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

  it('attendance.export { month, styleId }', () => {
    const res = handleRequest(
      {
        action: 'attendance.export',
        token: adminToken,
        payload: { month: '2026-10', styleId: 'st_popping' }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({
        fileName: '2026-10 Popping Attendance.xlsx',
        base64: 'fake-base64-xlsx-content'
      });
    }
  });
});
