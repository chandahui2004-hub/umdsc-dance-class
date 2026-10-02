// Ported from DanceCue by JzeAnson (https://github.com/JzeAnson/DanceCue), used with permission.

import { useEffect, useState } from "react";
import { formatTime } from "./AudioPlayer";
import type { Marker } from "../types/marker";

type MarkerListProps = {
  activeMarker: Marker | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  markerDraftRange: { start: number; end: number } | null;
  markerPlaybackMarker: Marker | null;
  loopMarker: Marker | null;
  markers: Marker[];
  onActivateMarkerDraft: (range?: { start: number; end: number }) => void;
  onAddMarker: (name: string, startTime: number, endTime: number) => void;
  onCancelMarkerDraft: () => void;
  onJumpToMarker: (marker: Marker) => void;
  onRemoveMarker: (markerId: string) => void;
  onStartLoop: (marker: Marker) => void;
  onStopLoop: () => void;
  onUpdateMarker: (marker: Marker) => void;
};

const buttonClass =
  "min-h-11 w-full border-2 border-[var(--outline)] bg-[var(--night-3)] px-3 text-xs font-mono font-bold text-[var(--text-1)] shadow-[2px_2px_0_var(--shadow-hard)] transition hover:bg-[var(--violet-2)] active:translate-x-[1px] active:translate-y-[1px]";
const inputClass =
  "min-h-12 w-full min-w-0 border-2 border-[var(--outline)] bg-[var(--night-1)] px-4 text-xs font-mono text-[var(--text-1)] shadow-[inset_2px_2px_0_var(--shadow-hard)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--neon-cyan)]";
const panelClass =
  "border-2 border-[var(--outline)] bg-[var(--night-2)] p-3 shadow-[4px_4px_0_var(--shadow-hard)] sm:p-4";
const eyebrowClass = "font-mono text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--neon-cyan)]";

function parseTimeInput(value: string) {
  const cleanedValue = value.trim().toLowerCase().replace(/s$/, "");

  if (!cleanedValue) {
    return null;
  }

  if (cleanedValue.includes(":") || cleanedValue.includes(".")) {
    const separator = cleanedValue.includes(":") ? ":" : ".";
    const parts = cleanedValue.split(separator);

    if (
      parts.length !== 2 ||
      parts.some((part) => part.trim() === "") ||
      !parts.every((part) => /^\d+$/.test(part.trim()))
    ) {
      return null;
    }

    const [minutes, seconds] = parts.map(Number);

    if (seconds >= 60) {
      return null;
    }

    return minutes * 60 + seconds;
  }

  const seconds = Number(cleanedValue);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function formatTimeInput(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds)) {
    return "0.00";
  }

  const safeSeconds = Math.max(totalSeconds, 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}.${seconds}`;
}

function formatMarkerTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds)) {
    return "0.00s";
  }

  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(2)}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

function formatStopwatchTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds)) {
    return "00:00.00";
  }

  const safeSeconds = Math.max(totalSeconds, 0);
  const minutes = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (safeSeconds % 60).toFixed(2).padStart(5, "0");

  return `${minutes}:${seconds}`;
}

function getMarkerColorClass(isActive: boolean, isLooping: boolean, index: number) {
  if (isLooping) {
    return "text-[var(--neon-pink)] drop-shadow-[0_0_8px_var(--neon-pink)]";
  }

  if (isActive) {
    return "text-[var(--neon-gold)] drop-shadow-[0_0_8px_var(--neon-gold)]";
  }

  if (index === 0) {
    return "text-[var(--neon-cyan)]";
  }

  return "text-[var(--text-1)]";
}

export function MarkerList({
  activeMarker,
  currentTime,
  duration,
  isPlaying,
  markerDraftRange,
  markerPlaybackMarker,
  loopMarker,
  markers,
  onActivateMarkerDraft,
  onAddMarker,
  onCancelMarkerDraft,
  onJumpToMarker,
  onRemoveMarker,
  onStartLoop,
  onStopLoop,
  onUpdateMarker,
}: MarkerListProps) {
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);
  const [editEndInput, setEditEndInput] = useState("");
  const [editErrorMessage, setEditErrorMessage] = useState("");
  const [editNameInput, setEditNameInput] = useState("");
  const [editStartInput, setEditStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [startInput, setStartInput] = useState("");

  const clampTime = (time: number) => {
    if (duration <= 0) {
      return Math.max(time, 0);
    }

    return Math.min(Math.max(time, 0), duration);
  };

  useEffect(() => {
    if (!markerDraftRange) {
      return;
    }

    if (editingMarkerId) {
      setEditStartInput(formatTimeInput(clampTime(markerDraftRange.start)));
      setEditEndInput(formatTimeInput(clampTime(markerDraftRange.end)));
      setEditErrorMessage("");
      return;
    }

    if (isAddFormOpen) {
      setStartInput(formatTimeInput(clampTime(markerDraftRange.start)));
      setEndInput(formatTimeInput(clampTime(markerDraftRange.end)));
      setErrorMessage("");
    }
  }, [duration, editingMarkerId, isAddFormOpen, markerDraftRange]);

  const startEditingMarker = (marker: Marker) => {
    setIsAddFormOpen(false);
    setEditingMarkerId(marker.id);
    setEditNameInput(marker.name);
    setEditStartInput(formatTimeInput(clampTime(marker.time)));
    setEditEndInput(formatTimeInput(clampTime(marker.endTime)));
    setEditErrorMessage("");
    onActivateMarkerDraft({ start: clampTime(marker.time), end: clampTime(marker.endTime) });
  };

  const closeAddForm = () => {
    setIsAddFormOpen(false);
    setNameInput("");
    setStartInput("");
    setEndInput("");
    setErrorMessage("");
    onCancelMarkerDraft();
  };

  return (
    <section className={panelClass} aria-label="Section markers">
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div>
          <p className={eyebrowClass}>Sections</p>
          <h2 className="mt-1 text-lg font-black font-header text-[var(--neon-gold)] sm:text-xl">Markers</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <span className="border-2 border-[var(--outline)] bg-[var(--night-1)] px-2.5 py-1 font-mono text-[0.68rem] font-bold text-[var(--neon-green)] sm:px-3 sm:text-xs shadow-[2px_2px_0_var(--shadow-hard)]">
            Now {formatTime(currentTime)}
          </span>
          <button
            className="min-h-8 border-2 border-[var(--outline)] bg-[var(--night-3)] px-3 text-xs font-mono font-bold text-[var(--neon-cyan)] transition hover:bg-[var(--violet-2)] active:translate-x-[1px] active:translate-y-[1px] shadow-[2px_2px_0_var(--shadow-hard)] sm:min-h-9 sm:px-4 sm:text-sm"
            type="button"
            aria-expanded={isAddFormOpen}
            onClick={() => {
              if (isAddFormOpen) {
                closeAddForm();
                return;
              }

              setIsAddFormOpen(true);
              onActivateMarkerDraft();
            }}
          >
            Add
          </button>
        </div>
      </div>

      {isAddFormOpen ? (
        <form
          className="mt-4 grid gap-2"
          onFocus={() => onActivateMarkerDraft()}
          onSubmit={(event) => {
            event.preventDefault();
            const name = nameInput.trim();
            const startTime = parseTimeInput(startInput);
            const endTime = parseTimeInput(endInput);

            if (!name) {
              setErrorMessage("Name the marker first.");
              return;
            }

            if (startTime === null || endTime === null) {
              setErrorMessage("Use minutes.seconds like 3.05 for 3 minutes 5 seconds.");
              return;
            }

            const safeStartTime = clampTime(startTime);
            const safeEndTime = clampTime(endTime);

            if (safeEndTime <= safeStartTime) {
              setErrorMessage("End time must be after start time.");
              return;
            }

            onAddMarker(name, safeStartTime, safeEndTime);
            closeAddForm();
          }}
        >
          <input
            className={inputClass}
            aria-label="Marker name"
            name="markerName"
            placeholder="Add marker name"
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              <span className="px-1 text-[0.65rem] font-bold uppercase tracking-normal text-[var(--text-muted)] font-mono">
                Start
              </span>
              <input
                className={inputClass}
                aria-label="Marker start time"
                inputMode="decimal"
                name="markerStart"
                placeholder="0.50"
                value={startInput}
                onChange={(event) => {
                  setStartInput(event.target.value);
                  setErrorMessage("");
                }}
              />
            </label>
            <label className="grid gap-1">
              <span className="px-1 text-[0.65rem] font-bold uppercase tracking-normal text-[var(--text-muted)] font-mono">
                End
              </span>
              <input
                className={inputClass}
                aria-label="Marker end time"
                inputMode="decimal"
                name="markerEnd"
                placeholder="1.05"
                value={endInput}
                onChange={(event) => {
                  setEndInput(event.target.value);
                  setErrorMessage("");
                }}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className={buttonClass} type="submit">
              Save marker
            </button>
            <button className={buttonClass} type="button" onClick={closeAddForm}>
              Cancel
            </button>
          </div>
          {errorMessage ? (
            <p className="px-1 text-xs font-bold text-[var(--neon-pink)]" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </form>
      ) : null}

      <div className="mt-5 divide-y-2 divide-[var(--outline)] overflow-hidden border-2 border-[var(--outline)] bg-[var(--night-1)] shadow-[2px_2px_0_var(--shadow-hard)]">
        {markers.map((marker, index) => {
          const isActive = activeMarker?.id === marker.id;
          const isEditing = editingMarkerId === marker.id;
          const isLooping = loopMarker?.id === marker.id;
          const isMarkerPlayback = isPlaying && markerPlaybackMarker?.id === marker.id;
          const showPlayingPill = isMarkerPlayback || isLooping;
          const markerColorClass = getMarkerColorClass(isActive, isLooping, index);
          const markerDuration = marker.endTime - marker.time;

          return (
            <article
              className={`group relative grid cursor-pointer gap-3 py-4 transition sm:py-5 ${
                isEditing ? "px-4 sm:px-6" : "px-3 pr-12 sm:px-4 sm:pr-14"
              } ${
                isActive
                  ? "bg-[var(--violet-2)] shadow-[inset_4px_0_0_var(--neon-gold)]"
                  : "bg-[var(--night-2)] hover:bg-[var(--night-3)]"
              }`}
              key={marker.id}
              onClick={() => {
                if (!isEditing) {
                  onJumpToMarker(marker);
                }
              }}
              onKeyDown={(event) => {
                if (isEditing) {
                  return;
                }

                if (event.target !== event.currentTarget) {
                  return;
                }

                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onJumpToMarker(marker);
                }
              }}
              role={isEditing ? undefined : "button"}
              tabIndex={isEditing ? undefined : 0}
            >
              {isEditing ? (
                <form
                  className="col-span-full mx-auto grid w-full max-w-[360px] gap-2"
                  onClick={(event) => event.stopPropagation()}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const name = editNameInput.trim();
                    const startTime = parseTimeInput(editStartInput);
                    const endTime = parseTimeInput(editEndInput);

                    if (!name) {
                      setEditErrorMessage("Name the marker first.");
                      return;
                    }

                    if (startTime === null || endTime === null) {
                      setEditErrorMessage("Use minutes.seconds like 3.05 for 3 minutes 5 seconds.");
                      return;
                    }

                    const safeStartTime = clampTime(startTime);
                    const safeEndTime = clampTime(endTime);

                    if (safeEndTime <= safeStartTime) {
                      setEditErrorMessage("End time must be after start time.");
                      return;
                    }

                    onUpdateMarker({
                      ...marker,
                      endTime: safeEndTime,
                      name,
                      time: safeStartTime,
                    });
                    setEditingMarkerId(null);
                    setEditErrorMessage("");
                    onCancelMarkerDraft();
                  }}
                >
                  <input
                    className={inputClass}
                    aria-label={`Edit ${marker.name} name`}
                    value={editNameInput}
                    onChange={(event) => {
                      setEditNameInput(event.target.value);
                      setEditErrorMessage("");
                    }}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="grid gap-1">
                      <span className="px-1 text-[0.65rem] font-bold uppercase tracking-normal text-[var(--text-muted)] font-mono">
                        Start
                      </span>
                      <input
                        className={inputClass}
                        aria-label={`Edit ${marker.name} start time`}
                        inputMode="decimal"
                        value={editStartInput}
                        onChange={(event) => {
                          setEditStartInput(event.target.value);
                          setEditErrorMessage("");
                        }}
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="px-1 text-[0.65rem] font-bold uppercase tracking-normal text-[var(--text-muted)] font-mono">
                        End
                      </span>
                      <input
                        className={inputClass}
                        aria-label={`Edit ${marker.name} end time`}
                        inputMode="decimal"
                        value={editEndInput}
                        onChange={(event) => {
                          setEditEndInput(event.target.value);
                          setEditErrorMessage("");
                        }}
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button className={buttonClass} type="submit">
                      Save
                    </button>
                    <button
                      className={buttonClass}
                      type="button"
                      onClick={() => {
                        setEditingMarkerId(null);
                        setEditErrorMessage("");
                        onCancelMarkerDraft();
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  {editErrorMessage ? (
                    <p className="px-1 text-xs font-bold text-[var(--neon-pink)]" role="alert">
                      {editErrorMessage}
                    </p>
                  ) : null}
                </form>
              ) : (
                <>
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="min-w-0 px-1 text-left transition focus:outline-none">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span
                          className={`min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs font-black leading-none tracking-normal sm:text-base ${markerColorClass}`}
                        >
                          {marker.name}
                        </span>-
                        <span
                          className={`shrink-0 font-mono text-[0.62rem] font-bold tabular-nums tracking-normal sm:text-xs ${markerColorClass}`}
                        >
                          {formatStopwatchTime(markerDuration)}
                        </span>
                      </div>
                      <small className="mt-1.5 block font-mono text-[0.56rem] font-bold uppercase tabular-nums tracking-normal text-[var(--text-2)]">
                        {formatMarkerTime(marker.time)} - {formatMarkerTime(marker.endTime)}
                      </small>
                    </div>
                    <div className="grid justify-items-end gap-1 pt-0.5">
                      {showPlayingPill ? (
                        <small className="border-2 border-[var(--neon-pink)] bg-[var(--night-1)] px-1.5 py-0.5 font-mono text-[0.5rem] font-bold uppercase tracking-[0.12em] text-[var(--neon-pink)] shadow-[0_0_8px_var(--neon-pink)] sm:px-2 sm:text-[0.52rem]">
                          Playing
                        </small>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pl-1">
                    <button
                      className={`min-h-7 border-2 px-2 font-mono text-[0.5rem] font-bold uppercase tracking-[0.08em] transition sm:min-h-8 sm:px-2.5 sm:text-[0.58rem] sm:tracking-[0.1em] ${
                        isLooping
                          ? "border-[var(--neon-pink)] bg-[var(--neon-pink)] text-black shadow-[2px_2px_0_var(--shadow-hard)]"
                          : "border-[var(--outline)] bg-[var(--night-3)] text-[var(--text-1)] hover:bg-[var(--violet-2)] shadow-[2px_2px_0_var(--shadow-hard)]"
                      }`}
                      type="button"
                      aria-pressed={isLooping}
                      onClick={(event) => {
                        event.stopPropagation();
                        isLooping ? onStopLoop() : onStartLoop(marker);
                      }}
                    >
                      Loop
                    </button>
                    <button
                      aria-label={`Edit ${marker.name}`}
                      className="min-h-7 border-2 border-[var(--outline)] bg-[var(--night-3)] px-2 font-mono text-[0.5rem] font-bold uppercase tracking-[0.08em] text-[var(--text-1)] transition hover:bg-[var(--violet-2)] shadow-[2px_2px_0_var(--shadow-hard)] sm:min-h-8 sm:px-2.5 sm:text-[0.58rem] sm:tracking-[0.1em]"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        startEditingMarker(marker);
                      }}
                    >
                      Edit
                    </button>
                  </div>
                  <button
                    aria-label={`Remove ${marker.name}`}
                    className="absolute right-3 top-3 grid size-8 shrink-0 place-items-center text-sm font-bold leading-none text-[var(--neon-pink)] hover:text-white transition sm:right-4 sm:top-4 sm:size-9 sm:text-base"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveMarker(marker.id);
                    }}
                  >
                    X
                  </button>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
