import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DanceStyle, EventListItem } from '@umdsc/shared';
import { call, errorMessage } from '../../lib/api';
import { PixelButton } from '../../components/ui/PixelButton';
import { getStyleColor } from '../../theme/colors';
import { useCurrentEvent } from './useCurrentEvent';

const TYPE_LABEL: Record<string, string> = {
  monthly: 'Monthly class',
  trial: 'Trial class',
  workshop: 'Workshop',
  other: 'Other'
};

function formatKL(iso: string): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

interface SyncResult {
  added: number;
  updated: number;
  message?: string;
}

export const EventCard: React.FC<{ event: EventListItem; styles: DanceStyle[] }> = ({ event, styles }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setCurrentId } = useCurrentEvent();
  const [note, setNote] = useState<string | null>(null);
  const archived = event.status === 'archived';

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['events'] });
  const onError = (err: unknown) => setNote(errorMessage(err));

  const sync = useMutation({
    mutationFn: async () => (await call<SyncResult>('events.sync', { id: event.id })).data,
    onSuccess: r => {
      setNote(r.message || `Synced: +${r.added} new, ${r.updated} updated`);
      refresh();
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError
  });
  const setStatus = useMutation({
    mutationFn: async (action: 'events.archive' | 'events.unarchive') =>
      call(action, { id: event.id, version: event.version }),
    onSuccess: refresh,
    onError
  });
  const recreate = useMutation({
    mutationFn: async () => call('events.recreateFolder', { id: event.id }),
    onSuccess: () => {
      setNote('Folder recreated.');
      refresh();
    },
    onError
  });

  return (
    <div
      data-testid={`event-card-${event.id}`}
      className={`border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] p-4 space-y-3 ${
        archived ? 'bg-[var(--c-bg)]' : 'bg-[var(--c-panel)]'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-sm text-[var(--text-1)]">{event.name}</h3>
          <p className="font-body text-sm text-[var(--text-2)]">
            {TYPE_LABEL[event.type] || event.type} · {event.startDate} → {event.endDate}
          </p>
        </div>
        <span className="px-2 py-1 border-2 border-[var(--c-ink)] bg-[var(--c-yellow)] font-display text-[10px] text-[var(--on-neon)]">
          {event.memberCount} DANCERS
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {event.styleIds.map(id => {
          const style = styles.find(s => s.id === id);
          return (
            <span
              key={id}
              style={{ backgroundColor: getStyleColor(style?.colorKey) }}
              className="px-2 py-0.5 border-2 border-[var(--c-ink)] font-display text-[10px] text-[var(--text-1)]"
            >
              {style?.name || id}
            </span>
          );
        })}
      </div>

      <div className="font-body text-sm text-[var(--text-1)] space-y-1">
        <p>
          Form:{' '}
          <a
            href={`https://docs.google.com/spreadsheets/d/${event.sourceSheetId}`}
            target="_blank"
            rel="noreferrer"
            className="underline text-[var(--neon-cyan)]"
          >
            open response sheet ↗
          </a>
        </p>
        <p>Last sync: {formatKL(event.lastSyncAt)}</p>
        {event.lastSyncError && (
          <p role="alert" className="font-bold text-[var(--c-red)]">
            ⚠ {event.lastSyncError}
          </p>
        )}
        {event.folderMissing && (
          <p className="font-bold text-[var(--c-red)] flex flex-wrap items-center gap-2">
            ⚠ Folder missing in Drive.
            <PixelButton size="md" variant="danger" disabled={recreate.isPending} onClick={() => recreate.mutate()}>
              {recreate.isPending ? 'RECREATING…' : 'RECREATE'}
            </PixelButton>
          </p>
        )}
        {note && <p className="font-bold text-[var(--neon-green)]">{note}</p>}
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t-2 border-[var(--c-ink)]">
        <PixelButton
          size="md"
          onClick={() => {
            setCurrentId(event.id);
            navigate('/admin/attendance');
          }}
        >
          OPEN
        </PixelButton>
        {!archived && (
          <>
            <PixelButton size="md" variant="secondary" onClick={() => navigate(`/admin/events/${event.id}/edit`)}>
              EDIT
            </PixelButton>
            <PixelButton size="md" variant="secondary" disabled={sync.isPending} onClick={() => sync.mutate()}>
              {sync.isPending ? 'SYNCING…' : 'SYNC NOW'}
            </PixelButton>
            <PixelButton
              size="md"
              variant="ghost"
              disabled={setStatus.isPending}
              onClick={() => {
                if (window.confirm(`Archive "${event.name}"? It stops syncing but stays viewable.`)) {
                  setStatus.mutate('events.archive');
                }
              }}
            >
              ARCHIVE
            </PixelButton>
          </>
        )}
        {archived && (
          <PixelButton size="md" variant="secondary" disabled={setStatus.isPending} onClick={() => setStatus.mutate('events.unarchive')}>
            UNARCHIVE
          </PixelButton>
        )}
      </div>
    </div>
  );
};
