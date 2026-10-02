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
  it('shows no embedded video for a YouTube track, only the practise button', () => {
    const { container } = renderCard([music({})]);
    expect(container.querySelector('iframe[src*="youtube"]')).toBeNull();
    expect(screen.getByRole('button', { name: /PRACTISE IN STUDIO/i })).toBeInTheDocument();
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
