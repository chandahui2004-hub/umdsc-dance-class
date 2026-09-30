import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { call, errorMessage } from '../../lib/api';
import { useBootstrap } from '../auth/useBootstrap';
import { MonthCalendar, CalendarMark } from '../../components/ui/MonthCalendar';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Sheet } from '../../components/ui/Sheet';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { SessionEditor } from './SessionEditor';
import { todayKL } from '../../lib/time';
import { STYLE_COLOR } from '../../theme/colors';
import type { ClassSession, Month, ISODate } from '@umdsc/shared';

export const ClassesPage: React.FC = () => {
  const { data: bootstrap } = useBootstrap('admin');
  const availableMonths: Month[] = bootstrap?.months?.length
    ? bootstrap.months
    : [todayKL().slice(0, 7)];

  const [currentMonth, setCurrentMonth] = useState<Month>(availableMonths[0]);
  const [selectedDate, setSelectedDate] = useState<ISODate>(todayKL());
  const [editingSession, setEditingSession] = useState<ClassSession | null>(null);

  // Generate Month Dialog state
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [selectedStyleIds, setSelectedStyleIds] = useState<string[]>([]);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateWarnings, setGenerateWarnings] = useState<string[]>([]);

  // Fetch sessions for month
  const {
    data: sessions = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['sessions', currentMonth],
    queryFn: async () => {
      const res = await call<ClassSession[]>('sessions.list', { month: currentMonth });
      return res.data || [];
    }
  });

  const styles = bootstrap?.styles || [];
  const instructors = bootstrap?.instructors || [];

  // Build calendar marks
  const calendarMarks = useMemo(() => {
    const marksRecord: Record<ISODate, CalendarMark[]> = {};

    for (const session of sessions) {
      if (!session.active) continue;
      const style = styles.find((s) => s.id === session.styleId);
      const colorKey = style?.colorKey || 'orange';

      if (!marksRecord[session.date]) {
        marksRecord[session.date] = [];
      }

      marksRecord[session.date].push({
        colorKey,
        kind: 'class',
        label: `${style?.name || 'Class'} Class ${session.seq}`
      });
    }

    return marksRecord;
  }, [sessions, styles]);

  // Filter sessions by selected date or list all in month
  const activeSessions = sessions.filter((s) => s.active);

  const getStyle = (styleId: string) => styles.find((s) => s.id === styleId);
  const getInstructor = (instructorId: string) => instructors.find((inst) => inst.id === instructorId);

  const handleOpenGenerate = () => {
    setSelectedStyleIds(styles.map((s) => s.id));
    setGenerateWarnings([]);
    setGenerateError(null);
    setIsGenerateOpen(true);
  };

  const handleConfirmGenerate = async () => {
    if (selectedStyleIds.length === 0) {
      setGenerateError('Please select at least one dance style.');
      return;
    }

    setGenerateLoading(true);
    setGenerateError(null);

    try {
      const res = await call<{ generated: ClassSession[]; flags: string[] }>('sessions.generateMonth', {
        month: currentMonth,
        styleIds: selectedStyleIds
      });

      if (res.data?.flags?.length) {
        setGenerateWarnings(res.data.flags);
      } else {
        setIsGenerateOpen(false);
      }

      await refetch();
    } catch (err) {
      setGenerateError(errorMessage(err));
    } finally {
      setGenerateLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl md:text-2xl text-[var(--c-ink)]">
            Calendar & Classes
          </h1>
          <p className="font-body text-sm text-[var(--c-darkgrey)]">
            Schedule dance sessions and manage monthly routine dates
          </p>
        </div>

        <div className="flex gap-2">
          <PixelButton
            variant="primary"
            size="md"
            onClick={handleOpenGenerate}
            className="flex items-center gap-1.5"
          >
            GENERATE MONTH
          </PixelButton>
        </div>
      </div>

      {/* Summary Badge */}
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--c-navy)] text-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)]">
        <span className="font-display text-xs text-[var(--c-yellow)]">
          {activeSessions.length} sessions scheduled in {currentMonth}
        </span>
        <span className="font-display text-[10px] text-[var(--c-panel)]">
          MONTH: {currentMonth}
        </span>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <MonthCalendar
            month={currentMonth}
            onMonthChange={setCurrentMonth}
            allowedMonths={availableMonths}
            marks={calendarMarks}
            selected={selectedDate}
            onSelect={setSelectedDate}
          />
        </div>

        {/* Selected Date Session List */}
        <div className="space-y-3">
          <Panel title={`CLASSES ON ${selectedDate}`} className="px-corners">
            {isLoading ? (
              <div className="p-4 text-center">
                <Spinner size="md" />
              </div>
            ) : error ? (
              <div className="p-3 bg-[var(--c-peach)] text-[var(--c-red)] text-xs font-body font-bold">
                {errorMessage(error)}
              </div>
            ) : (
              <div className="space-y-2">
                {activeSessions
                  .filter((s) => s.date === selectedDate)
                  .map((session) => {
                    const style = getStyle(session.styleId);
                    const instructor = getInstructor(session.instructorId);
                    const colorVar = style ? STYLE_COLOR[style.colorKey] || `var(--c-${style.colorKey})` : 'var(--c-orange)';

                    return (
                      <div
                        key={session.id}
                        onClick={() => setEditingSession(session)}
                        className="p-3 bg-[var(--c-panel)] border-2 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)] cursor-pointer hover:bg-[var(--c-bg)] space-y-1"
                      >
                        <div className="flex justify-between items-center">
                          <span
                            style={{ backgroundColor: colorVar }}
                            className="px-2 py-0.5 text-[10px] font-display text-[var(--c-ink)] border border-[var(--c-ink)]"
                          >
                            {style?.name || 'Style'} Class {session.seq}
                          </span>
                          <span className="font-mono text-xs font-bold text-[var(--c-ink)]">
                            {session.start} - {session.end}
                          </span>
                        </div>

                        <div className="font-body text-xs text-[var(--c-darkgrey)]">
                          Instructor: {instructor?.name || 'TBA'} · Venue: {session.venue || 'TBA'}
                        </div>
                      </div>
                    );
                  })}

                {activeSessions.filter((s) => s.date === selectedDate).length === 0 && (
                  <p className="font-body text-xs text-[var(--c-darkgrey)] py-4 text-center">
                    No classes scheduled on this date.
                  </p>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* Full Monthly Sessions Listing */}
      <Panel title={`ALL SESSIONS IN ${currentMonth}`} className="px-corners">
        {activeSessions.length === 0 ? (
          <EmptyState
            title="NO SESSIONS SCHEDULED"
            description={`No classes are scheduled yet for ${currentMonth}. Tap 'GENERATE MONTH' to automatically create sessions from default weekdays.`}
            action={
              <PixelButton size="md" variant="primary" onClick={handleOpenGenerate}>
                AUTO-GENERATE SESSIONS
              </PixelButton>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeSessions.map((session) => {
              const style = getStyle(session.styleId);
              const instructor = getInstructor(session.instructorId);
              const colorVar = style ? STYLE_COLOR[style.colorKey] || `var(--c-${style.colorKey})` : 'var(--c-orange)';

              return (
                <div
                  key={session.id}
                  onClick={() => setEditingSession(session)}
                  className="p-3 bg-[var(--c-panel)] border-2 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)] cursor-pointer hover:bg-[var(--c-bg)] space-y-2"
                >
                  <div className="flex justify-between items-start">
                    <span
                      style={{ backgroundColor: colorVar }}
                      className="px-2 py-0.5 text-xs font-display text-[var(--c-ink)] border border-[var(--c-ink)]"
                    >
                      {style?.name || 'Style'} Class {session.seq}
                    </span>
                    <span className="font-display text-[10px] text-[var(--c-ink)]">
                      {session.date}
                    </span>
                  </div>

                  <div className="font-body text-sm space-y-0.5">
                    <div>
                      <strong>Time:</strong> <span className="font-mono">{session.start} - {session.end}</span>
                    </div>
                    <div>
                      <strong>Instructor:</strong> {instructor?.name || 'TBA'}
                    </div>
                    <div>
                      <strong>Venue:</strong> {session.venue || 'Club Studio'}
                    </div>
                  </div>

                  <div className="pt-1 flex justify-between items-center border-t border-[var(--c-grey)] text-xs">
                    <span
                      className={`px-1.5 py-0.5 font-display text-[9px] border border-[var(--c-ink)] ${
                        session.status === 'cancelled'
                          ? 'bg-[var(--c-red)] text-[var(--c-panel)]'
                          : session.status === 'replacement'
                          ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
                          : 'bg-[var(--c-green)] text-[var(--c-ink)]'
                      }`}
                    >
                      {session.status.toUpperCase()}
                    </span>
                    <span className="font-display text-[10px] text-[var(--c-blue)] underline">
                      EDIT &gt;
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Generate Month Modal */}
      <Sheet
        isOpen={isGenerateOpen}
        onClose={() => setIsGenerateOpen(false)}
        title={`GENERATE SESSIONS FOR ${currentMonth}`}
      >
        <div className="space-y-4">
          <p className="font-body text-sm text-[var(--c-ink)]">
            Select the dance styles to auto-generate weekly class sessions for {currentMonth} based on each style's default weekday.
          </p>

          {generateError && (
            <div
              role="alert"
              className="p-3 bg-[var(--c-peach)] border-2 border-[var(--c-red)] text-[var(--c-red)] text-xs font-body font-bold"
            >
              {generateError}
            </div>
          )}

          {generateWarnings.length > 0 && (
            <div className="p-3 bg-[var(--c-yellow)] border-2 border-[var(--c-ink)] text-[var(--c-ink)] text-xs font-body space-y-1">
              <strong className="font-display block">WARNINGS / NOTICES:</strong>
              {generateWarnings.map((w, idx) => (
                <div key={idx}>• {w}</div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <span className="font-display text-xs text-[var(--c-ink)] block">
              DANCE STYLES TO GENERATE
            </span>
            <div className="space-y-2 max-h-60 overflow-y-auto p-2 bg-[var(--c-bg)] border-2 border-[var(--c-ink)]">
              {styles.map((st) => (
                <label
                  key={st.id}
                  className="flex items-center gap-2 font-body text-base cursor-pointer p-1 hover:bg-[var(--c-panel)]"
                >
                  <input
                    type="checkbox"
                    checked={selectedStyleIds.includes(st.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedStyleIds([...selectedStyleIds, st.id]);
                      } else {
                        setSelectedStyleIds(selectedStyleIds.filter((id) => id !== st.id));
                      }
                    }}
                    className="w-5 h-5 accent-[var(--c-navy)]"
                  />
                  <span className="font-bold">{st.name}</span>
                  <span className="text-xs text-[var(--c-darkgrey)]">
                    (Weekday {st.defaultWeekday !== null ? st.defaultWeekday : 'none'}, {st.defaultStart}-{st.defaultEnd})
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-2 flex gap-2">
            <PixelButton
              variant="primary"
              size="lg"
              onClick={handleConfirmGenerate}
              disabled={generateLoading}
              className="flex-1"
            >
              {generateLoading ? 'GENERATING...' : 'CONFIRM GENERATE'}
            </PixelButton>

            <PixelButton
              variant="secondary"
              size="lg"
              onClick={() => setIsGenerateOpen(false)}
              disabled={generateLoading}
            >
              CANCEL
            </PixelButton>
          </div>
        </div>
      </Sheet>

      {/* Session Editor */}
      <SessionEditor
        isOpen={!!editingSession}
        onClose={() => setEditingSession(null)}
        session={editingSession}
        styles={styles}
        instructors={instructors}
        onSaved={refetch}
      />
    </div>
  );
};
