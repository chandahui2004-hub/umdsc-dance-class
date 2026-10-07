import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { call, ApiError, errorMessage, newOpId } from './api';
import { session } from './session';
import type { TokenClaims } from '@umdsc/shared';

describe('API Client & Session', () => {
  const dummyClaims: TokenClaims = {
    sub: 'user123',
    role: 'dancer',
    name: 'Test Dancer',
    exp: Math.floor(Date.now() / 1000) + 3600,
    pv: 1,
    perms: { 'calendar.view': '*' }
  };

  beforeEach(() => {
    session.clear();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends text/plain with token in body and no Authorization header', async () => {
    session.set('tok-123', dummyClaims, true);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: { greeting: 'hello' },
        dataVersion: 5,
        serverTime: new Date().toISOString()
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await call<{ greeting: string }>('hello.action', { foo: 'bar' });
    expect(res.data).toEqual({ greeting: 'hello' });
    expect(res.dataVersion).toBe(5);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBeDefined();
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'text/plain;charset=utf-8' });
    expect(init.headers.Authorization).toBeUndefined();

    const parsedBody = JSON.parse(init.body);
    expect(parsedBody.action).toBe('hello.action');
    expect(parsedBody.token).toBe('tok-123');
    expect(parsedBody.payload).toEqual({ foo: 'bar' });
  });

  it('retries QUOTA three times then resolves', async () => {
    vi.useFakeTimers();

    let attempts = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts <= 3) {
        return {
          ok: true,
          json: async () => ({
            ok: false,
            error: {
              code: 'QUOTA',
              message: 'Rate limit exceeded',
              retryable: true
            }
          })
        };
      }
      return {
        ok: true,
        json: async () => ({
          ok: true,
          data: { success: true },
          dataVersion: 10,
          serverTime: new Date().toISOString()
        })
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const callPromise = call<{ success: boolean }>('quota.test', undefined, { retries: 4 });

    // Advance fake timers through retry backoffs
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(15000);
    }

    const result = await callPromise;
    expect(result.data).toEqual({ success: true });
    expect(attempts).toBe(4);
  });

  it('does not retry VALIDATION', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: false,
        error: {
          code: 'VALIDATION',
          message: 'Invalid payload field',
          retryable: false
        }
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(call('validation.test')).rejects.toThrow(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('UNAUTHORIZED clears session and calls onUnauthorized once', async () => {
    session.set('tok-456', dummyClaims, true);
    const onUnauth = vi.fn();
    const unsubscribe = session.onUnauthorized(onUnauth);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
          retryable: false
        }
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(call('secure.action')).rejects.toThrow(ApiError);

    expect(session.get()).toBeNull();
    expect(onUnauth).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('network TypeError is retried', async () => {
    vi.useFakeTimers();

    let attempts = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts <= 2) {
        throw new TypeError('Failed to fetch');
      }
      return {
        ok: true,
        json: async () => ({
          ok: true,
          data: { recovered: true },
          dataVersion: 2,
          serverTime: new Date().toISOString()
        })
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const callPromise = call<{ recovered: boolean }>('network.test', undefined, { retries: 3 });

    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(10000);
    }

    const result = await callPromise;
    expect(result.data).toEqual({ recovered: true });
    expect(attempts).toBe(3);
  });

  it('a lost reply (Google 404 page) is re-sent with the same one-time opId, so the server never saves twice', async () => {
    vi.useFakeTimers();
    const bodies: any[] = [];
    let attempts = 0;
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      attempts++;
      if (attempts === 1) {
        // Google's "echo" page answers 404 with HTML, so the JSON can't be read
        return { ok: false, status: 404, json: async () => { throw new SyntaxError('Unexpected token <'); } };
      }
      return { ok: true, json: async () => ({ ok: true, data: { saved: true }, dataVersion: 1, serverTime: '' }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const p = call('sessions.create', { styleId: 'x' });
    await vi.advanceTimersByTimeAsync(10000);
    await p;

    expect(bodies).toHaveLength(2);
    expect(bodies[0].opId).toBeTruthy();
    expect(bodies[1].opId).toBe(bodies[0].opId);
  });

  it('keeps a caller-given opId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: {}, dataVersion: 1, serverTime: '' }) });
    vi.stubGlobal('fetch', fetchMock);
    await call('instructors.update', {}, { opId: 'op-mine' });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).opId).toBe('op-mine');
  });

  it('generates valid opId and handles error messages properly', () => {
    const op1 = newOpId();
    const op2 = newOpId();
    expect(op1).toBeDefined();
    expect(op2).toBeDefined();
    expect(op1).not.toBe(op2);

    expect(errorMessage(new ApiError('QUOTA', 'Busy', true))).toContain('Busy right now');
    expect(errorMessage(new ApiError('NAME_MISMATCH', 'Mismatch', false))).toContain("That name doesn't match");
    expect(errorMessage(new ApiError('LINK_NO_ACCESS', 'Custom folder error', false))).toBe('Custom folder error');
  });

  it('checks session token expiration against claims.exp', () => {
    const expiredClaims: TokenClaims = {
      ...dummyClaims,
      exp: Math.floor(Date.now() / 1000) - 100 // expired
    };
    session.set('expired-tok', expiredClaims, true);
    expect(session.get()).toBeNull();
  });
});
