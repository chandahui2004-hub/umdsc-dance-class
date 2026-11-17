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

    it('hides EXPORT CSV and + ADD DANCER when the user only has members.view (no export.download or members.import)', async () => {
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
      expect(screen.queryByRole('button', { name: /\+ ADD DANCER/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^EDIT$/i })).not.toBeInTheDocument();
    });

    it('adds a new dancer with selected dance classes via + ADD DANCER and shows admin override badge on full classes', async () => {
      mockUseCurrentEventState = {
        events: [
          {
            id: 'evt1',
            name: 'OCT CLASS',
            status: 'active',
            styleIds: ['st_popping', 'st_hiphop'],
            styleSlots: { st_popping: 20, st_hiphop: 25 },
            notifiedFullStyles: ['st_popping'],
            memberCount: 20
          },
          { id: 'evt2', name: 'NOV CLASS', status: 'active', styleIds: ['st_hiphop'] }
        ] as any,
        current: null,
        setCurrentId: vi.fn(),
        isAll: true
      };
      mockCall.mockImplementation((action: string, payload: any) => {
        if (action === 'members.list' && payload?.eventId === 'evt1') {
          return Promise.resolve({
            data: [{ memberId: 'M-26006146', matricKey: '26006146', matricRaw: '26006146', fullName: 'Deepa S', styleIds: ['st_popping'], styleNames: ['Popping'], contact: '011', email: 'd@test.com', gender: '', nationality: '', flags: [] }]
          });
        }
        if (action === 'members.add') return Promise.resolve({ data: { memberId: 'M-24009999' } });
        return Promise.resolve({ data: [] });
      });

      renderPage();
      await waitFor(() => expect(screen.getAllByText('Deepa S').length).toBeGreaterThan(0));

      const addBtn = screen.getByRole('button', { name: /\+ ADD DANCER/i });
      expect(addBtn.querySelector('svg')).toBeInTheDocument();
      fireEvent.click(addBtn);

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(/ADD NEW DANCER/i)).toBeInTheDocument();
      expect(within(dialog).getByText(/FULL — ADMIN OVERRIDE \(FORM STAYS CLOSED\)/i)).toBeInTheDocument();

      fireEvent.change(within(dialog).getByLabelText(/Full name/i), { target: { value: 'Zoe Lim' } });
      fireEvent.change(within(dialog).getByLabelText(/Matric number/i), { target: { value: '24009999' } });
      fireEvent.change(within(dialog).getByLabelText(/Phone number/i), { target: { value: '0123334444' } });
      fireEvent.change(within(dialog).getByLabelText(/Email/i), { target: { value: 'zoe@um.edu.my' } });

      // Submitting before choosing a dance class triggers validation
      fireEvent.click(within(dialog).getByRole('button', { name: /ADD DANCER/i }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Select at least one dance class/i);
      expect(mockCall).not.toHaveBeenCalledWith('members.add', expect.anything());

      // Select full Popping class (admin override) + Hip Hop
      fireEvent.click(within(dialog).getByLabelText(/Popping/i));
      fireEvent.click(within(dialog).getByLabelText(/Hip Hop/i));
      fireEvent.click(within(dialog).getByRole('button', { name: /ADD DANCER/i }));

      await waitFor(() =>
        expect(mockCall).toHaveBeenCalledWith('members.add', {
          eventId: 'evt1',
          fullName: 'Zoe Lim',
          matricRaw: '24009999',
          contact: '0123334444',
          email: 'zoe@um.edu.my',
          gender: '',
          nationality: '',
          styleIds: ['st_popping', 'st_hiphop']
        })
      );
    });

    it('updates a dancer\'s enrolled dance classes via EditDancerDialog and validates empty selection', async () => {
      mockUseCurrentEventState = {
        events: [
          {
            id: 'evt1',
            name: 'OCT CLASS',
            status: 'active',
            styleIds: ['st_popping', 'st_hiphop']
          }
        ] as any,
        current: { id: 'evt1', name: 'OCT CLASS', status: 'active', styleIds: ['st_popping', 'st_hiphop'] },
        setCurrentId: vi.fn(),
        isAll: false
      };
      mockCall.mockImplementation((action: string) => {
        if (action === 'members.list') {
          return Promise.resolve({
            data: [
              {
                memberId: 'M-26006146',
                matricKey: '26006146',
                matricRaw: '26006146',
                fullName: 'Deepa S',
                styleIds: ['st_popping'],
                styleNames: ['Popping'],
                contact: '011',
                email: 'd@test.com',
                gender: '',
                nationality: '',
                flags: []
              }
            ]
          });
        }
        if (action === 'members.edit') return Promise.resolve({ data: { memberId: 'M-26006146' } });
        return Promise.resolve({ data: [] });
      });

      renderPage();
      await waitFor(() => expect(screen.getAllByText('Deepa S').length).toBeGreaterThan(0));
      fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: 'DETAILS' }));
      fireEvent.click(await screen.findByRole('button', { name: 'EDIT DETAILS' }));

      const dialog = await screen.findByRole('dialog');
      const poppingBox = within(dialog).getByLabelText(/Popping/i) as HTMLInputElement;
      const hiphopBox = within(dialog).getByLabelText(/Hip Hop/i) as HTMLInputElement;
      expect(poppingBox.checked).toBe(true);
      expect(hiphopBox.checked).toBe(false);

      // Uncheck all classes -> shows validation asking to pick a class or use REMOVE FROM EVENT
      fireEvent.click(poppingBox);
      fireEvent.click(within(dialog).getByRole('button', { name: 'SAVE TO FORM SHEET' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        /Select at least one dance class, or use REMOVE FROM EVENT below to remove this dancer\./i
      );

      // Switch to Hip Hop only and save
      fireEvent.click(hiphopBox);
      fireEvent.click(within(dialog).getByRole('button', { name: 'SAVE TO FORM SHEET' }));

      await waitFor(() =>
        expect(mockCall).toHaveBeenCalledWith('members.edit', {
          eventId: 'evt1',
          memberId: 'M-26006146',
          styleIds: ['st_hiphop']
        })
      );
    });

    it('removes a dancer from an event via REMOVE FROM EVENT confirmation in EditDancerDialog', async () => {
      mockCall.mockImplementation((action: string, payload: any) => {
        if (action === 'members.list' && payload?.eventId === 'evt1') {
          return Promise.resolve({
            data: [{ memberId: 'M-26006146', matricKey: '26006146', matricRaw: '26006146', fullName: 'Deepa S', styleIds: ['st_popping'], styleNames: ['Popping'], contact: '011', email: 'd@test.com', gender: '', nationality: '', flags: [] }]
          });
        }
        if (action === 'members.remove') return Promise.resolve({ data: { memberId: 'M-26006146', removed: true } });
        return Promise.resolve({ data: [] });
      });

      renderPage();
      await waitFor(() => expect(screen.getAllByText('Deepa S').length).toBeGreaterThan(0));
      fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: 'DETAILS' }));
      fireEvent.click(await screen.findByRole('button', { name: 'EDIT DETAILS' }));

      const removeBtn = await screen.findByRole('button', { name: /REMOVE FROM EVENT/i });
      expect(removeBtn.querySelector('svg')).toBeInTheDocument();
      fireEvent.click(removeBtn);

      const confirmBox = await screen.findByTestId('confirm-remove-dancer');
      expect(confirmBox).toHaveTextContent(/Deepa S/);
      fireEvent.click(within(confirmBox).getByRole('button', { name: /CONFIRM REMOVE/i }));

      await waitFor(() =>
        expect(mockCall).toHaveBeenCalledWith('members.remove', {
          eventId: 'evt1',
          memberId: 'M-26006146'
        })
      );
    });

    it('switches target event in AddDancerDialog and pre-selects single style for the chosen event', async () => {
      mockCall.mockImplementation((action: string, payload: any) => {
        if (action === 'members.list' && payload?.eventId === 'evt1') {
          return Promise.resolve({
            data: [{ memberId: 'M-26006146', matricKey: '26006146', matricRaw: '26006146', fullName: 'Deepa S', styleIds: ['st_popping'], styleNames: ['Popping'], contact: '011', email: 'd@test.com', gender: '', nationality: '', flags: [] }]
          });
        }
        if (action === 'members.add') return Promise.resolve({ data: { memberId: 'M-25001234' } });
        return Promise.resolve({ data: [] });
      });

      renderPage();
      await waitFor(() => expect(screen.getAllByText('Deepa S').length).toBeGreaterThan(0));

      fireEvent.click(screen.getByRole('button', { name: /\+ ADD DANCER/i }));
      const dialog = await screen.findByRole('dialog');

      const eventSelect = within(dialog).getByLabelText(/Target event/i) as HTMLSelectElement;
      expect(eventSelect.value).toBe('evt1');
      fireEvent.change(eventSelect, { target: { value: 'evt2' } });

      const hiphopCheckbox = within(dialog).getByLabelText(/Hip Hop/i) as HTMLInputElement;
      expect(hiphopCheckbox.checked).toBe(true);

      fireEvent.change(within(dialog).getByLabelText(/Full name/i), { target: { value: 'Kai Wen' } });
      fireEvent.change(within(dialog).getByLabelText(/Matric number/i), { target: { value: '25001234' } });
      fireEvent.click(within(dialog).getByRole('button', { name: /ADD DANCER/i }));

      await waitFor(() =>
        expect(mockCall).toHaveBeenCalledWith('members.add', {
          eventId: 'evt2',
          fullName: 'Kai Wen',
          matricRaw: '25001234',
          contact: '',
          email: '',
          gender: '',
          nationality: '',
          styleIds: ['st_hiphop']
        })
      );
    });
  });
});
