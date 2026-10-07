import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClassSession, EventItem } from '@umdsc/shared';
import { call, errorMessage } from '../../../lib/api';
import { PixelButton } from '../../../components/ui/PixelButton';
import { effectiveInstructorId, flattenSchedule } from '../eventDraft';
import { useCurrentEvent } from '../useCurrentEvent';
import type { StepProps } from '../EventWizard';

const TYPE_LABEL: Record<string, string> = { monthly: 'Monthly class', trial: 'Trial class', workshop: 'Workshop', other: 'Other' };

export const ReviewStep: React.FC<StepProps> = ({ draft, onBack, isEdit, event, styles, instructors }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setCurrentId } = useCurrentEvent();
  const [error, setError] = useState<string | null>(null);

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await call<Record<string, string>>('settings.get')).data || {}
  });
  const noMaster = !settingsLoading && !settings?.defaultAttendanceFolderId;

  const classes = flattenSchedule(draft);
  const fields = {
    name: draft.name.trim(),
    type: draft.type,
    startDate: draft.startDate,
    endDate: draft.endDate,
    columnMap: draft.columnMap,
    classIndex: draft.classIndex,
    styleIds: draft.styleIds,
    styleInstructors: draft.styleInstructors
  };

  // A class with no instructor of its own is saved with its style's first listed one.
  const instructorOf = (c: (typeof classes)[number]) => effectiveInstructorId(c, draft.styleInstructors[c.styleId] || []);
  const instructorNames = (styleId: string) =>
    (draft.styleInstructors[styleId] || []).map(id => instructors.find(i => i.id === id)?.name || id).join(', ');

  // Stays in SAVING/CREATING until the lists hold the new event, so the old one never flashes.
  const finish = async (eventId: string) => {
    await Promise.all(
      ['events', 'sessions', 'members', 'attendance', 'bootstrap'].map(key => queryClient.invalidateQueries({ queryKey: [key] }))
    );
    setCurrentId(eventId);
    navigate('/admin/events');
  };

  const create = useMutation({
    mutationFn: async () =>
      (
        await call<{ event: EventItem }>('events.create', {
          ...fields,
          sheetUrl: draft.sheetUrl.trim(),
          sessions: classes.map(c => ({
            styleId: c.styleId,
            seq: c.seq,
            date: c.date,
            start: c.start,
            end: c.end,
            venue: c.venue || '',
            instructorId: instructorOf(c)
          }))
        })
      ).data,
    onSuccess: r => finish(r.event.id),
    onError: err => setError(errorMessage(err))
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!event) throw new Error('Event not loaded');
      // 1. Delete removed classes first, so a shorter date range is accepted
      const existing = (await call<ClassSession[]>('sessions.list', { eventId: event.id })).data;
      const keptIds = new Set(classes.map(c => c.id).filter(Boolean));
      for (const s of existing.filter(s => !keptIds.has(s.id))) {
        await call('sessions.delete', { id: s.id, version: s.version });
      }
      // 2. The event itself (a new form link only when it changed)
      const originalUrl = `https://docs.google.com/spreadsheets/d/${event.sourceSheetId}/edit`;
      await call('events.update', {
        id: event.id,
        version: event.version,
        ...fields,
        ...(draft.sheetUrl.trim() !== originalUrl ? { sheetUrl: draft.sheetUrl.trim() } : {})
      });
      // 3. Remaining and new classes, then attendance sheet columns
      if (classes.length > 0) {
        await call('sessions.batchUpsert', {
          sessions: classes.map(c => ({
            id: c.id,
            eventId: event.id,
            styleId: c.styleId,
            seq: c.seq,
            date: c.date,
            start: c.start,
            end: c.end,
            venue: c.venue || '',
            instructorId: instructorOf(c),
            status: c.status || 'scheduled'
          }))
        });
      }
      await call('attendance.ensureSheets', { eventId: event.id });
      return event.id;
    },
    onSuccess: finish,
    onError: err => setError(errorMessage(err))
  });

  const busy = create.isPending || save.isPending;
  const dancerCount = draft.preview?.rowCount ?? event?.memberCount ?? 0;

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-4 gap-y-2 font-body text-[16px] text-[var(--text-1)]">
        <dt className="font-display text-[12px] pt-1 text-[var(--text-2)]">NAME</dt>
        <dd className="font-bold">{fields.name}</dd>
        <dt className="font-display text-[12px] pt-1 text-[var(--text-2)]">TYPE</dt>
        <dd>{TYPE_LABEL[fields.type]}</dd>
        <dt className="font-display text-[12px] pt-1 text-[var(--text-2)]">DATES</dt>
        <dd>
          {fields.startDate} → {fields.endDate}
        </dd>
        <dt className="font-display text-[12px] pt-1 text-[var(--text-2)]">DANCERS</dt>
        <dd>{dancerCount}</dd>
        <dt className="font-display text-[12px] pt-1 text-[var(--text-2)]">FORM</dt>
        <dd className="break-all font-mono text-[14px] text-[var(--neon-cyan)]">{draft.sheetUrl}</dd>
        <dt className="font-display text-[12px] pt-1 text-[var(--text-2)]">STYLES</dt>
        <dd>
          <ul className="space-y-1">
            {draft.styleIds.map(id => (
              <li key={id}>
                {styles.find(s => s.id === id)?.name || id}: {(draft.schedule[id] || []).length} classes
                {instructorNames(id) && (
                  <>
                    {' — '}
                    <span className="text-[var(--neon-cyan)]">{instructorNames(id)}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </dd>
      </dl>

      {!isEdit && noMaster && (
        <p role="alert" className="p-3 border-2 border-[var(--neon-red)] bg-[var(--night-1)] font-body font-bold text-[14px] text-[var(--neon-red)]">
          Set the attendance master folder on the Events page first.{' '}
          <Link to="/admin/events" className="underline text-[var(--neon-cyan)]">
            Go to Events
          </Link>
        </p>
      )}
      {error && (
        <p role="alert" className="p-3 border-2 border-[var(--neon-red)] bg-[var(--night-1)] font-body font-bold text-[14px] text-[var(--neon-red)]">
          {error}
        </p>
      )}

      <div className="flex justify-between pt-3 border-t-2 border-[var(--outline)]">
        <PixelButton size="md" variant="secondary" disabled={busy} onClick={onBack}>
          BACK
        </PixelButton>
        {isEdit ? (
          <PixelButton size="md" variant="primary" disabled={busy} onClick={() => save.mutate()}>
            {save.isPending ? 'SAVING…' : 'SAVE CHANGES'}
          </PixelButton>
        ) : (
          <PixelButton size="md" variant="primary" disabled={busy || noMaster || settingsLoading} onClick={() => create.mutate()}>
            {create.isPending ? 'CREATING…' : 'CREATE EVENT'}
          </PixelButton>
        )}
      </div>
    </div>
  );
};
