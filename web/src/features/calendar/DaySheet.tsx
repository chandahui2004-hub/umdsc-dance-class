import React, { useState, useEffect, useRef } from 'react';
import type { ISODate, ClassSession, DanceStyle, Instructor, VideoItem, MusicItem, EventSummary } from '@umdsc/shared';
import { useOverlayOpen } from '../../app/useOverlayOpen';
import { ClassCard } from './ClassCard';
import { formatDayLabel } from '../../lib/time';
import { resolveInstructor } from '../../lib/instructorPhotos';

export interface DaySheetProps {
  isOpen: boolean;
  onClose: () => void;
  date: ISODate | null;
  sessions: ClassSession[];
  styles: DanceStyle[];
  instructors: Instructor[];
  videos: VideoItem[];
  music: MusicItem[];
  attendance: { sessionId: string; present: boolean }[];
  attendanceLoading?: boolean;
  events?: (EventSummary | { id: string; name: string })[];
}

export const DaySheet: React.FC<DaySheetProps> = ({
  isOpen,
  onClose,
  date,
  sessions,
  styles,
  instructors,
  videos,
  music,
  attendance,
  attendanceLoading = false,
  events = []
}) => {
  useOverlayOpen(isOpen);

  // Snap height on mobile: 'half' (50vh) or 'full' (92vh)
  const [snapHeight, setSnapHeight] = useState<'half' | 'full'>('half');

  // Reset to half height whenever opened or date changes
  useEffect(() => {
    if (isOpen) {
      setSnapHeight('half');
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

    if (deltaY < -40) {
      // Dragged UP -> expand to full
      setSnapHeight('full');
    } else if (deltaY > 50) {
      // Dragged DOWN
      if (snapHeight === 'full') {
        // Collapse to half
        setSnapHeight('half');
      } else {
        // Dismiss
        onClose();
      }
    }
  };

  const toggleSnap = () => {
    setSnapHeight((prev) => (prev === 'half' ? 'full' : 'half'));
  };

  if (!isOpen || !date) return null;

  const daySessions = sessions
    .filter((s) => s.date === date)
    .sort((a, b) => a.start.localeCompare(b.start) || a.seq - b.seq);

  const formattedTitle = formatDayLabel(date).toUpperCase();
  const subtitle = `${daySessions.length} class${daySessions.length === 1 ? '' : 'es'} scheduled`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[var(--z-overlay)] flex items-end sm:items-stretch sm:justify-end"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[var(--night-0)]/80 px-dither cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
        data-testid="day-sheet-backdrop"
      />

      {/* Sheet / Drawer Panel */}
      <div
        data-testid="day-sheet-panel"
        data-snap={snapHeight}
        className={`relative z-10 w-full sm:w-[480px] max-w-full bg-[var(--night-2)] flex flex-col transition-[height,max-height] duration-200 ease-out
          border-t-4 border-t-[var(--neon-cyan)] shadow-[0_-8px_0_var(--outline)]
          sm:border-t-0 sm:border-l-4 sm:border-l-[var(--neon-cyan)] sm:shadow-[-8px_0_0_var(--outline)]
          ${snapHeight === 'half' ? 'h-[50vh] max-h-[50vh] sm:h-full sm:max-h-full' : 'h-[92vh] max-h-[92vh] sm:h-full sm:max-h-full'}
        `}
      >
        {/* Mobile Drag Handle Bar & Gesture Area */}
        <div
          data-testid="day-sheet-drag-area"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="flex sm:hidden flex-col items-center justify-center pt-2 pb-1.5 bg-[var(--night-1)] border-b border-[var(--outline)] select-none cursor-pointer"
          onClick={toggleSnap}
        >
          <button
            type="button"
            data-testid="day-sheet-handle"
            aria-label={snapHeight === 'half' ? 'Expand to full height' : 'Collapse to half height'}
            className="flex flex-col items-center gap-1 group py-0.5 px-3"
          >
            {/* Grab pill */}
            <div className="w-10 h-1.5 bg-[var(--neon-cyan)] rounded-none shadow-[1px_1px_0_var(--outline)]" />
            <span className="font-display text-[9px] text-[var(--neon-gold)] tracking-wider">
              {snapHeight === 'half' ? '▲ EXPAND TO FULL PAGE' : '▼ COLLAPSE TO HALF'}
            </span>
          </button>
        </div>

        {/* Header */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="bg-[var(--night-1)] text-[var(--text-1)] px-4 py-3 border-b-2 border-[var(--outline)] flex items-center justify-between shrink-0"
        >
          <div className="min-w-0 pr-2">
            <h2 className="font-display text-[12px] sm:text-[14px] tracking-wider uppercase text-[var(--neon-cyan)] px-glow-text truncate">
              {formattedTitle}
            </h2>
            <p className="font-mono text-[11px] text-[var(--text-3)] truncate mt-0.5">
              {subtitle}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 shrink-0 flex items-center justify-center bg-[var(--neon-red)] text-[var(--on-neon)] border-2 border-[var(--outline)] font-display text-[12px] cursor-pointer shadow-[2px_2px_0_var(--outline)] active:translate-x-[2px] active:translate-y-[2px]"
          >
            ✕
          </button>
        </div>

        {/* Sheet Content Body */}
        <div className="p-4 overflow-y-auto pixel-scrollbar font-body text-base flex-1 space-y-4">
          {daySessions.length === 0 ? (
            <div className="p-6 text-center px-well space-y-2">
              <p className="font-display text-[12px] text-[var(--text-2)]">
                NO CLASSES SCHEDULED FOR THIS DAY
              </p>
              <p className="font-body text-[16px] text-[var(--text-3)]">
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
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
