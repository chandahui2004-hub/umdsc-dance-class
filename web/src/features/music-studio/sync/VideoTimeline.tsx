import React, { useRef, useCallback } from 'react';

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
    // If clicking on the track, seek the video
    const time = getTimeFromEvent(e.clientX);
    onSeek(time);
  };

  const handleFlagMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const time = getTimeFromEvent(moveEvent.clientX);
      onSetVideoStart(time);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleFlagTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches[0]) {
        const time = getTimeFromEvent(moveEvent.touches[0].clientX);
        onSetVideoStart(time);
      }
    };

    const handleTouchEnd = () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };

    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);
  };

  const playheadPercent = Math.min(100, Math.max(0, (currentTime / safeDuration) * 100));
  const startFlagPercent = Math.min(100, Math.max(0, (videoStart / safeDuration) * 100));

  return (
    <div className="w-full select-none bg-[#111827] p-2 border-2 border-black">
      {/* Timecode header */}
      <div className="flex justify-between items-center text-[10px] min-text-5px font-mono text-[#00E436] mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[#C2C3C7]">VIDEO:</span>
          <span>{formatTime(currentTime)}</span>
          <span className="text-[#5F574F]">/</span>
          <span className="text-[#C2C3C7]">{formatTime(duration)}</span>
        </div>
        <div className="flex items-center gap-1 bg-black px-1.5 py-0.5 border border-[#FFEC27]">
          <span className="text-[#FFEC27]">⚑ START:</span>
          <span className="text-white font-bold">{formatTime(videoStart)}</span>
        </div>
      </div>

      {/* Progress Track */}
      <div
        ref={barRef}
        onClick={handleBarClick}
        className="relative h-6 bg-[#1f2937] border-2 border-black cursor-pointer overflow-visible"
        title="Click to seek video; drag yellow flag to set alignment start"
      >
        {/* Playhead bar */}
        <div
          className="absolute top-0 bottom-0 bg-[#29ADFF]/40 border-r-2 border-[#29ADFF] transition-[width] duration-75"
          style={{ width: `${playheadPercent}%` }}
        />

        {/* Video Start Flag */}
        <div
          onMouseDown={handleFlagMouseDown}
          onTouchStart={handleFlagTouchStart}
          className="absolute -top-1.5 -bottom-1.5 w-6 -ml-3 flex flex-col items-center cursor-ew-resize z-20 group"
          style={{ left: `${startFlagPercent}%` }}
          title={`Start flag: ${formatTime(videoStart)} (drag to move)`}
        >
          {/* Flag pennant */}
          <div className="w-4 h-3 bg-[#FFEC27] border border-black flex items-center justify-center shadow-[1px_1px_0_#000]">
            <span className="text-[7px] min-text-5px font-bold text-black leading-none">⚑</span>
          </div>
          {/* Flag pole line */}
          <div className="w-1 flex-1 bg-[#FFEC27] border-x border-black" />
        </div>

        {/* Playhead marker indicator */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-[#29ADFF] -ml-0.5 z-10 pointer-events-none"
          style={{ left: `${playheadPercent}%` }}
        />
      </div>

      <div className="flex justify-between items-center mt-1 text-[8px] min-text-5px text-[#C2C3C7]">
        <span>00:00</span>
        <span className="text-[7px] text-[#FFA300]">DRAG ⚑ TO ALIGN VIDEO START</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
};
