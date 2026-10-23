import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { makeCtx } from '../fakes/makeCtx';
import { ensureDancerIsolation } from '../../src/features/dancerIsolation';
import { getAuthRoutes } from '../../src/features/auth';
import { Hmac } from '../../src/security/tokens';

const nodeHmac: Hmac = (key: string, message: string) => {
  return new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
};

const secrets = {
  tokenSecret: 'test_secret_key_123456789012345678901234567890',
  hmac: nodeHmac
};

describe('ensureDancerIsolation', () => {
  it('remaps Testing1 and Testing2 and gives matric 23005147 exclusively to Chan Da Hui', () => {
    const ctx = makeCtx();
    (ctx as any)._secrets = secrets;

    // Seed MemberIndex with the legacy conflict state
    ctx.db.memberIndex.insert(
      {
        id: 'M-23005147',
        matricKey: '23005147',
        nameKey: 'testing1',
        fullName: 'TESTING1',
        eventIds: ['evt_oct'],
        eventStyles: { evt_oct: ['sty_hiphop'] },
        lastEventEnd: '2026-11-06',
        active: true
      } as any,
      'test',
      ctx.now()
    );

    ctx.db.memberIndex.insert(
      {
        id: 'M-23005148',
        matricKey: '23005148',
        nameKey: 'testing2',
        fullName: 'TESTING2',
        eventIds: ['evt_oct'],
        eventStyles: { evt_oct: ['sty_popping'] },
        lastEventEnd: '2026-11-06',
        active: true
      } as any,
      'test',
      ctx.now()
    );

    // Run migration
    const wrote = ensureDancerIsolation(ctx);
    expect(wrote).toBe(true);

    // Verify Testing1 is remapped to TEST9001
    const test1 = ctx.db.memberIndex.find(m => m.fullName === 'TESTING1' && m.active)[0];
    expect(test1).toBeDefined();
    expect(test1.matricKey).toBe('TEST9001');

    // Verify Testing2 is remapped to TEST9002
    const test2 = ctx.db.memberIndex.find(m => m.fullName === 'TESTING2' && m.active)[0];
    expect(test2).toBeDefined();
    expect(test2.matricKey).toBe('TEST9002');

    // Verify Chan Da Hui now exclusively owns 23005147
    const hui = ctx.db.memberIndex.find(m => m.matricKey === '23005147')[0];
    expect(hui).toBeDefined();
    expect(hui.fullName).toBe('Chan Da Hui');
    expect(hui.active).toBe(true);
    expect(hui.eventIds).toContain('evt_oct');

    // Verify Chan Da Hui can log in
    const authRoutes = getAuthRoutes();
    const loginRes = authRoutes['auth.dancerLogin'].handler(ctx, null, {
      fullName: 'chan da hui',
      matric: '23005147'
    }) as any;
    expect(loginRes.token).toBeDefined();
    expect(loginRes.claims.sub).toBe('M-23005147');
    expect(loginRes.claims.name).toBe('Chan Da Hui');

    // Verify Testing1 can log in with TEST9001
    const test1Login = authRoutes['auth.dancerLogin'].handler(ctx, null, {
      fullName: 'TESTING1',
      matric: 'TEST9001'
    }) as any;
    expect(test1Login.token).toBeDefined();
    expect(test1Login.claims.name).toBe('TESTING1');

    // Verify suggestDancers returns Chan Da Hui for 23005147
    const suggestRes = authRoutes['auth.suggestDancers'].handler(ctx, null, {
      type: 'matric',
      query: '23005147'
    }) as any;
    expect(suggestRes.suggestions[0].fullName).toBe('Chan Da Hui');
    expect(suggestRes.suggestions[0].matric).toBe('23005147');

    // Second run should return false (cached/done)
    const secondRun = ensureDancerIsolation(ctx);
    expect(secondRun).toBe(false);
  });
});
