import React, { useState, useMemo, useRef } from 'react';
import type { Month, ISODate } from '@umdsc/shared';
import { useBootstrap } from '../auth/useBootstrap';
import { MonthCalendar, type CalendarMark } from '../../components/ui/MonthCalendar';
import { DaySheet } from './DaySheet';
import { todayKL } from '../../lib/time';
import { STYLE_COLOR } from '../../theme/colors';
import { session } from '../../lib/session';

export const DancerHome: React.FC = () => {
  const { data: bootstrap, isLoading } = useBootstrap('dancer');

  const dancerName = bootstrap?.profile?.fullName || session.get()?.claims.name || '';

  const rawEvents = bootstrap?.events || [];
  const styles = bootstrap?.styles || [];
  const instructors = bootstrap?.instructors || [];
  const sessions = bootstrap?.sessions || [];
  const videos = bootstrap?.videos || [];
  const music = bootstrap?.music || [];
  const attendance = bootstrap?.attendance || [];

  // Fallback if cached bootstrap has months instead of events
  const events = useMemo(() => {
    if (rawEvents.length > 0) return rawEvents;
    const legacyMonths = (bootstrap as any)?.profile?.months;
    if (Array.isArray(legacyMonths) && legacyMonths.length > 0) {
      return legacyMonths.map((m: string) => ({
        id: `evt-${m}`,
        name: `${m} MONTHLY CLASS`,
        type: 'monthly' as const,
        startDate: `${m}-01`,
        endDate: `${m}-31`,
        status: 'active' as const,
        styleIds: styles.map((s) => s.id)
      }));
    }
    return [];
  }, [rawEvents, (bootstrap as any)?.profile?.months, styles]);

  // Active event selection: defaults to first active event on load, but allows 'all'
  const [selectedEventId, setSelectedEventId] = useState<string>('all');
  const today = todayKL();
  const currentMonth = today.slice(0, 7) as Month;
  const [viewMonth, setViewMonth] = useState<Month>(currentMonth);

  // Selected date for day sheet
  const [selectedDate, setSelectedDate] = useState<ISODate | null>(null);

  // Determine active event
  const currentEvent = useMemo(() => {
    if (selectedEventId === 'all') return null;
    return events.find((e) => e.id === selectedEventId) || null;
  }, [events, selectedEventId]);

  // Set initial event and view month ONCE when events load
  const initializedRef = useRef(false);
  React.useEffect(() => {
    if (events.length > 0 && !initializedRef.current) {
      initializedRef.current = true;
      const firstActive = events.find((e) => e.status === 'active') || events[0];
      if (firstActive) {
        setSelectedEventId(firstActive.id);
        if (firstActive.startDate) {
          setViewMonth(firstActive.startDate.slice(0, 7) as Month);
        }
      }
    }
  }, [events]);

  // Allowed months: restricted when single event is selected; free navigation when 'all'
  const allowedMonths = useMemo(() => {
    if (!currentEvent) return undefined;
    const startM = currentEvent.startDate.slice(0, 7);
    const endM = currentEvent.endDate.slice(0, 7);
    if (startM === endM) return [startM];
    return [startM, endM];
  }, [currentEvent]);

  // Filter sessions by active event
  const filteredSessions = useMemo(() => {
    if (!currentEvent) return sessions;
    return sessions.filter((s) => s.eventId === currentEvent.id);
  }, [sessions, currentEvent]);

  // Build calendar marks
  const calendarMarks = useMemo(() => {
    const marks: Record<ISODate, CalendarMark[]> = {};
    const attMap = new Map<string, boolean>();
    for (const a of attendance) {
      attMap.set(a.sessionId, a.present);
    }

    for (const session of filteredSessions) {
      const style = styles.find((st) => st.id === session.styleId);
      const colorKey = style?.colorKey || 'orange';
      const isAttended = attMap.get(session.id);
      const isPast = session.date < today;

      let kind: 'present' | 'absent' | 'upcoming' = 'upcoming';
      if (isAttended === true) {
        kind = 'present';
      } else if (isPast) {
        kind = 'absent';
      }

      if (!marks[session.date]) {
        marks[session.date] = [];
      }
      marks[session.date].push({
        colorKey,
        kind,
        label: `${style?.name || 'Class'} #${session.seq}`
      });
    }

    return marks;
  }, [filteredSessions, styles, attendance, today]);

  if (isLoading && !bootstrap) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-1 pb-2 border-b-4 border-[var(--c-ink)]">
          <h1 className="font-display text-xl md:text-2xl text-[var(--c-ink)]">
            Calendar
          </h1>
          {dancerName && (
            <p className="font-display text-xs text-[var(--c-orange)] tracking-wide">
              {dancerName}
            </p>
          )}
        </div>
        <div className="p-8 text-center bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)]">
          <p className="font-display text-xs text-[var(--c-darkgrey)] animate-pulse">
            LOADING CALENDAR DATA…
          </p>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-1 pb-2 border-b-4 border-[var(--c-ink)]">
          <h1 className="font-display text-xl md:text-2xl text-[var(--c-ink)]">
            Calendar
          </h1>
          {dancerName && (
            <p className="font-display text-xs text-[var(--c-orange)] tracking-wide">
              {dancerName}
            </p>
          )}
        </div>
        <div className="bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] p-8 text-center space-y-3">
          <p className="font-display text-sm text-[var(--c-red)] font-bold">
            NO REGISTERED EVENTS
          </p>
          <p className="font-body text-sm text-[var(--c-darkgrey)]">
            You are not enrolled in any dance classes or events yet. Please register using the official club form.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Header: Title & Event Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b-4 border-[var(--c-ink)]">
        <div>
          <h1 className="font-display text-xl md:text-2xl text-[var(--c-ink)]">
            Calendar
          </h1>
          {dancerName && (
            <p className="font-display text-[10px] md:text-xs text-[var(--c-orange)] tracking-wide">
              {dancerName}
            </p>
          )}
        </div>

        {/* Event Switcher */}
        <div className="flex items-center gap-2">
          <label htmlFor="dancer-event-select" className="font-display text-[10px] text-[var(--c-ink)] font-bold whitespace-nowrap">
            EVENT:
          </label>
          <select
            id="dancer-event-select"
            value={selectedEventId}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedEventId(val);
              if (val !== 'all') {
                const ev = events.find((x) => x.id === val);
                if (ev?.startDate) {
                  setViewMonth(ev.startDate.slice(0, 7) as Month);
                }
              }
            }}
            className="min-h-[44px] px-3 border-2 border-[var(--c-ink)] bg-[var(--c-panel)] font-display text-xs text-[var(--c-ink)] font-bold shadow-[2px_2px_0_var(--c-ink)] cursor-pointer"
          >
            <option value="all">ALL EVENTS</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Event Details Banner */}
      {currentEvent ? (
        <div data-testid="event-banner" className="bg-[var(--c-panel)] border-2 border-[var(--c-ink)] p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono shadow-[2px_2px_0_var(--c-ink)]">
          <div className="flex items-center gap-2">
            <span className="font-display text-[10px] px-1.5 py-0.5 bg-[var(--c-yellow)] text-[var(--c-ink)] border border-[var(--c-ink)] font-bold">
              {currentEvent.type.toUpperCase()}
            </span>
            <span className="font-bold text-[var(--c-ink)]">
              {currentEvent.name}
            </span>
          </div>
          <span className="text-[var(--c-darkgrey)] text-[11px]">
            {currentEvent.startDate} → {currentEvent.endDate}
          </span>
        </div>
      ) : (
        <div data-testid="all-events-banner" className="bg-[var(--c-panel)] border-2 border-[var(--c-ink)] p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono shadow-[2px_2px_0_var(--c-ink)]">
          <div className="flex items-center gap-2">
            <span className="font-display text-[10px] px-1.5 py-0.5 bg-[var(--c-navy)] text-[var(--c-yellow)] border border-[var(--c-ink)] font-bold">
              ALL EVENTS
            </span>
            <span className="font-bold text-[var(--c-ink)]">
              {filteredSessions.length} classes across all registered events
            </span>
          </div>
          <span className="text-[var(--c-darkgrey)] text-[11px]">
            Change months freely
          </span>
        </div>
      )}

      {/* Retro 8-bit Month Calendar */}
      <MonthCalendar
        month={viewMonth}
        onMonthChange={setViewMonth}
        allowedMonths={allowedMonths}
        marks={calendarMarks}
        selected={selectedDate || undefined}
        onSelect={(date) => {
          setSelectedDate(date);
        }}
      />

      {/* Style & Attendance Legend */}
      <div className="bg-[var(--c-panel)] border-2 border-[var(--c-ink)] p-3 space-y-2">
        <span className="font-display text-[10px] text-[var(--c-darkgrey)] font-bold block">
          LEGEND:
        </span>
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          {styles.map((style) => {
            const colorVar = STYLE_COLOR[style.colorKey] || `var(--c-${style.colorKey})`;
            return (
              <div key={style.id} className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 border border-[var(--c-ink)] inline-block flex-shrink-0"
                  style={{ backgroundColor: colorVar }}
                />
                <span className="font-bold text-[var(--c-ink)]">{style.name}</span>
              </div>
            );
          })}
          <div className="flex items-center gap-1">
            <span className="w-3.5 h-3.5 bg-[var(--c-green)] text-[var(--c-ink)] border border-[var(--c-ink)] inline-flex items-center justify-center font-bold text-[9px]">
              ✓
            </span>
            <span className="text-[var(--c-darkgrey)]">Attended</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3.5 h-3.5 bg-[var(--c-panel)] text-[var(--c-darkgrey)] border border-[var(--c-ink)] inline-flex items-center justify-center font-bold text-[9px]">
              ✕
            </span>
            <span className="text-[var(--c-darkgrey)]">Absent</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3.5 h-3.5 bg-[var(--c-yellow)] border border-[var(--c-ink)] inline-block animate-pulse" />
            <span className="text-[var(--c-darkgrey)]">Upcoming</span>
          </div>
        </div>
      </div>

      {/* Day Sheet (Opened on Date Selection) */}
      <DaySheet
        isOpen={Boolean(selectedDate)}
        onClose={() => setSelectedDate(null)}
        date={selectedDate}
        sessions={filteredSessions}
        styles={styles}
        instructors={instructors}
        videos={videos}
        music={music}
        attendance={attendance}
        events={events}
      />
    </div>
  );
};
