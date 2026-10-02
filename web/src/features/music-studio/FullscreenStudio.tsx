import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { Master } from './sync/types';
import { useSyncedVideo } from './sync/useSyncedVideo';
import type { Marker } from './dancecue/types/marker';

export interface FullscreenStudioProps {
  master?: Master;
  activeMusicTitle: string | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isLooping: boolean;
  loopMarker?: Marker | null;
  markerDraftRange: { start: number; end: number } | null;
  playbackRate: number;
  speedDisabled?: boolean;
  activeSource: 'file' | 'youtube' | 'soundcloud' | 'drive' | null;
  youtubeVideoId: string | null;
  danceVideoUrl: string | null;
  videoCurrentTime: number;
  videoDuration: number;
  videoStart: number;
  danceVideoRef?: React.RefObject<HTMLVideoElement | null>;
  markers?: Marker[];
  classMarkers?: Marker[];
  myLoops?: Marker[];
  onPlay: () => void;
  onPause: () => void;
  onToggleLoop: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onSetInPoint: () => void;
  onSetOutPoint: () => void;
  onExitFullscreen: () => void;
  onStartLoopMarker?: (marker: Marker) => void;
  onStopLoopMarker?: () => void;
  onAddLoopMarker?: (name: string, start: number, end: number) => void;
  onUpdateLoopMarker?: (marker: Marker) => void;
  onDeleteLoopMarker?: (markerId: string) => void;
  onJumpToMarker?: (marker: Marker) => void;
  onMarkerDraftChange?: (range: { start: number; end: number } | null) => void;
  speechTranscript?: string;
  speechListening?: boolean;
}

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}

const speedOptions = [0.75, 0.8, 0.9, 1, 1.25];

export const FullscreenStudio: React.FC<FullscreenStudioProps> = ({
  master,
  activeMusicTitle,
  currentTime,
  duration,
  isPlaying,
  isLooping,
  loopMarker,
  markerDraftRange,
  playbackRate,
  speedDisabled = false,
  activeSource,
  youtubeVideoId,
  danceVideoUrl,
  videoCurrentTime,
  videoDuration,
  videoStart,
  danceVideoRef: externalVideoRef,
  markers = [],
  classMarkers = [],
  myLoops = [],
  onPlay,
  onPause,
  onToggleLoop,
  onSeek,
  onSpeedChange,
  onSetInPoint,
  onSetOutPoint,
  onExitFullscreen,
  onStartLoopMarker,
  onStopLoopMarker,
  onAddLoopMarker,
  onUpdateLoopMarker,
  onDeleteLoopMarker,
  onJumpToMarker,
  onMarkerDraftChange,
  speechTranscript,
  speechListening,
}) => {
  // Draggable HUD coordinates
  const [hudPos, setHudPos] = useState({ x: 20, y: 20 });
  const isDraggingHudRef = useRef(false);
  const musicBarRef = useRef<HTMLDivElement>(null);

  // Loops management panel state
  const [showLoopsPanel, setShowLoopsPanel] = useState(false);
  const [isEditingLoop, setIsEditingLoop] = useState(false);
  const [editingLoopId, setEditingLoopId] = useState<string | null>(null);
  const [loopFormName, setLoopFormName] = useState('');
  const [loopFormStart, setLoopFormStart] = useState<number>(0);
  const [loopFormEnd, setLoopFormEnd] = useState<number>(10);
  const [loopFormError, setLoopFormError] = useState('');

  // Video element and video-only state
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const activeVideoRef = externalVideoRef || internalVideoRef;
  const hasDanceVideo = Boolean(danceVideoUrl);
  const hasYouTubeVideo = !hasDanceVideo && activeSource === 'youtube' && Boolean(youtubeVideoId);
  const isVideoOnly = hasDanceVideo && !activeSource;

  const [videoPlaybackState, setVideoPlaybackState] = useState({
    currentTime: 0,
    duration: 0,
    isPlaying: false
  });

  // Track video element state when in video-only mode
  useEffect(() => {
    const video = activeVideoRef.current;
    if (!video || !hasDanceVideo) return;

    if (isVideoOnly) {
      video.muted = false;
    }

    const updateState = () => {
      setVideoPlaybackState({
        currentTime: video.currentTime || 0,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        isPlaying: !video.paused && !video.ended
      });
    };

    video.addEventListener('timeupdate', updateState);
    video.addEventListener('loadedmetadata', updateState);
    video.addEventListener('play', updateState);
    video.addEventListener('pause', updateState);
    video.addEventListener('ended', updateState);

    return () => {
      video.removeEventListener('timeupdate', updateState);
      video.removeEventListener('loadedmetadata', updateState);
      video.removeEventListener('play', updateState);
      video.removeEventListener('pause', updateState);
      video.removeEventListener('ended', updateState);
    };
  }, [hasDanceVideo, isVideoOnly, activeVideoRef]);

  // Video-only looping handler
  useEffect(() => {
    const video = activeVideoRef.current;
    if (!video || !isVideoOnly || !isLooping) return;

    const handleLoopCheck = () => {
      const targetLoop = loopMarker
        ? { start: loopMarker.time, end: loopMarker.endTime }
        : markerDraftRange && markerDraftRange.end > markerDraftRange.start
          ? markerDraftRange
          : null;

      if (targetLoop && targetLoop.end > targetLoop.start) {
        if (video.currentTime >= targetLoop.end || video.currentTime < targetLoop.start - 0.5) {
          video.currentTime = targetLoop.start;
          video.play().catch(() => {});
        }
      }
    };

    video.addEventListener('timeupdate', handleLoopCheck);
    return () => video.removeEventListener('timeupdate', handleLoopCheck);
  }, [isVideoOnly, isLooping, loopMarker, markerDraftRange, activeVideoRef]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'Escape') {
        if (showLoopsPanel) {
          setShowLoopsPanel(false);
          setIsEditingLoop(false);
        } else {
          onExitFullscreen();
        }
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (effectiveIsPlaying) {
          handlePause();
        } else {
          handlePlay();
        }
      } else if (e.key === 'a' || e.key === 'A') {
        onSetInPoint();
      } else if (e.key === 'b' || e.key === 'B') {
        onSetOutPoint();
      } else if (e.key === 'l' || e.key === 'L') {
        onToggleLoop();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showLoopsPanel, onExitFullscreen, onSetInPoint, onSetOutPoint, onToggleLoop]);

  // Effective progress values
  const effectiveIsPlaying = isVideoOnly ? videoPlaybackState.isPlaying : isPlaying;
  const effectiveCurrentTime = isVideoOnly ? videoPlaybackState.currentTime : currentTime;
  const effectiveDuration = isVideoOnly ? videoPlaybackState.duration : duration;

  const handlePlay = () => {
    if (isVideoOnly && activeVideoRef.current) {
      activeVideoRef.current.play().catch(() => {});
    } else {
      onPlay();
    }
  };

  const handlePause = () => {
    if (isVideoOnly && activeVideoRef.current) {
      activeVideoRef.current.pause();
    } else {
      onPause();
    }
  };

  const handleSeek = (time: number) => {
    if (isVideoOnly && activeVideoRef.current) {
      activeVideoRef.current.currentTime = time;
    } else {
      onSeek(time);
    }
  };

  // HUD Drag logic
  const handleHudDragStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    isDraggingHudRef.current = true;
    const initialClientX = e.clientX;
    const initialClientY = e.clientY;
    const initialX = hudPos.x;
    const initialY = hudPos.y;

    const onPointerMove = (moveEv: PointerEvent) => {
      if (!isDraggingHudRef.current) return;
      const deltaX = moveEv.clientX - initialClientX;
      const deltaY = moveEv.clientY - initialClientY;
      const maxX = Math.max(0, (typeof window !== 'undefined' ? window.innerWidth : 800) - 200);
      const maxY = Math.max(0, (typeof window !== 'undefined' ? window.innerHeight : 600) - 100);

      setHudPos({
        x: Math.max(10, Math.min(initialX + deltaX, maxX)),
        y: Math.max(10, Math.min(initialY + deltaY, maxY)),
      });
    };

    const onPointerUp = () => {
      isDraggingHudRef.current = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Progress calculations
  const progressPercent = effectiveDuration > 0 ? Math.min((effectiveCurrentTime / effectiveDuration) * 100, 100) : 0;
  const loopStart = effectiveDuration > 0 && markerDraftRange ? (markerDraftRange.start / effectiveDuration) * 100 : 0;
  const loopWidth =
    effectiveDuration > 0 && markerDraftRange
      ? Math.max(0, ((markerDraftRange.end - markerDraftRange.start) / effectiveDuration) * 100)
      : 0;

  // Video progress calculation for dual view
  const safeVideoDuration = videoDuration > 0 ? videoDuration : 1;
  const videoProgress = Math.min((videoCurrentTime / safeVideoDuration) * 100, 100);
  const videoStartPercent = Math.min((videoStart / safeVideoDuration) * 100, 100);

  const loopDurationText = markerDraftRange
    ? `${(markerDraftRange.end - markerDraftRange.start).toFixed(1)}s`
    : loopMarker
      ? `${(loopMarker.endTime - loopMarker.time).toFixed(1)}s`
      : '0.0s';

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!musicBarRef.current || effectiveDuration <= 0) return;
    const rect = musicBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
    handleSeek(ratio * effectiveDuration);
  };

  const dummyMaster = useMemo<Master>(() => ({
    getTime: () => currentTime,
    isPlaying,
    rate: playbackRate,
    source: activeSource || 'file',
    onLoopRestart: () => () => {},
    pauseForBuffer: () => {},
    resumeFromBuffer: () => {}
  }), [currentTime, isPlaying, playbackRate, activeSource]);

  // Sync only if both video and audio track are present
  useSyncedVideo({
    master: master || dummyMaster,
    videoRef: activeVideoRef,
    videoStart,
    enabled: Boolean(danceVideoUrl) && Boolean(activeSource)
  });

  const classMarkerIds = useMemo(() => new Set(classMarkers.map(m => m.id)), [classMarkers]);

  // Save / Update loop form submission
  const handleSaveLoopForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loopFormName.trim()) {
      setLoopFormError('Please enter a loop name.');
      return;
    }
    if (loopFormEnd <= loopFormStart) {
      setLoopFormError('End time must be greater than start time.');
      return;
    }

    if (editingLoopId) {
      const existing = markers.find(m => m.id === editingLoopId);
      if (existing && onUpdateLoopMarker) {
        onUpdateLoopMarker({
          ...existing,
          name: loopFormName.trim(),
          time: loopFormStart,
          endTime: loopFormEnd
        });
      }
    } else if (onAddLoopMarker) {
      onAddLoopMarker(loopFormName.trim(), loopFormStart, loopFormEnd);
    }

    setIsEditingLoop(false);
    setEditingLoopId(null);
    setLoopFormError('');
  };

  const handleOpenAddLoop = () => {
    setShowLoopsPanel(true);
    setIsEditingLoop(true);
    setEditingLoopId(null);
    const start = markerDraftRange ? markerDraftRange.start : Math.max(0, Math.round(effectiveCurrentTime * 10) / 10);
    const end = markerDraftRange
      ? markerDraftRange.end
      : Math.min(effectiveDuration || 30, Math.round((effectiveCurrentTime + 8) * 10) / 10);
    setLoopFormName(`Loop ${(myLoops?.length || 0) + 1}`);
    setLoopFormStart(start);
    setLoopFormEnd(end);
    setLoopFormError('');
  };

  const handleOpenEditLoop = (marker: Marker) => {
    setShowLoopsPanel(true);
    setIsEditingLoop(true);
    setEditingLoopId(marker.id);
    setLoopFormName(marker.name);
    setLoopFormStart(marker.time);
    setLoopFormEnd(marker.endTime);
    setLoopFormError('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#101114] flex flex-col overflow-hidden select-none">
      {/* Top Video / Media Viewport (Takes majority of screen) */}
      <div className="flex-1 relative min-h-0 w-full flex items-center justify-center bg-black overflow-hidden">
        {hasDanceVideo ? (
          <video
            ref={activeVideoRef}
            data-testid="fullscreen-dance-video"
            src={danceVideoUrl!}
            className="w-full h-full object-contain cursor-pointer"
            playsInline
            onClick={effectiveIsPlaying ? handlePause : handlePlay}
          />
        ) : hasYouTubeVideo ? (
          <div
            data-testid="fullscreen-youtube-player"
            className="w-full h-full flex items-center justify-center"
          >
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${youtubeVideoId}?autoplay=1&enablejsapi=1&controls=0&modestbranding=1`}
              title="YouTube practice video"
              className="w-full h-full border-0 pointer-events-none"
              allow="autoplay; encrypted-media"
            />
          </div>
        ) : (
          <div
            data-testid="fullscreen-audio-visualizer"
            className="flex flex-col items-center justify-center gap-3 text-center p-6"
          >
            <div className="w-16 h-16 bg-[#1D2B53] border-4 border-black flex items-center justify-center shadow-[4px_4px_0_#000]">
              <span className="font-display text-2xl text-[#FFEC27] animate-pulse">♫</span>
            </div>
            <h2 className="font-display text-lg text-white max-w-md">
              {activeMusicTitle || 'Audio Practice Mode'}
            </h2>
            <p className="font-mono text-xs text-[#00E436]">
              {effectiveIsPlaying ? 'PLAYING AUDIO' : 'PAUSED'}
            </p>
          </div>
        )}

        {/* Floating HUD Pill (Draggable) */}
        <div
          data-testid="fullscreen-hud"
          style={{ transform: `translate3d(${hudPos.x}px, ${hudPos.y}px, 0)` }}
          className="absolute top-0 left-0 z-50 flex items-center flex-wrap gap-2 bg-[#17181c]/95 border-4 border-black px-3 py-2 shadow-[6px_6px_0_#000] backdrop-blur-md max-w-[95vw]"
        >
          {/* Drag Handle */}
          <div
            onPointerDown={handleHudDragStart}
            data-testid="hud-drag-handle"
            title="Drag Loop HUD"
            className="cursor-move px-1 py-1 text-[#5F574F] hover:text-[#FFEC27] font-mono text-xs flex flex-col justify-center items-center select-none"
          >
            <span>::</span>
          </div>

          {/* Play/Pause Button */}
          <button
            type="button"
            aria-label={effectiveIsPlaying ? 'Pause' : 'Play'}
            onClick={effectiveIsPlaying ? handlePause : handlePlay}
            className="px-3 py-1.5 bg-[#FFA300] hover:bg-[#FFA300]/90 active:translate-x-0.5 active:translate-y-0.5 text-black font-display text-[10px] border-2 border-black shadow-[2px_2px_0_#000]"
          >
            {effectiveIsPlaying ? 'II' : 'PLAY'}
          </button>

          {/* Loop Button */}
          <button
            type="button"
            aria-label={isLooping ? 'Loop ON' : 'Loop OFF'}
            onClick={onToggleLoop}
            className={`px-3 py-1.5 font-display text-[10px] border-2 border-black shadow-[2px_2px_0_#000] transition-colors ${
              isLooping
                ? 'bg-[#FFEC27] text-black animate-pulse font-bold'
                : 'bg-[#1D2B53] text-[#C2C3C7] hover:text-white'
            }`}
          >
            {isLooping ? 'LOOP ON' : 'LOOP OFF'}
          </button>

          {/* Loop Range Info */}
          <div className="flex flex-col items-center px-1 font-mono">
            <span className="text-xs font-bold text-[#FFEC27]">{loopDurationText}</span>
            {markerDraftRange ? (
              <span className="text-[9px] text-[#C2C3C7]">
                [{formatTime(markerDraftRange.start)} - {formatTime(markerDraftRange.end)}]
              </span>
            ) : loopMarker ? (
              <span className="text-[9px] text-[#29ADFF]">
                [{formatTime(loopMarker.time)} - {formatTime(loopMarker.endTime)}]
              </span>
            ) : null}
          </div>

          {/* Set In / Out Buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Set In"
              onClick={onSetInPoint}
              title="Set In Point (A) at current playhead"
              className="px-2 py-1 bg-[#29ADFF] text-black font-display text-[9px] border-2 border-black hover:brightness-105 active:translate-x-0.5 active:translate-y-0.5"
            >
              [A] IN
            </button>
            <button
              type="button"
              aria-label="Set Out"
              onClick={onSetOutPoint}
              title="Set Out Point (B) at current playhead"
              className="px-2 py-1 bg-[#29ADFF] text-black font-display text-[9px] border-2 border-black hover:brightness-105 active:translate-x-0.5 active:translate-y-0.5"
            >
              [B] OUT
            </button>

            {markerDraftRange && (
              <button
                type="button"
                aria-label="Clear A-B Range"
                onClick={() => onMarkerDraftChange?.(null)}
                title="Clear A-B Draft Points"
                className="px-1.5 py-1 bg-[#1D2B53] text-[#FF004D] hover:bg-black font-mono text-[10px] font-bold border-2 border-black"
              >
                ✕
              </button>
            )}
          </div>

          {/* Loops Drawer Toggle */}
          <button
            type="button"
            aria-label="Toggle Loops"
            onClick={() => setShowLoopsPanel(prev => !prev)}
            className={`px-2.5 py-1.5 font-display text-[10px] border-2 border-black shadow-[2px_2px_0_#000] transition active:translate-x-0.5 active:translate-y-0.5 ${
              showLoopsPanel
                ? 'bg-[#29ADFF] text-black font-bold'
                : 'bg-[#1D2B53] text-[#C2C3C7] hover:text-white'
            }`}
          >
            🔁 LOOPS ({markers.length})
          </button>

          {/* Quick Save Loop Button */}
          <button
            type="button"
            aria-label="Save Loop"
            onClick={handleOpenAddLoop}
            title="Save current A-B as a reusable loop"
            className="px-2 py-1.5 bg-[#00E436] hover:bg-[#00E436]/90 active:translate-x-0.5 active:translate-y-0.5 text-black font-display text-[9px] border-2 border-black shadow-[2px_2px_0_#000]"
          >
            + SAVE
          </button>

          {/* Playback Speed */}
          <label className="flex items-center">
            <span className="sr-only">Speed</span>
            <select
              disabled={speedDisabled}
              value={playbackRate}
              onChange={e => onSpeedChange(Number(e.target.value))}
              className="bg-black text-[#00E436] border-2 border-black font-mono font-bold text-xs px-1 py-1 cursor-pointer outline-none"
            >
              {speedOptions.map(spd => (
                <option key={spd} value={spd}>
                  {spd}x
                </option>
              ))}
            </select>
          </label>

          {/* Voice Indicator */}
          {speechListening && (
            <span className="font-mono text-[9px] text-[#00E436] bg-black px-1.5 py-0.5 border border-[#00E436]">
              🎤 {speechTranscript || 'VOICE READY'}
            </span>
          )}

          {/* Exit Fullscreen Button */}
          <button
            type="button"
            aria-label="Exit"
            onClick={onExitFullscreen}
            className="px-2.5 py-1.5 bg-[#FF004D] text-white font-display text-[10px] border-2 border-black shadow-[2px_2px_0_#000] hover:bg-[#FF004D]/90 active:translate-x-0.5 active:translate-y-0.5"
          >
            ✕ EXIT
          </button>
        </div>

        {/* Fullscreen Retro Loops Panel Drawer / Modal */}
        {showLoopsPanel && (
          <div
            data-testid="fullscreen-loops-drawer"
            className="absolute top-16 right-4 z-50 w-96 max-w-[92vw] max-h-[80vh] flex flex-col bg-[#17181c]/95 border-4 border-black shadow-[8px_8px_0_#000] backdrop-blur-md text-white font-mono"
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between bg-[#1D2B53] px-3 py-2 border-b-4 border-black">
              <span className="font-display text-[10px] text-[#FFEC27]">
                ♫ REHEARSAL LOOPS ({markers.length})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenAddLoop}
                  className="px-2 py-0.5 bg-[#00E436] text-black font-display text-[8px] border border-black hover:brightness-105"
                >
                  + NEW
                </button>
                <button
                  type="button"
                  onClick={() => setShowLoopsPanel(false)}
                  className="text-zinc-400 hover:text-white font-bold text-xs px-1"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Loop Form (Add / Edit) */}
            {isEditingLoop && (
              <form onSubmit={handleSaveLoopForm} className="p-3 bg-[#101114] border-b-2 border-black space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-display text-[9px] text-[#29ADFF]">
                    {editingLoopId ? 'EDIT LOOP' : 'ADD NEW LOOP'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (markerDraftRange) {
                        setLoopFormStart(Math.round(markerDraftRange.start * 10) / 10);
                        setLoopFormEnd(Math.round(markerDraftRange.end * 10) / 10);
                      } else {
                        setLoopFormStart(Math.max(0, Math.round(effectiveCurrentTime * 10) / 10));
                        setLoopFormEnd(Math.min(effectiveDuration, Math.round((effectiveCurrentTime + 8) * 10) / 10));
                      }
                    }}
                    className="text-[9px] text-[#FFEC27] underline hover:text-white"
                  >
                    Use Current A-B
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="Loop Name (e.g. Chorus Combo)"
                  value={loopFormName}
                  onChange={e => setLoopFormName(e.target.value)}
                  className="w-full bg-black border-2 border-black text-white px-2 py-1 text-xs font-mono outline-none focus:border-[#29ADFF]"
                  autoFocus
                />

                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-zinc-400">Start (s):</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={loopFormStart}
                      onChange={e => setLoopFormStart(Number(e.target.value))}
                      className="bg-black border border-white/20 text-[#00E436] px-1.5 py-1 text-xs outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-zinc-400">End (s):</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={loopFormEnd}
                      onChange={e => setLoopFormEnd(Number(e.target.value))}
                      className="bg-black border border-white/20 text-[#00E436] px-1.5 py-1 text-xs outline-none"
                    />
                  </label>
                </div>

                {loopFormError && <p className="text-[10px] text-[#FF004D]">{loopFormError}</p>}

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    className="flex-1 py-1 bg-[#00E436] text-black font-display text-[9px] border-2 border-black hover:brightness-105"
                  >
                    {editingLoopId ? 'UPDATE' : 'SAVE'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingLoop(false);
                      setEditingLoopId(null);
                    }}
                    className="px-3 py-1 bg-white/10 text-white font-display text-[9px] border-2 border-black hover:bg-white/20"
                  >
                    CANCEL
                  </button>
                </div>
              </form>
            )}

            {/* Loop List (Selection to Loop) */}
            <div className="flex-1 overflow-y-auto divide-y divide-black/60 p-2 space-y-1.5 max-h-[50vh]">
              {markers.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-500">
                  <p>No loops saved yet.</p>
                  <p className="mt-1 text-[10px] text-zinc-400">
                    Use [A] IN and [B] OUT to mark routines, then click + SAVE.
                  </p>
                </div>
              ) : (
                markers.map(marker => {
                  const isClass = classMarkerIds.has(marker.id) || marker.id.startsWith('class-');
                  const isLoopingThis = loopMarker?.id === marker.id;
                  const durationSec = (marker.endTime - marker.time).toFixed(1);

                  return (
                    <div
                      key={marker.id}
                      className={`p-2 border-2 border-black transition ${
                        isLoopingThis
                          ? 'bg-[#1D2B53] shadow-[2px_2px_0_#FFEC27]'
                          : 'bg-black/40 hover:bg-black/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <span className="font-bold text-xs text-white truncate max-w-[180px]">
                          {marker.name}
                        </span>
                        <span
                          className={`px-1 py-0.2 text-[8px] font-bold uppercase border ${
                            isClass
                              ? 'bg-[#FFEC27]/20 text-[#FFEC27] border-[#FFEC27]/40'
                              : 'bg-[#29ADFF]/20 text-[#29ADFF] border-[#29ADFF]/40'
                          }`}
                        >
                          {isClass ? 'CLASS' : 'MY LOOP'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-1 text-[10px] text-zinc-400">
                        <span>
                          {formatTime(marker.time)} - {formatTime(marker.endTime)} ({durationSec}s)
                        </span>
                      </div>

                      {/* Controls: LOOP | JUMP | EDIT | DELETE */}
                      <div className="flex items-center justify-end gap-1.5 mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (isLoopingThis) {
                              onStopLoopMarker?.();
                            } else {
                              onStartLoopMarker?.(marker);
                            }
                          }}
                          className={`px-2 py-0.5 font-display text-[8px] border border-black shadow-[1px_1px_0_#000] ${
                            isLoopingThis
                              ? 'bg-[#FFEC27] text-black font-bold animate-pulse'
                              : 'bg-[#00E436] text-black hover:brightness-105'
                          }`}
                        >
                          {isLoopingThis ? 'LOOPING ♫' : '▶ LOOP'}
                        </button>

                        <button
                          type="button"
                          onClick={() => onJumpToMarker?.(marker)}
                          className="px-2 py-0.5 bg-[#29ADFF] text-black font-display text-[8px] border border-black hover:brightness-105"
                        >
                          JUMP
                        </button>

                        {!isClass && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenEditLoop(marker)}
                              className="px-1.5 py-0.5 bg-[#1D2B53] text-[#C2C3C7] hover:text-white font-mono text-[9px] border border-black"
                              title="Edit loop timing"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteLoopMarker?.(marker.id)}
                              className="px-1.5 py-0.5 bg-[#FF004D] text-white hover:brightness-110 font-mono text-[9px] border border-black"
                              title="Delete loop"
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Area: Stacked Music & Video Progress Bars */}
      <div className="bg-[#17181c] border-t-4 border-black p-3 space-y-2">
        {/* Primary Timeline Progress */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[10px] font-mono text-[#00E436]">
            <span>
              {isVideoOnly ? 'VIDEO TRACK' : 'MUSIC'}: {formatTime(effectiveCurrentTime)} / {formatTime(effectiveDuration)}
            </span>
            <span className="text-[#FFEC27]">
              {activeMusicTitle ? `♫ ${activeMusicTitle}` : isVideoOnly ? 'Rehearsal Video' : ''}
            </span>
          </div>
          <div
            ref={musicBarRef}
            onClick={handleTimelineClick}
            className="relative h-5 bg-[#1D2B53] border-2 border-black cursor-pointer overflow-hidden shadow-[2px_2px_0_#000]"
          >
            {/* Playhead */}
            <div
              className="absolute inset-y-0 left-0 bg-[#29ADFF]/40 border-r-2 border-[#29ADFF]"
              style={{ width: `${progressPercent}%` }}
            />
            {/* Loop Span Indicator */}
            {markerDraftRange && loopWidth > 0 && (
              <div
                className="absolute inset-y-0 bg-[#FFEC27]/40 border-x-2 border-[#FFEC27]"
                style={{ left: `${loopStart}%`, width: `${loopWidth}%` }}
              />
            )}
            <div
              className="absolute inset-y-0 w-2 -ml-1 bg-[#29ADFF] border border-black"
              style={{ left: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Video Track Progress (shown if both music & video are loaded in sync mode) */}
        {hasDanceVideo && !isVideoOnly && (
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[10px] font-mono text-[#C2C3C7]">
              <span>
                SYNCED VIDEO: {formatTime(videoCurrentTime)} / {formatTime(videoDuration)}
              </span>
              <span className="text-[#FFEC27]">⚑ START: {formatTime(videoStart)}</span>
            </div>
            <div className="relative h-4 bg-[#1f2937] border-2 border-black overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-[#00E436]/40 border-r-2 border-[#00E436]"
                style={{ width: `${videoProgress}%` }}
              />
              <div
                className="absolute inset-y-0 w-1 bg-[#FFEC27] z-10"
                style={{ left: `${videoStartPercent}%` }}
                title={`Video Start: ${formatTime(videoStart)}`}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
