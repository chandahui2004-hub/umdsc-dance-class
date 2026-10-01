import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { Hmac, signToken } from '../../src/security/tokens';
import { getBootstrapRoutes } from '../../src/features/bootstrap';
import { getAuthRoutes } from '../../src/features/auth';
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

const POPPER: Partial<Member> = { matricKey: '22001111', fullName: 'Popper Ali', styleIds: ['st_popping'], styleNames: ['Popping'] };
const HIPHOPPER: Partial<Member> = { matricKey: '22002222', fullName: 'HipHopper Bob', styleIds: ['st_hiphop'], styleNames: ['Hip Hop'] };

describe('Feature: Bootstrap with Caching (features/bootstrap)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let adminToken: string;
  let dancerToken: string;
  let event: EventItem;
  let popSess: ClassSession;

  function dancerTokenFor(matricKey: string, name: string) {
    return signToken(
      {
        sub: 'M-' + matricKey, role: 'dancer', name,
        exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1,
        perms: { 'calendar.view': '*', 'attendance.view.own': '*', 'videos.view': '*', 'music.view': '*' }
      },
      secrets.tokenSecret,
      secrets.hmac
    );
  }

  function addIndex(matricKey: string, fullName: string, eventIds: string[]) {
    ctx.db.memberIndex.insert(
      { matricKey, nameKey: fullName.toLowerCase(), fullName, eventIds, lastEventEnd: '2026-10-31' },
      'system',
      ctx.now()
    );
  }

  beforeEach(() => {
    ctx = makeCtx();
    registerRoutes(getBootstrapRoutes());
    registerRoutes(getAuthRoutes());

    adminToken = signToken(
      { sub: 'admin1', role: 'admin', name: 'Admin One', exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1, perms: {} },
      secrets.tokenSecret,
      secrets.hmac
    );

    for (const [id, name] of [['st_popping', 'Popping'], ['st_hiphop', 'Hip Hop']]) {
      ctx.db.styles.insert(
        { id, name, aliases: [name.toLowerCase()], colorKey: 'blue', defaultWeekday: null, defaultStart: '20:00', defaultEnd: '22:00',
          defaultInstructorId: '', defaultVenue: '', attendanceFolderId: '', videoFolderId: '' } as any,
        'system',
        ctx.now()
      );
    }

    event = seedEvent(ctx, { name: 'OCT MONTHLY CLASS', styleIds: ['st_popping', 'st_hiphop'], members: [POPPER, HIPHOPPER] });
    popSess = ctx.db.sessions.insert(
      { eventId: event.id, styleId: 'st_popping', seq: 1, date: '2026-10-06', start: '20:00', end: '22:00', instructorId: '', venue: '', status: 'scheduled', note: '' },
      'admin1', ctx.now()
    );
    const hhSess = ctx.db.sessions.insert(
      { eventId: event.id, styleId: 'st_hiphop', seq: 1, date: '2026-10-08', start: '20:00', end: '22:00', instructorId: '', venue: '', status: 'scheduled', note: '' },
      'admin1', ctx.now()
    );

    // Popping attendance sheet with Popper Ali present in class 1
    const att = ctx.drive.createSpreadsheet('Popping Attendance', 'root');
    const layout = buildLayout([{ ...POPPER, memberId: 'M-22001111', matricRaw: '22001111' } as Member], [popSess]);
    layout.rows[0][6] = '/';
    att.addSheet('Attendance', []).setValues(1, 1, [layout.keyRow, layout.labelRow, ...layout.rows]);
    ctx.db.attendanceSheets.insert({ eventId: event.id, styleId: 'st_popping', spreadsheetId: att.id }, 'system', ctx.now());

    ctx.db.videos.insert(
      { styleId: 'st_popping', eventId: event.id, sessionId: popSess.id, title: 'Popping Class 1 Video', driveFileId: 'vid_1',
        mimeType: 'video/mp4', sizeBytes: 1, folderId: 'fld_1', uploadedBy: 'admin1', source: 'upload' },
      'admin1', ctx.now()
    );
    ctx.db.music.insert(
      { styleId: 'st_popping', eventId: event.id, sessionId: popSess.id, title: 'Popping Song', sourceType: 'youtube', driveFileId: '', youtubeId: 'dQw4w9WgXcQ' },
      'admin1', ctx.now()
    );
    ctx.db.videos.insert(
      { styleId: 'st_hiphop', eventId: event.id, sessionId: hhSess.id, title: 'Hip Hop Video', driveFileId: 'vid_2',
        mimeType: 'video/mp4', sizeBytes: 1, folderId: 'fld_2', uploadedBy: 'admin1', source: 'upload' },
      'admin1', ctx.now()
    );

    addIndex('22001111', 'Popper Ali', [event.id]);
    addIndex('22002222', 'HipHopper Bob', [event.id]);
    dancerToken = dancerTokenFor('22001111', 'Popper Ali');
  });

  it('dancer in Popping gets only Popping sessions, videos and music of their event', () => {
    const res = handleRequest({ action: 'dancer.bootstrap', token: dancerToken }, ctx, secrets);

    expect(res.ok).toBe(true);
    if (res.ok) {
      const b = res.data as any;
      expect(b.profile.matricKey).toBe('22001111');
      expect(b.profile.eventIds).toEqual([event.id]);
      expect(b.sessions.length).toBe(1);
      expect(b.sessions.every((s: any) => s.styleId === 'st_popping')).toBe(true);
      expect(b.videos.map((v: any) => v.title)).toEqual(['Popping Class 1 Video']);
      expect(b.music.map((m: any) => m.title)).toEqual(['Popping Song']);
      expect(b.events.map((e: any) => e.name)).toEqual(['OCT MONTHLY CLASS']);
    }
  });

  it('dancer never receives other dancers attendance or any contact/email fields', () => {
    const res = handleRequest({ action: 'dancer.bootstrap', token: dancerToken }, ctx, secrets);

    expect(res.ok).toBe(true);
    if (res.ok) {
      const b = res.data as any;
      expect(b.attendance.length).toBe(1);
      expect(b.attendance[0]).toEqual({ sessionId: popSess.id, present: true });
    }
  });

  it('dancer sees archived events they registered for', () => {
    const archived = seedEvent(ctx, { name: 'OLD WORKSHOP', status: 'archived', styleIds: ['st_popping'], members: [POPPER] });
    ctx.db.sessions.insert(
      { eventId: archived.id, styleId: 'st_popping', seq: 1, date: '2026-10-20', start: '20:00', end: '22:00', instructorId: '', venue: '', status: 'scheduled', note: '' },
      'admin1', ctx.now()
    );
    const mi = ctx.db.memberIndex.find(m => m.matricKey === '22001111')[0];
    ctx.db.memberIndex.update(mi.id, mi.version, { eventIds: [event.id, archived.id] }, 'system', ctx.now());
    ctx.cache.remove('mi:22001111');

    const res = handleRequest({ action: 'dancer.bootstrap', token: dancerToken }, ctx, secrets);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const b = res.data as any;
      expect(b.events.map((e: any) => e.name).sort()).toEqual(['OCT MONTHLY CLASS', 'OLD WORKSHOP']);
      expect(b.events.find((e: any) => e.name === 'OLD WORKSHOP').status).toBe('archived');
      expect(b.sessions.length).toBe(2);
    }
  });

  it('second dancer of the same style hits the chunk cache', () => {
    handleRequest({ action: 'dancer.bootstrap', token: dancerToken }, ctx, secrets);
    const dv = Number(ctx.props.get('DATA_VERSION') || 1);
    expect(ctx.cache.get(`boot:chunk:${event.id}:st_popping:${dv}`)).toBeTruthy();
  });

  it('sinceVersion equal to dataVersion → { notModified: true }', () => {
    const dv = Number(ctx.props.get('DATA_VERSION') || 1);
    const res = handleRequest({ action: 'dancer.bootstrap', token: dancerToken, payload: { sinceVersion: dv } }, ctx, secrets);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ notModified: true });
  });

  it('dancerLogin returns bootstrap in the same call', () => {
    const res = handleRequest({ action: 'auth.dancerLogin', payload: { matric: '22001111', fullName: 'Popper Ali' } }, ctx, secrets);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as any;
      expect(data.bootstrap.profile.matricKey).toBe('22001111');
      expect(data.bootstrap.videos.length).toBe(1);
    }
  });

  it('caches event members sheet across bootstrap calls', () => {
    handleRequest({ action: 'dancer.bootstrap', token: dancerToken }, ctx, secrets);
    const cachedMembers = ctx.cache.get(`evt:members:${event.id}:${event.membersSpreadsheetId}`);
    expect(cachedMembers).toBeTruthy();
    expect(JSON.parse(cachedMembers!).length).toBe(2);
  });

  it('caches attendance grid across bootstrap calls', () => {
    handleRequest({ action: 'dancer.bootstrap', token: dancerToken }, ctx, secrets);
    const cachedAtt = ctx.cache.get(`att:${event.id}:st_popping:1`);
    expect(cachedAtt).toBeTruthy();
    const parsed = JSON.parse(cachedAtt!);
    expect(parsed.present['M-22001111']).toEqual([popSess.id]);
  });

  it('caches dancer bootstrap across bootstrap calls', () => {
    handleRequest({ action: 'dancer.bootstrap', token: dancerToken }, ctx, secrets);
    const dv = Number(ctx.props.get('DATA_VERSION') || 1);
    const cachedBoot = ctx.cache.get(`boot:dancer:22001111:${dv}`);
    expect(cachedBoot).toBeTruthy();
    const parsed = JSON.parse(cachedBoot!);
    expect(parsed.profile.matricKey).toBe('22001111');
  });

  it('admin.bootstrap returns events instead of months', () => {
    const res = handleRequest({ action: 'admin.bootstrap', token: adminToken }, ctx, secrets);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const b = res.data as any;
      expect(b.profile.username).toBe('admin1');
      expect(b.styles.length).toBe(2);
      expect(b.events.map((e: any) => e.name)).toEqual(['OCT MONTHLY CLASS']);
      expect(b.months).toBeUndefined();
      expect(b.settings).toBeDefined();
    }
  });
});
