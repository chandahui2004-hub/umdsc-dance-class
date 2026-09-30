import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import type { DanceStyle, Instructor } from '@umdsc/shared';

const SWATCH_COLORS = [
  { key: 'green', label: 'GREEN', css: 'var(--c-green)' },
  { key: 'blue', label: 'BLUE', css: 'var(--c-blue)' },
  { key: 'orange', label: 'ORANGE', css: 'var(--c-orange)' },
  { key: 'pink', label: 'PINK', css: 'var(--c-pink)' },
  { key: 'yellow', label: 'YELLOW', css: 'var(--c-yellow)' },
  { key: 'lavender', label: 'LAVENDER', css: 'var(--c-lavender)' },
  { key: 'peach', label: 'PEACH', css: 'var(--c-peach)' },
  { key: 'darkgreen', label: 'DARK GREEN', css: 'var(--c-darkgreen)' }
];

const WEEKDAYS = [
  { val: 1, name: 'Monday' },
  { val: 2, name: 'Tuesday' },
  { val: 3, name: 'Wednesday' },
  { val: 4, name: 'Thursday' },
  { val: 5, name: 'Friday' },
  { val: 6, name: 'Saturday' },
  { val: 0, name: 'Sunday' }
];

export const StylesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [editingStyle, setEditingStyle] = useState<DanceStyle | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [colorKey, setColorKey] = useState('green');
  const [defaultWeekday, setDefaultWeekday] = useState<number>(1);
  const [defaultStart, setDefaultStart] = useState('20:00');
  const [defaultEnd, setDefaultEnd] = useState('22:00');
  const [defaultInstructorId, setDefaultInstructorId] = useState('');
  const [defaultVenue, setDefaultVenue] = useState('');
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

  const openCreate = () => {
    setIsCreating(true);
    setEditingStyle(null);
    setName('');
    setAliases('');
    setColorKey('green');
    setDefaultWeekday(1);
    setDefaultStart('20:00');
    setDefaultEnd('22:00');
    setDefaultInstructorId(instructors[0]?.id || '');
    setDefaultVenue('');
    setAttendanceFolderUrl('');
    setVideoFolderUrl('');
    setFormError(null);
  };

  const openEdit = (style: DanceStyle) => {
    setEditingStyle(style);
    setIsCreating(false);
    setName(style.name);
    setAliases((style.aliases || []).join(', '));
    setColorKey(style.colorKey || 'green');
    setDefaultWeekday(style.defaultWeekday ?? 1);
    setDefaultStart(style.defaultStart || '20:00');
    setDefaultEnd(style.defaultEnd || '22:00');
    setDefaultInstructorId(style.defaultInstructorId || '');
    setDefaultVenue(style.defaultVenue || '');
    setAttendanceFolderUrl(style.attendanceFolderId ? `https://drive.google.com/drive/folders/${style.attendanceFolderId}` : '');
    setVideoFolderUrl(style.videoFolderId ? `https://drive.google.com/drive/folders/${style.videoFolderId}` : '');
    setFormError(null);
  };

  const closeForm = () => {
    setIsCreating(false);
    setEditingStyle(null);
    setFormError(null);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const aliasArray = aliases
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      const payload: any = {
        name: name.trim(),
        aliases: aliasArray,
        colorKey,
        defaultWeekday: Number(defaultWeekday),
        defaultStart,
        defaultEnd,
        defaultInstructorId,
        defaultVenue: defaultVenue.trim()
      };

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['styles'] });
      queryClient.invalidateQueries({ queryKey: ['admin.bootstrap'] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['styles'] });
      queryClient.invalidateQueries({ queryKey: ['admin.bootstrap'] });
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="font-display text-lg tracking-wider text-[var(--c-ink)]">
            Dance Styles
          </h1>
          <p className="font-body text-base text-[var(--c-darkgrey)] mt-1">
            Configure genre metadata, schedules, colors, and Drive folder links.
          </p>
        </div>
        <PixelButton size="md" variant="primary" onClick={openCreate}>
          + NEW STYLE
        </PixelButton>
      </div>

      {loadingStyles ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : styles.length === 0 ? (
        <EmptyState
          title="NO DANCE STYLES"
          description="No dance styles exist yet. Click '+ NEW STYLE' to create one."
          action={
            <PixelButton size="md" variant="primary" onClick={openCreate}>
              + NEW STYLE
            </PixelButton>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {styles.map((style) => {
            const swatch = SWATCH_COLORS.find((c) => c.key === style.colorKey) || SWATCH_COLORS[0];
            const instructor = instructors.find((i) => i.id === style.defaultInstructorId);
            const weekday = WEEKDAYS.find((w) => w.val === style.defaultWeekday);

            return (
              <Panel
                key={style.id}
                title={style.name}
                className="px-corners space-y-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-6 h-6 border-2 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)] shrink-0"
                    style={{ backgroundColor: swatch.css }}
                    title={swatch.label}
                  />
                  <h3 className="font-display text-sm font-bold">{style.name}</h3>
                </div>

                {/* Aliases */}
                <div className="space-y-1">
                  <span className="font-display text-[10px] text-[var(--c-darkgrey)] uppercase">
                    Aliases:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {(style.aliases && style.aliases.length > 0) ? (
                      style.aliases.map((al) => (
                        <span
                          key={al}
                          className="bg-[var(--c-bg)] border border-[var(--c-ink)] px-2 py-0.5 font-mono text-xs uppercase"
                        >
                          {al}
                        </span>
                      ))
                    ) : (
                      <span className="font-body text-xs text-[var(--c-darkgrey)] italic">
                        None
                      </span>
                    )}
                  </div>
                </div>

                {/* Default Schedule & Venue */}
                <div className="bg-[var(--c-bg)] border-2 border-[var(--c-ink)] p-2 font-mono text-xs space-y-1">
                  <div>
                    <span className="font-bold">Schedule:</span> {weekday?.name || 'Unset'}, {style.defaultStart} - {style.defaultEnd}
                  </div>
                  <div>
                    <span className="font-bold">Venue:</span> {style.defaultVenue || 'Unset'}
                  </div>
                  <div>
                    <span className="font-bold">Default Instructor:</span> {instructor?.name || 'Unset'}
                  </div>
                </div>

                {/* Drive Folders */}
                <div className="font-mono text-xs space-y-1 text-[var(--c-darkgrey)]">
                  <div>
                    <span className="font-bold text-[var(--c-ink)]">Attendance Folder:</span>{' '}
                    {style.attendanceFolderId ? (
                      <span className="text-[var(--c-darkgreen)]">Configured</span>
                    ) : (
                      <span className="italic">Using Default</span>
                    )}
                  </div>
                  <div>
                    <span className="font-bold text-[var(--c-ink)]">Video Folder:</span>{' '}
                    {style.videoFolderId ? (
                      <span className="text-[var(--c-darkgreen)]">Configured</span>
                    ) : (
                      <span className="italic">Using Default</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t-2 border-[var(--c-ink)]">
                  <PixelButton
                    size="md"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => openEdit(style)}
                  >
                    EDIT
                  </PixelButton>
                  <PixelButton
                    size="md"
                    variant="danger"
                    onClick={() => {
                      if (confirm(`Deactivate style "${style.name}"?`)) {
                        deactivateMutation.mutate(style);
                      }
                    }}
                  >
                    DEACTIVATE
                  </PixelButton>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {(isCreating || editingStyle) && (
        <div className="fixed inset-0 bg-[var(--c-ink)]/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg my-8">
            <Panel
              title={isCreating ? 'CREATE DANCE STYLE' : `EDIT ${editingStyle?.name}`}
              className="px-corners bg-[var(--c-panel)] space-y-4"
            >
              {formError && (
                <div
                  role="alert"
                  className="bg-[var(--c-peach)] border-4 border-[var(--c-red)] p-3 text-[var(--c-red)] font-body font-bold text-sm"
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
                  className="w-full min-h-[44px] px-3 border-2 border-[var(--c-ink)] font-body text-base bg-[var(--c-bg)]"
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
                  className="w-full min-h-[44px] px-3 border-2 border-[var(--c-ink)] font-body text-base bg-[var(--c-bg)]"
                />
              </Field>

              {/* Color Swatch Picker */}
              <div className="space-y-1">
                <label className="font-display text-xs uppercase tracking-wider text-[var(--c-ink)]">
                  Color Swatch
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {SWATCH_COLORS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setColorKey(c.key)}
                      className={`min-h-[44px] p-2 border-2 flex items-center gap-2 cursor-pointer ${
                        colorKey === c.key
                          ? 'border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)] font-bold'
                          : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                    >
                      <div
                        className="w-4 h-4 border border-[var(--c-ink)] shrink-0"
                        style={{ backgroundColor: c.css }}
                      />
                      <span className="font-mono text-xs">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Default Schedule */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Default Day">
                  <select
                    value={defaultWeekday}
                    onChange={(e) => setDefaultWeekday(Number(e.target.value))}
                    className="w-full min-h-[44px] px-2 border-2 border-[var(--c-ink)] font-body text-sm bg-[var(--c-bg)]"
                  >
                    {WEEKDAYS.map((w) => (
                      <option key={w.val} value={w.val}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Start Time">
                  <input
                    type="time"
                    value={defaultStart}
                    onChange={(e) => setDefaultStart(e.target.value)}
                    className="w-full min-h-[44px] px-2 border-2 border-[var(--c-ink)] font-mono text-sm bg-[var(--c-bg)]"
                  />
                </Field>

                <Field label="End Time">
                  <input
                    type="time"
                    value={defaultEnd}
                    onChange={(e) => setDefaultEnd(e.target.value)}
                    className="w-full min-h-[44px] px-2 border-2 border-[var(--c-ink)] font-mono text-sm bg-[var(--c-bg)]"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Default Instructor">
                  <select
                    value={defaultInstructorId}
                    onChange={(e) => setDefaultInstructorId(e.target.value)}
                    className="w-full min-h-[44px] px-2 border-2 border-[var(--c-ink)] font-body text-sm bg-[var(--c-bg)]"
                  >
                    <option value="">-- None --</option>
                    {instructors.map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Default Venue">
                  <input
                    id="style-default-venue"
                    aria-label="Default Venue"
                    type="text"
                    value={defaultVenue}
                    onChange={(e) => setDefaultVenue(e.target.value)}
                    placeholder="e.g. Studio A"
                    className="w-full min-h-[44px] px-3 border-2 border-[var(--c-ink)] font-body text-sm bg-[var(--c-bg)]"
                  />
                </Field>
              </div>

              {/* Folders */}
              <Field label="Attendance Folder Link" hint="Leave blank to use system default">
                <input
                  type="url"
                  value={attendanceFolderUrl}
                  onChange={(e) => setAttendanceFolderUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="w-full min-h-[44px] px-3 border-2 border-[var(--c-ink)] font-mono text-xs bg-[var(--c-bg)]"
                />
              </Field>

              <Field label="Video Folder Link" hint="Leave blank to use system default">
                <input
                  type="url"
                  value={videoFolderUrl}
                  onChange={(e) => setVideoFolderUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="w-full min-h-[44px] px-3 border-2 border-[var(--c-ink)] font-mono text-xs bg-[var(--c-bg)]"
                />
              </Field>

              <div className="flex gap-3 pt-3 border-t-2 border-[var(--c-ink)]">
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
