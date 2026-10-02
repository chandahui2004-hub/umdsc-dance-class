import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DanceStyle } from '@umdsc/shared';
import { call, errorMessage } from '../../../lib/api';
import { PixelButton } from '../../../components/ui/PixelButton';
import { getStyleColor } from '../../../theme/colors';
import type { StepProps } from '../EventWizard';

const PALETTE = ['orange', 'blue', 'pink', 'green', 'yellow', 'lavender', 'peach', 'darkgreen', 'brown', 'darkpurple', 'red'];

export const StylesStep: React.FC<StepProps> = ({ draft, onChange, onNext, onBack, styles }) => {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('lavender');
  const [newAliases, setNewAliases] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    onChange({
      styleIds: draft.styleIds.includes(id) ? draft.styleIds.filter(s => s !== id) : [...draft.styleIds, id]
    });

  const createStyle = useMutation({
    mutationFn: async (input: { name: string; colorKey: string; aliases: string[] }) =>
      (
        await call<DanceStyle>('styles.create', {
          name: input.name,
          aliases: input.aliases,
          colorKey: input.colorKey,
          defaultWeekday: null,
          defaultStart: '20:00',
          defaultEnd: '22:00',
          defaultInstructorId: '',
          defaultVenue: '',
          attendanceFolderId: '',
          videoFolderId: ''
        })
      ).data,
    onSuccess: style => {
      setError(null);
      setNewName('');
      setNewAliases('');
      setShowNew(false);
      queryClient.invalidateQueries({ queryKey: ['styles'] });
      onChange({ styleIds: [...draft.styleIds, style.id] });
    },
    onError: err => setError(errorMessage(err))
  });

  const addFromToken = (token: string, i: number) =>
    createStyle.mutate({ name: token, colorKey: PALETTE[i % PALETTE.length], aliases: [token.toLowerCase()] });

  const unknown = draft.preview?.unknownClasses || [];

  return (
    <div className="space-y-4">
      <p className="font-body text-base text-[var(--text-1)]">Tick the dance styles taught in this event.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {styles.map(s => (
          <label
            key={s.id}
            className="flex items-center gap-3 min-h-[44px] px-3 border-2 border-[var(--c-ink)] bg-[var(--c-panel)] cursor-pointer"
          >
            <input type="checkbox" checked={draft.styleIds.includes(s.id)} onChange={() => toggle(s.id)} className="w-5 h-5" />
            <span className="w-4 h-4 border-2 border-[var(--c-ink)]" style={{ backgroundColor: getStyleColor(s.colorKey) }} />
            <span className="font-body text-base text-[var(--text-1)]">{s.name}</span>
            {draft.preview && (
              <span className="ml-auto font-mono text-xs text-[var(--text-2)]">
                {draft.preview.detectedStyleIds.includes(s.id) ? 'in form' : ''}
              </span>
            )}
          </label>
        ))}
      </div>

      {unknown.length > 0 && (
        <div className="border-4 border-[var(--c-ink)] bg-[var(--c-peach)] p-3 space-y-2">
          <p className="font-display text-[10px] text-[var(--text-1)]">CLASS ANSWERS THAT MATCH NO STYLE</p>
          {unknown.map((u, i) => (
            <div key={u.token} className="flex flex-wrap items-center justify-between gap-2 font-body text-sm">
              <span>
                “{u.token}” — {u.count} {u.count === 1 ? 'dancer' : 'dancers'}
              </span>
              <PixelButton
                size="md"
                variant="secondary"
                disabled={createStyle.isPending || styles.some(s => s.name.toLowerCase() === u.token.toLowerCase())}
                onClick={() => addFromToken(u.token, i)}
              >
                ADD AS NEW STYLE
              </PixelButton>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <PixelButton size="md" variant="secondary" onClick={() => setShowNew(v => !v)}>
          {showNew ? 'CLOSE' : '+ NEW STYLE'}
        </PixelButton>
        {showNew && (
          <div className="border-2 border-[var(--c-ink)] bg-[var(--c-bg)] p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              aria-label="New style name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Name, e.g. Waacking"
              className="min-h-[44px] px-2 border-2 border-[var(--c-ink)] font-body text-base"
            />
            <select
              aria-label="New style colour"
              value={newColor}
              onChange={e => setNewColor(e.target.value)}
              className="min-h-[44px] px-2 border-2 border-[var(--c-ink)] font-body text-base"
            >
              {PALETTE.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              aria-label="Other spellings"
              value={newAliases}
              onChange={e => setNewAliases(e.target.value)}
              placeholder="Other spellings, comma separated"
              className="min-h-[44px] px-2 border-2 border-[var(--c-ink)] font-body text-base"
            />
            <PixelButton
              size="md"
              disabled={!newName.trim() || createStyle.isPending}
              onClick={() =>
                createStyle.mutate({
                  name: newName.trim(),
                  colorKey: newColor,
                  aliases: [newName.trim().toLowerCase(), ...newAliases.split(',').map(a => a.trim().toLowerCase()).filter(Boolean)]
                })
              }
            >
              {createStyle.isPending ? 'ADDING…' : 'ADD STYLE'}
            </PixelButton>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="font-body font-bold text-sm text-[var(--c-red)]">
          {error}
        </p>
      )}

      <div className="flex justify-between pt-3 border-t-2 border-[var(--c-ink)]">
        <PixelButton size="md" variant="secondary" onClick={onBack}>
          BACK
        </PixelButton>
        <PixelButton size="md" disabled={draft.styleIds.length === 0} onClick={onNext}>
          NEXT
        </PixelButton>
      </div>
    </div>
  );
};
