import React, { useEffect } from 'react';
import { useOverlayOpen } from '../../app/useOverlayOpen';

export interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  backdropTestId?: string;
  contentTestId?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}

export const SideDrawer: React.FC<SideDrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  backdropTestId,
  contentTestId,
  children,
  footer,
  width = 'w-full sm:w-[480px] max-w-full'
}) => {
  useOverlayOpen(isOpen);

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
      className="fixed inset-0 z-[var(--z-overlay)] flex justify-end"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[var(--night-0)]/80 px-dither cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
        data-testid={backdropTestId || 'side-drawer-backdrop'}
      />

      {/* Drawer Panel */}
      <div
        data-testid={contentTestId || 'side-drawer-content'}
        className={`relative z-10 ${width} h-full bg-[var(--night-2)] border-l-4 border-[var(--neon-cyan)] shadow-[-8px_0_0_var(--outline)] flex flex-col`}
      >
        {/* Header */}
        <div className="bg-[var(--night-1)] text-[var(--text-1)] px-4 py-3 border-b-2 border-[var(--outline)] flex items-center justify-between shrink-0">
          <div className="min-w-0 pr-2">
            <h2 className="font-display text-[12px] sm:text-[14px] tracking-wider uppercase text-[var(--neon-cyan)] px-glow-text truncate">
              {title || 'Selected Date Classes'}
            </h2>
            {subtitle && (
              <p className="font-mono text-[11px] text-[var(--text-3)] truncate mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 shrink-0 flex items-center justify-center bg-[var(--neon-red)] text-[var(--on-neon)] border-2 border-[var(--outline)] font-display text-[12px] cursor-pointer shadow-[2px_2px_0_var(--outline)] active:translate-x-[2px] active:translate-y-[2px]"
          >
            ✕
          </button>
        </div>

        {/* Drawer Body */}
        <div className="p-4 overflow-y-auto pixel-scrollbar font-body text-base flex-1 space-y-4">
          {children}
        </div>

        {/* Optional Footer */}
        {footer && (
          <div className="p-3 bg-[var(--night-1)] border-t-2 border-[var(--outline)] shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
