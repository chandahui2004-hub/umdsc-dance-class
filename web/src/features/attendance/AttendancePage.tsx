import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { todayKL, addMonths } from '../../lib/time';
import { attendanceQueue } from '../../lib/tickQueue';
import { PixelButton } from '../../components/ui/PixelButton';
import { Panel } from '../../components/ui/Panel';
import { Field } from '../../components/ui/Field';
import { RosterList } from './RosterList';
import { AttendanceGrid } from './AttendanceGrid';
import { useRegistrationAutoSync } from '../../lib/useRegistrationAutoSync';
import type { AttendanceGrid as AttendanceGridData, DanceStyle, Month } from '@umdsc/shared';

export const AttendancePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Load initial month & style from query params or defaults
  const currentMonth = todayKL().slice(0, 7);
  const paramMonth = searchParams.get('month');
  // The Today page links with styleId/sessionId; this page's own links use style.
  const paramStyle = searchParams.get('style') || searchParams.get('styleId');

  const [month, setMonth] = useState<Month>(paramMonth || currentMonth);
  const [styleId, setStyleId] = useState<string>(paramStyle || '');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(searchParams.get('sessionId'));

  // Ticks are only allowed while editing, and are sent to Google Sheets on SUBMIT.
  const [editing, setEditing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Master Attendance Folder UI state
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [masterFolderInput, setMasterFolderInput] = useState('');
  const [folderSaveSuccess, setFolderSaveSuccess] = useState<string | null>(null);
  const [folderSaveError, setFolderSaveError] = useState<string | null>(null);

  // Pending sync indicator
  const [pendingCount, setPendingCount] = useState<number>(0);

  // Local optimistic present map: memberId -> sessionId[]
  const [localPresent, setLocalPresent] = useState<Record<string, string[]>>({});

  // Subscribe to tickQueue
  useEffect(() => {
    attendanceQueue.load();
    const unsub = attendanceQueue.subscribe((count) => {
      setPendingCount(count);
    });
    return unsub;
  }, []);

  // Fetch settings for defaultAttendanceFolderId
  const { data: settingsData, refetch: refetchSettings } = useQuery<{
    defaultAttendanceFolderId?: string;
  }>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.post<Record<string, string>>('settings.get');
      return res.data;
    }
  });

  useEffect(() => {
    if (settingsData?.defaultAttendanceFolderId && !masterFolderInput) {
      setMasterFolderInput(settingsData.defaultAttendanceFolderId);
    }
  }, [settingsData?.defaultAttendanceFolderId, masterFolderInput]);

  // Fetch styles
  const { data: styles = [] } = useQuery<DanceStyle[]>({
    queryKey: ['styles'],
    queryFn: async () => {
      const res = await api.post<DanceStyle[]>('styles.list');
      return res.data;
    }
  });

  // Default styleId if not selected
  useEffect(() => {
    if (!styleId && styles.length > 0) {
      setStyleId(styles[0].id);
    }
  }, [styleId, styles]);

  // Sync state to URL search params
  useEffect(() => {
    if (month && styleId) {
      setSearchParams({ month, style: styleId }, { replace: true });
    }
  }, [month, styleId, setSearchParams]);

  // Fetch attendance grid data
  const {
    data: gridData,
    isLoading,
    refetch
  } = useQuery<AttendanceGridData>({
    queryKey: ['attendance', month, styleId],
    queryFn: async () => {
      if (!month || !styleId) {
        return {
          month,
          styleId,
          version: 1,
          sessions: [],
          members: [],
          present: {}
        };
      }
      const res = await api.post<AttendanceGridData>('attendance.get', {
        month,
        styleId
      });
      return res.data;
    },
    enabled: Boolean(month && styleId)
  });

  // Show the saved ticks whenever server data loads, unless the admin is mid-edit
  useEffect(() => {
    if (gridData?.present && !editing) {
      setLocalPresent(gridData.present);
    }
  }, [gridData?.present, gridData?.version, editing]);

  // Switching style or month discards an unfinished edit
  useEffect(() => {
    setEditing(false);
    setSubmitError(null);
  }, [month, styleId]);

  // Set default active session
  useEffect(() => {
    if (gridData?.sessions && gridData.sessions.length > 0) {
      if (!activeSessionId || !gridData.sessions.some((s) => s.id === activeSessionId)) {
        setActiveSessionId(gridData.sessions[0].id);
      }
    }
  }, [gridData?.sessions, activeSessionId]);

  // 20s polling with ifVersion when tab is visible
  useEffect(() => {
    if (!month || !styleId) return;

    const interval = setInterval(async () => {
      if (document.visibilityState === 'visible' && gridData?.version) {
        try {
          const res = await api.post<AttendanceGridData | { notModified: boolean; version: number }>(
            'attendance.get',
            {
              month,
              styleId,
              ifVersion: gridData.version
            }
          );
          if (!('notModified' in res.data)) {
            refetch();
          }
        } catch {
          // ignore background poll errors
        }
      }
    }, 20000);

    return () => clearInterval(interval);
  }, [month, styleId, gridData?.version, refetch]);

  // Tick handler: changes stay on screen only until SUBMIT
  const handleToggle = (memberId: string, sessionId: string, nextPresent: boolean) => {
    if (!editing) return;
    setLocalPresent((prev) => {
      const curList = prev[memberId] || [];
      const nextList = nextPresent
        ? [...new Set([...curList, sessionId])]
        : curList.filter((id) => id !== sessionId);
      return {
        ...prev,
        [memberId]: nextList
      };
    });
  };

  // Cells whose tick differs from what is saved in the sheet
  const unsavedChanges = useMemo(() => {
    const saved = gridData?.present || {};
    const changes: { memberId: string; sessionId: string; present: boolean }[] = [];
    for (const m of gridData?.members || []) {
      for (const s of gridData?.sessions || []) {
        const wasPresent = (saved[m.memberId] || []).includes(s.id);
        const isPresent = (localPresent[m.memberId] || []).includes(s.id);
        if (wasPresent !== isPresent) {
          changes.push({ memberId: m.memberId, sessionId: s.id, present: isPresent });
        }
      }
    }
    return changes;
  }, [gridData, localPresent]);

  // Warn before closing the tab with unsubmitted ticks
  useEffect(() => {
    if (!editing || unsavedChanges.length === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [editing, unsavedChanges.length]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      setSubmitError(null);
      for (const c of unsavedChanges) {
        attendanceQueue.enqueue({ month, styleId, ...c });
      }
      // flush() returns early if a background flush is already running, so poll
      // until this sheet's ticks are gone from the queue (up to ~20 s).
      const isPending = () =>
        attendanceQueue.pending().some((t) => t.month === month && t.styleId === styleId);
      for (let i = 0; i < 20 && isPending(); i++) {
        await attendanceQueue.flush();
        if (isPending()) await new Promise((r) => setTimeout(r, 1000));
      }
      if (isPending()) {
        throw new Error('Some ticks could not be saved yet. They will keep retrying in the background.');
      }
    },
    onSuccess: async () => {
      setEditing(false);
      await refetch();
    },
    onError: (err) => {
      setSubmitError(errorMessage(err));
    }
  });

  const cancelEdit = () => {
    setLocalPresent(gridData?.present || {});
    setEditing(false);
    setSubmitError(null);
  };

  // Export XLSX mutation
  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ fileName: string; base64: string }>('attendance.export', {
        month,
        styleId
      });
      return res.data;
    },
    onSuccess: ({ fileName, base64 }) => {
      try {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (err) {
        alert('Failed to download XLSX: ' + String(err));
      }
    },
    onError: (err) => {
      alert(errorMessage(err));
    }
  });

  const autoSync = useRegistrationAutoSync(month);

  // Update Master Folder mutation
  const updateFolderMutation = useMutation({
    mutationFn: async (urlOrId: string) => {
      setFolderSaveError(null);
      setFolderSaveSuccess(null);
      const res = await api.post('settings.setLink', {
        key: 'defaultAttendanceFolderId',
        url: urlOrId.trim(),
        value: urlOrId.trim()
      });
      return res.data;
    },
    onSuccess: async () => {
      setFolderSaveSuccess(
        'Master folder link saved! Auto-creating dance style subfolders & monthly sheets in Drive now...'
      );
      await refetchSettings();
      await refetch();
      // Automatically trigger ensureSheetsMutation to generate subfolders & sheets for all dance styles!
      ensureSheetsMutation.mutate();
    },
    onError: (err) => {
      setFolderSaveError(errorMessage(err));
    }
  });

  // Ensure / sync sheets mutation
  const ensureSheetsMutation = useMutation({
    mutationFn: async () => {
      setFolderSaveError(null);
      const res = await api.post<{ sheets: { styleId: string; spreadsheetId: string }[] }>(
        'attendance.ensureSheets',
        { month }
      );
      return res.data;
    },
    onSuccess: (data) => {
      setFolderSaveSuccess(
        `✓ Auto-generated attendance Google Sheets for all ${data.sheets.length} dance styles in Drive with classes 1-4!`
      );
      refetchSettings();
      refetch();
    },
    onError: (err) => {
      setFolderSaveError(errorMessage(err));
    }
  });

  const activeStyle = styles.find((s) => s.id === styleId);
  const currentMasterFolder = settingsData?.defaultAttendanceFolderId || gridData?.masterFolderId;
  const sessions = gridData?.sessions || [];
  const members = gridData?.members || [];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="font-display text-lg tracking-wider text-[var(--c-ink)]">
            Attendance Tracker
          </h1>
          <p className="font-body text-base text-[var(--c-darkgrey)] mt-1">
            Track member attendance per style and sync automatically to Google Sheets.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* 1-Minute Registration Auto-sync badge */}
          <div className="px-2.5 py-1 bg-[var(--c-panel)] border-2 border-[var(--c-ink)] font-mono text-xs flex items-center gap-1.5 shadow-[2px_2px_0_var(--c-ink)]">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                autoSync.isSyncing ? 'bg-[var(--c-yellow)] animate-spin' : 'bg-[var(--c-green)] animate-pulse'
              }`}
            />
            <span className="font-display text-[10px] text-[var(--c-ink)]">
              {autoSync.isSyncing
                ? 'SYNCING...'
                : autoSync.lastSyncedAt
                ? `AUTO-SYNC (1M): ${autoSync.lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'AUTO-SYNC: 1 MIN'}
            </span>
            <button
              type="button"
              onClick={() => autoSync.syncNow()}
              disabled={autoSync.isSyncing}
              title="Poll Google Form Sheet for latest registrations now"
              className="ml-1 px-1.5 py-0.5 border border-[var(--c-ink)] bg-[var(--c-bg)] font-display text-[9px] hover:bg-[var(--c-yellow)]"
            >
              ↻ SYNC NOW
            </button>
          </div>

          {pendingCount > 0 && (
            <div className="px-3 py-1 bg-[var(--c-yellow)] border-2 border-[var(--c-ink)] font-display text-xs text-[var(--c-ink)] font-bold animate-pulse shadow-[2px_2px_0_var(--c-ink)]">
              SAVING… {pendingCount}
            </div>
          )}
          <PixelButton
            size="md"
            variant="secondary"
            disabled={exportMutation.isPending || !styleId || sessions.length === 0}
            onClick={() => exportMutation.mutate()}
          >
            {exportMutation.isPending ? 'EXPORTING...' : 'EXPORT XLSX'}
          </PixelButton>
        </div>
      </div>

      {/* Master Attendance Google Drive Folder Banner */}
      <Panel
        title="📁 MASTER ATTENDANCE GOOGLE DRIVE FOLDER"
        className="px-corners bg-[var(--c-panel)] border-4 border-[var(--c-ink)] space-y-3"
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3 border-b-2 border-[var(--c-ink)]">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-display text-xs text-[var(--c-ink)]">STATUS:</span>
              {currentMasterFolder ? (
                <span className="px-2 py-0.5 border-2 border-[var(--c-ink)] bg-[var(--c-green)] text-[var(--c-ink)] font-display text-[11px] font-bold shadow-[2px_2px_0_var(--c-ink)]">
                  ✓ MASTER FOLDER CONNECTED
                </span>
              ) : (
                <span className="px-2 py-0.5 border-2 border-[var(--c-ink)] bg-[var(--c-peach)] text-[var(--c-red)] font-display text-[11px] font-bold shadow-[2px_2px_0_var(--c-ink)]">
                  ⚠ NOT CONFIGURED
                </span>
              )}
            </div>
            <p className="font-body text-xs text-[var(--c-darkgrey)] max-w-2xl">
              Upload ONE master folder link here. The system will automatically go to this master folder, create a subfolder for each dance style (Locking, Popping, Hip Hop, Latin), and generate monthly attendance Google Sheets with all 4 classes in the same sheet.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {currentMasterFolder && (
              <a
                href={
                  currentMasterFolder.startsWith('http')
                    ? currentMasterFolder
                    : `https://drive.google.com/drive/folders/${currentMasterFolder}`
                }
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 border-2 border-[var(--c-ink)] bg-[var(--c-navy)] text-[var(--c-bg)] font-display text-xs font-bold shadow-[2px_2px_0_var(--c-ink)] hover:bg-[var(--c-blue)] no-underline flex items-center gap-1"
              >
                OPEN MASTER FOLDER ↗
              </a>
            )}
            {gridData?.spreadsheetId && (
              <a
                href={`https://docs.google.com/spreadsheets/d/${gridData.spreadsheetId}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 border-2 border-[var(--c-ink)] bg-[var(--c-green)] text-[var(--c-ink)] font-display text-xs font-bold shadow-[2px_2px_0_var(--c-ink)] hover:bg-[var(--c-yellow)] no-underline flex items-center gap-1"
              >
                OPEN {activeStyle?.name.toUpperCase() || 'STYLE'} SHEET ↗
              </a>
            )}
            <PixelButton
              size="md"
              variant={showFolderInput ? 'secondary' : 'primary'}
              onClick={() => setShowFolderInput((v) => !v)}
            >
              {showFolderInput
                ? 'CLOSE'
                : currentMasterFolder
                ? 'CHANGE FOLDER LINK'
                : '+ SET MASTER LINK'}
            </PixelButton>
          </div>
        </div>

        {/* Expandable Folder URL Input Box */}
        {showFolderInput && (
          <div className="p-3 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] space-y-3">
            <Field
              label="Master Google Drive Folder URL or ID"
              hint="Paste the link to your master attendance folder in Google Drive"
            >
              <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                <input
                  type="text"
                  value={masterFolderInput}
                  onChange={(e) => setMasterFolderInput(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/1abc... or Folder ID"
                  className="flex-1 min-h-[44px] px-3 py-2 bg-[var(--c-panel)] text-[var(--c-ink)] border-2 border-[var(--c-ink)] font-mono text-xs focus:outline-none focus:border-[var(--c-navy)]"
                />
                <PixelButton
                  size="md"
                  variant="primary"
                  disabled={!masterFolderInput.trim() || updateFolderMutation.isPending}
                  onClick={() => updateFolderMutation.mutate(masterFolderInput)}
                >
                  {updateFolderMutation.isPending ? 'SAVING...' : 'SAVE MASTER LINK'}
                </PixelButton>
              </div>
            </Field>

            {folderSaveSuccess && (
              <div className="p-2 border-2 border-[var(--c-green)] bg-[var(--c-green)]/20 text-[var(--c-darkgreen)] font-display text-xs font-bold">
                ✓ {folderSaveSuccess}
              </div>
            )}
            {folderSaveError && (
              <div className="p-2 border-2 border-[var(--c-red)] bg-[var(--c-peach)] text-[var(--c-red)] font-display text-xs font-bold">
                ⚠ {folderSaveError}
              </div>
            )}
          </div>
        )}

        {/* Sync & Auto-create Banner */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1 font-mono text-xs">
          <div className="text-[var(--c-darkgrey)]">
            Auto-creation: every class for {month} becomes a column in each style's spreadsheet.
          </div>
          <PixelButton
            size="md"
            variant="primary"
            disabled={
              ensureSheetsMutation.isPending ||
              updateFolderMutation.isPending ||
              (!currentMasterFolder && !masterFolderInput.trim())
            }
            onClick={() => {
              if (masterFolderInput.trim() && masterFolderInput.trim() !== currentMasterFolder) {
                updateFolderMutation.mutate(masterFolderInput.trim());
              } else {
                ensureSheetsMutation.mutate();
              }
            }}
          >
            {ensureSheetsMutation.isPending || updateFolderMutation.isPending
              ? 'CREATING & SYNCING...'
              : '⚡ AUTO-CREATE / SYNC ALL STYLE SHEETS IN DRIVE'}
          </PixelButton>
        </div>
      </Panel>

      {/* Selectors Bar: Style & Month */}
      <div className="bg-[var(--c-panel)] border-4 border-[var(--c-ink)] p-4 shadow-[4px_4px_0_var(--c-ink)] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Style Chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 items-center">
          <span className="font-display text-xs text-[var(--c-ink)] uppercase mr-1 whitespace-nowrap">
            STYLE:
          </span>
          {styles.map((s) => (
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

        {/* Month Stepper */}
        <div className="flex items-center gap-2 justify-end">
          <PixelButton
            size="md"
            variant="secondary"
            onClick={() => setMonth((m) => addMonths(m, -1))}
          >
            &lt;
          </PixelButton>
          <div className="px-4 py-2 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] font-mono text-sm font-bold text-[var(--c-navy)] min-w-[100px] text-center">
            {month}
          </div>
          <PixelButton
            size="md"
            variant="secondary"
            onClick={() => setMonth((m) => addMonths(m, 1))}
          >
            &gt;
          </PixelButton>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading && !gridData ? (
        <div className="p-8 bg-[var(--c-panel)] border-4 border-[var(--c-ink)] text-center font-display text-xs animate-pulse">
          LOADING ATTENDANCE DATA...
        </div>
      ) : (
        <>
          {/* Edit / Submit bar */}
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
                    <PixelButton
                      size="md"
                      variant="secondary"
                      disabled={submitMutation.isPending}
                      onClick={cancelEdit}
                    >
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
            <div
              role="alert"
              className="p-2 border-2 border-[var(--c-red)] bg-[var(--c-peach)] text-[var(--c-red)] font-display text-xs font-bold"
            >
              ⚠ {submitError}
            </div>
          )}

          {/* Mobile view (< 1024px) */}
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

          {/* Desktop view (>= 1024px) */}
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
