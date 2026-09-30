import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { ResetTestDataPanel } from './ResetTestDataPanel';
import { RetentionPanel } from './RetentionPanel';

interface LinkHistoryItem {
  id: string;
  key: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  changedAt: string;
}

export const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [attUrl, setAttUrl] = useState('');
  const [vidUrl, setVidUrl] = useState('');
  const [dbUrl, setDbUrl] = useState('');

  const [statusMessage, setStatusMessage] = useState<{
    key: string;
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  const { data: settings = {}, isLoading: loadingSettings } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.post<Record<string, string>>('settings.get');
      return res.data;
    }
  });

  const { data: history = [], isLoading: loadingHistory } = useQuery<LinkHistoryItem[]>({
    queryKey: ['links.history'],
    queryFn: async () => {
      const res = await api.post<LinkHistoryItem[]>('links.history');
      return res.data;
    }
  });

  const setLinkMutation = useMutation({
    mutationFn: async ({ key, url }: { key: string; url: string }) => {
      return await api.post('settings.setLink', { key, url });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['links.history'] });
      setStatusMessage({
        key: variables.key,
        text: 'LINK UPDATED SUCCESSFULLY!',
        type: 'success'
      });
      if (variables.key === 'defaultAttendanceFolderId') setAttUrl('');
      if (variables.key === 'defaultVideoFolderId') setVidUrl('');
      if (variables.key === 'dbFolderId') setDbUrl('');
    },
    onError: (err, variables) => {
      setStatusMessage({
        key: variables.key,
        text: errorMessage(err),
        type: 'error'
      });
    }
  });

  const clubEmail = settings.clubEmail || 'umdancesportc@gmail.com';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-lg tracking-wider text-[var(--c-ink)]">
          System Settings
        </h1>
        <p className="font-body text-base text-[var(--c-darkgrey)] mt-1">
          Configure Google Drive folders, system links, and view link update history.
        </p>
      </div>

      <ResetTestDataPanel />
      <RetentionPanel />

      {/* Permissions & Service Account Banner */}
      <div className="bg-[var(--c-peach)] border-4 border-[var(--c-ink)] p-4 shadow-[4px_4px_0_var(--c-ink)] space-y-2">
        <h3 className="font-display text-xs text-[var(--c-ink)] uppercase">
          GOOGLE DRIVE ACCESS REQUIREMENT
        </h3>
        <p className="font-body text-base text-[var(--c-darkgrey)]">
          Every Google Drive folder or spreadsheet used by this system must be shared with{' '}
          <strong className="font-mono text-sm text-[var(--c-ink)] bg-[var(--c-bg)] px-2 py-0.5 border border-[var(--c-ink)]">
            {clubEmail}
          </strong>{' '}
          as <strong className="text-[var(--c-ink)]">Editor</strong> before setting the link.
        </p>
      </div>

      {loadingSettings ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Default Attendance Folder */}
          <Panel title="DEFAULT ATTENDANCE FOLDER" className="px-corners space-y-3">
            <div className="font-mono text-xs text-[var(--c-darkgrey)]">
              Current ID:{' '}
              <span className="text-[var(--c-ink)] font-bold">
                {settings.defaultAttendanceFolderId || 'Not Configured'}
              </span>
            </div>

            {statusMessage?.key === 'defaultAttendanceFolderId' && (
              <div
                role="alert"
                className={`p-3 font-body font-bold text-sm border-4 ${
                  statusMessage.type === 'error'
                    ? 'bg-[var(--c-peach)] border-[var(--c-red)] text-[var(--c-red)]'
                    : 'bg-[var(--c-bg)] border-[var(--c-darkgreen)] text-[var(--c-darkgreen)]'
                }`}
              >
                {statusMessage.text}
              </div>
            )}

            <Field
              label="Default Attendance Folder Link"
              hint="New monthly attendance sheets are created in this folder by default"
            >
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="default-attendance-folder-link"
                  aria-label="Default Attendance Folder Link"
                  type="url"
                  value={attUrl}
                  onChange={(e) => setAttUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="flex-1 min-h-[44px] px-3 border-2 border-[var(--c-ink)] font-mono text-xs bg-[var(--c-bg)]"
                />
                <PixelButton
                  size="md"
                  variant="primary"
                  disabled={setLinkMutation.isPending || !attUrl.trim()}
                  onClick={() =>
                    setLinkMutation.mutate({
                      key: 'defaultAttendanceFolderId',
                      url: attUrl.trim()
                    })
                  }
                >
                  UPDATE ATTENDANCE LINK
                </PixelButton>
              </div>
            </Field>
          </Panel>

          {/* Default Video Folder */}
          <Panel title="DEFAULT VIDEO FOLDER" className="px-corners space-y-3">
            <div className="font-mono text-xs text-[var(--c-darkgrey)]">
              Current ID:{' '}
              <span className="text-[var(--c-ink)] font-bold">
                {settings.defaultVideoFolderId || 'Not Configured'}
              </span>
            </div>

            {statusMessage?.key === 'defaultVideoFolderId' && (
              <div
                role="alert"
                className={`p-3 font-body font-bold text-sm border-4 ${
                  statusMessage.type === 'error'
                    ? 'bg-[var(--c-peach)] border-[var(--c-red)] text-[var(--c-red)]'
                    : 'bg-[var(--c-bg)] border-[var(--c-darkgreen)] text-[var(--c-darkgreen)]'
                }`}
              >
                {statusMessage.text}
              </div>
            )}

            <Field
              label="Default Video Folder Link"
              hint="Class recap videos are uploaded and stored in this folder"
            >
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="default-video-folder-link"
                  aria-label="Default Video Folder Link"
                  type="url"
                  value={vidUrl}
                  onChange={(e) => setVidUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="flex-1 min-h-[44px] px-3 border-2 border-[var(--c-ink)] font-mono text-xs bg-[var(--c-bg)]"
                />
                <PixelButton
                  size="md"
                  variant="primary"
                  disabled={setLinkMutation.isPending || !vidUrl.trim()}
                  onClick={() =>
                    setLinkMutation.mutate({
                      key: 'defaultVideoFolderId',
                      url: vidUrl.trim()
                    })
                  }
                >
                  UPDATE VIDEO LINK
                </PixelButton>
              </div>
            </Field>
          </Panel>

          {/* Database Folder */}
          <Panel title="DATABASE FOLDER" className="px-corners space-y-3">
            <div className="font-mono text-xs text-[var(--c-darkgrey)]">
              Current ID:{' '}
              <span className="text-[var(--c-ink)] font-bold">
                {settings.dbFolderId || 'Not Configured'}
              </span>
            </div>

            {statusMessage?.key === 'dbFolderId' && (
              <div
                role="alert"
                className={`p-3 font-body font-bold text-sm border-4 ${
                  statusMessage.type === 'error'
                    ? 'bg-[var(--c-peach)] border-[var(--c-red)] text-[var(--c-red)]'
                    : 'bg-[var(--c-bg)] border-[var(--c-darkgreen)] text-[var(--c-darkgreen)]'
                }`}
              >
                {statusMessage.text}
              </div>
            )}

            <Field
              label="Database Folder Link"
              hint="Primary folder where the system Sheets and tables live"
            >
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="database-folder-link"
                  aria-label="Database Folder Link"
                  type="url"
                  value={dbUrl}
                  onChange={(e) => setDbUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="flex-1 min-h-[44px] px-3 border-2 border-[var(--c-ink)] font-mono text-xs bg-[var(--c-bg)]"
                />
                <PixelButton
                  size="md"
                  variant="primary"
                  disabled={setLinkMutation.isPending || !dbUrl.trim()}
                  onClick={() =>
                    setLinkMutation.mutate({
                      key: 'dbFolderId',
                      url: dbUrl.trim()
                    })
                  }
                >
                  UPDATE DB LINK
                </PixelButton>
              </div>
            </Field>
          </Panel>

          {/* Link History */}
          <Panel title="LINK UPDATE HISTORY" className="px-corners space-y-3">
            {loadingHistory ? (
              <div className="p-4 text-center">
                <Spinner />
              </div>
            ) : history.length === 0 ? (
              <p className="font-body text-base text-[var(--c-darkgrey)] italic">
                No link changes recorded in history yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs border-collapse">
                  <thead>
                    <tr className="border-b-4 border-[var(--c-ink)] bg-[var(--c-bg)] font-display text-[10px] text-[var(--c-ink)]">
                      <th className="p-2">KEY</th>
                      <th className="p-2">OLD VALUE</th>
                      <th className="p-2">NEW VALUE</th>
                      <th className="p-2">CHANGED BY</th>
                      <th className="p-2">DATE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-[var(--c-ink)]">
                    {history.map((h, i) => (
                      <tr key={h.id || i} className="hover:bg-[var(--c-bg)]">
                        <td className="p-2 font-bold">{h.key}</td>
                        <td className="p-2 text-[var(--c-darkgrey)] truncate max-w-[120px]">{h.oldValue || '-'}</td>
                        <td className="p-2 text-[var(--c-darkgreen)] truncate max-w-[120px] font-bold">{h.newValue}</td>
                        <td className="p-2">{h.changedBy}</td>
                        <td className="p-2">{new Date(h.changedAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
};
export default SettingsPage;
