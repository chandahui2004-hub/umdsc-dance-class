import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useBootstrap } from '../auth/useBootstrap';
import { useDancerAttendance } from '../auth/useDancerAttendance';
import { session } from '../../lib/session';
import { PixelButton } from '../../components/ui/PixelButton';
import { HeartsBar } from '../../components/ui/HeartsBar';
import { EmptyState } from '../../components/ui/EmptyState';
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
        <p className="font-display text-[12px] text-[var(--neon-cyan)] animate-pulse">
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
      <div className="flex items-center justify-between pb-2 border-b-4 border-[var(--outline)]">
        <div>
          <h1 className="font-display text-[24px] md:text-[32px] text-[var(--text-1)] px-glow-text">
            My Profile
          </h1>
          <p className="font-display text-[12px] text-[var(--neon-orange)]">
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
      <div className="px-panel p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b-2 border-[var(--outline)]">
          <span className="font-display text-[12px] text-[var(--text-2)]">
            MEMBER CARD
          </span>
          <span className="font-display text-[10px] px-2 py-0.5 bg-[var(--neon-green)] text-[var(--on-neon)] border border-[var(--outline)] font-bold">
            ACTIVE DANCER
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-[14px]">
          <div>
            <span className="font-display text-[10px] text-[var(--text-2)] block">FULL NAME:</span>
            <span className="font-display text-[14px] text-[var(--text-1)] font-bold">
              {profile?.fullName || session.get()?.claims.name || 'DANCER'}
            </span>
          </div>

          <div>
            <span className="font-display text-[10px] text-[var(--text-2)] block">MATRIC NUMBER:</span>
            <span className="font-bold text-[var(--text-1)]">
              {profile?.matricKey || 'N/A'}
            </span>
          </div>

          <div>
            <span className="font-display text-[10px] text-[var(--text-2)] block">TOTAL ATTENDANCE:</span>
            <span className="font-bold text-[var(--neon-green)]">
              {attendanceLoading ? '…' : totalAttended} / {totalClasses} classes
            </span>
          </div>

          <div>
            <span className="font-display text-[10px] text-[var(--text-2)] block">REGISTERED EVENTS:</span>
            <span className="font-bold text-[var(--text-1)]">
              {events.length} {events.length === 1 ? 'event' : 'events'}
            </span>
          </div>
        </div>
      </div>

      {/* Events & Attendance Hearts */}
      <div className="space-y-3">
        <h2 className="font-display text-[14px] md:text-[16px] text-[var(--text-1)] tracking-wider">
          REGISTERED EVENTS & ATTENDANCE
        </h2>

        {events.length === 0 ? (
          <EmptyState
            title="NO EVENTS"
            description="No registered events found."
            scene="shutter"
          />
        ) : (
          <div className="space-y-3 max-h-[650px] overflow-y-auto pixel-scrollbar p-1">
            {events.map((event) => {
              const eventSessions = sessions.filter((s) => s.eventId === event.id);

              return (
                <div
                  key={event.id}
                  className="px-panel p-4 space-y-3"
                >
                  {/* Event Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b-2 border-[var(--outline)]">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-[10px] px-1.5 py-0.5 bg-[var(--neon-gold)] text-[var(--on-neon)] border border-[var(--outline)] font-bold">
                        {event.type.toUpperCase()}
                      </span>
                      <span className="font-display text-[12px] md:text-[14px] text-[var(--text-1)] font-bold">
                        {event.name}
                      </span>
                    </div>
                    <span className="font-mono text-[12px] text-[var(--text-2)]">
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
                          className="px-well p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3.5 h-3.5 border border-[var(--outline)] inline-block flex-shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <div>
                              <span className="font-display text-[12px] text-[var(--text-1)] font-bold block">
                                {style.name.toUpperCase()}
                              </span>
                              <span className="font-mono text-[12px] text-[var(--text-2)]">
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
            })}
          </div>
        )}
      </div>
    </div>
  );
};
