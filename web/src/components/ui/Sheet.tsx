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
      className="fixed inset-0 z-[var(--z-overlay)] flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[var(--night-0)]/80 px-dither cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet Content */}
      <div className="relative z-10 w-full max-w-lg px-panel border-t-2 border-t-[var(--neon-cyan)] max-h-[calc(100dvh-48px)] flex flex-col px-sheet-animated">
        {/* Grab bar for phone */}
        <div className="flex sm:hidden justify-center items-center gap-1 pt-2 pb-1 bg-[var(--night-2)]" aria-hidden="true">
          <div className="w-1 h-1 bg-[var(--violet-4)]" />
          <div className="w-1 h-1 bg-[var(--violet-4)]" />
          <div className="w-1 h-1 bg-[var(--violet-4)]" />
        </div>

        {/* Header */}
        <div className="bg-[var(--night-2)] text-[var(--text-1)] px-4 py-3 border-b-2 border-[var(--neon-cyan)] flex items-center justify-between">
          <h2 className="font-display text-[12px] tracking-wider uppercase px-glow-text">
            {title || 'Dialog'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center bg-[var(--neon-red)] text-[var(--on-neon)] border-2 border-[var(--outline)] font-display text-[12px] cursor-pointer active:translate-x-[2px] active:translate-y-[2px]"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto pixel-scrollbar font-body text-base flex-1">
          {children}
        </div>
      </div>
    </div>
  );
};
