import React, { useState } from 'react';
import { PixelButton } from '../../components/ui/PixelButton';

export function parseEmailList(raw: string): string[] {
  if (!raw) return [];
  return raw
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00A0]/g, ' ')
    .split(/[,，;；\n\s]+/)
    .map((e) => e.replace(/[\u200B-\u200D\u2060\uFEFF\u00A0\s]/g, '').toLowerCase())
    .filter((e) => Boolean(e && e.includes('@')));
}

export interface AdminEmailManagerProps {
  emailsRaw: string;
  clubEmail: string;
  onSave: (emailsString: string) => void;
  isSaving?: boolean;
}

export const AdminEmailManager: React.FC<AdminEmailManagerProps> = ({
  emailsRaw,
  clubEmail,
  onSave,
  isSaving = false
}) => {
  const emailList = parseEmailList(emailsRaw);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const toAdd = parseEmailList(newEmailInput);
    if (toAdd.length === 0) return;

    // Deduplicate and combine
    const combined = Array.from(new Set([...emailList, ...toAdd]));
    onSave(combined.join(', '));
    setNewEmailInput('');
  };

  const handleStartEdit = (index: number, email: string) => {
    setEditingIndex(index);
    setEditingValue(email);
  };

  const handleSaveEdit = (index: number) => {
    const trimmed = editingValue.trim().toLowerCase();
    if (!trimmed) return;
    const updated = [...emailList];
    updated[index] = trimmed;
    const deduped = Array.from(new Set(updated));
    onSave(deduped.join(', '));
    setEditingIndex(null);
    setEditingValue('');
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    const updated = emailList.filter((e) => e !== deleteTarget);
    onSave(updated.join(', '));
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      {/* Add New Email Bar */}
      <form onSubmit={handleAdd} className="p-3 bg-[var(--night-1)] border-2 border-[var(--outline)] space-y-2">
        <label htmlFor="add-admin-email" className="font-display text-[11px] uppercase text-[var(--neon-cyan)] tracking-wider block font-bold">
          ADD NOTIFICATION EMAIL
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="add-admin-email"
            type="text"
            value={newEmailInput}
            onChange={(e) => setNewEmailInput(e.target.value)}
            placeholder="Enter admin email (e.g. user@gmail.com, committee@gmail.com)"
            className="flex-1 min-h-[44px] px-3 border-2 border-[var(--outline)] font-mono text-base bg-[var(--night-2)] text-[var(--text-1)] placeholder:text-[var(--text-3)]"
          />
          <PixelButton
            type="submit"
            size="md"
            variant="primary"
            disabled={isSaving || !newEmailInput.trim()}
          >
            {isSaving ? 'SAVING…' : '+ ADD EMAIL'}
          </PixelButton>
        </div>
        <p className="font-body text-xs text-[var(--text-3)]">
          You can enter a single email or paste multiple emails separated by commas or spaces.
        </p>
      </form>

      {/* Header and Count */}
      <div className="flex items-center justify-between pt-1">
        <span className="font-display text-[11px] text-[var(--neon-gold)] tracking-wider uppercase font-bold">
          CURRENTLY SAVED ALERT RECIPIENTS:
        </span>
        <span className="font-mono text-xs text-[var(--text-3)]">
          {emailList.length} custom {emailList.length === 1 ? 'address' : 'addresses'}
        </span>
      </div>

      {/* List of Individual Email Cards */}
      <div className="space-y-2">
        {emailList.length === 0 ? (
          <div className="p-4 bg-[var(--night-1)] border-2 border-[var(--outline)] text-center">
            <p className="font-mono text-xs text-[var(--text-3)] italic">
              No custom admin notification emails configured yet.
            </p>
          </div>
        ) : (
          emailList.map((email, idx) => {
            const isEditing = editingIndex === idx;

            return (
              <div
                key={`${email}-${idx}`}
                className="p-3 bg-[var(--night-1)] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                {isEditing ? (
                  <div className="flex-1 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                    <input
                      type="text"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      className="flex-1 min-h-[40px] px-2 border-2 border-[var(--outline)] font-mono text-sm bg-[var(--night-2)] text-[var(--text-1)]"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <PixelButton
                        size="sm"
                        variant="primary"
                        onClick={() => handleSaveEdit(idx)}
                        disabled={isSaving || !editingValue.trim()}
                      >
                        SAVE
                      </PixelButton>
                      <PixelButton
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditingIndex(null)}
                      >
                        CANCEL
                      </PixelButton>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-[var(--neon-green)] flex-shrink-0 animate-pulse shadow-[0_0_8px_var(--neon-green)]" />
                      <span className="font-mono text-sm sm:text-base font-bold text-[var(--neon-green)] truncate">
                        {email}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <PixelButton
                        size="sm"
                        variant="secondary"
                        onClick={() => handleStartEdit(idx, email)}
                        disabled={isSaving}
                      >
                        ✎ EDIT
                      </PixelButton>
                      <PixelButton
                        size="sm"
                        variant="danger"
                        onClick={() => setDeleteTarget(email)}
                        disabled={isSaving}
                      >
                        ✕ DELETE
                      </PixelButton>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}

        {/* Club System Default Address Card */}
        <div className="p-3 bg-[var(--night-2)] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)] flex items-center justify-between gap-3 opacity-90">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-base">👑</span>
            <span className="font-mono text-sm sm:text-base text-[var(--text-1)] truncate">
              {clubEmail}
            </span>
            <span className="text-[11px] font-display uppercase tracking-wider text-[var(--neon-gold)] border border-[var(--neon-gold)] px-1.5 py-0.5 font-bold">
              Club Default
            </span>
          </div>
          <span className="font-mono text-xs text-[var(--text-3)] hidden sm:inline">
            Always receives alerts
          </span>
        </div>
      </div>

      {/* Popconfirm Modal for Delete */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--night-0)]/80 px-dither"
        >
          <div className="w-full max-w-md bg-[var(--night-2)] border-2 border-[var(--neon-red)] p-5 shadow-[4px_4px_0_var(--outline)] space-y-4 px-panel">
            <div className="flex items-center gap-2 border-b-2 border-[var(--outline)] pb-2">
              <span className="text-xl">⚠️</span>
              <h3 className="font-display text-sm tracking-wider text-[var(--neon-red)] uppercase font-bold">
                CONFIRM DELETE
              </h3>
            </div>

            <p className="font-body text-base text-[var(--text-1)]">
              Delete notification email <strong className="font-mono text-[var(--neon-gold)]">{deleteTarget}</strong>?
            </p>
            <p className="font-body text-xs text-[var(--text-2)]">
              This email will no longer receive slot alerts or system notifications. You can re-add it anytime.
            </p>

            <div className="flex gap-3 justify-end pt-2">
              <PixelButton
                size="md"
                variant="secondary"
                onClick={() => setDeleteTarget(null)}
              >
                CANCEL
              </PixelButton>
              <PixelButton
                size="md"
                variant="danger"
                onClick={handleConfirmDelete}
                disabled={isSaving}
              >
                {isSaving ? 'DELETING…' : 'CONFIRM DELETE'}
              </PixelButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
