import type { ReactElement } from 'react';

export interface NeonSignProps {
  text: string;
  color: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function NeonSign({
  text,
  color,
  size = 'md',
  className = '',
}: NeonSignProps): ReactElement {
  const fontSizeClass = size === 'sm' ? 'text-[12px]' : 'text-[16px]';

  return (
    <span
      data-testid="neon-sign"
      className={`inline-flex items-center justify-center font-display uppercase tracking-wider px-4 py-1 px-glow-text select-none ${fontSizeClass} ${className}`}
      style={{
        backgroundImage: 'url(/art/a8-plate.webp)',
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        color: 'var(--text-1)',
        ['--glow' as any]: color,
        borderBottom: `2px solid ${color}`,
      }}
    >
      {text.toUpperCase()}
    </span>
  );
}
