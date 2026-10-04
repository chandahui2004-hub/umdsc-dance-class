import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { Master } from './sync/types';
import { useSyncedVideo } from './sync/useSyncedVideo';
import type { Marker } from './dancecue/types/marker';
import { previewUrl } from '../../lib/google/driveUrls';
import { useOverlayOpen } from '../../app/useOverlayOpen';

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
  selectedVideoId?: string;
  driveFileId?: string | null;
  useDrivePreview?: boolean;
  onToggleDrivePreview?: (usePreview: boolean) => void;
  onPlay: () => void;
  onPause: () => void;
  onToggleLoop: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onSetInPoint: () => void;
  onSetOutPoint: () => void;
  onExitFullscreen: () => void;
  onSetVideoStart?: (time: number) => void;
  onSaveLoopWithVideo?: (markerId: string, videoId: string, videoStart: number) => void;
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

function formatTimeWithTenths(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00.0';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  const tenths = Math.floor((totalSeconds % 1) * 10);
  return `${minutes}:${seconds}.${tenths}`;
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
  selectedVideoId,
  driveFileId,
  useDrivePreview: propUseDrivePreview,
  onToggleDrivePreview,
  onPlay,
  onPause,
  onToggleLoop,
  onSeek,
  onSpeedChange,
  onSetInPoint,
  onSetOutPoint,
  onExitFullscreen,
  onSetVideoStart,
  onSaveLoopWithVideo,
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
  useOverlayOpen(true);

  // Draggable HUD coordinates
  const [hudPos, setHudPos] = useState({ x: 20, y: 20 });
  const isDraggingHudRef = useRef(false);
  const musicBarRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ text: string; leftPercent: number } | null>(null);
  const [isPulsing, setIsPulsing] = useState(false);
  const dragAnchorRef = useRef<number | null>(null);
  const didDragRef = useRef(false);

  // Loops management panel state
  const [showLoopsPanel, setShowLoopsPanel] = useState(false);
  const [isEditingLoop, setIsEditingLoop] = useState(false);
  const [editingLoopId, setEditingLoopId] = useState<string | null>(null);
  const [loopFormName, setLoopFormName] = useState('');
  const [loopFormStart, setLoopFormStart] = useState<number>(0);
  const [loopFormEnd, setLoopFormEnd] = useState<number>(10);
  const [loopFormError, setLoopFormError] = useState('');

  // Drive preview player state
  const [internalUseDrivePreview, setInternalUseDrivePreview] = useState<boolean>(false);
  const isControlledPreview = propUseDrivePreview !== undefined;
  const isLocalVideo = selectedVideoId === 'local';
  const useDrivePreview = isControlledPreview
    ? (isLocalVideo ? false : Boolean(propUseDrivePreview))
    : (isLocalVideo ? false : internalUseDrivePreview);

  const setUseDrivePreview = (val: boolean) => {
    if (onToggleDrivePreview) {
      onToggleDrivePreview(val);
    }
    if (!isControlledPreview) {
      setInternalUseDrivePreview(val);
    }
  };

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
  const [actualVideoDuration, setActualVideoDuration] = useState<number>(videoDuration || 0);
  const [actualVideoTime, setActualVideoTime] = useState<number>(videoCurrentTime || 0);
  const [saveLoopSuccess, setSaveLoopSuccess] = useState<boolean>(false);

  // Track video element state
  useEffect(() => {
    const video = activeVideoRef.current;
    if (!video || !hasDanceVideo) return;

    if (isVideoOnly) {
      video.muted = false;
    }

    const updateState = () => {
      const cur = video.currentTime || 0;
      const dur = Number.isFinite(video.duration) ? video.duration : 0;
      setActualVideoTime(cur);
      if (dur > 0) {
        setActualVideoDuration(dur);
      }
      setVideoPlaybackState({
        currentTime: cur,
        duration: dur,
        isPlaying: !video.paused && !video.ended
      });
    };

    video.addEventListener('timeupdate', updateState);
    video.addEventListener('loadedmetadata', updateState);
    video.addEventListener('play', updateState);
    video.addEventListener('pause', updateState);
    video.addEventListener('ended', updateState);

    updateState();

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

  // Loop Range calculations
  const currentRange = useMemo(() => {
    if (markerDraftRange && markerDraftRange.end > markerDraftRange.start) {
      return markerDraftRange;
    }
    if (loopMarker && loopMarker.endTime > loopMarker.time) {
      return { start: loopMarker.time, end: loopMarker.endTime };
    }
    return null;
  }, [markerDraftRange, loopMarker]);

  const hasDraftRange =
    effectiveDuration > 0 && currentRange && currentRange.end > currentRange.start;
  const draftStart = hasDraftRange && currentRange ? (currentRange.start / effectiveDuration) * 100 : 0;
  const draftWidth =
    hasDraftRange && currentRange
      ? Math.max(0, ((currentRange.end - currentRange.start) / effectiveDuration) * 100)
      : 0;

  // Progress calculations
  const progressPercent = effectiveDuration > 0 ? Math.min((effectiveCurrentTime / effectiveDuration) * 100, 100) : 0;

  // Video progress calculation for dual view
  const effectiveVideoDuration = actualVideoDuration > 0 ? actualVideoDuration : videoDuration > 0 ? videoDuration : 1;
  const effectiveVideoCurrentTime = actualVideoTime > 0 ? actualVideoTime : videoCurrentTime;
  const safeVideoDuration = effectiveVideoDuration > 0 ? effectiveVideoDuration : 1;
  const videoProgress = Math.min((effectiveVideoCurrentTime / safeVideoDuration) * 100, 100);
  const videoStartPercent = Math.min((videoStart / safeVideoDuration) * 100, 100);

  const videoBarRef = useRef<HTMLDivElement>(null);
  const isDraggingVideoFlagRef = useRef(false);

  const getVideoTimeFromClientX = (clientX: number | undefined): number => {
    if (!videoBarRef.current || !safeVideoDuration || typeof clientX !== 'number' || Number.isNaN(clientX)) {
      return 0;
    }
    const bounds = videoBarRef.current.getBoundingClientRect();
    const width = bounds.width || 1;
    const position = (clientX - (bounds.left || 0)) / width;
    const bounded = Math.min(Math.max(position, 0), 1);
    return Math.round(bounded * safeVideoDuration * 10) / 10;
  };

  const handleSetStartToCurrentVideo = () => {
    if (!onSetVideoStart) return;
    const cur = activeVideoRef.current
      ? Math.round((activeVideoRef.current.currentTime || 0) * 10) / 10
      : Math.round(effectiveVideoCurrentTime * 10) / 10;
    onSetVideoStart(Math.max(0, cur));
  };

  const handleNudgeVideoStart = (delta: number) => {
    if (!onSetVideoStart) return;
    const next = Math.max(0, Math.min(safeVideoDuration, Math.round((videoStart + delta) * 10) / 10));
    onSetVideoStart(next);
  };

  const handleSaveLoopAlignment = () => {
    if (!loopMarker || !selectedVideoId || !onSaveLoopWithVideo) return;
    onSaveLoopWithVideo(loopMarker.id, selectedVideoId, videoStart);
    setSaveLoopSuccess(true);
    setTimeout(() => setSaveLoopSuccess(false), 2500);
  };

  const handleVideoBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDraggingVideoFlagRef.current) {
      isDraggingVideoFlagRef.current = false;
      return;
    }
    const targetTime = getVideoTimeFromClientX(e.clientX);
    if (activeVideoRef.current) {
      activeVideoRef.current.currentTime = targetTime;
      setActualVideoTime(targetTime);
    }
  };

  const handleVideoStartFlagPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!onSetVideoStart) return;
    isDraggingVideoFlagRef.current = true;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const time = getVideoTimeFromClientX(moveEvent.clientX);
      onSetVideoStart(time);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      setTimeout(() => {
        isDraggingVideoFlagRef.current = false;
      }, 50);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const loopDurationText = currentRange
    ? `${(currentRange.end - currentRange.start).toFixed(1)}s`
    : '0.0s';

  const getTimeFromClientX = (clientX: number | undefined): number => {
    if (!musicBarRef.current || !effectiveDuration || typeof clientX !== 'number' || Number.isNaN(clientX)) {
      return 0;
    }
    const bounds = musicBarRef.current.getBoundingClientRect();
    const width = bounds.width || 1;
    const position = (clientX - (bounds.left || 0)) / width;
    const bounded = Math.min(Math.max(position, 0), 1);
    return bounded * effectiveDuration;
  };

  // Drag Left Handle (Resize Start)
  const handleStartHandlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!currentRange || !effectiveDuration) return;
    const endFixed = currentRange.end;

    const onPointerMove = (moveEv: PointerEvent) => {
      const time = getTimeFromClientX(moveEv.clientX);
      const newStart = Math.round(Math.max(0, Math.min(time, endFixed - 0.2)) * 10) / 10;
      onMarkerDraftChange?.({ start: newStart, end: endFixed });
      setTooltip({
        text: `Start: ${formatTime(newStart)} (${(endFixed - newStart).toFixed(1)}s)`,
        leftPercent: (newStart / effectiveDuration) * 100
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

  // Drag Right Handle (Resize End)
  const handleEndHandlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!currentRange || !effectiveDuration) return;
    const startFixed = currentRange.start;

    const onPointerMove = (moveEv: PointerEvent) => {
      const time = getTimeFromClientX(moveEv.clientX);
      const newEnd = Math.round(Math.min(effectiveDuration, Math.max(time, startFixed + 0.2)) * 10) / 10;
      onMarkerDraftChange?.({ start: startFixed, end: newEnd });
      setTooltip({
        text: `End: ${formatTime(newEnd)} (${(newEnd - startFixed).toFixed(1)}s)`,
        leftPercent: (newEnd / effectiveDuration) * 100
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
    if (!currentRange || !effectiveDuration) return;
    const initialPointerTime = getTimeFromClientX(e.clientX);
    const initialStart = currentRange.start;
    const initialEnd = currentRange.end;
    const rangeLength = initialEnd - initialStart;

    const onPointerMove = (moveEv: PointerEvent) => {
      const currentPointerTime = getTimeFromClientX(moveEv.clientX);
      const delta = currentPointerTime - initialPointerTime;
      const rawStart = Math.min(Math.max(initialStart + delta, 0), Math.max(effectiveDuration - rangeLength, 0));
      const rawEnd = Math.min(rawStart + rangeLength, effectiveDuration);
      const newStart = Math.round(rawStart * 10) / 10;
      const newEnd = Math.round(rawEnd * 10) / 10;

      onMarkerDraftChange?.({ start: newStart, end: newEnd });
      setTooltip({
        text: `Loop: ${formatTime(newStart)} - ${formatTime(newEnd)} (${rangeLength.toFixed(1)}s)`,
        leftPercent: ((newStart + newEnd) / 2 / effectiveDuration) * 100
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

  // Track Pointer Events (Seek, Double-Click, Drag-select)
  const handleTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!effectiveDuration) return;
    const pointerTime = getTimeFromClientX(event.clientX);

    // Double-click seek
    if (event.detail === 2) {
      handleSeek(pointerTime);
      return;
    }

    // Single-click nearest loop point adjustment when loop is active
    if (currentRange && currentRange.end > currentRange.start) {
      const distStart = Math.abs(pointerTime - currentRange.start);
      const distEnd = Math.abs(pointerTime - currentRange.end);
      const threshold = Math.max(2, effectiveDuration * 0.04);

      if (distStart < threshold || distEnd < threshold) {
        if (distStart <= distEnd) {
          const newStart = Math.round(Math.min(pointerTime, currentRange.end - 0.2) * 10) / 10;
          onMarkerDraftChange?.({ start: newStart, end: currentRange.end });
        } else {
          const newEnd = Math.round(Math.max(pointerTime, currentRange.start + 0.2) * 10) / 10;
          onMarkerDraftChange?.({ start: currentRange.start, end: newEnd });
        }
        setIsPulsing(true);
        setTimeout(() => setIsPulsing(false), 500);
        return;
      }
    }

    dragAnchorRef.current = pointerTime;
    didDragRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleTrackPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const anchorTime = dragAnchorRef.current;
    if (anchorTime === null || !effectiveDuration) return;
    const pointerTime = getTimeFromClientX(event.clientX);
    if (Math.abs(pointerTime - anchorTime) >= 0.1) {
      didDragRef.current = true;
      const start = Math.round(Math.min(anchorTime, pointerTime) * 10) / 10;
      const end = Math.round(Math.max(anchorTime, pointerTime) * 10) / 10;
      onMarkerDraftChange?.({ start, end });
      setTooltip({
        text: `Loop: ${formatTime(start)} - ${formatTime(end)} (${(end - start).toFixed(1)}s)`,
        leftPercent: ((start + end) / 2 / effectiveDuration) * 100
      });
    }
  };

  const handleTrackPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const anchorTime = dragAnchorRef.current;
    dragAnchorRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setTooltip(null);
    if (!didDragRef.current && anchorTime !== null) {
      handleSeek(anchorTime);
    }
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
  const roundLoopTime = (t: number): number => Math.round(t * 10) / 10;

  // Save / Update loop form submission
  const handleSaveLoopForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loopFormName.trim()) {
      setLoopFormError('Please enter a loop name.');
      return;
    }
    const finalStart = roundLoopTime(loopFormStart);
    const finalEnd = roundLoopTime(loopFormEnd);
    if (finalEnd <= finalStart) {
      setLoopFormError('End time must be greater than start time.');
      return;
    }

    if (editingLoopId) {
      const existing = markers.find(m => m.id === editingLoopId);
      if (existing && onUpdateLoopMarker) {
        onUpdateLoopMarker({
          ...existing,
          name: loopFormName.trim(),
          time: finalStart,
          endTime: finalEnd
        });
      }
    } else if (onAddLoopMarker) {
      onAddLoopMarker(loopFormName.trim(), finalStart, finalEnd);
    }

    setIsEditingLoop(false);
    setEditingLoopId(null);
    setLoopFormError('');
  };

  const handleOpenAddLoop = () => {
    setShowLoopsPanel(true);
    setIsEditingLoop(true);
    setEditingLoopId(null);
    const rawStart = markerDraftRange ? markerDraftRange.start : effectiveCurrentTime;
    const rawEnd = markerDraftRange
      ? markerDraftRange.end
      : effectiveCurrentTime + 8;
    const start = Math.max(0, roundLoopTime(rawStart));
    const end = Math.min(
      effectiveDuration || 30,
      Math.max(start + 0.1, roundLoopTime(rawEnd))
    );
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
    setLoopFormStart(roundLoopTime(marker.time));
    setLoopFormEnd(roundLoopTime(marker.endTime));
    setLoopFormError('');
  };

  return (
    <div className={`fixed inset-0 z-50 flex flex-col overflow-hidden select-none ${hasYouTubeVideo ? 'bg-transparent pointer-events-none' : 'bg-[var(--night-1)]'}`}>
      {/* Top Video / Media Viewport (Takes majority of screen) */}
      <div className={`flex-1 relative min-h-0 w-full flex items-center justify-center overflow-hidden ${hasYouTubeVideo ? 'bg-transparent pointer-events-none' : 'bg-black'}`}>
        {hasDanceVideo && useDrivePreview && driveFileId ? (
          <div className="w-full h-full relative bg-black flex items-center justify-center">
            <iframe
              src={previewUrl(driveFileId)}
              title={activeMusicTitle || 'Class Routine Video'}
              className="w-full h-full border-0"
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen
            />
          </div>
        ) : hasDanceVideo ? (
          <video
            ref={activeVideoRef}
            data-testid="fullscreen-dance-video"
            src={danceVideoUrl!}
            className="w-full h-full object-contain cursor-pointer"
            playsInline
            onClick={effectiveIsPlaying ? handlePause : handlePlay}
            onLoadedData={e => {
              const el = e.currentTarget;
              if (el.videoWidth === 0 && el.videoHeight === 0 && driveFileId) {
                setUseDrivePreview(true);
              }
            }}
            onError={() => {
              if (driveFileId) {
                setUseDrivePreview(true);
              }
            }}
          />
        ) : hasYouTubeVideo ? (
          <div
            data-testid="fullscreen-youtube-player"
            className="w-full h-full flex items-center justify-center bg-transparent pointer-events-none"
          />
        ) : (
          <div
            data-testid="fullscreen-audio-visualizer"
            className="flex flex-col items-center justify-center gap-3 text-center p-6"
          >
            <div className="w-16 h-16 bg-[var(--night-2)] border-4 border-[var(--outline)] flex items-center justify-center shadow-[4px_4px_0_var(--outline)]">
              <span className="font-display text-2xl text-[var(--neon-gold)] animate-pulse">♫</span>
            </div>
            <h2 className="font-display text-lg text-[var(--text-1)] max-w-md">
              {activeMusicTitle || 'Audio Practice Mode'}
            </h2>
            <p className="font-mono text-xs text-[var(--neon-green)]">
              {effectiveIsPlaying ? 'PLAYING AUDIO' : 'PAUSED'}
            </p>
          </div>
        )}

        {/* Floating HUD Pill (Draggable) */}
        <div
          data-testid="fullscreen-hud"
          style={{ transform: `translate3d(${hudPos.x}px, ${hudPos.y}px, 0)` }}
          className="absolute top-0 left-0 z-[70] pointer-events-auto flex items-center flex-wrap gap-2 bg-[var(--night-1)]/95 border-4 border-[var(--outline)] px-3 py-2 shadow-[6px_6px_0_var(--outline)] max-w-[95vw]"
        >
          {/* Drag Handle */}
          <div
            onPointerDown={handleHudDragStart}
            data-testid="hud-drag-handle"
            title="Drag Loop HUD"
            className="cursor-move px-1 py-1 text-[var(--violet-4)] hover:text-[var(--neon-gold)] font-mono text-xs flex flex-col justify-center items-center select-none"
          >
            <span>::</span>
          </div>

          {/* Play/Pause Button */}
          <button
            type="button"
            aria-label={effectiveIsPlaying ? 'Pause' : 'Play'}
            onClick={effectiveIsPlaying ? handlePause : handlePlay}
            className="px-3 py-1.5 bg-[var(--neon-orange)] hover:bg-[var(--neon-orange)]/90 active:translate-x-0.5 active:translate-y-0.5 text-[var(--on-neon)] font-display text-[10px] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)]"
          >
            {effectiveIsPlaying ? 'II' : 'PLAY'}
          </button>

          {/* Loop Button */}
          <button
            type="button"
            aria-label={isLooping ? 'Loop ON' : 'Loop OFF'}
            onClick={onToggleLoop}
            className={`px-3 py-1.5 font-display text-[10px] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)] transition-colors ${
              isLooping
                ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] animate-pulse font-bold'
                : 'bg-[var(--night-2)] text-[var(--text-2)] hover:text-[var(--text-1)]'
            }`}
          >
            {isLooping ? 'LOOP ON' : 'LOOP OFF'}
          </button>

          {/* Loop Range Info */}
          <div className="flex flex-col items-center px-1 font-mono">
            <span className="text-xs font-bold text-[var(--neon-gold)]">{loopDurationText}</span>
            {markerDraftRange ? (
              <span className="text-[9px] text-[var(--text-2)]">
                [{formatTime(markerDraftRange.start)} - {formatTime(markerDraftRange.end)}]
              </span>
            ) : loopMarker ? (
              <span className="text-[9px] text-[var(--neon-cyan)]">
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
              className="px-2 py-1 bg-[var(--neon-cyan)] text-[var(--on-neon)] font-display text-[9px] border-2 border-[var(--outline)] hover:brightness-105 active:translate-x-0.5 active:translate-y-0.5"
            >
              [A] IN
            </button>
            <button
              type="button"
              aria-label="Set Out"
              onClick={onSetOutPoint}
              title="Set Out Point (B) at current playhead"
              className="px-2 py-1 bg-[var(--neon-cyan)] text-[var(--on-neon)] font-display text-[9px] border-2 border-[var(--outline)] hover:brightness-105 active:translate-x-0.5 active:translate-y-0.5"
            >
              [B] OUT
            </button>

            {markerDraftRange && (
              <button
                type="button"
                aria-label="Clear A-B Range"
                onClick={() => onMarkerDraftChange?.(null)}
                title="Clear A-B Draft Points"
                className="px-1.5 py-1 bg-[var(--night-2)] text-[var(--neon-red)] hover:bg-[var(--night-1)] font-mono text-[10px] font-bold border-2 border-[var(--outline)]"
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
            className={`px-2.5 py-1.5 font-display text-[10px] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)] transition active:translate-x-0.5 active:translate-y-0.5 ${
              showLoopsPanel
                ? 'bg-[var(--neon-cyan)] text-[var(--on-neon)] font-bold'
                : 'bg-[var(--night-2)] text-[var(--text-2)] hover:text-[var(--text-1)]'
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
            className="px-2 py-1.5 bg-[var(--neon-green)] hover:bg-[var(--neon-green)]/90 active:translate-x-0.5 active:translate-y-0.5 text-[var(--on-neon)] font-display text-[9px] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)]"
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
              className="bg-[var(--night-1)] text-[var(--neon-green)] border-2 border-[var(--outline)] font-mono font-bold text-xs px-1 py-1 cursor-pointer outline-none"
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
            <span className="font-mono text-[9px] text-[var(--neon-green)] bg-[var(--night-1)] px-1.5 py-0.5 border border-[var(--neon-green)]">
              🎤 {speechTranscript || 'VOICE READY'}
            </span>
          )}

          {/* Player Mode Toggle (Drive Player vs Direct Sync) */}
          {driveFileId && (
            <button
              type="button"
              aria-label={useDrivePreview ? 'Switch to Direct Sync' : 'Switch to Drive Player'}
              onClick={() => setUseDrivePreview(!useDrivePreview)}
              className={`px-2.5 py-1.5 font-display text-[9px] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)] transition active:translate-x-0.5 active:translate-y-0.5 cursor-pointer ${
                useDrivePreview
                  ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold'
                  : 'bg-[var(--night-2)] text-[var(--text-2)] hover:text-[var(--text-1)]'
              }`}
              title={
                useDrivePreview
                  ? 'Google Drive Player active (plays all video formats). Click to switch to Direct Sync'
                  : 'Direct Sync mode active. Click to switch to Google Drive Player'
              }
            >
              {useDrivePreview ? '🎬 DRIVE PLAYER' : '⚡ DIRECT SYNC'}
            </button>
          )}

          {/* Exit Fullscreen Button */}
          <button
            type="button"
            aria-label="Exit"
            onClick={onExitFullscreen}
            className="px-2.5 py-1.5 bg-[var(--neon-red)] text-white font-display text-[10px] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)] hover:bg-[var(--neon-red)]/90 active:translate-x-0.5 active:translate-y-0.5"
          >
            ✕ EXIT
          </button>
        </div>

        {/* Fullscreen Retro Loops Panel Drawer / Modal */}
        {showLoopsPanel && (
          <div
            data-testid="fullscreen-loops-drawer"
            className="absolute top-16 right-4 z-[80] pointer-events-auto w-96 max-w-[92vw] max-h-[80vh] flex flex-col bg-[var(--night-1)]/95 border-4 border-[var(--outline)] shadow-[8px_8px_0_var(--outline)] text-[var(--text-1)] font-mono"
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between bg-[var(--night-2)] px-3 py-2 border-b-4 border-[var(--outline)]">
              <span className="font-display text-[10px] text-[var(--neon-gold)]">
                ♫ REHEARSAL LOOPS ({markers.length})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenAddLoop}
                  className="px-2 py-0.5 bg-[var(--neon-green)] text-[var(--on-neon)] font-display text-[8px] border border-[var(--outline)] hover:brightness-105"
                >
                  + NEW
                </button>
                <button
                  type="button"
                  onClick={() => setShowLoopsPanel(false)}
                  className="text-[var(--text-2)] hover:text-[var(--text-1)] font-bold text-xs px-1"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Loop Form (Add / Edit) */}
            {isEditingLoop && (
              <form onSubmit={handleSaveLoopForm} className="p-3 bg-[var(--night-1)] border-b-2 border-[var(--outline)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-display text-[9px] text-[var(--neon-cyan)]">
                    {editingLoopId ? 'EDIT LOOP' : 'ADD NEW LOOP'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (markerDraftRange) {
                        setLoopFormStart(roundLoopTime(markerDraftRange.start));
                        setLoopFormEnd(roundLoopTime(markerDraftRange.end));
                      } else {
                        const s = Math.max(0, roundLoopTime(effectiveCurrentTime));
                        setLoopFormStart(s);
                        setLoopFormEnd(Math.min(effectiveDuration, Math.max(s + 0.1, roundLoopTime(effectiveCurrentTime + 8))));
                      }
                    }}
                    className="text-[9px] text-[var(--neon-gold)] underline hover:text-[var(--text-1)]"
                  >
                    Use Current A-B
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="Loop Name (e.g. Chorus Combo)"
                  value={loopFormName}
                  onChange={e => setLoopFormName(e.target.value)}
                  className="w-full bg-[var(--night-1)] border-2 border-[var(--outline)] text-[var(--text-1)] px-2 py-1 text-xs font-mono outline-none focus:border-[var(--neon-cyan)]"
                  autoFocus
                />

                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[var(--text-2)]">Start (s):</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={loopFormStart}
                      onChange={e => setLoopFormStart(e.target.value === '' ? 0 : Number(e.target.value))}
                      onBlur={() => setLoopFormStart(prev => roundLoopTime(prev))}
                      className="bg-[var(--night-2)] border border-[var(--outline)] text-[var(--neon-green)] px-1.5 py-1 text-xs outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[var(--text-2)]">End (s):</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={loopFormEnd}
                      onChange={e => setLoopFormEnd(e.target.value === '' ? 0 : Number(e.target.value))}
                      onBlur={() => setLoopFormEnd(prev => roundLoopTime(prev))}
                      className="bg-[var(--night-2)] border border-[var(--outline)] text-[var(--neon-green)] px-1.5 py-1 text-xs outline-none"
                    />
                  </label>
                </div>

                {loopFormError && <p className="text-[10px] text-[var(--neon-red)]">{loopFormError}</p>}

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    className="flex-1 py-1 bg-[var(--neon-green)] text-[var(--on-neon)] font-display text-[9px] border-2 border-[var(--outline)] hover:brightness-105"
                  >
                    {editingLoopId ? 'UPDATE' : 'SAVE'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingLoop(false);
                      setEditingLoopId(null);
                    }}
                    className="px-3 py-1 bg-[var(--violet-2)] text-[var(--text-1)] font-display text-[9px] border-2 border-[var(--outline)] hover:bg-[var(--violet-1)]"
                  >
                    CANCEL
                  </button>
                </div>
              </form>
            )}

            {/* Loop List (Selection to Loop) */}
            <div className="flex-1 overflow-y-auto divide-y divide-[var(--outline)] p-2 space-y-1.5 max-h-[50vh] pixel-scrollbar">
              {markers.length === 0 ? (
                <div className="p-4 text-center text-xs text-[var(--text-2)]">
                  <p>No loops saved yet.</p>
                  <p className="mt-1 text-[10px] text-[var(--text-2)]">
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
                      className={`p-2 border-2 border-[var(--outline)] transition ${
                        isLoopingThis
                          ? 'bg-[var(--night-2)] shadow-[2px_2px_0_var(--neon-gold)]'
                          : 'bg-[var(--violet-1)] hover:bg-[var(--violet-2)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <span className="font-bold text-xs text-[var(--text-1)] truncate max-w-[180px]">
                          {marker.name}
                        </span>
                        <span
                          className={`px-1 py-0.2 text-[8px] font-bold uppercase border border-[var(--outline)] ${
                            isClass
                              ? 'bg-[var(--neon-gold)] text-[var(--on-neon)]'
                              : 'bg-[var(--neon-cyan)] text-[var(--on-neon)]'
                          }`}
                        >
                          {isClass ? 'CLASS' : 'MY LOOP'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-1 text-[10px] text-[var(--text-2)]">
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
                          className={`px-2 py-0.5 font-display text-[8px] border border-[var(--outline)] shadow-[1px_1px_0_var(--outline)] ${
                            isLoopingThis
                              ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold animate-pulse'
                              : 'bg-[var(--neon-green)] text-[var(--on-neon)] hover:brightness-105'
                          }`}
                        >
                          {isLoopingThis ? 'LOOPING ♫' : '▶ LOOP'}
                        </button>

                        <button
                          type="button"
                          onClick={() => onJumpToMarker?.(marker)}
                          className="px-2 py-0.5 bg-[var(--neon-cyan)] text-[var(--on-neon)] font-display text-[8px] border border-[var(--outline)] hover:brightness-105"
                        >
                          JUMP
                        </button>

                        {!isClass && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenEditLoop(marker)}
                              className="px-1.5 py-0.5 bg-[var(--night-2)] text-[var(--text-2)] hover:text-[var(--text-1)] font-mono text-[9px] border border-[var(--outline)]"
                              title="Edit loop timing"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteLoopMarker?.(marker.id)}
                              className="px-1.5 py-0.5 bg-[var(--neon-red)] text-white hover:brightness-110 font-mono text-[9px] border border-[var(--outline)]"
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
      <div className="bg-[var(--night-1)] border-t-4 border-[var(--outline)] p-3 space-y-2 relative z-[60] pointer-events-auto">
        {/* Primary Timeline Progress */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[10px] font-mono text-[var(--neon-green)]">
            <span>
              {isVideoOnly ? 'VIDEO TRACK' : 'MUSIC'}: {formatTime(effectiveCurrentTime)} / {formatTime(effectiveDuration)}
            </span>
            <span className="text-[var(--neon-gold)]">
              {activeMusicTitle ? `♫ ${activeMusicTitle}` : isVideoOnly ? 'Rehearsal Video' : ''}
            </span>
          </div>
          <div
            ref={musicBarRef}
            role="slider"
            aria-label="Seek through music"
            tabIndex={0}
            onPointerDown={handleTrackPointerDown}
            onPointerMove={handleTrackPointerMove}
            onPointerUp={handleTrackPointerUp}
            className="relative h-7 bg-[var(--night-2)] border-2 border-[var(--outline)] cursor-pointer overflow-visible shadow-[2px_2px_0_var(--shadow-hard)] select-none"
          >
            {/* Tooltip */}
            {tooltip && (
              <div
                style={{ left: `${Math.max(10, Math.min(tooltip.leftPercent, 90))}%` }}
                className="absolute -top-7 -translate-x-1/2 z-40 bg-[var(--night-1)] text-[var(--neon-gold)] text-[10px] font-mono px-2 py-0.5 border border-[var(--neon-pink)] shadow-[2px_2px_0_var(--shadow-hard)] pointer-events-none whitespace-nowrap"
              >
                {tooltip.text}
              </div>
            )}

            {/* Playhead Progress Fill */}
            <div
              className="absolute inset-y-0 left-0 bg-[var(--neon-cyan)]/30 border-r-2 border-[var(--neon-cyan)] pointer-events-none"
              style={{ width: `${progressPercent}%` }}
            />

            {/* Loop Draft Range */}
            {hasDraftRange && currentRange ? (
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
                  className={`absolute inset-0 cursor-grab active:cursor-grabbing bg-[color-mix(in_srgb,var(--neon-pink)_35%,transparent)] border-y-2 border-[var(--neon-pink)] shadow-[0_0_10px_rgba(255,46,147,0.3)] transition-colors ${
                    isPulsing ? 'animate-pulse ring-2 ring-[var(--neon-pink)] bg-[var(--neon-pink)]/50' : ''
                  }`}
                  title={`Loop: ${formatTime(currentRange.start)} - ${formatTime(currentRange.end)} (${(currentRange.end - currentRange.start).toFixed(1)}s)`}
                />

                {/* Left Handle (Resize Start) */}
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label="Loop start handle"
                  data-testid="loop-handle-start"
                  onPointerDown={handleStartHandlePointerDown}
                  className="absolute inset-y-0 -left-2 w-4 cursor-ew-resize bg-[var(--neon-pink)] border-2 border-black z-30 hover:scale-110 active:scale-125 transition-transform flex items-center justify-center shadow-[1px_1px_0_var(--shadow-hard)]"
                  title={`Loop start: ${formatTime(currentRange.start)}`}
                >
                  <span className="w-0.5 h-3 bg-black pointer-events-none" />
                </div>

                {/* Right Handle (Resize End) */}
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label="Loop end handle"
                  data-testid="loop-handle-end"
                  onPointerDown={handleEndHandlePointerDown}
                  className="absolute inset-y-0 -right-2 w-4 cursor-ew-resize bg-[var(--neon-pink)] border-2 border-black z-30 hover:scale-110 active:scale-125 transition-transform flex items-center justify-center shadow-[1px_1px_0_var(--shadow-hard)]"
                  title={`Loop end: ${formatTime(currentRange.end)}`}
                >
                  <span className="w-0.5 h-3 bg-black pointer-events-none" />
                </div>
              </div>
            ) : null}

            {/* Playhead Needle */}
            <div
              className="absolute inset-y-0 w-[2px] -ml-[1px] bg-[var(--neon-cyan)] shadow-[0_0_8px_var(--neon-cyan)] z-10 pointer-events-none"
              style={{ left: `${progressPercent}%` }}
              aria-hidden="true"
            />
          </div>
        </div>

        {/* Video Track Progress (shown if both music & video are loaded in sync mode) */}
        {hasDanceVideo && !isVideoOnly && (
          <div className="space-y-1 pt-1 border-t border-[var(--outline)]">
            <div className="flex flex-wrap justify-between items-center gap-2 text-[10px] font-mono">
              <div className="flex items-center gap-2 text-[var(--text-2)]">
                <span>
                  SYNCED VIDEO: {formatTime(effectiveVideoCurrentTime)} / {formatTime(effectiveVideoDuration)}
                </span>
                <span className="text-[var(--neon-gold)] font-bold">
                  ⚑ START: {formatTimeWithTenths(videoStart)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {onSetVideoStart && (
                  <>
                    <button
                      type="button"
                      aria-label="Set video start point"
                      onClick={handleSetStartToCurrentVideo}
                      className="px-2 py-0.5 bg-[var(--neon-gold)] text-[var(--on-neon)] font-display text-[9px] border border-[var(--outline)] shadow-[1px_1px_0_var(--shadow-hard)] hover:brightness-110 active:translate-x-0.5 active:translate-y-0.5 cursor-pointer font-bold"
                      title="Set video start alignment flag to the currently displayed video frame"
                    >
                      ⚑ SET START HERE
                    </button>
                    <button
                      type="button"
                      aria-label="Nudge video start backward"
                      onClick={() => handleNudgeVideoStart(-0.5)}
                      className="px-1.5 py-0.5 bg-[var(--night-2)] text-[var(--text-1)] font-mono text-[9px] border border-[var(--outline)] hover:bg-[var(--violet-1)] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                      title="Nudge video start -0.5s"
                    >
                      -0.5s
                    </button>
                    <button
                      type="button"
                      aria-label="Nudge video start forward"
                      onClick={() => handleNudgeVideoStart(0.5)}
                      className="px-1.5 py-0.5 bg-[var(--night-2)] text-[var(--text-1)] font-mono text-[9px] border border-[var(--outline)] hover:bg-[var(--violet-1)] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                      title="Nudge video start +0.5s"
                    >
                      +0.5s
                    </button>
                    {videoStart > 0 && (
                      <button
                        type="button"
                        aria-label="Reset video start"
                        onClick={() => onSetVideoStart(0)}
                        className="px-1.5 py-0.5 text-[var(--neon-red)] hover:underline font-mono text-[9px] cursor-pointer"
                        title="Reset video start to 0s"
                      >
                        Reset (0s)
                      </button>
                    )}
                  </>
                )}
                {loopMarker && selectedVideoId && onSaveLoopWithVideo && (
                  <button
                    type="button"
                    aria-label="Save loop video alignment"
                    onClick={handleSaveLoopAlignment}
                    className="px-2 py-0.5 bg-[var(--neon-cyan)] text-[var(--on-neon)] font-display text-[9px] border border-[var(--outline)] hover:brightness-110 active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                    title="Save current video alignment into this loop marker"
                  >
                    {saveLoopSuccess ? '✓ SAVED!' : '💾 SAVE TO LOOP'}
                  </button>
                )}
              </div>
            </div>
            <div
              ref={videoBarRef}
              role="slider"
              aria-label="Video timeline"
              tabIndex={0}
              onClick={handleVideoBarClick}
              className="relative h-4 bg-[var(--violet-1)] border-2 border-[var(--outline)] cursor-pointer overflow-visible select-none shadow-[1px_1px_0_var(--shadow-hard)]"
            >
              <div
                className="absolute inset-y-0 left-0 bg-[var(--neon-green)]/40 border-r-2 border-[var(--neon-green)] pointer-events-none"
                style={{ width: `${videoProgress}%` }}
              />
              <div
                role="slider"
                tabIndex={0}
                aria-label="Video start flag"
                data-testid="video-start-flag"
                onPointerDown={handleVideoStartFlagPointerDown}
                className="absolute inset-y-0 -ml-1.5 w-3 bg-[var(--neon-gold)] z-20 cursor-ew-resize hover:scale-125 transition-transform flex items-center justify-center border border-black"
                style={{ left: `${videoStartPercent}%` }}
                title={`Video Start: ${formatTimeWithTenths(videoStart)} (Drag to adjust)`}
              >
                <span className="w-0.5 h-2 bg-black pointer-events-none" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
