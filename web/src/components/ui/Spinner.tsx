import React from 'react';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  label = 'Loading...',
  className = ''
}) => {
  const pixelSize = {
    sm: 16,
    md: 24,
    lg: 36
  }[size];

  return (
    <div
      role="status"
      aria-label={label}
      className={`inline-flex flex-col items-center justify-center gap-2 select-none ${className}`}
    >
      {/* 8-bit rotating block spinner */}
      <svg
        width={pixelSize}
        height={pixelSize}
        viewBox="0 0 16 16"
        fill="currentColor"
        shapeRendering="crispEdges"
        className="px-blink text-[var(--c-orange)]"
      >
        <rect x="2" y="2" width="4" height="4" fill="var(--c-orange)" />
        <rect x="10" y="2" width="4" height="4" fill="var(--c-yellow)" />
        <rect x="10" y="10" width="4" height="4" fill="var(--c-green)" />
        <rect x="2" y="10" width="4" height="4" fill="var(--c-blue)" />
      </svg>
      {label && (
        <span className="font-display text-[10px] text-[var(--text-1)] tracking-wider">
          {label}
        </span>
      )}
    </div>
  );
};
