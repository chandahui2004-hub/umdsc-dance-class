import type { ReactElement } from 'react';

export interface LogoBadgeProps {
  height?: number;
  className?: string;
}

export function LogoBadge({ height = 96, className = '' }: LogoBadgeProps): ReactElement {
  const width = Math.round((height * 4) / 3);

  return (
    <div
      className={`relative inline-block select-none ${className}`}
      style={{ width: `${width}px`, height: `${height}px` }}
    >
      {/* Retro pixel backing rectangle */}
      <div
        className="absolute inset-[10%] bg-[var(--night-2)] border border-[var(--outline)]"
        aria-hidden="true"
      />

      {/* 8-bit Retro UMDSC Pixel Logo */}
      <img
        src="/logo-pixel.png"
        alt="UMDSC logo"
        className="absolute inset-[10%] w-[80%] h-[80%] object-contain drop-shadow-[0_0_8px_rgba(0,240,255,0.5)]"
        style={{ imageRendering: 'pixelated' }}
        draggable={false}
      />

      {/* Neon marquee frame overlay */}
      <img
        src="/art/a7-frame.webp"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full px-art pointer-events-none"
        draggable={false}
      />
    </div>
  );
}
