import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { Hmac, signToken } from '../../src/security/tokens';
import { getMemberRoutes } from '../../src/features/members';
import { seedEvent, seedSourceSheet } from '../fixtures/events';
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
    ctx.props.set('ATTENDANCE_MASTER_FOLDER_ID', 'fld_att_master');
    ctx.db.settings.insert({ key: 'defaultAttendanceFolderId', value: 'fld_att_master' }, 'seed', ctx.now());
    const sourceSheetId = seedSourceSheet(ctx, [
      ['Timestamp', 'Full Name', 'Matric', 'Phone', 'Class'],
      ['2026-10-01 10:00:00', 'Popper One', '22001111', '0123456789', 'Popping'],
      ['2026-10-01 10:05:00', 'Hopper Two', '22002222', '0123456788', 'Hip Hop']
    ]);
    event = seedEvent(ctx, {
      sourceSheetId,
      sourceTab: 'Form Responses 1',
      styleIds: ['st_popping', 'st_hiphop'],
      members: [
        { matricKey: '22001111', fullName: 'Popper One', contact: '0123456789', styleIds: ['st_popping'], sourceTimestamp: '2026-10-01 10:00:00' },
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

  it('old import and edit actions no longer exist (edits go through the form sheet: members.edit)', () => {
    for (const action of ['members.previewImport', 'members.confirmImport', 'members.resync', 'members.autoSync', 'members.importedMonths', 'members.update']) {
      const res = call(action, { month: '2026-10' });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toContain('Unknown action');
    }
  });

  describe('members.selfEdit', () => {
    it('allows a dancer to update their own name and matric, updating form, index, and token', () => {
      const dancerToken = signToken(
        {
          sub: 'M-22001111', role: 'dancer', name: 'Popper One', exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1,
          perms: { 'calendar.view': '*' }
        },
        secrets.tokenSecret,
        secrets.hmac
      );

      const res = handleRequest(
        {
          action: 'members.selfEdit',
          token: dancerToken,
          payload: { fullName: 'Popper Master', matric: '22008888' }
        },
        ctx,
        secrets
      );

      expect(res.ok).toBe(true);
      if (res.ok) {
        const data = res.data as any;
        expect(data.token).toBeTruthy();
        expect(data.claims.sub).toBe('M-22008888');
        expect(data.claims.name).toBe('Popper Master');

        // Verify MemberIndex updated
        const updatedIndex = ctx.db.memberIndex.find(m => m.matricKey === '22008888')[0];
        expect(updatedIndex).toBeTruthy();
        expect(updatedIndex.fullName).toBe('Popper Master');

        // Verify old index entry no longer maps to this event or is moved
        const oldIndex = ctx.db.memberIndex.find(m => m.matricKey === '22001111')[0];
        expect(oldIndex?.eventIds.includes(event.id)).toBeFalsy();

        // Verify admin mode (members.list) sees the updated dancer name and matric
        const adminList = handleRequest(
          { action: 'members.list', token: adminToken, payload: { eventId: event.id } },
          ctx,
          secrets
        );
        expect(adminList.ok).toBe(true);
        if (adminList.ok) {
          const members = adminList.data as any[];
          const newMember = members.find(m => m.matricKey === '22008888');
          expect(newMember).toBeTruthy();
          expect(newMember.fullName).toBe('Popper Master');
          const oldMember = members.find(m => m.matricKey === '22001111');
          expect(oldMember).toBeFalsy();
        }
      }
    });

    it('rejects taking a matric number already belonging to another dancer', () => {
      ctx.db.memberIndex.insert(
        { matricKey: '22002222', nameKey: 'hopper two', fullName: 'Hopper Two', eventIds: [event.id], lastEventEnd: '2026-10-31' },
        'system',
        ctx.now()
      );

      const dancerToken = signToken(
        {
          sub: 'M-22001111', role: 'dancer', name: 'Popper One', exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1,
          perms: { 'calendar.view': '*' }
        },
        secrets.tokenSecret,
        secrets.hmac
      );

      const res = handleRequest(
        {
          action: 'members.selfEdit',
          token: dancerToken,
          payload: { matric: '22002222' }
        },
        ctx,
        secrets
      );

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('VALIDATION');
        expect(res.error.message).toContain('already belongs to');
      }
    });

    it('rejects empty name', () => {
      const dancerToken = signToken(
        {
          sub: 'M-22001111', role: 'dancer', name: 'Popper One', exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1,
          perms: { 'calendar.view': '*' }
        },
        secrets.tokenSecret,
        secrets.hmac
      );

      const res = handleRequest(
        {
          action: 'members.selfEdit',
          token: dancerToken,
          payload: { fullName: '   ' }
        },
        ctx,
        secrets
      );

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('VALIDATION');
        expect(res.error.message).toContain('Name cannot be empty');
      }
    });
  });
});

