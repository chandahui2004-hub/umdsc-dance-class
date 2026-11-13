import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
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

const mockSpotifyMusic = {
  id: 'm2',
  eventId: 'ev-oct',
  styleId: 'st-pop',
  sessionId: 's1',
  title: 'Spotify Listen Only Track',
  sourceType: 'spotify',
  youtubeId: '',
  driveFileId: '',
  spotifyUrl: 'https://open.spotify.com/track/spot1',
  active: true,
  version: 1,
  updatedBy: 'admin',
  updatedAt: ''
};

const LocationProbe = () => {
  const loc = useLocation();
  return <div data-testid="navigated-location">{`${loc.pathname}${loc.search}`}</div>;
};

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
          <Routes>
            <Route path="/admin/media" element={<MediaPage />} />
            <Route path="/admin/studio" element={<LocationProbe />} />
          </Routes>
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

  it('renders PLAY IN STUDIO on playable music cards, hides it on Spotify listen-only cards, and navigates to /admin/studio?music=m1', async () => {
    mockPost.mockImplementation(async (action: string) => {
      if (action === 'styles.list') return { ok: true, data: mockStyles };
      if (action === 'instructors.list') return { ok: true, data: [] };
      if (action === 'sessions.list') return { ok: true, data: mockSessions };
      if (action === 'videos.list') return { ok: true, data: mockVideos };
      if (action === 'music.list') return { ok: true, data: [...mockMusic, mockSpotifyMusic] };
      return { ok: true, data: [] };
    });

    session.set('tok-music-rep', {
      sub: 'rep',
      role: 'admin',
      name: 'Class Rep',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: { 'music.view': '*', 'music.edit': '*' }
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Funk Track 1')).toBeInTheDocument();
      expect(screen.getByText('Spotify Listen Only Track')).toBeInTheDocument();
    });

    const playableCard = screen.getByTestId('music-card-m1');
    const spotifyCard = screen.getByTestId('music-card-m2');

    expect(within(playableCard).getByRole('button', { name: /▶ PLAY IN STUDIO/i })).toBeInTheDocument();
    expect(within(playableCard).getByRole('button', { name: /MANAGE SECTIONS/i })).toBeInTheDocument();
    expect(within(playableCard).getByRole('button', { name: /^DELETE$/i })).toBeInTheDocument();

    expect(within(spotifyCard).queryByRole('button', { name: /PLAY IN STUDIO/i })).not.toBeInTheDocument();

    fireEvent.click(within(playableCard).getByRole('button', { name: /▶ PLAY IN STUDIO/i }));
    expect(screen.getByTestId('navigated-location')).toHaveTextContent('/admin/studio?music=m1');
  });

  it('still renders PLAY IN STUDIO when role only has music.view', async () => {
    session.set('tok-music-viewer', {
      sub: 'viewer',
      role: 'admin',
      name: 'Music Viewer',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: { 'music.view': '*' }
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Funk Track 1')).toBeInTheDocument();
    });

    const playableCard = screen.getByTestId('music-card-m1');
    expect(within(playableCard).getByRole('button', { name: /▶ PLAY IN STUDIO/i })).toBeInTheDocument();
    expect(within(playableCard).queryByRole('button', { name: /MANAGE SECTIONS/i })).not.toBeInTheDocument();
    expect(within(playableCard).queryByRole('button', { name: /^DELETE$/i })).not.toBeInTheDocument();
  });

  it('applies 360px wrapping and truncation classes in the Practice Music header, empty state, and card title row', async () => {
    mockPost.mockImplementation(async (action: string) => {
      if (action === 'styles.list') return { ok: true, data: mockStyles };
      if (action === 'instructors.list') return { ok: true, data: [] };
      if (action === 'sessions.list') return { ok: true, data: mockSessions };
      if (action === 'videos.list') return { ok: true, data: mockVideos };
      if (action === 'music.list') return { ok: true, data: mockMusic };
      return { ok: true, data: [] };
    });

    session.set('tok-music-editor', {
      sub: 'rep',
      role: 'admin',
      name: 'Class Rep',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: { 'music.view': '*', 'music.edit': '*' }
    });

    const { unmount } = renderPage();

    await waitFor(() => {
      expect(screen.getByText('Funk Track 1')).toBeInTheDocument();
    });

    const addLinkBtn = screen.getByRole('button', { name: '+ MUSIC LINK' });
    const headerBtnGroup = addLinkBtn.parentElement!;
    const headerRow = headerBtnGroup.parentElement!;
    expect(headerBtnGroup.className).toContain('flex-wrap');
    expect(headerRow.className).toContain('flex-wrap');
    expect(headerRow.className).toContain('gap-2');

    const titleHeading = screen.getByRole('heading', { name: 'Funk Track 1' });
    const titleRow = titleHeading.parentElement!;
    expect(titleRow.className).toContain('w-full');
    expect(titleRow.className).toContain('min-w-0');
    expect(titleHeading.className).toContain('w-full');
    expect(titleHeading.className).toContain('min-w-0');
    expect(titleHeading.className).toContain('truncate');

    unmount();

    // Empty music state buttons also wrap on narrow screens
    queryClient.clear();
    mockPost.mockImplementation(async (action: string) => {
      if (action === 'styles.list') return { ok: true, data: mockStyles };
      if (action === 'instructors.list') return { ok: true, data: [] };
      if (action === 'sessions.list') return { ok: true, data: mockSessions };
      if (action === 'videos.list') return { ok: true, data: mockVideos };
      if (action === 'music.list') return { ok: true, data: [] };
      return { ok: true, data: [] };
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ADD MUSIC LINK' })).toBeInTheDocument();
    });

    const emptyActionWrapper = screen.getByRole('button', { name: 'ADD MUSIC LINK' }).parentElement!;
    expect(emptyActionWrapper.className).toContain('flex-wrap');
  });
});

