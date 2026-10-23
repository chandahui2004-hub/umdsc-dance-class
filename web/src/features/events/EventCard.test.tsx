// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { EventCard } from './EventCard';
import type { EventListItem, DanceStyle } from '@umdsc/shared';

const mockCall = vi.fn();
vi.mock('../../lib/api', () => ({
  call: (...args: any[]) => mockCall(...args),
  errorMessage: (err: any) => String(err?.message || err)
}));

const mockSetCurrentId = vi.fn();
vi.mock('./useCurrentEvent', () => ({
  useCurrentEvent: () => ({
    setCurrentId: mockSetCurrentId
  })
}));

const dummyEvent: EventListItem = {
  id: 'ev-house',
  name: 'House Foundation',
  type: 'monthly',
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  styleIds: ['st_house'],
  status: 'active',
  memberCount: 25,
  version: 1,
  folderId: 'fld_1',
  spreadsheetId: 'ss_1',
  sourceTab: 'Form Responses 1',
  notifiedFullStyles: []
};

const dummyStyles: DanceStyle[] = [
  { id: 'st_house', name: 'House', colorKey: 'teal', active: true } as any
];

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('EventCard Unified Sync Now', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders single SYNC NOW button and no separate SYNC FORM button', () => {
    renderWithClient(<EventCard event={dummyEvent} styles={dummyStyles} />);

    // SYNC NOW button exists
    expect(screen.getByRole('button', { name: /SYNC NOW/i })).toBeInTheDocument();

    // No separate SYNC FORM button exists
    expect(screen.queryByRole('button', { name: /SYNC FORM/i })).not.toBeInTheDocument();
  });

  it('clicking SYNC NOW calls events.sync and events.syncFormSlots, showing combined outcome', async () => {
    mockCall.mockImplementation((action: string) => {
      if (action === 'events.sync') {
        return Promise.resolve({ data: { added: 2, updated: 1 } });
      }
      if (action === 'events.syncFormSlots') {
        return Promise.resolve({ data: { formClosed: true } });
      }
      return Promise.resolve({ data: {} });
    });

    renderWithClient(<EventCard event={dummyEvent} styles={dummyStyles} />);

    const syncBtn = screen.getByRole('button', { name: /SYNC NOW/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(mockCall).toHaveBeenCalledWith('events.sync', {
        id: 'ev-house',
        purgeRemoved: true,
        force: true
      });
      expect(mockCall).toHaveBeenCalledWith('events.syncFormSlots', {
        id: 'ev-house'
      });
    });

    // Check consolidated note
    await waitFor(() => {
      expect(screen.getByText(/Synced: \+2 new, 1 updated · Google Form closed \(FULL HOUSE\)/i)).toBeInTheDocument();
    });
  });
});
