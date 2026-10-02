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
import type { AttendanceGrid as AttendanceGridData, DanceStyle } from '@umdsc/shared';

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
      // flush() returns early if a background flush is already running, so poll
      // until this sheet's ticks are gone from the queue (up to ~20 s).
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
  const members = gridData?.members || [];

  if (!eventsLoading && isAll && events.length > 0) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-lg tracking-wider text-[var(--c-ink)]">Attendance Tracker</h1>
        <AttendanceFolderHeader />
        <div className="p-4 bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] space-y-3">
          <p className="font-display text-xs text-[var(--c-ink)]">SELECT AN EVENT TO TAKE ATTENDANCE</p>
          <p className="font-body text-sm text-[var(--c-darkgrey)]">
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
        <h1 className="font-display text-lg tracking-wider text-[var(--c-ink)]">Attendance Tracker</h1>
        <AttendanceFolderHeader />
        <EmptyState
          title="NO EVENTS YET"
          description="Attendance is taken per event. Create an event from its registration form first."
          action={
            <Link
              to="/admin/events/new"
              className="inline-flex items-center min-h-[44px] px-4 border-2 border-[var(--c-ink)] bg-[var(--c-orange)] text-[var(--c-ink)] font-display text-xs no-underline"
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
          <h1 className="font-display text-lg tracking-wider text-[var(--c-ink)]">Attendance Tracker</h1>
          <p className="font-body text-base text-[var(--c-darkgrey)] mt-1">
            {event ? `${event.name} · ${event.startDate} → ${event.endDate}` : 'Loading event…'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {pendingCount > 0 && (
            <div className="px-3 py-1 bg-[var(--c-yellow)] border-2 border-[var(--c-ink)] font-display text-xs text-[var(--c-ink)] font-bold animate-pulse shadow-[2px_2px_0_var(--c-ink)]">
              SAVING… {pendingCount}
            </div>
          )}
          {gridData?.spreadsheetId && (
            <a
              href={`https://docs.google.com/spreadsheets/d/${gridData.spreadsheetId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center min-h-[44px] px-3 border-2 border-[var(--c-ink)] bg-[var(--c-green)] text-[var(--c-ink)] font-display text-xs no-underline shadow-[2px_2px_0_var(--c-ink)]"
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
        </div>
      </div>

      <AttendanceFolderHeader />

      <div className="bg-[var(--c-panel)] border-4 border-[var(--c-ink)] p-4 shadow-[4px_4px_0_var(--c-ink)] flex gap-2 overflow-x-auto items-center">

        <span className="font-display text-xs text-[var(--c-ink)] uppercase mr-1 whitespace-nowrap">STYLE:</span>
        {styles.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStyleId(s.id)}
            className={`min-h-[44px] px-3 border-2 border-[var(--c-ink)] font-display text-xs cursor-pointer select-none whitespace-nowrap transition-none ${
              styleId === s.id
                ? 'bg-[var(--c-orange)] text-[var(--c-ink)] font-bold shadow-[2px_2px_0_var(--c-ink)]'
                : 'bg-[var(--c-bg)] text-[var(--c-ink)] hover:bg-[var(--c-panel)]'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {(isLoading && !gridData) || eventsLoading ? (
        <div className="p-8 bg-[var(--c-panel)] border-4 border-[var(--c-ink)] text-center font-display text-xs animate-pulse">
          LOADING ATTENDANCE DATA...
        </div>
      ) : (
        <>
          {sessions.length > 0 && members.length > 0 && (
            <div
              className={`p-3 border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                editing ? 'bg-[var(--c-yellow)]' : 'bg-[var(--c-panel)]'
              }`}
            >
              <div className="font-display text-xs text-[var(--c-ink)]">
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
            <div role="alert" className="p-2 border-2 border-[var(--c-red)] bg-[var(--c-peach)] text-[var(--c-red)] font-display text-xs font-bold">
              ⚠ {submitError}
            </div>
          )}

          <div className="block lg:hidden">
            <Panel title="SESSION ATTENDANCE ROSTER" className="px-corners">
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
        </>
      )}
    </div>
  );
};

export default AttendancePage;
