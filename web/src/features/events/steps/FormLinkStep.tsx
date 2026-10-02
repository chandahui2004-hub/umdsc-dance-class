import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { SourcePreview } from '@umdsc/shared';
import { call, errorMessage } from '../../../lib/api';
import { PixelButton } from '../../../components/ui/PixelButton';
import type { StepProps } from '../EventWizard';

const FIELD_LABELS: Record<string, string> = {
  fullName: 'Full name',
  matric: 'Matric number',
  contact: 'Phone',
  email: 'Email',
  gender: 'Gender',
  nationality: 'Nationality'
};

export const FormLinkStep: React.FC<StepProps> = ({ draft, onChange, onNext, isEdit }) => {
  const [error, setError] = useState<string | null>(null);

  const preview = useMutation({
    mutationFn: async () => (await call<SourcePreview>('events.previewSource', { sheetUrl: draft.sheetUrl.trim() })).data,
    onSuccess: p => {
      setError(null);
      onChange({
        preview: p,
        columnMap: p.columnMap,
        classIndex: p.classIndex,
        // A new event starts with the styles the form's answers mention
        ...(!isEdit && draft.styleIds.length === 0 ? { styleIds: p.detectedStyleIds } : {})
      });
    },
    onError: err => setError(errorMessage(err))
  });

  const p = draft.preview;
  const canContinue = Boolean(p) || (isEdit && draft.sheetUrl.trim() !== '');

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="font-display text-[12px] text-[var(--text-1)]">GOOGLE FORM RESPONSE SHEET LINK</span>
        <input
          aria-label="Google Sheet Link"
          value={draft.sheetUrl}
          onChange={e => onChange({ sheetUrl: e.target.value, preview: null })}
          placeholder="https://docs.google.com/spreadsheets/d/…"
          className="w-full min-h-[48px] px-3 border-2 border-[var(--outline)] bg-[var(--night-1)] px-well font-mono text-[16px] text-[var(--text-1)] placeholder:text-[var(--text-3)]"
        />
        <span className="font-body text-[14px] text-[var(--text-2)]">
          Share the sheet with umdancesportc@gmail.com as Editor first.
        </span>
      </label>

      <PixelButton size="md" variant="secondary" disabled={!draft.sheetUrl.trim() || preview.isPending} onClick={() => preview.mutate()}>
        {preview.isPending ? 'READING SHEET…' : 'READ SHEET'}
      </PixelButton>

      {error && (
        <p role="alert" className="p-3 border-2 border-[var(--neon-red)] bg-[var(--night-1)] font-body font-bold text-[14px] text-[var(--neon-red)]">
          {error}
        </p>
      )}

      {p && (
        <div className="space-y-4">
          <p className="font-body text-[16px] text-[var(--text-1)]">
            Found <strong>{p.rowCount}</strong> registrations in tab “{p.sourceTab}”
            {p.sampleNames.length > 0 && <> — e.g. {p.sampleNames.join(', ')}</>}.
          </p>

          <table className="w-full text-left border-collapse font-body text-[14px]">
            <thead>
              <tr className="border-b-2 border-[var(--neon-cyan)] bg-[var(--night-2)] font-display text-[12px] text-[var(--text-1)]">
                <th className="p-2">FIELD</th>
                <th className="p-2">COLUMN IN THE FORM</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-[var(--outline)]">
              {Object.entries(FIELD_LABELS).map(([key, label]) => (
                <tr key={key} className="min-h-[48px] odd:bg-[var(--night-2)] even:bg-[var(--violet-1)]">
                  <td className="p-2 font-bold">{label}</td>
                  <td className="p-2">
                    <select
                      aria-label={`${label} column`}
                      value={draft.columnMap[key] ?? ''}
                      onChange={e =>
                        onChange({ columnMap: { ...draft.columnMap, [key]: e.target.value === '' ? null : Number(e.target.value) } })
                      }
                      className="w-full min-h-[48px] px-2 border-2 border-[var(--outline)] bg-[var(--night-1)] px-well font-mono text-[16px] text-[var(--text-1)]"
                    >
                      <option value="">— not in form —</option>
                      {p.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h.split('\n')[0]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              <tr className="min-h-[48px] odd:bg-[var(--night-2)] even:bg-[var(--violet-1)]">
                <td className="p-2 font-bold">Class choice</td>
                <td className="p-2">
                  <select
                    aria-label="Class choice column"
                    value={draft.classIndex}
                    onChange={e => onChange({ classIndex: Number(e.target.value) })}
                    className="w-full min-h-[48px] px-2 border-2 border-[var(--outline)] bg-[var(--night-1)] px-well font-mono text-[16px] text-[var(--text-1)]"
                  >
                    <option value={-1}>— no class question (single-style event) —</option>
                    {p.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h.split('\n')[0]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            </tbody>
          </table>

          {p.warnings.length > 0 && (
            <details className="border-2 border-[var(--neon-gold)] bg-[var(--night-1)] px-panel p-3">
              <summary className="font-display text-[12px] text-[var(--neon-gold)] cursor-pointer">{p.warnings.length} NOTES ABOUT THE FORM</summary>
              <ul className="mt-2 space-y-1 font-mono text-[12px] text-[var(--text-2)] max-h-40 overflow-y-auto pixel-scrollbar">
                {p.warnings.map((w, i) => (
                  <li key={i}>
                    Row {w.row}: {w.detail}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="flex justify-end pt-3 border-t-2 border-[var(--outline)]">
        <PixelButton size="md" variant="primary" disabled={!canContinue} onClick={onNext}>
          NEXT
        </PixelButton>
      </div>
    </div>
  );
};
