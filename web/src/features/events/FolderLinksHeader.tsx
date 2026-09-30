import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { call, errorMessage } from '../../lib/api';
import { PixelButton } from '../../components/ui/PixelButton';

interface FolderSetting {
  key: 'defaultAttendanceFolderId' | 'defaultVideoFolderId';
  label: string;
  button: string;
}

const FOLDERS: FolderSetting[] = [
  { key: 'defaultAttendanceFolderId', label: 'Attendance master folder', button: 'CHANGE ATTENDANCE FOLDER' },
  { key: 'defaultVideoFolderId', label: 'Video master folder', button: 'CHANGE VIDEO FOLDER' }
];

interface SetLinkResult {
  moved?: number;
  created?: number;
  reused?: number;
}

const FolderRow: React.FC<{ folder: FolderSetting; value?: string }> = ({ folder, value }) => {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => (await call<SetLinkResult>('settings.setLink', { key: folder.key, url: url.trim() })).data,
    onSuccess: r => {
      setEditing(false);
      setError(null);
      setNote(
        r.moved !== undefined
          ? `Moved ${r.moved}, created ${r.created}, reused ${r.reused} event folders`
          : 'Saved.'
      );
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
    onError: err => setError(errorMessage(err))
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 font-body text-sm text-[var(--c-ink)]">
        <strong>{folder.label}:</strong>
        {value ? (
          <a href={`https://drive.google.com/drive/folders/${value}`} target="_blank" rel="noreferrer" className="underline text-[var(--c-navy)]">
            open ↗
          </a>
        ) : (
          <span className="font-bold text-[var(--c-red)]">not set</span>
        )}
        <PixelButton size="md" variant="secondary" onClick={() => setEditing(v => !v)}>
          {editing ? 'CLOSE' : folder.button}
        </PixelButton>
      </div>
      {editing && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            aria-label={`${folder.label} link`}
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/…"
            className="flex-1 min-h-[44px] px-3 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] font-mono text-xs"
          />
          <PixelButton size="md" disabled={!url.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'SAVING…' : 'SAVE'}
          </PixelButton>
        </div>
      )}
      {note && <p className="font-body text-sm font-bold text-[var(--c-darkgreen)]">{note}</p>}
      {error && <p role="alert" className="font-body text-sm font-bold text-[var(--c-red)]">⚠ {error}</p>}
    </div>
  );
};

/** The two master folder links, moved here from the Attendance page. */
export const FolderLinksHeader: React.FC = () => {
  const { data: settings = {} } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await call<Record<string, string>>('settings.get')).data || {}
  });

  return (
    <div className="bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] p-4 space-y-3">
      <p className="font-body text-sm text-[var(--c-darkgrey)]">
        Each event gets its own folder inside these. Share both with the club Gmail as Editor.
      </p>
      {FOLDERS.map(f => (
        <FolderRow key={f.key} folder={f} value={settings[f.key]} />
      ))}
    </div>
  );
};
