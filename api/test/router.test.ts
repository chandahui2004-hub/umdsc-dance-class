import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes, ROUTES } from '../src/router';
import { makeCtx } from './fakes/makeCtx';
import { signToken, Hmac } from '../src/security/tokens';

import { TokenClaims } from '@umdsc/shared';

const nodeHmac: Hmac = (key: string, message: string) => {
  return new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
};

const secrets = {
  tokenSecret: 'test_secret_key_123456789012345678901234567890',
  hmac: nodeHmac
};

describe('Router', () => {
  it('unknown action → VALIDATION', () => {
    const ctx = makeCtx();
    const res = handleRequest({ action: 'nonexistent.action' }, ctx, secrets);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('VALIDATION');
    }
  });

  it('protected action without token → UNAUTHORIZED; with dancer token lacking perm → FORBIDDEN', () => {
    const ctx = makeCtx();
    registerRoutes({
      'test.adminOnly': {
        perm: 'admins.manage',
        write: false,
        handler: () => ({ success: true })
      }
    });

    // 1. Without token
    const resNoToken = handleRequest({ action: 'test.adminOnly' }, ctx, secrets);
    expect(resNoToken.ok).toBe(false);
    if (!resNoToken.ok) {
      expect(resNoToken.error.code).toBe('UNAUTHORIZED');
    }

    // 2. With dancer token lacking perm
    const dancerClaims: TokenClaims = {
      sub: 'M-22003949',
      role: 'dancer',
      name: 'Dancer 1',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: { 'calendar.view': '*' }
    };
    const dancerToken = signToken(dancerClaims, secrets.tokenSecret, secrets.hmac);

    const resForbidden = handleRequest(
      { action: 'test.adminOnly', token: dancerToken },
      ctx,
      secrets
    );
    expect(resForbidden.ok).toBe(false);
    if (!resForbidden.ok) {
      expect(resForbidden.error.code).toBe('FORBIDDEN');
    }
  });

  it('style-scoped perm: attendance.mark for popping allowed, for latin FORBIDDEN', () => {
    const ctx = makeCtx();
    registerRoutes({
      'attendance.mark': {
        perm: 'attendance.edit',
        write: true,
        styleOf: (p: any) => p?.styleId,
        handler: () => ({ marked: true })
      }
    });

    const leadClaims: TokenClaims = {
      sub: 'M-12345678',
      role: 'dancer',
      name: 'Popping Lead',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: { 'attendance.edit': ['popping'] }
    };
    const leadToken = signToken(leadClaims, secrets.tokenSecret, secrets.hmac);

    // Popping -> allowed
    const resPopping = handleRequest(
      { action: 'attendance.mark', token: leadToken, payload: { styleId: 'popping' } },
      ctx,
      secrets
    );
    expect(resPopping.ok).toBe(true);

    // Latin -> forbidden
    const resLatin = handleRequest(
      { action: 'attendance.mark', token: leadToken, payload: { styleId: 'latin' } },
      ctx,
      secrets
    );
    expect(resLatin.ok).toBe(false);
    if (!resLatin.ok) {
      expect(resLatin.error.code).toBe('FORBIDDEN');
    }
  });

  it('same opId twice runs handler once and returns the first result', () => {
    const ctx = makeCtx();
    let counter = 0;
    registerRoutes({
      'test.counter': {
        perm: 'public',
        write: true,
        handler: () => {
          counter++;
          return { counter };
        }
      }
    });

    const res1 = handleRequest({ action: 'test.counter', opId: 'op_123' }, ctx, secrets);
    expect(res1.ok).toBe(true);
    if (res1.ok) {
      expect(res1.data).toEqual({ counter: 1 });
    }

    const res2 = handleRequest({ action: 'test.counter', opId: 'op_123' }, ctx, secrets);
    expect(res2.ok).toBe(true);
    if (res2.ok) {
      expect(res2.data).toEqual({ counter: 1 });
    }
    expect(counter).toBe(1);
  });

  it('GAS "Service invoked too many times" → QUOTA retryable=true', () => {
    const ctx = makeCtx();
    registerRoutes({
      'test.quotaError': {
        perm: 'public',
        write: false,
        handler: () => {
          throw new Error('Service invoked too many times in a short time: spreadsheets.');
        }
      }
    });

    const res = handleRequest({ action: 'test.quotaError' }, ctx, secrets);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('QUOTA');
      expect(res.error.retryable).toBe(true);
    }
  });
});
