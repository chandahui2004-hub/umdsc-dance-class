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
import { todayKL } from '../../lib/time';
import { STYLE_COLOR } from '../../theme/colors';
import { useCurrentEvent } from '../events/useCurrentEvent';
import type { ClassSession, DanceStyle, Instructor, ISODate, Month } from '@umdsc/shared';

export const ClassesPage: React.FC = () => {
  const { events, current: event, isLoading: eventsLoading, isAll } = useCurrentEvent();
  const eventId = isAll ? 'ALL' : (event?.id || '');

  const [currentMonth, setCurrentMonth] = useState<Month>(todayKL().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<ISODate>(todayKL());
  const [editingSession, setEditingSession] = useState<ClassSession | null>(null);
  const [selectedAddEventId, setSelectedAddEventId] = useState('');
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

  const targetEventId = isAll
    ? (selectedAddEventId || events.filter(e => e.status === 'active')[0]?.id || '')
    : (event?.id || '');
  const targetEvent = events.find(e => e.id === targetEventId);

  const styles = useMemo(
    () => (targetEvent ? targetEvent.styleIds.map(id => allStyles.find(s => s.id === id)).filter((s): s is DanceStyle => Boolean(s)) : allStyles),
    [targetEvent, allStyles]
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
  const getEvent = (id: string) => events.find(e => e.id === id);

  const calendarMarks = useMemo(() => {
    const marks: Record<ISODate, CalendarMark[]> = {};
    for (const s of activeSessions) {
      const style = getStyle(s.styleId);
      const ev = getEvent(s.eventId);
      const evTag = isAll && ev ? ` · ${ev.name}` : '';
      (marks[s.date] ||= []).push({
        colorKey: style?.colorKey || 'orange',
        kind: 'class',
        label: `${style?.name || 'Class'} Class ${s.seq}${evTag}`
      });
    }
    return marks;
  }, [activeSessions, allStyles, isAll, events]); // eslint-disable-line react-hooks/exhaustive-deps

  const insideEvent = Boolean(targetEvent && selectedDate >= targetEvent.startDate && selectedDate <= targetEvent.endDate);
  const addStyleId = newStyleId || styles[0]?.id || '';

  const addClass = useMutation({
    mutationFn: async () => {
      setAddError(null);
      const style = getStyle(addStyleId);
      const nextSeq = activeSessions
        .filter(s => s.eventId === targetEventId && s.styleId === addStyleId)
        .reduce((m, s) => Math.max(m, s.seq), 0) + 1;
      return (
        await call<ClassSession>('sessions.create', {
          eventId: targetEventId,
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

  if (!eventsLoading && events.length === 0) {
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
          {isAll
            ? 'Showing classes across all events · Change months freely'
            : event
            ? `${event.startDate} → ${event.endDate}`
            : 'Loading event…'}
        </p>
      </div>

      <div className="flex items-center justify-between px-3 py-2 bg-[var(--c-navy)] text-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)]">
        <span className="font-display text-xs text-[var(--c-yellow)]">
          {isAll
            ? `${activeSessions.length} classes across ALL EVENTS`
            : `${activeSessions.length} classes in ${event?.name || ''}`}
        </span>
        {event && (
          <button
            type="button"
            onClick={() => {
              setCurrentMonth(event.startDate.slice(0, 7));
              setSelectedDate(event.startDate);
            }}
            className="font-display text-[10px] text-[var(--c-yellow)] hover:underline"
          >
            GO TO EVENT ({event.startDate.slice(0, 7)})
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <MonthCalendar
            month={currentMonth}
            onMonthChange={setCurrentMonth}
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
                      <div className="flex flex-wrap justify-between items-center gap-1">
                        <span style={{ backgroundColor: colorOf(s.styleId) }} className="px-2 py-0.5 text-[10px] font-display text-[var(--c-ink)] border border-[var(--c-ink)]">
                          {getStyle(s.styleId)?.name || 'Style'} Class {s.seq}
                        </span>
                        {isAll && (
                          <span className="font-display text-[9px] px-1 bg-[var(--c-peach)] text-[var(--c-ink)] border border-[var(--c-ink)]">
                            {getEvent(s.eventId)?.name || 'Event'}
                          </span>
                        )}
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

                {/* Add class section */}
                <div className="pt-2 border-t-2 border-[var(--c-ink)] space-y-2">
                  {isAll && (
                    <label className="block space-y-1">
                      <span className="font-display text-[10px] text-[var(--c-ink)]">EVENT:</span>
                      <select
                        aria-label="Event for new class"
                        value={targetEventId}
                        onChange={e => setSelectedAddEventId(e.target.value)}
                        className="w-full min-h-[44px] px-2 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] font-body text-base"
                      >
                        {events.filter(e => e.status === 'active').map(e => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {insideEvent && styles.length > 0 && (
                    <>
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
                    </>
                  )}
                  {!insideEvent && targetEvent && (
                    <p className="font-body text-xs text-[var(--c-darkgrey)]">
                      {selectedDate} is outside {targetEvent.name} ({targetEvent.startDate} to {targetEvent.endDate}).
                    </p>
                  )}
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Panel title={isAll ? 'ALL CLASSES ACROSS ALL EVENTS' : `ALL CLASSES IN ${event?.name || ''}`} className="px-corners">
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
                <div className="flex flex-wrap justify-between items-start gap-1">
                  <span style={{ backgroundColor: colorOf(s.styleId) }} className="px-2 py-0.5 text-xs font-display text-[var(--c-ink)] border border-[var(--c-ink)]">
                    {getStyle(s.styleId)?.name || 'Style'} Class {s.seq}
                  </span>
                  {isAll && (
                    <span className="font-display text-[9px] px-1 bg-[var(--c-peach)] text-[var(--c-ink)] border border-[var(--c-ink)]">
                      {getEvent(s.eventId)?.name || 'Event'}
                    </span>
                  )}
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
        minDate={targetEvent?.startDate}
        maxDate={targetEvent?.endDate}
        onSaved={refetch}
      />
    </div>
  );
};
