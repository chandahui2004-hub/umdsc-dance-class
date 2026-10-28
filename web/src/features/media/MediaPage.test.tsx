import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MediaPage } from './MediaPage';
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
  styleIds: ['st-pop'],
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  folderId: 'fld-ev',
  videoFolderId: 'fld-vid',
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
  { id: 'st-pop', name: 'Popping', colorKey: 'blue', active: true, videoFolderId: 'fld-pop-vid' }
];

const mockSessions = [
  { id: 's1', eventId: 'ev-oct', styleId: 'st-pop', seq: 1, date: '2026-10-13', start: '20:00', end: '22:00', instructorId: 'i1', venue: 'Studio', status: 'scheduled', note: '', active: true, version: 1, updatedBy: 'admin', updatedAt: '' }
];

const mockVideos = [
  { id: 'v1', eventId: 'ev-oct', styleId: 'st-pop', sessionId: 's1', title: 'Popping Recap #1', driveFileId: 'drv-v1', mimeType: 'video/mp4', sizeBytes: 1000, folderId: 'fld-pop-vid', uploadedBy: 'admin', source: 'upload', active: true, version: 1, updatedBy: 'admin', updatedAt: '' }
];

const mockMusic = [
  { id: 'm1', eventId: 'ev-oct', styleId: 'st-pop', sessionId: 's1', title: 'Funk Track 1', sourceType: 'youtube', youtubeId: 'yt123', driveFileId: '', active: true, version: 1, updatedBy: 'admin', updatedAt: '' }
];

describe('MediaPage permission gating', () => {
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
      if (action === 'instructors.list') return { ok: true, data: [] };
      if (action === 'sessions.list') return { ok: true, data: mockSessions };
      if (action === 'videos.list') return { ok: true, data: mockVideos };
      if (action === 'music.list') return { ok: true, data: mockMusic };
      return { ok: true, data: [] };
    });
  });

  const renderPage = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/media?style=st-pop']}>
          <MediaPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

  it('hides upload/scan/delete buttons, music section, and folder panel when role only has videos.view', async () => {
    session.set('tok-vid-viewer', {
      sub: 'viewer',
      role: 'admin',
      name: 'Video Viewer',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: { 'videos.view': '*' }
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Popping Recap #1')).toBeInTheDocument();
    });

    // Videos panel is shown, but upload/scan/delete and session edit buttons are hidden
    expect(screen.queryByRole('button', { name: /\+ ADD RECAP/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /SCAN DRIVE FOLDER/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^DELETE$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /✎ EDIT/i })).not.toBeInTheDocument();

    // Music panel and ClassLeadVideoFoldersPanel are hidden because user has no music/folder permissions
    expect(screen.queryByText(/PRACTICE MUSIC/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('class-lead-video-folders-panel')).not.toBeInTheDocument();
  });
});

