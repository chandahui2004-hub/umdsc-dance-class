import React from 'react';
import { Link } from 'react-router-dom';
import { useCurrentEvent } from '../../features/events/useCurrentEvent';

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

  const active = events.filter(e => e.status === 'active');
  const archived = events.filter(e => e.status === 'archived');

  return (
    <StepPanel numeral="I" title="CHOOSE EVENT" highlight={!chosen && !allowAll}>
      <select
        aria-label="Current event"
        value={isAll ? 'ALL' : current?.id || ''}
        onChange={e => setCurrentId(e.target.value)}
        className="w-full min-h-[48px] px-3 px-well font-body text-[18px] text-[var(--text-1)]"
      >
        <option value="ALL">{allowAll ? 'ALL EVENTS' : '— Choose an event —'}</option>
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
    </StepPanel>
  );
};

/** Step II: dance style buttons. Greyed out until an event is chosen. */
export const StyleStep: React.FC<{
  styles: { id: string; name: string }[];
  value: string;
  onChange: (styleId: string) => void;
  disabled?: boolean;
  /** Extra choice before the styles, e.g. ALL on the Dancers page. */
  allOption?: string;
  /** Shown under the buttons, e.g. a missing-folder warning. */
  note?: React.ReactNode;
}> = ({ styles, value, onChange, disabled, allOption, note }) => {
  const options = allOption ? [{ id: 'all', name: allOption }, ...styles] : styles;
  return (
    <StepPanel numeral="II" title="CHOOSE DANCE STYLE" disabled={disabled} disabledNote="Choose an event first.">
      {options.length === 0 ? (
        <p className="font-body text-[16px] text-[var(--text-2)]">No dance styles in this event yet.</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pixel-scrollbar pb-1">
          {options.map(s => (
            <button
              key={s.id}
              type="button"
              aria-pressed={value === s.id}
              onClick={() => onChange(s.id)}
              className={`min-h-[44px] px-3 border-2 border-[var(--outline)] font-display text-[12px] cursor-pointer select-none whitespace-nowrap transition-none ${
                value === s.id
                  ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold shadow-[2px_2px_0_var(--outline)]'
                  : 'px-well text-[var(--text-1)] hover:bg-[var(--violet-2)]'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {note}
    </StepPanel>
  );
};
