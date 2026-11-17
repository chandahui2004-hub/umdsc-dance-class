import React from 'react';
import type { DanceStyle, EventListItem } from '@umdsc/shared';
import { isEventStyleFull } from '../events/eventSlots';

export type DancerFieldKey = 'fullName' | 'matricRaw' | 'contact' | 'email' | 'gender' | 'nationality';

export const DANCER_FIELDS: { key: DancerFieldKey; label: string; required?: boolean }[] = [
  { key: 'fullName', label: 'Full name', required: true },
  { key: 'matricRaw', label: 'Matric number', required: true },
  { key: 'contact', label: 'Phone number' },
  { key: 'email', label: 'Email' },
  { key: 'gender', label: 'Gender' },
  { key: 'nationality', label: 'Nationality' }
];

export interface DancerClassChecklistProps {
  heading: string;
  event: EventListItem;
  styles: DanceStyle[];
  selectedStyleIds: string[];
  fallbackNames?: string[];
  fullBadgeLabel: string;
  idPrefix: string;
  onToggle: (styleId: string) => void;
}

/** Accessible 8-bit multi-select dance class checklist for an event's dancer dialog. */
export const DancerClassChecklist: React.FC<DancerClassChecklistProps> = ({
  heading,
  event,
  styles,
  selectedStyleIds,
  fallbackNames,
  fullBadgeLabel,
  idPrefix,
  onToggle
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <span className="font-display text-[10px] text-[var(--text-2)] tracking-wider uppercase">{heading}</span>
      <span className="font-mono text-[13px] text-[var(--text-2)]">{selectedStyleIds.length} selected</span>
    </div>
    {event.styleIds.length === 0 ? (
      <p className="font-body text-[14px] text-[var(--text-2)]">No dance classes configured for this event.</p>
    ) : (
      <div className="grid grid-cols-1 gap-2">
        {event.styleIds.map((styleId) => {
          const styleName =
            styles.find((s) => s.id === styleId)?.name ||
            (event.styleIds.length === 1 && fallbackNames?.[0]) ||
            styleId;
          const checked = selectedStyleIds.includes(styleId);
          const isFull = isEventStyleFull(event, styleId);
          const inputId = `${idPrefix}-style-${styleId}`;

          return (
            <label
              key={styleId}
              htmlFor={inputId}
              className={`min-h-[44px] px-3 py-2 border-2 flex flex-wrap items-center justify-between gap-2 cursor-pointer select-none transition-none ${
                checked
                  ? 'border-[var(--neon-cyan)] bg-[var(--night-2)] shadow-[2px_2px_0_var(--outline)]'
                  : 'border-[var(--outline)] bg-[var(--night-1)] hover:bg-[var(--violet-1)]'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <input
                  id={inputId}
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(styleId)}
                  className="w-5 h-5 shrink-0 accent-[var(--neon-gold)] cursor-pointer"
                />
                <span className="font-body text-[16px] font-bold text-[var(--text-1)] break-words">
                  {styleName}
                </span>
              </span>
              {isFull && (
                <span className="text-[10px] font-display text-[var(--neon-gold)] border border-[var(--neon-gold)] bg-[var(--night-1)] px-1.5 py-0.5 leading-snug">
                  {fullBadgeLabel}
                </span>
              )}
            </label>
          );
        })}
      </div>
    )}
  </div>
);
