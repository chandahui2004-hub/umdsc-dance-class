import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { Hmac, signToken } from '../../src/security/tokens';
import { getMemberRoutes } from '../../src/features/members';
import { seedEvent } from '../fixtures/events';
import { EventItem } from '@umdsc/shared';

const nodeHmac: Hmac = (key: string, message: string) => {
  return new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
};

const secrets = {
  tokenSecret: 'test_secret_key_123456789012345678901234567890',
  hmac: nodeHmac
};

describe('Feature: Members (features/members)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let adminToken: string;
  let event: EventItem;

  function call(action: string, payload: any) {
    return handleRequest({ action, token: adminToken, payload }, ctx, secrets);
  }

  beforeEach(() => {
    ctx = makeCtx();
    registerRoutes(getMemberRoutes());
    adminToken = signToken(
      {
        sub: 'admin1', role: 'admin', name: 'Admin', exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1,
        perms: { 'members.view': '*', 'members.import': '*' }
      },
      secrets.tokenSecret,
      secrets.hmac
    );
    event = seedEvent(ctx, {
      styleIds: ['st_popping', 'st_hiphop'],
      members: [
        { matricKey: '22001111', fullName: 'Popper One', contact: '0123456789', styleIds: ['st_popping'] },
        { matricKey: '22002222', fullName: 'Hopper Two', styleIds: ['st_hiphop'] }
      ]
    });
    ctx.db.memberIndex.insert(
      { matricKey: '22001111', nameKey: 'popper one', fullName: 'Popper One', eventIds: [event.id], lastEventEnd: '2026-10-31' },
      'system',
      ctx.now()
    );
  });

  it('members.list returns the event members, optionally filtered by style', () => {
    const all = call('members.list', { eventId: event.id });
    expect(all.ok && (all.data as any[]).map(m => m.fullName)).toEqual(['Popper One', 'Hopper Two']);

    const popping = call('members.list', { eventId: event.id, styleId: 'st_popping' });
    expect(popping.ok && (popping.data as any[]).map(m => m.matricKey)).toEqual(['22001111']);
  });

  it('members.list keeps other events separate', () => {
    const other = seedEvent(ctx, { members: [{ matricKey: '22009999', fullName: 'Other Dancer' }] });
    const res = call('members.list', { eventId: other.id });
    expect(res.ok && (res.data as any[]).map(m => m.fullName)).toEqual(['Other Dancer']);
  });

  it('members.list for an unknown event → NOT_FOUND', () => {
    const res = call('members.list', { eventId: 'evt_missing' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND');
  });

  it('members.update renames in the event Members sheet and in MemberIndex', () => {
    const res = call('members.update', { eventId: event.id, memberId: 'M-22001111', fullName: 'Popper One Bin Ali' });
    expect(res.ok).toBe(true);

    const list = call('members.list', { eventId: event.id });
    expect(list.ok && (list.data as any[])[0].fullName).toBe('Popper One Bin Ali');
    const mi = ctx.db.memberIndex.find(m => m.matricKey === '22001111')[0];
    expect(mi.fullName).toBe('Popper One Bin Ali');
  });

  it('old month-based import actions no longer exist', () => {
    for (const action of ['members.previewImport', 'members.confirmImport', 'members.resync', 'members.autoSync', 'members.importedMonths']) {
      const res = call(action, { month: '2026-10' });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toContain('Unknown action');
    }
  });
});
