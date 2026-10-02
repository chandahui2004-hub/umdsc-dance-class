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
  const stripeColors = {
    info: 'border-l-[8px] border-l-[var(--neon-cyan)]',
    success: 'border-l-[8px] border-l-[var(--neon-green)]',
    error: 'border-l-[8px] border-l-[var(--neon-red)]',
    warning: 'border-l-[8px] border-l-[var(--neon-gold)]'
  }[type];

  return (
    <div
      role="status"
      className={`fixed bottom-20 sm:bottom-6 right-4 left-4 sm:left-auto sm:max-w-md z-[var(--z-toast)] p-4 px-panel px-toast-animated text-[var(--text-1)] flex items-center justify-between gap-3 ${stripeColors}`}
    >
      <span className="font-display text-[12px] tracking-wider">{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Dismiss"
          className="text-inherit font-display text-[12px] cursor-pointer px-1 active:translate-x-[2px] hover:text-[var(--neon-pink)]"
        >
          ✕
        </button>
      )}
    </div>
  );
};
