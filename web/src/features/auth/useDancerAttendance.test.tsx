import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const callMock = vi.fn();
vi.mock('../../lib/api', () => ({ call: (...args: unknown[]) => callMock(...args) }));
vi.mock('../../lib/session', () => ({
  session: { get: () => ({ token: 't', claims: { sub: 'M-22001111', role: 'dancer' } }) }
}));

import { useDancerAttendance } from './useDancerAttendance';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('useDancerAttendance', () => {
  beforeEach(() => {
    localStorage.clear();
    callMock.mockReset();
  });

  it('reports loading, then the dancer attendance from dancer.attendance', async () => {
    callMock.mockResolvedValue({ data: [{ sessionId: 's1', present: true }], dataVersion: 1 });

    const { result } = renderHook(() => useDancerAttendance(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.attendance).toEqual([]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.attendance).toEqual([{ sessionId: 's1', present: true }]);
    expect(callMock).toHaveBeenCalledWith('dancer.attendance');
  });

  it('shows the last saved attendance immediately while it refreshes', async () => {
    localStorage.setItem('att:dancer:M-22001111', JSON.stringify([{ sessionId: 'old', present: true }]));
    callMock.mockResolvedValue({ data: [{ sessionId: 'new', present: false }], dataVersion: 1 });

    const { result } = renderHook(() => useDancerAttendance(), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.attendance).toEqual([{ sessionId: 'old', present: true }]);

    await waitFor(() => expect(result.current.attendance).toEqual([{ sessionId: 'new', present: false }]));
  });

  it('treats an unexpected response as no attendance instead of breaking the calendar', async () => {
    callMock.mockResolvedValue({ data: {}, dataVersion: 1 });

    const { result } = renderHook(() => useDancerAttendance(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.attendance).toEqual([]);
  });
});
