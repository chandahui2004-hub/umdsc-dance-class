import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { TokenClaims } from '@umdsc/shared';
import { signToken, verifyToken, Hmac } from '../../src/security/tokens';
import { hashPassword, verifyPassword } from '../../src/security/passwords';
import { checkThrottle, recordFailure, clearFailures } from '../../src/security/throttle';
import { FakeCache } from '../fakes/fakeCache';
import { AppError } from '../../src/errors';

const nodeHmac: Hmac = (key: string, message: string) => {
  return new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
};

describe('Security: tokens and passwords and throttle', () => {
  it('signs and verifies tokens', () => {
    const claims: TokenClaims = {
      sub: 'M-22003949',
      role: 'dancer',
      name: 'X',
      exp: 1000,
      pv: 1,
      perms: { 'calendar.view': '*' }
    };

    const t = signToken(claims, 'sek', nodeHmac);
    expect(t.split('.').length).toBe(2);
    expect(verifyToken(t, 'sek', nodeHmac, 999)).toEqual(claims);

    expect(() => verifyToken(t, 'sek', nodeHmac, 1001)).toThrow(/UNAUTHORIZED/);
    expect(() => verifyToken(t.replace(/^./, 'x'), 'sek', nodeHmac, 999)).toThrow(/UNAUTHORIZED/);
    expect(() => verifyToken(t, 'other', nodeHmac, 999)).toThrow(/UNAUTHORIZED/);
  });

  it('hashes and verifies passwords', () => {
    const h = hashPassword('pw', 'salt', 3, nodeHmac);
    expect(verifyPassword('pw', { hash: h, salt: 'salt', iterations: 3 }, nodeHmac)).toBe(true);
    expect(verifyPassword('pW', { hash: h, salt: 'salt', iterations: 3 }, nodeHmac)).toBe(false);
  });

  it('throttles failed attempts and clears on success', () => {
    const cache = new FakeCache();
    const key = 'test_user';

    // Record 5 failures
    for (let i = 0; i < 5; i++) {
      recordFailure(cache, key, 600);
    }

    // 6th attempt should throw LOCKED_OUT
    expect(() => {
      checkThrottle(cache, key, 5, 600);
    }).toThrowError(/LOCKED_OUT/);

    try {
      checkThrottle(cache, key, 5, 600);
    } catch (err: any) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('LOCKED_OUT');
    }

    // clear failures
    clearFailures(cache, key);
    expect(() => {
      checkThrottle(cache, key, 5, 600);
    }).not.toThrow();
  });
});
