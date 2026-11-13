import React, { useState, useMemo } from 'react';
import { canPractise, musicAppLinks, type MusicItem, type DanceStyle, type EventSummary } from '@umdsc/shared';
import { getStyleColor } from '../../../theme/colors';
import {
  SOURCE_LABEL,
  UNCATEGORIZED_STYLE_ID,
  formatAppLinkLabel,
  groupTracksByStyle,
  matchesMusicSearch,
  sortEventsNewestFirst
} from '../musicLibraryUtils';

interface ClassMusicListProps {
  music: MusicItem[];
  styles: DanceStyle[];
  events: EventSummary[];
  selectedMusicId: string | null;
  onSelectMusic: (music: MusicItem) => void;
}

export const ClassMusicList: React.FC<ClassMusicListProps> = ({
  music,
  styles,
  events,
  selectedMusicId,
  onSelectMusic
}) => {
  const [filterEventId, setFilterEventId] = useState<string>('all');
  const [filterStyleId, setFilterStyleId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const stylesMap = useMemo(() => new Map(styles.map(s => [s.id, s])), [styles]);
  const eventsMap = useMemo(() => new Map(events.map(e => [e.id, e])), [events]);
  const sortedEvents = useMemo(() => sortEventsNewestFirst(events), [events]);

  const hasOrphanStyle = useMemo(
    () => music.some(item => !stylesMap.has(item.styleId)),
    [music, stylesMap]
  );

  const searchAndEventFiltered = useMemo(() => {
    return music.filter(item => {
      if (filterEventId !== 'all' && item.eventId !== filterEventId) return false;
      const styleName = stylesMap.get(item.styleId)?.name ?? 'Uncategorized';
      const eventName = eventsMap.get(item.eventId)?.name ?? '';
      return matchesMusicSearch(item, searchQuery, styleName, eventName);
    });
  }, [music, filterEventId, searchQuery, stylesMap, eventsMap]);

  const categoryBuckets = useMemo(
    () => groupTracksByStyle(searchAndEventFiltered, styles, hasOrphanStyle),
    [searchAndEventFiltered, styles, hasOrphanStyle]
  );

  const filteredMusic = useMemo(() => {
    if (filterStyleId === 'all') return searchAndEventFiltered;
    if (filterStyleId === UNCATEGORIZED_STYLE_ID) {
      return searchAndEventFiltered.filter(item => !stylesMap.has(item.styleId));
    }
    return searchAndEventFiltered.filter(item => item.styleId === filterStyleId);
  }, [searchAndEventFiltered, filterStyleId, stylesMap]);

  if (!music || music.length === 0) {
    return (
      <div className="p-4 text-center border-2 border-dashed border-[var(--outline)] bg-[var(--night-1)]">
        <p className="font-mono text-[12px] text-[var(--text-2)] uppercase tracking-wider">
          No class music uploaded yet
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search, Event and Dance Style Filter Controls */}
      <div className="space-y-2 bg-[var(--night-2)] p-2.5 border-2 border-[var(--outline)]">
        <label className="flex flex-col gap-1 text-[12px] font-mono text-[var(--neon-gold)]">
          <span className="font-bold">SEARCH MUSIC LIBRARY</span>
          <input
            type="search"
            aria-label="Search music library"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search song, style, or event..."
            className="w-full min-w-0 bg-[var(--night-1)] text-[var(--text-1)] border-2 border-[var(--outline)] px-2.5 py-1.5 text-[16px] font-mono placeholder:text-[var(--text-3)] focus:border-[var(--neon-gold)] outline-none"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[12px] font-mono text-[var(--neon-cyan)]">
            <span className="font-bold">FILTER BY EVENT</span>
            <select
              aria-label="Filter music by event"
              value={filterEventId}
              onChange={e => setFilterEventId(e.target.value)}
              className="w-full min-w-0 bg-[var(--night-1)] text-[var(--text-1)] border-2 border-[var(--outline)] px-2 py-1.5 text-[16px] font-mono focus:border-[var(--neon-cyan)] outline-none"
            >
              <option value="all">ALL EVENTS ({sortedEvents.length})</option>
              {sortedEvents.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[12px] font-mono text-[var(--neon-pink)]">
            <span className="font-bold">FILTER BY DANCE STYLE</span>
            <select
              aria-label="Filter music by style"
              value={filterStyleId}
              onChange={e => setFilterStyleId(e.target.value)}
              className="w-full min-w-0 bg-[var(--night-1)] text-[var(--text-1)] border-2 border-[var(--outline)] px-2 py-1.5 text-[16px] font-mono focus:border-[var(--neon-pink)] outline-none"
            >
              <option value="all">ALL DANCE STYLES ({styles.length})</option>
              {styles.map(st => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
              {hasOrphanStyle && (
                <option value={UNCATEGORIZED_STYLE_ID}>Uncategorized</option>
              )}
            </select>
          </label>
        </div>

        {/* Interactive Dance Style Category Pills */}
        <div className="flex flex-wrap gap-1.5 pt-1" role="group" aria-label="Filter by dance style category">
          <button
            type="button"
            aria-pressed={filterStyleId === 'all'}
            onClick={() => setFilterStyleId('all')}
            className={`px-2.5 py-1.5 min-h-[36px] border-2 border-[var(--outline)] font-display text-[10px] uppercase inline-flex items-center gap-1.5 cursor-pointer whitespace-normal break-words text-left max-w-full ${
              filterStyleId === 'all'
                ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold'
                : 'bg-[var(--night-1)] text-[var(--text-2)] hover:bg-[var(--violet-1)] hover:text-[var(--text-1)]'
            }`}
          >
            <span>ALL STYLES ({searchAndEventFiltered.length})</span>
          </button>

          {categoryBuckets.map(bucket => {
            const active = filterStyleId === bucket.id;
            const dotColor =
              bucket.id === UNCATEGORIZED_STYLE_ID
                ? 'var(--violet-4)'
                : getStyleColor(bucket.colorKey);
            return (
              <button
                key={bucket.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilterStyleId(prev => (prev === bucket.id ? 'all' : bucket.id))}
                className={`px-2.5 py-1.5 min-h-[36px] border-2 border-[var(--outline)] font-display text-[10px] uppercase inline-flex items-center gap-1.5 cursor-pointer whitespace-normal break-words text-left max-w-full ${
                  active
                    ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold'
                    : 'bg-[var(--night-1)] text-[var(--text-1)] hover:bg-[var(--violet-1)]'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full border border-[var(--outline)] shrink-0"
                  style={{ backgroundColor: dotColor }}
                  aria-hidden="true"
                />
                <span>
                  {bucket.name} ({bucket.tracks.length})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {filteredMusic.length === 0 ? (
        <div className="p-4 text-center border-2 border-dashed border-[var(--outline)] bg-[var(--night-1)]">
          <p className="font-mono text-[12px] text-[var(--text-2)]">
            No class music matches the selected filters.
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1 pixel-scrollbar">
          {filteredMusic.map(item => {
            const style = stylesMap.get(item.styleId);
            const event = eventsMap.get(item.eventId);
            const isSelected = selectedMusicId === item.id;
            const playable = canPractise(item);
            const links = musicAppLinks(item);

            return (
              <div
                key={item.id}
                data-testid={`class-music-item-${item.id}`}
                onClick={() => {
                  if (playable) onSelectMusic(item);
                }}
                className={`p-3 border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                  playable ? 'cursor-pointer' : ''
                } ${
                  isSelected
                    ? 'border-[var(--neon-gold)] bg-[var(--violet-2)] shadow-[2px_2px_0_var(--neon-gold)]'
                    : playable
                      ? 'border-[var(--outline)] bg-[var(--violet-1)] hover:bg-[var(--violet-2)]'
                      : 'border-[var(--outline)] bg-[var(--violet-1)]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display text-[14px] font-bold text-[var(--text-1)] break-words max-w-full">
                      {item.title}
                    </span>
                    <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase bg-[var(--violet-2)] text-[var(--neon-pink)] border border-[var(--outline)]">
                      {SOURCE_LABEL[item.sourceType] ?? item.sourceType}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[12px] text-[var(--text-2)] font-mono flex-wrap">
                    {style && (
                      <span className="inline-flex items-center gap-1 truncate">
                        <span
                          className="w-2 h-2 rounded-full border border-[var(--outline)] shrink-0"
                          style={{ backgroundColor: getStyleColor(style.colorKey) }}
                          aria-hidden="true"
                        />
                        {style.name}
                      </span>
                    )}
                    {style && event && <span>•</span>}
                    {event && <span className="truncate">{event.name}</span>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {links.map(link => (
                    <a
                      key={link.label}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="inline-flex items-center justify-center border-2 border-[var(--outline)] bg-[var(--night-1)] px-2.5 py-1.5 min-h-[36px] text-[11px] font-mono font-bold text-[var(--neon-cyan)] hover:bg-[var(--neon-cyan)] hover:text-[var(--on-neon)] break-words max-w-full"
                    >
                      {formatAppLinkLabel(link)}
                    </a>
                  ))}

                  {playable ? (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onSelectMusic(item);
                      }}
                      className={`shrink-0 px-3 py-1.5 min-h-[36px] text-[12px] font-display uppercase tracking-wider border-2 border-[var(--outline)] cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--neon-gold)] text-[var(--on-neon)]'
                          : 'bg-[var(--night-1)] text-[var(--text-2)] hover:bg-[var(--violet-2)]'
                      }`}
                    >
                      {isSelected ? 'ACTIVE' : 'SELECT'}
                    </button>
                  ) : (
                    <span className="shrink-0 px-2.5 py-1.5 min-h-[36px] inline-flex items-center text-[10px] font-display uppercase tracking-wider border-2 border-[var(--outline)] bg-[var(--night-1)] text-[var(--neon-gold)]">
                      LISTEN ONLY
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
