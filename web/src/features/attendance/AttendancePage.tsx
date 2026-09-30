import React, { useState, useEffect } from 'react';
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
import type { AttendanceGrid as AttendanceGridData, DanceStyle, Month } from '@umdsc/shared';

export const AttendancePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Load initial month & style from query params or defaults
  const currentMonth = todayKL().slice(0, 7);
  const paramMonth = searchParams.get('month');
  const paramStyle = searchParams.get('style');

  const [month, setMonth] = useState<Month>(paramMonth || currentMonth);
  const [styleId, setStyleId] = useState<string>(paramStyle || '');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

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

  // Keep local optimistic present in sync when server gridData loads
  useEffect(() => {
    if (gridData?.present) {
      setLocalPresent(gridData.present);
    }
  }, [gridData?.present, gridData?.version]);

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

  // Toggle attendance handler (optimistic + enqueued)
  const handleToggle = (memberId: string, sessionId: string, nextPresent: boolean) => {
    // 1. Optimistic local update
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

    // 2. Enqueue tick
    attendanceQueue.enqueue({
      month,
      styleId,
      sessionId,
      memberId,
      present: nextPresent
    });
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

  // Update Master Folder mutation
  const updateFolderMutation = useMutation({
    mutationFn: async (urlOrId: string) => {
      setFolderSaveError(null);
      setFolderSaveSuccess(null);
      const res = await api.post('settings.update', {
        key: 'defaultAttendanceFolderId',
        value: urlOrId.trim()
      });
      return res.data;
    },
    onSuccess: () => {
      setFolderSaveSuccess(
        'Master folder link saved! System will auto-create dance style subfolders & monthly sheets here.'
      );
      refetchSettings();
      refetch();
    },
    onError: (err) => {
      setFolderSaveError(errorMessage(err));
    }
  });

  // Ensure / sync sheets mutation
  const ensureSheetsMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ sheets: { styleId: string; spreadsheetId: string }[] }>(
        'attendance.ensureSheets',
        { month }
      );
      return res.data;
    },
    onSuccess: (data) => {
      alert(
        `✓ Successfully created/synced attendance sheets for ${data.sheets.length} dance styles in Master Drive folder!`
      );
      refetch();
    },
    onError: (err) => {
      alert(errorMessage(err));
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
            Auto-creation: Classes 1 to 4 for {month} will be synced as columns in each style's spreadsheet.
          </div>
          <PixelButton
            size="md"
            variant="secondary"
            disabled={ensureSheetsMutation.isPending || !currentMasterFolder}
            onClick={() => ensureSheetsMutation.mutate()}
          >
            {ensureSheetsMutation.isPending
              ? 'SYNCING SHEETS...'
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
            />
          </div>
        </>
      )}
    </div>
  );
};

export default AttendancePage;
