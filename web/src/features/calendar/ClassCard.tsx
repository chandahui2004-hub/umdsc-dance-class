import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { musicAppLinks, canPractise, type ClassSession, type DanceStyle, type Instructor, type VideoItem, type MusicItem } from '@umdsc/shared';
import { getStyleColor, STYLE_COLOR } from '../../theme/colors';
import { PixelButton } from '../../components/ui/PixelButton';
import { NeonSign } from '../../components/ui/NeonSign';
import { PixelPortraitFrame } from '../../components/ui/PixelPortraitFrame';
import { streamUrl, downloadUrl, openInDriveUrl, previewUrl, folderUrl } from '../../lib/google/driveUrls';
import { getInstructorPhotoUrl } from '../../lib/instructorPhotos';
import { todayKL } from '../../lib/time';

export interface ClassCardProps {
  session: ClassSession;
  style?: DanceStyle;
  instructor?: Instructor;
  attendancePresent?: boolean;
  /** True while attendance is still being fetched: a past class is then not yet "absent". */
  attendanceLoading?: boolean;
  videos: VideoItem[];
  music: MusicItem[];
  eventName?: string;
  /** Admin view: no personal ATTENDED/ABSENT badge; `action` (e.g. EDIT CLASS) shows in its place. */
  showAttendance?: boolean;
  action?: React.ReactNode;
}

export const ClassCard: React.FC<ClassCardProps> = ({
  session,
  style,
  instructor,
  attendancePresent,
  attendanceLoading = false,
  videos,
  music,
  eventName,
  showAttendance = true,
  action
}) => {
  const navigate = useNavigate();
  const today = todayKL();
  const isPast = session.date < today;

  const nowHM = new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const isHappeningNow = session.date === today && session.start <= nowHM && nowHM <= session.end;

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

  const color = style ? getStyleColor(style.colorKey) : 'var(--neon-orange)';

  return (
    <div
      data-testid={`class-card-${session.id}`}
      className={`px-panel p-3 md:p-4 space-y-4 ${isHappeningNow ? 'px-neon' : ''}`}
      style={{
        borderLeft: `4px solid ${color}`,
        ...(isHappeningNow ? ({ ['--glow' as any]: color } as React.CSSProperties) : {})
      }}
    >
      {/* Header: Style, Seq, Event tag & Attendance Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b-2 border-[var(--outline)]">
        <div className="flex flex-wrap items-center gap-2">
          <NeonSign text={style?.name.toUpperCase() || 'CLASS'} color={color} size="sm" />
          <span className="font-mono text-xs text-[var(--text-2)]">
            #{session.seq}
          </span>
          {eventName && (
            <span className="font-display text-[10px] px-1.5 py-0.5 bg-[var(--night-2)] border border-[var(--outline)] text-[var(--neon-cyan)] font-bold">
              {eventName}
            </span>
          )}
        </div>

        {/* Attendance Status (dancers) or the admin's action */}
        <div>
          {!showAttendance ? (
            action ?? null
          ) : attendancePresent === true ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--neon-green)] text-[var(--on-neon)] border-2 border-[var(--outline)] font-display text-[10px] md:text-[12px] font-bold">
              ✓ ATTENDED
            </span>
          ) : isPast && attendanceLoading ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--violet-2)] text-[var(--text-2)] border-2 border-[var(--outline)] font-display text-[10px] md:text-[12px] font-bold animate-pulse">
              CHECKING…
            </span>
          ) : isPast ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--night-2)] text-[var(--neon-red)] border-2 border-[var(--neon-red)] font-display text-[10px] md:text-[12px] font-bold">
              ✕ ABSENT
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--neon-gold)] text-[var(--on-neon)] border-2 border-[var(--outline)] font-display text-[10px] md:text-[12px] font-bold animate-pulse">
              UPCOMING
            </span>
          )}
        </div>
      </div>

      {/* Class Meta & Instructor Focus Block: Photo Left, Information Right */}
      {(() => {
        const photoUrl = getInstructorPhotoUrl(instructor);
        const instructorColor = instructor?.color?.startsWith('#')
          ? instructor.color
          : instructor?.color
          ? (STYLE_COLOR[instructor.color.toLowerCase()] || `var(--c-${instructor.color})`)
          : color;

        return (
          <div className="px-well p-3 md:p-4 flex flex-col sm:flex-row gap-4 items-center sm:items-start">
            {/* Instructor Portrait & Badge (Left - Focus Point) */}
            <div className="shrink-0">
              <PixelPortraitFrame
                src={photoUrl || ''}
                alt={instructor?.name || 'Instructor'}
                name="INSTRUCTOR"
                glow={instructorColor}
                size="lg"
              />
            </div>

            {/* Information (Right) */}
            <div className="flex-1 w-full space-y-3">
              <div>
                <span className="font-display text-[10px] text-[var(--text-2)] uppercase tracking-wider block">
                  INSTRUCTOR
                </span>
                <h3 className="font-display text-base md:text-lg text-[var(--text-1)] font-bold mt-0.5">
                  {instructor?.name || 'TBA'}
                </h3>
                {instructor?.contact && (
                  <p className="font-mono text-xs text-[var(--text-2)] mt-0.5 flex items-center gap-1">
                    <span>📞</span> {instructor.contact}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t-2 border-[var(--outline)]">
                <div>
                  <span className="font-display text-[10px] text-[var(--text-2)] block">TIME:</span>
                  <span className="font-mono text-[24px] text-[var(--neon-gold)] leading-none">{session.start} - {session.end}</span>
                </div>
                <div>
                  <span className="font-display text-[10px] text-[var(--text-2)] block">VENUE:</span>
                  <span className="font-body text-[16px] text-[var(--text-2)]">{session.venue || 'Dance Studio'}</span>
                </div>
              </div>

              {session.note && (
                <div className="px-well p-2 text-xs font-mono">
                  <span className="font-display text-[10px] text-[var(--text-2)] block">CLASS NOTE:</span>
                  <span className="text-[var(--text-1)]">{session.note}</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Videos Section */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-display text-[12px] text-[var(--text-1)] tracking-wider">
            CLASS RECAP VIDEOS ({videos.length})
          </h4>
          {videos.length > 0 && (
            <PixelButton
              size="sm"
              variant="secondary"
              onClick={handleToggleAllVideos}
              data-testid="toggle-all-videos-btn"
              className="text-[10px] py-0.5 px-2"
            >
              {allVideosCollapsed ? '▼ EXPAND ALL' : '▲ COLLAPSE ALL'}
            </PixelButton>
          )}
        </div>

        {videos.length === 0 ? (
          <div className="px-well p-3 space-y-2">
            <p className="font-body text-[14px] text-[var(--text-3)] italic">
              No individual recap videos tagged for this class yet.
            </p>
            {style?.videoFolderId && (
              <div className="pt-1">
                <a
                  href={folderUrl(style.videoFolderId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--violet-2)] text-[var(--text-1)] border-2 border-[var(--outline)] font-display text-[10px] md:text-[12px] font-bold shadow-[2px_2px_0_var(--outline)] hover:bg-[var(--violet-3)]"
                >
                  📁 OPEN {style.name.toUpperCase()} VIDEO FOLDER IN DRIVE ↗
                </a>
              </div>
            )}
          </div>
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
                    className="p-2.5 border-2 border-[var(--outline)] bg-[var(--night-2)] shadow-[2px_2px_0_var(--outline)] flex flex-wrap justify-between items-center gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => toggleVideoCollapse(v.id)}
                        className="font-display text-[10px] px-2 py-1 bg-[var(--violet-2)] border border-[var(--outline)] hover:bg-[var(--neon-gold)] hover:text-[var(--on-neon)] cursor-pointer select-none"
                        aria-label={`Expand video ${v.title}`}
                      >
                        ▼ EXPAND
                      </button>
                      <span className="font-display text-[12px] text-[var(--text-1)] font-bold truncate">
                        {v.title}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--text-2)] shrink-0">
                        {(v.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={openInDriveUrl(v.driveFileId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[12px] text-[var(--neon-cyan)] hover:underline font-bold"
                      >
                        Drive ↗
                      </a>
                      <a
                        href={downloadUrl(v.driveFileId)}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[12px] text-[var(--text-1)] hover:underline font-bold"
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
                  className="bg-[var(--night-2)] p-2.5 border-2 border-[var(--outline)] space-y-2 shadow-[2px_2px_0_var(--outline)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => toggleVideoCollapse(v.id)}
                        className="font-display text-[10px] px-2 py-1 bg-[var(--violet-2)] border border-[var(--outline)] hover:bg-[var(--neon-gold)] hover:text-[var(--on-neon)] cursor-pointer select-none"
                        aria-label={`Collapse video ${v.title}`}
                      >
                        ▲ COLLAPSE
                      </button>
                      <span className="font-display text-[12px] text-[var(--text-1)] font-bold truncate">
                        {v.title}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-[var(--text-2)] flex-shrink-0">
                      {(v.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>

                  {/* Inline Video Player: Official Google Drive Preview Iframe */}
                  <div className="relative aspect-video bg-black border-2 border-[var(--outline)] overflow-hidden">
                    <iframe
                      src={previewUrl(v.driveFileId)}
                      title={v.title}
                      className="w-full h-full border-0"
                      allow="autoplay; encrypted-media; fullscreen"
                      allowFullScreen
                    />
                  </div>

                  {/* Video Actions */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      href={downloadUrl(v.driveFileId)}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center font-display uppercase tracking-wider select-none cursor-pointer transition-none text-center min-h-[44px] px-3 py-1 text-[10px] md:text-[12px] bg-[var(--violet-2)] text-[var(--text-1)] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)] hover:bg-[var(--violet-3)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                    >
                      DOWNLOAD
                    </a>
                    <a
                      href={openInDriveUrl(v.driveFileId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center font-display uppercase tracking-wider select-none cursor-pointer transition-none text-center min-h-[44px] px-3 py-1 text-[10px] md:text-[12px] bg-transparent text-[var(--neon-cyan)] border-2 border-dashed border-[var(--outline)] hover:bg-[var(--violet-1)] active:translate-x-[2px] active:translate-y-[2px]"
                    >
                      OPEN IN DRIVE ↗
                    </a>
                  </div>
                </div>
              );
            })}

            {style?.videoFolderId && (
              <div className="pt-1">
                <a
                  href={folderUrl(style.videoFolderId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--violet-2)] text-[var(--text-1)] border-2 border-[var(--outline)] font-display text-[10px] md:text-[12px] font-bold shadow-[2px_2px_0_var(--outline)] hover:bg-[var(--violet-3)]"
                >
                  📁 BROWSE ALL {style.name.toUpperCase()} VIDEOS IN DRIVE FOLDER ↗
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Music Section */}
      <div className="space-y-2">
        <h4 className="font-display text-[12px] text-[var(--text-1)] tracking-wider">
          PRACTICE MUSIC ({music.length})
        </h4>

        {music.length === 0 ? (
          <p className="font-body text-[14px] text-[var(--text-3)] italic px-well p-2">
            No practice tracks added yet.
          </p>
        ) : (
          <div className="space-y-3">
            {music.map((m) => (
              <div
                key={m.id}
                className="bg-[var(--night-2)] p-2.5 border-2 border-[var(--outline)] space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-[12px] text-[var(--text-1)] font-bold truncate">
                    {m.title}
                  </span>
                  <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 bg-[var(--violet-1)] text-[var(--text-2)] border border-[var(--outline)]">
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

                {/* Studio practice, plus the song in the dancer's own app */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {canPractise(m) && (
                    <PixelButton
                      size="sm"
                      variant="primary"
                      onClick={() => navigate(`/studio?music=${m.id}`)}
                      className="w-full sm:w-auto"
                    >
                      ▶ PRACTISE IN STUDIO
                    </PixelButton>
                  )}
                  {musicAppLinks(m).map(link => (
                    <a
                      key={link.label}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 border-2 border-[var(--outline)] bg-[var(--violet-2)] px-3 py-1.5 font-display text-[10px] md:text-[12px] font-bold text-[var(--text-1)] shadow-[2px_2px_0_var(--outline)] hover:bg-[var(--neon-gold)] hover:text-[var(--on-neon)] min-h-[44px]"
                    >
                      {link.label === 'Download MP3' ? 'Download MP3' : `Open in ${link.label}`}
                      <span aria-hidden="true">↗</span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
