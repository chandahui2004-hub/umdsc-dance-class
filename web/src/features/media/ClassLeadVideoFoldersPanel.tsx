import React, { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DanceStyle, EventItem } from '@umdsc/shared';
import { api, errorMessage } from '../../lib/api';
import { session } from '../../lib/session';
import { can } from '../../lib/permissions';
import { PixelButton } from '../../components/ui/PixelButton';
import { openInDriveUrl } from '../../lib/google/driveUrls';
import { getAccessToken, getCachedToken } from '../../lib/google/gis';
import { pickFolder, checkFolderAccess } from '../../lib/google/picker';
import { fetchAccountEmail, sameAccount, useGoogleAccountEmail } from '../../lib/google/googleAccount';
import { GoogleAccountBar } from './GoogleAccountBar';

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

  // Starts expanded when any style lacks a folder link or an upload account; collapsed otherwise
  const hasMissing = useMemo(() => styles.some((s) => !s.videoFolderId), [styles]);
  const [isExpanded, setIsExpanded] = useState<boolean>(() =>
    styles.some((s) => !s.videoFolderId || !s.videoUploaderEmail)
  );
  const currentEmail = useGoogleAccountEmail();

  // Inline editing state: styleId -> URL input
  const [editingStyleId, setEditingStyleId] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Folder authorization state: folderId -> boolean
  const [authorizedFolders, setAuthorizedFolders] = useState<Record<string, boolean>>({});
  const [isAuthorizing, setIsAuthorizing] = useState<Record<string, boolean>>({});

  const isCoarsePointer = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  // Check access for linked folders only if a valid token is already cached (never prompt on mount).
  // Access belongs to a Google account, so re-check whenever the signed-in account changes.
  useEffect(() => {
    let cancelled = false;
    setAuthorizedFolders({});
    const checkAll = async () => {
      const token = getCachedToken();
      if (!token) return;
      try {
        for (const s of styles) {
          if (s.videoFolderId) {
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
  }, [styles, currentEmail]);

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

  const handleRemove = (style: DanceStyle) => {
    const ok = window.confirm(
      `Remove the video folder link for ${style.name}? Videos already in Google Drive stay there. ` +
        `Uploads for ${style.name} are blocked until a new link is inserted.`
    );
    if (ok) {
      saveMutation.mutate(
        { style, url: '' },
        { onError: (err) => alert(`Could not remove the link: ${errorMessage(err)}`) }
      );
    }
  };

  const handleAuthorize = async (style: DanceStyle) => {
    if (!style.videoFolderId) return;
    // Token first, inside the tap, so iOS Safari allows Google's popup.
    const tokenPromise = getAccessToken();
    setIsAuthorizing((prev) => ({ ...prev, [style.videoFolderId]: true }));
    try {
      const token = await tokenPromise;
      await pickFolder(token, style.videoFolderId);
      const hasAccess = await checkFolderAccess(token, style.videoFolderId);
      setAuthorizedFolders((prev) => ({ ...prev, [style.videoFolderId]: hasAccess }));
      if (!hasAccess) {
        throw new Error('Google did not give access to this folder. Try AUTHORIZE again and select the folder.');
      }
      // Remember which account authorized it: uploads for this style must use the same account.
      const email = await fetchAccountEmail(token);
      await api.post('styles.update', { id: style.id, version: style.version, videoUploaderEmail: email });
      await queryClient.invalidateQueries({ queryKey: ['styles'] });
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
                ? 'bg-[var(--neon-red)] text-[var(--on-neon)]'
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
          className="font-display text-[10px] uppercase text-[var(--text-1)] bg-[var(--violet-2)] border-2 border-[var(--outline)] px-3 py-1 min-h-[44px] inline-flex items-center justify-center self-start sm:self-auto cursor-pointer active:translate-x-0.5 active:translate-y-0.5"
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
            video upload is blocked until a valid Drive folder is inserted. Each style uploads with the Google
            account that authorized it, and the video uses that account's storage.
          </p>

          <GoogleAccountBar />

          {styles.length === 0 ? (
            <p className="font-body text-xs text-[var(--text-3)] italic">
              No dance styles configured for this event.
            </p>
          ) : (
            <div className="space-y-2">
              {styles.map((s) => {
                const swatchBg = SWATCH_COLORS[s.colorKey] || 'var(--c-blue)';
                const isEditing = editingStyleId === s.id;
                const uploader = s.videoUploaderEmail || '';
                const isUploaderSignedIn = sameAccount(currentEmail, uploader);
                const isAuthed = Boolean(s.videoFolderId && authorizedFolders[s.videoFolderId] && isUploaderSignedIn);

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
                          <div className="mt-0.5 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <a
                                href={openInDriveUrl(s.videoFolderId)}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-[11px] text-[var(--neon-cyan)] hover:underline flex items-center gap-1"
                              >
                                <span>DRIVE FOLDER ↗</span>
                              </a>
                              {isAuthed && (
                                <span className="font-display text-[10px] text-[var(--neon-green)] font-bold">
                                  ✓ AUTHORIZED
                                </span>
                              )}
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => handleAuthorize(s)}
                                  disabled={isAuthorizing[s.videoFolderId]}
                                  title={currentEmail ? `Authorize as ${currentEmail}` : 'Sign in to Google and authorize'}
                                  className="font-display text-[10px] min-h-[44px] px-3 bg-[var(--neon-gold)] text-[var(--on-neon)] border border-[var(--outline)] uppercase active:translate-y-px inline-flex items-center justify-center cursor-pointer"
                                >
                                  {isAuthorizing[s.videoFolderId] ? '...' : uploader ? 'RE-AUTHORIZE' : 'AUTHORIZE'}
                                </button>
                              )}
                              {canEdit && isCoarsePointer && !isAuthed && (
                                <span className="block w-full font-body text-[11px] text-[var(--text-3)]">
                                  If Google's folder window doesn't open on this phone, do this step on a computer.
                                </span>
                              )}
                            </div>
                            {uploader ? (
                              <div data-testid={`uploader-${s.id}`} className="font-body text-[11px] text-[var(--text-2)]">
                                Uploads as <span className="font-mono text-[var(--text-1)] break-all">{uploader}</span>
                                {currentEmail && !isUploaderSignedIn && (
                                  <span className="block text-[var(--neon-orange)]">
                                    You're signed in as {currentEmail}. Switch account to upload for {s.name}.
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div data-testid={`uploader-${s.id}`} className="font-display text-[10px] text-[var(--neon-orange)] font-bold">
                                ⚠ NO UPLOAD ACCOUNT — {canEdit ? 'tap AUTHORIZE while signed in with the class lead\'s account' : 'ask an admin to authorize it'}
                              </div>
                            )}
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
                        <div className="flex flex-wrap items-center gap-2">
                          <PixelButton
                            size="sm"
                            variant="secondary"
                            onClick={() => handleStartEdit(s)}
                          >
                            {s.videoFolderId ? 'CHANGE LINK' : '+ INSERT LINK'}
                          </PixelButton>
                          {s.videoFolderId && (
                            <PixelButton
                              size="sm"
                              variant="danger"
                              disabled={saveMutation.isPending}
                              onClick={() => handleRemove(s)}
                            >
                              REMOVE LINK
                            </PixelButton>
                          )}
                        </div>
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
