import type { ReactElement } from 'react';

export function SkylineStrip(): ReactElement {
  return (
    <div
      data-testid="skyline-strip"
      aria-hidden="true"
      className="w-full px-art select-none pointer-events-none"
      style={{
        height: '48px',
        background: 'url(/art/a5-strip.webp) repeat-x bottom left / 960px 48px',
        borderBottom: '2px solid var(--outline)',
      }}
    />
  );
}
