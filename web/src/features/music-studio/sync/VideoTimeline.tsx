import React, { useRef, useCallback, useState } from 'react';

export interface VideoTimelineProps {
  currentTime: number;
  duration: number;
  videoStart: number;
  onSeek: (time: number) => void;
  onSetVideoStart: (time: number) => void;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
}

export const VideoTimeline: React.FC<VideoTimelineProps> = ({
  currentTime,
  duration,
  videoStart,
  onSeek,
  onSetVideoStart,
}) => {
  const barRef = useRef<HTMLDivElement>(null);
  const isDraggingFlagRef = useRef(false);
  const [isHoveringFlag, setIsHoveringFlag] = useState(false);
  const safeDuration = duration > 0 ? duration : 100;

  const getTimeFromEvent = useCallback(
    (clientX: number): number => {
      if (!barRef.current) return 0;
      const rect = barRef.current.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const ratio = clickX / rect.width;
      return Math.round(ratio * safeDuration * 10) / 10;
    },
    [safeDuration]
  );

  const handleBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDraggingFlagRef.current) {
      isDraggingFlagRef.current = false;
      return;
    }
    const time = getTimeFromEvent(e.clientX);
    onSeek(time);
  };

  const handleFlagMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    let moved = false;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      moved = true;
      isDraggingFlagRef.current = true;
      const time = getTimeFromEvent(moveEvent.clientX);
      onSetVideoStart(time);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (moved) {
        setTimeout(() => {
          isDraggingFlagRef.current = false;
        }, 100);
      } else {
        isDraggingFlagRef.current = false;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleFlagTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    let moved = false;

    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches[0]) {
        moved = true;
        isDraggingFlagRef.current = true;
        const time = getTimeFromEvent(moveEvent.touches[0].clientX);
        onSetVideoStart(time);
      }
    };

    const handleTouchEnd = () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      if (moved) {
        setTimeout(() => {
          isDraggingFlagRef.current = false;
        }, 100);
      } else {
        isDraggingFlagRef.current = false;
      }
    };

    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);
  };

  const playheadPercent = Math.min(100, Math.max(0, (currentTime / safeDuration) * 100));
  const startFlagPercent = Math.min(100, Math.max(0, (videoStart / safeDuration) * 100));

  return (
    <div className="w-full select-none bg-[var(--night-1)] p-2 border-2 border-[var(--outline)]">
      {/* Timecode header */}
      <div className="flex justify-between items-center text-[12px] font-mono text-[var(--neon-green)] mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--text-2)]">VIDEO:</span>
          <span>{formatTime(currentTime)}</span>
          <span className="text-[var(--violet-4)]">/</span>
          <span className="text-[var(--text-2)]">{formatTime(duration)}</span>
        </div>
        <div className="flex items-center gap-1 bg-[var(--night-2)] px-1.5 py-0.5 border border-[var(--neon-gold)]">
          <span className="text-[var(--neon-gold)]">⚑ START:</span>
          <span className="text-[var(--text-1)] font-bold">{formatTime(videoStart)}</span>
        </div>
      </div>

      {/* Progress Track */}
      <div
        ref={barRef}
        onClick={handleBarClick}
        className="relative h-6 bg-[var(--night-2)] border-2 border-[var(--outline)] cursor-pointer overflow-visible px-well"
        title="Click to seek video; drag yellow flag to set alignment start"
      >
        {/* Playhead bar */}
        <div
          className="absolute top-0 bottom-0 bg-[color-mix(in_srgb,var(--neon-cyan)_20%,transparent)] border-r-2 border-[var(--neon-cyan)] transition-[width] duration-75"
          style={{ width: `${playheadPercent}%` }}
        />

        {/* Video Start Flag */}
        <div
          onMouseDown={handleFlagMouseDown}
          onTouchStart={handleFlagTouchStart}
          onMouseEnter={() => setIsHoveringFlag(true)}
          onMouseLeave={() => setIsHoveringFlag(false)}
          className="absolute -top-1.5 -bottom-1.5 w-6 -ml-3 flex flex-col items-center cursor-ew-resize z-20 group"
          style={{ left: `${startFlagPercent}%` }}
          title={`Start flag: ${formatTime(videoStart)} (drag to move)`}
        >
          {/* Tooltip on hover/drag */}
          {isHoveringFlag && (
            <div
              className="absolute -top-6 px-1.5 py-0.5 bg-[var(--night-2)] border border-[var(--neon-gold)] text-[10px] font-mono text-[var(--neon-gold)] whitespace-nowrap shadow-[1px_1px_0_var(--outline)] pointer-events-none"
            >
              Start: {formatTime(videoStart)}
            </div>
          )}
          {/* Flag pennant */}
          <div className="w-4 h-3 bg-[var(--neon-gold)] border border-[var(--outline)] flex items-center justify-center shadow-[1px_1px_0_var(--outline)]">
            <span className="text-[8px] font-bold text-[var(--on-neon)] leading-none">⚑</span>
          </div>
          {/* Flag pole line */}
          <div className="w-0.5 flex-1 bg-[var(--neon-gold)]" />
        </div>

        {/* Playhead marker indicator (2px wide cyan per spec) */}
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-[var(--neon-cyan)] -ml-[1px] z-10 pointer-events-none"
          style={{ left: `${playheadPercent}%` }}
        />
      </div>

      <div className="flex justify-between items-center mt-1 text-[10px] font-mono text-[var(--text-2)]">
        <span>00:00</span>
        <span className="text-[10px] text-[var(--neon-orange)]">DRAG ⚑ TO ALIGN VIDEO START</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
};
