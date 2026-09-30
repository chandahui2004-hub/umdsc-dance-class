import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { Hmac, signToken } from '../../src/security/tokens';
import { getAttendanceRoutes } from '../../src/features/attendance';
import { getSessionRoutes } from '../../src/features/sessions';
import { buildLayout } from '../../src/logic/attendanceGrid';
import { seedEvent } from '../fixtures/events';
import { ClassSession, EventItem, Member } from '@umdsc/shared';

const nodeHmac: Hmac = (key: string, message: string) => {
  return new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
};

const secrets = {
  tokenSecret: 'test_secret_key_123456789012345678901234567890',
  hmac: nodeHmac
};

const POPPERS: Partial<Member>[] = [
  { matricKey: '22001111', fullName: 'Popper One', styleIds: ['st_popping'] },
  { matricKey: '22002222', fullName: 'Popper Two', styleIds: ['st_popping'] }
];

describe('Feature: Attendance (features/attendance)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let adminToken: string;
  let admin2Token: string;
  let event: EventItem;
  let poppingSession1: ClassSession;
  let poppingSession2: ClassSession;

  function token(sub: string, perms: any) {
    return signToken(
      { sub, role: 'admin', name: sub, exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1, perms },
      secrets.tokenSecret,
      secrets.hmac
    );
  }

  function call(action: string, payload: any, t = adminToken) {
    return handleRequest({ action, token: t, payload }, ctx, secrets);
  }

  beforeEach(() => {
    ctx = makeCtx();
    registerRoutes(getAttendanceRoutes());
    registerRoutes(getSessionRoutes());

    adminToken = token('admin1', {
      'members.import': '*', 'members.view': '*', 'sessions.edit': '*',
      'attendance.edit': '*', 'attendance.view.all': '*', 'export.download': '*'
    });
    admin2Token = token('admin2', { 'attendance.edit': '*', 'attendance.view.all': '*' });

    ctx.db.styles.insert(
      { id: 'st_popping', name: 'Popping', aliases: ['popping'], colorKey: 'blue', defaultWeekday: null, defaultStart: '20:00',
        defaultEnd: '22:00', defaultInstructorId: '', defaultVenue: '', attendanceFolderId: '', videoFolderId: '' } as any,
      'system',
      ctx.now()
    );

    event = seedEvent(ctx, { name: 'OCT MONTHLY CLASS', styleIds: ['st_popping'], members: POPPERS });
    const mk = (seq: number, date: string) =>
      ctx.db.sessions.insert(
        { eventId: event.id, styleId: 'st_popping', seq, date, start: '20:00', end: '22:00', instructorId: '', venue: '', status: 'scheduled', note: '' },
        'admin1',
        ctx.now()
      );
    poppingSession1 = mk(1, '2026-10-06');
    poppingSession2 = mk(2, '2026-10-13');

    const att = ctx.drive.createSpreadsheet('Popping Attendance', 'root');
    const members = POPPERS.map(m => ({ ...m, memberId: 'M-' + m.matricKey, matricRaw: m.matricKey } as Member));
    const layout = buildLayout(members, [poppingSession1, poppingSession2]);
    att.addSheet('Attendance', []).setValues(1, 1, [layout.keyRow, layout.labelRow, ...layout.rows]);
    ctx.db.attendanceSheets.insert({ eventId: event.id, styleId: 'st_popping', spreadsheetId: att.id }, 'system', ctx.now());
  });

  it('mark twice with same opId writes once', () => {
    const payload = {
      eventId: event.id,
      styleId: 'st_popping',
      marks: [{ opId: 'op_dup_1', sessionId: poppingSession1.id, memberId: 'M-22001111', present: true }]
    };
    const res1 = call('attendance.mark', payload);
    expect(res1.ok && (res1.data as any).applied).toEqual(['op_dup_1']);

    const res2 = call('attendance.mark', payload);
    expect(res2.ok && (res2.data as any).applied).toEqual([]);
  });

  it('two admins marking different cells in the same sheet: both applied', () => {
    expect(call('attendance.mark', {
      eventId: event.id, styleId: 'st_popping',
      marks: [{ opId: 'op_adm1', sessionId: poppingSession1.id, memberId: 'M-22001111', present: true }]
    }).ok).toBe(true);
    expect(call('attendance.mark', {
      eventId: event.id, styleId: 'st_popping',
      marks: [{ opId: 'op_adm2', sessionId: poppingSession2.id, memberId: 'M-22002222', present: true }]
    }, admin2Token).ok).toBe(true);

    const getRes = call('attendance.get', { eventId: event.id, styleId: 'st_popping' });
    expect(getRes.ok).toBe(true);
    if (getRes.ok) {
      const grid = getRes.data as any;
      expect(grid.eventId).toBe(event.id);
      expect(grid.present['M-22001111']).toContain(poppingSession1.id);
      expect(grid.present['M-22002222']).toContain(poppingSession2.id);
    }
  });

  it('get with ifVersion equal to current → notModified', () => {
    const res1 = call('attendance.get', { eventId: event.id, styleId: 'st_popping' });
    expect(res1.ok).toBe(true);
    if (res1.ok) {
      const currentVersion = (res1.data as any).version;
      const res2 = call('attendance.get', { eventId: event.id, styleId: 'st_popping', ifVersion: currentVersion });
      expect(res2.ok && res2.data).toEqual({ notModified: true, version: currentVersion });
    }
  });

  it('session moved to 2026-10-09 after ticks: column keeps ticks, label becomes "C2 09/10 Fri"', () => {
    call('attendance.mark', {
      eventId: event.id, styleId: 'st_popping',
      marks: [{ opId: 'op_s2', sessionId: poppingSession2.id, memberId: 'M-22001111', present: true }]
    });
    expect(call('sessions.update', { id: poppingSession2.id, version: poppingSession2.version, date: '2026-10-09' }).ok).toBe(true);

    const sheetRec = ctx.db.attendanceSheets.find(s => s.eventId === event.id && s.styleId === 'st_popping')[0];
    const rows = ctx.drive.openSpreadsheet(sheetRec.spreadsheetId).sheet('Attendance')!.getDisplayValues();
    const colIndex = rows[0].indexOf(poppingSession2.id);
    expect(colIndex).toBeGreaterThan(-1);
    expect(rows[1][colIndex]).toBe('C2 09/10 Fri');
    expect(rows.find(r => r[0] === 'M-22001111')?.[colIndex]).toBe('/');
  });

  it('mark for a memberId not registered in that style → VALIDATION', () => {
    const res = call('attendance.mark', {
      eventId: event.id, styleId: 'st_popping',
      marks: [{ opId: 'op_invalid', sessionId: poppingSession1.id, memberId: 'M-99999999', present: true }]
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('VALIDATION');
  });

  it('attendance.ensureSheets builds the event sheets inside the event folder', () => {
    const master = ctx.drive.createFolder('root', 'Attendance');
    ctx.db.settings.insert({ key: 'defaultAttendanceFolderId', value: master }, 'system', ctx.now());

    const res = call('attendance.ensureSheets', { eventId: event.id });

    expect(res.ok).toBe(true);
    const folder = ctx.drive.findChildFolder(master, 'OCT MONTHLY CLASS');
    const rec = ctx.db.attendanceSheets.find(a => a.eventId === event.id && a.styleId === 'st_popping')[0];
    expect(res.ok && (res.data as any).sheets).toEqual([{ styleId: 'st_popping', spreadsheetId: rec.spreadsheetId }]);
    expect((ctx.drive as any).parentOf(rec.spreadsheetId)).toBe(folder);
  });

  it('attendance.export names the file after the event and style', () => {
    const res = call('attendance.export', { eventId: event.id, styleId: 'st_popping' });
    expect(res.ok && res.data).toEqual({
      fileName: 'OCT MONTHLY CLASS Popping Attendance.xlsx',
      base64: 'fake-base64-xlsx-content'
    });
  });
});
