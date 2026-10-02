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
        <span className="font-display text-xs text-[var(--text-1)]">GOOGLE FORM RESPONSE SHEET LINK</span>
        <input
          aria-label="Google Sheet Link"
          value={draft.sheetUrl}
          onChange={e => onChange({ sheetUrl: e.target.value, preview: null })}
          placeholder="https://docs.google.com/spreadsheets/d/…"
          className="w-full min-h-[44px] px-3 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] font-mono text-xs"
        />
        <span className="font-body text-xs text-[var(--text-2)]">
          Share the sheet with umdancesportc@gmail.com as Editor first.
        </span>
      </label>

      <PixelButton size="md" disabled={!draft.sheetUrl.trim() || preview.isPending} onClick={() => preview.mutate()}>
        {preview.isPending ? 'READING SHEET…' : 'READ SHEET'}
      </PixelButton>

      {error && (
        <p role="alert" className="p-3 border-4 border-[var(--c-red)] bg-[var(--c-peach)] font-body font-bold text-sm text-[var(--c-red)]">
          {error}
        </p>
      )}

      {p && (
        <div className="space-y-4">
          <p className="font-body text-base text-[var(--text-1)]">
            Found <strong>{p.rowCount}</strong> registrations in tab “{p.sourceTab}”
            {p.sampleNames.length > 0 && <> — e.g. {p.sampleNames.join(', ')}</>}.
          </p>

          <table className="w-full text-left border-collapse font-body text-sm">
            <thead>
              <tr className="border-b-4 border-[var(--c-ink)] font-display text-[10px] text-[var(--text-1)]">
                <th className="p-2">FIELD</th>
                <th className="p-2">COLUMN IN THE FORM</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-[var(--c-ink)]">
              {Object.entries(FIELD_LABELS).map(([key, label]) => (
                <tr key={key}>
                  <td className="p-2 font-bold">{label}</td>
                  <td className="p-2">
                    <select
                      aria-label={`${label} column`}
                      value={draft.columnMap[key] ?? ''}
                      onChange={e =>
                        onChange({ columnMap: { ...draft.columnMap, [key]: e.target.value === '' ? null : Number(e.target.value) } })
                      }
                      className="w-full min-h-[44px] px-2 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] font-mono text-xs"
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
              <tr>
                <td className="p-2 font-bold">Class choice</td>
                <td className="p-2">
                  <select
                    aria-label="Class choice column"
                    value={draft.classIndex}
                    onChange={e => onChange({ classIndex: Number(e.target.value) })}
                    className="w-full min-h-[44px] px-2 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] font-mono text-xs"
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
            <details className="border-2 border-[var(--c-ink)] bg-[var(--c-peach)] p-3">
              <summary className="font-display text-[10px] cursor-pointer">{p.warnings.length} NOTES ABOUT THE FORM</summary>
              <ul className="mt-2 space-y-1 font-mono text-xs max-h-40 overflow-y-auto">
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

      <div className="flex justify-end pt-3 border-t-2 border-[var(--c-ink)]">
        <PixelButton size="md" disabled={!canContinue} onClick={onNext}>
          NEXT
        </PixelButton>
      </div>
    </div>
  );
};
