import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { VideoItem, MusicItem, DanceStyle, EventSummary } from '@umdsc/shared';
import type { Master } from './types';
import type { Marker } from '../dancecue/types/marker';
import { useSyncedVideo } from './useSyncedVideo';
import { VideoTimeline } from './VideoTimeline';
import { streamUrl, openInDriveUrl, previewUrl } from '../../../lib/google/driveUrls';

export interface VideoPanelProps {
  master: Master;
  videos: VideoItem[];
  events?: EventSummary[];
  styles?: DanceStyle[];
  activeMusic: MusicItem | null;
  activeLoopMarker: Marker | null;
  selectedVideoId?: string;
  localVideoFile?: { name: string; url: string; file: File } | null;
  videoStart?: number;
  useDrivePreview?: boolean;
  onToggleDrivePreview?: (usePreview: boolean) => void;
  onSelectVideoId?: (id: string) => void;
  onSelectLocalVideo?: (file: File) => void;
  onClearLocalVideo?: () => void;
  onSetVideoStart?: (start: number) => void;
  onSaveLoopWithVideo?: (markerId: string, videoId: string, videoStart: number) => void;
}

export const VideoPanel: React.FC<VideoPanelProps> = ({
  master,
  videos,
  events = [],
  styles = [],
  activeMusic,
  activeLoopMarker,
  selectedVideoId: propSelectedVideoId,
  localVideoFile,
  videoStart: propVideoStart,
  useDrivePreview: propUseDrivePreview,
  onToggleDrivePreview,
  onSelectVideoId,
  onSelectLocalVideo,
  onClearLocalVideo,
  onSetVideoStart,
  onSaveLoopWithVideo,
}) => {
  // Support both controlled and uncontrolled usage
  const [internalVideoId, setInternalVideoId] = useState<string>('');
  const [internalVideoStart, setInternalVideoStart] = useState<number>(0);
  const [internalUseDrivePreview, setInternalUseDrivePreview] = useState<boolean>(false);

  const isControlledId = propSelectedVideoId !== undefined;
  const selectedVideoId = isControlledId ? propSelectedVideoId : internalVideoId;
  const setSelectedVideoId = (id: string) => {
    if (onSelectVideoId) {
      onSelectVideoId(id);
    }
    if (!isControlledId) {
      setInternalVideoId(id);
    }
  };

  const isControlledStart = propVideoStart !== undefined;
  const videoStart = isControlledStart ? propVideoStart : internalVideoStart;
  const setVideoStart = (start: number) => {
    if (onSetVideoStart) {
      onSetVideoStart(start);
    }
    if (!isControlledStart) {
      setInternalVideoStart(start);
    }
  };

  // Event & Style filtering state
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [styleFilter, setStyleFilter] = useState<string>('all');

  // Pre-filter based on activeMusic if available
  useEffect(() => {
    if (activeMusic?.eventId && events.some(e => e.id === activeMusic.eventId)) {
      setEventFilter(activeMusic.eventId);
    }
    if (activeMusic?.styleId && styles.some(s => s.id === activeMusic.styleId)) {
      setStyleFilter(activeMusic.styleId);
    }
  }, [activeMusic?.eventId, activeMusic?.styleId, events, styles]);

  const [videoCurrentTime, setVideoCurrentTime] = useState<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  // True when the file loaded (sound works) but the browser cannot decode its picture, e.g. H.265.
  const [noPicture, setNoPicture] = useState<boolean>(false);
  const [streamError, setStreamError] = useState<boolean>(false);

  const isLocalVideo = selectedVideoId === 'local' && !!localVideoFile;
  const isControlledPreview = propUseDrivePreview !== undefined;
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-selection from active loop marker or class section
  useEffect(() => {
    if (activeLoopMarker) {
      if (activeLoopMarker.videoId) {
        setSelectedVideoId(activeLoopMarker.videoId);
      }
      if (typeof activeLoopMarker.videoStart === 'number') {
        setVideoStart(activeLoopMarker.videoStart);
      }
    }
  }, [activeLoopMarker]);

  // Filter videos by Event and Dance Style
  const filteredVideos = useMemo(() => {
    return videos.filter(v => {
      // Event filter
      if (eventFilter !== 'all' && v.eventId !== eventFilter) {
        return false;
      }
      // Style filter
      if (styleFilter !== 'all') {
        const matchId = v.styleId === styleFilter;
        const styleObj = styles.find(s => s.id === styleFilter);
        const matchName = styleObj && v.styleId?.toLowerCase() === styleObj.name.toLowerCase();
        if (!matchId && !matchName) return false;
      }
      return true;
    });
  }, [videos, eventFilter, styleFilter, styles]);

  const selectedVideo = useMemo(
    () => (!isLocalVideo && selectedVideoId ? videos.find(v => v.id === selectedVideoId) || null : null),
    [videos, selectedVideoId, isLocalVideo]
  );

  const currentVideoSrc = useMemo(() => {
    if (isLocalVideo && localVideoFile) {
      return localVideoFile.url;
    }
    if (selectedVideo) {
      return streamUrl(selectedVideo.driveFileId);
    }
    return '';
  }, [isLocalVideo, localVideoFile, selectedVideo]);

  useEffect(() => {
    setNoPicture(false);
    setStreamError(false);
    if (isLocalVideo) {
      setUseDrivePreview(false);
    }
  }, [selectedVideoId, currentVideoSrc, isLocalVideo]);

  const { muted, setMuted, status } = useSyncedVideo({
    master,
    videoRef,
    videoStart,
    enabled: Boolean(currentVideoSrc),
    anchor: activeLoopMarker?.time,
  });

  // Track video element's time & duration for the timeline scrubber
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setVideoCurrentTime(video.currentTime);
    };

    const handleLoadedMetadata = () => {
      setVideoDuration(video.duration || 0);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [currentVideoSrc]);

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setVideoCurrentTime(time);
    }
  };

  const handleSetStartToCurrent = () => {
    const current = videoRef.current ? Math.round(videoRef.current.currentTime * 10) / 10 : 0;
    setVideoStart(current);
  };

  const handleSaveLoopWithVideo = () => {
    if (!activeLoopMarker || !selectedVideoId) return;
    if (onSaveLoopWithVideo) {
      onSaveLoopWithVideo(activeLoopMarker.id, selectedVideoId, videoStart);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (onSelectLocalVideo) {
        onSelectLocalVideo(file);
      }
      e.target.value = '';
    }
  };

  return (
    <div className="bg-[var(--night-2)] border-4 border-[var(--outline)] p-3 text-[var(--text-1)] shadow-[4px_4px_0_var(--outline)] mb-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[var(--outline)] pb-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-[var(--neon-gold)] border border-[var(--outline)] inline-block" />
          <h3 className="font-display text-[12px] text-[var(--neon-gold)] tracking-wider uppercase">
            Synced Class Video
          </h3>
          {status === 'buffering' && (
            <span className="px-1.5 py-0.5 bg-[var(--neon-red)] text-[8px] font-bold text-[var(--on-neon)] border border-[var(--outline)] animate-pulse">
              BUFFERING
            </span>
          )}
          {status === 'playing' && (
            <span className="px-1.5 py-0.5 bg-[var(--neon-green)] text-[8px] font-bold text-[var(--on-neon)] border border-[var(--outline)]">
              SYNCED
            </span>
          )}
        </div>

        {/* Actions bar: Local Video Upload & Player Mode Toggle */}
        <div className="flex items-center gap-2">
          {selectedVideo && !isLocalVideo && (
            <button
              type="button"
              onClick={() => setUseDrivePreview(!useDrivePreview)}
              className={`px-2.5 py-1 font-display text-[12px] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)] active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-1.5 cursor-pointer ${
                useDrivePreview
                  ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold'
                  : 'bg-[var(--night-1)] text-[var(--text-2)] hover:text-[var(--text-1)]'
              }`}
              title={
                useDrivePreview
                  ? 'Google Drive Player active (compatible with HEVC & all devices). Click for Direct Sync.'
                  : 'Direct Sync active. Click to switch to Google Drive Player.'
              }
            >
              <span>{useDrivePreview ? '🎬 DRIVE PLAYER' : '⚡ DIRECT SYNC'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1 bg-[var(--neon-cyan)] text-[var(--on-neon)] font-display text-[12px] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)] hover:bg-[var(--text-1)] active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-1.5 cursor-pointer"
            title="Upload your own rehearsal video to play in sync (played locally, not stored on Google Drive)"
          >
            <span>📁 LOCAL VIDEO</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/*"
            className="sr-only"
            onChange={handleFileInputChange}
          />
        </div>
      </div>

      {/* Filter and Video Picker Bar */}
      <div className="bg-[var(--night-1)] border-2 border-[var(--outline)] p-2 mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Event Filter */}
          {events.length > 0 && (
            <label className="flex items-center gap-1 font-mono text-[12px]">
              <span className="text-[var(--text-2)]">EVENT:</span>
              <select
                aria-label="Filter videos by event"
                value={eventFilter}
                onChange={e => setEventFilter(e.target.value)}
                className="bg-[var(--night-2)] text-[var(--neon-gold)] text-[16px] border-2 border-[var(--outline)] px-2 py-1 font-mono outline-none focus:border-[var(--neon-gold)]"
              >
                <option value="all">ALL EVENTS ({videos.length})</option>
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Style Filter */}
          {styles.length > 0 && (
            <label className="flex items-center gap-1 font-mono text-[12px]">
              <span className="text-[var(--text-2)]">STYLE:</span>
              <select
                aria-label="Filter videos by style"
                value={styleFilter}
                onChange={e => setStyleFilter(e.target.value)}
                className="bg-[var(--night-2)] text-[var(--neon-gold)] text-[16px] border-2 border-[var(--outline)] px-2 py-1 font-mono outline-none focus:border-[var(--neon-gold)]"
              >
                <option value="all">ALL STYLES</option>
                {styles.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* Video selector dropdown */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] text-[var(--text-2)]">SELECT:</span>
          <select
            value={selectedVideoId}
            onChange={e => setSelectedVideoId(e.target.value)}
            className="bg-[var(--night-2)] text-[var(--text-1)] text-[16px] border-2 border-[var(--outline)] px-2 py-1 font-mono outline-none focus:border-[var(--neon-gold)] max-w-[280px] truncate"
            aria-label="Select class video"
          >
            <option value="">-- No Video (Audio Only) --</option>
            {localVideoFile && (
              <option value="local">📁 Local: {localVideoFile.name}</option>
            )}
            {filteredVideos.length > 0 ? (
              <optgroup label={`Class Videos (${filteredVideos.length})`}>
                {filteredVideos.map(vid => (
                  <option key={vid.id} value={vid.id}>
                    {vid.title || `Video ${vid.id.slice(0, 8)}`}
                  </option>
                ))}
              </optgroup>
            ) : (
              <option disabled value="__empty__">
                (No class videos match filters)
              </option>
            )}
            {selectedVideo && !filteredVideos.some(v => v.id === selectedVideo.id) && (
              <optgroup label="Selected Video">
                <option value={selectedVideo.id}>
                  {selectedVideo.title || `Video ${selectedVideo.id.slice(0, 8)}`}
                </option>
              </optgroup>
            )}
          </select>
        </div>
      </div>

      {/* Local Video notice banner */}
      {isLocalVideo && localVideoFile && (
        <div className="flex items-center justify-between bg-[var(--violet-2)] border-2 border-[var(--neon-cyan)] px-2.5 py-1 mb-3 text-[12px] font-mono text-[var(--neon-cyan)]">
          <span className="truncate">
            📁 Playing Local Practice Video: <strong>{localVideoFile.name}</strong> (Not saved to Google Drive)
          </span>
          {onClearLocalVideo && (
            <button
              type="button"
              onClick={onClearLocalVideo}
              className="text-[var(--neon-red)] hover:underline font-bold ml-2 shrink-0 cursor-pointer"
            >
              ✕ Remove
            </button>
          )}
        </div>
      )}

      {/* Screen Frame with scanlines only on the frame border area */}
      <div className="relative bg-[var(--night-1)] border-4 border-[var(--outline)] p-1 shadow-inner mb-3 px-scanlines">
        {useDrivePreview && selectedVideo ? (
          <div className="relative aspect-video bg-black flex flex-col z-[1]">
            <iframe
              src={previewUrl(selectedVideo.driveFileId)}
              title={selectedVideo.title}
              className="w-full h-full border-0 flex-1"
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen
            />
            <div className="flex items-center justify-between bg-[var(--night-2)] border-t border-[var(--outline)] px-2 py-1 text-[10px] font-mono text-[var(--text-2)]">
              <span>Drive preview player active (no timeline sync)</span>
              <button
                type="button"
                onClick={() => setUseDrivePreview(false)}
                className="text-[var(--neon-cyan)] hover:underline ml-2 cursor-pointer font-bold"
              >
                Switch to Direct Video
              </button>
            </div>
          </div>
        ) : currentVideoSrc ? (
          <div className="relative aspect-video bg-[var(--night-1)] flex items-center justify-center overflow-hidden z-[1]">
            <video
              ref={videoRef}
              playsInline
              muted={muted}
              src={currentVideoSrc}
              onLoadedData={e => {
                const el = e.currentTarget;
                setNoPicture(el.videoWidth === 0 && el.videoHeight === 0);
              }}
              onError={() => {
                if (!isLocalVideo && Boolean(currentVideoSrc)) {
                  setStreamError(true);
                }
              }}
              className="w-full h-full object-contain"
            />
            {streamError && (
              <div
                role="alert"
                className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--night-1)]/95 p-4 text-center z-20 space-y-2"
              >
                <p className="font-display text-[12px] text-[var(--neon-pink)]">
                  UNABLE TO STREAM GOOGLE DRIVE VIDEO
                </p>
                <p className="font-mono text-[11px] text-[var(--text-2)] max-w-sm">
                  Direct Google Drive streaming requires public permissions or API key access.
                </p>
                {selectedVideo && (
                  <div className="flex flex-wrap gap-2 justify-center">
                    <button
                      type="button"
                      onClick={() => setUseDrivePreview(true)}
                      className="px-3 py-1 bg-[var(--neon-gold)] text-[var(--on-neon)] font-display text-[10px] hover:brightness-110 border border-[var(--outline)] cursor-pointer"
                    >
                      SWITCH TO DRIVE PLAYER
                    </button>
                    <a
                      href={openInDriveUrl(selectedVideo.driveFileId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 bg-[var(--neon-cyan)] text-[var(--on-neon)] font-display text-[10px] hover:brightness-110 border border-[var(--outline)]"
                    >
                      OPEN IN GOOGLE DRIVE ↗
                    </a>
                  </div>
                )}
              </div>
            )}
            {noPicture && (
              <div
                role="alert"
                className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--night-1)]/90 p-4 text-center text-[12px] font-mono text-[var(--neon-gold)] space-y-2 z-20"
              >
                <p>This device can't show this video's format (H.265). Ask an admin to re-upload it as H.264 MP4.</p>
                {selectedVideo && (
                  <button
                    type="button"
                    onClick={() => setUseDrivePreview(true)}
                    className="px-3 py-1 bg-[var(--neon-gold)] text-[var(--on-neon)] font-display text-[10px] hover:brightness-110 border border-[var(--outline)] cursor-pointer"
                  >
                    SWITCH TO DRIVE PLAYER
                  </button>
                )}
              </div>
            )}
            {muted && (
              <div className="absolute top-2 right-2 bg-[var(--night-2)] border border-[var(--neon-gold)] px-2 py-0.5 text-[8px] text-[var(--neon-gold)] font-mono">
                MUTED
              </div>
            )}
          </div>
        ) : (
          <div className="aspect-video bg-[var(--night-1)] flex flex-col items-center justify-center p-4 text-center border-2 border-dashed border-[var(--violet-3)] z-[1] relative">
            <div className="w-10 h-10 border-2 border-[var(--violet-3)] mb-2 flex items-center justify-center text-[var(--violet-3)]">
              ▶
            </div>
            <p className="font-display text-[12px] text-[var(--text-2)] mb-1">
              NO VIDEO SELECTED
            </p>
            <p className="text-[12px] text-[var(--neon-cyan)] max-w-md">
              Select a class video above or click <strong>LOCAL VIDEO</strong> to rehearse side-by-side with your music.
            </p>
          </div>
        )}
      </div>

      {/* Timeline with Start Flag */}
      {Boolean(currentVideoSrc) && (
        <div className="mb-3">
          <VideoTimeline
            currentTime={videoCurrentTime}
            duration={videoDuration}
            videoStart={videoStart}
            onSeek={handleSeek}
            onSetVideoStart={setVideoStart}
          />
        </div>
      )}

      {/* Controls & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--outline)]">
        <div className="flex items-center gap-2">
          {/* Mute Toggle */}
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            disabled={!currentVideoSrc}
            className={`px-3 py-1.5 border-2 border-[var(--outline)] font-display text-[12px] uppercase shadow-[2px_2px_0_var(--outline)] active:translate-x-[1px] active:translate-y-[1px] ${
              muted
                ? 'bg-[var(--violet-2)] text-[var(--text-1)]'
                : 'bg-[var(--neon-green)] text-[var(--on-neon)]'
            } disabled:opacity-50`}
          >
            {muted ? '🔇 Muted' : '🔊 Audio On'}
          </button>

          {/* Set Start to Current Video Time */}
          <button
            type="button"
            onClick={handleSetStartToCurrent}
            disabled={!currentVideoSrc}
            className="px-3 py-1.5 bg-[var(--neon-gold)] text-[var(--on-neon)] border-2 border-[var(--outline)] font-display text-[12px] uppercase hover:bg-[var(--text-1)] shadow-[2px_2px_0_var(--outline)] active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50"
            title="Set the video alignment start flag to the currently displayed frame"
          >
            ⚑ Set Start Here
          </button>

          {/* Reset Flag */}
          {videoStart > 0 && (
            <button
              type="button"
              onClick={() => setVideoStart(0)}
              className="text-[12px] text-[var(--text-2)] hover:text-[var(--text-1)] underline ml-1"
            >
              Reset to 0s
            </button>
          )}
        </div>

        {/* Save Loop + Video Alignment */}
        {activeLoopMarker && selectedVideoId && selectedVideoId !== 'local' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveLoopWithVideo}
              className="px-3 py-1.5 bg-[var(--neon-orange)] text-[var(--on-neon)] border-2 border-[var(--outline)] font-display text-[12px] uppercase hover:bg-[var(--text-1)] shadow-[2px_2px_0_var(--outline)] active:translate-x-[1px] active:translate-y-[1px]"
            >
              Save Loop + Video
            </button>
            {saveSuccess && (
              <span className="text-[12px] font-bold text-[var(--neon-green)] animate-bounce">
                SAVED!
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
