import React from 'react';

export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface ToastProps {
  message: string;
  type?: ToastType;
  onClose?: () => void;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  onClose
}) => {
  const bgColors = {
    info: 'bg-[var(--c-blue)] text-[var(--c-panel)]',
    success: 'bg-[var(--c-green)] text-[var(--c-ink)]',
    error: 'bg-[var(--c-red)] text-[var(--c-panel)]',
    warning: 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
  }[type];

  return (
    <div
      role="status"
      className={`fixed bottom-20 sm:bottom-6 right-4 left-4 sm:left-auto sm:max-w-md z-50 p-4 border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] flex items-center justify-between gap-3 ${bgColors}`}
    >
      <span className="font-display text-xs tracking-wider">{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Dismiss"
          className="text-inherit font-display text-xs cursor-pointer px-1 active:translate-x-[2px]"
        >
          ✕
        </button>
      )}
    </div>
  );
};
