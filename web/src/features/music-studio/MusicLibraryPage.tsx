import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  canPractise,
  musicAppLinks,
  type DanceStyle,
  type EventSummary,
  type MusicItem,
  type Section
} from '@umdsc/shared';
import { api } from '../../lib/api';
import { session } from '../../lib/session';
import { streamUrl } from '../../lib/google/driveUrls';
import { useBootstrap } from '../auth/useBootstrap';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { EmptyState } from '../../components/ui/EmptyState';
import { getStyleColor } from '../../theme/colors';
import {
  SOURCE_LABEL,
  UNCATEGORIZED_STYLE_ID,
  formatAppLinkLabel,
  groupTracksByStyle,
  matchesMusicSearch,
  sortEventsNewestFirst
} from './musicLibraryUtils';

export const MusicLibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const isAdmin = session.get()?.claims?.role === 'admin';
  const studioBasePath = isAdmin ? '/admin/studio' : '/studio';

  const boot = useBootstrap(isAdmin ? 'admin' : 'dancer');

  const {
    data: liveMusic,
    isLoading: musicLoading,
    isError: musicError,
    isFetching: musicFetching,
    refetch: refetchMusic
  } = useQuery<MusicItem[]>({
    queryKey: ['music'],
    staleTime: 30_000,
    queryFn: async () => (await api.post<MusicItem[]>('music.list', {})).data
  });

  const { data: liveSections } = useQuery<Section[]>({
    queryKey: ['sections'],
    staleTime: 30_000,
    queryFn: async () => (await api.post<Section[]>('sections.list', {})).data
  });

  const { data: liveStyles } = useQuery<DanceStyle[]>({
    queryKey: ['styles'],
    staleTime: 60_000,
    queryFn: async () => (await api.post<DanceStyle[]>('styles.list', {})).data
  });

  const { data: liveEvents } = useQuery<EventSummary[]>({
    queryKey: ['events'],
    staleTime: 60_000,
    queryFn: async () => (await api.post<EventSummary[]>('events.list', { includeArchived: true })).data
  });

  const musicList: MusicItem[] = useMemo(() => {
    const raw = Array.isArray(liveMusic)
      ? liveMusic
      : Array.isArray((boot.data as any)?.music)
        ? ((boot.data as any).music as MusicItem[])
        : [];
    return raw.filter(m => m.active !== false);
  }, [liveMusic, boot.data]);

  const sectionsList: Section[] = useMemo(() => {
    const raw = Array.isArray(liveSections)
      ? liveSections
      : Array.isArray((boot.data as any)?.sections)
        ? ((boot.data as any).sections as Section[])
        : [];
    return raw.filter(s => s.active !== false);
  }, [liveSections, boot.data]);

  const stylesList: DanceStyle[] = useMemo(() => {
    const raw = Array.isArray(liveStyles)
      ? liveStyles
      : Array.isArray(boot.data?.styles)
        ? boot.data.styles
        : [];
    return raw.filter(s => s.active !== false);
  }, [liveStyles, boot.data]);

  const eventsList: EventSummary[] = useMemo(() => {
    const raw = Array.isArray(liveEvents)
      ? liveEvents
      : Array.isArray((boot.data as any)?.events)
        ? ((boot.data as any).events as EventSummary[])
        : [];
    return sortEventsNewestFirst(raw);
  }, [liveEvents, boot.data]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('all');
  const [selectedStyleId, setSelectedStyleId] = useState('all');

  const styleById = useMemo(() => new Map(stylesList.map(s => [s.id, s])), [stylesList]);
  const eventById = useMemo(() => new Map(eventsList.map(e => [e.id, e])), [eventsList]);

  const sectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const sec of sectionsList) {
      counts.set(sec.musicId, (counts.get(sec.musicId) ?? 0) + 1);
    }
    return counts;
  }, [sectionsList]);

  const hasOrphanStyle = useMemo(
    () => musicList.some(item => !styleById.has(item.styleId)),
    [musicList, styleById]
  );

  const searchAndEventFiltered = useMemo(() => {
    return musicList.filter(item => {
      if (selectedEventId !== 'all' && item.eventId !== selectedEventId) return false;
      const styleName = styleById.get(item.styleId)?.name ?? 'Uncategorized';
      const eventName = eventById.get(item.eventId)?.name ?? '';
      return matchesMusicSearch(item, searchQuery, styleName, eventName);
    });
  }, [musicList, selectedEventId, searchQuery, styleById, eventById]);

  const categoryBuckets = useMemo(
    () => groupTracksByStyle(searchAndEventFiltered, stylesList, hasOrphanStyle),
    [searchAndEventFiltered, stylesList, hasOrphanStyle]
  );

  const visibleGroups = useMemo(() => {
    return categoryBuckets.filter(bucket => {
      if (selectedStyleId !== 'all' && bucket.id !== selectedStyleId) return false;
      return bucket.tracks.length > 0;
    });
  }, [categoryBuckets, selectedStyleId]);

  const styleCount = stylesList.length + (hasOrphanStyle ? 1 : 0);
  const isInitialLoading = (musicLoading || (boot.isLoading && !boot.data)) && musicList.length === 0;
  const hasActiveFilters =
    searchQuery.trim().length > 0 || selectedEventId !== 'all' || selectedStyleId !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedEventId('all');
    setSelectedStyleId('all');
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Banner */}
      <section className="px-panel px-corners bg-[var(--night-2)] p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-lg sm:text-xl uppercase tracking-wider text-[var(--text-1)] px-glow-text">
                MUSIC LIBRARY
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 border-2 border-[var(--outline)] bg-[var(--violet-2)] font-mono text-[12px] font-bold text-[var(--neon-cyan)]">
                {musicList.length} {musicList.length === 1 ? 'TRACK' : 'TRACKS'} · {styleCount}{' '}
                {styleCount === 1 ? 'STYLE' : 'STYLES'}
              </span>
            </div>
            <p className="font-body text-[15px] text-[var(--text-2)] leading-snug">
              All music links and MP3s uploaded by class reps and instructors are open to every past and current member across all dance styles.
            </p>
          </div>
          <PixelButton
            size="md"
            variant="primary"
            onClick={() => navigate(studioBasePath)}
            className="w-full sm:w-auto shrink-0"
          >
            OPEN STUDIO
          </PixelButton>
        </div>
      </section>

      {/* Search, Event Filter & Dance Style Category Bar */}
      <Panel title="BROWSE & FILTER" className="bg-[var(--night-2)] space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-display text-[10px] uppercase tracking-wider text-[var(--neon-cyan)]">
              SEARCH TRACKS
            </span>
            <input
              type="search"
              aria-label="Search music library"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search song, dance style, or event..."
              className="w-full min-w-0 min-h-[44px] px-well px-3 py-2 font-mono text-[16px] text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:border-[var(--neon-cyan)] outline-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-display text-[10px] uppercase tracking-wider text-[var(--neon-pink)]">
              EVENT
            </span>
            <select
              aria-label="Filter music library by event"
              value={selectedEventId}
              onChange={e => setSelectedEventId(e.target.value)}
              className="w-full min-w-0 min-h-[44px] px-well px-3 py-2 font-mono text-[16px] text-[var(--text-1)] focus:border-[var(--neon-pink)] outline-none cursor-pointer"
            >
              <option value="all">ALL EVENTS ({eventsList.length})</option>
              {eventsList.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Dance Style Category Pills */}
        <div className="space-y-1.5 pt-1">
          <span className="font-display text-[10px] uppercase tracking-wider text-[var(--neon-gold)] block">
            DANCE STYLE CATEGORIES
          </span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Dance style categories">
            <button
              type="button"
              aria-pressed={selectedStyleId === 'all'}
              onClick={() => setSelectedStyleId('all')}
              className={`min-h-[40px] px-3 py-1.5 border-2 border-[var(--outline)] font-display text-[10px] sm:text-[11px] uppercase tracking-wide inline-flex items-center gap-1.5 cursor-pointer whitespace-normal break-words text-left max-w-full ${
                selectedStyleId === 'all'
                  ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold shadow-[2px_2px_0_var(--outline)]'
                  : 'bg-[var(--night-1)] text-[var(--text-1)] hover:bg-[var(--violet-2)]'
              }`}
            >
              <span>ALL STYLES ({searchAndEventFiltered.length})</span>
            </button>

            {categoryBuckets.map(bucket => {
              const isSelected = selectedStyleId === bucket.id;
              const dotColor =
                bucket.id === UNCATEGORIZED_STYLE_ID
                  ? 'var(--violet-4)'
                  : getStyleColor(bucket.colorKey);
              return (
                <button
                  key={bucket.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedStyleId(prev => (prev === bucket.id ? 'all' : bucket.id))}
                  className={`min-h-[40px] px-3 py-1.5 border-2 border-[var(--outline)] font-display text-[10px] sm:text-[11px] uppercase tracking-wide inline-flex items-center gap-2 cursor-pointer whitespace-normal break-words text-left max-w-full ${
                    isSelected
                      ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold shadow-[2px_2px_0_var(--outline)]'
                      : 'bg-[var(--night-1)] text-[var(--text-1)] hover:bg-[var(--violet-2)]'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-[var(--outline)] shrink-0"
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
      </Panel>

      {/* Content: Loading / Error / Empty / Categorized Dance Style Sections */}
      {isInitialLoading ? (
        <div className="px-panel p-8 text-center">
          <p className="font-display text-[12px] text-[var(--neon-cyan)] animate-pulse">
            LOADING MUSIC LIBRARY…
          </p>
        </div>
      ) : !musicLoading && musicError && musicList.length === 0 ? (
        <div role="alert">
          <EmptyState
            scene="boombox"
            title="COULD NOT LOAD MUSIC LIBRARY"
            description="Could not reach the server to fetch tracks. Check your connection and try again."
            className="border-[var(--neon-red)]"
            action={
              <PixelButton
                size="md"
                variant="primary"
                disabled={musicFetching}
                onClick={() => void refetchMusic()}
              >
                RETRY
              </PixelButton>
            }
          />
        </div>
      ) : musicList.length === 0 ? (
        <EmptyState
          scene="boombox"
          title="NO MUSIC IN LIBRARY YET"
          description="Music links and MP3 tracks uploaded by class reps and instructors will appear here."
        />
      ) : visibleGroups.length === 0 ? (
        <EmptyState
          scene="boombox"
          title="NO TRACKS MATCH YOUR FILTERS"
          description="Try another keyword or clear your search, dance style, and event filters."
          action={
            hasActiveFilters ? (
              <PixelButton size="sm" variant="secondary" onClick={clearFilters}>
                CLEAR FILTERS
              </PixelButton>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-5">
          {visibleGroups.map(group => {
            const groupColor =
              group.id === UNCATEGORIZED_STYLE_ID
                ? 'var(--violet-4)'
                : getStyleColor(group.colorKey);
            return (
              <section
                key={group.id}
                aria-label={group.name}
                className="px-panel px-corners bg-[var(--night-2)]"
              >
                {/* Category Header */}
                <div
                  className="bg-[var(--night-1)] px-4 py-3 border-b-2 border-[var(--outline)] flex flex-wrap items-center justify-between gap-2"
                  style={{ borderLeft: `6px solid ${groupColor}` }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full border border-[var(--outline)] shrink-0"
                      style={{ backgroundColor: groupColor }}
                      aria-hidden="true"
                    />
                    <h2 className="font-display text-[13px] sm:text-[14px] uppercase tracking-wider text-[var(--text-1)] px-glow-text break-words">
                      {group.name}
                    </h2>
                  </div>
                  <span className="px-2 py-0.5 border border-[var(--outline)] bg-[var(--violet-2)] font-mono text-[12px] font-bold text-[var(--neon-cyan)] shrink-0">
                    {group.tracks.length} {group.tracks.length === 1 ? 'TRACK' : 'TRACKS'}
                  </span>
                </div>

                {/* Track Cards */}
                <div className="p-3 sm:p-4 grid grid-cols-1 gap-3">
                  {group.tracks.map(item => {
                    const ev = eventById.get(item.eventId);
                    const secCount = sectionCounts.get(item.id) ?? 0;
                    const links = musicAppLinks(item);
                    const playable = canPractise(item);

                    return (
                      <article
                        key={item.id}
                        data-testid={`library-track-${item.id}`}
                        className="min-w-0 p-3 sm:p-4 border-2 border-[var(--outline)] bg-[var(--violet-1)] shadow-[3px_3px_0_var(--outline)] space-y-3"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <h3 className="font-display text-[13px] sm:text-[14px] font-bold text-[var(--text-1)] min-w-0 max-w-full break-words">
                              {item.title}
                            </h3>
                            <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase bg-[var(--night-1)] text-[var(--neon-pink)] border border-[var(--outline)]">
                              {SOURCE_LABEL[item.sourceType] ?? item.sourceType}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-[12px] font-mono">
                            {ev && (
                              <span className="px-2 py-0.5 border border-[var(--outline)] bg-[var(--night-2)] text-[var(--text-2)] font-bold">
                                {ev.name}
                              </span>
                            )}
                            {secCount > 0 && (
                              <span className="px-2 py-0.5 border border-[var(--outline)] bg-[var(--night-1)] text-[var(--neon-green)] font-bold">
                                {secCount} {secCount === 1 ? 'SECTION' : 'SECTIONS'}
                              </span>
                            )}
                          </div>
                        </div>

                        {item.sourceType === 'mp3' && item.driveFileId && (
                          <audio
                            src={streamUrl(item.driveFileId)}
                            controls
                            preload="none"
                            className="w-full h-9"
                          />
                        )}

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {playable ? (
                            <PixelButton
                              size="sm"
                              variant="primary"
                              onClick={() => navigate(`${studioBasePath}?music=${item.id}`)}
                              className="w-full sm:w-auto"
                            >
                              ▶ PLAY IN STUDIO
                            </PixelButton>
                          ) : (
                            <span className="inline-flex items-center px-3 py-2 min-h-[44px] border-2 border-[var(--outline)] bg-[var(--night-1)] font-display text-[10px] uppercase tracking-wider text-[var(--neon-gold)]">
                              LISTEN ONLY (SPOTIFY)
                            </span>
                          )}

                          {links.map(link => (
                            <a
                              key={link.label}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center gap-1 border-2 border-[var(--outline)] bg-[var(--violet-2)] px-3 py-2 min-h-[44px] font-display text-[10px] sm:text-[11px] font-bold text-[var(--text-1)] shadow-[2px_2px_0_var(--outline)] hover:bg-[var(--neon-cyan)] hover:text-[var(--on-neon)] break-words max-w-full"
                            >
                              {formatAppLinkLabel(link)}
                            </a>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MusicLibraryPage;
