import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetAccessToken = vi.fn();
vi.mock('./gis', () => ({
  getAccessToken: (...args: any[]) => mockGetAccessToken(...args),
  getCachedToken: () => null
}));

import {
  fetchAccountEmail,
  sameAccount,
  switchGoogleAccount,
  _resetGoogleAccountForTesting
} from './googleAccount';

function mockAboutResponse(email: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ user: { emailAddress: email } })
  });
}

describe('googleAccount', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    _resetGoogleAccountForTesting();
    mockGetAccessToken.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('reads the account email from Drive about.get, lower-cased', async () => {
    globalThis.fetch = mockAboutResponse('Lead@Gmail.com') as any;

    await expect(fetchAccountEmail('tok-1')).resolves.toBe('lead@gmail.com');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',
      { headers: { Authorization: 'Bearer tok-1' } }
    );
  });

  it('asks Drive once per token', async () => {
    globalThis.fetch = mockAboutResponse('lead@gmail.com') as any;

    await fetchAccountEmail('tok-1');
    await fetchAccountEmail('tok-1');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('SWITCH ACCOUNT always shows the Google account chooser', async () => {
    globalThis.fetch = mockAboutResponse('other@gmail.com') as any;
    mockGetAccessToken.mockResolvedValue('tok-2');

    await expect(switchGoogleAccount()).resolves.toEqual({ token: 'tok-2', email: 'other@gmail.com' });
    expect(mockGetAccessToken).toHaveBeenCalledWith({ prompt: 'select_account' });
  });

  it('sameAccount ignores case and spaces, and never matches an empty account', () => {
    expect(sameAccount(' Lead@Gmail.com', 'lead@gmail.com')).toBe(true);
    expect(sameAccount('lead@gmail.com', 'club@gmail.com')).toBe(false);
    expect(sameAccount('', '')).toBe(false);
    expect(sameAccount(null, 'lead@gmail.com')).toBe(false);
  });
});
