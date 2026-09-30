import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('./api', () => ({ call: vi.fn() }));
import { call } from './api';
import { useEventAutoSync } from './useEventAutoSync';

function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true });
}

describe('useEventAutoSync', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
    client = new QueryClient();
    vi.mocked(call).mockReset();
    vi.mocked(call).mockResolvedValue({ data: { checked: [], changed: [], skipped: [], errors: [] }, dataVersion: 1 } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('checks 4 s after mount and then every 10 minutes', async () => {
    renderHook(() => useEventAutoSync(), { wrapper });

    await vi.advanceTimersByTimeAsync(3_999);
    expect(vi.mocked(call)).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(vi.mocked(call)).toHaveBeenCalledWith('events.autoSync', {});
    await vi.advanceTimersByTimeAsync(600_000);
    expect(vi.mocked(call)).toHaveBeenCalledTimes(2);
  });

  it('does not check while the tab is hidden', async () => {
    renderHook(() => useEventAutoSync(), { wrapper });
    await vi.advanceTimersByTimeAsync(4_000);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(vi.mocked(call)).toHaveBeenCalledTimes(1);
  });

  it('refreshes data only when an event changed', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries');
    renderHook(() => useEventAutoSync(), { wrapper });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(spy).not.toHaveBeenCalled();

    vi.mocked(call).mockResolvedValue({ data: { checked: [], changed: ['e1'], skipped: [], errors: [] }, dataVersion: 2 } as any);
    await vi.advanceTimersByTimeAsync(600_000);
    const keys = spy.mock.calls.map(c => (c[0] as any).queryKey[0]);
    expect(keys).toEqual(expect.arrayContaining(['events', 'members', 'attendance', 'sessions', 'bootstrap']));
  });
});
