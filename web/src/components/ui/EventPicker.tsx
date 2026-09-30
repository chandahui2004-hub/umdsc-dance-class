import React from 'react';
import { Link } from 'react-router-dom';
import { useCurrentEvent } from '../../features/events/useCurrentEvent';

/** Chooses the event that Registered Dancers, Attendance, Media and Calendar show. */
export const EventPicker: React.FC = () => {
  const { events, current, setCurrentId, isLoading } = useCurrentEvent();

  if (isLoading) {
    return <span className="font-display text-[10px] text-[var(--c-ink)]">LOADING EVENTS…</span>;
  }

  if (events.length === 0) {
    return (
      <Link
        to="/admin/events/new"
        className="inline-flex items-center min-h-[44px] px-3 border-2 border-[var(--c-ink)] bg-[var(--c-yellow)] text-[var(--c-ink)] font-display text-xs no-underline"
      >
        NO EVENTS YET — CREATE ONE
      </Link>
    );
  }

  const active = events.filter(e => e.status === 'active');
  const archived = events.filter(e => e.status === 'archived');

  return (
    <label className="flex items-center gap-2 font-display text-[10px] text-[var(--c-ink)]">
      <span className="whitespace-nowrap">EVENT:</span>
      <select
        aria-label="Current event"
        value={current?.id || ''}
        onChange={e => setCurrentId(e.target.value)}
        className="min-h-[44px] min-w-0 flex-1 px-2 border-2 border-[var(--c-ink)] bg-[var(--c-panel)] font-body text-base text-[var(--c-ink)] focus:outline-none focus:ring-4 focus:ring-[var(--c-yellow)]"
      >
        {active.map(e => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
        {archived.length > 0 && (
          <optgroup label="── Archived ──">
            {archived.map(e => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
};
