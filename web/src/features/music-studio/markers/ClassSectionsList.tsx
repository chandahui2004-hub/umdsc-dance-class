import React, { useState } from 'react';
import type { Marker } from '../dancecue/types/marker';
import { formatTime } from '../dancecue/components/AudioPlayer';

interface ClassSectionsListProps {
  activeMarker: Marker | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  markerDraftRange: { start: number; end: number } | null;
  markerPlaybackMarker: Marker | null;
  loopMarker: Marker | null;
  markers: Marker[];
  classMarkers: Marker[];
  myLoops: Marker[];
  canPublishSections?: boolean;
  onActivateMarkerDraft: (range?: { start: number; end: number }) => void;
  onAddMarker: (name: string, startTime: number, endTime: number) => void;
  onCancelMarkerDraft: () => void;
  onJumpToMarker: (marker: Marker) => void;
  onRemoveMarker: (markerId: string) => void;
  onStartLoop: (marker: Marker) => void;
  onStopLoop: () => void;
  onUpdateMarker: (marker: Marker) => void;
  onPublishClassSection?: (name: string, startSec: number, endSec: number) => Promise<void>;
}

const buttonClass =
  'min-h-11 w-full rounded-full border border-white/10 bg-white/[0.08] px-3 text-sm font-bold text-zinc-100 transition hover:border-cyan-200/35 hover:bg-cyan-200/10 active:translate-y-px';
const inputClass =
  'min-h-12 w-full min-w-0 rounded-lg border border-white/10 bg-white/[0.07] px-4 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] outline-none placeholder:text-zinc-500 focus:border-cyan-200/55 focus:bg-white/[0.1] focus:ring-4 focus:ring-cyan-300/10';
const panelClass =
  'rounded-3xl border border-white/15 bg-white/[0.08] p-3 shadow-[0_0_32px_rgba(235,178,255,0.12),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl sm:p-4';
const eyebrowClass = 'font-mono text-[0.68rem] font-bold uppercase tracking-[0.16em] text-cyan-100';

function formatMarkerTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds)) return '0.00s';
  if (totalSeconds < 60) return `${totalSeconds.toFixed(2)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
}

export const ClassSectionsList: React.FC<ClassSectionsListProps> = ({
  activeMarker,
  currentTime,
  duration,
  isPlaying: _isPlaying,
  markerDraftRange,
  markerPlaybackMarker: _markerPlaybackMarker,
  loopMarker,
  markers,
  classMarkers,
  canPublishSections = false,
  onActivateMarkerDraft,
  onAddMarker,
  onCancelMarkerDraft,
  onJumpToMarker,
  onRemoveMarker,
  onStartLoop,
  onStopLoop,
  onUpdateMarker: _onUpdateMarker,
  onPublishClassSection
}) => {
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [publishName, setPublishName] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const classMarkerIds = new Set(classMarkers.map(m => m.id));

  const handleSaveMarker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) {
      setErrorMessage('Name the marker first.');
      return;
    }
    const start = markerDraftRange ? markerDraftRange.start : 0;
    const end = markerDraftRange ? markerDraftRange.end : Math.min(start + 15, duration || 30);
    onAddMarker(nameInput.trim(), start, end);
    setNameInput('');
    setIsAddFormOpen(false);
    onCancelMarkerDraft();
  };

  const handlePublishSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publishName.trim() || !markerDraftRange || !onPublishClassSection) return;
    try {
      setIsPublishing(true);
      await onPublishClassSection(
        publishName.trim(),
        markerDraftRange.start,
        markerDraftRange.end
      );
      setShowPublishDialog(false);
      setPublishName('');
      onCancelMarkerDraft();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to publish class section');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <section className={panelClass} aria-label="Section markers">
      <div className="flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
        <div>
          <p className={eyebrowClass}>Sections & Loops</p>
          <h2 className="mt-1 text-lg font-black text-white sm:text-xl">Markers</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1.5 font-mono text-[0.68rem] font-bold text-cyan-50 sm:px-3 sm:text-xs">
            Now {formatTime(currentTime)}
          </span>
          <button
            className="min-h-8 rounded-full border border-cyan-200/35 bg-cyan-300/12 px-3 text-xs font-black text-cyan-50 transition hover:bg-cyan-300/18 active:translate-y-px"
            type="button"
            onClick={() => {
              if (isAddFormOpen) {
                setIsAddFormOpen(false);
                onCancelMarkerDraft();
              } else {
                setIsAddFormOpen(true);
                onActivateMarkerDraft();
              }
            }}
          >
            {isAddFormOpen ? 'Cancel' : 'Add Loop'}
          </button>
        </div>
      </div>

      {/* Admin Publish Class Section Banner */}
      {canPublishSections && markerDraftRange && onPublishClassSection && (
        <div className="mt-3 p-3 rounded-2xl bg-yellow-400/10 border border-yellow-400/40 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="font-mono text-xs font-bold text-yellow-200 uppercase block">
              Drafted Range: {formatMarkerTime(markerDraftRange.start)} -{' '}
              {formatMarkerTime(markerDraftRange.end)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowPublishDialog(true)}
            className="px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-yellow-400 text-zinc-950 hover:bg-yellow-300"
          >
            Publish Section
          </button>
        </div>
      )}

      {/* Publish Dialog */}
      {showPublishDialog && (
        <form onSubmit={handlePublishSection} className="mt-3 p-3 bg-black/40 border border-yellow-400/40 rounded-2xl space-y-2">
          <p className="font-sans text-xs font-black text-yellow-200 uppercase">
            Publish as Official Class Section
          </p>
          <input
            className={inputClass}
            placeholder="Section Name (e.g. Chorus 1)"
            value={publishName}
            onChange={e => setPublishName(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPublishing}
              className="flex-1 min-h-10 bg-yellow-400 text-zinc-950 rounded-xl font-black text-xs uppercase"
            >
              {isPublishing ? 'Publishing...' : 'Save & Publish'}
            </button>
            <button
              type="button"
              onClick={() => setShowPublishDialog(false)}
              className="px-3 min-h-10 bg-white/10 text-white rounded-xl font-bold text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Add Loop Form */}
      {isAddFormOpen && (
        <form onSubmit={handleSaveMarker} className="mt-4 grid gap-2">
          <input
            className={inputClass}
            placeholder="Loop name (e.g. Intro Routine)"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2">
            <button className={buttonClass} type="submit">
              Save Loop
            </button>
            <button
              className={buttonClass}
              type="button"
              onClick={() => {
                setIsAddFormOpen(false);
                onCancelMarkerDraft();
              }}
            >
              Cancel
            </button>
          </div>
          {errorMessage && (
            <p className="text-xs text-rose-300 font-bold px-1">{errorMessage}</p>
          )}
        </form>
      )}

      {/* Markers List */}
      <div className="mt-4 divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        {markers.map(marker => {
          const isClass = classMarkerIds.has(marker.id) || marker.id.startsWith('class-');
          const isLooping = loopMarker?.id === marker.id;
          const isActive = activeMarker?.id === marker.id;

          return (
            <div
              key={marker.id}
              className={`p-3 transition-colors flex items-center justify-between gap-2 ${
                isActive ? 'bg-fuchsia-950/30' : 'hover:bg-white/[0.04]'
              }`}
            >
              <div
                className="min-w-0 flex-1 cursor-pointer"
                onClick={() => onJumpToMarker(marker)}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-sans text-sm font-black text-white truncate">
                    {marker.name}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                      isClass
                        ? 'bg-yellow-400/20 text-yellow-300 border border-yellow-400/30'
                        : 'bg-cyan-400/20 text-cyan-300 border border-cyan-400/30'
                    }`}
                  >
                    {isClass ? 'Class Section' : 'My Loop'}
                  </span>
                </div>
                <p className="font-mono text-xs text-zinc-400 mt-0.5">
                  {formatMarkerTime(marker.time)} - {formatMarkerTime(marker.endTime)}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => (isLooping ? onStopLoop() : onStartLoop(marker))}
                  className={`px-2.5 py-1 rounded-full text-xs font-mono font-black uppercase transition ${
                    isLooping
                      ? 'bg-cyan-300 text-zinc-950 shadow-[0_0_10px_rgba(103,232,249,0.5)]'
                      : 'bg-white/10 text-cyan-200 hover:bg-cyan-200/20'
                  }`}
                >
                  {isLooping ? 'Looping' : 'Loop'}
                </button>

                {!isClass && (
                  <button
                    type="button"
                    onClick={() => onRemoveMarker(marker.id)}
                    className="size-7 grid place-items-center text-rose-300 hover:bg-rose-500/20 rounded-full font-bold text-xs"
                    title="Delete personal loop"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
