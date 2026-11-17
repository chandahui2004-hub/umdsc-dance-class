import React, { useMemo, useState } from 'react';
import type { DanceStyle, EventListItem } from '@umdsc/shared';
import { call, errorMessage } from '../../lib/api';
import { Sheet } from '../../components/ui/Sheet';
import { Field } from '../../components/ui/Field';
import { PixelButton } from '../../components/ui/PixelButton';
import { PixelUnlockIcon } from '../../components/ui/pixelIcons';
import { isEventStyleFull, parseEventStyleSlots } from './eventSlots';

export interface ReopenSlotsDialogProps {
  event: EventListItem;
  styles: DanceStyle[];
  initialStyleId?: string;
  onClose: () => void;
  onReopened: (message: string) => void;
}

function buildInitialAddOns(event: EventListItem, initialStyleId?: string): Record<string, string> {
  const anyFull = event.styleIds.some((id) => isEventStyleFull(event, id));
  const result: Record<string, string> = {};
  for (const styleId of event.styleIds) {
    if (initialStyleId && event.styleIds.includes(initialStyleId)) {
      result[styleId] = styleId === initialStyleId ? '5' : '0';
    } else if (anyFull) {
      result[styleId] = isEventStyleFull(event, styleId) ? '5' : '0';
    } else {
      result[styleId] = '5';
    }
  }
  return result;
}

/**
 * Allows admins to reopen full dance classes or a capacity-closed Google Form
 * by adding +N add-on slots on top of max(current limit, current enrolled).
 */
export const ReopenSlotsDialog: React.FC<ReopenSlotsDialogProps> = ({
  event,
  styles,
  initialStyleId,
  onClose,
  onReopened
}) => {
  const styleSlots = useMemo(() => parseEventStyleSlots(event), [event]);
  const singleStyle = event.styleIds.length === 1;
  const [addOns, setAddOns] = useState<Record<string, string>>(() =>
    buildInitialAddOns(event, initialStyleId)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const addOnSlots: Record<string, number> = {};
    for (const styleId of event.styleIds) {
      const raw = String(addOns[styleId] ?? '').trim();
      if (!raw) continue;
      const num = Number(raw);
      if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
        setError('Add-on slots must be a whole number (0 or higher)');
        return;
      }
      if (num >= 1) {
        addOnSlots[styleId] = num;
      }
    }

    const totalAdded = Object.values(addOnSlots).reduce((sum, n) => sum + n, 0);
    if (totalAdded < 1) {
      setError('Enter at least +1 add-on slot for at least one class to reopen');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await call('events.reopenFormSlots', { id: event.id, addOnSlots });
      onReopened(`Reopened Google Form (+${totalAdded} slots added)`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet isOpen onClose={onClose} title={`REOPEN & ADD SLOTS: ${event.name}`}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="font-body text-[14px] text-[var(--text-2)]">
          Entering +N add-on slots increases the class slot capacity (max(current limit, enrolled) + add-on),
          restores the class option on the Google Form, and reopens the Google Form immediately.
        </p>

        <div className="space-y-3">
          {event.styleIds.map((styleId) => {
            const styleName = styles.find((s) => s.id === styleId)?.name || styleId;
            const currentCap = Number(styleSlots[styleId]) || 0;
            const isFull = isEventStyleFull(event, styleId);
            const rawVal = String(addOns[styleId] ?? '').trim();
            const parsedVal = rawVal === '' ? 0 : Number(rawVal);
            const validAddOn = Number.isInteger(parsedVal) && parsedVal >= 1 ? parsedVal : 0;
            const baseCap = singleStyle ? Math.max(currentCap, event.memberCount) : currentCap;

            return (
              <div
                key={styleId}
                className="p-3 border-2 border-[var(--outline)] bg-[var(--night-1)] space-y-2 shadow-[2px_2px_0_var(--outline)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-display text-[12px] text-[var(--neon-cyan)] font-bold">
                    {styleName}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[13px] px-2 py-0.5 border border-[var(--outline)] bg-[var(--night-2)] text-[var(--neon-gold)] font-bold">
                      {currentCap > 0 ? `${currentCap} SLOTS` : 'UNLIMITED'}
                    </span>
                    {singleStyle && (
                      <span className="font-mono text-[13px] px-2 py-0.5 border border-[var(--outline)] bg-[var(--night-2)] text-[var(--text-1)]">
                        {event.memberCount} ENROLLED
                      </span>
                    )}
                    {isFull && (
                      <span className="font-display text-[10px] px-1.5 py-0.5 border border-[var(--neon-red)] bg-[var(--night-2)] text-[var(--neon-red)] font-bold">
                        FULL
                      </span>
                    )}
                  </div>
                </div>

                <Field
                  id={`reopen-addon-${styleId}`}
                  label={`Add-on slots for ${styleName} (+N)`}
                  type="number"
                  min={0}
                  step={1}
                  value={addOns[styleId] ?? ''}
                  onChange={(e) =>
                    setAddOns((prev) => ({
                      ...prev,
                      [styleId]: e.target.value
                    }))
                  }
                />

                {validAddOn >= 1 && (
                  <p className="font-mono text-[13px] text-[var(--neon-green)] font-bold">
                    New limit: ≥ {baseCap + validAddOn} slots (reopens form)
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <p role="alert" className="font-body text-[14px] font-bold text-[var(--neon-red)]">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2 justify-end pt-2 border-t-2 border-[var(--outline)]">
          <PixelButton type="button" variant="secondary" onClick={onClose} disabled={saving}>
            CANCEL
          </PixelButton>
          <PixelButton type="submit" variant="primary" disabled={saving} className="inline-flex items-center gap-1.5">
            <PixelUnlockIcon className="w-4 h-4" />
            <span>{saving ? 'REOPENING…' : 'REOPEN FORM & ADD SLOTS'}</span>
          </PixelButton>
        </div>
      </form>
    </Sheet>
  );
};
