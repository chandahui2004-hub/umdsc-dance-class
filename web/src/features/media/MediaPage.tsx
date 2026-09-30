import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { formatDayLabel } from '../../lib/time';
import { useCurrentEvent } from '../events/useCurrentEvent';
import { streamUrl, openInDriveUrl } from '../../lib/google/driveUrls';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { UploadDialog } from './UploadDialog';
import { ScanPanel } from './ScanPanel';
import { MusicForm } from './MusicForm';
import { SectionsEditor } from './SectionsEditor';
import type { ClassSession, DanceStyle, Video, Music } from '@umdsc/shared';

export const MediaPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const { events, current: event, setCurrentId, isAll } = useCurrentEvent();
  const eventId = event?.id || '';
  const [styleId, setStyleId] = useState<string>(searchParams.get('style') || '');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');

  // Dialog states
  const [showUploadVideo, setShowUploadVideo] = useState(false);
  const [showUploadMp3, setShowUploadMp3] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [showAddMusic, setShowAddMusic] = useState(false);
  const [activeMusicForSections, setActiveMusicForSections] = useState<Music | null>(null);

  // Video collapse/expand states
  const [allVideosCollapsed, setAllVideosCollapsed] = useState<boolean>(false);
  const [collapsedVideoIds, setCollapsedVideoIds] = useState<Record<string, boolean>>({});

  const toggleVideoCollapse = (id: string) => {
    setCollapsedVideoIds((prev) => {
      const current = prev[id] !== undefined ? prev[id] : allVideosCollapsed;
      return { ...prev, [id]: !current };
    });
  };

  const handleToggleAllVideos = () => {
    setAllVideosCollapsed((prev) => {
      const next = !prev;
      setCollapsedVideoIds({});
      return next;
    });
  };

  // Only the current event's styles
  const { data: allStyles = [] } = useQuery<DanceStyle[]>({
    queryKey: ['styles'],
    queryFn: async () => {
      const res = await api.post<DanceStyle[]>('styles.list');
      return res.data;
    }
  });

  const styles = useMemo(
    () => (event ? event.styleIds.map(id => allStyles.find(s => s.id === id)).filter((s): s is DanceStyle => Boolean(s)) : []),
    [event, allStyles]
  );

  const activeStyle = useMemo(
    () => styles.find((s) => s.id === styleId) || styles[0] || null,
    [styles, styleId]
  );

  // Keep the chosen style inside the current event
  useEffect(() => {
    if (styles.length > 0 && !styles.some(s => s.id === styleId)) {
      setStyleId(styles[0].id);
    }
  }, [styleId, styles]);

  useEffect(() => {
    if (styleId) {
      setSearchParams({ style: styleId }, { replace: true });
    }
  }, [styleId, setSearchParams]);

  const ready = Boolean(eventId && styleId);

  // The event's classes for this style
  const { data: rawSessions = [] } = useQuery<ClassSession[]>({
    queryKey: ['sessions', eventId, styleId],
    queryFn: async () => (await api.post<ClassSession[]>('sessions.list', { eventId, styleId })).data,
    enabled: ready
  });

  const sessions = useMemo(
    () =>
      rawSessions
        .filter((s) => s.styleId === styleId)
        .sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq),
    [rawSessions, styleId]
  );

  // Default selectedSessionId to first session if not selected
  useEffect(() => {
    if (sessions.length > 0) {
      if (!selectedSessionId || !sessions.some((s) => s.id === selectedSessionId)) {
        setSelectedSessionId(sessions[0].id);
      }
    } else {
      setSelectedSessionId('');
    }
  }, [sessions, selectedSessionId]);

  // Fetch videos
  const { data: videos = [] } = useQuery<Video[]>({
    queryKey: ['videos', eventId, styleId],
    queryFn: async () => (await api.post<Video[]>('videos.list', { eventId, styleId })).data,
    enabled: ready
  });

  // Fetch music
  const { data: musicList = [] } = useQuery<Music[]>({
    queryKey: ['music', eventId, styleId],
    queryFn: async () => (await api.post<Music[]>('music.list', { eventId, styleId })).data,
    enabled: ready
  });

  // Delete Video mutation
  const deleteVideoMutation = useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      return await api.post('videos.deactivate', { id, version });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
    },
    onError: (err) => {
      alert(errorMessage(err));
    }
  });

  // Delete Music mutation
  const deleteMusicMutation = useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      return await api.post('music.deactivate', { id, version });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['music'] });
    },
    onError: (err) => {
      alert(errorMessage(err));
    }
  });

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) || sessions[0] || null,
    [sessions, selectedSessionId]
  );

  const filteredVideos = useMemo(() => {
    if (!selectedSessionId) return videos;
    return videos.filter((v) => v.sessionId === selectedSessionId);
  }, [videos, selectedSessionId]);

  const filteredMusic = useMemo(() => {
    if (!selectedSessionId) return musicList;
    return musicList.filter((m) => !m.sessionId || m.sessionId === selectedSessionId);
  }, [musicList, selectedSessionId]);

  if (isAll && events.length > 0) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-lg tracking-wider text-[var(--c-ink)]">Media Management</h1>
        <div className="p-4 bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] space-y-3">
          <p className="font-display text-xs text-[var(--c-ink)]">SELECT AN EVENT FOR MEDIA MANAGEMENT</p>
          <p className="font-body text-sm text-[var(--c-darkgrey)]">
            Class recap videos and music tracks are organized by event. Select an active event below to manage its media:
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {events.filter(e => e.status === 'active').map(e => (
              <PixelButton key={e.id} size="md" variant="secondary" onClick={() => setCurrentId(e.id)}>
                {e.name}
              </PixelButton>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="font-display text-lg tracking-wider text-[var(--c-ink)]">
            Media Management
          </h1>
          <p className="font-body text-base text-[var(--c-darkgrey)] mt-1">
            Upload class recap videos, scan Google Drive folders, and manage dance music tracks for each class.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <PixelButton
            size="md"
            variant="secondary"
            onClick={() => setShowScan(true)}
            disabled={!activeStyle}
          >
            SCAN FOLDER
          </PixelButton>
          <PixelButton
            size="md"
            variant="secondary"
            onClick={() => setShowAddMusic(true)}
            disabled={!activeStyle}
          >
            + YOUTUBE MUSIC
          </PixelButton>
          <PixelButton
            size="md"
            variant="secondary"
            onClick={() => setShowUploadMp3(true)}
            disabled={!activeStyle}
          >
            UPLOAD MP3
          </PixelButton>
          <PixelButton
            size="md"
            variant="primary"
            onClick={() => setShowUploadVideo(true)}
            disabled={!activeStyle}
          >
            UPLOAD VIDEO
          </PixelButton>
        </div>
      </div>

      {/* Style chips (the event comes from the picker) */}
      <div className="bg-[var(--c-panel)] border-4 border-[var(--c-ink)] p-4 shadow-[4px_4px_0_var(--c-ink)] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Style Chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 items-center">
          <span className="font-display text-xs text-[var(--c-ink)] uppercase mr-1 whitespace-nowrap">
            STYLE:
          </span>
          {styles.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setStyleId(s.id);
                setSelectedSessionId('');
              }}
              className={`min-h-[44px] px-3 border-2 border-[var(--c-ink)] font-display text-xs cursor-pointer select-none whitespace-nowrap transition-none ${
                styleId === s.id
                  ? 'bg-[var(--c-orange)] text-[var(--c-ink)] font-bold shadow-[2px_2px_0_var(--c-ink)]'
                  : 'bg-[var(--c-bg)] text-[var(--c-ink)] hover:bg-[var(--c-panel)]'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

      </div>

      {/* 4-CLASS SESSIONS SECTION (Class 1 to 4) */}
      <Panel
        title={`CLASSES FOR ${activeStyle?.name.toUpperCase() || 'STYLE'} (${event?.name || 'NO EVENT'})`}
        className="px-corners bg-[var(--c-panel)] space-y-4"
      >
        {sessions.length === 0 ? (
          <div className="p-6 bg-[var(--c-peach)] border-2 border-[var(--c-orange)] shadow-[2px_2px_0_var(--c-ink)] space-y-3">
            <h3 className="font-display text-xs text-[var(--c-ink)] font-bold">
              {event
                ? `NO ${activeStyle?.name.toUpperCase() || ''} CLASSES IN ${event.name.toUpperCase()}`
                : 'NO EVENT CHOSEN'}
            </h3>
            <p className="font-body text-sm text-[var(--c-darkgrey)]">
              Media is stored per class. Add classes to the event first.
            </p>
            <PixelButton
              size="md"
              variant="primary"
              onClick={() => navigate(event ? `/admin/events/${event.id}/edit` : '/admin/events/new')}
            >
              ADD CLASSES IN EVENTS › EDIT
            </PixelButton>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between items-center pb-1">
              <span className="font-display text-xs text-[var(--c-ink)] uppercase">
                Select a class to view & upload media:
              </span>
              <PixelButton
                size="md"
                variant="secondary"
                onClick={() => navigate('/admin/calendar')}
              >
                EDIT SCHEDULE IN CALENDAR
              </PixelButton>
            </div>

            {/* 4 Interactive Class Session Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {sessions.map((sess) => {
                const isSelected = selectedSession?.id === sess.id;
                const sessVideos = videos.filter((v) => v.sessionId === sess.id);
                const sessMusic = musicList.filter((m) => m.sessionId === sess.id);

                return (
                  <button
                    key={sess.id}
                    type="button"
                    onClick={() => setSelectedSessionId(sess.id)}
                    className={`p-3 border-4 border-[var(--c-ink)] text-left cursor-pointer transition-none select-none ${
                      isSelected
                        ? 'bg-[var(--c-orange)] text-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)]'
                        : 'bg-[var(--c-bg)] text-[var(--c-ink)] hover:bg-[var(--c-panel)] shadow-[2px_2px_0_var(--c-ink)]'
                    }`}
                  >
                    <div className="flex justify-between items-center border-b-2 border-[var(--c-ink)] pb-1 mb-2">
                      <span className="font-display text-xs font-bold">
                        CLASS #{sess.seq}
                      </span>
                      <span className="font-mono text-[11px] font-bold">
                        {sess.date.slice(5)}
                      </span>
                    </div>

                    <div className="font-body text-xs font-bold truncate">
                      {formatDayLabel(sess.date)}
                    </div>
                    <div className="font-mono text-[11px] text-[var(--c-darkgrey)]">
                      {sess.start} - {sess.end}
                    </div>

                    <div className="mt-3 pt-2 border-t border-[var(--c-ink)] flex items-center justify-between text-[11px] font-mono">
                      <span
                        className={`px-1.5 py-0.5 border border-[var(--c-ink)] font-bold ${
                          sessVideos.length > 0
                            ? 'bg-[var(--c-green)] text-[var(--c-ink)]'
                            : 'bg-[var(--c-panel)] text-[var(--c-darkgrey)]'
                        }`}
                      >
                        {sessVideos.length > 0 ? '✓ RECAP' : 'NO VIDEO'}
                      </span>
                      <span className="text-[var(--c-navy)] font-bold">
                        {sessMusic.length} {sessMusic.length === 1 ? 'Track' : 'Tracks'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Panel>

      {/* Selected Class Media Detail View */}
      {selectedSession && (
        <div className="p-3 bg-[var(--c-navy)] text-[var(--c-bg)] border-2 border-[var(--c-ink)] font-display text-xs flex justify-between items-center">
          <span>
            VIEWING MEDIA FOR: CLASS #{selectedSession.seq} ({formatDayLabel(selectedSession.date)})
          </span>
          <span className="font-mono text-xs">
            {selectedSession.start} - {selectedSession.end} {selectedSession.venue ? `@ ${selectedSession.venue}` : ''}
          </span>
        </div>
      )}

      {/* Main Grid: Videos and Music for Selected Class */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Videos Section */}
        <Panel
          title={`CLASS RECAP VIDEOS (${filteredVideos.length})`}
          className="px-corners bg-[var(--c-panel)] space-y-4"
        >
          <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b-2 border-[var(--c-ink)]">
            <div className="flex items-center gap-2">
              <span className="font-display text-xs text-[var(--c-ink)]">
                {selectedSession ? `Class #${selectedSession.seq} Recap` : 'All Recaps'}
              </span>
              {filteredVideos.length > 0 && (
                <PixelButton
                  size="sm"
                  variant="secondary"
                  onClick={handleToggleAllVideos}
                >
                  {allVideosCollapsed ? '▼ EXPAND ALL' : '▲ COLLAPSE ALL'}
                </PixelButton>
              )}
            </div>
            <PixelButton
              size="md"
              variant="primary"
              onClick={() => setShowUploadVideo(true)}
              disabled={!activeStyle}
            >
              + ADD RECAP {selectedSession ? `FOR CLASS #${selectedSession.seq}` : ''}
            </PixelButton>
          </div>

          {filteredVideos.length === 0 ? (
            <div className="p-8 text-center border-2 border-[var(--c-ink)] bg-[var(--c-bg)] space-y-2">
              <p className="font-display text-xs text-[var(--c-darkgrey)]">
                NO RECAP VIDEO FOR THIS CLASS YET
              </p>
              <p className="font-body text-xs text-[var(--c-darkgrey)]">
                Upload your class routine video so dancers can practise at home.
              </p>
              <PixelButton
                size="md"
                variant="primary"
                onClick={() => setShowUploadVideo(true)}
                disabled={!activeStyle}
              >
                ADD RECAP NOW
              </PixelButton>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredVideos.map((vid) => {
                const sess = sessions.find((s) => s.id === vid.sessionId);
                const stream = streamUrl(vid.driveFileId);
                const driveLink = openInDriveUrl(vid.driveFileId);
                const isCollapsed =
                  collapsedVideoIds[vid.id] !== undefined
                    ? collapsedVideoIds[vid.id]
                    : allVideosCollapsed;

                if (isCollapsed) {
                  return (
                    <div
                      key={vid.id}
                      className="p-3 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] shadow-[2px_2px_0_var(--c-ink)] flex flex-wrap justify-between items-center gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleVideoCollapse(vid.id)}
                          className="font-display text-[9px] px-1.5 py-0.5 bg-[var(--c-panel)] border border-[var(--c-ink)] hover:bg-[var(--c-yellow)] cursor-pointer"
                          aria-label="Expand video"
                        >
                          ▼ EXPAND
                        </button>
                        <h4 className="font-display text-xs text-[var(--c-ink)] font-bold truncate">
                          {vid.title}
                        </h4>
                      </div>
                      <div className="flex items-center gap-3">
                        {sess && (
                          <span className="font-mono text-xs text-[var(--c-navy)] font-bold">
                            Class #{sess.seq} ({sess.date})
                          </span>
                        )}
                        <a
                          href={driveLink}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-[var(--c-blue)] underline font-bold"
                        >
                          Drive ↗
                        </a>
                        <PixelButton
                          size="sm"
                          variant="danger"
                          disabled={deleteVideoMutation.isPending}
                          onClick={() =>
                            deleteVideoMutation.mutate({
                              id: vid.id,
                              version: vid.version
                            })
                          }
                        >
                          DEL
                        </PixelButton>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={vid.id}
                    className="p-3 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] shadow-[2px_2px_0_var(--c-ink)] space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleVideoCollapse(vid.id)}
                          className="font-display text-[9px] px-1.5 py-0.5 bg-[var(--c-panel)] border border-[var(--c-ink)] hover:bg-[var(--c-yellow)] cursor-pointer"
                          aria-label="Collapse video"
                        >
                          ▲ COLLAPSE
                        </button>
                        <h4 className="font-display text-xs text-[var(--c-ink)] font-bold truncate">
                          {vid.title}
                        </h4>
                      </div>
                      {sess && (
                        <span className="font-mono text-xs text-[var(--c-navy)] font-bold">
                          Class #{sess.seq} ({sess.date})
                        </span>
                      )}
                    </div>

                    {/* Video Player */}
                    <div className="w-full bg-[var(--c-ink)] border-2 border-[var(--c-ink)] aspect-video flex items-center justify-center overflow-hidden">
                      <video
                        src={stream}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-contain"
                      />
                    </div>

                    <div className="flex justify-between items-center gap-2 pt-1 border-t border-[var(--c-ink)]">
                      <a
                        href={driveLink}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-[var(--c-blue)] underline font-bold"
                      >
                        OPEN IN DRIVE ↗
                      </a>
                      <PixelButton
                        size="md"
                        variant="danger"
                        disabled={deleteVideoMutation.isPending}
                        onClick={() =>
                          deleteVideoMutation.mutate({
                            id: vid.id,
                            version: vid.version
                          })
                        }
                      >
                        DELETE
                      </PixelButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* Music Section */}
        <Panel
          title={`PRACTICE MUSIC (${filteredMusic.length})`}
          className="px-corners bg-[var(--c-panel)] space-y-4"
        >
          <div className="flex justify-between items-center pb-2 border-b-2 border-[var(--c-ink)]">
            <span className="font-display text-xs text-[var(--c-ink)]">
              {selectedSession ? `Class #${selectedSession.seq} Tracks` : 'All Tracks'}
            </span>
            <div className="flex gap-2">
              <PixelButton
                size="md"
                variant="secondary"
                onClick={() => setShowAddMusic(true)}
                disabled={!activeStyle}
              >
                + YOUTUBE
              </PixelButton>
              <PixelButton
                size="md"
                variant="secondary"
                onClick={() => setShowUploadMp3(true)}
                disabled={!activeStyle}
              >
                + MP3
              </PixelButton>
            </div>
          </div>

          {filteredMusic.length === 0 ? (
            <div className="p-8 text-center border-2 border-[var(--c-ink)] bg-[var(--c-bg)] space-y-2">
              <p className="font-display text-xs text-[var(--c-darkgrey)]">
                NO MUSIC TRACKS ADDED YET
              </p>
              <p className="font-body text-xs text-[var(--c-darkgrey)]">
                Add YouTube audio links or upload MP3s for Studio practice.
              </p>
              <div className="flex justify-center gap-2 pt-1">
                <PixelButton
                  size="md"
                  variant="primary"
                  onClick={() => setShowAddMusic(true)}
                  disabled={!activeStyle}
                >
                  ADD YOUTUBE MUSIC
                </PixelButton>
                <PixelButton
                  size="md"
                  variant="secondary"
                  onClick={() => setShowUploadMp3(true)}
                  disabled={!activeStyle}
                >
                  UPLOAD MP3
                </PixelButton>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredMusic.map((item) => {
                const sess = sessions.find((s) => s.id === item.sessionId);

                return (
                  <div
                    key={item.id}
                    className="p-3 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] shadow-[2px_2px_0_var(--c-ink)] space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                      <h4 className="font-display text-xs text-[var(--c-ink)] font-bold truncate">
                        {item.title}
                      </h4>
                      <span className="px-2 py-0.5 border border-[var(--c-ink)] bg-[var(--c-yellow)] font-mono text-[10px] font-bold">
                        {item.sourceType.toUpperCase()}
                      </span>
                    </div>

                    {sess && (
                      <p className="font-mono text-xs text-[var(--c-darkgrey)]">
                        Linked: Class #{sess.seq} ({sess.date})
                      </p>
                    )}

                    {/* Audio Player / Embed preview */}
                    {item.sourceType === 'mp3' && item.driveFileId ? (
                      <audio
                        src={streamUrl(item.driveFileId)}
                        controls
                        preload="metadata"
                        className="w-full"
                      />
                    ) : item.sourceType === 'youtube' && item.youtubeId ? (
                      <div className="w-full aspect-video border-2 border-[var(--c-ink)]">
                        <iframe
                          title={item.title}
                          src={`https://www.youtube.com/embed/${item.youtubeId}`}
                          className="w-full h-full border-0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    ) : null}

                    <div className="flex justify-between items-center gap-2 pt-1 border-t border-[var(--c-ink)]">
                      <PixelButton
                        size="md"
                        variant="secondary"
                        onClick={() => setActiveMusicForSections(item)}
                      >
                        MANAGE SECTIONS
                      </PixelButton>
                      <PixelButton
                        size="md"
                        variant="danger"
                        disabled={deleteMusicMutation.isPending}
                        onClick={() =>
                          deleteMusicMutation.mutate({
                            id: item.id,
                            version: item.version
                          })
                        }
                      >
                        DELETE
                      </PixelButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* Dialogs */}
      {showUploadVideo && activeStyle && (
        <UploadDialog
          type="video"
          eventId={eventId}
          eventName={event?.name || ''}
          style={activeStyle}
          sessions={sessions}
          initialSessionId={selectedSessionId}
          onClose={() => setShowUploadVideo(false)}
          onSuccess={() => {
            setShowUploadVideo(false);
            queryClient.invalidateQueries({ queryKey: ['videos'] });
          }}
        />
      )}

      {showUploadMp3 && activeStyle && (
        <UploadDialog
          type="mp3"
          eventId={eventId}
          eventName={event?.name || ''}
          style={activeStyle}
          sessions={sessions}
          initialSessionId={selectedSessionId}
          onClose={() => setShowUploadMp3(false)}
          onSuccess={() => {
            setShowUploadMp3(false);
            queryClient.invalidateQueries({ queryKey: ['music'] });
          }}
        />
      )}

      {showScan && activeStyle && (
        <ScanPanel
          style={activeStyle}
          eventId={eventId}
          eventName={event?.name || ''}
          sessions={sessions}
          onClose={() => setShowScan(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['videos'] });
          }}
        />
      )}

      {showAddMusic && activeStyle && (
        <MusicForm
          style={activeStyle}
          eventId={eventId}
          sessions={sessions}
          initialSessionId={selectedSessionId}
          onClose={() => setShowAddMusic(false)}
          onSuccess={() => {
            setShowAddMusic(false);
            queryClient.invalidateQueries({ queryKey: ['music'] });
          }}
        />
      )}

      {activeMusicForSections && (
        <SectionsEditor
          music={activeMusicForSections}
          onClose={() => setActiveMusicForSections(null)}
        />
      )}
    </div>
  );
};

export default MediaPage;
