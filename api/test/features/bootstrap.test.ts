import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { Hmac, signToken } from '../../src/security/tokens';
import { getBootstrapRoutes } from '../../src/features/bootstrap';
import { getAuthRoutes } from '../../src/features/auth';
import { getMemberRoutes } from '../../src/features/members';
import { getAttendanceRoutes } from '../../src/features/attendance';
import { getVideoRoutes } from '../../src/features/videos';
import { getMusicRoutes } from '../../src/features/music';
import { getSessionRoutes } from '../../src/features/sessions';

const nodeHmac: Hmac = (key: string, message: string) => {
  return new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
};

const secrets = {
  tokenSecret: 'test_secret_key_123456789012345678901234567890',
  hmac: nodeHmac
};

describe('Feature: Bootstrap with Caching (features/bootstrap)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let adminToken: string;
  let dancerToken: string;

  beforeEach(() => {
    ctx = makeCtx();
    registerRoutes(getBootstrapRoutes());
    registerRoutes(getAuthRoutes());
    registerRoutes(getMemberRoutes());
    registerRoutes(getAttendanceRoutes());
    registerRoutes(getVideoRoutes());
    registerRoutes(getMusicRoutes());
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
          'sessions.edit': '*',
          'attendance.edit': '*',
          'videos.upload': '*',
          'music.edit': '*'
        }
      },
      secrets.tokenSecret,
      secrets.hmac
    );

    // Seed styles: Popping and Hip Hop
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
        aliases: ['hiphop'],
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

    // Generate sessions for 2026-10
    handleRequest(
      {
        action: 'sessions.generateMonth',
        token: adminToken,
        payload: { month: '2026-10' }
      },
      ctx,
      secrets
    );

    // Import members for 2026-10
    const sourceSs = ctx.drive.createSpreadsheet('Responses', 'root');
    const sheet = sourceSs.getSheet('Sheet1') || sourceSs.addSheet('Sheet1', []);
    sheet.setValues(1, 1, [
      ['Timestamp', 'Full Name', 'Matric Number', 'Phone', 'Email', 'Classes'],
      ['2026-10-01 12:00:00', 'Popper Ali', '22001111', '0123456789', 'p@test.com', 'Popping'],
      ['2026-10-01 12:00:00', 'HipHopper Bob', '22002222', '0123456789', 'h@test.com', 'Hip Hop']
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

    // Add a video for Popping 2026-10
    const popSess = ctx.db.sessions.find(s => s.month === '2026-10' && s.styleId === 'st_popping')[0];
    ctx.db.videos.insert(
      {
        styleId: 'st_popping',
        month: '2026-10',
        sessionId: popSess.id,
        title: 'Popping Class 1 Video',
        driveFileId: 'vid_12345678901234567890',
        mimeType: 'video/mp4',
        sizeBytes: 1000000,
        folderId: 'fld_1',
        uploadedBy: 'admin1',
        source: 'upload'
      },
      'admin1',
      ctx.now()
    );

    // Add music for Popping 2026-10
    ctx.db.music.insert(
      {
        styleId: 'st_popping',
        month: '2026-10',
        sessionId: popSess.id,
        title: 'Popping Song',
        sourceType: 'youtube',
        driveFileId: '',
        youtubeId: 'dQw4w9WgXcQ'
      },
      'admin1',
      ctx.now()
    );

    // Add a video and music for Hip Hop 2026-10
    const hhSess = ctx.db.sessions.find(s => s.month === '2026-10' && s.styleId === 'st_hiphop')[0];
    ctx.db.videos.insert(
      {
        styleId: 'st_hiphop',
        month: '2026-10',
        sessionId: hhSess.id,
        title: 'Hip Hop Video',
        driveFileId: 'vid_hh_1234567890123456',
        mimeType: 'video/mp4',
        sizeBytes: 1000000,
        folderId: 'fld_2',
        uploadedBy: 'admin1',
        source: 'upload'
      },
      'admin1',
      ctx.now()
    );

    // Mark attendance for Popper Ali in session 1
    handleRequest(
      {
        action: 'attendance.mark',
        token: adminToken,
        payload: {
          month: '2026-10',
          styleId: 'st_popping',
          marks: [{ opId: 'op_att_1', sessionId: popSess.id, memberId: 'M-22001111', present: true }]
        }
      },
      ctx,
      secrets
    );

    dancerToken = signToken(
      {
        sub: 'M-22001111',
        role: 'dancer',
        name: 'Popper Ali',
        exp: Math.floor(ctx.now().getTime() / 1000) + 3600,
        pv: 1,
        perms: {
          'calendar.view': ['st_popping'],
          'attendance.view.own': ['st_popping'],
          'videos.view': ['st_popping'],
          'music.view': ['st_popping']
        }
      },
      secrets.tokenSecret,
      secrets.hmac
    );
  });

  it('dancer in Popping 2026-10 gets only Popping sessions/videos/music of 2026-10', () => {
    const res = handleRequest(
      {
        action: 'dancer.bootstrap',
        token: dancerToken
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const b = res.data as any;
      expect(b.profile.matricKey).toBe('22001111');
      expect(b.sessions.every((s: any) => s.styleId === 'st_popping')).toBe(true);
      expect(b.videos.length).toBe(1);
      expect(b.videos[0].title).toBe('Popping Class 1 Video');
      expect(b.music.length).toBe(1);
      expect(b.music[0].title).toBe('Popping Song');
    }
  });

  it('dancer never receives other dancers attendance or any contact/email fields', () => {
    const res = handleRequest(
      {
        action: 'dancer.bootstrap',
        token: dancerToken
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const b = res.data as any;
      // attendance array should have { sessionId, present }
      expect(b.attendance.length).toBeGreaterThan(0);
      for (const item of b.attendance) {
        expect(item.memberId).toBeUndefined();
        expect(item.contact).toBeUndefined();
        expect(item.email).toBeUndefined();
        expect(typeof item.sessionId).toBe('string');
        expect(typeof item.present).toBe('boolean');
      }
      // Popper Ali attended session 1
      const popSess = ctx.db.sessions.find(s => s.month === '2026-10' && s.styleId === 'st_popping')[0];
      const s1Att = b.attendance.find((a: any) => a.sessionId === popSess.id);
      expect(s1Att?.present).toBe(true);
    }
  });

  it('second dancer of the same style hits the chunk cache', () => {
    // Add Popper Two to members
    const sheetRec = ctx.db.memberMonths.find(m => m.month === '2026-10')[0];
    const memSs = ctx.drive.openSpreadsheet(sheetRec.membersSpreadsheetId);
    const memSheet = memSs.sheet('Members') || (memSs as any).getSheet('Members');
    memSheet.appendRows([
      ['M-22003333', 'Popper Two', '22003333', '22003333', 'popper two', '0123456789', 'p2@test.com', 'F', 'Malaysian', 'st_popping', 'Popping', '', '']
    ]);
    ctx.db.memberIndex.insert(
      {
        matricKey: '22003333',
        nameKey: 'popper two',
        fullName: 'Popper Two',
        months: ['2026-10'],
        lastMonth: '2026-10'
      },
      'system',
      ctx.now()
    );

    const dancer2Token = signToken(
      {
        sub: 'M-22003333',
        role: 'dancer',
        name: 'Popper Two',
        exp: Math.floor(ctx.now().getTime() / 1000) + 3600,
        pv: 1,
        perms: {
          'calendar.view': ['st_popping'],
          'attendance.view.own': ['st_popping'],
          'videos.view': ['st_popping'],
          'music.view': ['st_popping']
        }
      },
      secrets.tokenSecret,
      secrets.hmac
    );

    // Call dancer 1 bootstrap to populate chunk cache
    handleRequest({ action: 'dancer.bootstrap', token: dancerToken }, ctx, secrets);

    const dv = Number(ctx.props.get('DATA_VERSION') || 1);
    const chunkKey = `boot:chunk:2026-10:st_popping:${dv}`;
    expect(ctx.cache.get(chunkKey)).toBeTruthy();

    // Now call dancer 2 bootstrap
    const res2 = handleRequest({ action: 'dancer.bootstrap', token: dancer2Token }, ctx, secrets);
    expect(res2.ok).toBe(true);
    if (res2.ok) {
      expect((res2.data as any).videos.length).toBe(1);
    }
  });

  it('sinceVersion equal to dataVersion → { notModified: true }', () => {
    const dv = Number(ctx.props.get('DATA_VERSION') || 1);
    const res = handleRequest(
      {
        action: 'dancer.bootstrap',
        token: dancerToken,
        payload: { sinceVersion: dv }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({ notModified: true });
    }
  });

  it('dancerLogin now returns bootstrap in the same call', () => {
    const res = handleRequest(
      {
        action: 'auth.dancerLogin',
        payload: {
          matric: '22001111',
          fullName: 'Popper Ali'
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as any;
      expect(data.bootstrap).toBeTruthy();
      expect(data.bootstrap.profile.matricKey).toBe('22001111');
      expect(data.bootstrap.sessions.length).toBeGreaterThan(0);
      expect(data.bootstrap.videos.length).toBe(1);
    }
  });

  it('admin.bootstrap returns full AdminBootstrap with settings and roles', () => {
    const res = handleRequest(
      {
        action: 'admin.bootstrap',
        token: adminToken
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const b = res.data as any;
      expect(b.profile.username).toBe('admin1');
      expect(b.styles.length).toBe(2);
      expect(b.months).toContain('2026-10');
      expect(b.settings).toBeDefined();
    }
  });
});
