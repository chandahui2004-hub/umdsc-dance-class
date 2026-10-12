import React, { useState } from 'react';
import type { Member } from '@umdsc/shared';
import { call, errorMessage } from '../../lib/api';
import { Sheet } from '../../components/ui/Sheet';
import { Field } from '../../components/ui/Field';
import { PixelButton } from '../../components/ui/PixelButton';

type EditableKey = 'fullName' | 'matricRaw' | 'contact' | 'email' | 'gender' | 'nationality';

const FIELDS: { key: EditableKey; label: string }[] = [
  { key: 'fullName', label: 'Full name' },
  { key: 'matricRaw', label: 'Matric number' },
  { key: 'contact', label: 'Phone number' },
  { key: 'email', label: 'Email' },
  { key: 'gender', label: 'Gender' },
  { key: 'nationality', label: 'Nationality' }
];

export interface EditDancerDialogProps {
  member: Member;
  /** The events whose registration forms hold this dancer's responses. */
  eventIds: string[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Corrects a dancer's details in the registration form's response sheet (every response of theirs
 * in each event), which then syncs, so the dancer list, attendance and sign-in all follow.
 */
export const EditDancerDialog: React.FC<EditDancerDialogProps> = ({ member, eventIds, onClose, onSaved }) => {
  const [values, setValues] = useState<Record<EditableKey, string>>(() => ({
    fullName: member.fullName || '',
    matricRaw: member.matricRaw || '',
    contact: member.contact || '',
    email: member.email || '',
    gender: member.gender || '',
    nationality: member.nationality || ''
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const changed = FIELDS.filter(({ key }) => values[key].trim() !== String(member[key] || '').trim());

  const save = async () => {
    if (changed.length === 0) {
      onClose();
      return;
    }
    const patch = Object.fromEntries(changed.map(({ key }) => [key, values[key].trim()]));
    setSaving(true);
    setError('');
    try {
      for (const eventId of eventIds) {
        await call('members.edit', { eventId, memberId: member.memberId, ...patch });
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet isOpen onClose={onClose} title={`EDIT ${member.fullName || 'DANCER'}`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p className="font-body text-[14px] text-[var(--text-2)]">
          Saving writes these details into the registration form&apos;s response sheet, then syncs, so the dancer list,
          attendance and the dancer&apos;s sign-in all follow. Dance classes can only be changed in the form.
        </p>
        {FIELDS.map(({ key, label }) => (
          <Field
            key={key}
            id={`edit-dancer-${key}`}
            label={label}
            value={values[key]}
            autoCapitalize={key === 'fullName' ? 'words' : 'off'}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          />
        ))}
        {error && (
          <p role="alert" className="font-body text-[14px] text-[var(--neon-red)]">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2 justify-end">
          <PixelButton type="button" variant="secondary" onClick={onClose} disabled={saving}>
            CANCEL
          </PixelButton>
          <PixelButton type="submit" disabled={saving}>
            {saving ? 'SAVING…' : 'SAVE TO FORM SHEET'}
          </PixelButton>
        </div>
      </form>
    </Sheet>
  );
};
