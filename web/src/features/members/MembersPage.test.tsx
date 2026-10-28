import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

  it('scopes dance style dropdown to only the styles in the currently selected event', async () => {
    mockUseCurrentEventState = {
      events: [
        { id: 'evt1', name: 'OCT CLASS', status: 'active', styleIds: ['st_popping'] },
        { id: 'evt2', name: 'NOV CLASS', status: 'active', styleIds: ['st_hiphop'] }
      ],
      current: { id: 'evt1', name: 'OCT CLASS', status: 'active', styleIds: ['st_popping'] },
      setCurrentId: vi.fn(),
      isAll: false
    };

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MembersPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Popping should be offered, Hip Hop should NOT be
    expect(screen.getByRole('button', { name: /Popping/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hip Hop/i })).not.toBeInTheDocument();
  });

  describe('for a user who may import dancers', () => {
    const renderPage = () =>
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <MembersPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

    beforeEach(() => {
      localStorage.setItem(
        'umdsc:session',
        JSON.stringify({
          token: 't',
          claims: { sub: 'lead', role: 'admin', name: 'Lead', exp: 9999999999, pv: 1, perms: { 'members.view': '*', 'members.import': '*' } }
        })
      );
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
            data: [{ memberId: 'M-26006146', matricKey: '26006146', matricRaw: '26006146', fullName: 'Deepa S', styleNames: ['Popping'], contact: '011', email: 'd@test.com', gender: '', nationality: '', flags: [] }]
          });
        }
        if (action === 'members.edit') return Promise.resolve({ data: { memberId: 'M-26006145' } });
        return Promise.resolve({ data: [] });
      });
    });

    afterEach(() => localStorage.clear());

    it('REFRESH syncs every shown event from its form before reloading the list', async () => {
      renderPage();
      await waitFor(() => expect(screen.getAllByText('Deepa S').length).toBeGreaterThan(0));
      mockCall.mockClear();

      fireEvent.click(screen.getByRole('button', { name: 'REFRESH' }));

      await waitFor(() => {
        const actions = mockCall.mock.calls.map(c => [c[0], c[1]?.id ?? c[1]?.eventId]);
        expect(actions).toEqual(expect.arrayContaining([['events.sync', 'evt1'], ['events.sync', 'evt2'], ['members.list', 'evt1']]));
      });
      const order = mockCall.mock.calls.map(c => c[0]);
      expect(order.lastIndexOf('events.sync')).toBeLessThan(order.indexOf('members.list'));
    });

    it('EDIT saves a corrected matric through members.edit for the dancer\'s event', async () => {
      renderPage();
      await waitFor(() => expect(screen.getAllByText('Deepa S').length).toBeGreaterThan(0));
      fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: 'DETAILS' }));

      fireEvent.click(await screen.findByRole('button', { name: 'EDIT DETAILS' }));
      const matric = screen.getByLabelText('Matric number');
      fireEvent.change(matric, { target: { value: '26006145' } });
      fireEvent.click(screen.getByRole('button', { name: 'SAVE TO FORM SHEET' }));

      await waitFor(() =>
        expect(mockCall).toHaveBeenCalledWith('members.edit', { eventId: 'evt1', memberId: 'M-26006146', matricRaw: '26006145' })
      );
    });

    it('hides EXPORT CSV when the user only has members.view (no export.download or members.import)', async () => {
      localStorage.setItem(
        'umdsc:session',
        JSON.stringify({
          token: 't',
          claims: { sub: 'viewer', role: 'admin', name: 'Viewer', exp: 9999999999, pv: 1, perms: { 'members.view': '*' } }
        })
      );
      renderPage();
      await waitFor(() => expect(screen.getAllByText('Deepa S').length).toBeGreaterThan(0));
      expect(screen.queryByRole('button', { name: /EXPORT CSV/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^EDIT$/i })).not.toBeInTheDocument();
    });
  });
});
