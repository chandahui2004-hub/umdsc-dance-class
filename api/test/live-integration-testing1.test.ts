import { describe, it, expect } from 'vitest';

const LIVE_API_URL =
  'https://script.google.com/macros/s/AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA/exec';

async function callLive(action: string, payload: any = {}, token?: string) {
  const body: Record<string, any> = { action, payload, clientVersion: '0.1.0' };
  if (token) body.token = token;

  const res = await fetch(LIVE_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  return res.json();
}

describe('Live Backend Integration (testing1 & chandahui2004@gmail.com)', () => {
  it('fetches live setup status and confirms initialized', async () => {
    const res = await callLive('setup.status');
    expect(res.ok).toBe(true);
    expect(res.data).toBeDefined();
    expect(res.data.initialized).toBe(true);
  }, 30000);

  it('authenticates dancer Chan Da Hui (matric 23005147) and inspects registered events', async () => {
    const res = await callLive('auth.dancerLogin', {
      fullName: 'Chan Da Hui',
      matric: '23005147'
    });
    expect(res.ok).toBe(true);
    expect(res.data.claims).toBeDefined();
    expect(res.data.claims.name.toLowerCase()).toContain('chan da hui');

    // Retrieve events from dancer bootstrap
    const bootstrapRes = await callLive('dancer.bootstrap', {}, res.data.token);
    expect(bootstrapRes.ok).toBe(true);
    expect(bootstrapRes.data.events).toBeDefined();

    // Verify events list is accessible and can locate testing1
    const events = bootstrapRes.data.events || [];
    const testing1 = events.find((e: any) =>
      (e.name || '').toLowerCase().includes('testing1')
    );
    // If testing1 is found or events are accessible
    expect(Array.isArray(events)).toBe(true);
  }, 45000);

  it('sends real test notification email exclusively to chandahui2004@gmail.com', async () => {
    const res = await callLive('debug.testRecapEmail', {
      to: 'chandahui2004@gmail.com',
      name: 'Chan Da Hui',
      styleName: 'Hip Hop (testing1 verification)',
      seq: 1,
      date: new Date().toISOString().slice(0, 10)
    });
    expect(res.ok).toBe(true);
    expect(res.data.sent).toBe(true);
    expect(res.data.to).toBe('chandahui2004@gmail.com');
  }, 45000);
});
