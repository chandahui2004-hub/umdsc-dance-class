import type { ReactElement } from 'react';

export interface BoomboxProps {
  size?: 32 | 64 | 96;
  className?: string;
}

export function Boombox({ size = 64, className = '' }: BoomboxProps): ReactElement {
  return (
    <img
      src="/art/a10-boombox.webp"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`px-art px-bounce inline-block select-none drop-shadow-[0_0_8px_rgba(62,230,255,0.6)] ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
    />
  );
}
