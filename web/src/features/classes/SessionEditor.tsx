import React, { useState, useEffect } from 'react';
import { call, ApiError, errorMessage } from '../../lib/api';
import { Sheet } from '../../components/ui/Sheet';
import { Field } from '../../components/ui/Field';
import { PixelButton } from '../../components/ui/PixelButton';
import { TimePicker } from '../../components/ui/TimePicker';
import { getInstructorPhotoUrl } from '../../lib/instructorPhotos';
import type { ClassSession, Instructor, DanceStyle } from '@umdsc/shared';

export interface SessionEditorProps {
  isOpen: boolean;
  onClose: () => void;
  session: ClassSession | null;
  styles: DanceStyle[];
  instructors: Instructor[];
  /** Event dates: the date picker only allows days inside the event. */
  minDate?: string;
  maxDate?: string;
  onSaved: () => void;
}

export const SessionEditor: React.FC<SessionEditorProps> = ({
  isOpen,
  onClose,
  session,
  styles,
  instructors,
  minDate,
  maxDate,
  onSaved
}) => {
  const [date, setDate] = useState('');
  const [start, setStart] = useState('20:00');
  const [end, setEnd] = useState('22:00');
  const [instructorId, setInstructorId] = useState('');
  const [venue, setVenue] = useState('');
  const [status, setStatus] = useState<'scheduled' | 'replacement' | 'cancelled'>('scheduled');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Version conflict state
  const [conflictData, setConflictData] = useState<any>(null);

  useEffect(() => {
    if (session) {
      setDate(session.date || '');
      setStart(session.start || '20:00');
      setEnd(session.end || '22:00');
      // Fall back to style's default instructor if session has none
      const sessionStyle = styles.find((s) => s.id === session.styleId);
      setInstructorId(session.instructorId || sessionStyle?.defaultInstructorId || '');
      setVenue(session.venue || '');
      setStatus(session.status || 'scheduled');
      setNote(session.note || '');
      setError(null);
      setConflictData(null);
    }
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session) return null;

  const styleObj = styles.find((s) => s.id === session.styleId);
  const title = `EDIT ${styleObj?.name?.toUpperCase() || 'CLASS'} SESSION ${session.seq}`;

  const handleSubmit = async (overrideVersion?: number) => {
    setLoading(true);
    setError(null);

    const versionToUse = overrideVersion !== undefined ? overrideVersion : session.version;

    try {
      await call('sessions.update', {
        id: session.id,
        version: versionToUse,
        date,
        start,
        end,
        instructorId,
        venue,
        status,
        note
      });

      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        setConflictData(err.latest);
        setError(`Changed by ${(err.latest as any)?.updatedBy || 'someone else'} at ${(err.latest as any)?.updatedAt || 'recent time'}`);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${styleObj?.name || ''} class #${session.seq} on ${session.date}? It will disappear from every page.`)) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await call('sessions.delete', { id: session.id, version: session.version });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReload = () => {
    if (conflictData) {
      setDate(conflictData.date || date);
      setStart(conflictData.start || start);
      setEnd(conflictData.end || end);
      setInstructorId(conflictData.instructorId || instructorId);
      setVenue(conflictData.venue || venue);
      setStatus(conflictData.status || status);
      setNote(conflictData.note || note);
      setConflictData(null);
      setError(null);
    }
  };

  const handleOverwrite = () => {
    if (conflictData?.version) {
      handleSubmit(conflictData.version);
    }
  };

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="space-y-4"
      >
        {/* Version conflict alert */}
        {conflictData && (
          <div
            role="alert"
            className="p-3 bg-[var(--c-peach)] border-4 border-[var(--c-red)] text-[var(--c-red)] text-xs font-body font-bold space-y-2"
          >
            <p>
              Changed by {conflictData.updatedBy || 'another user'} at {conflictData.updatedAt || 'another time'}.
              Reload latest changes or overwrite with your edits?
            </p>
            <div className="flex gap-2 pt-1">
              <PixelButton
                variant="secondary"
                size="md"
                type="button"
                onClick={handleReload}
                disabled={loading}
              >
                RELOAD
              </PixelButton>
              <PixelButton
                variant="danger"
                size="md"
                type="button"
                onClick={handleOverwrite}
                disabled={loading}
              >
                OVERWRITE
              </PixelButton>
            </div>
          </div>
        )}

        {error && !conflictData && (
          <div
            role="alert"
            className="p-3 bg-[var(--c-peach)] border-2 border-[var(--c-red)] text-[var(--c-red)] text-xs font-body font-bold"
          >
            {error}
          </div>
        )}

        {/* Date Field */}
        <Field
          label="Date"
          type="date"
          value={date}
          min={minDate}
          max={maxDate}
          onChange={(e) => setDate(e.target.value)}
          disabled={loading}
          helper={minDate && maxDate ? `Inside the event: ${minDate} to ${maxDate}` : undefined}
          required
        />

        {/* Start and End Times */}
        <div className="space-y-2">
          <label className="block font-display text-xs text-[var(--text-1)] uppercase">
            Start Time
          </label>
          <TimePicker value={start} onChange={setStart} />
        </div>

        <div className="space-y-2">
          <label className="block font-display text-xs text-[var(--text-1)] uppercase">
            End Time
          </label>
          <TimePicker value={end} onChange={setEnd} />
        </div>

        {/* Instructor Select with Photo Preview */}
        <div>
          <label
            htmlFor="instructor-select"
            className="block font-display text-xs text-[var(--text-1)] mb-1 uppercase"
          >
            Instructor
          </label>
          <div className="flex items-start gap-2">
            {(() => {
              const selectedInst = instructors.find((i) => i.id === instructorId);
              const photoUrl = getInstructorPhotoUrl(selectedInst);
              return photoUrl ? (
                <img
                  src={photoUrl}
                  alt={selectedInst?.name || 'Instructor'}
                  className="w-11 h-[55px] object-cover border-2 border-[var(--c-ink)] flex-shrink-0"
                  loading="lazy"
                />
              ) : (
                <span className="w-11 h-[55px] flex items-center justify-center bg-[var(--c-bg)] border-2 border-[var(--c-ink)] font-display text-sm text-[var(--text-2)] flex-shrink-0">👤</span>
              );
            })()}
            <select
              id="instructor-select"
              value={instructorId}
              onChange={(e) => setInstructorId(e.target.value)}
              disabled={loading}
              className="w-full min-h-[44px] px-3 bg-[var(--c-panel)] border-2 border-[var(--c-ink)] font-body text-base text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--c-yellow)]"
            >
              <option value="">Select Instructor...</option>
              {instructors.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name}
                </option>
              ))}
            </select>
          </div>
          {instructorId && styleObj?.defaultInstructorId && instructorId === styleObj.defaultInstructorId && (
            <p className="font-body text-[9px] text-[var(--text-2)] mt-1">Default instructor for {styleObj.name}</p>
          )}
        </div>

        {/* Venue Field */}
        <Field
          label="Venue"
          type="text"
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          placeholder="e.g. Dance Room 1"
          disabled={loading}
        />

        {/* Status Select */}
        <div>
          <label
            htmlFor="status-select"
            className="block font-display text-xs text-[var(--text-1)] mb-1 uppercase"
          >
            Session Status
          </label>
          <select
            id="status-select"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            disabled={loading}
            className="w-full min-h-[44px] px-3 bg-[var(--c-panel)] border-2 border-[var(--c-ink)] font-body text-base text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--c-yellow)]"
          >
            <option value="scheduled">Scheduled</option>
            <option value="replacement">Replacement</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* Note Field */}
        <Field
          label="Note"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional notes or details"
          disabled={loading}
        />

        <div className="pt-2 flex gap-2">
          <PixelButton
            variant="primary"
            size="lg"
            type="submit"
            disabled={loading}
            className="flex-1"
          >
            {loading ? 'SAVING...' : 'SAVE CHANGES'}
          </PixelButton>

          <PixelButton
            variant="secondary"
            size="lg"
            type="button"
            onClick={onClose}
            disabled={loading}
          >
            CANCEL
          </PixelButton>
        </div>

        <div className="pt-2 border-t-2 border-[var(--c-ink)]">
          <PixelButton
            variant="danger"
            size="md"
            type="button"
            onClick={handleDelete}
            disabled={loading}
          >
            DELETE THIS CLASS
          </PixelButton>
          <p className="font-body text-xs text-[var(--text-2)] mt-1">
            For a class added by mistake. To keep a class on the schedule but mark it as not
            happening, set Status to Cancelled instead.
          </p>
        </div>
      </form>
    </Sheet>
  );
};
