import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { attendanceQueue } from '../../lib/tickQueue';
import { PixelButton } from '../../components/ui/PixelButton';
import { Panel } from '../../components/ui/Panel';
import { EmptyState } from '../../components/ui/EmptyState';
import { RosterList } from './RosterList';
import { AttendanceGrid } from './AttendanceGrid';
import { useCurrentEvent } from '../events/useCurrentEvent';
import { AttendanceFolderHeader } from '../events/FolderLinksHeader';
import type { AttendanceGrid as AttendanceGridData, DanceStyle, Member } from '@umdsc/shared';

function downloadXlsx(fileName: string, base64: string): void {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const AttendancePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { events, current: event, setCurrentId, isLoading: eventsLoading, isAll } = useCurrentEvent();
  const eventId = event?.id || '';

  // The Today page links here with styleId and sessionId
  const [styleId, setStyleId] = useState<string>(searchParams.get('style') || searchParams.get('styleId') || '');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(searchParams.get('sessionId'));

  // Ticks are only allowed while editing, and are sent to Google Sheets on SUBMIT.
  const [editing, setEditing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [localPresent, setLocalPresent] = useState<Record<string, string[]>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  useEffect(() => {
    attendanceQueue.load();
    return attendanceQueue.subscribe(count => setPendingCount(count));
  }, []);

  const { data: allStyles = [] } = useQuery<DanceStyle[]>({
    queryKey: ['styles'],
    queryFn: async () => (await api.post<DanceStyle[]>('styles.list')).data
  });
  const styles = useMemo(
    () => (event ? event.styleIds.map(id => allStyles.find(s => s.id === id)).filter((s): s is DanceStyle => Boolean(s)) : []),
    [event, allStyles]
  );

  // Keep the chosen style inside the current event
  useEffect(() => {
    if (styles.length > 0 && !styles.some(s => s.id === styleId)) {
      setStyleId(styles[0].id);
    }
  }, [styles, styleId]);

  const ready = Boolean(eventId && styleId && styles.some(s => s.id === styleId));
  const { data: gridData, isLoading, refetch } = useQuery<AttendanceGridData>({
    queryKey: ['attendance', eventId, styleId],
    enabled: ready,
    queryFn: async () => (await api.post<AttendanceGridData>('attendance.get', { eventId, styleId })).data
  });

  const { data: eventMembers = [] } = useQuery<Member[]>({
    queryKey: ['members', eventId, styleId],
    enabled: Boolean(ready && (!gridData?.members || gridData.members.length === 0)),
    queryFn: async () => (await api.post<Member[]>('members.list', { eventId, styleId })).data
  });

  // Show the saved ticks whenever server data loads, unless the admin is mid-edit
  useEffect(() => {
    if (gridData?.present && !editing) {
      setLocalPresent(gridData.present);
    }
  }, [gridData?.present, gridData?.version, editing]);

  // Switching event or style discards an unfinished edit
  useEffect(() => {
    setEditing(false);
    setSubmitError(null);
  }, [eventId, styleId]);

  useEffect(() => {
    if (gridData?.sessions?.length && (!activeSessionId || !gridData.sessions.some(s => s.id === activeSessionId))) {
      setActiveSessionId(gridData.sessions[0].id);
    }
  }, [gridData?.sessions, activeSessionId]);

  // Other admins' ticks: poll every 20 s while visible (cheap notModified answer)
  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(async () => {
      if (document.visibilityState !== 'visible' || !gridData?.version) return;
      try {
        const res = await api.post<AttendanceGridData | { notModified: boolean }>('attendance.get', {
          eventId,
          styleId,
          ifVersion: gridData.version
        });
        if (!('notModified' in res.data)) refetch();
      } catch {
        // ignore background poll errors
      }
    }, 20000);
    return () => clearInterval(interval);
  }, [ready, eventId, styleId, gridData?.version, refetch]);

  const handleToggle = (memberId: string, sessionId: string, nextPresent: boolean) => {
    if (!editing) return;
    setLocalPresent(prev => {
      const cur = prev[memberId] || [];
      return {
        ...prev,
        [memberId]: nextPresent ? [...new Set([...cur, sessionId])] : cur.filter(id => id !== sessionId)
      };
    });
  };

  // Cells whose tick differs from what is saved in the sheet
  const unsavedChanges = useMemo(() => {
    const saved = gridData?.present || {};
    const changes: { memberId: string; sessionId: string; present: boolean }[] = [];
    for (const m of gridData?.members || []) {
      for (const s of gridData?.sessions || []) {
        const was = (saved[m.memberId] || []).includes(s.id);
        const now = (localPresent[m.memberId] || []).includes(s.id);
        if (was !== now) changes.push({ memberId: m.memberId, sessionId: s.id, present: now });
      }
    }
    return changes;
  }, [gridData, localPresent]);

  // Warn before closing the tab with unsubmitted ticks
  useEffect(() => {
    if (!editing || unsavedChanges.length === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [editing, unsavedChanges.length]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      setSubmitError(null);
      for (const c of unsavedChanges) {
        attendanceQueue.enqueue({ eventId, styleId, ...c });
      }
      const isPending = () => attendanceQueue.pending().some(t => t.eventId === eventId && t.styleId === styleId);
      for (let i = 0; i < 20 && isPending(); i++) {
        await attendanceQueue.flush();
        if (isPending()) await new Promise(r => setTimeout(r, 1000));
      }
      if (isPending()) {
        throw new Error('Some ticks could not be saved yet. They will keep retrying in the background.');
      }
    },
    onSuccess: async () => {
      setEditing(false);
      await refetch();
    },
    onError: err => setSubmitError(errorMessage(err))
  });

  const cancelEdit = () => {
    setLocalPresent(gridData?.present || {});
    setEditing(false);
    setSubmitError(null);
  };

  const exportMutation = useMutation({
    mutationFn: async () =>
      (await api.post<{ fileName: string; base64: string }>('attendance.export', { eventId, styleId })).data,
    onSuccess: ({ fileName, base64 }) => downloadXlsx(fileName, base64),
    onError: err => alert(errorMessage(err))
  });

  const activeStyle = styles.find(s => s.id === styleId);
  const sessions = gridData?.sessions || [];
  const members = useMemo(() => {
    if (gridData?.members && gridData.members.length > 0) {
      return gridData.members;
    }
    return eventMembers.map(m => ({
      memberId: m.memberId,
      fullName: m.fullName,
      matric: m.matricRaw || m.matricKey
    }));
  }, [gridData?.members, eventMembers]);

  if (!eventsLoading && isAll && events.length > 0) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-[24px] tracking-wider text-[var(--text-1)]">Attendance Tracker</h1>
        <AttendanceFolderHeader />
        <div className="px-panel p-4 space-y-3">
          <p className="font-display text-[12px] text-[var(--text-1)]">SELECT AN EVENT TO TAKE ATTENDANCE</p>
          <p className="font-body text-[16px] text-[var(--text-2)]">
            Attendance sheets are organized by event. Choose an event from the top bar or pick one below:
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {events.filter(e => e.status === 'active').map(e => (
              <PixelButton key={e.id} size="md" variant="secondary" onClick={() => setCurrentId(e.id)}>
                {e.name}
              </PixelButton>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!eventsLoading && !event) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-[24px] tracking-wider text-[var(--text-1)]">Attendance Tracker</h1>
        <AttendanceFolderHeader />
        <EmptyState
          scene="rooftop"
          title="NO EVENTS YET"
          description="Attendance is taken per event. Create an event from its registration form first."
          action={
            <Link
              to="/admin/events/new"
              className="inline-flex items-center min-h-[44px] px-4 border-2 border-[var(--outline)] bg-[var(--neon-gold)] text-[var(--on-neon)] font-display text-[12px] no-underline shadow-[2px_2px_0_var(--outline)]"
            >
              CREATE AN EVENT
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="font-display text-[24px] tracking-wider text-[var(--text-1)]">Attendance Tracker</h1>
          <p className="font-body text-[16px] text-[var(--text-2)] mt-1">
            {event ? `${event.name} · ${event.startDate} → ${event.endDate}` : 'Loading event…'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {pendingCount > 0 && (
            <div className="px-3 py-1 bg-[var(--neon-gold)] border-2 border-[var(--outline)] font-display text-[12px] text-[var(--on-neon)] font-bold px-blink shadow-[2px_2px_0_var(--outline)]">
              SAVING… {pendingCount}
            </div>
          )}
          {gridData?.spreadsheetId && (
            <a
              href={`https://docs.google.com/spreadsheets/d/${gridData.spreadsheetId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center min-h-[44px] px-3 border-2 border-[var(--outline)] bg-[var(--night-2)] hover:bg-[var(--violet-2)] text-[var(--neon-cyan)] font-display text-[12px] no-underline shadow-[2px_2px_0_var(--outline)]"
            >
              OPEN {activeStyle?.name.toUpperCase() || 'STYLE'} SHEET ↗
            </a>
          )}
          <PixelButton
            size="md"
            variant="secondary"
            disabled={exportMutation.isPending || !ready || sessions.length === 0}
            onClick={() => exportMutation.mutate()}
          >
            {exportMutation.isPending ? 'EXPORTING...' : 'EXPORT XLSX'}
          </PixelButton>
          <PixelButton
            size="md"
            variant="secondary"
            disabled={!ready || sessions.length === 0}
            onClick={() => setIsFullscreen(prev => !prev)}
            className="min-h-[44px]"
          >
            {isFullscreen ? '✕ EXIT' : '⛶ FULL SCREEN'}
          </PixelButton>
        </div>
      </div>

      <AttendanceFolderHeader />

      <div className="px-panel p-3 flex gap-2 overflow-x-auto pixel-scrollbar items-center border-2 border-[var(--outline)]">
        <span className="font-display text-[12px] text-[var(--text-1)] uppercase mr-1 whitespace-nowrap">STYLE:</span>
        {styles.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStyleId(s.id)}
            className={`min-h-[44px] px-3 border-2 border-[var(--outline)] font-display text-[12px] cursor-pointer select-none whitespace-nowrap transition-none ${
              styleId === s.id
                ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold shadow-[2px_2px_0_var(--outline)]'
                : 'px-well text-[var(--text-1)] hover:bg-[var(--violet-2)]'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {(isLoading && !gridData) || eventsLoading ? (
        <div className="px-panel p-8 text-center font-display text-[12px] px-blink">
          LOADING ATTENDANCE DATA...
        </div>
      ) : (
        <>
          {sessions.length > 0 && members.length > 0 && (
            <div
              className={`px-panel p-3 border-2 border-[var(--outline)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[4px_4px_0_var(--outline)] ${
                editing ? 'bg-[var(--violet-2)] border-[var(--neon-gold)]' : 'bg-[var(--night-2)]'
              }`}
            >
              <div className="font-display text-[12px] text-[var(--text-1)]">
                {editing
                  ? unsavedChanges.length === 0
                    ? 'EDITING — TICK PRESENT DANCERS, THEN SUBMIT'
                    : `EDITING — ${unsavedChanges.length} UNSAVED CHANGE${unsavedChanges.length === 1 ? '' : 'S'}`
                  : 'SAVED ATTENDANCE — PRESS EDIT TO CHANGE TICKS'}
              </div>
              <div className="flex gap-2">
                {editing ? (
                  <>
                    <PixelButton size="md" variant="secondary" disabled={submitMutation.isPending} onClick={cancelEdit}>
                      CANCEL
                    </PixelButton>
                    <PixelButton
                      size="md"
                      variant="primary"
                      disabled={submitMutation.isPending || unsavedChanges.length === 0}
                      onClick={() => submitMutation.mutate()}
                    >
                      {submitMutation.isPending ? 'SUBMITTING…' : 'SUBMIT'}
                    </PixelButton>
                  </>
                ) : (
                  <PixelButton size="md" variant="primary" onClick={() => setEditing(true)}>
                    EDIT
                  </PixelButton>
                )}
              </div>
            </div>
          )}

          {submitError && (
            <div role="alert" className="p-2 border-2 border-[var(--neon-red)] bg-[var(--night-1)] text-[var(--neon-red)] font-display text-[12px] font-bold">
              ⚠ {submitError}
            </div>
          )}

          <div className="block lg:hidden">
            <Panel title="SESSION ATTENDANCE ROSTER">
              <RosterList
                sessions={sessions}
                members={members}
                presentMap={localPresent}
                activeSessionId={activeSessionId}
                onSelectSession={setActiveSessionId}
                onToggle={handleToggle}
                readOnly={!editing}
              />
            </Panel>
          </div>

          <div className="hidden lg:block">
            <AttendanceGrid
              sessions={sessions}
              members={members}
              presentMap={localPresent}
              onToggle={handleToggle}
              readOnly={!editing}
            />
          </div>

          {/* Fullscreen Overlay Mode */}
          {isFullscreen && (
            <div className="fixed inset-0 z-50 bg-[var(--night-1)] p-4 flex flex-col overflow-hidden space-y-3">
              {/* Header */}
              <div className="flex justify-between items-center px-panel p-3 border-2 border-[var(--outline)] shadow-[4px_4px_0_var(--outline)] flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <h2 className="font-display text-[12px] text-[var(--text-1)]">
                    ATTENDANCE · {activeStyle?.name.toUpperCase() || 'STYLE'}
                  </h2>
                  <span className="font-mono text-[12px] text-[var(--text-2)]">
                    ({sessions.length} sessions, {members.length} dancers)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {editing ? (
                    <>
                      <PixelButton size="md" variant="secondary" onClick={cancelEdit}>
                        CANCEL
                      </PixelButton>
                      <PixelButton
                        size="md"
                        variant="primary"
                        disabled={submitMutation.isPending || unsavedChanges.length === 0}
                        onClick={() => submitMutation.mutate()}
                      >
                        {submitMutation.isPending ? 'SUBMITTING…' : 'SUBMIT'}
                      </PixelButton>
                    </>
                  ) : (
                    <PixelButton size="md" variant="primary" onClick={() => setEditing(true)}>
                      EDIT TICKS
                    </PixelButton>
                  )}
                  <PixelButton
                    size="md"
                    variant="secondary"
                    onClick={() => setIsFullscreen(false)}
                  >
                    ✕ EXIT FULLSCREEN
                  </PixelButton>
                </div>
              </div>

              {/* Style selector inside fullscreen */}
              <div className="px-panel p-2 flex gap-2 overflow-x-auto pixel-scrollbar items-center border-2 border-[var(--outline)]">
                <span className="font-display text-[12px] text-[var(--text-1)] uppercase mr-1 whitespace-nowrap">
                  STYLE:
                </span>
                {styles.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStyleId(s.id)}
                    className={`min-h-[36px] px-3 border-2 border-[var(--outline)] font-display text-[12px] cursor-pointer select-none whitespace-nowrap ${
                      styleId === s.id
                        ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold shadow-[2px_2px_0_var(--outline)]'
                        : 'px-well text-[var(--text-1)] hover:bg-[var(--violet-2)]'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>

              {/* Fullscreen Grid / Roster */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <div className="hidden lg:block h-full">
                  <AttendanceGrid
                    sessions={sessions}
                    members={members}
                    presentMap={localPresent}
                    onToggle={handleToggle}
                    readOnly={!editing}
                    containerClassName="h-full overflow-auto pixel-scrollbar border-4 border-[var(--outline)] shadow-[4px_4px_0_var(--outline)] bg-[var(--night-2)]"
                  />
                </div>
                <div className="block lg:hidden h-full">
                  <RosterList
                    sessions={sessions}
                    members={members}
                    presentMap={localPresent}
                    activeSessionId={activeSessionId}
                    onSelectSession={setActiveSessionId}
                    onToggle={handleToggle}
                    readOnly={!editing}
                    listClassName="h-full overflow-y-auto pixel-scrollbar p-1 space-y-2 border-2 border-[var(--outline)] bg-[var(--night-1)]"
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AttendancePage;
