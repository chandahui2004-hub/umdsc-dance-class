import { useState, useEffect } from 'react';
import type { ReactElement } from 'react';
import { getDriveThumbnailUrl } from '../../lib/instructorPhotos';

export interface PixelPortraitFrameProps {
  src: string;
  alt: string;
  name?: string;
  glow: string;
  size?: 'sm' | 'md' | 'lg';
  showNamePlate?: boolean;
  className?: string;
}

const SIZE_CONFIG = {
  sm: {
    container: 'w-[120px]',
    image: 'w-[120px] h-[150px]',
  },
  md: {
    container: 'w-[160px]',
    image: 'w-[160px] h-[200px]',
  },
  lg: {
    container: 'w-[216px] max-[360px]:w-full',
    image: 'w-[216px] max-[360px]:w-full h-[270px]',
  },
} as const;

export function PixelPortraitFrame({
  src,
  alt,
  name,
  glow,
  size = 'sm',
  showNamePlate,
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

  const sizeConfig = SIZE_CONFIG[size] || SIZE_CONFIG.sm;
  const shouldShowNamePlate = showNamePlate ?? Boolean(name);

  return (
    <div
      data-testid="pixel-portrait-frame"
      className={`inline-flex flex-col px-panel px-neon shrink-0 ${sizeConfig.container} ${className}`}
      style={{
        ['--glow' as any]: glow,
      }}
    >
      {/* 4:5 Portrait area */}
      <div
        className={`relative overflow-hidden ${sizeConfig.image}`}
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
      {shouldShowNamePlate && name && (
        <div
          className="flex items-center px-2 py-1 bg-[var(--night-2)] border-t border-[var(--outline)] min-w-0 overflow-hidden"
          style={{ borderLeft: `4px solid ${glow}` }}
        >
          <span className="font-display text-[10px] text-[var(--text-1)] truncate uppercase block w-full">
            {name}
          </span>
        </div>
      )}
    </div>
  );
}
