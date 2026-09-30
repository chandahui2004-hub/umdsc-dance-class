import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { Hmac, signToken } from '../../src/security/tokens';
import { getSessionRoutes, onSessionChanged } from '../../src/features/sessions';
import { seedEvent } from '../fixtures/events';
import { ClassSession, EventItem } from '@umdsc/shared';

const nodeHmac: Hmac = (key: string, message: string) => {
  return new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
};

const secrets = {
  tokenSecret: 'test_secret_key_123456789012345678901234567890',
  hmac: nodeHmac
};

function addSession(ctx: ReturnType<typeof makeCtx>, eventId: string, styleId: string, seq: number, date: string): ClassSession {
  return ctx.db.sessions.insert(
    { eventId, styleId, seq, date, start: '20:00', end: '22:00', instructorId: '', venue: 'Studio', status: 'scheduled', note: '' },
    'admin1',
    ctx.now()
  );
}

describe('Feature: Class Sessions (features/sessions)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let adminToken: string;
  let dancerToken: string;
  let event: EventItem;

  function makeToken(role: 'admin' | 'dancer', sub: string, perms: any) {
    return signToken(
      { sub, role, name: sub, exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1, perms },
      secrets.tokenSecret,
      secrets.hmac
    );
  }

  beforeEach(() => {
    ctx = makeCtx();
    registerRoutes(getSessionRoutes());
    adminToken = makeToken('admin', 'admin1', { 'sessions.edit': '*', 'calendar.view': '*' });
    dancerToken = makeToken('dancer', 'M-22003949', { 'calendar.view': '*' });
    event = seedEvent(ctx, { styleIds: ['st_popping', 'st_hiphop'] });
  });

  function call(action: string, payload: any, token = adminToken) {
    return handleRequest({ action, token, payload }, ctx, secrets);
  }

  it('sessions.update keeps id and seq when date changes', () => {
    const session = addSession(ctx, event.id, 'st_popping', 1, '2026-10-06');

    let changedEvent: any = null;
    onSessionChanged((_ctx, s) => {
      changedEvent = s;
    });

    const res = call('sessions.update', { id: session.id, version: session.version, date: '2026-10-07', venue: 'Studio Main' });

    expect(res.ok).toBe(true);
    if (res.ok) {
      const updated = res.data as any;
      expect(updated.id).toBe(session.id);
      expect(updated.seq).toBe(1);
      expect(updated.date).toBe('2026-10-07');
      expect(updated.venue).toBe('Studio Main');
      expect(changedEvent.id).toBe(session.id);
    }
  });

  it('sessions.list for a dancer returns only their events and styles', () => {
    const dancerEvent = seedEvent(ctx, {
      styleIds: ['st_popping', 'st_hiphop'],
      members: [{ matricKey: '22003949', fullName: 'Dancer One', styleIds: ['st_popping'] }]
    });
    addSession(ctx, dancerEvent.id, 'st_popping', 1, '2026-10-06');
    addSession(ctx, dancerEvent.id, 'st_hiphop', 1, '2026-10-08');
    addSession(ctx, event.id, 'st_popping', 1, '2026-10-06');
    ctx.db.memberIndex.insert(
      { matricKey: '22003949', nameKey: 'dancer one', fullName: 'Dancer One', eventIds: [dancerEvent.id], lastEventEnd: '2026-10-31' },
      'system',
      ctx.now()
    );

    const res = call('sessions.list', { eventId: dancerEvent.id }, dancerToken);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const list = res.data as ClassSession[];
      expect(list.length).toBe(1);
      expect(list[0].styleId).toBe('st_popping');
    }

    const other = call('sessions.list', { eventId: event.id }, dancerToken);
    expect(other.ok && (other.data as any[]).length).toBe(0);
  });

  it('sessions.list with styleId returns only that style', () => {
    addSession(ctx, event.id, 'st_popping', 1, '2026-10-06');
    addSession(ctx, event.id, 'st_hiphop', 1, '2026-10-08');
    addSession(ctx, event.id, 'st_hiphop', 2, '2026-10-15');

    const res = call('sessions.list', { eventId: event.id, styleId: 'st_hiphop' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const list = res.data as ClassSession[];
      expect(list.length).toBe(2);
      expect(list.every(s => s.styleId === 'st_hiphop')).toBe(true);
    }
  });

  it('two overlapping events keep separate classes', () => {
    const other = seedEvent(ctx, { styleIds: ['st_popping'] });
    addSession(ctx, event.id, 'st_popping', 1, '2026-10-06');
    addSession(ctx, other.id, 'st_popping', 1, '2026-10-06');

    const res = call('sessions.list', { eventId: event.id });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const list = res.data as ClassSession[];
      expect(list.length).toBe(1);
      expect(list[0].eventId).toBe(event.id);
    }

    const allRes = call('sessions.list', { eventId: 'ALL' });
    expect(allRes.ok).toBe(true);
    if (allRes.ok) {
      const allList = allRes.data as ClassSession[];
      expect(allList.length).toBe(2);
    }
  });

  it("sessions.today lists only today's classes in active events, in KL time (Review Focus 3)", () => {
    ctx = makeCtx({ now: new Date('2026-10-08T16:30:00Z') });
    registerRoutes(getSessionRoutes());
    adminToken = makeToken('admin', 'admin1', { 'sessions.edit': '*', 'calendar.view': '*' });
    const e1 = seedEvent(ctx, { name: 'OCT MONTHLY CLASS', styleIds: ['st_popping'] });
    const e2 = seedEvent(ctx, { name: 'OLD WORKSHOP', styleIds: ['st_popping'], status: 'archived' });
    addSession(ctx, e1.id, 'st_popping', 2, '2026-10-09');
    addSession(ctx, e1.id, 'st_popping', 1, '2026-10-08');
    addSession(ctx, e2.id, 'st_popping', 1, '2026-10-09');

    const res = call('sessions.today', {});
    expect(res.ok).toBe(true);
    if (res.ok) {
      const list = res.data as any[];
      expect(list.length).toBe(1);
      expect(list[0].date).toBe('2026-10-09');
      expect(list[0].eventName).toBe('OCT MONTHLY CLASS');
    }
  });

  it('create rejects a date outside the event', () => {
    const res = call('sessions.create', {
      eventId: event.id, styleId: 'st_popping', seq: 1, date: '2026-11-02', start: '20:00', end: '22:00'
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain('Class date must be inside the event (2026-10-01 to 2026-10-31)');
    }
  });

  it('create rejects an unknown event', () => {
    const res = call('sessions.create', {
      eventId: 'evt_missing', styleId: 'st_popping', seq: 1, date: '2026-10-02', start: '20:00', end: '22:00'
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND');
  });

  it('sessions.cancel sets status to cancelled', () => {
    const session = addSession(ctx, event.id, 'st_popping', 1, '2026-10-06');
    const res = call('sessions.cancel', { id: session.id, version: session.version });
    expect(res.ok).toBe(true);
    if (res.ok) expect((res.data as any).status).toBe('cancelled');
  });

  it('sessions.delete removes the class from sessions.list', () => {
    const session = addSession(ctx, event.id, 'st_popping', 1, '2026-10-30');
    const res = call('sessions.delete', { id: session.id, version: session.version });
    expect(res.ok).toBe(true);

    const list = call('sessions.list', { eventId: event.id });
    expect(list.ok && (list.data as any[]).length).toBe(0);
  });

  it('sessions.batchUpsert creates and updates classes by event, style and seq', () => {
    const res = call('sessions.batchUpsert', {
      sessions: [
        { eventId: event.id, styleId: 'st_locking', seq: 1, date: '2026-10-05', start: '19:30', end: '21:30', venue: 'Studio 1' },
        { eventId: event.id, styleId: 'st_locking', seq: 2, date: '2026-10-12', start: '19:30', end: '21:30', venue: 'Studio 1' },
        { eventId: event.id, styleId: 'st_popping', seq: 1, date: '2026-10-07', start: '20:00', end: '22:00', venue: 'Studio 2' }
      ]
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as any;
      expect(data.sessions.length).toBe(3);
      expect(data.sessions[0].start).toBe('19:30');
    }

    const again = call('sessions.batchUpsert', {
      sessions: [{ eventId: event.id, styleId: 'st_locking', seq: 1, date: '2026-10-06', start: '19:30', end: '21:30' }]
    });
    expect(again.ok).toBe(true);
    const locking = ctx.db.sessions.find(s => s.eventId === event.id && s.styleId === 'st_locking' && s.active);
    expect(locking.length).toBe(2);
    expect(locking.find(s => s.seq === 1)!.date).toBe('2026-10-06');
  });

  it('batchUpsert keeps instructor and note, and adds a class dated before existing ones (review #1)', () => {
    const existing = ctx.db.sessions.insert(
      { eventId: event.id, styleId: 'st_popping', seq: 1, date: '2026-10-13', start: '20:00', end: '22:00', instructorId: 'ins_1', venue: 'Studio', status: 'scheduled', note: 'bring shoes' },
      'admin1',
      ctx.now()
    );

    // Exactly what the event wizard sends after adding 6 Oct before the 13 Oct class
    const res = call('sessions.batchUpsert', {
      sessions: [
        { eventId: event.id, styleId: 'st_popping', seq: 1, date: '2026-10-06', start: '20:00', end: '22:00', venue: '', status: 'scheduled' },
        { id: existing.id, eventId: event.id, styleId: 'st_popping', seq: 2, date: '2026-10-13', start: '20:00', end: '22:00', venue: 'Studio', status: 'scheduled' }
      ]
    });

    expect(res.ok).toBe(true);
    const active = ctx.db.sessions.find(s => s.eventId === event.id && s.active).sort((a, b) => a.date.localeCompare(b.date));
    expect(active.map(s => [s.date, s.seq])).toEqual([['2026-10-06', 1], ['2026-10-13', 2]]);
    const kept = ctx.db.sessions.get(existing.id)!;
    expect(kept.instructorId).toBe('ins_1');
    expect(kept.note).toBe('bring shoes');
  });

  it('sessions.batchUpsert rejects a date outside the event', () => {
    const res = call('sessions.batchUpsert', {
      sessions: [{ eventId: event.id, styleId: 'st_locking', seq: 1, date: '2026-12-01', start: '19:30', end: '21:30' }]
    });
    expect(res.ok).toBe(false);
  });
});
