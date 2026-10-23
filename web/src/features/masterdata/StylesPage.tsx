import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../../lib/api';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { useOverlayOpen } from '../../app/useOverlayOpen';
import type { DanceStyle, Instructor } from '@umdsc/shared';

interface CollapsibleStyleItemProps {
  style: DanceStyle;
  instructors: Instructor[];
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: (style: DanceStyle) => void;
  onDeactivate: (style: DanceStyle) => void;
  isDeactivating: boolean;
}

const CollapsibleStyleItem: React.FC<CollapsibleStyleItemProps> = ({
  style,
  instructors,
  isExpanded,
  onToggle,
  onEdit,
  onDeactivate,
  isDeactivating
}) => {
  const teachers = instructors.filter((i) => i.active && (i.styleIds || []).includes(style.id));

  return (
    <div className="space-y-2" data-testid={`style-item-${style.id}`}>
      <button
        type="button"
        data-testid={`toggle-style-${style.id}`}
        onClick={onToggle}
        className="w-full text-left px-3 py-2.5 border-2 border-[var(--outline)] bg-[var(--night-2)] hover:border-[var(--neon-cyan)] transition-colors flex items-center justify-between gap-3 shadow-[2px_2px_0_var(--outline)] group cursor-pointer"
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="font-mono text-sm text-[var(--neon-cyan)] group-hover:scale-110 transition-transform">
            {isExpanded ? '▼' : '▶'}
          </span>
          <span className="font-display text-[14px] sm:text-[15px] text-[var(--text-1)] font-bold truncate">
            {style.name}
          </span>
          {teachers.length > 0 && (
            <span className="font-body text-[12px] text-[var(--text-2)] hidden sm:inline">
              · {teachers.map((t) => t.name).join(', ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="px-2 py-0.5 border border-[var(--outline)] bg-[var(--neon-gold)] text-[var(--on-neon)] font-display text-[11px] font-bold shadow-[1px_1px_0_var(--outline)]">
            {teachers.length} {teachers.length === 1 ? 'INSTRUCTOR' : 'INSTRUCTORS'}
          </span>
          <span className="font-mono text-xs text-[var(--text-2)] border border-[var(--outline)] px-1.5 py-0.5 bg-[var(--night-3)]">
            {isExpanded ? 'COLLAPSE ▲' : 'EXPAND ▼'}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="pl-2 sm:pl-4 border-l-2 border-[var(--neon-cyan)]">
          <Panel
            title={style.name}
            className="px-corners space-y-3 bg-[var(--night-2)]"
          >
            {/* Aliases */}
            <div className="space-y-1">
              <span className="font-display text-[10px] text-[var(--text-2)] uppercase">
                Aliases:
              </span>
              <div className="flex flex-wrap gap-1">
                {style.aliases && style.aliases.length > 0 ? (
                  style.aliases.map((al, i) => (
                    <span
                      key={`${i}-${al}`}
                      className="bg-[var(--night-1)] border border-[var(--outline)] px-2 py-0.5 font-mono text-[12px] uppercase text-[var(--text-1)]"
                    >
                      {al}
                    </span>
                  ))
                ) : (
                  <span className="font-body text-[12px] text-[var(--text-2)] italic">
                    None
                  </span>
                )}
              </div>
            </div>

            {/* Instructors */}
            <div className="px-well p-2 font-mono text-[12px] space-y-1 text-[var(--text-2)]">
              <div>
                {teachers.length > 0 ? (
                  <>
                    <span className="font-bold text-[var(--text-1)]">Instructors:</span>{' '}
                    {teachers.map((t) => t.name).join(', ')}
                  </>
                ) : (
                  <>
                    <span className="italic">No instructors yet</span>{' '}
                    <Link
                      to="/admin/instructors"
                      className="inline-flex items-center min-h-[44px] text-[var(--neon-cyan)] underline font-bold"
                    >
                      Add one
                    </Link>
                  </>
                )}
              </div>
            </div>

            {/* Drive Folders */}
            <div className="font-mono text-[12px] space-y-1 text-[var(--text-2)]">
              <div>
                <span className="font-bold text-[var(--text-1)]">Attendance Folder:</span>{' '}
                {style.attendanceFolderId ? (
                  <span className="text-[var(--neon-green)] font-bold">Configured</span>
                ) : (
                  <span className="italic">Using Default</span>
                )}
              </div>
              <div>
                <span className="font-bold text-[var(--text-1)]">Video Folder:</span>{' '}
                {style.videoFolderId ? (
                  <span className="text-[var(--neon-green)] font-bold">Configured</span>
                ) : (
                  <span className="italic">Using Default</span>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t-2 border-[var(--outline)]">
              <PixelButton
                size="md"
                variant="secondary"
                className="flex-1"
                onClick={() => onEdit(style)}
              >
                EDIT
              </PixelButton>
              <PixelButton
                size="md"
                variant="danger"
                disabled={isDeactivating}
                onClick={() => {
                  if (confirm(`Deactivate style "${style.name}"?`)) {
                    onDeactivate(style);
                  }
                }}
              >
                {isDeactivating ? 'DEACTIVATING…' : 'DEACTIVATE'}
              </PixelButton>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
};

export const StylesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [editingStyle, setEditingStyle] = useState<DanceStyle | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedStyleIds, setExpandedStyleIds] = useState<Set<string>>(new Set());
  useOverlayOpen(Boolean(isCreating || editingStyle));

  // Form states
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [attendanceFolderUrl, setAttendanceFolderUrl] = useState('');
  const [videoFolderUrl, setVideoFolderUrl] = useState('');

  const { data: styles = [], isLoading: loadingStyles } = useQuery<DanceStyle[]>({
    queryKey: ['styles'],
    queryFn: async () => {
      const res = await api.post<DanceStyle[]>('styles.list');
      return res.data;
    }
  });

  const { data: instructors = [] } = useQuery<Instructor[]>({
    queryKey: ['instructors'],
    queryFn: async () => {
      const res = await api.post<Instructor[]>('instructors.list');
      return res.data;
    }
  });

  const allStylesExpanded = styles.length > 0 && styles.every((s) => expandedStyleIds.has(s.id));

  const toggleAllStyles = () => {
    if (allStylesExpanded) {
      setExpandedStyleIds(new Set());
    } else {
      setExpandedStyleIds(new Set(styles.map((s) => s.id)));
    }
  };

  const toggleStyle = (id: string) => {
    setExpandedStyleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreate = () => {
    setIsCreating(true);
    setEditingStyle(null);
    setName('');
    setAliases('');
    setAttendanceFolderUrl('');
    setVideoFolderUrl('');
    setFormError(null);
  };

  const openEdit = (style: DanceStyle) => {
    setEditingStyle(style);
    setIsCreating(false);
    setName(style.name);
    setAliases((style.aliases || []).join(', '));
    setAttendanceFolderUrl(
      style.attendanceFolderId ? `https://drive.google.com/drive/folders/${style.attendanceFolderId}` : ''
    );
    setVideoFolderUrl(
      style.videoFolderId ? `https://drive.google.com/drive/folders/${style.videoFolderId}` : ''
    );
    setFormError(null);
  };

  const closeForm = () => {
    setIsCreating(false);
    setEditingStyle(null);
    setFormError(null);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const aliasArray = Array.from(
        new Set(
          aliases
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
        )
      );

      const payload: any = {
        name: name.trim(),
        aliases: aliasArray
      };

      if (editingStyle) {
        if (editingStyle.defaultWeekday !== undefined) payload.defaultWeekday = editingStyle.defaultWeekday;
        if (editingStyle.defaultStart) payload.defaultStart = editingStyle.defaultStart;
        if (editingStyle.defaultEnd) payload.defaultEnd = editingStyle.defaultEnd;
        if (editingStyle.defaultVenue) payload.defaultVenue = editingStyle.defaultVenue;
      }

      if (attendanceFolderUrl.trim()) {
        payload.attendanceFolderUrl = attendanceFolderUrl.trim();
      }
      if (videoFolderUrl.trim()) {
        payload.videoFolderUrl = videoFolderUrl.trim();
      }

      if (isCreating) {
        return await api.post('styles.create', payload);
      } else if (editingStyle) {
        payload.id = editingStyle.id;
        payload.version = editingStyle.version;
        return await api.post('styles.update', payload);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['styles'] }),
        queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
      ]);
      closeForm();
    },
    onError: (err) => {
      setFormError(errorMessage(err));
    }
  });

  const deactivateMutation = useMutation({
    mutationFn: async (style: DanceStyle) => {
      return await api.post('styles.deactivate', { id: style.id, version: style.version });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['styles'] }),
        queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
      ]);
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="font-display text-[24px] md:text-[32px] text-[var(--text-1)] px-glow-text">
            Dance Styles
          </h1>
          <p className="font-body text-[14px] text-[var(--text-2)] mt-1">
            Configure genre metadata, schedules, colors, and Drive folder links.
          </p>
        </div>
        <PixelButton size="md" variant="primary" onClick={openCreate}>
          + NEW STYLE
        </PixelButton>
      </div>

      <section data-testid="dance-styles-list" className="space-y-3">
        <div className="flex items-center justify-between gap-2 border-b-2 border-[var(--outline)] pb-2">
          <h2 className="font-display text-[12px] text-[var(--text-1)] tracking-wider">
            ACTIVE DANCE STYLES ({styles.length})
          </h2>
          {styles.length > 0 && (
            <PixelButton size="sm" variant="ghost" onClick={toggleAllStyles}>
              {allStylesExpanded ? '▲ COLLAPSE ALL' : '▼ EXPAND ALL'}
            </PixelButton>
          )}
        </div>

        {loadingStyles ? (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        ) : styles.length === 0 ? (
          <EmptyState
            title="NO DANCE STYLES"
            description="No dance styles exist yet. Click '+ NEW STYLE' to create one."
            scene="shutter"
            action={
              <PixelButton size="md" variant="primary" onClick={openCreate}>
                + NEW STYLE
              </PixelButton>
            }
          />
        ) : (
          <div className="space-y-3">
            {styles.map((style) => (
              <CollapsibleStyleItem
                key={style.id}
                style={style}
                instructors={instructors}
                isExpanded={expandedStyleIds.has(style.id)}
                onToggle={() => toggleStyle(style.id)}
                onEdit={openEdit}
                onDeactivate={(s) => deactivateMutation.mutate(s)}
                isDeactivating={
                  deactivateMutation.isPending && deactivateMutation.variables?.id === style.id
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* Create / Edit Modal */}
      {(isCreating || editingStyle) && (
        <div className="fixed inset-0 bg-[var(--night-1)]/80 z-[var(--z-modal)] flex items-start justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl my-auto py-4">
            <Panel
              title={isCreating ? 'CREATE DANCE STYLE' : `EDIT ${editingStyle?.name}`}
              className="px-corners bg-[var(--night-2)] p-4 sm:p-6 space-y-5"
            >
              {formError && (
                <div
                  role="alert"
                  className="bg-[var(--night-2)] border-2 border-[var(--neon-red)] p-3 text-[var(--neon-red)] font-body font-bold text-[14px]"
                >
                  {formError}
                </div>
              )}

              <Field label="Style Name" required>
                <input
                  id="style-name"
                  aria-label="Style Name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Popping, Locking"
                  className="w-full min-h-[44px] px-3 px-well font-body text-[16px] text-[var(--text-1)] placeholder:text-[var(--text-3)]"
                  required
                />
              </Field>

              <Field label="Aliases (comma-separated)" hint="Used during registration import to match form text">
                <input
                  id="style-aliases"
                  aria-label="Aliases (comma-separated)"
                  type="text"
                  value={aliases}
                  onChange={(e) => setAliases(e.target.value)}
                  placeholder="e.g. popping, pop, electric boogaloo"
                  className="w-full min-h-[44px] px-3 px-well font-body text-[16px] text-[var(--text-1)] placeholder:text-[var(--text-3)]"
                />
              </Field>

              {/* Folders */}
              <Field label="Attendance Folder Link" hint="Leave blank to use system default">
                <input
                  type="url"
                  value={attendanceFolderUrl}
                  onChange={(e) => setAttendanceFolderUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="w-full min-h-[44px] px-3 px-well font-mono text-[16px] text-[var(--text-1)] placeholder:text-[var(--text-3)]"
                />
              </Field>

              <Field label="Video Folder Link" hint="Leave blank to use system default">
                <input
                  type="url"
                  value={videoFolderUrl}
                  onChange={(e) => setVideoFolderUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="w-full min-h-[44px] px-3 px-well font-mono text-[16px] text-[var(--text-1)] placeholder:text-[var(--text-3)]"
                />
              </Field>

              <div className="flex gap-3 pt-3 border-t-2 border-[var(--outline)]">
                <PixelButton
                  size="md"
                  variant="primary"
                  className="flex-1"
                  disabled={saveMutation.isPending || !name.trim()}
                  onClick={() => saveMutation.mutate()}
                >
                  {saveMutation.isPending ? 'SAVING...' : 'SAVE STYLE'}
                </PixelButton>
                <PixelButton
                  size="md"
                  variant="secondary"
                  disabled={saveMutation.isPending}
                  onClick={closeForm}
                >
                  CANCEL
                </PixelButton>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
};
export default StylesPage;

