import React from 'react';
import type { ISODate, ClassSession, DanceStyle, Instructor, VideoItem, MusicItem, EventSummary } from '@umdsc/shared';
import { Sheet } from '../../components/ui/Sheet';
import { ClassCard } from './ClassCard';
import { formatDayLabel } from '../../lib/time';
import { resolveInstructor } from '../../lib/instructorPhotos';
import { useOverlayOpen } from '../../app/useOverlayOpen';

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
  useOverlayOpen(isOpen && Boolean(date));

  if (!date) return null;

  const daySessions = sessions
    .filter((s) => s.date === date)
    .sort((a, b) => a.start.localeCompare(b.start) || a.seq - b.seq);

  const formattedTitle = formatDayLabel(date).toUpperCase();

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={formattedTitle}>
      <div className="space-y-4">
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
    </Sheet>
  );
};
