import React, { useMemo, useState } from 'react';
import type { ISODate } from '@umdsc/shared';
import { PixelButton } from '../../../components/ui/PixelButton';
import { formatDayLabel, getDatesBetween } from '../../../lib/time';
import { getStyleColor } from '../../../theme/colors';
import type { ScheduledClass } from '../eventDraft';
import type { StepProps } from '../EventWizard';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** ISO weekday 1 (Mon) .. 7 (Sun) of a YYYY-MM-DD date. */
function isoWeekday(d: ISODate): number {
  const day = new Date(`${d}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Weeks (Mon..Sun) covering the event range. */
function rangeWeeks(start: ISODate, end: ISODate): ISODate[][] {
  const first = new Date(`${start}T00:00:00Z`);
  first.setUTCDate(first.getUTCDate() - (isoWeekday(start) - 1));
  const last = new Date(`${end}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() + (7 - isoWeekday(end)));
  const days = getDatesBetween(first.toISOString().slice(0, 10), last.toISOString().slice(0, 10));
  const weeks: ISODate[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export const ScheduleStep: React.FC<StepProps> = ({ draft, onChange, onNext, onBack, styles }) => {
  const [activeId, setActiveId] = useState(draft.styleIds[0] || '');
  const [fillDay, setFillDay] = useState(isoWeekday(draft.startDate));
  const [fillStart, setFillStart] = useState('20:00');
  const [fillEnd, setFillEnd] = useState('22:00');
  const [fillCount, setFillCount] = useState(4);

  const weeks = useMemo(() => rangeWeeks(draft.startDate, draft.endDate), [draft.startDate, draft.endDate]);
  const classes = draft.schedule[activeId] || [];
  const style = styles.find(s => s.id === activeId);

  const setClasses = (list: ScheduledClass[]) => onChange({ schedule: { ...draft.schedule, [activeId]: list } });

  const toggleDay = (d: ISODate) => {
    if (classes.some(c => c.date === d)) {
      setClasses(classes.filter(c => c.date !== d));
      return;
    }
    const last = classes[classes.length - 1];
    setClasses([...classes, { seq: 0, date: d, start: last?.start || fillStart, end: last?.end || fillEnd, venue: last?.venue || '' }]);
  };

  const autoFill = () => {
    const days = getDatesBetween(draft.startDate, draft.endDate).filter(d => isoWeekday(d) === fillDay).slice(0, fillCount);
    const kept = classes.filter(c => c.id && days.includes(c.date));
    setClasses([
      ...kept.map(c => ({ ...c, start: fillStart, end: fillEnd })),
      ...days.filter(d => !kept.some(k => k.date === d)).map(d => ({ seq: 0, date: d, start: fillStart, end: fillEnd, venue: '' }))
    ]);
  };

  const copyToAll = () => {
    const schedule = { ...draft.schedule };
    for (const id of draft.styleIds) {
      if (id !== activeId) schedule[id] = classes.map(({ id: _id, status: _status, ...c }) => ({ ...c }));
    }
    onChange({ schedule });
  };

  const updateClass = (date: ISODate, patch: Partial<ScheduledClass>) =>
    setClasses(classes.map(c => (c.date === date ? { ...c, ...patch } : c)));

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="lg:w-48 space-y-2">
          <span className="font-display text-[10px] text-[var(--text-2)]">DANCE STYLES</span>
          {draft.styleIds.map(id => {
            const s = styles.find(x => x.id === id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveId(id)}
                aria-pressed={id === activeId}
                className={`w-full min-h-[44px] px-3 border-2 border-[var(--c-ink)] flex items-center justify-between font-display text-xs ${
                  id === activeId ? 'bg-[var(--c-orange)] text-[var(--on-neon)] shadow-[2px_2px_0_var(--c-ink)]' : 'bg-[var(--c-panel)] text-[var(--text-1)]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-[var(--c-ink)]" style={{ backgroundColor: getStyleColor(s?.colorKey) }} />
                  {s?.name || id}
                </span>
                <span className="font-mono">{(draft.schedule[id] || []).length}</span>
              </button>
            );
          })}
          <PixelButton size="md" variant="secondary" className="w-full" disabled={classes.length === 0} onClick={copyToAll}>
            COPY TO ALL
          </PixelButton>
          <PixelButton size="md" variant="secondary" className="w-full" disabled={classes.length === 0} onClick={() => setClasses([])}>
            CLEAR ALL
          </PixelButton>
        </div>

        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-display text-xs text-[var(--neon-cyan)]">{style?.name?.toUpperCase()} — CLICK DAYS TO ADD OR REMOVE</span>
            <span className="font-mono text-xs text-[var(--text-2)]">{classes.length} classes selected</span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center font-display text-[10px] text-[var(--text-2)]">
            {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(d => (
              <span key={d}>{d}</span>
            ))}
          </div>
          {weeks.map((week, i) => (
            <div key={i} className="grid grid-cols-7 gap-1">
              {week.map(d => {
                const inRange = d >= draft.startDate && d <= draft.endDate;
                const cls = classes.find(c => c.date === d);
                if (!inRange) {
                  return (
                    <div key={d} aria-hidden className="min-h-[44px] border border-[var(--c-ink)]/30 opacity-30 font-mono text-[10px] p-1">
                      {Number(d.slice(8))}
                    </div>
                  );
                }
                return (
                  <button
                    key={d}
                    type="button"
                    aria-label={formatDayLabel(d)}
                    aria-pressed={Boolean(cls)}
                    onClick={() => toggleDay(d)}
                    className={`min-h-[44px] p-1 border-2 border-[var(--c-ink)] text-left font-mono text-xs ${
                      cls ? 'bg-[var(--c-orange)] text-[var(--on-neon)] font-bold shadow-[2px_2px_0_var(--c-ink)]' : 'bg-[var(--c-panel)] text-[var(--text-1)]'
                    }`}
                  >
                    <div>{Number(d.slice(8))}</div>
                    <div className="text-[9px]">{cls ? `#${cls.seq} ${cls.start}` : formatDayLabel(d).slice(0, 3)}</div>
                  </button>
                );
              })}
            </div>
          ))}

          <div className="border-2 border-[var(--c-ink)] bg-[var(--c-bg)] p-3 flex flex-wrap items-end gap-2">
            <span className="w-full font-display text-[10px] text-[var(--text-1)]">AUTO-FILL</span>
            <label className="space-y-1">
              <span className="block font-display text-[9px]">DAY</span>
              <select aria-label="Auto-fill day" value={fillDay} onChange={e => setFillDay(Number(e.target.value))} className="min-h-[44px] px-2 border-2 border-[var(--c-ink)] font-body text-sm">
                {WEEKDAYS.map((w, i) => (
                  <option key={w} value={i + 1}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block font-display text-[9px]">START</span>
              <input type="time" aria-label="Auto-fill start" value={fillStart} onChange={e => setFillStart(e.target.value)} className="min-h-[44px] px-2 border-2 border-[var(--c-ink)] font-mono text-xs" />
            </label>
            <label className="space-y-1">
              <span className="block font-display text-[9px]">END</span>
              <input type="time" aria-label="Auto-fill end" value={fillEnd} onChange={e => setFillEnd(e.target.value)} className="min-h-[44px] px-2 border-2 border-[var(--c-ink)] font-mono text-xs" />
            </label>
            <label className="space-y-1">
              <span className="block font-display text-[9px]">CLASSES</span>
              <input type="number" min={1} max={31} aria-label="Auto-fill count" value={fillCount} onChange={e => setFillCount(Math.max(1, Number(e.target.value) || 1))} className="w-20 min-h-[44px] px-2 border-2 border-[var(--c-ink)] font-mono text-xs" />
            </label>
            <PixelButton size="md" onClick={autoFill}>
              FILL {fillCount} CLASSES
            </PixelButton>
          </div>
        </div>
      </div>

      {classes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {classes.map(c => (
            <div key={c.date} className="border-2 border-[var(--c-ink)] bg-[var(--c-panel)] p-2 space-y-2">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="font-display text-[10px] bg-[var(--c-yellow)] px-1 border border-[var(--c-ink)]">#{c.seq}</span>
                <span className="font-bold text-[var(--neon-cyan)]">{formatDayLabel(c.date)}</span>
                <button
                  type="button"
                  aria-label={`Remove class on ${formatDayLabel(c.date)}`}
                  onClick={() => toggleDay(c.date)}
                  className="min-w-[32px] min-h-[32px] border border-[var(--c-ink)] bg-[var(--c-peach)] text-[var(--c-red)] font-bold"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <input type="time" aria-label={`Start ${c.date}`} value={c.start} onChange={e => updateClass(c.date, { start: e.target.value })} className="min-h-[36px] px-1 border-2 border-[var(--c-ink)] font-mono text-xs" />
                <input type="time" aria-label={`End ${c.date}`} value={c.end} onChange={e => updateClass(c.date, { end: e.target.value })} className="min-h-[36px] px-1 border-2 border-[var(--c-ink)] font-mono text-xs" />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between pt-3 border-t-2 border-[var(--c-ink)]">
        <PixelButton size="md" variant="secondary" onClick={onBack}>
          BACK
        </PixelButton>
        <PixelButton size="md" onClick={onNext}>
          NEXT
        </PixelButton>
      </div>
    </div>
  );
};
