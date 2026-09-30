import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../lib/api', () => ({ call: vi.fn() }));
import { call } from '../../lib/api';
import { useCurrentEvent } from './useCurrentEvent';

const EVENTS = [
  { id: 'e1', name: 'SEP CLASS', status: 'active', startDate: '2026-09-01' },
  { id: 'e2', name: 'OCT CLASS', status: 'active', startDate: '2026-10-01' },
  { id: 'e3', name: 'OLD WORKSHOP', status: 'archived', startDate: '2026-12-01' }
];

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useCurrentEvent', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(call).mockReset();
    vi.mocked(call).mockResolvedValue({ data: EVENTS, dataVersion: 1 } as any);
  });

  it('falls back to latest active event when nothing stored', async () => {
    const { result } = renderHook(() => useCurrentEvent(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.current?.id).toBe('e2'));
    expect(vi.mocked(call)).toHaveBeenCalledWith('events.list', { includeArchived: true });
  });

  it('keeps stored choice across remount', async () => {
    const first = renderHook(() => useCurrentEvent(), { wrapper: wrapper() });
    await waitFor(() => expect(first.result.current.events.length).toBe(3));
    act(() => first.result.current.setCurrentId('e1'));
    expect(first.result.current.current?.id).toBe('e1');
    first.unmount();

    const second = renderHook(() => useCurrentEvent(), { wrapper: wrapper() });
    await waitFor(() => expect(second.result.current.current?.id).toBe('e1'));
  });

  it('unknown stored id falls back', async () => {
    localStorage.setItem('umdsc:currentEvent', 'gone');
    const { result } = renderHook(() => useCurrentEvent(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.current?.id).toBe('e2'));
  });

  it('no events gives null', async () => {
    vi.mocked(call).mockResolvedValue({ data: [], dataVersion: 1 } as any);
    const { result } = renderHook(() => useCurrentEvent(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.current).toBeNull();
  });
});
