import React, { useMemo, useState } from 'react';
import type { DanceStyle, EventListItem } from '@umdsc/shared';
import { call, errorMessage } from '../../lib/api';
import { Sheet } from '../../components/ui/Sheet';
import { Field } from '../../components/ui/Field';
import { PixelButton } from '../../components/ui/PixelButton';
import { DANCER_FIELDS, DancerClassChecklist, DancerFieldKey } from './DancerClassChecklist';

export interface AddDancerDialogProps {
  events: EventListItem[];
  styles: DanceStyle[];
  defaultEventId?: string;
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY_VALUES: Record<DancerFieldKey, string> = {
  fullName: '',
  matricRaw: '',
  contact: '',
  email: '',
  gender: '',
  nationality: ''
};

/**
 * Registers a new dancer directly into an active event's Google Form response sheet
 * and triggers an immediate full sync so roster, attendance, and dancer login update.
 */
export const AddDancerDialog: React.FC<AddDancerDialogProps> = ({
  events,
  styles,
  defaultEventId,
  onClose,
  onSaved
}) => {
  const openEvents = useMemo(() => events.filter((e) => e.status !== 'archived'), [events]);

  const [selectedEventId, setSelectedEventId] = useState<string>(() =>
    defaultEventId && openEvents.some((e) => e.id === defaultEventId)
      ? defaultEventId
      : openEvents[0]?.id || ''
  );

  const selectedEvent = useMemo(
    () => openEvents.find((e) => e.id === selectedEventId) || openEvents[0] || null,
    [openEvents, selectedEventId]
  );

  const [values, setValues] = useState<Record<DancerFieldKey, string>>(EMPTY_VALUES);
  const [selectedStyleIds, setSelectedStyleIds] = useState<string[]>(() => {
    const initial =
      (defaultEventId && openEvents.find((e) => e.id === defaultEventId)) || openEvents[0];
    return initial?.styleIds.length === 1 ? [initial.styleIds[0]] : [];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleEventChange = (nextEventId: string) => {
    setSelectedEventId(nextEventId);
    const nextEvent = openEvents.find((e) => e.id === nextEventId);
    if (!nextEvent) {
      setSelectedStyleIds([]);
      return;
    }
    if (nextEvent.styleIds.length === 1) {
      setSelectedStyleIds([nextEvent.styleIds[0]]);
    } else {
      setSelectedStyleIds((prev) => prev.filter((id) => nextEvent.styleIds.includes(id)));
    }
  };

  const toggleStyle = (styleId: string) => {
    setSelectedStyleIds((prev) =>
      prev.includes(styleId) ? prev.filter((id) => id !== styleId) : [...prev, styleId]
    );
  };

  const submit = async () => {
    if (!selectedEvent) {
      setError('No active event available for registration');
      return;
    }
    if (!values.fullName.trim()) {
      setError('Full name is required');
      return;
    }
    if (!values.matricRaw.trim()) {
      setError('Matric number is required');
      return;
    }
    if (selectedStyleIds.length === 0) {
      setError('Select at least one dance class');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await call('members.add', {
        eventId: selectedEvent.id,
        fullName: values.fullName.trim(),
        matricRaw: values.matricRaw.trim(),
        contact: values.contact.trim(),
        email: values.email.trim(),
        gender: values.gender.trim(),
        nationality: values.nationality.trim(),
        styleIds: selectedStyleIds
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet isOpen onClose={onClose} title="ADD NEW DANCER">
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="font-body text-[14px] text-[var(--text-2)]">
          Adds this dancer directly to the event&apos;s Google Form response sheet and syncs attendance, database, and sign-in immediately.
          Full classes remain closed on the public form.
        </p>

        {openEvents.length > 1 ? (
          <div className="flex flex-col gap-2 w-full">
            <label
              htmlFor="add-dancer-event"
              className="font-display text-[10px] text-[var(--text-2)] tracking-wider uppercase"
            >
              Target event
            </label>
            <select
              id="add-dancer-event"
              value={selectedEvent?.id || ''}
              onChange={(e) => handleEventChange(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 px-well text-[16px] font-body text-[var(--text-1)] bg-[var(--night-1)]"
            >
              {openEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </div>
        ) : selectedEvent ? (
          <div className="px-3 py-2 border-2 border-[var(--outline)] bg-[var(--night-1)] font-body text-[14px] text-[var(--text-2)]">
            Event: <strong className="text-[var(--neon-cyan)]">{selectedEvent.name}</strong>
          </div>
        ) : null}

        {DANCER_FIELDS.map(({ key, label, required }) => (
          <Field
            key={key}
            id={`add-dancer-${key}`}
            label={required ? `${label} *` : label}
            required={required}
            value={values[key]}
            autoCapitalize={key === 'fullName' ? 'words' : 'off'}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          />
        ))}

        {selectedEvent && (
          <DancerClassChecklist
            heading="DANCE CLASSES"
            event={selectedEvent}
            styles={styles}
            selectedStyleIds={selectedStyleIds}
            fullBadgeLabel="FULL — ADMIN OVERRIDE (FORM STAYS CLOSED)"
            idPrefix="add-dancer"
            onToggle={toggleStyle}
          />
        )}

        {error && (
          <p role="alert" className="font-body text-[14px] font-bold text-[var(--neon-red)]">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2 justify-end pt-2 border-t-2 border-[var(--outline)]">
          <PixelButton type="button" variant="secondary" onClick={onClose} disabled={saving}>
            CANCEL
          </PixelButton>
          <PixelButton type="submit" disabled={saving || !selectedEvent}>
            {saving ? 'ADDING…' : 'ADD DANCER'}
          </PixelButton>
        </div>
      </form>
    </Sheet>
  );
};
