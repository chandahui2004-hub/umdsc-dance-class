// Ported from DanceCue by JzeAnson (https://github.com/JzeAnson/DanceCue), used with permission.

import React, { useRef, useState } from "react";

type AudioPlayerProps = {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  currentTime: number;
  duration: number;
  isMarkerDraftActive: boolean;
  isLooping: boolean;
  isPlaying: boolean;
  markerDraftRange: { start: number; end: number } | null;
  onLoopToggle: () => void;
  onMarkerDraftChange: (range: { start: number; end: number } | null) => void;
  onPause: () => void;
  onPlay: () => void;
  onSeek: (time: number) => void;
  onSkip: (seconds: number) => void;
  onSpeedChange: (speed: number) => void;
  playbackRate: number;
  /** SoundCloud's player has no speed control, so the selector is switched off with an explanation. */
  speedDisabled?: boolean;
};

const controlButtonClass =
  "grid size-12 shrink-0 place-items-center border-2 border-black bg-white text-xs font-['Press_Start_2P'] text-black shadow-[2px_2px_0_#000] transition active:translate-x-[1px] active:translate-y-[1px] hover:bg-[#FFF1E8] disabled:cursor-not-allowed disabled:opacity-45";
const loopButtonOffClass =
  "grid size-12 shrink-0 place-items-center border-2 border-black bg-white text-[9px] min-text-5px font-['Press_Start_2P'] text-black shadow-[2px_2px_0_#000] transition active:translate-x-[1px] active:translate-y-[1px] hover:bg-[#FFF1E8]";
const loopButtonOnClass =
  "grid size-12 shrink-0 place-items-center border-2 border-black bg-[#FFEC27] text-[9px] min-text-5px font-['Press_Start_2P'] text-black shadow-[2px_2px_0_#000] transition active:translate-x-[1px] active:translate-y-[1px]";
const panelClass = "border-4 border-black bg-[#1D2B53] px-3 pb-4 pt-3 shadow-[4px_4px_0_#000]";
const waveformHeights = [
  22, 30, 18, 27, 35, 24, 31, 16, 38, 22, 28, 17, 34, 25, 19, 36, 42, 23, 31, 18, 35, 27, 21,
  32, 17, 25, 37, 29, 21, 34, 40, 18, 28, 36, 24, 32, 19,
];
const speedOptions = [0.75, 0.8, 0.9, 1, 1.25];

export function formatTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds)) {
    return "0:00";
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

export function AudioPlayer({
  audioRef,
  currentTime,
  duration,
  isMarkerDraftActive,
  isLooping,
  isPlaying,
  markerDraftRange,
  onLoopToggle,
  onMarkerDraftChange,
  onPause,
  onPlay,
  onSeek,
  onSkip,
  onSpeedChange,
  playbackRate,
  speedDisabled = false,
}: AudioPlayerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragAnchorRef = useRef<number | null>(null);
  const didDragRef = useRef(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const [tooltip, setTooltip] = useState<{ text: string; leftPercent: number } | null>(null);

  const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
  const hasDraftRange =
    duration > 0 && markerDraftRange && markerDraftRange.end > markerDraftRange.start;
  const draftStart = hasDraftRange ? (markerDraftRange.start / duration) * 100 : 0;
  const draftWidth = hasDraftRange ? ((markerDraftRange.end - markerDraftRange.start) / duration) * 100 : 0;

  const getTimeFromClientX = (clientX: number | undefined): number => {
    if (!trackRef.current || !duration || typeof clientX !== 'number' || Number.isNaN(clientX)) {
      return 0;
    }
    const bounds = trackRef.current.getBoundingClientRect();
    const width = bounds.width || 1;
    const position = (clientX - (bounds.left || 0)) / width;
    const bounded = Math.min(Math.max(position, 0), 1);
    return bounded * duration;
  };

  // Drag Left Handle
  const handleStartHandlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!markerDraftRange) return;
    const endFixed = markerDraftRange.end;

    const onPointerMove = (moveEv: PointerEvent) => {
      const time = getTimeFromClientX(moveEv.clientX);
      const newStart = Math.max(0, Math.min(time, endFixed - 0.2));
      onMarkerDraftChange({ start: newStart, end: endFixed });
      setTooltip({
        text: `Start: ${formatTime(newStart)} (${(endFixed - newStart).toFixed(1)}s)`,
        leftPercent: (newStart / duration) * 100
      });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setTooltip(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Drag Right Handle
  const handleEndHandlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!markerDraftRange) return;
    const startFixed = markerDraftRange.start;

    const onPointerMove = (moveEv: PointerEvent) => {
      const time = getTimeFromClientX(moveEv.clientX);
      const newEnd = Math.min(duration, Math.max(time, startFixed + 0.2));
      onMarkerDraftChange({ start: startFixed, end: newEnd });
      setTooltip({
        text: `End: ${formatTime(newEnd)} (${(newEnd - startFixed).toFixed(1)}s)`,
        leftPercent: (newEnd / duration) * 100
      });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setTooltip(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Drag Center Span (moves whole range)
  const handleSpanPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!markerDraftRange) return;
    const initialPointerTime = getTimeFromClientX(e.clientX);
    const initialStart = markerDraftRange.start;
    const initialEnd = markerDraftRange.end;
    const rangeLength = initialEnd - initialStart;

    const onPointerMove = (moveEv: PointerEvent) => {
      const currentPointerTime = getTimeFromClientX(moveEv.clientX);
      const delta = currentPointerTime - initialPointerTime;
      const newStart = Math.min(Math.max(initialStart + delta, 0), Math.max(duration - rangeLength, 0));
      const newEnd = Math.min(newStart + rangeLength, duration);

      onMarkerDraftChange({ start: newStart, end: newEnd });
      setTooltip({
        text: `Loop: ${formatTime(newStart)} - ${formatTime(newEnd)} (${rangeLength.toFixed(1)}s)`,
        leftPercent: ((newStart + newEnd) / 2 / duration) * 100
      });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setTooltip(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Track Pointer Events (Seek, Double-Click, Single-Click boundary adjust)
  const handleTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!duration) return;
    const pointerTime = getTimeFromClientX(event.clientX);

    // Double-click seek
    if (event.detail === 2) {
      onSeek(pointerTime);
      return;
    }

    // Single-click nearest loop point adjustment when loop is active
    if ((isLooping || isMarkerDraftActive) && markerDraftRange && markerDraftRange.end > markerDraftRange.start) {
      const distStart = Math.abs(pointerTime - markerDraftRange.start);
      const distEnd = Math.abs(pointerTime - markerDraftRange.end);

      if (distStart <= distEnd) {
        onMarkerDraftChange({
          start: Math.min(pointerTime, markerDraftRange.end - 0.2),
          end: markerDraftRange.end
        });
      } else {
        onMarkerDraftChange({
          start: markerDraftRange.start,
          end: Math.max(pointerTime, markerDraftRange.start + 0.2)
        });
      }

      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 600);
      return;
    }

    if (isMarkerDraftActive) {
      dragAnchorRef.current = pointerTime;
      didDragRef.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
    } else {
      onSeek(pointerTime);
    }
  };

  const handleTrackPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const anchorTime = dragAnchorRef.current;
    if (anchorTime === null || !duration) return;
    const pointerTime = getTimeFromClientX(event.clientX);
    if (isMarkerDraftActive && Math.abs(pointerTime - anchorTime) >= 0.05) {
      didDragRef.current = true;
      const start = Math.min(anchorTime, pointerTime);
      const end = Math.max(anchorTime, pointerTime);
      onMarkerDraftChange({ start, end });
    }
  };

  const handleTrackPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragAnchorRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section className={panelClass} aria-label="Music player">
      <audio ref={audioRef} />

      <div
        ref={trackRef}
        className={`relative mt-2 h-9 touch-none select-none rounded-lg border bg-white/[0.08] cursor-pointer overflow-visible ${
          isMarkerDraftActive
            ? "border-cyan-200/35 shadow-[0_0_0_3px_rgba(103,232,249,0.08)]"
            : "border-white/5"
        }`}
        aria-label={isMarkerDraftActive ? "Drag to select marker duration" : "Seek through track"}
        role="slider"
        aria-valuemax={duration}
        aria-valuemin={0}
        aria-valuenow={currentTime}
        tabIndex={0}
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handleTrackPointerMove}
        onPointerUp={handleTrackPointerUp}
        onDoubleClick={(e) => onSeek(getTimeFromClientX(e.clientX))}
      >
        {/* Floating Tooltip */}
        {tooltip && (
          <div
            className="absolute -top-7 px-2 py-0.5 bg-black border border-[#FFEC27] text-[9px] font-mono text-[#FFEC27] whitespace-nowrap shadow-[2px_2px_0_#000] z-40 pointer-events-none -translate-x-1/2"
            style={{ left: `${tooltip.leftPercent}%` }}
          >
            {tooltip.text}
          </div>
        )}

        {/* Progress Bar */}
        <div
          className="absolute inset-y-0 left-0 bg-[#29ADFF]/30 border-r-2 border-[#29ADFF] pointer-events-none"
          style={{ width: `${progress}%` }}
        />

        {/* Loop Draft Range */}
        {hasDraftRange ? (
          <div
            className="absolute inset-y-0 z-20"
            style={{ left: `${draftStart}%`, width: `${draftWidth}%` }}
          >
            {/* Center Span (Drag to move entire loop range) */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Loop range span"
              data-testid="loop-span"
              onPointerDown={handleSpanPointerDown}
              className={`absolute inset-0 cursor-grab active:cursor-grabbing bg-[#FFEC27]/30 border-y-2 border-[#FFEC27] shadow-[0_0_8px_rgba(255,236,39,0.3)] transition-colors ${
                isPulsing ? 'animate-pulse ring-2 ring-[#FFEC27] bg-[#FFEC27]/60' : ''
              }`}
              title={`Loop range: ${formatTime(markerDraftRange.start)} - ${formatTime(markerDraftRange.end)} (${(markerDraftRange.end - markerDraftRange.start).toFixed(1)}s)`}
            />

            {/* Left Handle (Resize Start) */}
            <div
              role="slider"
              tabIndex={0}
              aria-label="Loop start handle"
              data-testid="loop-handle-start"
              onPointerDown={handleStartHandlePointerDown}
              className="absolute inset-y-0 -left-1.5 w-3 cursor-ew-resize bg-[#FFEC27] border border-black z-30 hover:scale-110 active:scale-125 transition-transform shadow-[1px_1px_0_#000]"
              title={`Loop start: ${formatTime(markerDraftRange.start)}`}
            />

            {/* Right Handle (Resize End) */}
            <div
              role="slider"
              tabIndex={0}
              aria-label="Loop end handle"
              data-testid="loop-handle-end"
              onPointerDown={handleEndHandlePointerDown}
              className="absolute inset-y-0 -right-1.5 w-3 cursor-ew-resize bg-[#FFEC27] border border-black z-30 hover:scale-110 active:scale-125 transition-transform shadow-[1px_1px_0_#000]"
              title={`Loop end: ${formatTime(markerDraftRange.end)}`}
            />
          </div>
        ) : null}

        {/* Current Playhead */}
        <div
          className="absolute inset-y-0 w-2 -ml-1 bg-[#29ADFF] border border-black z-10 shadow-[1px_1px_0_#000] pointer-events-none"
          style={{ left: `${progress}%` }}
          aria-hidden="true"
        />

        {/* Waveform Graphic */}
        <div className="absolute inset-x-2 top-1/2 flex -translate-y-1/2 items-center justify-between gap-1 pointer-events-none opacity-40">
          {waveformHeights.map((height, index) => (
            <span
              className="w-0.5 bg-[#FFEC27]"
              key={`${height}-${index}`}
              style={{ height: Math.max(8, height - 12) }}
            />
          ))}
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between px-1 font-mono text-[11px] min-text-5px font-bold tabular-nums text-[#00E436]">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <button
          className={isLooping ? loopButtonOnClass : loopButtonOffClass}
          type="button"
          aria-pressed={isLooping}
          title="Loop track"
          onClick={onLoopToggle}
        >
          Loop
        </button>
        <button
          className={controlButtonClass}
          type="button"
          title="Back 5 seconds"
          onClick={() => onSkip(-5)}
        >
          -5s
        </button>
        <button
          className="grid size-14 shrink-0 place-items-center border-4 border-black bg-[#FFA300] text-[11px] min-text-5px font-['Press_Start_2P'] text-black shadow-[3px_3px_0_#000] hover:bg-[#FFA300]/90 active:translate-x-[2px] active:translate-y-[2px]"
          type="button"
          title={isPlaying ? "Pause" : "Play"}
          onClick={isPlaying ? onPause : onPlay}
        >
          {isPlaying ? "II" : "Play"}
        </button>
        <button
          className={controlButtonClass}
          type="button"
          title="Forward 5 seconds"
          onClick={() => onSkip(5)}
        >
          +5s
        </button>
        <label
          className="grid size-12 shrink-0 place-items-center border-2 border-black bg-white shadow-[2px_2px_0_#000]"
          title="Playback speed"
        >
          <span className="sr-only">Playback speed</span>
          <select
            className="h-full w-full cursor-pointer appearance-none bg-transparent text-center font-['Press_Start_2P'] text-[9px] min-text-5px font-bold text-black outline-none disabled:cursor-not-allowed disabled:opacity-45"
            disabled={speedDisabled}
            value={playbackRate}
            onChange={(event) => onSpeedChange(Number(event.target.value))}
          >
            {speedOptions.map((speed) => (
              <option className="bg-white text-black font-mono font-bold" key={speed} value={speed}>
                {speed}x
              </option>
            ))}
          </select>
        </label>
      </div>
      {speedDisabled && (
        <p className="mt-2 text-xs min-text-5px font-mono text-[#FFEC27]">Speed isn't available for SoundCloud songs.</p>
      )}
    </section>
  );
}
