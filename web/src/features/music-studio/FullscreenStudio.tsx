import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { Master } from './sync/types';
import { useSyncedVideo } from './sync/useSyncedVideo';

export interface FullscreenStudioProps {
  master?: Master;
  activeMusicTitle: string | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isLooping: boolean;
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
  onPlay: () => void;
  onPause: () => void;
  onToggleLoop: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onSetInPoint: () => void;
  onSetOutPoint: () => void;
  onExitFullscreen: () => void;
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
  onPlay,
  onPause,
  onToggleLoop,
  onSeek,
  onSpeedChange,
  onSetInPoint,
  onSetOutPoint,
  onExitFullscreen,
  speechTranscript,
  speechListening,
}) => {
  // Draggable HUD coordinates
  const [hudPos, setHudPos] = useState({ x: 20, y: 20 });
  const isDraggingHudRef = useRef(false);
  const musicBarRef = useRef<HTMLDivElement>(null);

  // Exit on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onExitFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onExitFullscreen]);

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

  // Music progress calculation
  const musicProgress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
  const loopStart = duration > 0 && markerDraftRange ? (markerDraftRange.start / duration) * 100 : 0;
  const loopWidth =
    duration > 0 && markerDraftRange
      ? Math.max(0, ((markerDraftRange.end - markerDraftRange.start) / duration) * 100)
      : 0;

  // Video progress calculation
  const safeVideoDuration = videoDuration > 0 ? videoDuration : 1;
  const videoProgress = Math.min((videoCurrentTime / safeVideoDuration) * 100, 100);
  const videoStartPercent = Math.min((videoStart / safeVideoDuration) * 100, 100);

  const loopDurationText = markerDraftRange
    ? `${(markerDraftRange.end - markerDraftRange.start).toFixed(1)}s`
    : '0.0s';

  const handleMusicBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!musicBarRef.current || duration <= 0) return;
    const rect = musicBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
    onSeek(ratio * duration);
  };

  // Single video determination:
  // 1. Dance video url has top priority.
  // 2. YouTube has second priority if no dance video exists.
  // 3. Audio visualizer if neither exists.
  const hasDanceVideo = Boolean(danceVideoUrl);
  const hasYouTubeVideo = !hasDanceVideo && activeSource === 'youtube' && Boolean(youtubeVideoId);

  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const activeVideoRef = externalVideoRef || internalVideoRef;

  const dummyMaster = useMemo<Master>(() => ({
    getTime: () => currentTime,
    isPlaying,
    rate: playbackRate,
    source: activeSource || 'file',
    onLoopRestart: () => () => {},
    pauseForBuffer: () => {},
    resumeFromBuffer: () => {}
  }), [currentTime, isPlaying, playbackRate, activeSource]);

  useSyncedVideo({
    master: master || dummyMaster,
    videoRef: activeVideoRef,
    videoStart,
    enabled: Boolean(danceVideoUrl)
  });

  return (
    <div className="fixed inset-0 z-50 bg-[#101114] flex flex-col overflow-hidden select-none">
      {/* Top Video / Media Viewport (Takes majority of screen) */}
      <div className="flex-1 relative min-h-0 w-full flex items-center justify-center bg-black overflow-hidden">
        {hasDanceVideo ? (
          <video
            ref={activeVideoRef}
            data-testid="fullscreen-dance-video"
            src={danceVideoUrl!}
            className="w-full h-full object-contain"
            playsInline
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
              {isPlaying ? 'PLAYING AUDIO' : 'PAUSED'}
            </p>
          </div>
        )}

        {/* Floating Loop HUD Pill (Draggable) */}
        <div
          data-testid="fullscreen-hud"
          style={{ transform: `translate3d(${hudPos.x}px, ${hudPos.y}px, 0)` }}
          className="absolute top-0 left-0 z-50 flex items-center gap-2 bg-[#17181c]/95 border-4 border-black px-3 py-2 shadow-[6px_6px_0_#000] backdrop-blur-md"
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
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={isPlaying ? onPause : onPlay}
            className="px-3 py-1.5 bg-[#FFA300] hover:bg-[#FFA300]/90 active:translate-x-0.5 active:translate-y-0.5 text-black font-display text-[10px] border-2 border-black shadow-[2px_2px_0_#000]"
          >
            {isPlaying ? 'II' : 'PLAY'}
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
            {markerDraftRange && (
              <span className="text-[9px] text-[#C2C3C7]">
                [{formatTime(markerDraftRange.start)} - {formatTime(markerDraftRange.end)}]
              </span>
            )}
          </div>

          {/* Set In / Out Buttons */}
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="Set In"
              onClick={onSetInPoint}
              title="Set In Point (A)"
              className="px-2 py-1 bg-[#29ADFF] text-black font-display text-[9px] border-2 border-black hover:brightness-105 active:translate-x-0.5 active:translate-y-0.5"
            >
              [A] IN
            </button>
            <button
              type="button"
              aria-label="Set Out"
              onClick={onSetOutPoint}
              title="Set Out Point (B)"
              className="px-2 py-1 bg-[#29ADFF] text-black font-display text-[9px] border-2 border-black hover:brightness-105 active:translate-x-0.5 active:translate-y-0.5"
            >
              [B] OUT
            </button>
          </div>

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
      </div>

      {/* Bottom Area: Stacked Music & Video Progress Bars */}
      <div className="bg-[#17181c] border-t-4 border-black p-3 space-y-2">
        {/* Music Track Progress */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[10px] font-mono text-[#00E436]">
            <span>
              MUSIC: {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <span className="text-[#FFEC27]">
              {activeMusicTitle ? `♫ ${activeMusicTitle}` : ''}
            </span>
          </div>
          <div
            ref={musicBarRef}
            onClick={handleMusicBarClick}
            className="relative h-5 bg-[#1D2B53] border-2 border-black cursor-pointer overflow-hidden shadow-[2px_2px_0_#000]"
          >
            {/* Music Playhead */}
            <div
              className="absolute inset-y-0 left-0 bg-[#29ADFF]/40 border-r-2 border-[#29ADFF]"
              style={{ width: `${musicProgress}%` }}
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
              style={{ left: `${musicProgress}%` }}
            />
          </div>
        </div>

        {/* Video Track Progress (shown if video is loaded) */}
        {hasDanceVideo && (
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[10px] font-mono text-[#C2C3C7]">
              <span>
                VIDEO: {formatTime(videoCurrentTime)} / {formatTime(videoDuration)}
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
