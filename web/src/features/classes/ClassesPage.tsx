import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { call, errorMessage } from '../../lib/api';
import { MonthCalendar, CalendarMark } from '../../components/ui/MonthCalendar';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { SessionEditor } from './SessionEditor';
import { getMonthsRange, todayKL } from '../../lib/time';
import { STYLE_COLOR } from '../../theme/colors';
import { useCurrentEvent } from '../events/useCurrentEvent';
import type { ClassSession, DanceStyle, Instructor, ISODate, Month } from '@umdsc/shared';

export const ClassesPage: React.FC = () => {
  const { current: event, isLoading: eventsLoading } = useCurrentEvent();
  const eventId = event?.id || '';

  const months: Month[] = useMemo(
    () => (event ? getMonthsRange(event.startDate.slice(0, 7), event.endDate.slice(0, 7)) : []),
    [event]
  );
  const [currentMonth, setCurrentMonth] = useState<Month>(todayKL().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<ISODate>(todayKL());
  const [editingSession, setEditingSession] = useState<ClassSession | null>(null);
  const [newStyleId, setNewStyleId] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  // Open on the event's first month (or this month, if it is inside the event)
  useEffect(() => {
    if (!event) return;
    const today = todayKL();
    const inside = today >= event.startDate && today <= event.endDate;
    setCurrentMonth(inside ? today.slice(0, 7) : event.startDate.slice(0, 7));
    setSelectedDate(inside ? today : event.startDate);
  }, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: allStyles = [] } = useQuery<DanceStyle[]>({
    queryKey: ['styles'],
    queryFn: async () => (await call<DanceStyle[]>('styles.list')).data
  });
  const { data: instructors = [] } = useQuery<Instructor[]>({
    queryKey: ['instructors'],
    queryFn: async () => (await call<Instructor[]>('instructors.list')).data || []
  });
  const styles = useMemo(
    () => (event ? event.styleIds.map(id => allStyles.find(s => s.id === id)).filter((s): s is DanceStyle => Boolean(s)) : []),
    [event, allStyles]
  );

  const { data: sessions = [], isLoading, error, refetch } = useQuery({
    queryKey: ['sessions', eventId],
    enabled: Boolean(eventId),
    queryFn: async () => (await call<ClassSession[]>('sessions.list', { eventId })).data || []
  });

  const activeSessions = useMemo(
    () => sessions.filter(s => s.active).sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq),
    [sessions]
  );
  const getStyle = (styleId: string) => allStyles.find(s => s.id === styleId);
  const getInstructor = (instructorId: string) => instructors.find(inst => inst.id === instructorId);

  const calendarMarks = useMemo(() => {
    const marks: Record<ISODate, CalendarMark[]> = {};
    for (const s of activeSessions) {
      const style = getStyle(s.styleId);
      (marks[s.date] ||= []).push({
        colorKey: style?.colorKey || 'orange',
        kind: 'class',
        label: `${style?.name || 'Class'} Class ${s.seq}`
      });
    }
    return marks;
  }, [activeSessions, allStyles]); // eslint-disable-line react-hooks/exhaustive-deps

  const insideEvent = Boolean(event && selectedDate >= event.startDate && selectedDate <= event.endDate);
  const addStyleId = newStyleId || styles[0]?.id || '';

  const addClass = useMutation({
    mutationFn: async () => {
      setAddError(null);
      const style = getStyle(addStyleId);
      const nextSeq = activeSessions.filter(s => s.styleId === addStyleId).reduce((m, s) => Math.max(m, s.seq), 0) + 1;
      return (
        await call<ClassSession>('sessions.create', {
          eventId,
          styleId: addStyleId,
          seq: nextSeq,
          date: selectedDate,
          start: style?.defaultStart || '20:00',
          end: style?.defaultEnd || '22:00',
          venue: style?.defaultVenue || ''
        })
      ).data;
    },
    onSuccess: () => refetch(),
    onError: err => setAddError(errorMessage(err))
  });

  const colorOf = (styleId: string) => {
    const style = getStyle(styleId);
    return style ? STYLE_COLOR[style.colorKey] || `var(--c-${style.colorKey})` : 'var(--c-orange)';
  };

  if (!eventsLoading && !event) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-xl md:text-2xl text-[var(--c-ink)]">Calendar & Classes</h1>
        <EmptyState
          title="NO EVENTS YET"
          description="Classes belong to an event. Create one from its registration form first."
          action={
            <Link to="/admin/events/new" className="inline-flex items-center min-h-[44px] px-4 border-2 border-[var(--c-ink)] bg-[var(--c-orange)] text-[var(--c-ink)] font-display text-xs no-underline">
              CREATE AN EVENT
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl md:text-2xl text-[var(--c-ink)]">Calendar & Classes</h1>
        <p className="font-body text-sm text-[var(--c-darkgrey)]">
          {event ? `${event.startDate} → ${event.endDate}` : 'Loading event…'}
        </p>
      </div>

      <div className="flex items-center justify-between px-3 py-2 bg-[var(--c-navy)] text-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)]">
        <span className="font-display text-xs text-[var(--c-yellow)]">
          {activeSessions.length} classes in {event?.name || ''}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <MonthCalendar
            month={currentMonth}
            onMonthChange={setCurrentMonth}
            allowedMonths={months}
            marks={calendarMarks}
            selected={selectedDate}
            onSelect={setSelectedDate}
          />
        </div>

        <div className="space-y-3">
          <Panel title={`CLASSES ON ${selectedDate}`} className="px-corners">
            {isLoading ? (
              <div className="p-4 text-center">
                <Spinner size="md" />
              </div>
            ) : error ? (
              <div className="p-3 bg-[var(--c-peach)] text-[var(--c-red)] text-xs font-body font-bold">{errorMessage(error)}</div>
            ) : (
              <div className="space-y-2">
                {activeSessions
                  .filter(s => s.date === selectedDate)
                  .map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setEditingSession(s)}
                      className="w-full text-left p-3 bg-[var(--c-panel)] border-2 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)] hover:bg-[var(--c-bg)] space-y-1"
                    >
                      <div className="flex justify-between items-center">
                        <span style={{ backgroundColor: colorOf(s.styleId) }} className="px-2 py-0.5 text-[10px] font-display text-[var(--c-ink)] border border-[var(--c-ink)]">
                          {getStyle(s.styleId)?.name || 'Style'} Class {s.seq}
                        </span>
                        <span className="font-mono text-xs font-bold text-[var(--c-ink)]">
                          {s.start} - {s.end}
                        </span>
                      </div>
                      <div className="font-body text-xs text-[var(--c-darkgrey)]">
                        Instructor: {getInstructor(s.instructorId)?.name || 'TBA'} · Venue: {s.venue || 'TBA'}
                      </div>
                    </button>
                  ))}
                {activeSessions.filter(s => s.date === selectedDate).length === 0 && (
                  <p className="font-body text-xs text-[var(--c-darkgrey)] py-2 text-center">No classes on this date.</p>
                )}

                {insideEvent && styles.length > 0 && (
                  <div className="pt-2 border-t-2 border-[var(--c-ink)] space-y-2">
                    <select
                      aria-label="Style for new class"
                      value={addStyleId}
                      onChange={e => setNewStyleId(e.target.value)}
                      className="w-full min-h-[44px] px-2 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] font-body text-base"
                    >
                      {styles.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <PixelButton size="md" className="w-full" disabled={addClass.isPending} onClick={() => addClass.mutate()}>
                      {addClass.isPending ? 'ADDING…' : `+ ADD CLASS ON ${selectedDate}`}
                    </PixelButton>
                    {addError && <p role="alert" className="font-body text-xs font-bold text-[var(--c-red)]">{addError}</p>}
                  </div>
                )}
                {!insideEvent && event && (
                  <p className="font-body text-xs text-[var(--c-darkgrey)]">This day is outside {event.name}.</p>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Panel title={`ALL CLASSES IN ${event?.name || ''}`} className="px-corners">
        {activeSessions.length === 0 ? (
          <EmptyState title="NO CLASSES YET" description="Pick a day in the calendar and add a class, or use Events › Edit." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeSessions.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setEditingSession(s)}
                className="text-left p-3 bg-[var(--c-panel)] border-2 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)] hover:bg-[var(--c-bg)] space-y-2"
              >
                <div className="flex justify-between items-start">
                  <span style={{ backgroundColor: colorOf(s.styleId) }} className="px-2 py-0.5 text-xs font-display text-[var(--c-ink)] border border-[var(--c-ink)]">
                    {getStyle(s.styleId)?.name || 'Style'} Class {s.seq}
                  </span>
                  <span className="font-display text-[10px] text-[var(--c-ink)]">{s.date}</span>
                </div>
                <div className="font-body text-sm">
                  <strong>Time:</strong> <span className="font-mono">{s.start} - {s.end}</span>
                </div>
                <span
                  className={`inline-block px-1.5 py-0.5 font-display text-[9px] border border-[var(--c-ink)] ${
                    s.status === 'cancelled'
                      ? 'bg-[var(--c-red)] text-[var(--c-panel)]'
                      : s.status === 'replacement'
                      ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
                      : 'bg-[var(--c-green)] text-[var(--c-ink)]'
                  }`}
                >
                  {s.status.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        )}
      </Panel>

      <SessionEditor
        isOpen={!!editingSession}
        onClose={() => setEditingSession(null)}
        session={editingSession}
        styles={allStyles}
        instructors={instructors}
        minDate={event?.startDate}
        maxDate={event?.endDate}
        onSaved={refetch}
      />
    </div>
  );
};
