import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { todayKL, addMonths } from '../../lib/time';
import { streamUrl, openInDriveUrl } from '../../lib/google/driveUrls';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { UploadDialog } from './UploadDialog';
import { ScanPanel } from './ScanPanel';
import { MusicForm } from './MusicForm';
import { SectionsEditor } from './SectionsEditor';
import type { ClassSession, DanceStyle, Month, Video, Music } from '@umdsc/shared';

export const MediaPage: React.FC = () => {
  const queryClient = useQueryClient();

  const currentMonth = todayKL().slice(0, 7);
  const [month, setMonth] = useState<Month>(currentMonth);
  const [styleId, setStyleId] = useState<string>('');
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
  React.useEffect(() => {
    if (!styleId && styles.length > 0) {
      setStyleId(styles[0].id);
    }
  }, [styleId, styles]);

  // Fetch sessions for this style & month
  const { data: sessions = [] } = useQuery<ClassSession[]>({
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
            Upload class recap videos, scan Google Drive folders, and manage dance music tracks.
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
            disabled={!activeStyle || sessions.length === 0}
          >
            UPLOAD MP3
          </PixelButton>
          <PixelButton
            size="md"
            variant="primary"
            onClick={() => setShowUploadVideo(true)}
            disabled={!activeStyle || sessions.length === 0}
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

      {/* Session Filter Bar */}
      {sessions.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b-2 border-[var(--c-ink)]">
          <button
            type="button"
            onClick={() => setSelectedSessionId('')}
            className={`min-h-[40px] px-3 border-2 border-[var(--c-ink)] font-display text-xs cursor-pointer select-none whitespace-nowrap ${
              !selectedSessionId
                ? 'bg-[var(--c-orange)] text-[var(--c-ink)] font-bold shadow-[2px_2px_0_var(--c-ink)]'
                : 'bg-[var(--c-panel)] text-[var(--c-ink)] hover:bg-[var(--c-bg)]'
            }`}
          >
            ALL SESSIONS ({videos.length} videos)
          </button>
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedSessionId(s.id)}
              className={`min-h-[40px] px-3 border-2 border-[var(--c-ink)] font-display text-xs cursor-pointer select-none whitespace-nowrap ${
                selectedSessionId === s.id
                  ? 'bg-[var(--c-orange)] text-[var(--c-ink)] font-bold shadow-[2px_2px_0_var(--c-ink)]'
                  : 'bg-[var(--c-panel)] text-[var(--c-ink)] hover:bg-[var(--c-bg)]'
              }`}
            >
              #{s.seq} {s.date.slice(5)}
            </button>
          ))}
        </div>
      )}

      {/* Main Grid: Videos and Music */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Videos Section */}
        <Panel
          title={`CLASS RECAP VIDEOS (${filteredVideos.length})`}
          className="px-corners bg-[var(--c-panel)] space-y-4"
        >
          {filteredVideos.length === 0 ? (
            <div className="p-8 text-center border-2 border-[var(--c-ink)] bg-[var(--c-bg)]">
              <p className="font-display text-xs text-[var(--c-darkgrey)]">
                NO RECAP VIDEOS UPLOADED YET
              </p>
              <p className="font-body text-xs text-[var(--c-darkgrey)] mt-1">
                Upload recap videos or scan your Drive folder to link them.
              </p>
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
          {filteredMusic.length === 0 ? (
            <div className="p-8 text-center border-2 border-[var(--c-ink)] bg-[var(--c-bg)]">
              <p className="font-display text-xs text-[var(--c-darkgrey)]">
                NO MUSIC TRACKS ADDED YET
              </p>
              <p className="font-body text-xs text-[var(--c-darkgrey)] mt-1">
                Add YouTube audio links or upload MP3s for Studio practice.
              </p>
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
