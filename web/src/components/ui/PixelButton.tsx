import React from 'react';

export type PixelButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type PixelButtonSize = 'sm' | 'md' | 'lg';

export interface PixelButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PixelButtonVariant;
  size?: PixelButtonSize;
  children: React.ReactNode;
}

export const PixelButton: React.FC<PixelButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  children,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-display uppercase tracking-wider select-none cursor-pointer transition-none disabled:opacity-50 disabled:pointer-events-none text-center';

  const sizeStyles = {
    sm: 'min-h-[44px] px-3 py-1 text-[8px]',
    md: 'min-h-[48px] px-4 py-2 text-[12px]',
    lg: 'min-h-[56px] px-6 py-3 text-[16px]',
  }[size];

  const variantStyles = {
    primary:
      'bg-[var(--neon-pink)] text-[var(--on-neon)] border-4 border-[var(--outline)] shadow-[inset_2px_2px_0_var(--neon-pink-hi),inset_-2px_-2px_0_var(--neon-pink-lo),4px_4px_0_var(--outline)] hover:brightness-105 hover:shadow-[inset_2px_2px_0_var(--neon-pink-hi),inset_-2px_-2px_0_var(--neon-pink-lo),4px_4px_0_var(--outline),0_0_8px_var(--neon-pink)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-[inset_2px_2px_0_var(--neon-pink-hi),inset_-2px_-2px_0_var(--neon-pink-lo)]',
    secondary:
      'px-panel text-[var(--text-1)] border-4 border-[var(--outline)] shadow-[4px_4px_0_var(--outline)] hover:bg-[var(--violet-2)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none',
    danger:
      'bg-[var(--neon-red)] text-[var(--on-neon)] border-4 border-[var(--outline)] shadow-[4px_4px_0_var(--outline)] hover:brightness-110 active:translate-x-[4px] active:translate-y-[4px] active:shadow-none',
    ghost:
      'bg-transparent text-[var(--text-2)] border-2 border-dashed border-[var(--violet-4)] hover:text-[var(--neon-cyan)] hover:border-[var(--neon-cyan)] active:translate-x-[2px] active:translate-y-[2px]',
  }[variant];

  return (
    <button
      disabled={disabled}
      className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
