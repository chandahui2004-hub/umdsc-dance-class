import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { call, errorMessage } from '../../lib/api';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';

const PHRASE = 'DELETE TEST DATA';

/** One-time clean-up of the old month-based test data. Hidden once done. */
export const ResetTestDataPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState('');
  const [backupId, setBackupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: status } = useQuery({
    queryKey: ['resetStatus'],
    queryFn: async () => (await call<{ needed: boolean }>('admin.resetStatus')).data
  });

  const reset = useMutation({
    mutationFn: async () => (await call<{ backupSpreadsheetId: string }>('admin.resetTestData', { confirm: typed })).data,
    onSuccess: r => {
      setError(null);
      setBackupId(r.backupSpreadsheetId);
      queryClient.invalidateQueries();
    },
    onError: err => setError(errorMessage(err))
  });

  if (backupId) {
    return (
      <Panel title="RESET TEST DATA" className="px-corners">
        <p className="font-body text-base text-[var(--c-ink)]">
          Done. Backup:{' '}
          <a href={`https://docs.google.com/spreadsheets/d/${backupId}`} target="_blank" rel="noreferrer" className="underline text-[var(--c-navy)]">
            open backup sheet ↗
          </a>
        </p>
      </Panel>
    );
  }
  if (!status?.needed) return null;

  return (
    <Panel title="RESET TEST DATA" className="px-corners space-y-3">
      <p className="font-body text-base text-[var(--c-ink)]">
        Clears the old month-based test classes, dancers, attendance records, videos and music so events can start
        fresh. A backup copy of the system spreadsheet is made first. Admins, roles, dance styles, instructors and
        folder settings are kept. Files in Drive are not touched.
      </p>
      <label className="block space-y-1">
        <span className="font-display text-[10px] text-[var(--c-ink)]">Type DELETE TEST DATA to confirm</span>
        <input
          aria-label="Type DELETE TEST DATA to confirm"
          value={typed}
          onChange={e => setTyped(e.target.value)}
          className="w-full min-h-[44px] px-3 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] font-mono text-sm"
        />
      </label>
      <PixelButton variant="danger" size="md" disabled={typed !== PHRASE || reset.isPending} onClick={() => reset.mutate()}>
        {reset.isPending ? 'RESETTING…' : 'RESET TEST DATA'}
      </PixelButton>
      {error && <p role="alert" className="font-body font-bold text-sm text-[var(--c-red)]">{error}</p>}
    </Panel>
  );
};
