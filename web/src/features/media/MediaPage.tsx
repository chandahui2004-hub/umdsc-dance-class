import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { todayKL, addMonths, formatDayLabel } from '../../lib/time';
import { streamUrl, openInDriveUrl } from '../../lib/google/driveUrls';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { UploadDialog } from './UploadDialog';
import { ScanPanel } from './ScanPanel';
import { MusicForm } from './MusicForm';
import { SectionsEditor } from './SectionsEditor';
import type { ClassSession, DanceStyle, Month, Video, Music } from '@umdsc/shared';

export const MediaPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const currentMonth = todayKL().slice(0, 7);
  const [month, setMonth] = useState<Month>(searchParams.get('month') || currentMonth);
  const [styleId, setStyleId] = useState<string>(searchParams.get('style') || '');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');

  // Dialog states
  const [showUploadVideo, setShowUploadVideo] = useState(false);
  const [showUploadMp3, setShowUploadMp3] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [showAddMusic, setShowAddMusic] = useState(false);
  const [activeMusicForSections, setActiveMusicForSections] = useState<Music | null>(null);

  // Fetch styles
  const { data: styles = [] } = useQuery<DanceStyle[]>({
    queryKey: ['styles'],
    queryFn: async () => {
      const res = await api.post<DanceStyle[]>('styles.list');
      return res.data;
    }
  });

  const activeStyle = useMemo(
    () => styles.find((s) => s.id === styleId) || styles[0] || null,
    [styles, styleId]
  );

  // Auto-select first style
  useEffect(() => {
    if (!styleId && styles.length > 0) {
      setStyleId(styles[0].id);
    }
  }, [styleId, styles]);

  // Sync with searchParams
  useEffect(() => {
    if (month && styleId) {
      setSearchParams({ month, style: styleId }, { replace: true });
    }
  }, [month, styleId, setSearchParams]);

  // Fetch sessions for this style & month
  const { data: rawSessions = [] } = useQuery<ClassSession[]>({
    queryKey: ['sessions', styleId, month],
    queryFn: async () => {
      if (!styleId || !month) return [];
      const res = await api.post<ClassSession[]>('sessions.list', {
        styleId,
        month
      });
      return res.data;
    },
    enabled: Boolean(styleId && month)
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
    queryKey: ['videos', styleId, month],
    queryFn: async () => {
      if (!styleId || !month) return [];
      const res = await api.post<Video[]>('videos.list', {
        styleId,
        month
      });
      return res.data;
    },
    enabled: Boolean(styleId && month)
  });

  // Fetch music
  const { data: musicList = [] } = useQuery<Music[]>({
    queryKey: ['music', styleId, month],
    queryFn: async () => {
      if (!styleId || !month) return [];
      const res = await api.post<Music[]>('music.list', {
        styleId,
        month
      });
      return res.data;
    },
    enabled: Boolean(styleId && month)
  });

  // Generate 4 Classes mutation
  const generateSessionsMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ generated: ClassSession[] }>('sessions.generateMonth', {
        styleIds: [styleId],
        month
      });
      return res.data.generated;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      if (data && data.length > 0) {
        setSelectedSessionId(data[0].id);
      }
    },
    onError: (err) => {
      alert(errorMessage(err));
    }
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

      {/* Selectors Bar: Style & Month */}
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

        {/* Month Stepper */}
        <div className="flex items-center gap-2 justify-end">
          <PixelButton
            size="md"
            variant="secondary"
            onClick={() => {
              setMonth((m) => addMonths(m, -1));
              setSelectedSessionId('');
            }}
          >
            &lt;
          </PixelButton>
          <div className="px-4 py-2 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] font-mono text-sm font-bold text-[var(--c-navy)] min-w-[100px] text-center">
            {month}
          </div>
          <PixelButton
            size="md"
            variant="secondary"
            onClick={() => {
              setMonth((m) => addMonths(m, 1));
              setSelectedSessionId('');
            }}
          >
            &gt;
          </PixelButton>
        </div>
      </div>

      {/* 4-CLASS SESSIONS SECTION (Class 1 to 4) */}
      <Panel
        title={`CLASSES FOR ${activeStyle?.name.toUpperCase() || 'STYLE'} (${month})`}
        className="px-corners bg-[var(--c-panel)] space-y-4"
      >
        {sessions.length === 0 ? (
          <div className="p-6 bg-[var(--c-peach)] border-2 border-[var(--c-orange)] shadow-[2px_2px_0_var(--c-ink)] space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="font-display text-xs text-[var(--c-ink)] font-bold">
                  NO CLASSES SCHEDULED FOR {activeStyle?.name.toUpperCase()} IN {month}
                </h3>
                <p className="font-body text-sm text-[var(--c-darkgrey)] mt-1">
                  Each month typically has 4 weekly classes. Click below to automatically generate all 4 classes for {month} based on {activeStyle?.name}&apos;s default schedule.
                </p>
              </div>

              <div className="flex gap-2">
                <PixelButton
                  size="md"
                  variant="primary"
                  disabled={generateSessionsMutation.isPending || !activeStyle}
                  onClick={() => generateSessionsMutation.mutate()}
                >
                  {generateSessionsMutation.isPending
                    ? 'GENERATING 4 CLASSES...'
                    : '⚡ AUTO-GENERATE 4 CLASSES'}
                </PixelButton>
                <PixelButton
                  size="md"
                  variant="secondary"
                  onClick={() => navigate(`/admin/calendar?month=${month}`)}
                >
                  OPEN CALENDAR
                </PixelButton>
              </div>
            </div>

            {/* Empty 4-Slot Preview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 opacity-60">
              {[1, 2, 3, 4].map((num) => (
                <div
                  key={num}
                  className="p-3 border-2 border-dashed border-[var(--c-ink)] bg-[var(--c-bg)] text-center space-y-1"
                >
                  <span className="font-display text-xs text-[var(--c-darkgrey)] block">
                    CLASS {num}
                  </span>
                  <span className="font-mono text-[11px] text-[var(--c-darkgrey)]">
                    Not scheduled yet
                  </span>
                </div>
              ))}
            </div>
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
                onClick={() => navigate(`/admin/calendar?month=${month}`)}
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
          <div className="flex justify-between items-center pb-2 border-b-2 border-[var(--c-ink)]">
            <span className="font-display text-xs text-[var(--c-ink)]">
              {selectedSession ? `Class #${selectedSession.seq} Recap` : 'All Recaps'}
            </span>
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
            <div className="space-y-4">
              {filteredVideos.map((vid) => {
                const sess = sessions.find((s) => s.id === vid.sessionId);
                const stream = streamUrl(vid.driveFileId);
                const driveLink = openInDriveUrl(vid.driveFileId);

                return (
                  <div
                    key={vid.id}
                    className="p-3 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] shadow-[2px_2px_0_var(--c-ink)] space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                      <h4 className="font-display text-xs text-[var(--c-ink)] font-bold truncate">
                        {vid.title}
                      </h4>
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
          month={month}
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
          month={month}
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
          month={month}
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
          month={month}
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
