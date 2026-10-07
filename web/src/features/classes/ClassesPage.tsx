import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { call, errorMessage } from '../../lib/api';
import { MonthCalendar, CalendarMark } from '../../components/ui/MonthCalendar';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { EventStep } from '../../components/ui/EventStyleSteps';
import { SessionEditor } from './SessionEditor';
import { AddClassDialog } from './AddClassDialog';
import { ClassCard } from '../calendar/ClassCard';
import { todayKL, formatDayLabel } from '../../lib/time';
import { getStyleColor } from '../../theme/colors';
import { useCurrentEvent } from '../events/useCurrentEvent';
import { resolveInstructor, getInstructorPhotoUrl, getDriveThumbnailUrl } from '../../lib/instructorPhotos';
import type { ClassSession, DanceStyle, Instructor, ISODate, Month, VideoItem, MusicItem } from '@umdsc/shared';

export const ClassesPage: React.FC = () => {
  const { events, current: event, isLoading: eventsLoading, isAll } = useCurrentEvent();
  const eventId = isAll ? 'ALL' : (event?.id || '');

  const [currentMonth, setCurrentMonth] = useState<Month>(todayKL().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<ISODate>(todayKL());
  const [editingSession, setEditingSession] = useState<ClassSession | null>(null);
  const [showAddClass, setShowAddClass] = useState(false);

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
    ? (events.filter(e => e.status === 'active')[0]?.id || '')
    : (event?.id || '');
  const targetEvent = events.find(e => e.id === targetEventId);
  // New classes go into an active event: just the chosen one, or any active one when ALL is chosen
  const activeEvents = useMemo(
    () => (isAll ? events.filter(e => e.status === 'active') : targetEvent ? [targetEvent] : []),
    [isAll, events, targetEvent]
  );


  const { data: sessions = [], isLoading, error, refetch } = useQuery({
    queryKey: ['sessions', eventId],
    enabled: Boolean(eventId),
    queryFn: async () => (await call<ClassSession[]>('sessions.list', { eventId })).data || []
  });

  // Recap videos and music, shown on the selected day's class cards (as dancers see them)
  const mediaPayload = isAll ? {} : { eventId };
  const { data: dayVideos = [] } = useQuery<VideoItem[]>({
    queryKey: ['videos', eventId, 'calendar'],
    enabled: Boolean(eventId),
    queryFn: async () => (await call<VideoItem[]>('videos.list', mediaPayload)).data || []
  });
  const { data: dayMusic = [] } = useQuery<MusicItem[]>({
    queryKey: ['music', eventId, 'calendar'],
    enabled: Boolean(eventId),
    queryFn: async () => (await call<MusicItem[]>('music.list', mediaPayload)).data || []
  });

  const [filterEventId, setFilterEventId] = useState<string>('all');
  const [filterStyleId, setFilterStyleId] = useState<string>('all');
  const [filterInstructor, setFilterInstructor] = useState<string>('all');

  const activeSessions = useMemo(
    () => sessions.filter(s => s.active).sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq),
    [sessions]
  );
  const getStyle = (styleId: string) => allStyles.find(s => s.id === styleId);
  const getEvent = (id: string) => events.find(e => e.id === id);

  const availableStyles = useMemo(() => {
    const styleIdSet = new Set(activeSessions.map(s => s.styleId));
    const list = allStyles.filter(st => styleIdSet.has(st.id) || st.active !== false);
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [allStyles, activeSessions]);

  const availableInstructors = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const inst of instructors) {
      if (inst.name?.trim()) {
        map.set(inst.name.trim().toLowerCase(), { id: inst.id || inst.name.trim(), name: inst.name.trim() });
      }
    }
    for (const s of activeSessions) {
      const style = getStyle(s.styleId);
      const inst = resolveInstructor(s, style, instructors);
      if (inst?.name?.trim()) {
        const key = inst.name.trim().toLowerCase();
        if (!map.has(key)) {
          map.set(key, { id: inst.id || inst.name.trim(), name: inst.name.trim() });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [instructors, activeSessions, allStyles]);

  const matchesFilter = (s: ClassSession) => {
    if (isAll && filterEventId !== 'all' && s.eventId !== filterEventId) {
      return false;
    }
    if (filterStyleId !== 'all' && s.styleId !== filterStyleId) {
      return false;
    }
    if (filterInstructor !== 'all') {
      const style = getStyle(s.styleId);
      const inst = resolveInstructor(s, style, instructors);
      if (!inst) return false;
      const target = filterInstructor.trim().toLowerCase();
      const nameMatch = inst.name?.trim().toLowerCase() === target;
      const idMatch = inst.id === filterInstructor;
      if (!nameMatch && !idMatch) return false;
    }
    return true;
  };

  const isFiltered = (isAll && filterEventId !== 'all') || filterStyleId !== 'all' || filterInstructor !== 'all';

  const filteredSessions = useMemo(
    () => activeSessions.filter(matchesFilter),
    [activeSessions, isAll, filterEventId, filterStyleId, filterInstructor, instructors, allStyles]
  );

  const calendarMarks = useMemo(() => {
    const marks: Record<ISODate, CalendarMark[]> = {};
    for (const s of filteredSessions) {
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
  }, [filteredSessions, allStyles, isAll, events]);

  const colorOf = (styleId: string) => {
    const style = getStyle(styleId);
    return getStyleColor(style?.colorKey);
  };

  if (!eventsLoading && events.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-[24px] text-[var(--text-1)]">Calendar & Classes</h1>
        <EmptyState
          scene="shutter"
          title="NO EVENTS YET"
          description="Classes belong to an event. Create one from its registration form first."
          action={
            <Link to="/admin/events/new" className="inline-flex items-center min-h-[44px] px-4 border-2 border-[var(--outline)] bg-[var(--neon-gold)] text-[var(--on-neon)] font-display text-[12px] no-underline shadow-[2px_2px_0_var(--outline)]">
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
        <h1 className="font-display text-[24px] text-[var(--text-1)]">Calendar & Classes</h1>
        <p className="font-body text-[14px] text-[var(--text-2)]">
          {isAll
            ? 'Showing classes across all events · Change months freely'
            : event
            ? `${event.startDate} → ${event.endDate}`
            : 'Loading event…'}
        </p>
      </div>

      <EventStep allowAll />

      <div className="flex items-center justify-between px-3 py-2 bg-[var(--night-2)] text-[var(--text-1)] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)]">
        <span className="font-display text-[12px] text-[var(--neon-gold)] font-bold">
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
            className="font-display text-[12px] text-[var(--neon-gold)] hover:underline cursor-pointer"
          >
            GO TO EVENT ({event.startDate.slice(0, 7)})
          </button>
        )}
      </div>

      <MonthCalendar
        month={currentMonth}
        onMonthChange={setCurrentMonth}
        marks={calendarMarks}
        selected={selectedDate}
        onSelect={setSelectedDate}
        action={
          activeEvents.length > 0 ? (
            <PixelButton size="sm" variant="primary" onClick={() => setShowAddClass(true)}>
              + ADD CLASS
            </PixelButton>
          ) : undefined
        }
      />

      <Panel title={`CLASSES ON ${formatDayLabel(selectedDate).toUpperCase()}`}>
        {isLoading ? (
          <div className="p-4 text-center">
            <Spinner size="md" />
          </div>
        ) : error ? (
          <div role="alert" className="p-3 bg-[var(--night-1)] border-2 border-[var(--neon-red)] text-[var(--neon-red)] text-[12px] font-body font-bold">{errorMessage(error)}</div>
        ) : (
          (() => {
            const dateSessions = activeSessions.filter(s => s.date === selectedDate);
            const visibleDateSessions = isFiltered ? dateSessions.filter(matchesFilter) : dateSessions;
            return (
              <>
                {visibleDateSessions.length > 0 && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {visibleDateSessions.map(s => {
                      const style = getStyle(s.styleId);
                      return (
                        <ClassCard
                          key={s.id}
                          session={s}
                          style={style}
                          instructor={resolveInstructor(s, style, instructors)}
                          videos={dayVideos.filter(v => v.sessionId === s.id)}
                          music={dayMusic.filter(m => m.sessionId === s.id)}
                          eventName={isAll ? getEvent(s.eventId)?.name : undefined}
                          showAttendance={false}
                          action={
                            <PixelButton size="sm" variant="secondary" onClick={() => setEditingSession(s)}>
                              ✎ EDIT CLASS
                            </PixelButton>
                          }
                        />
                      );
                    })}
                  </div>
                )}
                {isFiltered && visibleDateSessions.length === 0 && dateSessions.length > 0 && (
                  <div className="p-3 bg-[var(--night-1)] border border-[var(--outline)] text-center space-y-1">
                    <p className="font-body text-[13px] text-[var(--text-2)]">
                      No classes match filter on this date ({dateSessions.length} other class{dateSessions.length > 1 ? 'es' : ''} scheduled).
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setFilterStyleId('all');
                        setFilterInstructor('all');
                        setFilterEventId('all');
                      }}
                      className="font-display text-[10px] text-[var(--neon-gold)] underline cursor-pointer"
                    >
                      RESET FILTERS
                    </button>
                  </div>
                )}
                {dateSessions.length === 0 && (
                  <p className="font-body text-[14px] text-[var(--text-2)] py-2 text-center">No classes on this date.</p>
                )}
              </>
            );
          })()
        )}
      </Panel>

      <Panel title={isAll ? 'ALL CLASSES ACROSS ALL EVENTS' : `ALL CLASSES IN ${event?.name || ''}`}>
        {/* Filter Controls Bar */}
        <div className="mb-4 p-3 bg-[var(--night-1)] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)]">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Event Filter (when isAll is true) */}
              {isAll && events.length > 1 && (
                <label className="flex items-center gap-2">
                  <span className="font-display text-[10px] text-[var(--neon-cyan)] tracking-wider">
                    EVENT:
                  </span>
                  <select
                    aria-label="Filter classes by event"
                    value={filterEventId}
                    onChange={e => setFilterEventId(e.target.value)}
                    className="min-h-[36px] bg-[var(--night-2)] text-[var(--text-1)] border-2 border-[var(--outline)] px-2 py-1 text-[13px] font-mono focus:border-[var(--neon-cyan)] outline-none"
                  >
                    <option value="all">ALL EVENTS ({events.length})</option>
                    {events.map(ev => (
                      <option key={ev.id} value={ev.id}>
                        {ev.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {/* Style Filter */}
              <label className="flex items-center gap-2">
                <span className="font-display text-[10px] text-[var(--neon-pink)] tracking-wider">
                  STYLE:
                </span>
                <select
                  aria-label="Filter classes by dance style"
                  value={filterStyleId}
                  onChange={e => setFilterStyleId(e.target.value)}
                  className="min-h-[36px] bg-[var(--night-2)] text-[var(--text-1)] border-2 border-[var(--outline)] px-2 py-1 text-[13px] font-mono focus:border-[var(--neon-pink)] outline-none"
                >
                  <option value="all">ALL STYLES ({availableStyles.length})</option>
                  {availableStyles.map(st => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* Instructor Filter */}
              <label className="flex items-center gap-2">
                <span className="font-display text-[10px] text-[var(--neon-green)] tracking-wider">
                  INSTRUCTOR:
                </span>
                <select
                  aria-label="Filter classes by instructor"
                  value={filterInstructor}
                  onChange={e => setFilterInstructor(e.target.value)}
                  className="min-h-[36px] bg-[var(--night-2)] text-[var(--text-1)] border-2 border-[var(--outline)] px-2 py-1 text-[13px] font-mono focus:border-[var(--neon-green)] outline-none"
                >
                  <option value="all">ALL INSTRUCTORS ({availableInstructors.length})</option>
                  {availableInstructors.map(inst => (
                    <option key={inst.id} value={inst.name}>
                      {inst.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* Reset button if any filter is active */}
              {isFiltered && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterStyleId('all');
                    setFilterInstructor('all');
                    setFilterEventId('all');
                  }}
                  className="px-2.5 py-1.5 bg-[var(--night-2)] text-[var(--neon-gold)] hover:bg-[var(--violet-2)] border-2 border-[var(--outline)] shadow-[1px_1px_0_var(--outline)] font-display text-[10px] cursor-pointer active:translate-x-[1px] active:translate-y-[1px]"
                >
                  ✕ RESET
                </button>
              )}
            </div>

            {/* Filtered Count indicator */}
            <div data-testid="classes-count-badge" className="font-display text-[10px] text-[var(--text-2)] whitespace-nowrap">
              SHOWING <span className="text-[var(--neon-gold)] font-bold">{filteredSessions.length}</span> OF {activeSessions.length} CLASSES
            </div>
          </div>
        </div>

        {activeSessions.length === 0 ? (
          <EmptyState scene="shutter" title="NO CLASSES YET" description="Pick a day in the calendar and add a class, or use Events › Edit." />
        ) : filteredSessions.length === 0 ? (
          <div className="p-8 text-center bg-[var(--night-1)] border-2 border-[var(--outline)] space-y-3">
            <div className="font-display text-[14px] text-[var(--neon-pink)]">
              NO CLASSES MATCH FILTERS
            </div>
            <p className="font-body text-[14px] text-[var(--text-2)]">
              No classes match the selected {filterStyleId !== 'all' ? 'dance style' : ''}
              {filterStyleId !== 'all' && filterInstructor !== 'all' ? ' and ' : ''}
              {filterInstructor !== 'all' ? 'instructor' : ''}.
            </p>
            <PixelButton
              variant="secondary"
              size="sm"
              onClick={() => {
                setFilterStyleId('all');
                setFilterInstructor('all');
                setFilterEventId('all');
              }}
            >
              RESET FILTERS
            </PixelButton>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredSessions.map(s => {
              const style = getStyle(s.styleId);
              const instructor = resolveInstructor(s, style, instructors);
              const photoUrl = getInstructorPhotoUrl(instructor);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setEditingSession(s)}
                  className="text-left p-3 bg-[var(--night-2)] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)] hover:bg-[var(--violet-2)] space-y-2 transition-none cursor-pointer"
                >
                  <div className="flex flex-wrap justify-between items-start gap-1">
                    <span style={{ backgroundColor: colorOf(s.styleId) }} className="px-2 py-0.5 text-[12px] font-display text-[var(--on-neon)] font-bold border border-[var(--outline)]">
                      {style?.name || 'Style'} Class {s.seq}
                    </span>
                    {isAll && (
                      <span className="font-display text-[12px] px-1 bg-[var(--night-1)] text-[var(--neon-cyan)] border border-[var(--outline)]">
                        {getEvent(s.eventId)?.name || 'Event'}
                      </span>
                    )}
                    <span className="font-display text-[12px] text-[var(--text-1)]">{s.date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt={instructor?.name || 'Instructor'}
                        referrerPolicy="no-referrer"
                        className="w-10 h-[50px] object-cover object-top border-2 border-[var(--outline)] flex-shrink-0"
                        loading="lazy"
                        onError={(e) => {
                          const thumb = getDriveThumbnailUrl(photoUrl, 200);
                          if (thumb && thumb !== photoUrl && e.currentTarget.src !== thumb) {
                            e.currentTarget.src = thumb;
                          }
                        }}
                      />
                    ) : (
                      <span className="w-10 h-[50px] flex items-center justify-center bg-[var(--night-1)] border-2 border-[var(--outline)] font-display text-[10px] text-[var(--text-2)] flex-shrink-0">👤</span>
                    )}
                    <div className="space-y-1">
                      <div className="font-body text-[14px]">
                        <span className="font-bold text-[var(--text-1)]">{instructor?.name || 'TBA'}</span>
                      </div>
                      <div className="font-body text-[12px] text-[var(--text-2)]">
                        <span className="font-mono">{s.start} - {s.end}</span> · {s.venue || 'TBA'}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`inline-block px-1.5 py-0.5 font-display text-[12px] border border-[var(--outline)] font-bold ${
                      s.status === 'cancelled'
                        ? 'bg-[var(--neon-red)] text-[var(--on-neon)]'
                        : s.status === 'replacement'
                        ? 'bg-[var(--neon-gold)] text-[var(--on-neon)]'
                        : 'bg-[var(--neon-green)] text-[var(--on-neon)]'
                    }`}
                  >
                    {s.status.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      <AddClassDialog
        isOpen={showAddClass}
        onClose={() => setShowAddClass(false)}
        date={selectedDate}
        events={activeEvents}
        initialEventId={targetEventId}
        styles={allStyles}
        instructors={instructors}
        sessions={activeSessions}
        onAdded={refetch}
      />

      <SessionEditor
        isOpen={!!editingSession}
        onClose={() => setEditingSession(null)}
        session={editingSession}
        styles={allStyles}
        instructors={instructors}
        allowedInstructorIds={
          editingSession
            ? (events.find(e => e.id === editingSession.eventId)?.styleInstructors || {})[editingSession.styleId] ?? []
            : []
        }
        minDate={targetEvent?.startDate}
        maxDate={targetEvent?.endDate}
        onSaved={refetch}
      />
    </div>
  );
};

export default ClassesPage;
