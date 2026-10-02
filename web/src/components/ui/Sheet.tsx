import React, { useEffect } from 'react';

export interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const Sheet: React.FC<SheetProps> = ({
  isOpen,
  onClose,
  title,
  children
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[var(--c-ink)] opacity-60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet Content */}
      <div className="relative z-10 w-full max-w-lg bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[6px_6px_0_var(--c-ink)] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-[var(--c-navy)] text-[var(--text-1)] px-4 py-3 border-b-4 border-[var(--c-ink)] flex items-center justify-between">
          <h2 className="font-display text-xs tracking-wider uppercase">
            {title || 'Dialog'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center bg-[var(--c-red)] text-[var(--on-neon)] border-2 border-[var(--c-ink)] font-display text-xs cursor-pointer active:translate-x-[2px] active:translate-y-[2px]"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto font-body text-base flex-1">
          {children}
        </div>
      </div>
    </div>
  );
};
