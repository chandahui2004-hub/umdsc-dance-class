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
      {/* Lightbox backing rectangle */}
      <div
        className="absolute inset-[12.5%]"
        style={{ backgroundColor: 'var(--text-1)' }}
        aria-hidden="true"
      />

      {/* Real UMDSC logo */}
      <img
        src="/logo.png"
        alt="UMDSC logo"
        className="absolute inset-[12.5%] w-[75%] h-[75%] object-contain"
        style={{ imageRendering: 'auto' }}
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
