import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { call, errorMessage } from '../../lib/api';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';

interface RetentionPreview {
  due: { matricKey: string; fullName: string; lastEventName: string; lastEventEnd: string }[];
  formsToClean: { eventName: string; sourceSheetId: string }[];
}

/** Dancers whose last event ended more than 3 years ago; wiped only after the admin confirms. */
export const RetentionPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<RetentionPreview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useMutation({
    mutationFn: async () => (await call<RetentionPreview>('retention.preview')).data,
    onSuccess: p => {
      setPreview(p);
      setSelected(p.due.map(d => d.matricKey));
      setNote(null);
      setError(null);
    },
    onError: err => setError(errorMessage(err))
  });

  const wipe = useMutation({
    mutationFn: async () => (await call<{ wiped: number }>('retention.apply', { matricKeys: selected })).data,
    onSuccess: async r => {
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      setNote(`Removed ${r.wiped} dancers`);
      setPreview(null);
    },
    onError: err => setError(errorMessage(err))
  });

  const toggle = (matricKey: string) =>
    setSelected(s => (s.includes(matricKey) ? s.filter(k => k !== matricKey) : [...s, matricKey]));

  return (
    <Panel title="DATA RETENTION (3 YEARS)" className="px-corners bg-[var(--night-2)] space-y-3">
      <p className="font-body text-base text-[var(--text-1)]">
        Dancer details are kept for 3 years after the last event they joined. Removing them keeps attendance counts, but
        the dancer can no longer log in unless they register again.
      </p>
      <PixelButton size="md" variant="secondary" disabled={check.isPending} onClick={() => check.mutate()}>
        {check.isPending ? 'CHECKING…' : 'CHECK'}
      </PixelButton>

      {preview && preview.due.length === 0 && (
        <p className="font-body text-base text-[var(--text-1)]">No dancer data is due for removal.</p>
      )}

      {preview && preview.due.length > 0 && (
        <div className="space-y-3">
          <div className="pixel-scrollbar overflow-x-auto">
            <table className="w-full text-left border-collapse font-body text-sm">
              <thead>
                <tr className="border-b-2 border-[var(--neon-cyan)] bg-[var(--night-2)] font-display text-[12px] text-[var(--text-1)]">
                  <th className="p-2">REMOVE</th>
                  <th className="p-2">NAME</th>
                  <th className="p-2">MATRIC</th>
                  <th className="p-2">LAST EVENT</th>
                  <th className="p-2">ENDED</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-[var(--outline)]">
                {preview.due.map(d => (
                  <tr key={d.matricKey} className="min-h-[48px] odd:bg-[var(--night-2)] even:bg-[var(--violet-1)] hover:bg-[var(--violet-2)]">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        aria-label={`Remove ${d.fullName}`}
                        checked={selected.includes(d.matricKey)}
                        onChange={() => toggle(d.matricKey)}
                        className="w-5 h-5 cursor-pointer"
                      />
                    </td>
                    <td className="p-2 text-[var(--text-1)] font-bold">{d.fullName}</td>
                    <td className="p-2 font-mono text-[var(--text-1)]">{d.matricKey}</td>
                    <td className="p-2 text-[var(--text-2)]">{d.lastEventName}</td>
                    <td className="p-2 font-mono text-[var(--text-2)]">{d.lastEventEnd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.formsToClean.length > 0 && (
            <div className="border-2 border-[var(--outline)] bg-[var(--violet-2)] p-3 space-y-1">
              <p className="font-body text-sm text-[var(--text-1)]">
                These registration forms only hold dancers being removed. Delete their old responses in Google Forms too:
              </p>
              <ul className="list-disc pl-5 font-body text-sm">
                {preview.formsToClean.map(f => (
                  <li key={f.sourceSheetId}>
                    <a href={`https://docs.google.com/spreadsheets/d/${f.sourceSheetId}`} target="_blank" rel="noreferrer" className="underline text-[var(--neon-cyan)]">
                      {f.eventName}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <PixelButton
            variant="danger"
            size="md"
            disabled={selected.length === 0 || wipe.isPending}
            onClick={() => {
              if (window.confirm(`Permanently remove personal details of ${selected.length} dancers? Attendance counts are kept.`)) {
                wipe.mutate();
              }
            }}
          >
            {wipe.isPending ? 'REMOVING…' : 'WIPE SELECTED'}
          </PixelButton>
        </div>
      )}

      {note && <p className="font-body font-bold text-base text-[var(--neon-green)]">{note}</p>}
      {error && <p role="alert" className="font-body font-bold text-sm text-[var(--neon-red)]">{error}</p>}
    </Panel>
  );
};
