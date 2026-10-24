// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationWidget } from './NotificationWidget';
import { _resetInternalStateForTesting, resetMascotToIdle } from '../../hooks/useInactivityTimer';
import type { EventListItem, Member, DancerBootstrap, AdminBootstrap } from '@umdsc/shared';

const mockCall = vi.fn();
vi.mock('../../lib/api', () => ({
  call: (...args: any[]) => mockCall(...args),
  errorMessage: (err: any) => String(err)
}));

let mockRole: 'admin' | 'dancer' = 'admin';

vi.mock('../../lib/session', () => ({
  session: {
    get: () => ({
      token: 'mock-token',
      claims: {
        role: mockRole,
        name: mockRole === 'admin' ? 'Admin' : 'Chan Da Hui',
        sub: mockRole === 'admin' ? 'admin1' : 'M-23005147'
      }
    })
  }
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

const mockDancerBootstrap: DancerBootstrap = {
  profile: { matricKey: '23005147', fullName: 'Chan Da Hui', eventIds: ['ev-1'], perms: {} },
  events: [
    {
      id: 'ev-1',
      name: 'House Foundation',
      type: 'monthly',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      status: 'active',
      styleIds: ['st_house']
    }
  ],
  styles: [
    {
      id: 'st_house',
      name: 'House',
      colorKey: 'gold',
      aliases: [],
      active: true,
      attendanceFolderId: '',
      videoFolderId: '',
      defaultVenue: '',
      defaultStart: '',
      defaultEnd: '',
      defaultInstructorId: '',
      defaultWeekday: null,
      updatedAt: '',
      updatedBy: '',
      version: 1
    }
  ],
  instructors: [
    {
      id: 'ins_1',
      name: 'Instructor Ken',
      active: true,
      contact: '0123456789',
      styleIds: ['st_house'],
      version: 1,
      updatedBy: '',
      updatedAt: ''
    }
  ],
  sessions: [
    {
      id: 'ses_1',
      eventId: 'ev-1',
      styleId: 'st_house',
      instructorId: 'ins_1',
      date: '2026-10-25',
      start: '20:00',
      end: '22:00',
      venue: 'Studio A',
      status: 'scheduled',
      active: true,
      seq: 1,
      note: '',
      version: 1,
      updatedBy: '',
      updatedAt: ''
    }
  ],
  attendance: [],
  videos: [
    {
      id: 'vid_1',
      eventId: 'ev-1',
      sessionId: 'ses_1',
      styleId: 'st_house',
      title: 'House Routine Part 1',
      driveFileId: 'drv_1',
      mimeType: 'video/mp4',
      sizeBytes: 100,
      folderId: 'f1',
      uploadedBy: 'admin',
      source: 'upload',
      active: true,
      version: 1,
      updatedBy: '',
      updatedAt: ''
    }
  ],
  music: [
    {
      id: 'mus_1',
      eventId: 'ev-1',
      sessionId: 'ses_1',
      styleId: 'st_house',
      title: 'Deep House Groove',
      sourceType: 'youtube',
      youtubeId: 'xyz123',
      driveFileId: '',
      soundcloudUrl: '',
      spotifyUrl: '',
      active: true,
      version: 1,
      updatedBy: '',
      updatedAt: ''
    }
  ],
  sections: []
};

const mockAdminBootstrap: AdminBootstrap = {
  profile: { username: 'admin', displayName: 'Admin', perms: {} as any },
  styles: mockDancerBootstrap.styles,
  instructors: mockDancerBootstrap.instructors,
  sessions: mockDancerBootstrap.sessions,
  events: mockEvents as any,
  videos: [],
  music: [],
  sections: [],
  settings: {},
  roles: []
};

vi.mock('../../features/events/useCurrentEvent', () => ({
  useEvents: () => ({ data: mockEvents, isLoading: false })
}));

vi.mock('../../features/auth/useBootstrap', () => ({
  useBootstrap: (role: string) => ({
    data: role === 'dancer' ? mockDancerBootstrap : mockAdminBootstrap,
    isLoading: false
  })
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

describe('NotificationWidget Floating Center and Role Modes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetInternalStateForTesting();
    mockRole = 'admin';
    mockCall.mockImplementation((action: string) => {
      if (action === 'members.list') {
        return Promise.resolve({ data: mockMembers });
      }
      if (action === 'audit.list') {
        return Promise.resolve({ data: mockAudit });
      }
    });
  });

  afterEach(() => {
    cleanup();
    _resetInternalStateForTesting();
  });

  it('renders floating bell button and toggles admin retro side drawer', () => {
    mockRole = 'admin';
    renderWidget();

    // Floating bell button exists
    const bellBtn = screen.getByTestId('notification-bell-btn');
    expect(bellBtn).toBeInTheDocument();

    // Drawer is closed initially
    expect(screen.queryByTestId('notification-drawer')).not.toBeInTheDocument();

    // Click to open drawer
    fireEvent.click(bellBtn);
    expect(screen.getByTestId('notification-drawer')).toBeInTheDocument();

    // Three admin tabs exist
    expect(screen.getByRole('tab', { name: /NEW DANCERS/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /SLOT PROGRESS/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /SYSTEM & AUDIT/i })).toBeInTheDocument();

    // Close drawer
    const closeBtn = screen.getByRole('button', { name: /CLOSE/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByTestId('notification-drawer')).not.toBeInTheDocument();
  });

  it('switches between the 3 admin tabs', async () => {
    mockRole = 'admin';
    renderWidget();

    fireEvent.click(screen.getByTestId('notification-bell-btn'));

    // Tab 1: NEW DANCERS
    expect(await screen.findByText('Chan Da Hui')).toBeInTheDocument();

    // Switch to Tab 2: SLOT PROGRESS
    const slotTab = screen.getByRole('tab', { name: /SLOT PROGRESS/i });
    fireEvent.click(slotTab);
    expect(await screen.findByText('House Foundation · House')).toBeInTheDocument();
    expect(screen.getByText(/Filled:\s*28/i)).toBeInTheDocument();
    expect(screen.getByText(/Capacity:\s*30/i)).toBeInTheDocument();

    // Switch to Tab 3: SYSTEM & AUDIT
    const auditTab = screen.getByRole('tab', { name: /SYSTEM & AUDIT/i });
    fireEvent.click(auditTab);
    expect(await screen.findByText(/events\.sync/i)).toBeInTheDocument();
  });

  it('renders dancer personal tabs (MY CLASSES, UPCOMING, PRACTICE) for dancer role', async () => {
    mockRole = 'dancer';
    renderWidget();

    fireEvent.click(screen.getByTestId('notification-bell-btn'));

    // Should display Dancer tabs, NOT admin tabs
    expect(screen.getByRole('tab', { name: /MY CLASSES/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /UPCOMING/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /PRACTICE/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /NEW DANCERS/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /SYSTEM & AUDIT/i })).not.toBeInTheDocument();

    // Tab 1 (MY CLASSES): shows enrolled event and style
    expect(await screen.findByText('House Foundation')).toBeInTheDocument();
    expect(await screen.findByText('House')).toBeInTheDocument();

    // Switch to Tab 2 (UPCOMING): shows next session
    fireEvent.click(screen.getByRole('tab', { name: /UPCOMING/i }));
    expect(await screen.findByText(/Studio A/i)).toBeInTheDocument();
    expect(await screen.findByText(/Instructor Ken/i)).toBeInTheDocument();

    // Switch to Tab 3 (PRACTICE): shows routine video in categorized group panel and practice track
    fireEvent.click(screen.getByRole('tab', { name: /PRACTICE/i }));
    
    // Group Panel Header
    const houseBadges = await screen.findAllByText('HOUSE');
    expect(houseBadges.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('1 VIDEO')).toBeInTheDocument();

    // Video Card & Metadata Details
    expect(screen.getByText('House Routine Part 1')).toBeInTheDocument();
    expect(screen.getAllByText('House Foundation').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('2026-10-25')).toBeInTheDocument();
    expect(screen.getByText('20:00 - 22:00')).toBeInTheDocument();
    expect(screen.getByText('Instructor Ken')).toBeInTheDocument();
    expect(screen.getByText('Deep House Groove')).toBeInTheDocument();

    // Toggle Watch Video button to show inline player
    const watchBtn = screen.getByRole('button', { name: /▶ WATCH VIDEO/i });
    fireEvent.click(watchBtn);
    expect(screen.getAllByTitle('House Routine Part 1').length).toBe(2);
    expect(screen.getByRole('button', { name: /■ HIDE PLAYER/i })).toBeInTheDocument();
  });

  it('supports dragging the floating notification button across the screen', () => {
    renderWidget();

    const bellContainer = screen.getByTestId('notification-bell-container');
    const bellBtn = screen.getByTestId('notification-bell-btn');

    // Initially position style is not custom inline
    expect(bellContainer.style.left).toBe('');

    // Simulate drag gesture
    fireEvent.mouseDown(bellBtn, { clientX: 200, clientY: 100, button: 0 });
    fireEvent.mouseMove(window, { clientX: 260, clientY: 180 });
    fireEvent.mouseUp(window);

    // Expect container to update position styles
    expect(bellContainer.style.left).not.toBe('');
    expect(bellContainer.style.top).not.toBe('');
  });

  it('resolves raw style IDs to readable dance style names in Slot Progress tab', async () => {
    mockRole = 'admin';
    renderWidget();

    fireEvent.click(screen.getByTestId('notification-bell-btn'));
    const slotTab = screen.getByRole('tab', { name: /SLOT PROGRESS/i });
    fireEvent.click(slotTab);

    // Should display human-readable style name 'House', not raw 'st_house' or uppercase hash
    expect(await screen.findByText('House Foundation · House')).toBeInTheDocument();
  });

  it('renders MascotAvatar inside the floating notification button with idle animation by default', () => {
    renderWidget();

    const mascot = screen.getByTestId('mascot-avatar');
    expect(mascot).toBeInTheDocument();
    expect(mascot).toHaveAttribute('data-animation', 'idle');
  });

  it('switches mascot to dance animation after 5s inactivity, cycles dances sequentially, ignores mousemove, and reverts to idle only on mascot click', () => {
    vi.useFakeTimers();
    try {
      _resetInternalStateForTesting();
      resetMascotToIdle(5000);
      renderWidget();
      const mascot = screen.getByTestId('mascot-avatar');
      const bellBtn = screen.getByTestId('notification-bell-btn');
      expect(mascot).toHaveAttribute('data-animation', 'idle');

      // Fast forward 5 seconds of inactivity -> starts dance_1
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(mascot).toHaveAttribute('data-animation', 'dance_1');

      // After 2.5s -> rotates to dance_2
      act(() => {
        vi.advanceTimersByTime(2500);
      });
      expect(mascot).toHaveAttribute('data-animation', 'dance_2');

      // After 2.5s -> rotates to dance_3
      act(() => {
        vi.advanceTimersByTime(2500);
      });
      expect(mascot).toHaveAttribute('data-animation', 'dance_3');

      // Arbitrary user interactions (mousemove, scroll) must NOT stop dancing
      act(() => {
        fireEvent.pointerMove(window);
        fireEvent.scroll(window);
      });
      expect(mascot).toHaveAttribute('data-animation', 'dance_3');

      // ONLY clicking on the mascot returns it back to idle mode
      act(() => {
        fireEvent.click(bellBtn);
      });
      expect(mascot).toHaveAttribute('data-animation', 'idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does NOT stop dancing or reset timer when clicking inside or closing the notification drawer', () => {
    vi.useFakeTimers();
    try {
      _resetInternalStateForTesting();
      resetMascotToIdle(5000);
      renderWidget();
      const mascot = screen.getByTestId('mascot-avatar');
      const bellBtn = screen.getByTestId('notification-bell-btn');

      // Click to open notification drawer while idle
      act(() => {
        fireEvent.click(bellBtn);
      });
      expect(screen.getByTestId('notification-drawer')).toBeInTheDocument();

      // Inactivity timeout triggers while drawer is open
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(mascot).toHaveAttribute('data-animation', 'dance_1');

      // Clicking tabs inside the drawer must NOT stop dancing
      const slotTab = screen.getByRole('tab', { name: /SLOT PROGRESS/i });
      act(() => {
        fireEvent.click(slotTab);
      });
      expect(mascot).toHaveAttribute('data-animation', 'dance_1');

      // Clicking CLOSE button on the drawer must NOT stop dancing or reset timer
      const closeBtn = screen.getByRole('button', { name: /CLOSE/i });
      act(() => {
        fireEvent.click(closeBtn);
      });
      expect(screen.queryByTestId('notification-drawer')).not.toBeInTheDocument();
      // Mascot MUST STILL BE DANCING
      expect(mascot).toHaveAttribute('data-animation', 'dance_1');

      // Time continues cycling to dance_2
      act(() => {
        vi.advanceTimersByTime(2500);
      });
      expect(mascot).toHaveAttribute('data-animation', 'dance_2');
    } finally {
      vi.useRealTimers();
    }
  });
});

