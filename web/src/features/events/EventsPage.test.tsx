// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { EventsPage } from './EventsPage';
import type { EventListItem } from '@umdsc/shared';

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

const mockEvents: EventListItem[] = [
  {
    id: 'ev-active-1',
    name: 'Active Class Alpha',
    type: 'monthly',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    styleIds: ['st_house'],
    status: 'active',
    memberCount: 30,
    version: 1,
    folderId: 'f1',
    spreadsheetId: 's1',
    sourceTab: 'Form Responses 1',
    notifiedFullStyles: []
  },
  {
    id: 'ev-active-2',
    name: 'Active Class Beta',
    type: 'monthly',
    startDate: '2026-10-05',
    endDate: '2026-11-05',
    styleIds: ['st_hiphop'],
    status: 'active',
    memberCount: 20,
    version: 1,
    folderId: 'f2',
    spreadsheetId: 's2',
    sourceTab: 'Form Responses 1',
    notifiedFullStyles: []
  },
  {
    id: 'ev-archived-2026',
    name: 'Old Workshop 2026',
    type: 'workshop',
    startDate: '2026-03-01',
    endDate: '2026-03-05',
    styleIds: ['st_popping'],
    status: 'archived',
    memberCount: 15,
    version: 1,
    folderId: 'f3',
    spreadsheetId: 's3',
    sourceTab: 'Form Responses 1',
    notifiedFullStyles: []
  },
  {
    id: 'ev-archived-2025',
    name: 'Historic Camp 2025',
    type: 'other',
    startDate: '2025-08-10',
    endDate: '2025-08-15',
    styleIds: ['st_locking'],
    status: 'archived',
    memberCount: 40,
    version: 1,
    folderId: 'f4',
    spreadsheetId: 's4',
    sourceTab: 'Form Responses 1',
    notifiedFullStyles: []
  }
];

vi.mock('./useCurrentEvent', () => ({
  useEvents: () => ({ data: mockEvents, isLoading: false }),
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
});
