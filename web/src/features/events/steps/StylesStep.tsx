import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DanceStyle, Instructor } from '@umdsc/shared';
import { call, errorMessage } from '../../../lib/api';
import { PixelButton } from '../../../components/ui/PixelButton';
import { getStyleColor } from '../../../theme/colors';
import { instructorsForStyle, missingInstructorStyle, setStyleInstructors } from '../eventDraft';
import type { StepProps } from '../EventWizard';

const STYLE_PALETTE = [
  '#00f0ff', // cyan
  '#ffd700', // gold
  '#ff007f', // pink
  '#00ff66', // green
  '#ff9900', // orange
  '#a855f7', // purple
  '#38bdf8', // sky
  '#f43f5e'  // rose
];

function resolveAccentColor(s: DanceStyle, index: number): string {
  if (s.colorKey) {
    const col = getStyleColor(s.colorKey);
    if (col && col !== 'var(--c-ink)') return col;
  }
  return STYLE_PALETTE[index % STYLE_PALETTE.length];
}

export const StylesStep: React.FC<StepProps> = ({ draft, onChange, onNext, onBack, styles, instructors }) => {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newAliases, setNewAliases] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    onChange({
      styleIds: draft.styleIds.includes(id) ? draft.styleIds.filter(s => s !== id) : [...draft.styleIds, id]
    });

  const applyInstructors = (styleId: string, ids: string[]) => {
    const next = setStyleInstructors(draft, styleId, ids);
    onChange({ styleInstructors: next.styleInstructors, schedule: next.schedule });
  };

  const toggleInstructor = (styleId: string, instructorId: string) => {
    const current = draft.styleInstructors[styleId] || [];
    applyInstructors(
      styleId,
      current.includes(instructorId) ? current.filter(i => i !== instructorId) : [...current, instructorId]
    );
  };

  // A style with exactly one instructor gets them ticked, so the admin is never asked to choose between one.
  // Each "style:instructor" pair is auto-ticked at most once, so a deliberate untick is not undone, while a
  // reload that narrows several instructors down to one still ticks that one.
  const autoTicked = useRef(new Set<string>());
  useEffect(() => {
    for (const key of [...autoTicked.current]) if (!draft.styleIds.includes(key.split(':')[0])) autoTicked.current.delete(key);
    let next = draft;
    let changed = false;
    for (const id of draft.styleIds) {
      if (!styles.some(s => s.id === id && s.active !== false)) continue; // an inactive style needs no instructor
      const candidates = instructorsForStyle(instructors, id);
      if (candidates.length !== 1) continue;
      const key = `${id}:${candidates[0].id}`;
      if (autoTicked.current.has(key)) continue;
      autoTicked.current.add(key);
      if (!(draft.styleInstructors[id]?.length)) {
        next = setStyleInstructors(next, id, [candidates[0].id]);
        changed = true;
      }
    }
    if (changed) onChange({ styleInstructors: next.styleInstructors, schedule: next.schedule });
  }, [draft, instructors, styles]); // eslint-disable-line react-hooks/exhaustive-deps

  // A style deactivated after this event was made can still be ticked; it needs no instructor and is shown
  // below as "(inactive style)" so the admin can untick it.
  const activeStyles = styles.filter(s => s.active !== false);
  const activeStyleIds = activeStyles.map(s => s.id);
  const inactiveTicked = draft.styleIds.filter(id => !activeStyleIds.includes(id));
  const missingStyleId = missingInstructorStyle(draft, activeStyleIds);
  const missingStyleName = missingStyleId ? styles.find(s => s.id === missingStyleId)?.name || missingStyleId : '';
  const missingSlotStyleId = draft.styleIds.find(id => {
    const val = draft.styleSlots?.[id];
    return val === undefined || isNaN(val) || val <= 0;
  });
  const missingSlotStyleName = missingSlotStyleId ? styles.find(s => s.id === missingSlotStyleId)?.name || missingSlotStyleId : '';

  const createStyle = useMutation({
    mutationFn: async (input: { name: string; colorKey?: string; aliases: string[] }) =>
      (
        await call<DanceStyle>('styles.create', {
          name: input.name,
          aliases: input.aliases,
          colorKey: input.colorKey || '',
          defaultWeekday: null,
          defaultStart: '20:00',
          defaultEnd: '22:00',
          defaultInstructorId: '',
          defaultVenue: '',
          attendanceFolderId: '',
          videoFolderId: ''
        })
      ).data,
    onSuccess: async style => {
      await queryClient.invalidateQueries({ queryKey: ['styles'] });
      setError(null);
      setNewName('');
      setNewAliases('');
      setShowNew(false);
      onChange({ styleIds: [...draft.styleIds, style.id] });
    },
    onError: err => setError(errorMessage(err))
  });

  const addFromToken = (token: string, _i: number) =>
    createStyle.mutate({ name: token, colorKey: '', aliases: [token.toLowerCase()] });

  const unknown = draft.preview?.unknownClasses || [];

  return (
    <div className="space-y-4">
      <p className="font-body text-[16px] text-[var(--text-1)]">Tick the dance styles taught in this event.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {activeStyles.map((s, idx) => {
          const isTicked = draft.styleIds.includes(s.id);
          const accentColor = resolveAccentColor(s, idx);

          return (
            <div
              key={s.id}
              className={`border-2 transition-none ${
                isTicked
                  ? 'bg-[var(--night-2)] shadow-[4px_4px_0_var(--outline)]'
                  : 'bg-[var(--night-1)] hover:bg-[var(--night-2)] shadow-[2px_2px_0_var(--outline)]'
              }`}
              style={{
                borderColor: isTicked ? accentColor : 'var(--outline)'
              }}
            >
              {/* Card Header with Distinct Style Color Badge */}
              <div
                className="p-3 flex items-center justify-between gap-3 border-b-2 cursor-pointer select-none transition-none"
                style={{
                  borderBottomColor: isTicked ? accentColor : 'var(--outline)',
                  backgroundColor: isTicked ? 'rgba(255, 255, 255, 0.04)' : 'transparent'
                }}
                onClick={() => toggle(s.id)}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isTicked}
                    onChange={() => toggle(s.id)}
                    onClick={e => e.stopPropagation()}
                    className="w-5 h-5 accent-[var(--neon-gold)] cursor-pointer"
                  />
                  <span
                    className="px-2.5 py-1 font-display text-[12px] font-bold tracking-wider uppercase shadow-[2px_2px_0_#000]"
                    style={{
                      backgroundColor: accentColor,
                      color: '#050508'
                    }}
                  >
                    {s.name}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {draft.preview?.detectedStyleIds.includes(s.id) && (
                    <span className="font-mono text-[11px] text-[var(--neon-cyan)] px-1.5 py-0.5 border border-[var(--neon-cyan)] bg-[var(--night-1)]">
                      IN FORM
                    </span>
                  )}
                  <span
                    className={`font-mono text-[11px] font-bold px-2 py-0.5 border ${
                      isTicked
                        ? 'border-[var(--neon-green)] text-[var(--neon-green)] bg-[var(--night-1)]'
                        : 'border-[var(--outline)] text-[var(--text-3)]'
                    }`}
                  >
                    {isTicked ? '✓ ACTIVE' : '+ SELECT'}
                  </span>
                </div>
              </div>

              {/* Expanded Style Config for Ticked Styles */}
              {isTicked && (
                <div className="p-3 space-y-3 bg-[var(--night-2)]">
                  {/* Section 1: Slot Capacity */}
                  <div className="p-2.5 bg-[var(--night-1)] border-2 border-[var(--outline)] flex items-center justify-between gap-3 shadow-[2px_2px_0_var(--outline)]">
                    <div>
                      <label
                        htmlFor={`slot-capacity-${s.id}`}
                        className="font-display text-[11px] text-[var(--neon-cyan)] font-bold block"
                      >
                        SLOT CAPACITY (COMPULSORY):
                      </label>
                      <span className="font-body text-[12px] text-[var(--text-2)]">
                        Target limit to trigger alert email & slot auto-removal
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <input
                        id={`slot-capacity-${s.id}`}
                        type="number"
                        min="1"
                        required
                        placeholder="e.g. 30"
                        value={draft.styleSlots?.[s.id] ?? ''}
                        onChange={e => {
                          const val = parseInt(e.target.value, 10);
                          onChange({
                            styleSlots: {
                              ...(draft.styleSlots || {}),
                              [s.id]: isNaN(val) ? 0 : val
                            }
                          });
                        }}
                        className="w-20 min-h-[38px] px-2 border-2 border-[var(--outline)] bg-[var(--night-2)] font-mono text-[14px] text-[var(--text-1)] text-right focus:border-[var(--neon-gold)]"
                      />
                      <span className="font-mono text-[11px] text-[var(--text-3)]">slots</span>
                    </div>
                  </div>

                  {/* Section 2: Google Form Option Full Name */}
                  <div
                    className="p-2.5 bg-[var(--night-1)] border-2 space-y-1.5 shadow-[2px_2px_0_var(--outline)]"
                    style={{ borderColor: accentColor }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor={`form-label-${s.id}`}
                        className="font-display text-[11px] font-bold block"
                        style={{ color: accentColor }}
                      >
                        GOOGLE FORM OPTION FULL NAME:
                      </label>
                      <span
                        className="font-mono text-[9px] uppercase font-bold px-1.5 py-0.5 border"
                        style={{ borderColor: accentColor, color: accentColor }}
                      >
                        Exact Choice Text
                      </span>
                    </div>
                    <input
                      id={`form-label-${s.id}`}
                      type="text"
                      placeholder={`e.g. ${s.name} (RM60/month)`}
                      value={draft.styleFormLabels?.[s.id] ?? ''}
                      onChange={e => {
                        onChange({
                          styleFormLabels: {
                            ...(draft.styleFormLabels || {}),
                            [s.id]: e.target.value
                          }
                        });
                      }}
                      className="w-full min-h-[38px] px-2.5 border-2 border-[var(--outline)] bg-[var(--night-2)] font-mono text-[13px] text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:border-[var(--neon-gold)]"
                    />
                    <span className="font-body text-[11px] text-[var(--text-2)] block leading-tight">
                      Type the exact checkbox text in Google Form for <strong>{s.name}</strong>. Used to auto-remove this choice when full and restore it when capacity opens up.
                    </span>
                  </div>

                  {/* Section 3: Instructor Picker */}
                  <InstructorPicker
                    style={s}
                    instructors={instructors}
                    selected={draft.styleInstructors[s.id] || []}
                    onToggle={instructorId => toggleInstructor(s.id, instructorId)}
                    onReload={() => queryClient.invalidateQueries({ queryKey: ['instructors'] })}
                  />
                </div>
              )}
            </div>
          );
        })}
        {inactiveTicked.map(id => (
          <label
            key={id}
            className="flex items-center gap-3 min-h-[48px] px-3 border-2 border-[var(--outline)] cursor-pointer select-none transition-none bg-[var(--night-2)] hover:bg-[var(--violet-1)]"
          >
            <input type="checkbox" checked onChange={() => toggle(id)} className="w-5 h-5 accent-[var(--neon-gold)]" />
            <span className="font-body text-[16px] text-[var(--text-1)]">
              {styles.find(s => s.id === id)?.name || id} (inactive style)
            </span>
          </label>
        ))}
      </div>

      {unknown.length > 0 && (
        <div className="border-2 border-[var(--neon-gold)] bg-[var(--night-1)] px-panel p-3 space-y-2">
          <p className="font-display text-[12px] text-[var(--neon-gold)]">CLASS ANSWERS THAT MATCH NO STYLE</p>
          {unknown.map((u, i) => (
            <div key={u.token} className="flex flex-wrap items-center justify-between gap-2 font-body text-[14px]">
              <span>
                “{u.token}” — {u.count} {u.count === 1 ? 'dancer' : 'dancers'}
              </span>
              <PixelButton
                size="md"
                variant="secondary"
                disabled={createStyle.isPending || styles.some(s => s.name.toLowerCase() === u.token.toLowerCase())}
                onClick={() => addFromToken(u.token, i)}
              >
                ADD AS NEW STYLE
              </PixelButton>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <PixelButton size="md" variant="secondary" onClick={() => setShowNew(v => !v)}>
          {showNew ? 'CLOSE' : '+ NEW STYLE'}
        </PixelButton>
        {showNew && (
          <div className="border-2 border-[var(--outline)] bg-[var(--night-1)] px-panel p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              aria-label="New style name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Name, e.g. Waacking"
              className="min-h-[48px] px-3 border-2 border-[var(--outline)] bg-[var(--night-2)] px-well font-body text-[16px] text-[var(--text-1)] placeholder:text-[var(--text-3)]"
            />
            <input
              aria-label="Other spellings"
              value={newAliases}
              onChange={e => setNewAliases(e.target.value)}
              placeholder="Other spellings, comma separated"
              className="min-h-[48px] px-3 border-2 border-[var(--outline)] bg-[var(--night-2)] px-well font-body text-[16px] text-[var(--text-1)] placeholder:text-[var(--text-3)]"
            />
            <div className="sm:col-span-2 flex justify-end">
              <PixelButton
                size="md"
                variant="primary"
                disabled={!newName.trim() || createStyle.isPending}
                onClick={() =>
                  createStyle.mutate({
                    name: newName.trim(),
                    colorKey: '',
                    aliases: [newName.trim().toLowerCase(), ...newAliases.split(',').map(a => a.trim().toLowerCase()).filter(Boolean)]
                  })
                }
              >
                {createStyle.isPending ? 'ADDING…' : 'ADD STYLE'}
              </PixelButton>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="font-body font-bold text-[14px] text-[var(--neon-red)]">
          {error}
        </p>
      )}

      {missingStyleId && (
        <p className="font-body font-bold text-[14px] text-[var(--neon-gold)]">Choose an instructor for {missingStyleName}.</p>
      )}

      {missingSlotStyleId && (
        <p className="font-body font-bold text-[14px] text-[var(--neon-gold)]">
          Please specify a valid slot capacity (at least 1) for {missingSlotStyleName}.
        </p>
      )}

      <div className="flex justify-between pt-3 border-t-2 border-[var(--outline)]">
        <PixelButton size="md" variant="secondary" onClick={onBack}>
          BACK
        </PixelButton>
        <PixelButton
          size="md"
          variant="primary"
          disabled={draft.styleIds.length === 0 || missingStyleId !== null || missingSlotStyleId !== undefined}
          onClick={onNext}
        >
          NEXT
        </PixelButton>
      </div>
    </div>
  );
};

interface InstructorPickerProps {
  style: DanceStyle;
  instructors: Instructor[];
  selected: string[];
  onToggle(instructorId: string): void;
  onReload(): void;
}

/** The instructors teaching one ticked style in this event. */
const InstructorPicker: React.FC<InstructorPickerProps> = ({ style, instructors, selected, onToggle, onReload }) => {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createInstructor = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim();
      const trimmedContact = contact.trim();
      const trimmedEmail = email.trim();
      if (!trimmedName) throw new Error('Full Name is required');
      if (!trimmedContact) throw new Error('Contact number is required');

      const contactString = trimmedEmail ? `${trimmedContact} (${trimmedEmail})` : trimmedContact;

      const res = await call<Instructor>('instructors.create', {
        name: trimmedName,
        contact: contactString,
        styleIds: [style.id],
        color: '',
        styleColors: {}
      });
      return res.data;
    },
    onSuccess: async (newInst) => {
      // Optimistically add to instructors cache
      queryClient.setQueryData<Instructor[]>(['instructors'], (prev) =>
        prev ? [...prev, newInst] : [newInst]
      );
      await queryClient.invalidateQueries({ queryKey: ['instructors'] });
      setName('');
      setContact('');
      setEmail('');
      setError(null);
      setShowAdd(false);
      if (!selected.includes(newInst.id)) {
        onToggle(newInst.id);
      }
    },
    onError: (err) => setError(errorMessage(err))
  });

  const candidates = instructorsForStyle(instructors, style.id);
  // Saved on the event but no longer active or no longer teaching this style: keep them visible so nothing changes silently.
  const others = selected.filter(id => !candidates.some(c => c.id === id));
  const row = (id: string, name: string, note?: string) => (
    <label key={id} className="flex items-center gap-3 min-h-[44px] px-3 border-2 border-[var(--outline)] bg-[var(--night-2)] cursor-pointer select-none transition-none hover:bg-[var(--violet-1)]">
      <input type="checkbox" checked={selected.includes(id)} onChange={() => onToggle(id)} className="w-5 h-5 accent-[var(--neon-gold)]" />
      <span className="font-body text-[16px] text-[var(--text-1)]">{name}</span>
      {note && <span className="font-mono text-[12px] text-[var(--text-2)]">{note}</span>}
    </label>
  );

  return (
    <div className="border-2 border-[var(--outline)] bg-[var(--night-1)] px-panel p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--outline)] pb-1.5">
        <p className="font-display text-[12px] text-[var(--neon-cyan)] uppercase font-bold">
          INSTRUCTORS FOR {style.name.toUpperCase()}
        </p>
        <span className="font-mono text-[11px] text-[var(--text-3)]">
          {selected.length} selected
        </span>
      </div>

      {candidates.length === 0 && others.length === 0 ? (
        <p className="font-body text-[14px] text-[var(--neon-gold)]">
          No instructor teaches {style.name} yet. You can add one below directly without leaving this page!
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-1">
          {candidates.map(i => row(i.id, i.name))}
          {others.map(id => {
            const found = instructors.find(i => i.id === id);
            return row(id, found?.name || id, found?.active ? '(not teaching this style)' : '(inactive)');
          })}
        </div>
      )}

      {/* Action buttons: Add New Instructor & Reload */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <PixelButton
          size="sm"
          variant="secondary"
          onClick={() => {
            setShowAdd(v => !v);
            setError(null);
          }}
        >
          {showAdd ? '✕ CLOSE' : '+ NEW INSTRUCTOR'}
        </PixelButton>
        <PixelButton size="sm" variant="ghost" onClick={onReload}>
          ↻ RELOAD
        </PixelButton>
      </div>

      {/* Inline Add Instructor Form */}
      {showAdd && (
        <div className="border-2 border-[var(--outline)] bg-[var(--night-2)] p-3 space-y-2.5 mt-2 shadow-[2px_2px_0_var(--outline)]">
          <p className="font-display text-[11px] text-[var(--neon-cyan)] uppercase font-bold tracking-wider">
            ADD NEW INSTRUCTOR FOR {style.name}
          </p>

          <div className="grid grid-cols-1 gap-2">
            <div>
              <label htmlFor={`inst-name-${style.id}`} className="font-display text-[10px] text-[var(--text-2)] uppercase block font-bold mb-0.5">
                Full Name <span className="text-[var(--neon-red)]">*</span>
              </label>
              <input
                id={`inst-name-${style.id}`}
                aria-label="Instructor Name"
                placeholder="e.g. Alex Tan"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full min-h-[38px] px-2.5 border-2 border-[var(--outline)] bg-[var(--night-1)] font-body text-[14px] text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:border-[var(--neon-gold)]"
              />
            </div>

            <div>
              <label htmlFor={`inst-contact-${style.id}`} className="font-display text-[10px] text-[var(--text-2)] uppercase block font-bold mb-0.5">
                Contact Number (Phone / WhatsApp) <span className="text-[var(--neon-red)]">*</span>
              </label>
              <input
                id={`inst-contact-${style.id}`}
                aria-label="Instructor Contact"
                placeholder="e.g. +60123456789"
                value={contact}
                onChange={e => setContact(e.target.value)}
                className="w-full min-h-[38px] px-2.5 border-2 border-[var(--outline)] bg-[var(--night-1)] font-mono text-[14px] text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:border-[var(--neon-gold)]"
              />
            </div>

            <div>
              <label htmlFor={`inst-email-${style.id}`} className="font-display text-[10px] text-[var(--text-2)] uppercase block font-bold mb-0.5">
                Email Address (Optional)
              </label>
              <input
                id={`inst-email-${style.id}`}
                aria-label="Instructor Email"
                placeholder="e.g. alex@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full min-h-[38px] px-2.5 border-2 border-[var(--outline)] bg-[var(--night-1)] font-body text-[14px] text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:border-[var(--neon-gold)]"
              />
            </div>

            {error && (
              <p role="alert" className="font-body text-xs text-[var(--neon-red)] font-bold">
                ⚠ {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1 border-t border-[var(--outline)]">
              <PixelButton size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
                CANCEL
              </PixelButton>
              <PixelButton
                size="sm"
                variant="primary"
                disabled={!name.trim() || !contact.trim() || createInstructor.isPending}
                onClick={() => createInstructor.mutate()}
              >
                {createInstructor.isPending ? 'ADDING…' : 'ADD & SELECT'}
              </PixelButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
