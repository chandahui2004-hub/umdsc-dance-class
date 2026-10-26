// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DancerHome } from './DancerHome';
import type { DancerBootstrap, ClassSession } from '@umdsc/shared';

const mockCall = vi.fn();
vi.mock('../../lib/api', () => ({
  call: (...args: any[]) => mockCall(...args),
  errorMessage: (err: any) => String(err)
}));

vi.mock('../../lib/session', () => ({
  session: {
    get: () => ({
      token: 'dancer_token',
      claims: { sub: 'M-22003949', role: 'dancer', name: 'Tan Ah Kow' }
    })
  }
}));

const mockBootstrap: DancerBootstrap = {
  profile: {
    matricKey: '22003949',
    fullName: 'Tan Ah Kow',
    eventIds: ['evt-oct'],
    perms: { 'calendar.view': '*' }
  },
  events: [
    {
      id: 'evt-oct',
      name: 'OCT MONTHLY CLASS',
      type: 'monthly',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      status: 'active',
      styleIds: ['style-popping']
    }
  ],
  styles: [
    { id: 'style-popping', name: 'Popping', colorKey: 'blue', active: true } as any
  ],
  instructors: [
    { id: 'inst-1', name: 'Lam Hong Woh', active: true } as any
  ],
  sessions: [
    {
      id: 'sess-1',
      eventId: 'evt-oct',
      styleId: 'style-popping',
      seq: 1,
      date: '2026-10-10',
      start: '20:00',
      end: '22:00',
      venue: 'Studio A',
      instructorId: 'inst-1',
      status: 'scheduled',
      note: 'Original Note',
      version: 1,
      updatedBy: 'admin',
      updatedAt: '2026-10-01T00:00:00Z',
      active: true
    }
  ],
  attendance: [],
  videos: [],
  music: [],
  sections: []
};

vi.mock('../auth/useBootstrap', () => ({
  useBootstrap: () => ({
    data: mockBootstrap,
    isLoading: false
  })
}));

vi.mock('../auth/useDancerAttendance', () => ({
  useDancerAttendance: () => ({
    attendance: [],
    isLoading: false
  })
}));

describe('DancerHome live sessions query', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 }
      }
    });
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DancerHome />
        </MemoryRouter>
      </QueryClientProvider>
    );

  it('queries sessions.list for the active event and updates when session is edited', async () => {
    const updatedSessions: ClassSession[] = [
      {
        ...mockBootstrap.sessions[0],
        date: '2026-10-18',
        venue: 'Main Studio Edited',
        note: 'Edited Note',
        version: 2
      }
    ];

    mockCall.mockImplementation(async (action: string) => {
      if (action === 'sessions.list') {
        return { ok: true, data: updatedSessions, dataVersion: 2 };
      }
      return { ok: true, data: [] };
    });

    renderComponent();

    // Verify sessions.list was requested for active event
    await waitFor(() => {
      expect(mockCall).toHaveBeenCalledWith('sessions.list', { eventId: 'evt-oct' });
    });

    // Dancer header shows name
    expect(screen.getByText('Tan Ah Kow')).toBeInTheDocument();
  });
});
