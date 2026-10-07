import type React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ClassSession, DanceStyle, MusicItem, VideoItem } from '@umdsc/shared';
import { ClassCard } from './ClassCard';

const meta = { version: 1, updatedBy: 'admin', updatedAt: '2026-10-01T00:00:00.000Z', active: true };

const session: ClassSession = {
  id: 's1', eventId: 'e1', styleId: 'st1', seq: 1, date: '2026-10-15', start: '20:00', end: '22:00',
  instructorId: '', venue: 'Room 1', status: 'scheduled', note: '', ...meta
};

const music = (over: Partial<MusicItem>): MusicItem => ({
  id: 'm1', styleId: 'st1', eventId: 'e1', sessionId: 's1', title: 'HI',
  sourceType: 'youtube', driveFileId: '', youtubeId: '4_KN-gA6uXY', ...meta, ...over
} as MusicItem);

function renderCard(items: MusicItem[]) {
  return render(
    <MemoryRouter>
      <ClassCard session={session} videos={[]} music={items} />
    </MemoryRouter>
  );
}

describe('ClassCard practice music', () => {
  const SPOTIFY = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
  const SOUNDCLOUD = 'https://soundcloud.com/forss/flickermood';

  it('shows no embedded video for a YouTube track, only the practise button', () => {
    const { container } = renderCard([music({})]);
    expect(container.querySelector('iframe[src*="youtube"]')).toBeNull();
    expect(screen.getByRole('button', { name: /PRACTISE IN STUDIO/i })).toBeInTheDocument();
  });

  it('offers Open in YouTube in a new tab for a YouTube track', () => {
    renderCard([music({})]);
    const link = screen.getByRole('link', { name: 'Open in YouTube' });
    expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=4_KN-gA6uXY');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('offers both Spotify and YouTube for a Spotify song with a YouTube practice version', () => {
    renderCard([music({ spotifyUrl: SPOTIFY })]);
    expect(screen.getByRole('link', { name: 'Open in Spotify' })).toHaveAttribute('href', SPOTIFY);
    expect(screen.getByRole('link', { name: 'Open in YouTube' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PRACTISE IN STUDIO/i })).toBeInTheDocument();
  });

  it('has no practise button for a listen-only Spotify song, only Open in Spotify', () => {
    renderCard([music({ sourceType: 'spotify', youtubeId: '', spotifyUrl: SPOTIFY })]);
    expect(screen.queryByRole('button', { name: /PRACTISE IN STUDIO/i })).toBeNull();
    expect(screen.getByRole('link', { name: 'Open in Spotify' })).toHaveAttribute('href', SPOTIFY);
  });

  it('offers Open in SoundCloud for a SoundCloud song and still lets the dancer practise', () => {
    const { container } = renderCard([music({ sourceType: 'soundcloud', youtubeId: '', soundcloudUrl: SOUNDCLOUD })]);
    expect(screen.getByRole('link', { name: 'Open in SoundCloud' })).toHaveAttribute('href', SOUNDCLOUD);
    expect(screen.getByRole('button', { name: /PRACTISE IN STUDIO/i })).toBeInTheDocument();
    expect(container.querySelector('audio')).toBeNull();
  });

  it('offers a download and a player for an MP3', () => {
    const { container } = renderCard([music({ sourceType: 'mp3', youtubeId: '', driveFileId: 'drive-mp3-1' })]);
    expect(screen.getByRole('link', { name: 'Download MP3' })).toHaveAttribute(
      'href',
      'https://drive.google.com/uc?export=download&id=drive-mp3-1'
    );
    expect(container.querySelector('audio')).not.toBeNull();
  });
});

describe('ClassCard recap videos', () => {
  const video = {
    id: 'v1', title: 'Class recap', driveFileId: 'drive-abc', sessionId: 's1', styleId: 'st1', eventId: 'e1',
    mimeType: 'video/mp4', sizeBytes: 0, folderId: '', uploadedBy: 'admin', source: 'upload', ...meta
  } as unknown as VideoItem;
  const style = { id: 'st1', name: 'Locking', colorKey: 'orange', videoFolderId: 'fld-1' } as DanceStyle;

  it("plays a recap in Google Drive's own player and links to the style's video folder", () => {
    const { container } = render(
      <MemoryRouter>
        <ClassCard session={session} style={style} videos={[video]} music={[]} />
      </MemoryRouter>
    );
    expect(container.querySelector('iframe[src="https://drive.google.com/file/d/drive-abc/preview"]')).not.toBeNull();
    expect(
      container.querySelector('a[href="https://drive.google.com/drive/folders/fld-1"]')
    ).not.toBeNull();
  });
});

describe('ClassCard attendance badge while attendance loads', () => {
  const pastSession = { ...session, date: '2020-01-01' };
  const renderPast = (props: Partial<React.ComponentProps<typeof ClassCard>>) =>
    render(
      <MemoryRouter>
        <ClassCard session={pastSession} videos={[]} music={[]} {...props} />
      </MemoryRouter>
    );

  it('shows checking, not ABSENT, for a past class while attendance is still loading', () => {
    renderPast({ attendanceLoading: true });
    expect(screen.getByText(/CHECKING/)).toBeInTheDocument();
    expect(screen.queryByText(/ABSENT/)).toBeNull();
  });

  it('shows ABSENT for a past class once attendance has loaded', () => {
    renderPast({ attendanceLoading: false });
    expect(screen.getByText(/ABSENT/)).toBeInTheDocument();
  });

  it('shows ATTENDED even while loading if it is already known', () => {
    renderPast({ attendanceLoading: true, attendancePresent: true });
    expect(screen.getByText(/ATTENDED/)).toBeInTheDocument();
  });

  it('admin view hides the attendance badge and shows the given action instead', () => {
    renderPast({ attendanceLoading: false, showAttendance: false, action: <button type="button">EDIT CLASS</button> });
    expect(screen.queryByText(/ABSENT/)).toBeNull();
    expect(screen.getByRole('button', { name: 'EDIT CLASS' })).toBeInTheDocument();
  });
});
