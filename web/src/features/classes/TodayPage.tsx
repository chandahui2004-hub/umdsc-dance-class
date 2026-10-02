import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { call, errorMessage } from '../../lib/api';
import { useBootstrap } from '../auth/useBootstrap';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { PixelPortraitFrame } from '../../components/ui/PixelPortraitFrame';
import { todayKL } from '../../lib/time';
import { getStyleColor } from '../../theme/colors';
import type { TodayClass } from '@umdsc/shared';
import { useCurrentEvent } from '../events/useCurrentEvent';
import { resolveInstructor, getInstructorPhotoUrl } from '../../lib/instructorPhotos';

export const TodayPage: React.FC = () => {
  const navigate = useNavigate();
  const today = todayKL();
  const { data: bootstrap } = useBootstrap('admin');
  const { setCurrentId } = useCurrentEvent();

  const {
    data: sessions = [],
    isLoading,
    error,
    refetch,
    isRefetching
  } = useQuery({
    queryKey: ['sessions', 'today'],
    queryFn: async () => (await call<TodayClass[]>('sessions.today', {})).data || []
  });

  const todaySessions = sessions;

  const getStyle = (styleId: string) => {
    return bootstrap?.styles?.find((st) => st.id === styleId);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] text-[var(--text-1)]">
            Today
          </h1>
          <p className="font-body text-[14px] text-[var(--text-2)]">
            Classes scheduled for today ({today})
          </p>
        </div>

        <PixelButton
          variant="secondary"
          size="md"
          onClick={() => refetch()}
          disabled={isRefetching}
        >
          {isRefetching ? 'REFRESHING...' : 'REFRESH'}
        </PixelButton>
      </div>

      {isLoading ? (
        <div className="p-8 text-center bg-[var(--night-2)] border-2 border-[var(--outline)]">
          <Spinner size="lg" />
          <p className="font-display text-[12px] text-[var(--text-1)] mt-3">
            LOADING TODAY'S SCHEDULE...
          </p>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="bg-[var(--night-1)] border-2 border-[var(--neon-red)] p-4 text-[var(--neon-red)] font-body font-bold text-[14px]"
        >
          {errorMessage(error)}
        </div>
      ) : todaySessions.length === 0 ? (
        <EmptyState
          scene="shutter"
          title="NO CLASSES TODAY"
          description={`There are no dance classes scheduled for today (${today}). Check the Calendar tab for upcoming classes.`}
          action={
            <PixelButton size="md" variant="secondary" onClick={() => navigate('/admin/calendar')}>
              VIEW CALENDAR
            </PixelButton>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {todaySessions.map((session) => {
            const style = getStyle(session.styleId);
            const instructor = resolveInstructor(session, style, bootstrap?.instructors || []);
            const photoUrl = getInstructorPhotoUrl(instructor);
            const colorVar = getStyleColor(style?.colorKey);

            return (
              <Panel
                key={session.id}
                title={`${style?.name || 'Class'} Class ${session.seq} · ${session.eventName}`}
                className="space-y-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    style={{ backgroundColor: colorVar }}
                    className="px-2 py-0.5 text-[12px] font-display text-[var(--on-neon)] font-bold border-2 border-[var(--outline)]"
                  >
                    {style?.name || 'Dance'}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[12px] font-display border border-[var(--outline)] font-bold ${
                      session.status === 'cancelled'
                        ? 'bg-[var(--neon-red)] text-[var(--on-neon)]'
                        : session.status === 'replacement'
                        ? 'bg-[var(--neon-gold)] text-[var(--on-neon)]'
                        : 'bg-[var(--neon-green)] text-[var(--on-neon)]'
                    }`}
                  >
                    {session.status.toUpperCase()}
                  </span>
                </div>

                <div className="flex items-start gap-3">
                  <PixelPortraitFrame
                    src={photoUrl || ''}
                    alt={instructor?.name || 'Instructor'}
                    name={instructor?.name || 'TBA'}
                    glow={colorVar}
                    size="sm"
                  />
                  <div className="space-y-1 font-body text-[14px] text-[var(--text-1)]">
                    <div>
                      <strong>Time:</strong> <span className="font-mono text-[14px]">{session.start} - {session.end}</span>
                    </div>
                    <div>
                      <strong>Instructor:</strong> {instructor?.name || 'TBA'}
                    </div>
                    <div>
                      <strong>Venue:</strong> {session.venue || 'Club Studio'}
                    </div>
                    {session.note && (
                      <div className="text-[12px] text-[var(--text-2)] italic">
                        Note: {session.note}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <PixelButton
                    variant="primary"
                    size="md"
                    onClick={() => {
                      setCurrentId(session.eventId);
                      navigate(`/admin/attendance?sessionId=${session.id}&styleId=${session.styleId}`);
                    }}
                    className="w-full"
                  >
                    TAKE ATTENDANCE
                  </PixelButton>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TodayPage;
