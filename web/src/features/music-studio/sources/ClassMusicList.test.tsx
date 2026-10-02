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
