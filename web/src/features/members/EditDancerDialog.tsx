import React, { useMemo, useState } from 'react';
import type { DanceStyle, EventListItem, Member } from '@umdsc/shared';
import { call, errorMessage } from '../../lib/api';
import { Sheet } from '../../components/ui/Sheet';
import { Field } from '../../components/ui/Field';
import { PixelButton } from '../../components/ui/PixelButton';
import { PixelTrashIcon } from '../../components/ui/pixelIcons';
import { DANCER_FIELDS, DancerClassChecklist, DancerFieldKey } from './DancerClassChecklist';

export interface EditDancerDialogProps {
  member: Member & { eventStylesMap?: Record<string, string[]> };
  /** The events whose registration forms hold this dancer's responses. */
  eventIds: string[];
  events?: EventListItem[];
  styles?: DanceStyle[];
  onClose: () => void;
  onSaved: () => void;
}

function buildInitialStylesByEvent(
  editableEvents: EventListItem[],
  member: EditDancerDialogProps['member']
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const ev of editableEvents) {
    const mapped = member.eventStylesMap?.[ev.id];
    const base =
      mapped !== undefined
        ? mapped.filter((sid) => ev.styleIds.includes(sid))
        : (member.styleIds || []).filter((sid) => ev.styleIds.includes(sid));
    const unique = Array.from(new Set(base));
    map[ev.id] = unique.length > 0 ? unique : ev.styleIds.length === 1 ? [ev.styleIds[0]] : [];
  }
  return map;
}

/**
 * Corrects a dancer's details and dance class selections in the registration form's
 * response sheet (every response of theirs in each event), then syncs so the dancer
 * list, attendance, and sign-in all follow. Also allows removing a dancer from the event.
 */
export const EditDancerDialog: React.FC<EditDancerDialogProps> = ({
  member,
  eventIds,
  events,
  styles = [],
  onClose,
  onSaved
}) => {
  const editableEvents = useMemo(
    () => (events || []).filter((e) => eventIds.includes(e.id) && e.status !== 'archived'),
    [events, eventIds]
  );

  const [initialStylesByEvent] = useState<Record<string, string[]>>(() =>
    buildInitialStylesByEvent(editableEvents, member)
  );
  const [stylesByEvent, setStylesByEvent] = useState<Record<string, string[]>>(
    () => initialStylesByEvent
  );

  const [values, setValues] = useState<Record<DancerFieldKey, string>>(() => ({
    fullName: member.fullName || '',
    matricRaw: member.matricRaw || '',
    contact: member.contact || '',
    email: member.email || '',
    gender: member.gender || '',
    nationality: member.nationality || ''
  }));
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const changed = DANCER_FIELDS.filter(
    ({ key }) => values[key].trim() !== String(member[key] || '').trim()
  );

  const stylesChangedForEvent = (evId: string): boolean => {
    const curr = stylesByEvent[evId];
    const init = initialStylesByEvent[evId];
    if (!curr || !init) return false;
    if (curr.length !== init.length) return true;
    const initSet = new Set(init);
    return curr.some((id) => !initSet.has(id));
  };

  const toggleEventStyle = (evId: string, styleId: string) => {
    setStylesByEvent((prev) => {
      const current = prev[evId] || [];
      const next = current.includes(styleId)
        ? current.filter((id) => id !== styleId)
        : [...current, styleId];
      return { ...prev, [evId]: next };
    });
  };

  const save = async () => {
    for (const ev of editableEvents) {
      if ((stylesByEvent[ev.id] || []).length === 0) {
        setError('Select at least one dance class, or use REMOVE FROM EVENT below to remove this dancer.');
        return;
      }
    }

    const anyStylesChanged = editableEvents.some((ev) => stylesChangedForEvent(ev.id));
    if (changed.length === 0 && !anyStylesChanged) {
      onClose();
      return;
    }

    const patch = Object.fromEntries(changed.map(({ key }) => [key, values[key].trim()]));
    setSaving(true);
    setError('');
    try {
      for (const eventId of eventIds) {
        const stylePatch = stylesChangedForEvent(eventId)
          ? { styleIds: stylesByEvent[eventId] }
          : {};
        if (Object.keys(patch).length === 0 && Object.keys(stylePatch).length === 0) continue;
        await call('members.edit', { eventId, memberId: member.memberId, ...patch, ...stylePatch });
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const removeFromEvents = async () => {
    setSaving(true);
    setError('');
    try {
      for (const eventId of eventIds) {
        await call('members.remove', { eventId, memberId: member.memberId });
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet isOpen onClose={onClose} title={`EDIT ${member.fullName || 'DANCER'}`}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p className="font-body text-[14px] text-[var(--text-2)]">
          Saving writes these details and dance class selections into the registration form&apos;s response sheet,
          then syncs, so the dancer list, attendance and the dancer&apos;s sign-in all follow.
        </p>

        {DANCER_FIELDS.map(({ key, label }) => (
          <Field
            key={key}
            id={`edit-dancer-${key}`}
            label={label}
            value={values[key]}
            autoCapitalize={key === 'fullName' ? 'words' : 'off'}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          />
        ))}

        {editableEvents.map((ev) => (
          <DancerClassChecklist
            key={ev.id}
            heading={editableEvents.length > 1 ? `DANCE CLASSES — ${ev.name}` : 'DANCE CLASSES'}
            event={ev}
            styles={styles}
            selectedStyleIds={stylesByEvent[ev.id] || []}
            fallbackNames={member.styleNames}
            fullBadgeLabel="FULL — ADMIN OVERRIDE"
            idPrefix={`edit-dancer-${ev.id}`}
            onToggle={(styleId) => toggleEventStyle(ev.id, styleId)}
          />
        ))}

        {error && (
          <p role="alert" className="font-body text-[14px] font-bold text-[var(--neon-red)]">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2 justify-end pt-2 border-t-2 border-[var(--outline)]">
          <PixelButton type="button" variant="secondary" onClick={onClose} disabled={saving}>
            CANCEL
          </PixelButton>
          <PixelButton type="submit" disabled={saving}>
            {saving ? 'SAVING…' : 'SAVE TO FORM SHEET'}
          </PixelButton>
        </div>

        <div className="pt-3 border-t-2 border-dashed border-[var(--outline)] space-y-3">
          {!confirmingRemove ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-body text-[13px] text-[var(--text-2)]">
                Quit event? Remove this dancer from the form sheet &amp; attendance.
              </span>
              <PixelButton
                type="button"
                variant="danger"
                disabled={saving}
                onClick={() => {
                  setError('');
                  setConfirmingRemove(true);
                }}
                className="flex items-center"
              >
                <PixelTrashIcon className="w-4 h-4 mr-1.5" />
                <span>REMOVE FROM EVENT</span>
              </PixelButton>
            </div>
          ) : (
            <div
              data-testid="confirm-remove-dancer"
              className="border-2 border-[var(--neon-red)] bg-[var(--night-1)] p-3 space-y-3 shadow-[2px_2px_0_var(--outline)]"
            >
              <p className="font-body text-[14px] text-[var(--text-1)]">
                Removing <strong className="text-[var(--neon-gold)]">{member.fullName}</strong> deletes their response
                from the Google Form response sheet, attendance list, and event database.
              </p>
              <div className="flex flex-wrap gap-2 justify-end">
                <PixelButton
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => setConfirmingRemove(false)}
                >
                  CANCEL
                </PixelButton>
                <PixelButton
                  type="button"
                  variant="danger"
                  disabled={saving}
                  onClick={() => void removeFromEvents()}
                >
                  {saving ? 'REMOVING…' : 'CONFIRM REMOVE'}
                </PixelButton>
              </div>
            </div>
          )}
        </div>
      </form>
    </Sheet>
  );
};
