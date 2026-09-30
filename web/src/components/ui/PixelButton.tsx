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
    sm: 'min-h-[36px] px-2.5 py-1 text-[10px]',
    md: 'min-h-[44px] px-4 py-2 text-xs',
    lg: 'min-h-[52px] px-6 py-3 text-sm'
  }[size];

  const variantStyles = {
    primary:
      'bg-[var(--c-orange)] text-[var(--c-ink)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] hover:bg-[var(--c-yellow)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none',
    secondary:
      'bg-[var(--c-panel)] text-[var(--c-ink)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] hover:bg-[var(--c-peach)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none',
    danger:
      'bg-[var(--c-red)] text-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] hover:brightness-110 active:translate-x-[4px] active:translate-y-[4px] active:shadow-none',
    ghost:
      'bg-transparent text-[var(--c-ink)] border-2 border-dashed border-[var(--c-ink)] hover:bg-[var(--c-peach)] active:translate-x-[2px] active:translate-y-[2px]'
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
