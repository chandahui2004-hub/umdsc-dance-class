import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AttendancePage } from './AttendancePage';
import { session } from '../../lib/session';

const mockPost = vi.fn();
vi.mock('../../lib/api', () => ({
  api: { post: (...args: any[]) => mockPost(...args) },
  errorMessage: (err: any) => String(err)
}));

const mockEvent = {
  id: 'ev-oct',
  name: 'OCT MONTHLY CLASS',
  status: 'active',
  styleIds: ['st-lat'],
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  folderId: 'fld-ev',
  membersSpreadsheetId: 'ss-mem'
};

vi.mock('../events/useCurrentEvent', () => ({
  useCurrentEvent: () => ({
    events: [mockEvent],
    current: mockEvent,
    setCurrentId: vi.fn(),
    isLoading: false,
    isAll: false
  })
}));

const mockStyles = [
  { id: 'st-lat', name: 'Latin', colorKey: 'yellow', active: true, attendanceFolderId: 'fld-att-lat' }
];

const mockGrid = {
  eventId: 'ev-oct',
  styleId: 'st-lat',
  version: 1,
  spreadsheetId: 'sheet-lat-123',
  sessions: [
    { id: 's1', eventId: 'ev-oct', styleId: 'st-lat', seq: 1, date: '2026-10-13', start: '20:00', end: '22:00', instructorId: 'i1', venue: 'Studio', status: 'scheduled', note: '', active: true, version: 1, updatedBy: 'admin', updatedAt: '' }
  ],
  members: [
    { memberId: 'm1', fullName: 'Lee Jo Yee', matric: '24004878' }
  ],
  present: { m1: ['s1'] }
};

describe('AttendancePage permission gating', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    mockPost.mockImplementation(async (action: string) => {
      if (action === 'styles.list') return { ok: true, data: mockStyles };
      if (action === 'attendance.get') return { ok: true, data: mockGrid };
      return { ok: true, data: [] };
    });
  });

  const renderPage = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/attendance?styleId=st-lat']}>
          <AttendancePage />
        </MemoryRouter>
      </QueryClientProvider>
    );

  it('hides EDIT, FULL SCREEN, EXPORT XLSX, and OPEN SHEET for a view-only role (ATTENDANCE VIEWER)', async () => {
    session.set('tok-viewer', {
      sub: 'MDA',
      role: 'admin',
      roleName: 'Attendance Viewer',
      name: 'MDA',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: { 'attendance.view.all': '*' }
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('Lee Jo Yee').length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/SAVED ATTENDANCE — VIEW ONLY/i)).toBeInTheDocument();
    expect(screen.queryByText(/PRESS EDIT TO CHANGE TICKS/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^EDIT$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /FULL SCREEN/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /EXPORT XLSX/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /OPEN LATIN SHEET/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /REFRESH/i })).toBeInTheDocument();
  });

  it('shows EDIT, FULL SCREEN, EXPORT XLSX, and OPEN SHEET when the role has attendance.edit and export.download', async () => {
    session.set('tok-editor', {
      sub: 'admin_boss',
      role: 'admin',
      roleName: 'Admin',
      name: 'Super Admin',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: { 'attendance.view.all': '*', 'attendance.edit': '*', 'export.download': '*' }
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('Lee Jo Yee').length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/SAVED ATTENDANCE — PRESS EDIT TO CHANGE TICKS/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^EDIT$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /FULL SCREEN/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /EXPORT XLSX/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /OPEN LATIN SHEET/i })).toBeInTheDocument();
  });
});

