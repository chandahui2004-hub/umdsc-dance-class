import React, { useState, useEffect, useRef } from 'react';
import type { ISODate, ClassSession, DanceStyle, Instructor, VideoItem, MusicItem, EventSummary } from '@umdsc/shared';
import { useOverlayOpen } from '../../app/useOverlayOpen';
import { ClassCard } from './ClassCard';
import { formatDayLabel } from '../../lib/time';
import { resolveInstructor, getInstructorPhotoUrl, getDriveThumbnailUrl } from '../../lib/instructorPhotos';
import { getInstructorColor } from '../../theme/colors';

export interface DaySheetProps {
  isOpen: boolean;
  onClose: () => void;
  date: ISODate | null;
  sessions: ClassSession[];
  styles: DanceStyle[];
  instructors: Instructor[];
  videos?: VideoItem[];
  music?: MusicItem[];
  attendance?: { sessionId: string; present: boolean }[];
  attendanceLoading?: boolean;
  events?: (EventSummary | { id: string; name: string })[];
  showAttendance?: boolean;
  sessionAction?: (session: ClassSession) => React.ReactNode;
  forceMobile?: boolean;
}

export const DaySheet: React.FC<DaySheetProps> = ({
  isOpen,
  onClose,
  date,
  sessions,
  styles,
  instructors,
  videos = [],
  music = [],
  attendance = [],
  attendanceLoading = false,
  events = [],
  showAttendance = true,
  sessionAction,
  forceMobile
}) => {
  // Detect mobile viewport (< 640px)
  const [detectedMobile, setDetectedMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return typeof window.innerWidth === 'number' ? window.innerWidth < 640 : true;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 639.98px)');
    const update = (e: MediaQueryListEvent | MediaQueryList) => setDetectedMobile(e.matches);
    update(mq);
    if (mq.addEventListener) {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
  }, []);

  const isMobile = forceMobile !== undefined ? forceMobile : detectedMobile;

  // Snap height on mobile: 'third' (~36dvh) or 'full' (~92dvh)
  const [snapHeight, setSnapHeight] = useState<'third' | 'full'>('third');

  // Lock body scroll only when expanded to full on mobile, or on desktop drawer
  useOverlayOpen(isOpen && (!isMobile || snapHeight === 'full'));

  // Reset to 1/3 height whenever opened or date changes
  useEffect(() => {
    if (isOpen) {
      setSnapHeight('third');
    }
  }, [isOpen, date]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Touch drag state
  const touchStartY = useRef<number | null>(null);
  const touchDeltaY = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchDeltaY.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current !== null) {
      touchDeltaY.current = e.touches[0].clientY - touchStartY.current;
    }
  };

  const handleTouchEnd = () => {
    if (touchStartY.current === null) return;
    const deltaY = touchDeltaY.current;
    touchStartY.current = null;
    touchDeltaY.current = 0;

    if (deltaY < -20) {
      // Dragged UP -> expand to full
      setSnapHeight('full');
    } else if (deltaY > 20) {
      // Dragged DOWN
      if (snapHeight === 'full') {
        // Collapse to 1/3
        setSnapHeight('third');
      } else if (deltaY > 40) {
        // Dragged down significantly while in 1/3 -> dismiss
        onClose();
      }
    }
  };

  const toggleSnap = () => {
    setSnapHeight((prev) => (prev === 'third' ? 'full' : 'third'));
  };

  if (!isOpen || !date) return null;

  const daySessions = sessions
    .filter((s) => s.date === date)
    .sort((a, b) => a.start.localeCompare(b.start) || a.seq - b.seq);

  const formattedTitle = formatDayLabel(date).toUpperCase();
  const subtitle = `${daySessions.length} class${daySessions.length === 1 ? '' : 'es'} scheduled`;

  const isThirdMode = isMobile && snapHeight === 'third';

  return (
    <div
      role="dialog"
      aria-modal={!isThirdMode}
      className={`fixed inset-0 z-[var(--z-overlay)] flex items-end sm:items-stretch sm:justify-end ${
        isThirdMode ? 'pointer-events-none' : 'pointer-events-auto'
      }`}
    >
      {/* Backdrop: only visible & active when expanded to full on mobile, or on desktop */}
      {!isThirdMode && (
        <div
          className="fixed inset-0 bg-[var(--night-0)]/80 px-dither cursor-pointer pointer-events-auto"
          onClick={onClose}
          aria-hidden="true"
          data-testid="day-sheet-backdrop"
        />
      )}

      {/* Sheet / Drawer Panel */}
      <div
        data-testid="day-sheet-panel"
        data-snap={snapHeight}
        className="relative z-10 w-full sm:w-[480px] max-w-full bg-[var(--night-2)] flex flex-col day-sheet-mobile-panel overflow-hidden pointer-events-auto"
        style={
          isMobile
            ? {
                height: snapHeight === 'third' ? '36dvh' : '92dvh',
                maxHeight: snapHeight === 'third' ? '36dvh' : '92dvh',
                transition: 'height 250ms cubic-bezier(0.2, 0.9, 0.3, 1), max-height 250ms cubic-bezier(0.2, 0.9, 0.3, 1)'
              }
            : undefined
        }
      >
        {/* Mobile Drag Handle Bar & Gesture Area */}
        <div
          data-testid="day-sheet-drag-area"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ touchAction: 'none' }}
          className="flex sm:hidden flex-col items-center justify-center pt-2 pb-1.5 bg-[var(--night-1)] border-b border-[var(--outline)] select-none cursor-pointer"
          onClick={toggleSnap}
        >
          <button
            type="button"
            data-testid="day-sheet-handle"
            aria-label={snapHeight === 'third' ? 'Expand to full height' : 'Collapse to 1/3 height'}
            className="flex flex-col items-center gap-1 group py-0.5 px-4"
          >
            {/* Grab pill */}
            <div className="w-12 h-1.5 bg-[var(--neon-cyan)] rounded-none shadow-[1px_1px_0_var(--outline)]" />
            <span className="font-display text-[9px] text-[var(--neon-gold)] tracking-wider">
              {snapHeight === 'third' ? '▲ EXPAND (FULL SCREEN)' : '▼ COLLAPSE (1/3 SCREEN)'}
            </span>
          </button>
        </div>

        {/* Header */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ touchAction: 'none' }}
          className="bg-[var(--night-1)] text-[var(--text-1)] px-3 sm:px-4 py-2 sm:py-3 border-b-2 border-[var(--outline)] flex items-center justify-between shrink-0 select-none"
        >
          <div className="min-w-0 pr-2 cursor-pointer flex-1" onClick={toggleSnap}>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-[12px] sm:text-[14px] tracking-wider uppercase text-[var(--neon-cyan)] px-glow-text truncate">
                {formattedTitle}
              </h2>
              {isThirdMode && (
                <span className="font-mono text-[9px] px-1.5 py-0.5 bg-[var(--violet-2)] text-[var(--neon-gold)] border border-[var(--outline)] shrink-0">
                  TAP TO EXPAND
                </span>
              )}
            </div>
            <p className="font-mono text-[10px] sm:text-[11px] text-[var(--text-3)] truncate mt-0.5">
              {subtitle}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 flex items-center justify-center bg-[var(--neon-red)] text-[var(--on-neon)] border-2 border-[var(--outline)] font-display text-[12px] cursor-pointer shadow-[2px_2px_0_var(--outline)] active:translate-x-[1px] active:translate-y-[1px]"
          >
            ✕
          </button>
        </div>

        {/* Sheet Content Body - min-h-0 and flex-1 guarantee it scrolls inside container */}
        <div className="p-3 sm:p-4 overflow-y-auto pixel-scrollbar font-body text-base flex-1 min-h-0 space-y-3 sm:space-y-4">
          {daySessions.length === 0 ? (
            <div className="p-4 sm:p-6 text-center px-well space-y-2">
              <p className="font-display text-[11px] sm:text-[12px] text-[var(--text-2)]">
                NO CLASSES SCHEDULED FOR THIS DAY
              </p>
              <p className="font-body text-[14px] sm:text-[16px] text-[var(--text-3)]">
                Tap another highlighted calendar day to see class details and videos.
              </p>
            </div>
          ) : (
            daySessions.map((session) => {
              const style = styles.find((st) => st.id === session.styleId);
              const instructor = resolveInstructor(session, style, instructors);
              const att = attendance.find((a) => a.sessionId === session.id);
              const classVideos = videos.filter((v) => v.sessionId === session.id);
              const classMusic = music.filter((m) => m.sessionId === session.id);
              const ev = events.find((e) => e.id === session.eventId);
              const colorVar = getInstructorColor(instructor, session.styleId);

              // 1/3 Compact View on Mobile: show date, time, style, event, venue, small instructor picture
              if (isThirdMode) {
                const photoUrl = instructor ? getInstructorPhotoUrl(instructor) : null;
                const thumbUrl = photoUrl ? getDriveThumbnailUrl(photoUrl, 100) : null;

                return (
                  <div
                    key={session.id}
                    data-testid={`compact-class-${session.id}`}
                    onClick={() => setSnapHeight('full')}
                    className="px-panel p-2.5 flex items-center gap-3 cursor-pointer hover:bg-[var(--violet-2)] active:translate-x-[1px] active:translate-y-[1px] transition-colors"
                    style={{ borderLeft: `4px solid ${colorVar}` }}
                  >
                    {/* Small Instructor Avatar Thumbnail */}
                    <div className="w-11 h-11 shrink-0 bg-[var(--night-0)] border-2 border-[var(--outline)] overflow-hidden relative shadow-[2px_2px_0_var(--outline)] flex items-center justify-center">
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={instructor?.name || 'Instructor'}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center">
                          <span className="font-display text-[14px]">👤</span>
                          <span className="font-display text-[8px] text-[var(--text-3)] leading-none mt-0.5">IN</span>
                        </div>
                      )}
                    </div>

                    {/* Compact Class Info: Time, Dance Style, Event, Venue, Instructor */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="font-display text-[10px] uppercase px-1.5 py-0.5 border border-[var(--outline)] font-bold truncate max-w-[120px]"
                          style={{ backgroundColor: colorVar, color: 'var(--on-neon)' }}
                        >
                          {style?.name || 'CLASS'}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--text-2)] font-bold">
                          #{session.seq}
                        </span>
                        <span className="font-mono text-[11px] text-[var(--neon-gold)] font-bold">
                          {session.start} - {session.end}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--text-2)] truncate">
                        {ev?.name && (
                          <span className="text-[var(--text-1)] font-bold truncate">
                            {ev.name}
                          </span>
                        )}
                        {session.venue && (
                          <span className="text-[var(--neon-cyan)] truncate">
                            📍 {session.venue}
                          </span>
                        )}
                      </div>

                      <p className="font-body text-[13px] text-[var(--text-3)] truncate">
                        Instructor: <strong className="text-[var(--text-1)]">{instructor?.name || 'TBA'}</strong>
                      </p>
                    </div>

                    {/* Expand icon pill */}
                    <div className="shrink-0 text-[var(--neon-cyan)] font-display text-[10px] px-1.5 py-1 bg-[var(--night-1)] border border-[var(--outline)]">
                      ▲ FULL
                    </div>
                  </div>
                );
              }

              // Full Screen Mode on Mobile or Desktop Drawer
              return (
                <ClassCard
                  key={session.id}
                  session={session}
                  style={style}
                  instructor={instructor}
                  attendancePresent={att?.present}
                  attendanceLoading={attendanceLoading}
                  videos={classVideos}
                  music={classMusic}
                  eventName={ev?.name}
                  showAttendance={showAttendance}
                  action={sessionAction ? sessionAction(session) : undefined}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
