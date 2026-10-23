// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationWidget } from './NotificationWidget';
import type { EventListItem, Member } from '@umdsc/shared';

const mockCall = vi.fn();
vi.mock('../../lib/api', () => ({
  call: (...args: any[]) => mockCall(...args),
  errorMessage: (err: any) => String(err)
}));

const mockEvents: EventListItem[] = [
  {
    id: 'ev-1',
    name: 'House Foundation',
    type: 'monthly',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    styleIds: ['st_house'],
    styleSlots: { st_house: 30 },
    status: 'active',
    memberCount: 28,
    version: 1,
    folderId: 'f1',
    sourceSheetId: 's1',
    membersSpreadsheetId: 's1',
    videoFolderId: 'v1',
    columnMapJson: '{}',
    classIndex: 0,
    styleInstructors: {},
    sourceRowCount: 28,
    sourceLastRowHash: 'h1',
    lastSyncAt: '2026-10-01T00:00:00Z',
    lastSyncError: '',
    nameKey: 'house foundation',
    folderMissing: false,
    sourceTab: 'Form Responses 1',
    notifiedFullStyles: [],
    updatedBy: 'admin',
    updatedAt: '2026-10-01T00:00:00Z',
    active: true
  }
];

const mockMembers: Member[] = [
  {
    memberId: 'M-23005147',
    matricKey: '23005147',
    matricRaw: '23005147',
    fullName: 'Chan Da Hui',
    nameKey: 'chan da hui',
    email: 'dahui@test.com',
    contact: '0123456789',
    gender: 'M',
    nationality: 'Malaysian',
    styleIds: ['st_house'],
    styleNames: ['House'],
    flags: [],
    sourceTimestamp: new Date().toISOString()
  }
];

const mockAudit = [
  {
    id: 'log-1',
    ts: '2026-10-21T12:00:00Z',
    actor: 'system',
    action: 'events.sync',
    target: 'ev-1',
    detail: '+2 new, 1 updated'
  }
];

vi.mock('../../features/events/useCurrentEvent', () => ({
  useEvents: () => ({ data: mockEvents, isLoading: false })
}));

function renderWidget() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationWidget />
    </QueryClientProvider>
  );
}

describe('NotificationWidget Floating Center and 3-Tab Drawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCall.mockImplementation((action: string) => {
      if (action === 'members.list') {
        return Promise.resolve({ data: mockMembers });
      }
      if (action === 'audit.list') {
        return Promise.resolve({ data: mockAudit });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it('renders floating bell button and toggles retro side drawer', () => {
    renderWidget();

    // Floating bell button exists
    const bellBtn = screen.getByTestId('notification-bell-btn');
    expect(bellBtn).toBeInTheDocument();

    // Drawer is closed initially
    expect(screen.queryByTestId('notification-drawer')).not.toBeInTheDocument();

    // Click to open drawer
    fireEvent.click(bellBtn);
    expect(screen.getByTestId('notification-drawer')).toBeInTheDocument();

    // Three tabs exist
    expect(screen.getByRole('tab', { name: /NEW DANCERS/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /SLOT PROGRESS/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /SYSTEM & AUDIT/i })).toBeInTheDocument();

    // Close drawer
    const closeBtn = screen.getByRole('button', { name: /CLOSE/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByTestId('notification-drawer')).not.toBeInTheDocument();
  });

  it('switches between the 3 tabs: NEW DANCERS, SLOT PROGRESS, and SYSTEM & AUDIT', async () => {
    renderWidget();

    fireEvent.click(screen.getByTestId('notification-bell-btn'));

    // Tab 1: NEW DANCERS (default active tab)
    expect(await screen.findByText('Chan Da Hui')).toBeInTheDocument();

    // Switch to Tab 2: SLOT PROGRESS
    const slotTab = screen.getByRole('tab', { name: /SLOT PROGRESS/i });
    fireEvent.click(slotTab);

    expect(await screen.findByText('House Foundation · HOUSE')).toBeInTheDocument();
    expect(await screen.findByText(/28 \/ 30/i)).toBeInTheDocument();

    // Switch to Tab 3: SYSTEM & AUDIT
    const auditTab = screen.getByRole('tab', { name: /SYSTEM & AUDIT/i });
    fireEvent.click(auditTab);

    expect(await screen.findByText(/events\.sync/i)).toBeInTheDocument();
  });
});
