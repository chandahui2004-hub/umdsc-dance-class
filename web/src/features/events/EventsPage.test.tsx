// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { EventsPage } from './EventsPage';
import { session } from '../../lib/session';
import type { DanceStyle, EventListItem } from '@umdsc/shared';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

const mockCall = vi.fn();
vi.mock('../../lib/api', () => ({
  call: (...args: any[]) => mockCall(...args),
  errorMessage: (err: any) => String(err)
}));

const baseEventProps = {
  columnMapJson: '{}',
  classIndex: 0,
  styleInstructors: {},
  sourceRowCount: 10,
  sourceLastRowHash: 'h',
  lastSyncAt: '',
  lastSyncError: '',
  folderMissing: false,
  notifiedFullStyles: [],
  updatedBy: 'admin',
  updatedAt: '2026-10-01T00:00:00Z',
  active: true
};

const mockEvents: EventListItem[] = [
  {
    ...baseEventProps,
    id: 'ev-active-1',
    name: 'Active Class Alpha',
    nameKey: 'active class alpha',
    type: 'monthly',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    styleIds: ['st_house'],
    status: 'active',
    memberCount: 30,
    version: 1,
    folderId: 'f1',
    videoFolderId: 'vf1',
    sourceSheetId: 's1',
    membersSpreadsheetId: 's1',
    sourceTab: 'Form Responses 1'
  },
  {
    ...baseEventProps,
    id: 'ev-active-2',
    name: 'Active Class Beta',
    nameKey: 'active class beta',
    type: 'monthly',
    startDate: '2026-10-05',
    endDate: '2026-11-05',
    styleIds: ['st_hiphop'],
    status: 'active',
    memberCount: 20,
    version: 1,
    folderId: 'f2',
    videoFolderId: 'vf2',
    sourceSheetId: 's2',
    membersSpreadsheetId: 's2',
    sourceTab: 'Form Responses 1'
  },
  {
    ...baseEventProps,
    id: 'ev-archived-2026',
    name: 'Old Workshop 2026',
    nameKey: 'old workshop 2026',
    type: 'workshop',
    startDate: '2026-03-01',
    endDate: '2026-03-05',
    styleIds: ['st_popping'],
    status: 'archived',
    memberCount: 15,
    version: 1,
    folderId: 'f3',
    videoFolderId: 'vf3',
    sourceSheetId: 's3',
    membersSpreadsheetId: 's3',
    sourceTab: 'Form Responses 1'
  },
  {
    ...baseEventProps,
    id: 'ev-archived-2025',
    name: 'Historic Camp 2025',
    nameKey: 'historic camp 2025',
    type: 'other',
    startDate: '2025-08-10',
    endDate: '2025-08-15',
    styleIds: ['st_locking'],
    status: 'archived',
    memberCount: 40,
    version: 1,
    folderId: 'f4',
    videoFolderId: 'vf4',
    sourceSheetId: 's4',
    membersSpreadsheetId: 's4',
    sourceTab: 'Form Responses 1'
  }
];

let activeMockEvents: EventListItem[] = mockEvents;
vi.mock('./useCurrentEvent', () => ({
  useEvents: () => ({ data: activeMockEvents, isLoading: false }),
  useCurrentEvent: () => ({
    setCurrentId: vi.fn()
  })
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <EventsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('EventsPage Collapsible Accordions and Year-Based Archive', () => {
  beforeEach(() => {
    activeMockEvents = mockEvents;
    session.set('tok-admin', {
      sub: 'admin',
      role: 'admin',
      name: 'Admin',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: { 'calendar.view': '*', 'sessions.edit': '*', 'members.import': '*', 'attendance.view.all': '*' }
    });
    vi.clearAllMocks();
    mockCall.mockResolvedValue({ data: [] });
  });

  it('renders active events with expand/collapse toggle bars', () => {
    renderPage();

    // Event names should be visible
    expect(screen.getByText('Active Class Alpha')).toBeInTheDocument();
    expect(screen.getByText('Active Class Beta')).toBeInTheDocument();

    // Toggle button / bar exists for Alpha
    const alphaToggle = screen.getByTestId('toggle-event-ev-active-1');
    expect(alphaToggle).toBeInTheDocument();

    // Initially collapsed: card details (like response sheet link or action buttons) should not be open
    expect(screen.queryByTestId('event-card-ev-active-1')).not.toBeInTheDocument();

    // Click to expand Alpha
    fireEvent.click(alphaToggle);
    expect(screen.getByTestId('event-card-ev-active-1')).toBeInTheDocument();

    // Beta remains collapsed
    expect(screen.queryByTestId('event-card-ev-active-2')).not.toBeInTheDocument();
  });

  it('provides an Expand All / Collapse All button for active events', () => {
    renderPage();

    const toggleAllBtn = screen.getByRole('button', { name: /EXPAND ALL/i });
    expect(toggleAllBtn).toBeInTheDocument();

    // Click Expand All
    fireEvent.click(toggleAllBtn);

    // Both cards should now be expanded
    expect(screen.getByTestId('event-card-ev-active-1')).toBeInTheDocument();
    expect(screen.getByTestId('event-card-ev-active-2')).toBeInTheDocument();

    // Button text flips to COLLAPSE ALL
    expect(screen.getByRole('button', { name: /COLLAPSE ALL/i })).toBeInTheDocument();

    // Click Collapse All
    fireEvent.click(screen.getByRole('button', { name: /COLLAPSE ALL/i }));
    expect(screen.queryByTestId('event-card-ev-active-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('event-card-ev-active-2')).not.toBeInTheDocument();
  });

  it('groups archived events by year descending with collapsible year accordions and event bars', () => {
    renderPage();

    // Toggle open archived section
    const archivedSectionBtn = screen.getByRole('button', { name: /ARCHIVED EVENTS \(2\)/i });
    fireEvent.click(archivedSectionBtn);

    // Year headers should appear in descending order: 2026, 2025
    expect(screen.getByText(/2026 ARCHIVED EVENTS \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/2025 ARCHIVED EVENTS \(1\)/i)).toBeInTheDocument();

    // Open 2026 year group
    const year2026Btn = screen.getByRole('button', { name: /2026 ARCHIVED EVENTS \(1\)/i });
    fireEvent.click(year2026Btn);

    // Old Workshop 2026 toggle bar should appear
    expect(screen.getByText('Old Workshop 2026')).toBeInTheDocument();
    const workshopToggle = screen.getByTestId('toggle-event-ev-archived-2026');
    expect(screen.queryByTestId('event-card-ev-archived-2026')).not.toBeInTheDocument();

    // Expand Old Workshop 2026
    fireEvent.click(workshopToggle);
    expect(screen.getByTestId('event-card-ev-archived-2026')).toBeInTheDocument();
  });

  it('hides + NEW EVENT and event edit/sync/archive/delete/sheet actions when user only has calendar.view', () => {
    session.set('tok-viewer', {
      sub: 'viewer',
      role: 'admin',
      name: 'Viewer',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: { 'calendar.view': '*' }
    });

    renderPage();

    expect(screen.queryByRole('button', { name: /\+ NEW EVENT/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('toggle-event-ev-active-1'));
    expect(screen.getByTestId('event-card-ev-active-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^EDIT$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /SYNC NOW/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^ARCHIVE$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^DELETE$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /RESPONSE SHEET/i })).not.toBeInTheDocument();
  });

  it('shows REOPEN / + SLOTS button on full or closed active events, opens ReopenSlotsDialog, and submits addOnSlots', async () => {
    const mockStyles: Partial<DanceStyle>[] = [
      { id: 'st_house', name: 'House', colorKey: 'teal', active: true },
      { id: 'st_hiphop', name: 'Hip Hop', colorKey: 'orange', active: true }
    ];
    activeMockEvents = [
      {
        ...mockEvents[0],
        formUrl: 'https://docs.google.com/forms/d/f1/viewform',
        formClosed: true,
        styleSlots: { st_house: 30 },
        notifiedFullStyles: ['st_house'],
        memberCount: 30
      },
      {
        ...mockEvents[1],
        styleSlots: { st_hiphop: 40 },
        notifiedFullStyles: [],
        memberCount: 20
      }
    ];

    mockCall.mockImplementation((action: string) => {
      if (action === 'styles.list') return Promise.resolve({ data: mockStyles });
      if (action === 'events.reopenFormSlots') {
        return Promise.resolve({ data: { styleSlots: { st_house: 40 }, formResult: { formClosed: false } } });
      }
      return Promise.resolve({ data: [] });
    });

    renderPage();

    fireEvent.click(screen.getByTestId('toggle-event-ev-active-1'));
    fireEvent.click(screen.getByTestId('toggle-event-ev-active-2'));

    const reopenBtn = await screen.findByTestId('reopen-slots-btn-ev-active-1');
    expect(reopenBtn).toHaveTextContent(/REOPEN \/ \+ SLOTS/i);
    expect(reopenBtn.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByTestId('reopen-slots-btn-ev-active-2')).not.toBeInTheDocument();

    fireEvent.click(reopenBtn);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/REOPEN & ADD SLOTS: Active Class Alpha/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/30 SLOTS/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/FULL/i)).toBeInTheDocument();

    const addonInput = within(dialog).getByLabelText(/Add-on slots for House/i) as HTMLInputElement;
    expect(addonInput.value).toBe('5');
    expect(within(dialog).getByText(/New limit:.*35 slots \(reopens form\)/i)).toBeInTheDocument();

    fireEvent.change(addonInput, { target: { value: '0' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /REOPEN FORM & ADD SLOTS/i }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /Enter at least \+1 add-on slot for at least one class to reopen/i
    );
    expect(mockCall).not.toHaveBeenCalledWith('events.reopenFormSlots', expect.anything());

    fireEvent.change(addonInput, { target: { value: '10' } });
    expect(within(dialog).getByText(/New limit:.*40 slots \(reopens form\)/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /REOPEN FORM & ADD SLOTS/i }));

    await waitFor(() =>
      expect(mockCall).toHaveBeenCalledWith('events.reopenFormSlots', {
        id: 'ev-active-1',
        addOnSlots: { st_house: 10 }
      })
    );

    await waitFor(() => {
      expect(screen.getByText(/Reopened Google Form \(\+10 slots added\)/i)).toBeInTheDocument();
    });
  });

  it('hides REOPEN / + SLOTS on archived events and for users without members.import', () => {
    activeMockEvents = [
      {
        ...mockEvents[0],
        formClosed: true,
        styleSlots: { st_house: 30 },
        notifiedFullStyles: ['st_house'],
        memberCount: 30
      },
      {
        ...mockEvents[2],
        formClosed: true,
        styleSlots: { st_popping: 15 },
        notifiedFullStyles: ['st_popping'],
        memberCount: 15
      }
    ];

    session.set('tok-viewer', {
      sub: 'viewer',
      role: 'admin',
      name: 'Viewer',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: { 'calendar.view': '*' }
    });

    const { unmount } = renderPage();
    fireEvent.click(screen.getByTestId('toggle-event-ev-active-1'));
    expect(screen.queryByTestId('reopen-slots-btn-ev-active-1')).not.toBeInTheDocument();
    unmount();

    session.set('tok-admin', {
      sub: 'admin',
      role: 'admin',
      name: 'Admin',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: { 'calendar.view': '*', 'sessions.edit': '*', 'members.import': '*', 'attendance.view.all': '*' }
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /ARCHIVED EVENTS/i }));
    fireEvent.click(screen.getByRole('button', { name: /2026 ARCHIVED EVENTS/i }));
    fireEvent.click(screen.getByTestId('toggle-event-ev-archived-2026'));
    expect(screen.queryByTestId('reopen-slots-btn-ev-archived-2026')).not.toBeInTheDocument();
  });

  it('shows REOPEN / + SLOTS for a single-style active event at slot capacity even before formClosed is flagged', async () => {
    const mockStyles: Partial<DanceStyle>[] = [{ id: 'st_house', name: 'House', colorKey: 'teal', active: true }];
    activeMockEvents = [
      {
        ...mockEvents[0],
        formClosed: false,
        styleSlots: { st_house: 30 },
        notifiedFullStyles: [],
        memberCount: 30
      }
    ];
    mockCall.mockImplementation((action: string) => {
      if (action === 'styles.list') return Promise.resolve({ data: mockStyles });
      return Promise.resolve({ data: [] });
    });

    renderPage();
    fireEvent.click(screen.getByTestId('toggle-event-ev-active-1'));
    expect(await screen.findByTestId('reopen-slots-btn-ev-active-1')).toBeInTheDocument();
  });
});
