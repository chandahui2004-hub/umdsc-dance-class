import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DanceStyle, EventSummary, MusicItem, Section } from '@umdsc/shared';

const mockPost = vi.fn();
vi.mock('../../lib/api', () => ({
  api: {
    post: (...args: any[]) => mockPost(...args)
  }
}));

const mockSessionGet = vi.fn();
vi.mock('../../lib/session', () => ({
  session: {
    get: () => mockSessionGet()
  }
}));

const mockUseBootstrap = vi.fn();
vi.mock('../auth/useBootstrap', () => ({
  useBootstrap: (...args: any[]) => mockUseBootstrap(...args)
}));

import { MusicLibraryPage } from './MusicLibraryPage';

const meta = { version: 1, updatedBy: 'admin', updatedAt: '2026-10-01T00:00:00.000Z', active: true };

const mockStyles: DanceStyle[] = [
  {
    id: 'st_pop',
    name: 'Popping',
    aliases: ['popping'],
    colorKey: 'blue',
    defaultWeekday: null,
    defaultStart: '',
    defaultEnd: '',
    defaultInstructorId: '',
    defaultVenue: '',
    attendanceFolderId: '',
    videoFolderId: '',
    ...meta
  },
  {
    id: 'st_hiphop',
    name: 'Hip Hop',
    aliases: ['hiphop'],
    colorKey: 'orange',
    defaultWeekday: null,
    defaultStart: '',
    defaultEnd: '',
    defaultInstructorId: '',
    defaultVenue: '',
    attendanceFolderId: '',
    videoFolderId: '',
    ...meta
  },
  {
    id: 'st_lock',
    name: 'Locking',
    aliases: ['locking'],
    colorKey: 'pink',
    defaultWeekday: null,
    defaultStart: '',
    defaultEnd: '',
    defaultInstructorId: '',
    defaultVenue: '',
    attendanceFolderId: '',
    videoFolderId: '',
    ...meta
  }
];

const mockEvents: EventSummary[] = [
  {
    id: 'ev_sep',
    name: 'September Intensive',
    type: 'workshop',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    status: 'archived',
    styleIds: ['st_pop', 'st_hiphop', 'st_lock']
  },
  {
    id: 'ev_oct',
    name: 'October Monthly',
    type: 'monthly',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    status: 'active',
    styleIds: ['st_pop', 'st_hiphop']
  }
];

const mockMusic: MusicItem[] = [
  {
    id: 'm_pop_mp3',
    styleId: 'st_pop',
    eventId: 'ev_oct',
    sessionId: '',
    title: 'Popping Boogie MP3',
    sourceType: 'mp3',
    driveFileId: 'drive-pop-1',
    youtubeId: '',
    ...meta
  },
  {
    id: 'm_hip_yt',
    styleId: 'st_hiphop',
    eventId: 'ev_sep',
    sessionId: 'ses_1',
    title: 'Hip Hop Boom Bap',
    sourceType: 'youtube',
    driveFileId: '',
    youtubeId: 'yt-hip-1',
    spotifyUrl: 'https://open.spotify.com/track/hiphop123',
    ...meta
  },
  {
    id: 'm_lock_sc',
    styleId: 'st_lock',
    eventId: 'ev_sep',
    sessionId: 'ses_2',
    title: 'Locking Funk Soul',
    sourceType: 'soundcloud',
    driveFileId: '',
    youtubeId: '',
    soundcloudUrl: 'https://soundcloud.com/funk/soul',
    ...meta
  },
  {
    id: 'm_pop_spot',
    styleId: 'st_pop',
    eventId: 'ev_sep',
    sessionId: '',
    title: 'Spotify Exclusive Jam',
    sourceType: 'spotify',
    driveFileId: '',
    youtubeId: '',
    spotifyUrl: 'https://open.spotify.com/track/spotonly99',
    ...meta
  }
];

const mockSections: Section[] = [
  { id: 'sec1', musicId: 'm_pop_mp3', name: 'Intro', startSec: 0, endSec: 16, videoId: '', videoStartSec: null, ...meta },
  { id: 'sec2', musicId: 'm_pop_mp3', name: 'Chorus', startSec: 16, endSec: 40, videoId: '', videoStartSec: null, ...meta }
];

const LocationProbe = () => {
  const loc = useLocation();
  return <div data-testid="navigated-location">{`${loc.pathname}${loc.search}`}</div>;
};

describe('MusicLibraryPage', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });

    mockSessionGet.mockReturnValue({
      token: 'dancer-tok',
      claims: { sub: 'M-12345', role: 'dancer', name: 'Aina', perms: {} }
    });

    // Registered dancer only enrolled in Popping in bootstrap
    mockUseBootstrap.mockReturnValue({
      isLoading: false,
      data: {
        profile: { matricKey: '12345', fullName: 'Aina', eventIds: ['ev_oct'], perms: {} },
        events: [mockEvents[1]],
        styles: [mockStyles[0]],
        music: [mockMusic[0]],
        sections: mockSections,
        videos: []
      }
    });

    mockPost.mockImplementation(async (action: string) => {
      if (action === 'music.list') return { data: mockMusic };
      if (action === 'sections.list') return { data: mockSections };
      if (action === 'styles.list') return { data: mockStyles };
      if (action === 'events.list') return { data: mockEvents };
      return { data: [] };
    });
  });

  const renderPage = (initialPath = '/library') =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/library" element={<MusicLibraryPage />} />
            <Route path="/admin/library" element={<MusicLibraryPage />} />
            <Route path="/studio" element={<LocationProbe />} />
            <Route path="/admin/studio" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

  it('renders tracks from all dance styles and past/current events grouped by Dance Style', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Popping Boogie MP3')).toBeInTheDocument();
      expect(screen.getByText('Hip Hop Boom Bap')).toBeInTheDocument();
      expect(screen.getByText('Locking Funk Soul')).toBeInTheDocument();
      expect(screen.getByText('Spotify Exclusive Jam')).toBeInTheDocument();
    });

    expect(mockPost).toHaveBeenCalledWith('music.list', {});
    expect(mockPost).toHaveBeenCalledWith('sections.list', {});
    expect(mockPost).toHaveBeenCalledWith('styles.list', {});
    expect(mockPost).toHaveBeenCalledWith('events.list', { includeArchived: true });

    // Grouped under Dance Style sections
    expect(screen.getByRole('region', { name: 'Popping' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Hip Hop' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Locking' })).toBeInTheDocument();

    // Practice sections badge and inline audio for MP3 with driveFileId
    expect(screen.getByText('2 SECTIONS')).toBeInTheDocument();
    expect(document.querySelectorAll('audio').length).toBe(1);
  });

  it('filters by Dance Style category pills, event dropdown (newest first), and search input', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Hip Hop Boom Bap')).toBeInTheDocument();
    });

    // Event dropdown sorted newest startDate first (October Monthly before September Intensive)
    const eventSelect = screen.getByLabelText('Filter music library by event') as HTMLSelectElement;
    const optionTexts = Array.from(eventSelect.options).map(o => o.textContent);
    expect(optionTexts.indexOf('October Monthly')).toBeLessThan(optionTexts.indexOf('September Intensive'));

    // Click Hip Hop category pill
    fireEvent.click(screen.getByRole('button', { name: /Hip Hop/i }));
    expect(screen.getByText('Hip Hop Boom Bap')).toBeInTheDocument();
    expect(screen.queryByText('Popping Boogie MP3')).toBeNull();
    expect(screen.queryByText('Locking Funk Soul')).toBeNull();

    // Click ALL STYLES to restore
    fireEvent.click(screen.getByRole('button', { name: /ALL STYLES/i }));
    expect(screen.getByText('Popping Boogie MP3')).toBeInTheDocument();
    expect(screen.getByText('Locking Funk Soul')).toBeInTheDocument();

    // Search by title / event / style
    const search = screen.getByLabelText('Search music library');
    fireEvent.change(search, { target: { value: 'Funk Soul' } });
    expect(screen.getByText('Locking Funk Soul')).toBeInTheDocument();
    expect(screen.queryByText('Popping Boogie MP3')).toBeNull();

    // No match -> EmptyState + CLEAR FILTERS
    fireEvent.change(search, { target: { value: 'Nonexistent Track' } });
    expect(screen.getByText(/NO TRACKS MATCH/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /CLEAR FILTERS/i }));
    expect(screen.getByText('Popping Boogie MP3')).toBeInTheDocument();

    // Filter by Event
    fireEvent.change(eventSelect, { target: { value: 'ev_oct' } });
    expect(screen.getByText('Popping Boogie MP3')).toBeInTheDocument();
    expect(screen.queryByText('Hip Hop Boom Bap')).toBeNull();
  });

  it('navigates to /studio?music=<id> for dancers and renders musicAppLinks + listen-only Spotify state', async () => {
    renderPage('/library');

    await waitFor(() => {
      expect(screen.getByText('Popping Boogie MP3')).toBeInTheDocument();
      expect(screen.getByText('Hip Hop Boom Bap')).toBeInTheDocument();
      expect(screen.getByText('Spotify Exclusive Jam')).toBeInTheDocument();
    });

    // External musicAppLinks
    const downloadLink = screen.getByRole('link', { name: /Download MP3/i });
    expect(downloadLink).toHaveAttribute('href', 'https://drive.google.com/uc?export=download&id=drive-pop-1');
    expect(downloadLink).toHaveAttribute('target', '_blank');

    expect(screen.getByRole('link', { name: /Open in YouTube/i })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=yt-hip-1'
    );
    expect(screen.getByRole('link', { name: /Open in SoundCloud/i })).toHaveAttribute(
      'href',
      'https://soundcloud.com/funk/soul'
    );

    // Listen-only Spotify card does NOT have PLAY IN STUDIO
    const spotCard = screen.getByTestId('library-track-m_pop_spot');
    expect(within(spotCard).getByText('LISTEN ONLY (SPOTIFY)')).toBeInTheDocument();
    expect(within(spotCard).queryByRole('button', { name: /PLAY IN STUDIO/i })).toBeNull();
    expect(within(spotCard).getByRole('link', { name: /Open in Spotify/i })).toHaveAttribute(
      'href',
      'https://open.spotify.com/track/spotonly99'
    );

    // Click PLAY IN STUDIO on Popping Boogie MP3
    const popCard = screen.getByTestId('library-track-m_pop_mp3');
    fireEvent.click(within(popCard).getByRole('button', { name: /PLAY IN STUDIO/i }));
    expect(screen.getByTestId('navigated-location')).toHaveTextContent('/studio?music=m_pop_mp3');
  });

  it('navigates to /admin/studio?music=<id> and /admin/studio for admins', async () => {
    mockSessionGet.mockReturnValue({
      token: 'admin-tok',
      claims: { sub: 'admin', role: 'admin', name: 'Club Admin', perms: {} }
    });

    renderPage('/admin/library');

    await waitFor(() => {
      expect(screen.getByText('Hip Hop Boom Bap')).toBeInTheDocument();
    });

    const hipCard = screen.getByTestId('library-track-m_hip_yt');
    fireEvent.click(within(hipCard).getByRole('button', { name: /PLAY IN STUDIO/i }));
    expect(screen.getByTestId('navigated-location')).toHaveTextContent('/admin/studio?music=m_hip_yt');
  });

  it('OPEN STUDIO header button navigates to studioBasePath', async () => {
    renderPage('/library');
    await waitFor(() => expect(screen.getByText('MUSIC LIBRARY')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /OPEN STUDIO/i }));
    expect(screen.getByTestId('navigated-location')).toHaveTextContent('/studio');
  });

  it('guards against non-array API responses and falls back to bootstrap data without crashing', async () => {
    mockPost.mockResolvedValue({ data: {} });

    renderPage('/library');

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('music.list', {});
    });

    expect(screen.getByText('Popping Boogie MP3')).toBeInTheDocument();
  });

  it('renders an Uncategorized bucket for tracks with unknown styleId', async () => {
    mockPost.mockImplementation(async (action: string) => {
      if (action === 'music.list') {
        return {
          data: [
            ...mockMusic,
            {
              id: 'm_orphan',
              styleId: 'st_missing',
              eventId: 'ev_oct',
              sessionId: '',
              title: 'Mystery Style Track',
              sourceType: 'youtube',
              driveFileId: '',
              youtubeId: 'yt-unk',
              ...meta
            }
          ]
        };
      }
      if (action === 'sections.list') return { data: mockSections };
      if (action === 'styles.list') return { data: mockStyles };
      if (action === 'events.list') return { data: mockEvents };
      return { data: [] };
    });

    renderPage('/library');

    await waitFor(() => {
      expect(screen.getByText('Mystery Style Track')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Uncategorized/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Uncategorized' })).toBeInTheDocument();
  });

  it('shows COULD NOT LOAD MUSIC LIBRARY with RETRY button when music.list fails and recovers on retry', async () => {
    mockUseBootstrap.mockReturnValue({
      isLoading: false,
      data: {
        profile: { matricKey: '12345', fullName: 'Aina', eventIds: [], perms: {} },
        events: [],
        styles: [],
        music: [],
        sections: [],
        videos: []
      }
    });

    let failMusic = true;
    mockPost.mockImplementation(async (action: string) => {
      if (action === 'music.list') {
        if (failMusic) throw new Error('Network error');
        return { data: mockMusic };
      }
      if (action === 'sections.list') return { data: mockSections };
      if (action === 'styles.list') return { data: mockStyles };
      if (action === 'events.list') return { data: mockEvents };
      return { data: [] };
    });

    renderPage('/library');

    await waitFor(() => {
      expect(screen.getByText('COULD NOT LOAD MUSIC LIBRARY')).toBeInTheDocument();
    });
    expect(screen.queryByText('NO MUSIC IN LIBRARY YET')).not.toBeInTheDocument();

    failMusic = false;
    fireEvent.click(screen.getByRole('button', { name: /RETRY/i }));

    await waitFor(() => {
      expect(screen.getByText('Popping Boogie MP3')).toBeInTheDocument();
    });
    expect(screen.queryByText('COULD NOT LOAD MUSIC LIBRARY')).not.toBeInTheDocument();
  });

  it('gives library track cards min-w-0 inside grid-cols-1 to prevent 360px horizontal overflow', async () => {
    renderPage('/library');

    await waitFor(() => {
      expect(screen.getByTestId('library-track-m_pop_mp3')).toBeInTheDocument();
    });

    expect(screen.getByTestId('library-track-m_pop_mp3').className).toContain('min-w-0');
  });
});
