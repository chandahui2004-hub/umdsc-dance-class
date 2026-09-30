import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { call, errorMessage } from '../../lib/api';
import { useBootstrap } from '../auth/useBootstrap';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { todayKL } from '../../lib/time';
import { STYLE_COLOR } from '../../theme/colors';
import type { ClassSession } from '@umdsc/shared';

export const TodayPage: React.FC = () => {
  const navigate = useNavigate();
  const today = todayKL();
  const currentMonth = today.slice(0, 7);

  const { data: bootstrap } = useBootstrap('admin');

  const {
    data: sessions = [],
    isLoading,
    error,
    refetch,
    isRefetching
  } = useQuery({
    queryKey: ['sessions', currentMonth],
    queryFn: async () => {
      const res = await call<ClassSession[]>('sessions.list', { month: currentMonth });
      return res.data || [];
    }
  });

  const todaySessions = sessions.filter((s) => s.date === today && s.active);

  const getStyle = (styleId: string) => {
    return bootstrap?.styles?.find((st) => st.id === styleId);
  };

  const getInstructor = (instructorId: string) => {
    return bootstrap?.instructors?.find((inst) => inst.id === instructorId);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl md:text-2xl text-[var(--c-ink)]">
            Today
          </h1>
          <p className="font-body text-sm text-[var(--c-darkgrey)]">
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
        <div className="p-8 text-center bg-[var(--c-panel)] border-4 border-[var(--c-ink)]">
          <Spinner size="lg" />
          <p className="font-display text-xs text-[var(--c-ink)] mt-3">
            LOADING TODAY'S SCHEDULE...
          </p>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="bg-[var(--c-peach)] border-4 border-[var(--c-red)] p-4 text-[var(--c-red)] font-body font-bold text-sm"
        >
          {errorMessage(error)}
        </div>
      ) : todaySessions.length === 0 ? (
        <EmptyState
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
            const instructor = getInstructor(session.instructorId);
            const colorVar = style ? STYLE_COLOR[style.colorKey] || `var(--c-${style.colorKey})` : 'var(--c-orange)';

            return (
              <Panel
                key={session.id}
                title={`${style?.name || 'Class'} Class ${session.seq}`}
                className="px-corners space-y-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    style={{ backgroundColor: colorVar }}
                    className="px-2 py-0.5 text-xs font-display text-[var(--c-ink)] border-2 border-[var(--c-ink)]"
                  >
                    {style?.name || 'Dance'}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-xs font-display border border-[var(--c-ink)] ${
                      session.status === 'cancelled'
                        ? 'bg-[var(--c-red)] text-[var(--c-panel)]'
                        : session.status === 'replacement'
                        ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
                        : 'bg-[var(--c-green)] text-[var(--c-ink)]'
                    }`}
                  >
                    {session.status.toUpperCase()}
                  </span>
                </div>

                <div className="space-y-1 font-body text-sm text-[var(--c-ink)]">
                  <div>
                    <strong>Time:</strong> <span className="font-mono">{session.start} - {session.end}</span>
                  </div>
                  <div>
                    <strong>Instructor:</strong> {instructor?.name || 'TBA'}
                  </div>
                  <div>
                    <strong>Venue:</strong> {session.venue || 'Club Studio'}
                  </div>
                  {session.note && (
                    <div className="text-xs text-[var(--c-darkgrey)] italic">
                      Note: {session.note}
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <PixelButton
                    variant="primary"
                    size="md"
                    onClick={() =>
                      navigate(
                        `/admin/attendance?sessionId=${session.id}&styleId=${session.styleId}&month=${session.month}`
                      )
                    }
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
