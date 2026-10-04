import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { ResetTestDataPanel } from './ResetTestDataPanel';
import { RetentionPanel } from './RetentionPanel';
import { STYLE_COLOR } from '../../theme/colors';
import type { DanceStyle, StyleVideoFolder } from '@umdsc/shared';

interface LinkHistoryItem {
  id: string;
  key: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  changedAt: string;
}

const StyleVideoFolderRow: React.FC<{ style: DanceStyle }> = ({ style }) => {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Parse configured folders
  let folders: StyleVideoFolder[] = [];
  if (style.videoFoldersJson) {
    try {
      folders = JSON.parse(style.videoFoldersJson);
    } catch {
      folders = [];
    }
  }
  if (style.videoFolderId && !folders.some((f) => f.id === style.videoFolderId)) {
    folders.unshift({
      id: style.videoFolderId,
      name: `${style.name} Video Folder`,
      url: `https://drive.google.com/drive/folders/${style.videoFolderId}`,
      addedAt: ''
    });
  }

  const addFolderMutation = useMutation({
    mutationFn: async (folderUrl: string) => {
      return await api.post('styles.update', {
        id: style.id,
        version: style.version,
        videoFolderUrl: folderUrl
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['styles'] });
      setStatus({ text: 'VIDEO LINK UPDATED!', type: 'success' });
      setUrl('');
    },
    onError: (err) => {
      setStatus({ text: errorMessage(err), type: 'error' });
    }
  });

  const activateFolderMutation = useMutation({
    mutationFn: async (folderId: string) => {
      return await api.post('styles.update', {
        id: style.id,
        version: style.version,
        activateVideoFolderId: folderId
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['styles'] });
      setStatus({ text: 'FOLDER ACTIVATED!', type: 'success' });
    },
    onError: (err) => {
      setStatus({ text: errorMessage(err), type: 'error' });
    }
  });

  const removeFolderMutation = useMutation({
    mutationFn: async (folderId: string) => {
      return await api.post('styles.update', {
        id: style.id,
        version: style.version,
        removeVideoFolderId: folderId
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['styles'] });
      setStatus({ text: 'FOLDER REMOVED!', type: 'success' });
    },
    onError: (err) => {
      setStatus({ text: errorMessage(err), type: 'error' });
    }
  });

  const color = STYLE_COLOR[style.colorKey] || `var(--c-${style.colorKey})`;

  return (
    <div className="p-3 md:p-4 bg-[var(--night-2)] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)] space-y-3">
      {/* Style Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b-2 border-[var(--outline)]">
        <div className="flex items-center gap-2">
          <span
            className="w-4 h-4 border border-[var(--outline)] inline-block flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="font-display text-xs md:text-sm text-[var(--text-1)] font-bold">
            {style.name.toUpperCase()}
          </span>
        </div>
        <span className="font-mono text-xs text-[var(--text-2)]">
          {folders.length} {folders.length === 1 ? 'folder configured' : 'folders configured'}
        </span>
      </div>

      {status && (
        <div
          role="alert"
          className={`p-2 font-body font-bold text-xs border-2 ${
            status.type === 'error'
              ? 'bg-[var(--violet-2)] border-[var(--neon-red)] text-[var(--neon-red)]'
              : 'bg-[var(--night-1)] border-[var(--neon-green)] text-[var(--neon-green)]'
          }`}
        >
          {status.type === 'error' ? '⚠ ' : '✓ '} {status.text}
        </div>
      )}

      {/* Folders List */}
      {folders.length === 0 ? (
        <p className="font-body text-xs text-[var(--neon-red)] font-bold">
          No video folders configured for this style yet.
        </p>
      ) : (
        <div className="space-y-2">
          {folders.map((folder) => {
            const isActive = style.videoFolderId === folder.id;
            return (
              <div
                key={folder.id}
                className={`p-2.5 border-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 ${
                  isActive
                    ? 'bg-[var(--night-1)] border-[var(--outline)] shadow-[2px_2px_0_var(--outline)]'
                    : 'bg-[var(--night-2)] border-[var(--outline)]'
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {isActive ? (
                      <span className="font-display text-[10px] px-1.5 py-0.5 bg-[var(--neon-green)] text-[var(--on-neon)] border border-[var(--outline)] font-bold">
                        ● ACTIVE
                      </span>
                    ) : (
                      <span className="font-display text-[10px] px-1.5 py-0.5 bg-[var(--night-1)] text-[var(--text-2)] border border-[var(--outline)] font-bold">
                        INACTIVE
                      </span>
                    )}
                    <span className="font-display text-xs text-[var(--text-1)] font-bold truncate">
                      {folder.name || 'Video Folder'}
                    </span>
                  </div>
                  <div className="font-mono text-[12px]">
                    <a
                      href={`https://drive.google.com/drive/folders/${folder.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--neon-cyan)] font-bold underline hover:text-[var(--text-1)]"
                    >
                      Open in Drive ↗ ({folder.id.slice(0, 10)}…)
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-1 sm:pt-0">
                  {!isActive && (
                    <PixelButton
                      size="sm"
                      variant="secondary"
                      disabled={activateFolderMutation.isPending}
                      onClick={() => activateFolderMutation.mutate(folder.id)}
                    >
                      ACTIVATE
                    </PixelButton>
                  )}
                  <PixelButton
                    size="sm"
                    variant="danger"
                    disabled={removeFolderMutation.isPending}
                    onClick={() => removeFolderMutation.mutate(folder.id)}
                  >
                    REMOVE
                  </PixelButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Folder Form */}
      <div className="pt-2 border-t border-[var(--outline)] space-y-1">
        <span className="font-display text-[10px] text-[var(--text-1)] font-bold">
          + ADD GOOGLE DRIVE FOLDER LINK:
        </span>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            aria-label={`${style.name} video folder link`}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className="flex-1 min-h-[44px] px-3 border-2 border-[var(--outline)] font-mono text-base bg-[var(--night-1)] text-[var(--text-1)]"
          />
          <PixelButton
            size="md"
            variant="primary"
            className="w-full sm:w-auto"
            disabled={addFolderMutation.isPending || !url.trim()}
            onClick={() => addFolderMutation.mutate(url.trim())}
          >
            {addFolderMutation.isPending ? 'SAVING…' : 'UPDATE LINK'}
          </PixelButton>
        </div>
      </div>
    </div>
  );
};

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

  const { data: styles = [], isLoading: loadingStyles } = useQuery<DanceStyle[]>({
    queryKey: ['styles'],
    queryFn: async () => {
      const res = await api.post<DanceStyle[]>('styles.list');
      return res.data || [];
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
        <h1 className="font-display text-lg tracking-wider text-[var(--text-1)]">
          System Settings
        </h1>
        <p className="font-body text-base text-[var(--text-2)] mt-1">
          Configure Google Drive folders, system links, and view link update history.
        </p>
      </div>

      <ResetTestDataPanel />
      <RetentionPanel />

      {/* Permissions & Service Account Banner */}
      <div className="bg-[var(--violet-2)] border-2 border-[var(--outline)] p-4 shadow-[2px_2px_0_var(--outline)] space-y-2">
        <h3 className="font-display text-xs text-[var(--neon-gold)] uppercase font-bold">
          GOOGLE DRIVE ACCESS REQUIREMENT
        </h3>
        <p className="font-body text-base text-[var(--text-2)]">
          Every Google Drive folder or spreadsheet used by this system must be shared with{' '}
          <strong className="font-mono text-sm text-[var(--neon-gold)] bg-[var(--night-1)] px-2 py-0.5 border border-[var(--outline)]">
            {clubEmail}
          </strong>{' '}
          as <strong className="text-[var(--text-1)]">Editor</strong> before setting the link.
        </p>
      </div>

      {loadingSettings ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Default Attendance Folder */}
          <Panel title="DEFAULT ATTENDANCE FOLDER" className="px-corners bg-[var(--night-2)] space-y-3">
            <div className="font-mono text-xs text-[var(--text-2)]">
              Current ID:{' '}
              <span className="text-[var(--text-1)] font-bold">
                {settings.defaultAttendanceFolderId || 'Not Configured'}
              </span>
            </div>

            {statusMessage?.key === 'defaultAttendanceFolderId' && (
              <div
                role="alert"
                className={`p-3 font-body font-bold text-sm border-2 ${
                  statusMessage.type === 'error'
                    ? 'bg-[var(--violet-2)] border-[var(--neon-red)] text-[var(--neon-red)]'
                    : 'bg-[var(--night-1)] border-[var(--neon-green)] text-[var(--neon-green)]'
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
                  className="flex-1 min-h-[44px] px-3 border-2 border-[var(--outline)] font-mono text-base bg-[var(--night-1)] text-[var(--text-1)]"
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

          {/* Video Folders by Dance Style */}
          <Panel title="VIDEO FOLDERS BY DANCE STYLE" className="px-corners bg-[var(--night-2)] space-y-3">
            <p className="font-body text-sm text-[var(--text-2)]">
              Class recap videos are stored in Google Drive. Different dance styles can have different Google Drive folder links, managed by each dance style&apos;s team member or account.
            </p>

            {loadingStyles ? (
              <div className="p-4 text-center">
                <Spinner size="md" />
              </div>
            ) : styles.length === 0 ? (
              <p className="font-body text-xs text-[var(--text-2)]">No dance styles configured.</p>
            ) : (
              <div className="space-y-3">
                {styles.map((style) => (
                  <StyleVideoFolderRow key={style.id} style={style} />
                ))}
              </div>
            )}
          </Panel>

          {/* Default / Fallback Video Folder */}
          <Panel title="DEFAULT / FALLBACK VIDEO FOLDER" className="px-corners bg-[var(--night-2)] space-y-3">
            <div className="font-mono text-xs text-[var(--text-2)]">
              Current ID:{' '}
              <span className="text-[var(--text-1)] font-bold">
                {settings.defaultVideoFolderId || 'Not Configured'}
              </span>
            </div>

            {statusMessage?.key === 'defaultVideoFolderId' && (
              <div
                role="alert"
                className={`p-3 font-body font-bold text-sm border-2 ${
                  statusMessage.type === 'error'
                    ? 'bg-[var(--violet-2)] border-[var(--neon-red)] text-[var(--neon-red)]'
                    : 'bg-[var(--night-1)] border-[var(--neon-green)] text-[var(--neon-green)]'
                }`}
              >
                {statusMessage.text}
              </div>
            )}

            <Field
              label="Default Video Folder Link"
              hint="Used as a fallback for dance styles without a dedicated video folder link"
            >
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="default-video-folder-link"
                  aria-label="Default Video Folder Link"
                  type="url"
                  value={vidUrl}
                  onChange={(e) => setVidUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="flex-1 min-h-[44px] px-3 border-2 border-[var(--outline)] font-mono text-base bg-[var(--night-1)] text-[var(--text-1)]"
                />
                <PixelButton
                  size="md"
                  variant="primary"
                  className="w-full sm:w-auto"
                  disabled={setLinkMutation.isPending || !vidUrl.trim()}
                  onClick={() =>
                    setLinkMutation.mutate({
                      key: 'defaultVideoFolderId',
                      url: vidUrl.trim()
                    })
                  }
                >
                  UPDATE DEFAULT LINK
                </PixelButton>
              </div>
            </Field>
          </Panel>

          {/* Database Folder */}
          <Panel title="DATABASE FOLDER" className="px-corners bg-[var(--night-2)] space-y-3">
            <div className="font-mono text-xs text-[var(--text-2)]">
              Current ID:{' '}
              <span className="text-[var(--text-1)] font-bold">
                {settings.dbFolderId || 'Not Configured'}
              </span>
            </div>

            {statusMessage?.key === 'dbFolderId' && (
              <div
                role="alert"
                className={`p-3 font-body font-bold text-sm border-2 ${
                  statusMessage.type === 'error'
                    ? 'bg-[var(--violet-2)] border-[var(--neon-red)] text-[var(--neon-red)]'
                    : 'bg-[var(--night-1)] border-[var(--neon-green)] text-[var(--neon-green)]'
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
                  className="flex-1 min-h-[44px] px-3 border-2 border-[var(--outline)] font-mono text-base bg-[var(--night-1)] text-[var(--text-1)]"
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
          <Panel title="LINK UPDATE HISTORY" className="px-corners bg-[var(--night-2)] space-y-3">
            {loadingHistory ? (
              <div className="p-4 text-center">
                <Spinner />
              </div>
            ) : history.length === 0 ? (
              <p className="font-body text-base text-[var(--text-2)] italic">
                No link changes recorded in history yet.
              </p>
            ) : (
              <div className="pixel-scrollbar overflow-x-auto">
                <table className="w-full text-left font-mono text-xs border-collapse">
                  <thead>
                    <tr className="border-b-2 border-[var(--neon-cyan)] bg-[var(--night-2)] font-display text-[12px] text-[var(--text-1)]">
                      <th className="p-2">KEY</th>
                      <th className="p-2">OLD VALUE</th>
                      <th className="p-2">NEW VALUE</th>
                      <th className="p-2">CHANGED BY</th>
                      <th className="p-2">DATE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-[var(--outline)]">
                    {history.map((h, i) => (
                      <tr key={h.id || i} className="min-h-[48px] odd:bg-[var(--night-2)] even:bg-[var(--violet-1)] hover:bg-[var(--violet-2)]">
                        <td className="p-2 font-bold text-[var(--text-1)]">{h.key}</td>
                        <td className="p-2 text-[var(--text-2)] truncate max-w-[120px]">{h.oldValue || '-'}</td>
                        <td className="p-2 text-[var(--neon-green)] truncate max-w-[120px] font-bold">{h.newValue}</td>
                        <td className="p-2 text-[var(--text-1)]">{h.changedBy}</td>
                        <td className="p-2 text-[var(--text-2)]">{new Date(h.changedAt).toLocaleString()}</td>
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
