import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useBootstrap } from '../auth/useBootstrap';
import { useDancerAttendance } from '../auth/useDancerAttendance';
import { session } from '../../lib/session';
import { PixelButton } from '../../components/ui/PixelButton';
import { HeartsBar } from '../../components/ui/HeartsBar';
import { STYLE_COLOR } from '../../theme/colors';

export const MePage: React.FC = () => {
  const navigate = useNavigate();
  const { data: bootstrap, isLoading } = useBootstrap('dancer');

  const profile = bootstrap?.profile;
  const events = bootstrap?.events || [];
  const styles = bootstrap?.styles || [];
  const sessions = bootstrap?.sessions || [];
  const { attendance, isLoading: attendanceLoading } = useDancerAttendance();

  const handleLogout = () => {
    session.clear();
    navigate('/login', { replace: true });
  };

  if (isLoading && !bootstrap) {
    return (
      <div className="p-8 text-center">
        <p className="font-display text-xs text-[var(--c-darkgrey)] animate-pulse">
          LOADING PROFILE DATA…
        </p>
      </div>
    );
  }

  // Calculate overall stats
  const attMap = new Set(attendance.filter((a) => a.present).map((a) => a.sessionId));
  const totalAttended = sessions.filter((s) => attMap.has(s.id)).length;
  const totalClasses = sessions.length;

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Page Title */}
      <div className="flex items-center justify-between pb-2 border-b-4 border-[var(--c-ink)]">
        <div>
          <h1 className="font-display text-xl md:text-2xl text-[var(--c-ink)]">
            My Profile
          </h1>
          <p className="font-display text-xs text-[var(--c-orange)]">
            DANCER PASS
          </p>
        </div>

        <PixelButton
          size="sm"
          variant="danger"
          onClick={handleLogout}
        >
          LOG OUT
        </PixelButton>
      </div>

      {/* Profile Card */}
      <div className="bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b-2 border-[var(--c-ink)]">
          <span className="font-display text-xs text-[var(--c-darkgrey)]">
            MEMBER CARD
          </span>
          <span className="font-display text-[10px] px-2 py-0.5 bg-[var(--c-green)] text-[var(--c-ink)] border border-[var(--c-ink)] font-bold">
            ACTIVE DANCER
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-sm">
          <div>
            <span className="font-display text-[10px] text-[var(--c-darkgrey)] block">FULL NAME:</span>
            <span className="font-display text-sm text-[var(--c-ink)] font-bold">
              {profile?.fullName || session.get()?.claims.name || 'DANCER'}
            </span>
          </div>

          <div>
            <span className="font-display text-[10px] text-[var(--c-darkgrey)] block">MATRIC NUMBER:</span>
            <span className="font-bold text-[var(--c-ink)]">
              {profile?.matricKey || 'N/A'}
            </span>
          </div>

          <div>
            <span className="font-display text-[10px] text-[var(--c-darkgrey)] block">TOTAL ATTENDANCE:</span>
            <span className="font-bold text-[var(--c-darkgreen)]">
              {attendanceLoading ? '…' : totalAttended} / {totalClasses} classes
            </span>
          </div>

          <div>
            <span className="font-display text-[10px] text-[var(--c-darkgrey)] block">REGISTERED EVENTS:</span>
            <span className="font-bold text-[var(--c-ink)]">
              {events.length} {events.length === 1 ? 'event' : 'events'}
            </span>
          </div>
        </div>
      </div>

      {/* Events & Attendance Hearts */}
      <div className="space-y-3">
        <h2 className="font-display text-sm md:text-base text-[var(--c-ink)] tracking-wider">
          REGISTERED EVENTS & ATTENDANCE
        </h2>

        {events.length === 0 ? (
          <div className="p-4 bg-[var(--c-panel)] border-2 border-dashed border-[var(--c-ink)] text-center text-xs font-mono text-[var(--c-darkgrey)]">
            No registered events found.
          </div>
        ) : (
          events.map((event) => {
            const eventSessions = sessions.filter((s) => s.eventId === event.id);

            return (
              <div
                key={event.id}
                className="bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] p-4 space-y-3"
              >
                {/* Event Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b-2 border-[var(--c-ink)]">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[10px] px-1.5 py-0.5 bg-[var(--c-yellow)] text-[var(--c-ink)] border border-[var(--c-ink)] font-bold">
                      {event.type.toUpperCase()}
                    </span>
                    <span className="font-display text-xs md:text-sm text-[var(--c-ink)] font-bold">
                      {event.name}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-[var(--c-darkgrey)]">
                    {event.startDate} → {event.endDate}
                  </span>
                </div>

                {/* Styles in this event */}
                <div className="space-y-3 pt-1">
                  {styles.map((style) => {
                    const styleSessions = eventSessions.filter((s) => s.styleId === style.id);
                    if (styleSessions.length === 0) return null;

                    const attendedCount = styleSessions.filter((s) => attMap.has(s.id)).length;
                    const totalStyleClasses = styleSessions.length;
                    const color = STYLE_COLOR[style.colorKey] || `var(--c-${style.colorKey})`;

                    return (
                      <div
                        key={style.id}
                        className="bg-[var(--c-bg)] p-3 border-2 border-[var(--c-ink)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 border border-[var(--c-ink)] inline-block flex-shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <div>
                            <span className="font-display text-xs text-[var(--c-ink)] font-bold block">
                              {style.name.toUpperCase()}
                            </span>
                            <span className="font-mono text-[11px] text-[var(--c-darkgrey)]">
                              {attendanceLoading ? '…' : attendedCount} of {totalStyleClasses} classes attended
                            </span>
                          </div>
                        </div>

                        {/* Gamified 8-Bit Hearts Bar */}
                        <div className="flex items-center gap-2 self-start sm:self-center">
                          <HeartsBar
                            attended={attendedCount}
                            total={totalStyleClasses}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
