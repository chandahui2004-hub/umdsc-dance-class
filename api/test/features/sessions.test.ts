import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { Hmac, signToken } from '../../src/security/tokens';
import { getSessionRoutes, onSessionChanged } from '../../src/features/sessions';

const nodeHmac: Hmac = (key: string, message: string) => {
  return new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
};

const secrets = {
  tokenSecret: 'test_secret_key_123456789012345678901234567890',
  hmac: nodeHmac
};

describe('Feature: Class Sessions (features/sessions)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let adminToken: string;
  let dancerToken: string;

  beforeEach(() => {
    ctx = makeCtx();
    registerRoutes(getSessionRoutes());

    adminToken = signToken(
      {
        sub: 'admin1',
        role: 'admin',
        name: 'Admin One',
        exp: Math.floor(ctx.now().getTime() / 1000) + 3600,
        pv: 1,
        perms: { 'sessions.edit': '*', 'calendar.view': '*' }
      },
      secrets.tokenSecret,
      secrets.hmac
    );

    dancerToken = signToken(
      {
        sub: 'M-22003949',
        role: 'dancer',
        name: 'Dancer One',
        exp: Math.floor(ctx.now().getTime() / 1000) + 3600,
        pv: 1,
        perms: { 'calendar.view': '*' }
      },
      secrets.tokenSecret,
      secrets.hmac
    );

    // Seed DanceStyles
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
  });

  it('sessions.generateMonth creates sessions and skips already generated styles', () => {
    const res = handleRequest(
      {
        action: 'sessions.generateMonth',
        token: adminToken,
        payload: {
          month: '2026-10'
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);

    const sessions = ctx.db.sessions.find(s => s.month === '2026-10' && s.active);
    // 4 for Popping (Tuesdays) + 5 for Hip Hop (Thursdays) = 9
    expect(sessions.length).toBe(9);

    // Running again should skip because styles already have sessions
    const res2 = handleRequest(
      {
        action: 'sessions.generateMonth',
        token: adminToken,
        payload: {
          month: '2026-10'
        }
      },
      ctx,
      secrets
    );
    expect(res2.ok).toBe(true);
    const sessions2 = ctx.db.sessions.find(s => s.month === '2026-10' && s.active);
    expect(sessions2.length).toBe(9);
  });

  it('sessions.update keeps id and seq when date changes', () => {
    const session = ctx.db.sessions.insert(
      {
        month: '2026-10',
        styleId: 'st_popping',
        seq: 1,
        date: '2026-10-06',
        start: '20:00',
        end: '22:00',
        instructorId: '',
        venue: 'Studio A',
        status: 'scheduled',
        note: ''
      },
      'admin1',
      ctx.now()
    );

    let changedEvent: any = null;
    onSessionChanged((_ctx, s) => {
      changedEvent = s;
    });

    const res = handleRequest(
      {
        action: 'sessions.update',
        token: adminToken,
        payload: {
          id: session.id,
          version: session.version,
          date: '2026-10-07', // moved date
          venue: 'Studio Main'
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const updated = res.data as any;
      expect(updated.id).toBe(session.id);
      expect(updated.seq).toBe(1);
      expect(updated.date).toBe('2026-10-07');
      expect(updated.venue).toBe('Studio Main');
      expect(changedEvent).not.toBeNull();
      expect(changedEvent.id).toBe(session.id);
    }
  });

  it('sessions.list for a dancer returns only sessions of their styles and months', () => {
    // Generate sessions for Popping & Hip Hop
    handleRequest(
      {
        action: 'sessions.generateMonth',
        token: adminToken,
        payload: { month: '2026-10' }
      },
      ctx,
      secrets
    );

    // Register dancer only for 2026-10 and Popping
    ctx.db.memberIndex.insert(
      {
        matricKey: '22003949',
        nameKey: 'dancer one',
        fullName: 'Dancer One',
        months: ['2026-10'],
        lastMonth: '2026-10'
      },
      'system',
      ctx.now()
    );

    // Scoped role / members sheet with style 'st_popping'
    ctx.db.memberRoles.insert(
      {
        matricKey: '22003949',
        roleId: 'role_dancer',
        styleIds: ['st_popping']
      },
      'system',
      ctx.now()
    );

    const res = handleRequest(
      {
        action: 'sessions.list',
        token: dancerToken,
        payload: { month: '2026-10' }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const list = res.data as any[];
      // Should only contain popping sessions (4), none of Hip Hop
      expect(list.length).toBe(4);
      expect(list.every(s => s.styleId === 'st_popping')).toBe(true);
    }

    // Checking another month dancer is not registered for returns []
    const resOtherMonth = handleRequest(
      {
        action: 'sessions.list',
        token: dancerToken,
        payload: { month: '2026-11' }
      },
      ctx,
      secrets
    );

    expect(resOtherMonth.ok).toBe(true);
    if (resOtherMonth.ok) {
      expect((resOtherMonth.data as any[]).length).toBe(0);
    }
  });

  it('sessions.cancel sets status to cancelled', () => {
    const session = ctx.db.sessions.insert(
      {
        month: '2026-10',
        styleId: 'st_popping',
        seq: 1,
        date: '2026-10-06',
        start: '20:00',
        end: '22:00',
        instructorId: '',
        venue: 'Studio A',
        status: 'scheduled',
        note: ''
      },
      'admin1',
      ctx.now()
    );

    const res = handleRequest(
      {
        action: 'sessions.cancel',
        token: adminToken,
        payload: {
          id: session.id,
          version: session.version
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const cancelled = res.data as any;
      expect(cancelled.status).toBe('cancelled');
    }
  });

  it('sessions.list with styleId returns only that style', () => {
    handleRequest(
      { action: 'sessions.generateMonth', token: adminToken, payload: { month: '2026-10' } },
      ctx,
      secrets
    );

    const res = handleRequest(
      { action: 'sessions.list', token: adminToken, payload: { month: '2026-10', styleId: 'st_hiphop' } },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const list = res.data as any[];
      expect(list.length).toBe(5);
      expect(list.every(s => s.styleId === 'st_hiphop')).toBe(true);
    }
  });

  it('sessions.delete removes the class from sessions.list', () => {
    const session = ctx.db.sessions.insert(
      {
        month: '2026-09',
        styleId: 'st_popping',
        seq: 1,
        date: '2026-09-30',
        start: '20:00',
        end: '22:00',
        instructorId: '',
        venue: '',
        status: 'scheduled',
        note: ''
      },
      'admin1',
      ctx.now()
    );

    const res = handleRequest(
      { action: 'sessions.delete', token: adminToken, payload: { id: session.id, version: session.version } },
      ctx,
      secrets
    );
    expect(res.ok).toBe(true);

    const list = handleRequest(
      { action: 'sessions.list', token: adminToken, payload: { month: '2026-09' } },
      ctx,
      secrets
    );
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect((list.data as any[]).length).toBe(0);
    }
  });

  it('sessions.batchUpsert creates and updates class sessions across styles and custom dates', () => {
    const res = handleRequest(
      {
        action: 'sessions.batchUpsert',
        token: adminToken,
        payload: {
          sessions: [
            {
              month: '2026-10',
              styleId: 'st_locking',
              seq: 1,
              date: '2026-10-05',
              start: '19:30',
              end: '21:30',
              venue: 'Studio 1'
            },
            {
              month: '2026-10',
              styleId: 'st_locking',
              seq: 2,
              date: '2026-10-12',
              start: '19:30',
              end: '21:30',
              venue: 'Studio 1'
            },
            {
              month: '2026-10',
              styleId: 'st_popping',
              seq: 1,
              date: '2026-10-07',
              start: '20:00',
              end: '22:00',
              venue: 'Studio 2'
            }
          ]
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as any;
      expect(data.sessions.length).toBe(3);
      expect(data.sessions[0].date).toBe('2026-10-05');
      expect(data.sessions[0].start).toBe('19:30');
    }

    const lockingSessions = ctx.db.sessions.find(s => s.month === '2026-10' && s.styleId === 'st_locking' && s.active);
    expect(lockingSessions.length).toBe(2);
    expect(lockingSessions[0].date).toBe('2026-10-05');
  });
});
