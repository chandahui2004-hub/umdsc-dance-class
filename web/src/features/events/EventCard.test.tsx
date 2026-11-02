// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { EventCard } from './EventCard';
import { session } from '../../lib/session';
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
  sourceSheetId: 'ss_1',
  membersSpreadsheetId: 'ss_1',
  videoFolderId: 'vld_1',
  columnMapJson: '{}',
  classIndex: 0,
  styleInstructors: {},
  sourceRowCount: 25,
  sourceLastRowHash: 'h_1',
  lastSyncAt: '2026-10-01T00:00:00Z',
  lastSyncError: '',
  nameKey: 'house foundation',
  folderMissing: false,
  sourceTab: 'Form Responses 1',
  notifiedFullStyles: [],
  updatedBy: 'admin',
  updatedAt: '2026-10-01T00:00:00Z',
  active: true
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
    session.set('tok-admin', {
      sub: 'admin',
      role: 'admin',
      name: 'Admin',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: { 'calendar.view': '*', 'sessions.edit': '*', 'members.import': '*', 'attendance.view.all': '*' }
    });
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

describe('EventCard Google Form status badging', () => {
  beforeEach(() => {
    session.set('tok-admin', {
      sub: 'admin',
      role: 'admin',
      name: 'Admin',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: { 'calendar.view': '*', 'sessions.edit': '*', 'members.import': '*', 'attendance.view.all': '*' }
    });
    vi.clearAllMocks();
  });

  it('renders FORM OPEN neon green badge with pulsing dot when event has a form and formClosed is false or undefined', () => {
    // 1. undefined formClosed
    const eventWithFormOpenUndefined: EventListItem = {
      ...dummyEvent,
      id: 'ev-open-1',
      formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSc_xxx/viewform'
    };
    const { unmount } = renderWithClient(<EventCard event={eventWithFormOpenUndefined} styles={dummyStyles} />);

    const badge1 = screen.getByTestId('form-status-ev-open-1');
    expect(badge1).toBeInTheDocument();
    expect(badge1).toHaveTextContent('FORM OPEN');
    expect(badge1.className).toContain('text-[#4ade80]');
    expect(badge1.querySelector('.animate-pulse')).toBeInTheDocument();

    unmount();

    // 2. explicitly false formClosed
    const eventWithFormOpenFalse: EventListItem = {
      ...dummyEvent,
      id: 'ev-open-2',
      formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSc_xxx/viewform',
      formClosed: false
    };
    renderWithClient(<EventCard event={eventWithFormOpenFalse} styles={dummyStyles} />);

    const badge2 = screen.getByTestId('form-status-ev-open-2');
    expect(badge2).toBeInTheDocument();
    expect(badge2).toHaveTextContent('FORM OPEN');
    expect(badge2.className).toContain('text-[#4ade80]');
    expect(badge2.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders FORM CLOSED neon red badge with pulsing dot when formClosed is true', () => {
    const eventWithFormClosed: EventListItem = {
      ...dummyEvent,
      id: 'ev-closed',
      formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSc_xxx/viewform',
      formClosed: true
    };
    renderWithClient(<EventCard event={eventWithFormClosed} styles={dummyStyles} />);

    const badge = screen.getByTestId('form-status-ev-closed');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('FORM CLOSED');
    expect(badge.className).toContain('text-[var(--neon-red)]');
    expect(badge.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('does not render form badges when event has no form link', () => {
    const eventWithoutForm: EventListItem = {
      ...dummyEvent,
      id: 'ev-no-form',
      formUrl: undefined,
      formId: undefined
    };
    renderWithClient(<EventCard event={eventWithoutForm} styles={dummyStyles} />);

    expect(screen.queryByTestId('form-status-ev-no-form')).not.toBeInTheDocument();
    expect(screen.queryByText(/FORM OPEN/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/FORM CLOSED/i)).not.toBeInTheDocument();
  });
});
