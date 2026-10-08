import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const callMock = vi.fn(() => new Promise(() => undefined)); // the refresh never answers in these tests
vi.mock('../../lib/api', () => ({ call: (...args: unknown[]) => (callMock as any)(...args) }));
vi.mock('../../lib/session', () => ({
  session: { get: () => ({ token: 't', claims: { sub: 'M-22001111', role: 'dancer' } }) }
}));

import { useBootstrap } from './useBootstrap';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('useBootstrap saved copy', () => {
  beforeEach(() => localStorage.clear());

  it('shows a valid saved copy straight away', () => {
    localStorage.setItem('boot:dancer:M-22001111', JSON.stringify({ data: { styles: [{ id: 's1' }], events: [] }, dataVersion: 4 }));
    const { result } = renderHook(() => useBootstrap('dancer'), { wrapper });
    expect((result.current.data as any)?.styles).toEqual([{ id: 's1' }]);
  });

  it('ignores a saved copy that is not real starting data, so the page cannot crash on it', () => {
    localStorage.setItem('boot:dancer:M-22001111', JSON.stringify({ data: { status: 'UMDSC API active' } }));
    const { result } = renderHook(() => useBootstrap('dancer'), { wrapper });
    expect(result.current.data).toBeUndefined();
  });
});
