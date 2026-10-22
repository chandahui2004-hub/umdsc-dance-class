import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DanceStyle, EventListItem } from '@umdsc/shared';
import { call, errorMessage } from '../../lib/api';
import { PixelButton } from '../../components/ui/PixelButton';
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
    mutationFn: async () => (await call<SyncResult>('events.sync', { id: event.id, purgeRemoved: true, force: true })).data,
    onSuccess: async r => {
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ['members'] })]);
      setNote(r.message || `Synced: +${r.added} new, ${r.updated} updated`);
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
    onSuccess: async () => {
      await refresh();
      setNote('Folder recreated.');
    },
    onError
  });

  const syncFormSlots = useMutation({
    mutationFn: async () => (await call<any>('events.syncFormSlots', { id: event.id })).data,
    onSuccess: async (data: any) => {
      await refresh();
      if (data?.discoveredStyleIds && data.discoveredStyleIds.length > 0) {
        setNote(`Google Form synchronized: ${data.discoveredStyleIds.length} new style(s) discovered from form!`);
      } else if (data?.formClosedManually) {
        setNote('Google Form detected as manually closed by admin in Google Forms.');
      } else if (data?.formClosed) {
        setNote('Google Form closed: FULL HOUSE reached.');
      } else if (data?.fullStyleIds && data.fullStyleIds.length > 0) {
        setNote(`Google Form updated: ${data.fullStyleIds.length} full style(s) removed.`);
      } else if (data?.synced) {
        setNote('Google Form synchronized: choices up to date.');
      } else {
        setNote(data?.message || 'Form sync completed.');
      }
    },
    onError
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteEvent = useMutation({
    mutationFn: async () => {
      setDeleteError(null);
      return (await call<any>('events.delete', { id: event.id })).data;
    },
    onSuccess: async () => {
      setShowDeleteConfirm(false);
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ['sessions'] }),
        queryClient.invalidateQueries({ queryKey: ['members'] })
      ]);
    },
    onError: (err) => setDeleteError(errorMessage(err))
  });

  let styleSlots: Record<string, number> = {};
  if (event.styleSlots && typeof event.styleSlots === 'object') {
    styleSlots = event.styleSlots;
  } else if (event.styleSlotsJson) {
    try {
      styleSlots = JSON.parse(event.styleSlotsJson);
    } catch {
      styleSlots = {};
    }
  }

  const totalSlots = Object.values(styleSlots).reduce((acc, v) => acc + (Number(v) || 0), 0);
  const singleStyle = event.styleIds.length === 1;

  return (
    <div
      data-testid={`event-card-${event.id}`}
      className={`px-panel p-4 space-y-3 border-2 border-[var(--outline)] ${
        archived ? 'bg-[var(--night-1)] opacity-75' : 'bg-[var(--night-2)]'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-[16px] text-[var(--text-1)]">{event.name}</h3>
          <p className="font-body text-[14px] text-[var(--text-2)]">
            {TYPE_LABEL[event.type] || event.type} · {event.startDate} → {event.endDate}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {totalSlots > 0 && (
            <span
              className="px-2 py-1 border-2 border-[var(--outline)] bg-[var(--night-3)] font-display text-[12px] text-[var(--neon-cyan)] font-bold shadow-[2px_2px_0_var(--outline)]"
              title={`Total slot capacity set: ${totalSlots}`}
            >
              {singleStyle
                ? `${totalSlots} SLOTS SET (${Math.max(0, totalSlots - event.memberCount)} AVAIL)`
                : `${totalSlots} SLOTS SET`}
            </span>
          )}
          <span className="px-2 py-1 border-2 border-[var(--outline)] bg-[var(--neon-gold)] font-display text-[12px] text-[var(--on-neon)] font-bold shadow-[2px_2px_0_var(--outline)]">
            {event.memberCount} DANCERS
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {event.styleIds.map(id => {
          const style = styles.find(s => s.id === id);
          const slots = styleSlots[id];
          const isFull = event.notifiedFullStyles?.includes(id);
          const avail = slots !== undefined && singleStyle ? Math.max(0, slots - event.memberCount) : undefined;
          return (
            <span
              key={id}
              className="px-2 py-0.5 border-2 border-[var(--outline)] bg-[var(--night-3)] font-display text-[12px] text-[var(--neon-cyan)] font-bold shadow-[1px_1px_0_var(--outline)] flex items-center gap-1.5"
            >
              <span>{style?.name || id}</span>
              {slots !== undefined && slots > 0 ? (
                <span
                  className={`font-mono text-[13px] border-l border-[var(--outline)] pl-1.5 ${
                    isFull ? 'text-[var(--neon-red)] font-bold' : 'text-[var(--neon-gold)] font-bold'
                  }`}
                  title={`${slots} slots set${avail !== undefined ? ` (${avail} available)` : ''}${isFull ? ' (Capacity Reached)' : ''}`}
                >
                  {slots} SLOTS{avail !== undefined ? ` · ${avail} AVAIL` : ''}{isFull ? ' (FULL)' : ''}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>

      <div className="space-y-1.5 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`https://docs.google.com/spreadsheets/d/${event.sourceSheetId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 min-h-[36px] bg-[var(--night-1)] text-[var(--neon-cyan)] border-2 border-[var(--outline)] hover:border-[var(--neon-cyan)] font-display text-[11px] font-bold shadow-[1px_1px_0_var(--outline)]"
          >
            <span>📊</span>
            <span>RESPONSE SHEET ↗</span>
          </a>
          {Boolean(event.formUrl || event.formId) && (
            <a
              href={event.formUrl || (event.formId ? `https://docs.google.com/forms/d/${event.formId}/edit` : '#')}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 min-h-[36px] bg-[var(--night-1)] text-[var(--neon-gold)] border-2 border-[var(--outline)] hover:border-[var(--neon-gold)] font-display text-[11px] font-bold shadow-[1px_1px_0_var(--outline)]"
            >
              <span>📝</span>
              <span>GOOGLE FORM ↗</span>
            </a>
          )}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 min-h-[36px] bg-[var(--night-1)] text-[var(--text-2)] border-2 border-[var(--outline)] font-mono text-[13px]">
            <span>🔄</span>
            <span>SYNCED: {formatKL(event.lastSyncAt)}</span>
          </span>
        </div>
        {event.lastSyncError && (
          <p role="alert" className="font-bold text-sm text-[var(--neon-red)]">
            ⚠ {event.lastSyncError}
          </p>
        )}
        {event.folderMissing && (
          <p className="font-bold text-sm text-[var(--neon-red)] flex flex-wrap items-center gap-2">
            ⚠ Folder missing in Drive.
            <PixelButton size="md" variant="danger" disabled={recreate.isPending} onClick={() => recreate.mutate()}>
              {recreate.isPending ? 'RECREATING…' : 'RECREATE'}
            </PixelButton>
          </p>
        )}
        {note && <p className="font-bold text-sm text-[var(--neon-green)]">{note}</p>}
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t-2 border-[var(--outline)]">
        <PixelButton
          size="md"
          variant="secondary"
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
              variant="secondary"
              disabled={syncFormSlots.isPending}
              onClick={() => syncFormSlots.mutate()}
              title="Synchronize slot limits directly to Google Form"
            >
              {syncFormSlots.isPending ? 'UPDATING FORM…' : 'SYNC FORM'}
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
              {setStatus.isPending ? 'ARCHIVING…' : 'ARCHIVE'}
            </PixelButton>
          </>
        )}
        {archived && (
          <PixelButton size="md" variant="secondary" disabled={setStatus.isPending} onClick={() => setStatus.mutate('events.unarchive')}>
            {setStatus.isPending ? 'UNARCHIVING…' : 'UNARCHIVE'}
          </PixelButton>
        )}
        <PixelButton
          size="md"
          variant="ghost"
          disabled={deleteEvent.isPending}
          onClick={() => {
            setDeleteError(null);
            setShowDeleteConfirm(true);
          }}
          className="!text-[var(--neon-red)] hover:!bg-[var(--violet-2)] border-[var(--neon-red)]"
          title="Permanently delete this event and all associated data"
        >
          DELETE
        </PixelButton>
      </div>

      {/* Double-Confirmation Permanent Deletion Warning Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`delete-event-title-${event.id}`}
            aria-describedby={`delete-event-desc-${event.id}`}
            className="w-full max-w-md bg-[var(--night-1)] border-2 border-[var(--neon-red)] p-5 space-y-4 shadow-[4px_4px_0_var(--outline)]"
          >
            <div className="flex items-center gap-2 border-b-2 border-[var(--outline)] pb-2">
              <span className="text-xl">⚠️</span>
              <h2
                id={`delete-event-title-${event.id}`}
                className="font-display text-sm tracking-wider text-[var(--neon-red)] uppercase font-bold"
              >
                PERMANENT DELETE WARNING
              </h2>
            </div>

            <p id={`delete-event-desc-${event.id}`} className="font-body text-[14px] text-[var(--text-1)] leading-relaxed">
              Are you sure you want to <strong>PERMANENTLY</strong> delete the event{' '}
              <span className="text-[var(--neon-cyan)]">"{event.name}"</span>?
            </p>

            <div className="bg-[var(--night-2)] p-3 border border-[var(--neon-red)] font-mono text-xs text-[var(--neon-red)] space-y-1">
              <p className="font-bold">🚨 THIS ACTION CANNOT BE UNDONE:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[var(--text-2)]">
                <li>Permanently deletes all class sessions & attendance sheets</li>
                <li>Removes event enrollment links from registered dancers</li>
                <li>Moves linked Google Drive folders and sheets to Trash</li>
              </ul>
            </div>

            {deleteError && (
              <p role="alert" className="font-body text-xs text-[var(--neon-red)] font-bold">
                ⚠ {deleteError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t-2 border-[var(--outline)]">
              <PixelButton
                size="md"
                variant="ghost"
                disabled={deleteEvent.isPending}
                onClick={() => setShowDeleteConfirm(false)}
              >
                CANCEL
              </PixelButton>
              <PixelButton
                size="md"
                variant="primary"
                disabled={deleteEvent.isPending}
                onClick={() => deleteEvent.mutate()}
                className="!bg-[var(--neon-red)] !text-white hover:brightness-110"
              >
                {deleteEvent.isPending ? 'DELETING…' : 'CONFIRM DELETE'}
              </PixelButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
