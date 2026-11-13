import type { DanceStyle, MusicAppLink, MusicItem } from '@umdsc/shared';

export const UNCATEGORIZED_STYLE_ID = '__uncategorized__';

export const SOURCE_LABEL: Record<MusicItem['sourceType'], string> = {
  mp3: 'MP3',
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  spotify: 'Spotify'
};

export interface StyleTrackBucket {
  id: string;
  name: string;
  colorKey: string;
  tracks: MusicItem[];
}

export function sortEventsNewestFirst<T extends { startDate?: string }>(events: T[]): T[] {
  return [...events].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
}

export function matchesMusicSearch(
  item: MusicItem,
  query: string,
  styleName: string,
  eventName: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.title.toLowerCase().includes(q) ||
    styleName.toLowerCase().includes(q) ||
    eventName.toLowerCase().includes(q)
  );
}

export function groupTracksByStyle(
  tracks: MusicItem[],
  styles: DanceStyle[],
  includeUncategorized = false
): StyleTrackBucket[] {
  const knownIds = new Set(styles.map(s => s.id));
  const grouped = new Map<string, MusicItem[]>();

  for (const track of tracks) {
    const bucketId = knownIds.has(track.styleId) ? track.styleId : UNCATEGORIZED_STYLE_ID;
    const list = grouped.get(bucketId);
    if (list) {
      list.push(track);
    } else {
      grouped.set(bucketId, [track]);
    }
  }

  const buckets: StyleTrackBucket[] = styles.map(style => ({
    id: style.id,
    name: style.name,
    colorKey: style.colorKey,
    tracks: grouped.get(style.id) ?? []
  }));

  const uncategorized = grouped.get(UNCATEGORIZED_STYLE_ID) ?? [];
  if (includeUncategorized || uncategorized.length > 0) {
    buckets.push({
      id: UNCATEGORIZED_STYLE_ID,
      name: 'Uncategorized',
      colorKey: '',
      tracks: uncategorized
    });
  }

  return buckets;
}

export function formatAppLinkLabel(link: MusicAppLink): string {
  return link.label === 'Download MP3' ? 'Download MP3 ↗' : `Open in ${link.label} ↗`;
}
