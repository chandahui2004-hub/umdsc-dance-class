import React, { useState, useEffect } from 'react';
import type { SelfEditPayload, SelfEditResponse } from '@umdsc/shared';
import { Sheet } from '../../components/ui/Sheet';
import { Field } from '../../components/ui/Field';
import { PixelButton } from '../../components/ui/PixelButton';
import { call, errorMessage } from '../../lib/api';
import { session } from '../../lib/session';
import { queryClient } from '../../lib/queryClient';

export interface EditProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentFullName: string;
  currentMatric: string;
}

export const EditProfileDialog: React.FC<EditProfileDialogProps> = ({
  isOpen,
  onClose,
  currentFullName,
  currentMatric,
}) => {
  const [fullName, setFullName] = useState(currentFullName);
  const [matric, setMatric] = useState(currentMatric);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFullName(currentFullName);
      setMatric(currentMatric);
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, currentFullName, currentMatric]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !matric.trim()) {
      setError('Please provide both full name and matric number.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const res = await call<SelfEditResponse>('members.selfEdit', {
        fullName: fullName.trim(),
        matric: matric.trim(),
        newFullName: fullName.trim(),
        newMatric: matric.trim()
      } as SelfEditPayload);

      session.set(res.data.token, res.data.claims, true);

      const oldSub = currentMatric ? `M-${currentMatric}` : '';
      const sub = res.data.claims.sub;
      if (oldSub && oldSub !== sub) {
        localStorage.removeItem(`boot:dancer:${oldSub}`);
        localStorage.removeItem(`att:dancer:${oldSub}`);
        queryClient.removeQueries({ queryKey: ['bootstrap', 'dancer', oldSub] });
        queryClient.removeQueries({ queryKey: ['dancerAttendance', oldSub] });
      }

      if (sub) {
        localStorage.setItem(
          `boot:dancer:${sub}`,
          JSON.stringify({
            data: res.data.bootstrap,
            dataVersion: res.dataVersion
          })
        );
      }
      queryClient.setQueryData(['bootstrap', 'dancer', sub], res.data.bootstrap);
      await queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
      await queryClient.invalidateQueries({ queryKey: ['dancerAttendance'] });

      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title="EDIT PERSONAL INFO">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 bg-[var(--night-1)] border-2 border-[var(--outline)] text-[12px] font-mono text-[var(--neon-orange)]">
          NOTICE: Updating your name or matric number will immediately sync across all registered event Google Sheets and attendance records.
        </div>

        {error && (
          <div className="p-2 bg-[var(--neon-red)]/20 border border-[var(--neon-red)] text-[var(--neon-red)] text-[12px] font-mono font-bold">
            {error}
          </div>
        )}

        <Field
          label="FULL NAME"
          id="edit-full-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="e.g. TAN WEI JIE"
          disabled={isSubmitting}
          required
        />

        <Field
          label="MATRIC NUMBER"
          id="edit-matric"
          value={matric}
          onChange={(e) => setMatric(e.target.value)}
          placeholder="e.g. 17201234"
          disabled={isSubmitting}
          required
        />

        <div className="flex items-center justify-end gap-3 pt-3 border-t-2 border-[var(--outline)]">
          <PixelButton
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            CANCEL
          </PixelButton>
          <PixelButton
            type="submit"
            variant="primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'SAVING…' : 'SAVE CHANGES'}
          </PixelButton>
        </div>
      </form>
    </Sheet>
  );
};
