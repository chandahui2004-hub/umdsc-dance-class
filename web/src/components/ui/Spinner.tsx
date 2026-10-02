import React, { useState } from 'react';

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
  const [hasError, setHasError] = useState(false);

  const boomboxSize = {
    sm: 32 as const,
    md: 64 as const,
    lg: 96 as const
  }[size];

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
      {!hasError ? (
        <img
          src="/art/a10-boombox.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="px-art px-bounce select-none"
          style={{ width: `${boomboxSize}px`, height: `${boomboxSize}px` }}
          onError={() => setHasError(true)}
        />
      ) : (
        /* Fallback 8-bit rotating block spinner */
        <svg
          width={pixelSize}
          height={pixelSize}
          viewBox="0 0 16 16"
          fill="currentColor"
          shapeRendering="crispEdges"
          className="px-blink text-[var(--neon-pink)]"
        >
          <rect x="2" y="2" width="4" height="4" fill="var(--neon-pink)" />
          <rect x="10" y="2" width="4" height="4" fill="var(--neon-gold)" />
          <rect x="10" y="10" width="4" height="4" fill="var(--neon-green)" />
          <rect x="2" y="10" width="4" height="4" fill="var(--neon-cyan)" />
        </svg>
      )}
      {label && (
        <span className="font-display text-[10px] text-[var(--text-1)] tracking-wider">
          {label}
        </span>
      )}
    </div>
  );
};
