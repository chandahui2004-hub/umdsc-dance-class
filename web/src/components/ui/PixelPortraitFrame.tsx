import React, { useState, useEffect } from 'react';
import type { ReactElement } from 'react';
import { getDriveThumbnailUrl } from '../../lib/instructorPhotos';

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
  const [currentSrc, setCurrentSrc] = useState(src);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setCurrentSrc(src);
    setHasError(false);
  }, [src]);

  const handleImageError = () => {
    if (currentSrc && currentSrc.includes('googleusercontent.com') && !currentSrc.includes('thumbnail')) {
      const fallback = getDriveThumbnailUrl(currentSrc);
      if (fallback !== currentSrc) {
        setCurrentSrc(fallback);
        return;
      }
    }
    setHasError(true);
  };

  const dimensions =
    size === 'lg'
      ? 'w-[216px] max-[360px]:w-full h-[270px]'
      : 'w-[120px] h-[150px]';

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
        {currentSrc && !hasError ? (
          <img
            src={currentSrc}
            alt={alt}
            referrerPolicy="no-referrer"
            onError={handleImageError}
            className="absolute inset-0 w-full h-full object-cover object-top"
            style={{ imageRendering: 'auto' }}
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center">
            <span className="font-display text-2xl text-[var(--text-2)] mb-1">👤</span>
            <span className="font-display text-[8px] text-[var(--text-2)] uppercase leading-tight">
              {name ? name.slice(0, 2).toUpperCase() : 'TBA'}
            </span>
          </div>
        )}

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
