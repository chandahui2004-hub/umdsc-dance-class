import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { Hmac, signToken } from '../../src/security/tokens';
import { ensureStyleInstructors } from '../../src/features/styleInstructors';
import { seedEvent } from '../fixtures/events';

const nodeHmac: Hmac = (key: string, message: string) =>
  new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
const secrets = { tokenSecret: 'test_secret_key_123456789012345678901234567890', hmac: nodeHmac };

describe('Feature: one-time style-instructor fill-in (features/styleInstructors)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let A: string, B: string, K: string, C: string, L: string, E: string, F: string;
  let sesA1: string, sesA2: string, sesB1: string;

  const style = (name: string, defaultInstructorId: string) =>
    ctx.db.styles.insert(
      { name, aliases: [], colorKey: 'blue', defaultWeekday: null, defaultStart: '20:00', defaultEnd: '22:00',
        defaultInstructorId, defaultVenue: '', attendanceFolderId: '', videoFolderId: '' } as any,
      'system', ctx.now()
    ).id;
  const instructor = (name: string) =>
    ctx.db.instructors.insert({ name, contact: '', styleIds: [] } as any, 'system', ctx.now()).id;
  const session = (eventId: string, styleId: string, seq: number, date: string, instructorId: string) =>
    ctx.db.sessions.insert(
      { eventId, styleId, seq, date, start: '20:00', end: '22:00', instructorId, venue: '', status: 'scheduled', note: '' },
      'system', ctx.now()
    ).id;
  const styleIdsOf = (id: string) => ctx.db.instructors.get(id)!.styleIds;
  const dataVersion = () => Number(ctx.props.get('DATA_VERSION') || 1);

  beforeEach(() => {
    ctx = makeCtx({ styleInstructorsMigrated: false });
    K = instructor('Kelvin');
    C = instructor('Cara');
    L = instructor('Lee');
    A = style('Alpha', K);
    B = style('Beta', C);
    E = seedEvent(ctx, { name: 'EVENT E', styleIds: [A, B] }).id;
    F = seedEvent(ctx, { name: 'EVENT F', styleIds: [A] }).id;
    sesA1 = session(E, A, 1, '2026-10-06', L);
    sesA2 = session(E, A, 2, '2026-10-13', '');
    sesB1 = session(E, B, 1, '2026-10-06', '');
  });

  it('fills instructor styles from style defaults and their classes', () => {
    ensureStyleInstructors(ctx);
    expect(styleIdsOf(K)).toEqual([A]);
    expect(styleIdsOf(C)).toEqual([B]);
    expect(styleIdsOf(L)).toEqual([A]);
  });

  it('fills event lists from classes, else the style default', () => {
    ensureStyleInstructors(ctx);
    // A#2 received K first, so the list is the classes' distinct instructors in date, seq order
    expect(ctx.db.events.get(E)!.styleInstructors).toEqual({ [A]: [L, K], [B]: [C] });
    expect(ctx.db.events.get(F)!.styleInstructors).toEqual({ [A]: [K] });
  });

  it('gives empty classes the style default instructor', () => {
    ensureStyleInstructors(ctx);
    expect(ctx.db.sessions.get(sesA1)!.instructorId).toBe(L);
    expect(ctx.db.sessions.get(sesA2)!.instructorId).toBe(K);
    expect(ctx.db.sessions.get(sesB1)!.instructorId).toBe(C);
  });

  it('never overwrites existing values', () => {
    ctx.db.instructors.update(K, 1, { styleIds: [B] }, 'system', ctx.now());
    ctx.db.events.update(E, 1, { styleInstructors: { [A]: [K] } }, 'system', ctx.now());
    ensureStyleInstructors(ctx);
    expect(styleIdsOf(K)).toEqual([B]);
    expect(ctx.db.events.get(E)!.styleInstructors).toEqual({ [A]: [K] });
  });

  it('second run writes nothing and DATA_VERSION bumps once', () => {
    const before = dataVersion();
    expect(ensureStyleInstructors(ctx)).toBe(true);
    expect(ctx.props.get('STYLE_INSTRUCTORS_V1')).toBe('done');

    let updates = 0;
    for (const t of [ctx.db.sessions, ctx.db.instructors, ctx.db.events] as any[]) {
      const orig = t.update.bind(t);
      t.update = (...args: any[]) => { updates++; return orig(...args); };
    }
    expect(ensureStyleInstructors(ctx)).toBe(false);
    expect(updates).toBe(0);
    expect(dataVersion()).toBe(before + 1);
  });

  it('skips via the property when the cache entry is gone', () => {
    ctx.props.set('STYLE_INSTRUCTORS_V1', 'done');
    expect(ensureStyleInstructors(ctx)).toBe(false);
    expect(ctx.db.sessions.get(sesA2)!.instructorId).toBe('');
    expect(ctx.cache.get('mig:si1')).not.toBeNull();
  });

  it('writes nothing and does not bump DATA_VERSION when there is nothing to fill', () => {
    const empty = makeCtx({ styleInstructorsMigrated: false });
    const before = Number(empty.props.get('DATA_VERSION') || 1);
    expect(ensureStyleInstructors(empty)).toBe(false);
    expect(empty.props.get('STYLE_INSTRUCTORS_V1')).toBe('done');
    expect(Number(empty.props.get('DATA_VERSION') || 1)).toBe(before);
  });

  it('leaves inactive events untouched', () => {
    const inactive = seedEvent(ctx, { name: 'EVENT OLD', styleIds: [A] });
    ctx.db.events.update(inactive.id, 1, { active: false }, 'system', ctx.now());
    ensureStyleInstructors(ctx);
    expect(ctx.db.events.get(inactive.id)!.styleInstructors).toEqual({});
  });

  it('ignores the default instructor of an inactive style', () => {
    const P = instructor('Pat');
    const dead = style('Gamma', P);
    ctx.db.styles.update(dead, 1, { active: false }, 'system', ctx.now());
    const emptyClass = session(E, dead, 1, '2026-10-06', '');
    ensureStyleInstructors(ctx);
    expect(styleIdsOf(P)).toEqual([]);
    expect(ctx.db.sessions.get(emptyClass)!.instructorId).toBe('');
  });

  it('a class taught by a deactivated instructor does not put them in the event list', () => {
    const l = ctx.db.instructors.get(L)!;
    ctx.db.instructors.deactivate(L, l.version, 'system', ctx.now());
    ensureStyleInstructors(ctx);
    expect(ctx.db.events.get(E)!.styleInstructors).toEqual({ [A]: [K], [B]: [C] });
    expect(styleIdsOf(L)).toEqual([]);
  });

  it('a deactivated default instructor is not used', () => {
    const k = ctx.db.instructors.get(K)!;
    ctx.db.instructors.deactivate(K, k.version, 'system', ctx.now());
    ensureStyleInstructors(ctx);
    expect(ctx.db.sessions.get(sesA2)!.instructorId).toBe('');
    expect(ctx.db.events.get(E)!.styleInstructors).toEqual({ [A]: [L], [B]: [C] });
    expect(ctx.db.events.get(F)!.styleInstructors).toEqual({});
    expect(styleIdsOf(K)).toEqual([]);
  });

  it("a class of an inactive style adds nothing to anyone's styles", () => {
    const dead = style('Gamma', '');
    ctx.db.styles.deactivate(dead, 1, 'system', ctx.now());
    const P = instructor('Pat');
    session(E, dead, 1, '2026-10-06', L);
    session(E, dead, 2, '2026-10-13', P);
    ensureStyleInstructors(ctx);
    expect(styleIdsOf(L)).toEqual([A]);
    expect(styleIdsOf(P)).toEqual([]);
  });

  it('a non-BUSY fill-in error does not fail an admin request and leaves the fill-in pending', () => {
    const exp = Math.floor(ctx.now().getTime() / 1000) + 3600;
    const admin = signToken(
      { sub: 'admin1', role: 'admin', name: 'Admin', exp, pv: 1, perms: { 'members.view': '*' } },
      secrets.tokenSecret, secrets.hmac
    );
    const orig = ctx.db.sessions.find.bind(ctx.db.sessions);
    let broken = true;
    (ctx.db.sessions as any).find = (...args: any[]) => {
      if (broken) throw new Error('sheet exploded');
      return (orig as any)(...args);
    };
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = handleRequest({ action: 'events.list', token: admin, payload: {} } as any, ctx, secrets);
      expect(res.ok, JSON.stringify(res)).toBe(true);
      expect(ctx.props.get('STYLE_INSTRUCTORS_V1')).toBeNull();
      expect(errors).toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }

    broken = false;
    handleRequest({ action: 'events.list', token: admin, payload: {} } as any, ctx, secrets);
    expect(ctx.props.get('STYLE_INSTRUCTORS_V1')).toBe('done');
  });

  it('a busy lock does not fail an admin request and leaves the fill-in pending', () => {
    const exp = Math.floor(ctx.now().getTime() / 1000) + 3600;
    const admin = signToken(
      { sub: 'admin1', role: 'admin', name: 'Admin', exp, pv: 1, perms: { 'members.view': '*' } },
      secrets.tokenSecret, secrets.hmac
    );
    ctx.lock.isLocked = true; // another request holds the lock: tryLock fails
    const res = handleRequest({ action: 'events.list', token: admin, payload: {} } as any, ctx, secrets);
    expect(res.ok).toBe(true);
    expect(ctx.props.get('STYLE_INSTRUCTORS_V1')).toBeNull();
    expect(ctx.lock.tryLockCalls).toBeGreaterThan(0);

    ctx.lock.isLocked = false;
    handleRequest({ action: 'events.list', token: admin, payload: {} } as any, ctx, secrets);
    expect(ctx.props.get('STYLE_INSTRUCTORS_V1')).toBe('done');
  });

  it('dancer requests do not trigger it; admin requests do', () => {
    const exp = Math.floor(ctx.now().getTime() / 1000) + 3600;
    const dancer = signToken(
      { sub: 'M-22001111', role: 'dancer', name: 'Dancer D', exp, pv: 1, perms: { 'calendar.view': '*' } },
      secrets.tokenSecret, secrets.hmac
    );
    const admin = signToken(
      { sub: 'admin1', role: 'admin', name: 'Admin', exp, pv: 1, perms: { 'members.view': '*' } },
      secrets.tokenSecret, secrets.hmac
    );
    ctx.db.memberIndex.insert(
      { matricKey: '22001111', nameKey: 'dancer d', fullName: 'Dancer D', eventIds: [E], lastEventEnd: '2026-10-31' },
      'system', ctx.now()
    );
    const r1 = handleRequest({ action: 'dancer.bootstrap', token: dancer, payload: {} } as any, ctx, secrets);
    expect(r1.ok, JSON.stringify(r1)).toBe(true);
    expect(ctx.props.get('STYLE_INSTRUCTORS_V1')).toBeNull();

    const r2 = handleRequest({ action: 'events.list', token: admin, payload: {} } as any, ctx, secrets);
    expect(r2.ok).toBe(true);
    expect(ctx.props.get('STYLE_INSTRUCTORS_V1')).toBe('done');
  });
});
