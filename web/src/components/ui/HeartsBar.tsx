import React from 'react';

interface HeartsBarProps {
  attended: number;
  total: number;
  className?: string;
}

export const HeartsBar: React.FC<HeartsBarProps> = ({
  attended,
  total,
  className = ''
}) => {
  const count = Math.max(0, total);
  const filledCount = Math.min(count, Math.max(0, attended));

  return (
    <div
      role="img"
      aria-label={`${attended} of ${total} classes attended`}
      className={`inline-flex items-center gap-1.5 ${className}`}
    >
      {Array.from({ length: count }).map((_, index) => {
        const isFilled = index < filledCount;
        return (
          <span
            key={index}
            data-filled={isFilled ? 'true' : 'false'}
            className="inline-block transition-transform select-none"
            style={{
              color: isFilled ? 'var(--neon-pink)' : 'var(--violet-4)'
            }}
          >
            {/* 8-bit Pixel Heart SVG (16x16) */}
            <svg
              width="20"
              height="20"
              viewBox="0 0 16 16"
              fill="currentColor"
              shapeRendering="crispEdges"
              aria-hidden="true"
            >
              {isFilled ? (
                <>
                  {/* Outer border & filled heart */}
                  <rect x="2" y="3" width="4" height="2" />
                  <rect x="10" y="3" width="4" height="2" />
                  <rect x="1" y="5" width="14" height="4" />
                  <rect x="2" y="9" width="12" height="2" />
                  <rect x="4" y="11" width="8" height="2" />
                  <rect x="6" y="13" width="4" height="2" />
                </>
              ) : (
                <>
                  {/* Outline heart */}
                  <rect x="2" y="3" width="4" height="1" fill="var(--outline)" />
                  <rect x="10" y="3" width="4" height="1" fill="var(--outline)" />
                  <rect x="1" y="4" width="1" height="5" fill="var(--outline)" />
                  <rect x="14" y="4" width="1" height="5" fill="var(--outline)" />
                  <rect x="6" y="4" width="4" height="1" fill="var(--outline)" />
                  <rect x="2" y="9" width="2" height="2" fill="var(--outline)" />
                  <rect x="12" y="9" width="2" height="2" fill="var(--outline)" />
                  <rect x="4" y="11" width="2" height="2" fill="var(--outline)" />
                  <rect x="10" y="11" width="2" height="2" fill="var(--outline)" />
                  <rect x="6" y="13" width="4" height="1" fill="var(--outline)" />
                  {/* Empty interior */}
                  <rect x="2" y="4" width="4" height="5" fill="var(--violet-4)" />
                  <rect x="10" y="4" width="4" height="5" fill="var(--violet-4)" />
                  <rect x="4" y="5" width="8" height="6" fill="var(--violet-4)" />
                </>
              )}
            </svg>
          </span>
        );
      })}
    </div>
  );
};
