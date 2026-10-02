import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MusicItem } from '@umdsc/shared';
import { ClassMusicList } from './ClassMusicList';

const meta = { version: 1, updatedBy: 'a', updatedAt: '', active: true };
const song = (id: string, over: Partial<MusicItem>): MusicItem => ({
  id, styleId: 's', eventId: 'e', sessionId: '', title: `Song ${id}`,
  sourceType: 'youtube', driveFileId: '', youtubeId: 'x', ...meta, ...over
} as MusicItem);

describe('ClassMusicList source badge', () => {
  it.each([
    ['mp3', 'MP3'],
    ['youtube', 'YouTube'],
    ['soundcloud', 'SoundCloud'],
    ['spotify', 'Spotify']
  ] as const)('labels a %s song as %s', (sourceType, label) => {
    render(
      <ClassMusicList
        music={[song('1', { sourceType })]}
        styles={[]}
        events={[]}
        selectedMusicId={null}
        onSelectMusic={vi.fn()}
      />
    );
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('ClassMusicList filters', () => {
  const events = [
    { id: 'ev1', name: 'October Event', startDate: '2026-10-01', endDate: '2026-10-31', type: 'monthly' as const, status: 'active' as const, styleIds: ['st1'] },
    { id: 'ev2', name: 'November Event', startDate: '2026-11-01', endDate: '2026-11-30', type: 'monthly' as const, status: 'active' as const, styleIds: ['st2'] }
  ];
  const styles = [
    { id: 'st1', name: 'Locking', aliases: ['locking'], colorKey: 'orange', defaultWeekday: null, defaultStart: '', defaultEnd: '', defaultInstructorId: '', defaultVenue: '', attendanceFolderId: '', videoFolderId: '', version: 1, updatedBy: 'a', updatedAt: '', active: true },
    { id: 'st2', name: 'Popping', aliases: ['popping'], colorKey: 'blue', defaultWeekday: null, defaultStart: '', defaultEnd: '', defaultInstructorId: '', defaultVenue: '', attendanceFolderId: '', videoFolderId: '', version: 1, updatedBy: 'a', updatedAt: '', active: true }
  ];

  it('filters music by event and dance style', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const song1 = song('1', { title: 'Locking Beat', eventId: 'ev1', styleId: 'st1' });
    const song2 = song('2', { title: 'Popping Groove', eventId: 'ev2', styleId: 'st2' });

    render(
      <ClassMusicList
        music={[song1, song2]}
        styles={styles}
        events={events}
        selectedMusicId={null}
        onSelectMusic={vi.fn()}
      />
    );

    expect(screen.getByText('Locking Beat')).toBeInTheDocument();
    expect(screen.getByText('Popping Groove')).toBeInTheDocument();

    // Filter by Event: ev1
    fireEvent.change(screen.getByLabelText('Filter music by event'), { target: { value: 'ev1' } });
    expect(screen.getByText('Locking Beat')).toBeInTheDocument();
    expect(screen.queryByText('Popping Groove')).toBeNull();

    // Reset Event and Filter by Style: st2
    fireEvent.change(screen.getByLabelText('Filter music by event'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Filter music by style'), { target: { value: 'st2' } });
    expect(screen.queryByText('Locking Beat')).toBeNull();
    expect(screen.getByText('Popping Groove')).toBeInTheDocument();
  });
});

