import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { FakeDrive } from '../fakes/fakeDrive';
import { Hmac, signToken } from '../../src/security/tokens';
import { getRetentionRoutes } from '../../src/features/retention';
import { getAuthRoutes } from '../../src/features/auth';
import { buildLayout } from '../../src/logic/attendanceGrid';
import { readEventMembers } from '../../src/features/eventMembers';
import { seedEvent } from '../fixtures/events';
import { EventItem, Member } from '@umdsc/shared';

const nodeHmac: Hmac = (key: string, message: string) => new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
const secrets = { tokenSecret: 'test_secret_key_123456789012345678901234567890', hmac: nodeHmac };

const OLD: Partial<Member> = { matricKey: '22001111', fullName: 'Old Dancer', contact: '0111', email: 'o@t.com', styleIds: ['st_popping'] };
const RECENT: Partial<Member> = { matricKey: '22002222', fullName: 'Recent Dancer', contact: '0222', styleIds: ['st_popping'] };

describe('Feature: data retention (features/retention)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let drive: FakeDrive;
  let token: string;
  let oldEvent: EventItem;
  let recentEvent: EventItem;
  let oldAttendanceId: string;

  const call = (action: string, payload?: any) => handleRequest({ action, token, payload }, ctx, secrets);

  function withAttendance(event: EventItem, members: Partial<Member>[]): string {
    const session = ctx.db.sessions.insert(
      { eventId: event.id, styleId: 'st_popping', seq: 1, date: event.startDate, start: '20:00', end: '22:00', instructorId: '', venue: '', status: 'scheduled', note: '' },
      'admin',
      ctx.now()
    );
    const layout = buildLayout(members.map(m => ({ ...m, memberId: 'M-' + m.matricKey, matricRaw: m.matricKey } as Member)), [session]);
    layout.rows.forEach(r => (r[6] = '/'));
    const ss = drive.createSpreadsheet('Popping Attendance', 'root');
    ss.addSheet('Attendance', []).setValues(1, 1, [layout.keyRow, layout.labelRow, ...layout.rows]);
    ctx.db.attendanceSheets.insert({ eventId: event.id, styleId: 'st_popping', spreadsheetId: ss.id }, 'admin', ctx.now());
    return ss.id;
  }

  function index(m: Partial<Member>, eventIds: string[], lastEventEnd: string) {
    ctx.db.memberIndex.insert(
      { matricKey: m.matricKey!, nameKey: m.fullName!.toLowerCase(), fullName: m.fullName!, eventIds, lastEventEnd },
      'system',
      ctx.now()
    );
  }

  beforeEach(() => {
    drive = new FakeDrive();
    ctx = makeCtx({ drive, now: new Date('2026-10-01T04:00:00Z') });
    registerRoutes(getRetentionRoutes());
    registerRoutes(getAuthRoutes());
    token = signToken(
      { sub: 'admin', role: 'admin', name: 'Admin', exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1, perms: { 'settings.edit': '*' } },
      secrets.tokenSecret,
      secrets.hmac
    );
    oldEvent = seedEvent(ctx, { name: 'SEP 2023 CLASS', startDate: '2023-09-01', endDate: '2023-09-29', sourceSheetId: 'src_old', styleIds: ['st_popping'], members: [OLD] });
    recentEvent = seedEvent(ctx, { name: 'OCT 2023 CLASS', startDate: '2023-10-01', endDate: '2023-10-01', sourceSheetId: 'src_recent', styleIds: ['st_popping'], members: [RECENT] });
    oldAttendanceId = withAttendance(oldEvent, [OLD]);
    withAttendance(recentEvent, [RECENT]);
    index(OLD, [oldEvent.id], '2023-09-29');
    index(RECENT, [recentEvent.id], '2023-10-01');
    ctx.db.memberRoles.insert({ matricKey: '22001111', roleId: 'rol_lead', styleIds: [] }, 'admin', ctx.now());
    ctx.db.auditLog.insert({ ts: '', actor: 'admin', action: 'memberRoles.assign', target: '22001111', detail: 'lead' }, 'admin', ctx.now());
  });

  it('preview lists only dancers past three years and forms whose dancers are all due', () => {
    const res = call('retention.preview');
    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as any;
      expect(data.due).toEqual([{ matricKey: '22001111', fullName: 'Old Dancer', lastEventName: 'SEP 2023 CLASS', lastEventEnd: '2023-09-29' }]);
      expect(data.formsToClean).toEqual([{ eventName: 'SEP 2023 CLASS', sourceSheetId: 'src_old' }]);
    }
  });

  it('apply wipes personal details, keeps ticks, blocks login', () => {
    const res = call('retention.apply', { matricKeys: ['22001111'] });
    expect(res.ok && res.data).toEqual({ wiped: 1 });

    const member = readEventMembers(ctx, oldEvent)[0];
    expect(member.fullName).toBe('Removed dancer');
    expect(member.matricKey).toBe('');
    expect(member.contact).toBe('');
    expect(member.email).toBe('');
    expect(member.memberId).toMatch(/^X-[A-Za-z0-9]{10}$/);

    const att = drive.openSpreadsheet(oldAttendanceId).sheet('Attendance')!.getDisplayValues();
    expect(att[2][0]).toBe(member.memberId);
    expect(att[2][1]).toBe('Removed dancer');
    expect(att[2][2]).toBe('');
    expect(att[2][6]).toBe('/');

    const mi = ctx.db.memberIndex.find(m => m.fullName === '' || m.matricKey === '22001111');
    expect(mi.length).toBe(1);
    expect(mi[0].active).toBe(false);
    expect(mi[0].matricKey).toBe('');
    expect(ctx.db.memberRoles.find(r => r.roleId === 'rol_lead')[0].active).toBe(false);
    expect(ctx.db.auditLog.all().some(a => a.target.includes('22001111') || a.detail.includes('22001111'))).toBe(false);

    const login = handleRequest({ action: 'auth.dancerLogin', payload: { matric: '22001111', fullName: 'Old Dancer' } }, ctx, secrets);
    expect(login.ok).toBe(false);
    if (!login.ok) expect(login.error.code).toBe('NOT_REGISTERED');
  });

  it('apply with a not-due matric wipes nothing', () => {
    const res = call('retention.apply', { matricKeys: ['22002222'] });
    expect(res.ok && res.data).toEqual({ wiped: 0 });
    expect(readEventMembers(ctx, recentEvent)[0].fullName).toBe('Recent Dancer');
  });

  it('an event with a not-due dancer is not listed for form cleanup', () => {
    const mixed = seedEvent(ctx, { name: 'MIXED', endDate: '2023-09-01', sourceSheetId: 'src_mixed', members: [OLD, RECENT] });
    expect(mixed).toBeTruthy();
    const res = call('retention.preview');
    expect(res.ok && (res.data as any).formsToClean.map((f: any) => f.eventName)).toEqual(['SEP 2023 CLASS']);
  });
});
