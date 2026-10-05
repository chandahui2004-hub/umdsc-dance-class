import React, { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DanceStyle, EventItem } from '@umdsc/shared';
import { api, errorMessage } from '../../lib/api';
import { session } from '../../lib/session';
import { can } from '../../lib/permissions';
import { PixelButton } from '../../components/ui/PixelButton';
import { openInDriveUrl } from '../../lib/google/driveUrls';
import { getAccessToken } from '../../lib/google/gis';
import { pickFolder, checkFolderAccess } from '../../lib/google/picker';

const SWATCH_COLORS: Record<string, string> = {
  green: 'var(--c-green)',
  blue: 'var(--c-blue)',
  orange: 'var(--c-orange)',
  pink: 'var(--c-pink)',
  yellow: 'var(--c-yellow)',
  lavender: 'var(--c-lavender)',
  peach: 'var(--c-peach)',
  darkgreen: 'var(--c-darkgreen)'
};

interface ClassLeadVideoFoldersPanelProps {
  event: EventItem | null;
  styles: DanceStyle[];
}

export const ClassLeadVideoFoldersPanel: React.FC<ClassLeadVideoFoldersPanelProps> = ({
  event,
  styles
}) => {
  const queryClient = useQueryClient();
  const currentClaims = session.get()?.claims;
  const canEdit = can(currentClaims?.perms, 'styles.edit');

  // Starts expanded when any style lacks videoFolderId; collapsed when all have links
  const hasMissing = useMemo(() => styles.some((s) => !s.videoFolderId), [styles]);
  const [isExpanded, setIsExpanded] = useState<boolean>(() => styles.some((s) => !s.videoFolderId));

  // Inline editing state: styleId -> URL input
  const [editingStyleId, setEditingStyleId] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Folder authorization state: folderId -> boolean
  const [authorizedFolders, setAuthorizedFolders] = useState<Record<string, boolean>>({});
  const [isAuthorizing, setIsAuthorizing] = useState<Record<string, boolean>>({});

  const isCoarsePointer = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  // Check access for linked folders
  useEffect(() => {
    let cancelled = false;
    const checkAll = async () => {
      try {
        const token = await getAccessToken();
        for (const s of styles) {
          if (s.videoFolderId && authorizedFolders[s.videoFolderId] === undefined) {
            const hasAccess = await checkFolderAccess(token, s.videoFolderId);
            if (!cancelled) {
              setAuthorizedFolders((prev) => ({ ...prev, [s.videoFolderId]: hasAccess }));
            }
          }
        }
      } catch {
        // Token not available or check failed; user can authorize on click
      }
    };
    checkAll();
    return () => {
      cancelled = true;
    };
  }, [styles]);

  const saveMutation = useMutation({
    mutationFn: async ({ style, url }: { style: DanceStyle; url: string }) => {
      const res = await api.post('styles.update', {
        id: style.id,
        version: style.version,
        videoFolderUrl: url
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['styles'] });
      setEditingStyleId(null);
      setUrlInput('');
      setSaveError(null);
    },
    onError: (err) => {
      setSaveError(errorMessage(err));
    }
  });

  const handleStartEdit = (style: DanceStyle) => {
    setEditingStyleId(style.id);
    setUrlInput(style.videoFolderId ? `https://drive.google.com/drive/folders/${style.videoFolderId}` : '');
    setSaveError(null);
  };

  const handleSave = (style: DanceStyle) => {
    saveMutation.mutate({ style, url: urlInput });
  };

  const handleAuthorize = async (style: DanceStyle) => {
    if (!style.videoFolderId) return;
    setIsAuthorizing((prev) => ({ ...prev, [style.videoFolderId]: true }));
    try {
      const token = await getAccessToken();
      await pickFolder(token, style.videoFolderId);
      const hasAccess = await checkFolderAccess(token, style.videoFolderId);
      setAuthorizedFolders((prev) => ({ ...prev, [style.videoFolderId]: hasAccess }));
    } catch (err: any) {
      alert(`Authorization failed: ${err.message || err}`);
    } finally {
      setIsAuthorizing((prev) => ({ ...prev, [style.videoFolderId]: false }));
    }
  };

  if (!event) return null;

  const linkedCount = styles.filter((s) => Boolean(s.videoFolderId)).length;

  return (
    <section
      data-testid="class-lead-video-folders-panel"
      className="bg-[var(--night-2)] border-2 border-[var(--outline)] shadow-[4px_4px_0_var(--outline)] p-4 space-y-3"
    >
      {/* Header bar with toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display text-[12px] text-[var(--neon-cyan)] tracking-wider uppercase font-bold">
            CLASS LEAD VIDEO DRIVE FOLDERS
          </span>
          <span
            className={`font-display text-[10px] px-2 py-0.5 border border-[var(--outline)] font-bold ${
              hasMissing
                ? 'bg-[var(--neon-red)] text-white'
                : 'bg-[var(--neon-green)] text-[var(--on-neon)]'
            }`}
          >
            {hasMissing ? `${styles.length - linkedCount} MISSING LINK` : `${linkedCount}/${styles.length} LINKED`}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          data-testid="toggle-folders-panel"
          className="font-display text-[10px] uppercase text-[var(--text-1)] bg-[var(--violet-2)] border-2 border-[var(--outline)] px-3 py-1 self-start sm:self-auto cursor-pointer active:translate-x-0.5 active:translate-y-0.5"
        >
          {isExpanded ? '▲ COLLAPSE' : '▼ EXPAND'}
        </button>
      </div>

      {/* Collapsed summary hint */}
      {!isExpanded && (
        <p className="font-body text-xs text-[var(--text-2)]">
          Each dance style's recap videos upload directly to its class lead Google Drive folder.{' '}
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="text-[var(--neon-cyan)] underline hover:text-[var(--neon-pink)] ml-1"
          >
            View style folders
          </button>
        </p>
      )}

      {/* Expanded folder list */}
      {isExpanded && (
        <div className="space-y-3 pt-1">
          <p className="font-body text-xs text-[var(--text-2)]">
            Class recap videos are saved only in each style's designated Google Drive folder. If a link is missing,
            video upload is blocked until a valid Drive folder is inserted.
          </p>

          {styles.length === 0 ? (
            <p className="font-body text-xs text-[var(--text-3)] italic">
              No dance styles configured for this event.
            </p>
          ) : (
            <div className="space-y-2">
              {styles.map((s) => {
                const swatchBg = SWATCH_COLORS[s.colorKey] || 'var(--c-blue)';
                const isEditing = editingStyleId === s.id;
                const isAuthed = s.videoFolderId ? authorizedFolders[s.videoFolderId] : false;

                return (
                  <div
                    key={s.id}
                    data-testid={`folder-row-${s.id}`}
                    className="p-3 bg-[var(--night-1)] border-2 border-[var(--outline)] flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    {/* Style info */}
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 border border-[var(--outline)] shrink-0"
                        style={{ backgroundColor: swatchBg }}
                      />
                      <div>
                        <span className="font-display text-xs font-bold text-[var(--text-1)]">
                          {s.name}
                        </span>
                        {s.videoFolderId ? (
                          <div className="flex items-center gap-2 mt-0.5">
                            <a
                              href={openInDriveUrl(s.videoFolderId)}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-[11px] text-[var(--neon-cyan)] hover:underline flex items-center gap-1"
                            >
                              <span>DRIVE FOLDER ↗</span>
                            </a>
                            {isAuthed ? (
                              <span className="font-display text-[9px] text-[var(--neon-green)] font-bold">
                                ✓ AUTHORIZED
                              </span>
                            ) : !isCoarsePointer ? (
                              <button
                                type="button"
                                onClick={() => handleAuthorize(s)}
                                disabled={isAuthorizing[s.videoFolderId]}
                                className="font-display text-[9px] px-1.5 py-0.5 bg-[var(--neon-gold)] text-[var(--on-neon)] border border-[var(--outline)] uppercase active:translate-y-px"
                              >
                                {isAuthorizing[s.videoFolderId] ? '...' : 'AUTHORIZE'}
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <div className="mt-0.5">
                            <span className="font-display text-[10px] text-[var(--neon-red)] font-bold">
                              ⚠ LINK NOT INSERTED
                            </span>
                            {!canEdit && (
                              <span className="font-body text-[11px] text-[var(--text-3)] ml-2 italic">
                                — ask an admin to add it
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions / Inline edit */}
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
                          <input
                            type="url"
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            placeholder="https://drive.google.com/drive/folders/..."
                            className="px-well px-2 py-1 font-mono text-xs text-[var(--text-1)] w-full sm:w-80 min-h-[36px]"
                            autoFocus
                          />
                          <div className="flex items-center gap-1">
                            <PixelButton
                              size="sm"
                              variant="primary"
                              disabled={saveMutation.isPending || !urlInput.trim()}
                              onClick={() => handleSave(s)}
                            >
                              {saveMutation.isPending ? 'SAVING...' : 'SAVE'}
                            </PixelButton>
                            <PixelButton
                              size="sm"
                              variant="secondary"
                              disabled={saveMutation.isPending}
                              onClick={() => {
                                setEditingStyleId(null);
                                setSaveError(null);
                              }}
                            >
                              CANCEL
                            </PixelButton>
                          </div>
                          {saveError && (
                            <span className="text-[var(--neon-red)] text-xs font-mono">{saveError}</span>
                          )}
                        </div>
                      ) : canEdit ? (
                        <PixelButton
                          size="sm"
                          variant="secondary"
                          onClick={() => handleStartEdit(s)}
                        >
                          {s.videoFolderId ? 'CHANGE LINK' : '+ INSERT LINK'}
                        </PixelButton>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
