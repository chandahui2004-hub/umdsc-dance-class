import React, { useEffect, useMemo, useState } from 'react';
import { call, errorMessage } from '../../lib/api';
import { Sheet } from '../../components/ui/Sheet';
import { Field } from '../../components/ui/Field';
import { PixelButton } from '../../components/ui/PixelButton';
import { TimePicker } from '../../components/ui/TimePicker';
import type { ClassSession, DanceStyle, EventListItem, Instructor, ISODate } from '@umdsc/shared';

export interface AddClassDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** The day tapped on the calendar; the admin can change it. */
  date: ISODate;
  /** Active events the class can go into; more than one shows an Event choice. */
  events: EventListItem[];
  initialEventId: string;
  styles: DanceStyle[];
  instructors: Instructor[];
  /** Existing classes, to number the new one after the style's last class. */
  sessions: ClassSession[];
  /** Reloads the calendar; the dialog stays in ADDING until it resolves. */
  onAdded: () => unknown;
}

const selectClass =
  'w-full min-h-[48px] px-3 bg-[var(--night-1)] border-2 border-[var(--outline)] px-well font-body text-[16px] text-[var(--text-1)]';
const labelClass = 'block font-display text-[12px] text-[var(--text-1)] mb-1 uppercase';

/** ADD A CLASS: dance style, instructor and times are required; venue and note start from the style's usual values. */
export const AddClassDialog: React.FC<AddClassDialogProps> = ({
  isOpen,
  onClose,
  date: initialDate,
  events,
  initialEventId,
  styles,
  instructors,
  sessions,
  onAdded
}) => {
  const [eventId, setEventId] = useState(initialEventId);
  const [date, setDate] = useState<ISODate>(initialDate);
  const [styleId, setStyleId] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [start, setStart] = useState('20:00');
  const [end, setEnd] = useState('22:00');
  const [venue, setVenue] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const event = events.find(e => e.id === eventId) || null;
  const eventStyles = useMemo(
    () => (event ? event.styleIds.map(id => styles.find(s => s.id === id)).filter((s): s is DanceStyle => Boolean(s)) : []),
    [event, styles]
  );
  const style = eventStyles.find(s => s.id === styleId);
  // Only the instructors this event lists for the style
  const styleInstructors = useMemo(
    () =>
      ((event?.styleInstructors || {})[styleId] ?? [])
        .map(id => instructors.find(i => i.id === id))
        .filter((i): i is Instructor => Boolean(i)),
    [event, styleId, instructors]
  );

  // Fresh form each time it opens
  useEffect(() => {
    if (!isOpen) return;
    setEventId(initialEventId);
    setDate(initialDate);
    setStyleId(''); // re-picks the first style, which refills times, venue and instructor
    setNote('');
    setError(null);
  }, [isOpen, initialEventId, initialDate]);

  // A new event starts on its first style
  useEffect(() => {
    if (!isOpen) return;
    setStyleId(prev => (eventStyles.some(s => s.id === prev) ? prev : eventStyles[0]?.id || ''));
  }, [isOpen, eventStyles]);

  // A new style brings its usual times, venue and first instructor
  useEffect(() => {
    if (!isOpen) return;
    setStart(style?.defaultStart || '20:00');
    setEnd(style?.defaultEnd || '22:00');
    setVenue(style?.defaultVenue || '');
  }, [isOpen, style?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- only when the style changes, not on refetch
  useEffect(() => {
    if (!isOpen) return;
    setInstructorId(prev => (styleInstructors.some(i => i.id === prev) ? prev : styleInstructors[0]?.id || ''));
  }, [isOpen, styleInstructors]);

  const insideEvent = Boolean(event && date >= event.startDate && date <= event.endDate);
  const timesValid = Boolean(start && end && end > start);
  const canAdd = Boolean(event && insideEvent && styleId && instructorId && timesValid) && !adding;

  const handleAdd = async () => {
    if (!canAdd || !event) return;
    setAdding(true);
    setError(null);
    try {
      const nextSeq =
        sessions
          .filter(s => s.active && s.eventId === event.id && s.styleId === styleId)
          .reduce((m, s) => Math.max(m, s.seq), 0) + 1;
      await call<ClassSession>('sessions.create', {
        eventId: event.id,
        styleId,
        seq: nextSeq,
        date,
        start,
        end,
        instructorId,
        venue: venue.trim(),
        note: note.trim()
      });
      await onAdded();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  return (
    <Sheet isOpen={isOpen} onClose={adding ? () => undefined : onClose} title="ADD A CLASS">
      <form
        onSubmit={e => {
          e.preventDefault();
          void handleAdd();
        }}
        className="space-y-4"
      >
        {error && (
          <div
            role="alert"
            className="p-3 bg-[var(--night-1)] border-2 border-[var(--neon-red)] text-[var(--neon-red)] text-[12px] font-body font-bold"
          >
            {error}
          </div>
        )}

        {events.length > 1 && (
          <div>
            <label htmlFor="add-class-event" className={labelClass}>
              Event *
            </label>
            <select id="add-class-event" value={eventId} onChange={e => setEventId(e.target.value)} disabled={adding} className={selectClass}>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <Field
          label="Date *"
          type="date"
          value={date}
          min={event?.startDate}
          max={event?.endDate}
          onChange={e => setDate(e.target.value)}
          disabled={adding}
          helper={event ? `Inside the event: ${event.startDate} to ${event.endDate}` : undefined}
          required
        />
        {event && !insideEvent && (
          <p role="alert" className="font-body text-[14px] font-bold text-[var(--neon-red)]">
            {date} is outside {event.name} ({event.startDate} to {event.endDate}).
          </p>
        )}

        <div>
          <label htmlFor="add-class-style" className={labelClass}>
            Dance Style *
          </label>
          <select id="add-class-style" value={styleId} onChange={e => setStyleId(e.target.value)} disabled={adding} className={selectClass} required>
            {eventStyles.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="add-class-instructor" className={labelClass}>
            Instructor *
          </label>
          {styleInstructors.length > 0 ? (
            <select
              id="add-class-instructor"
              value={instructorId}
              onChange={e => setInstructorId(e.target.value)}
              disabled={adding}
              className={selectClass}
              required
            >
              {styleInstructors.map(i => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          ) : (
            <p role="alert" className="font-body text-[14px] font-bold text-[var(--neon-red)]">
              No instructor teaches {style?.name || 'this style'} in this event yet — add one in Events › Edit.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <span className={labelClass}>Start Time *</span>
          <TimePicker value={start} onChange={setStart} />
        </div>
        <div className="space-y-2">
          <span className={labelClass}>End Time *</span>
          <TimePicker value={end} onChange={setEnd} />
          {!timesValid && (
            <p className="font-body text-[14px] font-bold text-[var(--neon-red)]">The end time must be after the start time.</p>
          )}
        </div>

        <Field
          label="Venue"
          type="text"
          value={venue}
          onChange={e => setVenue(e.target.value)}
          placeholder="e.g. Dance Room 1"
          disabled={adding}
        />
        <Field
          label="Note"
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Optional notes or details"
          disabled={adding}
        />

        <div className="pt-2 flex gap-2">
          <PixelButton variant="primary" size="lg" type="submit" disabled={!canAdd} className="flex-1">
            {adding ? 'ADDING…' : 'ADD CLASS'}
          </PixelButton>
          <PixelButton variant="secondary" size="lg" type="button" onClick={onClose} disabled={adding}>
            CANCEL
          </PixelButton>
        </div>
      </form>
    </Sheet>
  );
};
