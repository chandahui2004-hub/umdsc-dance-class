import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MembersPage } from './MembersPage';
import { MemoryRouter } from 'react-router-dom';

const mockCall = vi.fn();
vi.mock('../../lib/api', () => ({
  call: (...args: any[]) => mockCall(...args),
  api: { post: (...args: any[]) => mockCall(...args) },
  errorMessage: (err: any) => String(err)
}));

let mockUseCurrentEventState = {
  events: [
    { id: 'evt1', name: 'OCT CLASS', status: 'active', styleIds: ['st_popping'] },
    { id: 'evt2', name: 'NOV CLASS', status: 'active', styleIds: ['st_hiphop'] }
  ],
  current: null as any,
  setCurrentId: vi.fn(),
  isAll: true
};

vi.mock('../events/useCurrentEvent', () => ({
  useCurrentEvent: () => mockUseCurrentEventState
}));

vi.mock('../auth/useBootstrap', () => ({
  useBootstrap: () => ({
    data: {
      styles: [
        { id: 'st_popping', name: 'Popping', colorKey: 'blue' },
        { id: 'st_hiphop', name: 'Hip Hop', colorKey: 'orange' }
      ]
    }
  })
}));

describe('MembersPage Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
  });

  it('combines and deduplicates dancers across events when isAll is true', async () => {
    mockUseCurrentEventState = {
      events: [
        { id: 'evt1', name: 'OCT CLASS', status: 'active', styleIds: ['st_popping'] },
        { id: 'evt2', name: 'NOV CLASS', status: 'active', styleIds: ['st_hiphop'] }
      ],
      current: null,
      setCurrentId: vi.fn(),
      isAll: true
    };

    mockCall.mockImplementation((action: string, payload: any) => {
      if (action === 'members.list' && payload?.eventId === 'evt1') {
        return Promise.resolve({
          data: [
            { memberId: 'M-1', matricKey: '22001111', matricRaw: '22001111', fullName: 'Alice Tan', styleNames: ['Popping'], contact: '0123456789', email: 'alice@test.com' }
          ]
        });
      }
      if (action === 'members.list' && payload?.eventId === 'evt2') {
        return Promise.resolve({
          data: [
            // Alice registered again in event 2 with Hip Hop
            { memberId: 'M-1', matricKey: '22001111', matricRaw: '22001111', fullName: 'Alice Tan', styleNames: ['Hip Hop'], contact: '0123456789', email: 'alice@test.com' },
            { memberId: 'M-2', matricKey: '22002222', matricRaw: '22002222', fullName: 'Bob Lee', styleNames: ['Hip Hop'], contact: '0198765432', email: 'bob@test.com' }
          ]
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MembersPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getAllByText('Alice Tan').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Bob Lee').length).toBeGreaterThan(0);
    });

    // In the desktop table, Alice and Bob should each appear once (deduplicated across events)
    const table = screen.getByRole('table');
    expect(within(table).getByText('Alice Tan')).toBeInTheDocument();
    expect(within(table).getByText('Bob Lee')).toBeInTheDocument();

    // Fullscreen toggle should be present
    const fullscreenBtn = screen.getByRole('button', { name: /fullscreen/i });
    expect(fullscreenBtn).toBeInTheDocument();

    // Clicking fullscreen toggles fullscreen class/state
    fireEvent.click(fullscreenBtn);
    expect(screen.getByText(/exit fullscreen/i)).toBeInTheDocument();
  });
});
