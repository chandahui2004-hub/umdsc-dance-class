import React, { useState } from 'react';
import type { EventType, ISODate, Month } from '@umdsc/shared';
import { PixelButton } from '../../../components/ui/PixelButton';
import { addMonths, monthGrid, formatDayLabel } from '../../../lib/time';
import { localNameClash } from '../eventDraft';
import type { StepProps } from '../EventWizard';

const TYPES: { value: EventType; label: string }[] = [
  { value: 'monthly', label: 'Monthly class' },
  { value: 'trial', label: 'Trial class' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'other', label: 'Other' }
];

/** Day-level range picker: first click sets the start, second click sets the end. */
const RangeCalendar: React.FC<{
  startDate: ISODate;
  endDate: ISODate;
  onChange(start: ISODate, end: ISODate): void;
}> = ({ startDate, endDate, onChange }) => {
  const [viewMonth, setViewMonth] = useState<Month>(startDate.slice(0, 7));
  const [picking, setPicking] = useState<'start' | 'end'>('start');

  const clickDay = (d: ISODate) => {
    if (picking === 'start') {
      onChange(d, d);
      setPicking('end');
    } else {
      onChange(d < startDate ? d : startDate, d < startDate ? startDate : d);
      setPicking('start');
    }
  };

  return (
    <div className="border-4 border-[var(--c-ink)] bg-[var(--c-bg)] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <PixelButton size="md" variant="secondary" aria-label="Previous month" onClick={() => setViewMonth(m => addMonths(m, -1))}>
          &lt;
        </PixelButton>
        <span className="font-display text-xs text-[var(--c-ink)]">{viewMonth}</span>
        <PixelButton size="md" variant="secondary" aria-label="Next month" onClick={() => setViewMonth(m => addMonths(m, 1))}>
          &gt;
        </PixelButton>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center font-display text-[10px] text-[var(--c-darkgrey)]">
        {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(d => (
          <span key={d}>{d}</span>
        ))}
      </div>
      {monthGrid(viewMonth).map((week, i) => (
        <div key={i} className="grid grid-cols-7 gap-1">
          {week.map(d => {
            const edge = d === startDate || d === endDate;
            const inside = d > startDate && d < endDate;
            const outsideMonth = d.slice(0, 7) !== viewMonth;
            return (
              <button
                key={d}
                type="button"
                aria-label={formatDayLabel(d)}
                aria-pressed={edge || inside}
                onClick={() => clickDay(d)}
                className={`min-h-[44px] border-2 border-[var(--c-ink)] font-mono text-xs ${
                  edge
                    ? 'bg-[var(--c-orange)] font-bold'
                    : inside
                    ? 'bg-[var(--c-yellow)]'
                    : outsideMonth
                    ? 'bg-[var(--c-bg)] text-[var(--c-grey)]'
                    : 'bg-[var(--c-panel)]'
                } text-[var(--c-ink)]`}
              >
                {Number(d.slice(8))}
              </button>
            );
          })}
        </div>
      ))}
      <p className="font-body text-xs text-[var(--c-darkgrey)]">
        {picking === 'start' ? 'Click the first day of the event.' : 'Now click the last day.'}
      </p>
    </div>
  );
};

export const EventDetailsStep: React.FC<StepProps> = ({ draft, onChange, onNext, onBack, events, eventId }) => {
  const clash = localNameClash(draft.name, events, eventId);
  const canContinue = draft.name.trim() !== '' && !clash && draft.endDate >= draft.startDate;

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="font-display text-xs text-[var(--c-ink)]">EVENT NAME</span>
        <input
          aria-label="Event name"
          value={draft.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder="e.g. OCT MONTHLY CLASS"
          className="w-full min-h-[44px] px-3 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] font-body text-base"
        />
      </label>
      {clash && (
        <p role="alert" className="font-body font-bold text-sm text-[var(--c-red)]">
          An event called "{draft.name.trim()}" already exists.
        </p>
      )}

      <label className="block space-y-1">
        <span className="font-display text-xs text-[var(--c-ink)]">TYPE</span>
        <select
          aria-label="Event type"
          value={draft.type}
          onChange={e => onChange({ type: e.target.value as EventType })}
          className="w-full min-h-[44px] px-2 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] font-body text-base"
        >
          {TYPES.map(t => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2">
        <span className="font-display text-xs text-[var(--c-ink)]">DATES</span>
        <RangeCalendar
          startDate={draft.startDate}
          endDate={draft.endDate}
          onChange={(startDate, endDate) => onChange({ startDate, endDate })}
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="font-display text-[10px]">START DAY</span>
            <input
              type="date"
              aria-label="Start day"
              value={draft.startDate}
              onChange={e => e.target.value && onChange({ startDate: e.target.value })}
              className="w-full min-h-[44px] px-2 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] font-mono text-xs"
            />
          </label>
          <label className="space-y-1">
            <span className="font-display text-[10px]">END DAY</span>
            <input
              type="date"
              aria-label="End day"
              value={draft.endDate}
              onChange={e => e.target.value && onChange({ endDate: e.target.value })}
              className="w-full min-h-[44px] px-2 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] font-mono text-xs"
            />
          </label>
        </div>
        {draft.endDate < draft.startDate && (
          <p role="alert" className="font-body font-bold text-sm text-[var(--c-red)]">
            The end day must be on or after the start day.
          </p>
        )}
      </div>

      <div className="flex justify-between pt-3 border-t-2 border-[var(--c-ink)]">
        <PixelButton size="md" variant="secondary" onClick={onBack}>
          BACK
        </PixelButton>
        <PixelButton size="md" disabled={!canContinue} onClick={onNext}>
          NEXT
        </PixelButton>
      </div>
    </div>
  );
};
