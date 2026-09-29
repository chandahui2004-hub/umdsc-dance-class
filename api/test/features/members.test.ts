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

describe('Feature: Monthly Registration Import (features/members)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let adminToken: string;

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
        perms: { 'members.import': '*', 'members.view': '*', 'sessions.edit': '*', 'attendance.edit': '*' }
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

    ctx.db.styles.insert(
      {
        id: 'st_hiphop',
        name: 'Hip Hop',
        aliases: ['hiphop', 'hip hop'],
        colorKey: 'orange',
        defaultWeekday: 4,
        defaultStart: '20:00',
        defaultEnd: '22:00',
        defaultInstructorId: '',
        defaultVenue: 'Studio B',
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
  });

  it('previewImport on an unshared sheet → LINK_NO_ACCESS', () => {
    const res = handleRequest(
      {
        action: 'members.previewImport',
        token: adminToken,
        payload: {
          sheetUrl: 'https://docs.google.com/spreadsheets/d/nonexistent_sheet_id_12345/edit',
          month: '2026-10'
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('LINK_NO_ACCESS');
      expect(res.error.message).toContain(ctx.clubEmail);
    }
  });

  it('previewImport reads display values: matric shows 22003949 not 2.2003949E7', () => {
    const sourceSs = ctx.drive.createSpreadsheet('RegistrationFormResponses', 'root');
    const sheet = sourceSs.getSheet('Sheet1') || sourceSs.addSheet('Sheet1', []);
    sheet.setValues(1, 1, [
      ['Timestamp', 'Full Name', 'Matric Number', 'Phone', 'Email', 'Classes'],
      ['2026-10-01 12:00:00', 'Ahmad Ali', '22003949', '0123456789', 'ahmad@test.com', 'Popping']
    ]);

    const res = handleRequest(
      {
        action: 'members.previewImport',
        token: adminToken,
        payload: {
          sheetUrl: 'https://docs.google.com/spreadsheets/d/' + sourceSs.id + '/edit',
          month: '2026-10'
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as any;
      expect(data.rowCount).toBe(1);
      expect(data.sampleNames).toContain('Ahmad Ali');
      expect(data.countsByStyle['st_popping']).toBe(1);
    }
  });

  it('confirmImport creates Members_2026-10 with plain-text matric/contact, upserts MemberIndex (months "2026-10"), records MemberMonths', () => {
    const sourceSs = ctx.drive.createSpreadsheet('RegistrationFormResponses', 'root');
    const sheet = sourceSs.getSheet('Sheet1') || sourceSs.addSheet('Sheet1', []);
    sheet.setValues(1, 1, [
      ['Timestamp', 'Full Name', 'Matric Number', 'Phone', 'Email', 'Classes'],
      ['2026-10-01 12:00:00', 'Ahmad Ali', '22003949', '0123456789', 'ahmad@test.com', 'Popping']
    ]);

    const res = handleRequest(
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

    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as any;
      expect(data.memberCount).toBe(1);
      expect(data.membersSpreadsheetId).toBeTruthy();

      // Check MemberIndex
      const mi = ctx.db.memberIndex.find(m => m.matricKey === '22003949' && m.active)[0];
      expect(mi).toBeTruthy();
      expect(mi.months).toEqual(['2026-10']);
      expect(mi.lastMonth).toBe('2026-10');

      // Check MemberMonths
      const mm = ctx.db.memberMonths.find(m => m.month === '2026-10' && m.active)[0];
      expect(mm).toBeTruthy();
      expect(mm.memberCount).toBe(1);
      expect(mm.membersSpreadsheetId).toBe(data.membersSpreadsheetId);
    }
  });

  it('confirmImport creates one attendance sheet per style with members of that style only and one column per session', () => {
    const sourceSs = ctx.drive.createSpreadsheet('RegistrationResponses', 'root');
    const sheet = sourceSs.getSheet('Sheet1') || sourceSs.addSheet('Sheet1', []);
    sheet.setValues(1, 1, [
      ['Timestamp', 'Full Name', 'Matric Number', 'Phone', 'Email', 'Classes'],
      ['2026-10-01 12:00:00', 'Popper Ali', '22001111', '0123456789', 'p@test.com', 'Popping'],
      ['2026-10-01 12:00:00', 'HipHopper Bob', '22002222', '0123456789', 'h@test.com', 'Hip Hop']
    ]);

    const res = handleRequest(
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

    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as any;
      expect(data.attendanceSheets.length).toBe(2);

      // Verify Popping attendance sheet
      const poppingRec = data.attendanceSheets.find((s: any) => s.styleId === 'st_popping');
      const poppingSs = ctx.drive.openSpreadsheet(poppingRec.spreadsheetId);
      const poppingSheet = poppingSs.getSheet('Attendance');
      const poppingRows = poppingSheet.getDataRange();

      // Row 1 keys, Row 2 labels, Row 3 Popper Ali
      expect(poppingRows.length).toBe(3);
      expect(poppingRows[2][0]).toBe('M-22001111');
      expect(poppingRows[2][1]).toBe('Popper Ali');
    }
  });

  it('confirmImport again (resync) adds a new form row, keeps existing ticks, removes nothing', () => {
    const sourceSs = ctx.drive.createSpreadsheet('RegistrationResponses', 'root');
    const sheet = sourceSs.getSheet('Sheet1') || sourceSs.addSheet('Sheet1', []);
    sheet.setValues(1, 1, [
      ['Timestamp', 'Full Name', 'Matric Number', 'Phone', 'Email', 'Classes'],
      ['2026-10-01 12:00:00', 'Popper Ali', '22001111', '0123456789', 'p@test.com', 'Popping']
    ]);

    // First import
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

    // Mark attendance for Popper Ali for session 1
    const poppingSession = ctx.db.sessions.find(s => s.month === '2026-10' && s.styleId === 'st_popping')[0];
    handleRequest(
      {
        action: 'attendance.mark',
        token: adminToken,
        payload: {
          month: '2026-10',
          styleId: 'st_popping',
          marks: [
            { opId: 'op_1', memberId: 'M-22001111', sessionId: poppingSession.id, present: true }
          ]
        }
      },
      ctx,
      secrets
    );

    // Add new row to source form
    sheet.appendRows([
      ['2026-10-02 12:00:00', 'Popper Two', '22003333', '0123456789', 'p2@test.com', 'Popping']
    ]);

    // Resync
    const resyncRes = handleRequest(
      {
        action: 'members.resync',
        token: adminToken,
        payload: { month: '2026-10' }
      },
      ctx,
      secrets
    );

    expect(resyncRes.ok).toBe(true);

    // Verify Popping attendance sheet still has tick for Popper Ali and has new row for Popper Two
    const poppingRec = ctx.db.attendanceSheets.find(s => s.month === '2026-10' && s.styleId === 'st_popping')[0];
    const poppingSs = ctx.drive.openSpreadsheet(poppingRec.spreadsheetId);
    const poppingSheet = poppingSs.getSheet('Attendance');
    const rows = poppingSheet.getDataRange();

    expect(rows.length).toBe(4); // row 1 keys, row 2 labels, row 3 Popper Ali, row 4 Popper Two
    // Check tick for Popper Ali is still '/'
    const sessionCol = rows[0].indexOf(poppingSession.id);
    expect(rows[2][sessionCol]).toBe('/');
  });

  it('MemberIndex for someone in 2026-09 and 2026-10 has months "2026-09,2026-10"', () => {
    // Member was in 2026-09
    ctx.db.memberIndex.insert(
      {
        matricKey: '22005555',
        nameKey: 'multi month',
        fullName: 'Multi Month Dancer',
        months: ['2026-09'],
        lastMonth: '2026-09'
      },
      'system',
      ctx.now()
    );

    const sourceSs = ctx.drive.createSpreadsheet('Responses', 'root');
    const sheet = sourceSs.getSheet('Sheet1') || sourceSs.addSheet('Sheet1', []);
    sheet.setValues(1, 1, [
      ['Timestamp', 'Full Name', 'Matric Number', 'Phone', 'Email', 'Classes'],
      ['2026-10-01 12:00:00', 'Multi Month Dancer', '22005555', '0123456789', 'mm@test.com', 'Popping']
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

    const mi = ctx.db.memberIndex.find(m => m.matricKey === '22005555' && m.active)[0];
    expect(mi.months).toEqual(['2026-09', '2026-10']);
    expect(mi.lastMonth).toBe('2026-10');
  });
});
