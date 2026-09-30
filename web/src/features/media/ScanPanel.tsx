import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import type { ClassSession, DanceStyle, Month } from '@umdsc/shared';

interface ScanItem {
  fileId: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  suggestedSessionId: string | null;
  reason: string;
}

interface ScanPanelProps {
  style: DanceStyle;
  month: Month;
  sessions: ClassSession[];
  onClose: () => void;
  onSuccess: () => void;
}

export const ScanPanel: React.FC<ScanPanelProps> = ({
  style,
  month,
  sessions,
  onClose,
  onSuccess
}) => {
  const queryClient = useQueryClient();
  const [selectedSessions, setSelectedSessions] = useState<Record<string, string>>({});

  const {
    data: scanResults = [],
    isLoading,
    error,
    refetch
  } = useQuery<ScanItem[]>({
    queryKey: ['videos.scan', style.id, month],
    queryFn: async () => {
      const res = await api.post<ScanItem[]>('videos.scan', {
        styleId: style.id,
        month
      });
      return res.data;
    }
  });

  const registerMutation = useMutation({
    mutationFn: async ({ fileId, name }: { fileId: string; name: string }) => {
      const sId = selectedSessions[fileId] || sessions[0]?.id;
      if (!sId) {
        throw new Error('Please select a session for this video');
      }
      return await api.post('videos.register', {
        driveFileId: fileId,
        sessionId: sId,
        title: name
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      refetch();
      onSuccess();
    },
    onError: (err) => {
      alert(errorMessage(err));
    }
  });

  return (
    <div className="fixed inset-0 bg-[var(--c-ink)]/60 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col">
        <Panel
          title={`SCAN FOLDER: ${style.name} (${month})`}
          className="px-corners bg-[var(--c-panel)] flex-1 overflow-y-auto space-y-4"
        >
          <p className="font-body text-sm text-[var(--c-darkgrey)]">
            Scan your Google Drive folder for class videos and automatically link them to scheduled sessions.
          </p>

          {error && (
            <div
              role="alert"
              className="bg-[var(--c-peach)] border-2 border-[var(--c-red)] p-3 text-[var(--c-red)] font-bold text-xs"
            >
              {errorMessage(error)}
            </div>
          )}

          {isLoading ? (
            <div className="p-8 text-center font-display text-xs animate-pulse">
              SCANNING DRIVE FOLDERS...
            </div>
          ) : scanResults.length === 0 ? (
            <div className="p-6 bg-[var(--c-bg)] border-2 border-[var(--c-ink)] text-center font-display text-xs">
              NO UNREGISTERED VIDEOS FOUND IN THIS FOLDER
            </div>
          ) : (
            <div className="space-y-3">
              {scanResults.map((item) => {
                const assignedSession =
                  selectedSessions[item.fileId] || item.suggestedSessionId || sessions[0]?.id || '';
                const sizeMb = (item.sizeBytes / (1024 * 1024)).toFixed(1);

                return (
                  <div
                    key={item.fileId}
                    className="p-3 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] shadow-[2px_2px_0_var(--c-ink)] space-y-2"
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                      <span className="font-display text-xs text-[var(--c-ink)] font-bold truncate">
                        {item.name}
                      </span>
                      <span className="font-mono text-xs text-[var(--c-darkgrey)]">
                        {sizeMb} MB
                      </span>
                    </div>

                    {item.reason && (
                      <p className="font-mono text-[11px] text-[var(--c-navy)] italic">
                        {item.reason}
                      </p>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center pt-1">
                      <select
                        value={assignedSession}
                        onChange={(e) =>
                          setSelectedSessions((prev) => ({
                            ...prev,
                            [item.fileId]: e.target.value
                          }))
                        }
                        className="flex-1 min-h-[44px] px-2 border-2 border-[var(--c-ink)] font-body text-xs bg-[var(--c-panel)]"
                      >
                        {sessions.map((s) => (
                          <option key={s.id} value={s.id}>
                            #{s.seq} {s.date} ({s.start} - {s.end})
                          </option>
                        ))}
                      </select>

                      <PixelButton
                        size="md"
                        variant="primary"
                        disabled={registerMutation.isPending || !assignedSession}
                        onClick={() =>
                          registerMutation.mutate({
                            fileId: item.fileId,
                            name: item.name
                          })
                        }
                      >
                        {registerMutation.isPending ? 'REGISTERING...' : 'REGISTER VIDEO'}
                      </PixelButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-3 border-t-2 border-[var(--c-ink)] flex justify-end">
            <PixelButton size="md" variant="secondary" onClick={onClose}>
              CLOSE
            </PixelButton>
          </div>
        </Panel>
      </div>
    </div>
  );
};
