import type { ReactElement } from 'react';

export interface PixelPortraitFrameProps {
  src: string;
  alt: string;
  name: string;
  glow: string;
  size?: 'sm' | 'lg';
  className?: string;
}

export function PixelPortraitFrame({
  src,
  alt,
  name,
  glow,
  size = 'sm',
  className = '',
}: PixelPortraitFrameProps): ReactElement {
  const dimensions =
    size === 'lg'
      ? 'w-[216px] max-[360px]:w-full h-[270px]'
      : 'w-[96px] h-[120px]';

  return (
    <div
      data-testid="pixel-portrait-frame"
      className={`inline-flex flex-col px-panel px-neon ${className}`}
      style={{
        ['--glow' as any]: glow,
      }}
    >
      {/* 4:5 Portrait area */}
      <div
        className={`relative overflow-hidden ${dimensions}`}
        style={{
          background:
            'linear-gradient(to bottom, var(--night-0) 0 25%, var(--night-1) 25% 55%, var(--night-2) 55% 80%, var(--violet-1) 80%)',
        }}
      >
        {/* Starfield overlay behind photo */}
        <div className="absolute inset-0 px-starfield pointer-events-none" />

        {/* Photo */}
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ imageRendering: 'auto' }}
          draggable={false}
        />

        {/* Scanlines overlay */}
        <div className="absolute inset-0 px-scanlines pointer-events-none" />
      </div>

      {/* Name plate */}
      <div
        className="flex items-center px-2 py-1 bg-[var(--night-2)] border-t border-[var(--outline)]"
        style={{ borderLeft: `4px solid ${glow}` }}
      >
        <span className="font-display text-[12px] text-[var(--text-1)] truncate uppercase">
          {name}
        </span>
      </div>
    </div>
  );
}
