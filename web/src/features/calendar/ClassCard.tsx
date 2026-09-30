import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ClassSession, DanceStyle, Instructor, VideoItem, MusicItem } from '@umdsc/shared';
import { STYLE_COLOR } from '../../theme/colors';
import { PixelButton } from '../../components/ui/PixelButton';
import { streamUrl, downloadUrl, openInDriveUrl } from '../../lib/google/driveUrls';
import { todayKL } from '../../lib/time';

export interface ClassCardProps {
  session: ClassSession;
  style?: DanceStyle;
  instructor?: Instructor;
  attendancePresent?: boolean;
  videos: VideoItem[];
  music: MusicItem[];
  eventName?: string;
}

export const ClassCard: React.FC<ClassCardProps> = ({
  session,
  style,
  instructor,
  attendancePresent,
  videos,
  music,
  eventName
}) => {
  const navigate = useNavigate();
  const today = todayKL();
  const isPast = session.date < today;

  // Video collapse state
  const [allVideosCollapsed, setAllVideosCollapsed] = useState(false);
  const [collapsedVideoIds, setCollapsedVideoIds] = useState<Record<string, boolean>>({});

  const handleToggleAllVideos = () => {
    const next = !allVideosCollapsed;
    setAllVideosCollapsed(next);
    setCollapsedVideoIds({});
  };

  const toggleVideoCollapse = (id: string) => {
    setCollapsedVideoIds((prev) => ({
      ...prev,
      [id]: prev[id] !== undefined ? !prev[id] : !allVideosCollapsed
    }));
  };

  const color = style ? STYLE_COLOR[style.colorKey] || `var(--c-${style.colorKey})` : 'var(--c-orange)';

  return (
    <div className="bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] p-3 md:p-4 space-y-4">
      {/* Header: Style, Seq, Event tag & Attendance Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b-2 border-[var(--c-ink)]">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="w-4 h-4 rounded-none border border-[var(--c-ink)] inline-block flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="font-display text-sm md:text-base text-[var(--c-ink)] font-bold">
            {style?.name.toUpperCase() || 'CLASS'}
          </span>
          <span className="font-mono text-xs text-[var(--c-darkgrey)]">
            #{session.seq}
          </span>
          {eventName && (
            <span className="font-display text-[9px] px-1.5 py-0.5 bg-[var(--c-bg)] border border-[var(--c-ink)] text-[var(--c-navy)] font-bold">
              {eventName}
            </span>
          )}
        </div>

        {/* Attendance Status */}
        <div>
          {attendancePresent === true ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--c-green)] text-[var(--c-ink)] border-2 border-[var(--c-ink)] font-display text-[10px] font-bold">
              ✓ ATTENDED
            </span>
          ) : isPast ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--c-darkgrey)] text-[var(--c-panel)] border-2 border-[var(--c-ink)] font-display text-[10px] font-bold">
              ✕ ABSENT
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--c-yellow)] text-[var(--c-ink)] border-2 border-[var(--c-ink)] font-display text-[10px] font-bold animate-pulse">
              UPCOMING
            </span>
          )}
        </div>
      </div>

      {/* Class Meta: Time, Venue, Instructor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono bg-[var(--c-bg)] p-2.5 border-2 border-[var(--c-ink)]">
        <div>
          <span className="font-display text-[10px] text-[var(--c-darkgrey)] block">TIME:</span>
          <span className="font-bold text-[var(--c-ink)]">{session.start} - {session.end}</span>
        </div>
        <div>
          <span className="font-display text-[10px] text-[var(--c-darkgrey)] block">VENUE:</span>
          <span className="font-bold text-[var(--c-ink)]">{session.venue || 'Dance Studio'}</span>
        </div>
        <div className="sm:col-span-2">
          <span className="font-display text-[10px] text-[var(--c-darkgrey)] block">INSTRUCTOR:</span>
          <span className="font-bold text-[var(--c-ink)]">{instructor?.name || 'TBA'}</span>
        </div>
      </div>

      {/* Videos Section */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-display text-xs text-[var(--c-ink)] tracking-wider">
            CLASS RECAP VIDEOS ({videos.length})
          </h4>
          {videos.length > 0 && (
            <PixelButton
              size="sm"
              variant="secondary"
              onClick={handleToggleAllVideos}
              data-testid="toggle-all-videos-btn"
              className="text-[9px] py-0.5 px-2"
            >
              {allVideosCollapsed ? '▼ EXPAND ALL' : '▲ COLLAPSE ALL'}
            </PixelButton>
          )}
        </div>

        {videos.length === 0 ? (
          <p className="font-body text-xs text-[var(--c-darkgrey)] italic bg-[var(--c-bg)] p-2 border border-dashed border-[var(--c-ink)]">
            No recap videos uploaded yet.
          </p>
        ) : (
          <div className="space-y-3">
            {videos.map((v) => {
              const isCollapsed =
                collapsedVideoIds[v.id] !== undefined
                  ? collapsedVideoIds[v.id]
                  : allVideosCollapsed;

              if (isCollapsed) {
                return (
                  <div
                    key={v.id}
                    data-testid={`video-card-${v.id}`}
                    className="p-2.5 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] shadow-[2px_2px_0_var(--c-ink)] flex flex-wrap justify-between items-center gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => toggleVideoCollapse(v.id)}
                        className="font-display text-[9px] px-1.5 py-0.5 bg-[var(--c-panel)] border border-[var(--c-ink)] hover:bg-[var(--c-yellow)] cursor-pointer select-none"
                        aria-label={`Expand video ${v.title}`}
                      >
                        ▼ EXPAND
                      </button>
                      <span className="font-display text-xs text-[var(--c-ink)] font-bold truncate">
                        {v.title}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--c-darkgrey)] shrink-0">
                        {(v.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={openInDriveUrl(v.driveFileId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-[var(--c-blue)] underline font-bold"
                      >
                        Drive ↗
                      </a>
                      <a
                        href={downloadUrl(v.driveFileId)}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-[var(--c-ink)] underline font-bold"
                      >
                        Download ⬇
                      </a>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={v.id}
                  data-testid={`video-card-${v.id}`}
                  className="bg-[var(--c-bg)] p-2.5 border-2 border-[var(--c-ink)] space-y-2 shadow-[2px_2px_0_var(--c-ink)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => toggleVideoCollapse(v.id)}
                        className="font-display text-[9px] px-1.5 py-0.5 bg-[var(--c-panel)] border border-[var(--c-ink)] hover:bg-[var(--c-yellow)] cursor-pointer select-none"
                        aria-label={`Collapse video ${v.title}`}
                      >
                        ▲ COLLAPSE
                      </button>
                      <span className="font-display text-xs text-[var(--c-ink)] font-bold truncate">
                        {v.title}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-[var(--c-darkgrey)] flex-shrink-0">
                      {(v.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>

                  {/* Inline Video Player */}
                  <div className="relative aspect-video bg-black border-2 border-[var(--c-ink)] overflow-hidden">
                    <video
                      src={streamUrl(v.driveFileId)}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-contain"
                    />
                  </div>

                  {/* Video Actions */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      href={downloadUrl(v.driveFileId)}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center font-display uppercase tracking-wider select-none cursor-pointer transition-none text-center min-h-[36px] px-2.5 py-1 text-[10px] bg-[var(--c-panel)] text-[var(--c-ink)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] hover:bg-[var(--c-peach)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
                    >
                      DOWNLOAD
                    </a>
                    <a
                      href={openInDriveUrl(v.driveFileId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center font-display uppercase tracking-wider select-none cursor-pointer transition-none text-center min-h-[36px] px-2.5 py-1 text-[10px] bg-transparent text-[var(--c-ink)] border-2 border-dashed border-[var(--c-ink)] hover:bg-[var(--c-peach)] active:translate-x-[2px] active:translate-y-[2px]"
                    >
                      OPEN IN DRIVE ↗
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Music Section */}
      <div className="space-y-2">
        <h4 className="font-display text-xs text-[var(--c-ink)] tracking-wider">
          PRACTICE MUSIC ({music.length})
        </h4>

        {music.length === 0 ? (
          <p className="font-body text-xs text-[var(--c-darkgrey)] italic bg-[var(--c-bg)] p-2 border border-dashed border-[var(--c-ink)]">
            No practice tracks added yet.
          </p>
        ) : (
          <div className="space-y-3">
            {music.map((m) => (
              <div
                key={m.id}
                className="bg-[var(--c-bg)] p-2.5 border-2 border-[var(--c-ink)] space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-xs text-[var(--c-ink)] font-bold truncate">
                    {m.title}
                  </span>
                  <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 bg-[var(--c-navy)] text-[var(--c-peach)] border border-[var(--c-ink)]">
                    {m.sourceType}
                  </span>
                </div>

                {/* Audio / Video Embed */}
                {m.sourceType === 'mp3' && m.driveFileId && (
                  <audio
                    src={streamUrl(m.driveFileId)}
                    controls
                    preload="metadata"
                    className="w-full"
                  />
                )}
                {m.sourceType === 'youtube' && m.youtubeId && (
                  <div className="relative aspect-video bg-black border-2 border-[var(--c-ink)] overflow-hidden">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${m.youtubeId}`}
                      title={m.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    />
                  </div>
                )}

                {/* Studio Practice Action */}
                <div className="pt-1">
                  <PixelButton
                    size="sm"
                    variant="primary"
                    onClick={() => navigate(`/studio?music=${m.id}`)}
                    className="w-full sm:w-auto"
                  >
                    ▶ PRACTISE IN STUDIO
                  </PixelButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
