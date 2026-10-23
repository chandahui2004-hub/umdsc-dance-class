import React, { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Member } from '@umdsc/shared';
import { call } from '../../lib/api';
import { session } from '../../lib/session';
import { useEvents } from '../../features/events/useCurrentEvent';
import { useBootstrap } from '../../features/auth/useBootstrap';
import { PixelButton } from './PixelButton';

type AdminTabKey = 'new_dancers' | 'slot_progress' | 'system_audit';
type DancerTabKey = 'my_classes' | 'upcoming' | 'practice';

interface AuditItem {
  id: string;
  ts: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
}

export const NotificationWidget: React.FC = () => {
  const currentSession = session.get();
  const role = currentSession?.claims?.role || 'dancer';
  const isDancer = role === 'dancer';
  const isAdmin = role === 'admin';

  const [isOpen, setIsOpen] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminTabKey>('new_dancers');
  const [dancerTab, setDancerTab] = useState<DancerTabKey>('my_classes');
  const [dancerSearch, setDancerSearch] = useState('');
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(new Set());

  // Movable Floating Button State
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const bellContainerRef = useRef<HTMLDivElement | null>(null);

  const startDrag = (clientX: number, clientY: number, button = 0) => {
    if (button !== 0) return;
    const rect = bellContainerRef.current?.getBoundingClientRect();
    const initialX = rect && (rect.left || rect.x) ? (rect.left || rect.x) : (position?.x ?? 200);
    const initialY = rect && (rect.top || rect.y) ? (rect.top || rect.y) : (position?.y ?? 50);

    dragStartRef.current = {
      startX: clientX,
      startY: clientY,
      initialX,
      initialY
    };
    isDraggingRef.current = false;

    const onMove = (moveX: number, moveY: number) => {
      if (!dragStartRef.current) return;
      const deltaX = moveX - dragStartRef.current.startX;
      const deltaY = moveY - dragStartRef.current.startY;

      if (Math.hypot(deltaX, deltaY) > 4) {
        isDraggingRef.current = true;
      }

      if (isDraggingRef.current) {
        const buttonWidth = 48;
        const buttonHeight = 48;
        const margin = 8;
        const maxX = (window.innerWidth || 500) - buttonWidth - margin;
        const maxY = (window.innerHeight || 800) - buttonHeight - margin;

        const nextX = Math.max(margin, Math.min(maxX, dragStartRef.current.initialX + deltaX));
        const nextY = Math.max(margin, Math.min(maxY, dragStartRef.current.initialY + deltaY));

        setPosition({ x: nextX, y: nextY });
      }
    };

    const onEnd = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseEnd);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      dragStartRef.current = null;
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 50);
    };

    const onPointerMove = (e: PointerEvent) => onMove(e.clientX, e.clientY);
    const onPointerEnd = () => onEnd();

    const onMouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const onMouseEnd = () => onEnd();

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchEnd = () => onEnd();

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseEnd);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
  };

  // --- Admin Queries ---
  const { data: events = [] } = useEvents();
  const activeEvents = useMemo(() => events.filter(e => e.status === 'active'), [events]);

  const { data: allMembers = [] } = useQuery<Member[]>({
    queryKey: ['notification_members', activeEvents.map(e => e.id).join(',')],
    enabled: isOpen && isAdmin && activeEvents.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        activeEvents.map(async ev => {
          try {
            const res = await call<Member[]>('members.list', { eventId: ev.id });
            return (res.data || []).map(m => ({
              ...m,
              _eventName: ev.name,
              _eventId: ev.id
            })) as Member[];
          } catch {
            return [];
          }
        })
      );
      return results.flat();
    }
  });

  const { data: auditLogs = [] } = useQuery<AuditItem[]>({
    queryKey: ['notification_audit'],
    enabled: isOpen && isAdmin,
    queryFn: async () => {
      try {
        const res = await call<AuditItem[]>('audit.list', { limit: 30 });
        return res.data || [];
      } catch {
        return [];
      }
    }
  });

  // Admin New dancers within the last 14 days
  const recentDancers = useMemo(() => {
    if (!isAdmin) return [];
    const fourteenDaysAgo = Date.now() - 14 * 24 * 3600 * 1000;
    return allMembers.filter(m => {
      if (!m.sourceTimestamp) return false;
      const ts = new Date(m.sourceTimestamp).getTime();
      return !isNaN(ts) && ts >= fourteenDaysAgo;
    });
  }, [allMembers, isAdmin]);

  const filteredDancers = useMemo(() => {
    if (!dancerSearch.trim()) return recentDancers;
    const q = dancerSearch.toLowerCase();
    return recentDancers.filter(
      d =>
        d.fullName.toLowerCase().includes(q) ||
        d.matricKey.toLowerCase().includes(q) ||
        (d.styleNames || []).some(s => s.toLowerCase().includes(q))
    );
  }, [recentDancers, dancerSearch]);

  // Admin Slot Progress
  const slotProgressList = useMemo(() => {
    if (!isAdmin) return [];
    const list: Array<{
      eventId: string;
      eventName: string;
      styleId: string;
      styleName: string;
      filled: number;
      capacity: number;
      percentage: number;
      isFull: boolean;
      isSingleStyle: boolean;
    }> = [];

    for (const ev of activeEvents) {
      let slotsMap: Record<string, number> = {};
      if (ev.styleSlots && typeof ev.styleSlots === 'object') {
        slotsMap = ev.styleSlots;
      } else if (ev.styleSlotsJson) {
        try {
          slotsMap = JSON.parse(ev.styleSlotsJson);
        } catch {
          slotsMap = {};
        }
      }

      const isSingleStyle = ev.styleIds.length === 1;

      for (const styleId of ev.styleIds) {
        const capacity = slotsMap[styleId] || 0;
        let filled = 0;

        if (isSingleStyle) {
          filled = ev.memberCount || 0;
        } else {
          filled = allMembers.filter(
            m => (m as any)._eventId === ev.id && m.styleIds.includes(styleId)
          ).length;
        }

        const percentage = capacity > 0 ? Math.min(100, Math.round((filled / capacity) * 100)) : 0;
        const isFull = capacity > 0 && filled >= capacity;

        list.push({
          eventId: ev.id,
          eventName: ev.name,
          styleId,
          styleName: styleId.replace(/^sty_|^st_/, '').toUpperCase(),
          filled,
          capacity,
          percentage,
          isFull,
          isSingleStyle
        });
      }
    }
    return list;
  }, [activeEvents, allMembers, isAdmin]);

  // Admin System Alerts
  const systemAlerts = useMemo(() => {
    if (!isAdmin) return [];
    const alerts: Array<{ id: string; type: 'warn' | 'error' | 'conflict'; title: string; detail: string }> = [];

    for (const ev of activeEvents) {
      if (!ev.sourceSheetId) {
        alerts.push({
          id: `no-sheet-${ev.id}`,
          type: 'warn',
          title: `No Form Connected: ${ev.name}`,
          detail: 'This event has no linked Google Form response sheet for automated sync.'
        });
      }
      if (ev.lastSyncError) {
        alerts.push({
          id: `sync-err-${ev.id}`,
          type: 'error',
          title: `Sync Failed: ${ev.name}`,
          detail: ev.lastSyncError
        });
      }
    }
    return alerts.filter(a => !dismissedAlertIds.has(a.id));
  }, [activeEvents, dismissedAlertIds, isAdmin]);

  // --- Dancer Data via useBootstrap('dancer') ---
  const { data: dancerBootstrap } = useBootstrap('dancer');

  const dancerEnrolledEvents = useMemo(() => {
    if (!isDancer || !dancerBootstrap) return [];
    return dancerBootstrap.events || [];
  }, [isDancer, dancerBootstrap]);

  const dancerStylesMap = useMemo(() => {
    if (!dancerBootstrap?.styles) return new Map();
    return new Map(dancerBootstrap.styles.map(s => [s.id, s]));
  }, [dancerBootstrap]);

  const dancerInstructorsMap = useMemo(() => {
    if (!dancerBootstrap?.instructors) return new Map();
    return new Map(dancerBootstrap.instructors.map(i => [i.id, i.name]));
  }, [dancerBootstrap]);

  const dancerUpcomingSessions = useMemo(() => {
    if (!isDancer || !dancerBootstrap?.sessions) return [];
    return [...dancerBootstrap.sessions]
      .filter(s => s.active)
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  }, [isDancer, dancerBootstrap]);

  const dancerVideos = useMemo(() => {
    if (!isDancer || !dancerBootstrap?.videos) return [];
    return dancerBootstrap.videos.filter(v => v.active);
  }, [isDancer, dancerBootstrap]);

  const dancerMusic = useMemo(() => {
    if (!isDancer || !dancerBootstrap?.music) return [];
    return dancerBootstrap.music.filter(m => m.active);
  }, [isDancer, dancerBootstrap]);

  // Overall unread/alert count
  const alertCount = useMemo(() => {
    if (isAdmin) {
      return systemAlerts.length + recentDancers.length;
    }
    // For dancer: upcoming sessions + available videos + music
    return dancerUpcomingSessions.length + dancerVideos.length;
  }, [isAdmin, systemAlerts, recentDancers, dancerUpcomingSessions, dancerVideos]);

  const hasErrors = isAdmin && systemAlerts.some(a => a.type === 'error' || a.type === 'conflict');

  return (
    <>
      {/* Floating Retro Bell Button (Movable) */}
      <div
        data-testid="notification-bell-container"
        ref={bellContainerRef}
        style={position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined}
        className={`fixed z-40 touch-none select-none ${
          !position ? 'top-14 right-3 sm:top-5 sm:right-6' : ''
        }`}
      >
        <button
          type="button"
          data-testid="notification-bell-btn"
          aria-label="Open notifications"
          onPointerDown={(e) => startDrag(e.clientX, e.clientY, e.button)}
          onMouseDown={(e) => startDrag(e.clientX, e.clientY, e.button)}
          onTouchStart={(e) => e.touches[0] && startDrag(e.touches[0].clientX, e.touches[0].clientY, 0)}
          onClick={() => {
            if (!isDraggingRef.current) setIsOpen(v => !v);
          }}
          className={`relative w-12 h-12 flex items-center justify-center border-4 border-[var(--outline)] shadow-[4px_4px_0_var(--outline)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_var(--outline)] transition-transform cursor-grab active:cursor-grabbing ${
            hasErrors
              ? 'bg-[var(--neon-red)] text-white animate-pulse'
              : 'bg-[var(--neon-gold)] text-[var(--on-neon)] hover:scale-105'
          }`}
        >
          <span className="text-xl select-none">🔔</span>
          {alertCount > 0 && (
            <span
              className={`absolute -top-2 -right-2 px-1.5 py-0.2 border-2 border-[var(--outline)] font-display text-[11px] font-bold shadow-[1px_1px_0_var(--outline)] ${
                hasErrors
                  ? 'bg-[var(--neon-red)] text-white'
                  : 'bg-[var(--neon-cyan)] text-[var(--on-neon)]'
              }`}
            >
              {alertCount > 99 ? '99+' : alertCount}
            </span>
          )}
        </button>
      </div>

      {/* Retro Cyberpunk Slide-out Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          {/* Drawer Body */}
          <div
            data-testid="notification-drawer"
            className="relative w-full max-w-md sm:max-w-lg h-full bg-[var(--night-1)] border-l-4 border-[var(--outline)] shadow-[-6px_0_0_var(--outline)] flex flex-col z-10"
          >
            {/* Drawer Header */}
            <div className="p-4 bg-[var(--night-2)] border-b-4 border-[var(--outline)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔔</span>
                <div>
                  <h2 className="font-display text-sm tracking-wider text-[var(--neon-gold)]">
                    {isAdmin ? 'ADMIN NOTIFICATION CENTER' : 'DANCER NOTIFICATION CENTER'}
                  </h2>
                  <p className="font-mono text-[10px] text-[var(--text-3)]">
                    {isAdmin ? 'REAL-TIME CLUB ACTIVITY' : `WELCOME, ${currentSession?.claims?.name?.toUpperCase() || 'DANCER'}`}
                  </p>
                </div>
              </div>
              <PixelButton
                variant="secondary"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="text-[11px]"
              >
                ✕ CLOSE
              </PixelButton>
            </div>

            {/* 3-Tab Selector */}
            <div className="flex border-b-2 border-[var(--outline)] bg-[var(--night-2)]">
              {isAdmin ? (
                <>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={adminTab === 'new_dancers'}
                    onClick={() => setAdminTab('new_dancers')}
                    className={`flex-1 py-2.5 px-2 font-display text-[10px] sm:text-xs text-center border-r-2 border-[var(--outline)] transition-colors ${
                      adminTab === 'new_dancers'
                        ? 'bg-[var(--neon-cyan)] text-[var(--on-neon)] font-bold'
                        : 'text-[var(--text-2)] hover:bg-[var(--night-1)] hover:text-white'
                    }`}
                  >
                    NEW DANCERS ({recentDancers.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={adminTab === 'slot_progress'}
                    onClick={() => setAdminTab('slot_progress')}
                    className={`flex-1 py-2.5 px-2 font-display text-[10px] sm:text-xs text-center border-r-2 border-[var(--outline)] transition-colors ${
                      adminTab === 'slot_progress'
                        ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold'
                        : 'text-[var(--text-2)] hover:bg-[var(--night-1)] hover:text-white'
                    }`}
                  >
                    SLOT PROGRESS
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={adminTab === 'system_audit'}
                    onClick={() => setAdminTab('system_audit')}
                    className={`flex-1 py-2.5 px-2 font-display text-[10px] sm:text-xs text-center transition-colors ${
                      adminTab === 'system_audit'
                        ? 'bg-[var(--neon-magenta)] text-white font-bold'
                        : 'text-[var(--text-2)] hover:bg-[var(--night-1)] hover:text-white'
                    }`}
                  >
                    SYSTEM & AUDIT {systemAlerts.length > 0 && `(${systemAlerts.length})`}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={dancerTab === 'my_classes'}
                    onClick={() => setDancerTab('my_classes')}
                    className={`flex-1 py-2.5 px-2 font-display text-[10px] sm:text-xs text-center border-r-2 border-[var(--outline)] transition-colors ${
                      dancerTab === 'my_classes'
                        ? 'bg-[var(--neon-cyan)] text-[var(--on-neon)] font-bold'
                        : 'text-[var(--text-2)] hover:bg-[var(--night-1)] hover:text-white'
                    }`}
                  >
                    🎓 MY CLASSES ({dancerEnrolledEvents.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={dancerTab === 'upcoming'}
                    onClick={() => setDancerTab('upcoming')}
                    className={`flex-1 py-2.5 px-2 font-display text-[10px] sm:text-xs text-center border-r-2 border-[var(--outline)] transition-colors ${
                      dancerTab === 'upcoming'
                        ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold'
                        : 'text-[var(--text-2)] hover:bg-[var(--night-1)] hover:text-white'
                    }`}
                  >
                    ⏰ UPCOMING ({dancerUpcomingSessions.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={dancerTab === 'practice'}
                    onClick={() => setDancerTab('practice')}
                    className={`flex-1 py-2.5 px-2 font-display text-[10px] sm:text-xs text-center transition-colors ${
                      dancerTab === 'practice'
                        ? 'bg-[var(--neon-magenta)] text-white font-bold'
                        : 'text-[var(--text-2)] hover:bg-[var(--night-1)] hover:text-white'
                    }`}
                  >
                    🎬 PRACTICE ({dancerVideos.length + dancerMusic.length})
                  </button>
                </>
              )}
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 pixel-scrollbar">
              {/* DANCER TAB 1: MY CLASSES */}
              {isDancer && dancerTab === 'my_classes' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-xs text-[var(--neon-cyan)]">
                      ★ ENROLLED EVENTS & STYLES
                    </span>
                    <span className="font-mono text-[10px] text-[var(--text-3)]">
                      {dancerEnrolledEvents.length} active
                    </span>
                  </div>

                  {dancerEnrolledEvents.length === 0 ? (
                    <div className="p-4 border-2 border-dashed border-[var(--outline)] text-center space-y-1">
                      <p className="font-display text-xs text-[var(--text-2)]">NO ENROLLED CLASSES</p>
                      <p className="font-mono text-[11px] text-[var(--text-3)]">
                        You have not registered for any active dance classes yet.
                      </p>
                    </div>
                  ) : (
                    dancerEnrolledEvents.map(ev => (
                      <div
                        key={ev.id}
                        className="p-3 border-2 border-[var(--outline)] bg-[var(--night-2)] shadow-[2px_2px_0_var(--outline)] space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-display text-xs font-bold text-[var(--text-1)]">
                              {ev.name}
                            </h3>
                            <p className="font-mono text-[10px] text-[var(--text-3)]">
                              {ev.startDate} to {ev.endDate}
                            </p>
                          </div>
                          <span className="font-display text-[9px] px-1.5 py-0.5 border border-[var(--outline)] bg-[var(--neon-cyan)] text-[var(--on-neon)] uppercase">
                            {ev.type}
                          </span>
                        </div>

                        {/* Styles Enrolled */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {ev.styleIds.map(stId => {
                            const styleObj = dancerStylesMap.get(stId);
                            const name = styleObj?.name || stId.replace('sty_', '').toUpperCase();
                            return (
                              <span
                                key={stId}
                                className="font-display text-[10px] px-2 py-0.5 border border-[var(--outline)] bg-[var(--night-1)] text-[var(--neon-gold)]"
                              >
                                {name}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* DANCER TAB 2: UPCOMING */}
              {isDancer && dancerTab === 'upcoming' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-xs text-[var(--neon-gold)]">
                      ★ UPCOMING SCHEDULE
                    </span>
                    <span className="font-mono text-[10px] text-[var(--text-3)]">
                      {dancerUpcomingSessions.length} sessions
                    </span>
                  </div>

                  {dancerUpcomingSessions.length === 0 ? (
                    <div className="p-4 border-2 border-dashed border-[var(--outline)] text-center space-y-1">
                      <p className="font-display text-xs text-[var(--text-2)]">NO UPCOMING CLASSES</p>
                      <p className="font-mono text-[11px] text-[var(--text-3)]">
                        No upcoming sessions scheduled for your registered styles.
                      </p>
                    </div>
                  ) : (
                    dancerUpcomingSessions.map(ses => {
                      const styleObj = dancerStylesMap.get(ses.styleId);
                      const styleName = styleObj?.name || ses.styleId.replace('sty_', '').toUpperCase();
                      const instructorName = dancerInstructorsMap.get(ses.instructorId) || 'Instructor';

                      return (
                        <div
                          key={ses.id}
                          className="p-3 border-2 border-[var(--outline)] bg-[var(--night-2)] shadow-[2px_2px_0_var(--outline)] space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-display text-[11px] text-[var(--neon-gold)] font-bold">
                              {styleName}
                            </span>
                            <span className="font-mono text-[11px] text-[var(--neon-cyan)]">
                              📅 {ses.date}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-[var(--text-2)]">
                            <span className="font-mono">⏰ {ses.start} - {ses.end}</span>
                            <span className="font-body text-[11px] text-[var(--text-1)]">
                              📍 {ses.venue || 'Studio'}
                            </span>
                          </div>
                          <p className="font-mono text-[10px] text-[var(--text-3)] pt-0.5">
                            Instructor: {instructorName}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* DANCER TAB 3: PRACTICE MEDIA */}
              {isDancer && dancerTab === 'practice' && (
                <div className="space-y-4">
                  {/* Routine Recap Videos */}
                  <div className="space-y-2">
                    <span className="font-display text-xs text-[var(--neon-magenta)] block">
                      📹 ROUTINE RECAP VIDEOS ({dancerVideos.length})
                    </span>
                    {dancerVideos.length === 0 ? (
                      <p className="font-mono text-xs text-[var(--text-3)]">No routine recap videos uploaded yet.</p>
                    ) : (
                      dancerVideos.map(vid => (
                        <div
                          key={vid.id}
                          className="p-2.5 border border-[var(--outline)] bg-[var(--night-2)] shadow-[2px_2px_0_var(--outline)] flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-display text-xs text-[var(--text-1)] block truncate font-bold">
                              {vid.title}
                            </span>
                            <span className="font-mono text-[10px] text-[var(--neon-cyan)]">
                              Drive Video · Ready for Practice
                            </span>
                          </div>
                          <span className="font-display text-[9px] px-2 py-1 border border-[var(--outline)] bg-[var(--neon-magenta)] text-white flex-shrink-0">
                            PLAY ▶
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Practice Music Tracks */}
                  <div className="space-y-2 pt-2 border-t border-[var(--outline)]">
                    <span className="font-display text-xs text-[var(--neon-cyan)] block">
                      🎵 DANCECUE MUSIC TRACKS ({dancerMusic.length})
                    </span>
                    {dancerMusic.length === 0 ? (
                      <p className="font-mono text-xs text-[var(--text-3)]">No music tracks uploaded yet.</p>
                    ) : (
                      dancerMusic.map(m => (
                        <div
                          key={m.id}
                          className="p-2.5 border border-[var(--outline)] bg-[var(--night-2)] shadow-[2px_2px_0_var(--outline)] flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-display text-xs text-[var(--text-1)] block truncate font-bold">
                              {m.title}
                            </span>
                            <span className="font-mono text-[10px] text-[var(--text-3)] uppercase">
                              {m.sourceType} Audio
                            </span>
                          </div>
                          <span className="font-display text-[9px] px-2 py-1 border border-[var(--outline)] bg-[var(--neon-cyan)] text-[var(--on-neon)] flex-shrink-0">
                            LISTEN ♫
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* ADMIN TAB 1: NEW DANCERS */}
              {isAdmin && adminTab === 'new_dancers' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      placeholder="Search name, matric, style..."
                      value={dancerSearch}
                      onChange={e => setDancerSearch(e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-[var(--night-2)] border-2 border-[var(--outline)] font-mono text-xs text-white placeholder-[var(--text-3)] outline-none focus:border-[var(--neon-cyan)]"
                    />
                    <span className="font-mono text-[11px] text-[var(--text-3)] whitespace-nowrap">
                      {filteredDancers.length} recent
                    </span>
                  </div>

                  {filteredDancers.length === 0 ? (
                    <div className="p-4 border-2 border-dashed border-[var(--outline)] text-center text-[var(--text-3)] font-mono text-xs">
                      No dancers registered in the last 14 days.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredDancers.map(d => (
                        <div
                          key={d.memberId}
                          className="p-3 border-2 border-[var(--outline)] bg-[var(--night-2)] shadow-[2px_2px_0_var(--outline)] space-y-1.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-display text-xs text-[var(--text-1)] font-bold block">
                                {d.fullName}
                              </span>
                              <span className="font-mono text-[11px] text-[var(--neon-cyan)]">
                                {d.matricKey}
                              </span>
                            </div>
                            <span className="font-mono text-[10px] text-[var(--text-3)]">
                              {d.sourceTimestamp
                                ? new Date(d.sourceTimestamp).toLocaleDateString()
                                : ''}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1 pt-1">
                            {(d.styleNames || []).map(st => (
                              <span
                                key={st}
                                className="font-display text-[9px] px-1.5 py-0.5 border border-[var(--outline)] bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold"
                              >
                                {st}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ADMIN TAB 2: SLOT PROGRESS */}
              {isAdmin && adminTab === 'slot_progress' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono text-[var(--text-3)]">
                    <span>CAPACITY FILL STATUS</span>
                    <span>ACTIVE EVENTS</span>
                  </div>

                  {slotProgressList.length === 0 ? (
                    <div className="p-4 border-2 border-dashed border-[var(--outline)] text-center text-[var(--text-3)] font-mono text-xs">
                      No style slots configured for active events.
                    </div>
                  ) : (
                    slotProgressList.map((slot, idx) => (
                      <div
                        key={idx}
                        className="p-3 border-2 border-[var(--outline)] bg-[var(--night-2)] shadow-[2px_2px_0_var(--outline)] space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="font-display text-xs text-[var(--text-1)] font-bold block">
                              {slot.eventName} · {slot.styleName}
                            </span>
                            <span className="font-mono text-[10px] text-[var(--text-3)]">
                              Capacity: {slot.capacity > 0 ? slot.capacity : 'Unlimited'}
                            </span>
                          </div>
                          <span
                            className={`font-display text-[10px] px-2 py-0.5 border border-[var(--outline)] font-bold ${
                              slot.isFull
                                ? 'bg-[var(--neon-red)] text-white animate-pulse'
                                : slot.percentage >= 80
                                ? 'bg-[var(--neon-gold)] text-[var(--on-neon)]'
                                : 'bg-[var(--neon-cyan)] text-[var(--on-neon)]'
                            }`}
                          >
                            {slot.isFull ? 'FULL' : `${slot.percentage}%`}
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-3 bg-[var(--night-1)] border border-[var(--outline)] overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              slot.isFull
                                ? 'bg-[var(--neon-red)]'
                                : slot.percentage >= 80
                                ? 'bg-[var(--neon-gold)]'
                                : 'bg-[var(--neon-cyan)]'
                            }`}
                            style={{ width: `${slot.percentage}%` }}
                          />
                        </div>

                        <div className="flex justify-between font-mono text-[10px] text-[var(--text-2)]">
                          <span>Filled: {slot.filled}</span>
                          <span>Left: {Math.max(0, slot.capacity - slot.filled)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ADMIN TAB 3: SYSTEM & AUDIT */}
              {isAdmin && adminTab === 'system_audit' && (
                <div className="space-y-4">
                  {/* System Alerts */}
                  <div className="space-y-2">
                    <h3 className="font-display text-[11px] text-[var(--neon-red)] tracking-wider">
                      SYSTEM ALERTS ({systemAlerts.length})
                    </h3>
                    {systemAlerts.length === 0 ? (
                      <p className="font-mono text-xs text-[var(--neon-cyan)]">✓ All systems operational.</p>
                    ) : (
                      systemAlerts.map(alert => (
                        <div
                          key={alert.id}
                          className="p-3 border-2 border-[var(--neon-red)] bg-[var(--night-2)] space-y-1 shadow-[2px_2px_0_var(--outline)]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-display text-xs text-[var(--neon-red)] font-bold">
                              ⚠️ {alert.title}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setDismissedAlertIds(prev => new Set([...prev, alert.id]))
                              }
                              className="font-mono text-[10px] text-[var(--text-3)] hover:text-white"
                            >
                              [ DISMISS ]
                            </button>
                          </div>
                          <p className="font-body text-xs text-[var(--text-1)]">{alert.detail}</p>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Recent Audit Log Activity */}
                  <div className="space-y-2 pt-2 border-t border-[var(--outline)]">
                    <h3 className="font-display text-[11px] text-[var(--text-2)] tracking-wider">
                      RECENT AUDIT LOG
                    </h3>
                    {auditLogs.length === 0 ? (
                      <p className="font-mono text-xs text-[var(--text-3)]">No recent audit logs.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto pixel-scrollbar pr-1">
                        {auditLogs.map(log => (
                          <div
                            key={log.id}
                            className="p-2 border border-[var(--outline)] bg-[var(--night-2)] font-mono text-[11px] space-y-0.5"
                          >
                            <div className="flex justify-between text-[var(--neon-cyan)]">
                              <span className="font-bold">{log.action}</span>
                              <span className="text-[10px] text-[var(--text-3)]">
                                {log.ts ? new Date(log.ts).toLocaleTimeString() : ''}
                              </span>
                            </div>
                            <p className="text-[var(--text-2)] truncate">
                              Target: {log.target} {log.detail ? `· ${log.detail}` : ''}
                            </p>
                            <p className="text-[10px] text-[var(--text-3)]">Actor: {log.actor}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default NotificationWidget;
