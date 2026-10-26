import React, { useState, useEffect } from 'react';
import { call, ApiError, errorMessage } from '../../lib/api';
import { queryClient } from '../../lib/queryClient';
import { invalidateSessionCaches } from '../../lib/cacheInvalidation';
import { Sheet } from '../../components/ui/Sheet';
import { Field } from '../../components/ui/Field';
import { PixelButton } from '../../components/ui/PixelButton';
import { TimePicker } from '../../components/ui/TimePicker';
import { getInstructorPhotoUrl, getDriveThumbnailUrl } from '../../lib/instructorPhotos';
import type { ClassSession, Instructor, DanceStyle } from '@umdsc/shared';

export interface SessionEditorProps {
  isOpen: boolean;
  onClose: () => void;
  session: ClassSession | null;
  styles: DanceStyle[];
  instructors: Instructor[];
  /** Instructors the event lists for this class's style; the drop-down offers only these. */
  allowedInstructorIds: string[];
  /** Event dates: the date picker only allows days inside the event. */
  minDate?: string;
  maxDate?: string;
  /** Reloads the class list; the editor stays in SAVING until it resolves. */
  onSaved: () => unknown;
}

export const SessionEditor: React.FC<SessionEditorProps> = ({
  isOpen,
  onClose,
  session,
  styles,
  instructors,
  allowedInstructorIds,
  minDate,
  maxDate,
  onSaved
}) => {
  const [date, setDate] = useState(session?.date || '');
  const [start, setStart] = useState(session?.start || '20:00');
  const [end, setEnd] = useState(session?.end || '22:00');
  const [instructorId, setInstructorId] = useState(session?.instructorId || '');
  const [venue, setVenue] = useState(session?.venue || '');
  const [status, setStatus] = useState<'scheduled' | 'replacement' | 'cancelled'>(session?.status || 'scheduled');
  const [note, setNote] = useState(session?.note || '');
  const [currentWalkInCode, setCurrentWalkInCode] = useState(session?.walkInCode || '');
  const [regenerating, setRegenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Version conflict state
  const [conflictData, setConflictData] = useState<any>(null);

  useEffect(() => {
    if (session) {
      setDate(session.date || '');
      setStart(session.start || '20:00');
      setEnd(session.end || '22:00');
      setInstructorId(session.instructorId || '');
      setVenue(session.venue || '');
      setStatus(session.status || 'scheduled');
      setNote(session.note || '');
      setCurrentWalkInCode(session.walkInCode || '');
      setError(null);
      setConflictData(null);
    }
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRegenerateCode = async () => {
    if (!session) return;
    try {
      setRegenerating(true);
      setError(null);
      const res = await call<ClassSession>('sessions.regenerateWalkInCode', {
        id: session.id,
        version: session.version
      });
      setCurrentWalkInCode(res.data.walkInCode || '');
      await invalidateSessionCaches(queryClient);
      await onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRegenerating(false);
    }
  };

  if (!session) return null;

  const styleObj = styles.find((s) => s.id === session.styleId);
  const allowedInstructors = allowedInstructorIds
    .map((id) => instructors.find((i) => i.id === id))
    .filter((i): i is Instructor => Boolean(i));
  const outsideInstructor =
    instructorId && !allowedInstructorIds.includes(instructorId)
      ? instructors.find((i) => i.id === instructorId)
      : undefined;
  // The class's instructor was deleted: keep it selectable so the drop-down shows it and saving keeps it unchanged.
  const removedInstructorId = instructorId && !instructors.some((i) => i.id === instructorId) ? instructorId : '';
  const title = `EDIT ${styleObj?.name?.toUpperCase() || 'CLASS'} SESSION ${session.seq}`;

  const handleSubmit = async (overrideVersion?: number) => {
    if (!date) {
      setError('Date is required');
      return;
    }
    if (date !== session.date && minDate && maxDate && (date < minDate || date > maxDate)) {
      setError(`Class date must be inside the event (${minDate} to ${maxDate})`);
      return;
    }

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

      await invalidateSessionCaches(queryClient);
      await onSaved();
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
    setDeleting(true);
    setError(null);
    try {
      await call('sessions.delete', { id: session.id, version: session.version });
      await invalidateSessionCaches(queryClient);
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
      setDeleting(false);
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
        noValidate
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
            className="p-3 bg-[var(--night-1)] border-2 border-[var(--neon-red)] text-[var(--neon-red)] text-[12px] font-body font-bold space-y-2"
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
            className="p-3 bg-[var(--night-1)] border-2 border-[var(--neon-red)] text-[var(--neon-red)] text-[12px] font-body font-bold"
          >
            {error}
          </div>
        )}

        {/* Date Field */}
        <Field
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={loading}
          helper={minDate && maxDate ? `Inside the event: ${minDate} to ${maxDate}` : undefined}
        />

        {/* Start and End Times */}
        <div className="space-y-2">
          <label className="block font-display text-[12px] text-[var(--text-1)] uppercase">
            Start Time
          </label>
          <TimePicker value={start} onChange={setStart} />
        </div>

        <div className="space-y-2">
          <label className="block font-display text-[12px] text-[var(--text-1)] uppercase">
            End Time
          </label>
          <TimePicker value={end} onChange={setEnd} />
        </div>

        {/* Instructor Select with Photo Preview */}
        <div>
          <label
            htmlFor="instructor-select"
            className="block font-display text-[12px] text-[var(--text-1)] mb-1 uppercase"
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
                  referrerPolicy="no-referrer"
                  className="w-11 h-[55px] object-cover object-top border-2 border-[var(--outline)] flex-shrink-0"
                  loading="lazy"
                  onError={(e) => {
                    const thumb = getDriveThumbnailUrl(photoUrl, 200);
                    if (thumb && thumb !== photoUrl && e.currentTarget.src !== thumb) {
                      e.currentTarget.src = thumb;
                    }
                  }}
                />
              ) : (
                <span className="w-11 h-[55px] flex items-center justify-center bg-[var(--night-1)] border-2 border-[var(--outline)] font-display text-[12px] text-[var(--text-2)] flex-shrink-0">👤</span>
              );
            })()}
            <select
              id="instructor-select"
              value={instructorId}
              onChange={(e) => setInstructorId(e.target.value)}
              disabled={loading}
              className="w-full min-h-[48px] px-3 bg-[var(--night-1)] border-2 border-[var(--outline)] px-well font-body text-[16px] text-[var(--text-1)]"
            >
              <option value="">Select Instructor...</option>
              {allowedInstructors.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name}
                </option>
              ))}
              {outsideInstructor && (
                <option value={outsideInstructor.id}>
                  {outsideInstructor.name} (not in this event's list)
                </option>
              )}
              {removedInstructorId && (
                <option value={removedInstructorId}>Removed instructor (not in this event's list)</option>
              )}
            </select>
          </div>
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
            className="block font-display text-[12px] text-[var(--text-1)] mb-1 uppercase"
          >
            Session Status
          </label>
          <select
            id="status-select"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            disabled={loading}
            className="w-full min-h-[48px] px-3 bg-[var(--night-1)] border-2 border-[var(--outline)] px-well font-body text-[16px] text-[var(--text-1)]"
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

        {/* Walk-In Class Code */}
        <div className="p-3 bg-[var(--night-2)] border-2 border-[var(--outline)] space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-display text-[10px] text-[var(--neon-cyan)] uppercase tracking-wider font-bold">
              Walk-In Class Code
            </span>
            <PixelButton
              variant="secondary"
              size="sm"
              type="button"
              onClick={handleRegenerateCode}
              disabled={loading || regenerating}
            >
              {regenerating ? 'GENERATING…' : 'REGENERATE CODE'}
            </PixelButton>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[18px] text-[var(--neon-gold)] font-bold tracking-wider">
              {currentWalkInCode || 'N/A'}
            </span>
            <button
              type="button"
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard && currentWalkInCode) {
                  navigator.clipboard.writeText(currentWalkInCode);
                }
              }}
              className="text-[10px] font-display text-[var(--text-2)] hover:text-[var(--text-1)] border border-[var(--outline)] px-1.5 py-0.5 cursor-pointer"
            >
              COPY
            </button>
          </div>
          <p className="font-body text-[12px] text-[var(--text-2)]">
            Dancers attending as walk-ins use this code to log in and get full class videos and music.
          </p>
        </div>

        <div className="pt-2 flex gap-2">
          <PixelButton
            variant="primary"
            size="lg"
            type="submit"
            disabled={loading}
            className="flex-1"
          >
            {loading && !deleting ? 'SAVING...' : 'SAVE CHANGES'}
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

        <div className="pt-2 border-t-2 border-[var(--outline)]">
          <PixelButton
            variant="danger"
            size="md"
            type="button"
            onClick={handleDelete}
            disabled={loading}
          >
            {deleting ? 'DELETING...' : 'DELETE THIS CLASS'}
          </PixelButton>
          <p className="font-body text-[12px] text-[var(--text-2)] mt-1">
            For a class added by mistake. To keep a class on the schedule but mark it as not
            happening, set Status to Cancelled instead.
          </p>
        </div>
      </form>
    </Sheet>
  );
};
