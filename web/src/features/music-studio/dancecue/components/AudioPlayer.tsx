// Ported from DanceCue by JzeAnson (https://github.com/JzeAnson/DanceCue), used with permission.

import { useRef } from "react";

type DraftDragState =
  | { anchorTime: number; mode: "select" }
  | { fixedTime: number; mode: "resize" }
  | { length: number; mode: "move"; offset: number };

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
}: AudioPlayerProps) {
  const dragAnchorRef = useRef<number | null>(null);
  const draftDragStateRef = useRef<DraftDragState | null>(null);
  const didDragRef = useRef(false);
  const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
  const hasDraftRange =
    duration > 0 && markerDraftRange && markerDraftRange.end > markerDraftRange.start;
  const draftStart = hasDraftRange ? (markerDraftRange.start / duration) * 100 : 0;
  const draftWidth = hasDraftRange ? ((markerDraftRange.end - markerDraftRange.start) / duration) * 100 : 0;

  const getTimeFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = (event.clientX - bounds.left) / bounds.width;
    const boundedPosition = Math.min(Math.max(position, 0), 1);

    return boundedPosition * duration;
  };

  const updateDraftRange = (anchorTime: number, pointerTime: number) => {
    const start = Math.min(anchorTime, pointerTime);
    const end = Math.max(anchorTime, pointerTime);

    onMarkerDraftChange({ start, end });
  };

  const moveDraftRange = (pointerTime: number, length: number, offset: number) => {
    const start = Math.min(Math.max(pointerTime - offset, 0), Math.max(duration - length, 0));
    const end = Math.min(start + length, duration);

    onMarkerDraftChange({ start, end });
  };

  const getDraftDragState = (pointerTime: number): DraftDragState => {
    if (!markerDraftRange || markerDraftRange.end <= markerDraftRange.start) {
      return { anchorTime: pointerTime, mode: "select" };
    }

    const start = Math.max(Math.min(markerDraftRange.start, duration), 0);
    const end = Math.max(Math.min(markerDraftRange.end, duration), 0);
    const edgeGrabDistance = Math.min(Math.max(duration * 0.04, 3), 10);
    const isNearStart = Math.abs(pointerTime - start) <= edgeGrabDistance;
    const isNearEnd = Math.abs(pointerTime - end) <= edgeGrabDistance;

    if (isNearStart || pointerTime < start) {
      return { fixedTime: end, mode: "resize" };
    }

    if (isNearEnd || pointerTime > end) {
      return { fixedTime: start, mode: "resize" };
    }

    return {
      length: end - start,
      mode: "move",
      offset: pointerTime - start,
    };
  };

  return (
    <section className={panelClass} aria-label="Music player">
      <audio ref={audioRef} />

      <div
        className={`relative mt-2 h-9 touch-none overflow-hidden rounded-lg border bg-white/[0.08] ${
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
        onPointerDown={(event) => {
          if (!duration) {
            return;
          }

          const pointerTime = getTimeFromPointer(event);
          dragAnchorRef.current = pointerTime;
          draftDragStateRef.current = isMarkerDraftActive
            ? getDraftDragState(pointerTime)
            : null;
          didDragRef.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const anchorTime = dragAnchorRef.current;

          if (anchorTime === null || !duration) {
            return;
          }

          const pointerTime = getTimeFromPointer(event);

          if (isMarkerDraftActive && Math.abs(pointerTime - anchorTime) >= 0.05) {
            const draftDragState = draftDragStateRef.current;

            didDragRef.current = true;

            if (draftDragState?.mode === "resize") {
              updateDraftRange(draftDragState.fixedTime, pointerTime);
              return;
            }

            if (draftDragState?.mode === "move") {
              moveDraftRange(pointerTime, draftDragState.length, draftDragState.offset);
              return;
            }

            updateDraftRange(draftDragState?.anchorTime ?? anchorTime, pointerTime);
            return;
          }

          if (!isMarkerDraftActive) {
            didDragRef.current = true;
            onSeek(pointerTime);
          }
        }}
        onPointerUp={(event) => {
          const anchorTime = dragAnchorRef.current;

          if (anchorTime === null || !duration) {
            return;
          }

          const pointerTime = getTimeFromPointer(event);

          if (isMarkerDraftActive && didDragRef.current) {
            const draftDragState = draftDragStateRef.current;

            if (draftDragState?.mode === "resize") {
              updateDraftRange(draftDragState.fixedTime, pointerTime);
            } else if (draftDragState?.mode === "move") {
              moveDraftRange(pointerTime, draftDragState.length, draftDragState.offset);
            } else {
              updateDraftRange(draftDragState?.anchorTime ?? anchorTime, pointerTime);
            }
          } else {
            onSeek(pointerTime);
          }

          dragAnchorRef.current = null;
          draftDragStateRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          dragAnchorRef.current = null;
          draftDragStateRef.current = null;
          didDragRef.current = false;

          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
      >
        <div
          className="absolute inset-y-0 left-0 bg-[#29ADFF]/30 border-r-2 border-[#29ADFF]"
          style={{ width: `${progress}%` }}
        />
        {hasDraftRange ? (
          <div
            className="absolute inset-y-0 border-2 border-[#FFEC27] bg-[#FFEC27]/30 shadow-[0_0_8px_rgba(255,236,39,0.3)]"
            style={{ left: `${draftStart}%`, width: `${draftWidth}%` }}
            aria-hidden="true"
          >
            <span className="absolute inset-y-0 left-0 w-1 bg-[#FFEC27] border-r border-black" />
            <span className="absolute inset-y-0 right-0 w-1 bg-[#FFEC27] border-l border-black" />
          </div>
        ) : null}
        <div
          className="absolute inset-y-0 w-2 -ml-1 bg-[#29ADFF] border border-black z-10 shadow-[1px_1px_0_#000]"
          style={{ left: `${progress}%` }}
          aria-hidden="true"
        />
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
            className="h-full w-full cursor-pointer appearance-none bg-transparent text-center font-['Press_Start_2P'] text-[9px] min-text-5px font-bold text-black outline-none"
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

    </section>
  );
}
