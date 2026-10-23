import React from 'react';
import { Link } from 'react-router-dom';
import { useCurrentEvent } from '../../features/events/useCurrentEvent';
import { PixelDropdown, PixelDropdownOption } from './PixelDropdown';

interface StepPanelProps {
  numeral: 'I' | 'II';
  title: string;
  /** Glows to show this is the next thing to choose. */
  highlight?: boolean;
  /** Greyed out until the step before it is done. */
  disabled?: boolean;
  disabledNote?: string;
  children: React.ReactNode;
}

/** One numbered step panel: a gold Roman-numeral badge, a title, and the step's own control. */
export const StepPanel: React.FC<StepPanelProps> = ({ numeral, title, highlight, disabled, disabledNote, children }) => (
  <section
    aria-label={`Step ${numeral}: ${title}`}
    aria-disabled={disabled || undefined}
    data-testid={`step-${numeral}`}
    className={`px-panel p-3 flex items-start gap-3 ${highlight ? 'px-neon' : 'border-2 border-[var(--outline)]'} ${
      disabled ? 'opacity-50' : ''
    }`}
    style={highlight ? ({ '--glow': 'var(--neon-gold)' } as React.CSSProperties) : undefined}
  >
    <span
      aria-hidden="true"
      className={`shrink-0 w-12 h-12 flex items-center justify-center border-2 border-[var(--outline)] font-display text-[20px] shadow-[2px_2px_0_var(--outline)] ${
        disabled ? 'bg-[var(--night-1)] text-[var(--text-2)]' : 'bg-[var(--neon-gold)] text-[var(--on-neon)]'
      }`}
    >
      {numeral}
    </span>
    <div className="flex-1 min-w-0 space-y-2">
      <p className={`font-display text-[12px] tracking-wider ${disabled ? 'text-[var(--text-2)]' : 'text-[var(--neon-gold)]'}`}>
        {title}
      </p>
      {disabled && disabledNote ? (
        <p className="font-body text-[16px] text-[var(--text-2)]">{disabledNote}</p>
      ) : (
        children
      )}
    </div>
  </section>
);

/**
 * Step I: the event that Attendance, Media, Dancers and Calendar show. The choice is remembered
 * across pages. `allowAll` offers ALL EVENTS (Dancers and Calendar can combine events).
 */
export const EventStep: React.FC<{ allowAll?: boolean }> = ({ allowAll = false }) => {
  const { events, current, setCurrentId, isLoading, isAll } = useCurrentEvent();
  const chosen = !isAll && Boolean(current);

  const active = React.useMemo(() => events.filter(e => e.status === 'active'), [events]);
  const archived = React.useMemo(() => events.filter(e => e.status === 'archived'), [events]);
  const [showArchived, setShowArchived] = React.useState(false);
  const [selectedYear, setSelectedYear] = React.useState<string | null>(null);

  const archivedByYear = React.useMemo(() => {
    const map = new Map<string, typeof archived>();
    for (const ev of archived) {
      const year = (ev as any).startDate ? String((ev as any).startDate).slice(0, 4) : 'Other';
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(ev);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [archived]);

  const availableYears = archivedByYear.map(([year]) => year);
  const activeYear = selectedYear || availableYears[0] || '';
  const eventsInYear = archivedByYear.find(([y]) => y === activeYear)?.[1] || [];

  if (isLoading) {
    return (
      <StepPanel numeral="I" title="CHOOSE EVENT">
        <p className="font-display text-[12px] text-[var(--text-1)] px-blink">LOADING EVENTS…</p>
      </StepPanel>
    );
  }

  if (events.length === 0) {
    return (
      <StepPanel numeral="I" title="CHOOSE EVENT" highlight>
        <Link
          to="/admin/events/new"
          className="inline-flex items-center min-h-[48px] px-4 border-2 border-[var(--outline)] bg-[var(--neon-gold)] text-[var(--on-neon)] font-display text-[12px] no-underline shadow-[2px_2px_0_var(--outline)]"
        >
          NO EVENTS YET — CREATE ONE
        </Link>
      </StepPanel>
    );
  }

  const options: PixelDropdownOption[] = [
    { value: 'ALL', label: allowAll ? 'ALL EVENTS' : '— Choose an event —' },
    ...active.map(e => ({ value: e.id, label: e.name }))
  ];

  if (current && current.status === 'archived') {
    options.push({ value: current.id, label: `[Archived] ${current.name}`, hint: 'Archived event' });
  }

  return (
    <StepPanel numeral="I" title="CHOOSE EVENT" highlight={!chosen && !allowAll}>
      <PixelDropdown
        ariaLabel="Current event"
        options={options}
        value={isAll ? 'ALL' : current?.id || 'ALL'}
        onChange={val => setCurrentId(val)}
        maxVisibleItems={5}
      />

      {archived.length > 0 && (
        <div className="pt-2 border-t border-[var(--outline)] space-y-2">
          <button
            type="button"
            onClick={() => setShowArchived(v => !v)}
            className="w-full text-left font-display text-[11px] text-[var(--neon-gold)] hover:text-[var(--neon-cyan)] flex items-center justify-between py-1 px-1.5 border border-dashed border-[var(--outline)] bg-[var(--night-2)] hover:border-[var(--neon-cyan)] transition-colors"
          >
            <span>{showArchived ? '▼' : '▶'} 📁 ARCHIVED EVENTS ({archived.length})</span>
            <span className="font-mono text-[10px] text-[var(--text-3)]">{showArchived ? 'HIDE' : 'SHOW'}</span>
          </button>

          {showArchived && (
            <div className="space-y-2 p-2 bg-[var(--night-1)] border border-[var(--outline)]">
              {/* Year tabs */}
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="font-display text-[10px] text-[var(--text-3)] mr-1">YEAR:</span>
                {availableYears.map(year => {
                  const isSelected = activeYear === year;
                  return (
                    <button
                      key={year}
                      type="button"
                      onClick={() => setSelectedYear(year)}
                      className={`px-2 py-0.5 font-display text-[11px] border shadow-[1px_1px_0_var(--outline)] transition-colors ${
                        isSelected
                          ? 'border-[var(--neon-cyan)] bg-[var(--neon-cyan)] text-[var(--on-neon)] font-bold'
                          : 'border-[var(--outline)] bg-[var(--night-3)] text-[var(--text-2)] hover:text-[var(--neon-cyan)]'
                      }`}
                    >
                      {year}
                    </button>
                  );
                })}
              </div>

              {/* Events in selected year */}
              <div className="space-y-1 max-h-36 overflow-y-auto pixel-scrollbar pr-1">
                {eventsInYear.map(e => {
                  const isChosen = current?.id === e.id;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setCurrentId(e.id)}
                      className={`w-full text-left px-2 py-1.5 text-xs font-display flex items-center justify-between border transition-colors ${
                        isChosen
                          ? 'border-[var(--neon-gold)] bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold shadow-[2px_2px_0_var(--outline)]'
                          : 'border-[var(--outline)] bg-[var(--night-2)] text-[var(--text-1)] hover:bg-[var(--violet-2)] hover:text-[var(--neon-cyan)]'
                      }`}
                    >
                      <span className="truncate pr-2">📁 {e.name}</span>
                      {isChosen && <span className="font-mono text-[10px]">SELECTED</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </StepPanel>
  );
};

/** Step II: dance style dropdown. Greyed out until an event is chosen. */
export const StyleStep: React.FC<{
  styles: { id: string; name: string }[];
  value: string;
  onChange: (styleId: string) => void;
  disabled?: boolean;
  /** Extra choice before the styles, e.g. ALL on the Dancers page. */
  allOption?: string;
  /** Shown under the dropdown, e.g. a missing-folder warning. */
  note?: React.ReactNode;
}> = ({ styles, value, onChange, disabled, allOption, note }) => {
  const options = allOption ? [{ id: 'all', name: allOption }, ...styles] : styles;
  const dropdownOptions: PixelDropdownOption[] = options.map(s => ({
    value: s.id,
    label: s.name
  }));

  return (
    <StepPanel numeral="II" title="CHOOSE DANCE STYLE" disabled={disabled} disabledNote="Choose an event first.">
      {options.length === 0 ? (
        <p className="font-body text-[16px] text-[var(--text-2)]">No dance styles in this event yet.</p>
      ) : options.length <= 6 ? (
        <div className="flex flex-wrap gap-2 pb-1">
          {options.map(s => (
            <button
              key={s.id}
              type="button"
              aria-pressed={value === s.id}
              onClick={() => onChange(s.id)}
              disabled={disabled}
              className={`min-h-[44px] px-3.5 border-2 border-[var(--outline)] font-display text-[12px] cursor-pointer select-none whitespace-nowrap transition-none ${
                value === s.id
                  ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold shadow-[2px_2px_0_var(--outline)]'
                  : 'bg-[var(--night-1)] text-[var(--text-1)] hover:bg-[var(--violet-2)]'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      ) : (
        <PixelDropdown
          ariaLabel="Choose dance style"
          placeholder="— Choose a dance style —"
          options={dropdownOptions}
          value={value}
          onChange={onChange}
          disabled={disabled}
          maxVisibleItems={5}
        />
      )}
      {note}
    </StepPanel>
  );
};
