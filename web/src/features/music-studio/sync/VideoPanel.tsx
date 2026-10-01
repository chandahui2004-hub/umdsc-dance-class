import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { VideoItem, MusicItem } from '@umdsc/shared';
import type { Master } from './types';
import type { Marker } from '../dancecue/types/marker';
import { useSyncedVideo } from './useSyncedVideo';
import { VideoTimeline } from './VideoTimeline';
import { streamUrl } from '../../../lib/google/driveUrls';

export interface VideoPanelProps {
  master: Master;
  videos: VideoItem[];
  activeMusic: MusicItem | null;
  activeLoopMarker: Marker | null;
  onSaveLoopWithVideo?: (markerId: string, videoId: string, videoStart: number) => void;
}

export const VideoPanel: React.FC<VideoPanelProps> = ({
  master,
  videos,
  activeMusic,
  activeLoopMarker,
  onSaveLoopWithVideo,
}) => {
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [videoStart, setVideoStart] = useState<number>(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [showAllVideos, setShowAllVideos] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement>(null);

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

  // Filter videos relevant to active music (style / session / event)
  const filteredVideos = useMemo(() => {
    if (showAllVideos || !activeMusic) return videos;
    const matched = videos.filter(v => {
      if (activeMusic.sessionId && v.sessionId === activeMusic.sessionId) return true;
      if (activeMusic.styleId && v.styleId === activeMusic.styleId) return true;
      if (activeMusic.eventId && v.eventId === activeMusic.eventId) return true;
      return false;
    });
    return matched.length > 0 ? matched : videos;
  }, [videos, activeMusic, showAllVideos]);

  const selectedVideo = useMemo(
    () => videos.find(v => v.id === selectedVideoId) || null,
    [videos, selectedVideoId]
  );

  const { muted, setMuted, status } = useSyncedVideo({
    master,
    videoRef,
    videoStart,
    enabled: !!selectedVideoId,
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
  }, [selectedVideo]);

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

  return (
    <div className="bg-[#1D2B53] border-4 border-black p-3 text-white shadow-[4px_4px_0_#000] mb-6">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black/40 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-[#FFEC27] border border-black inline-block" />
          <h3 className="font-['Press_Start_2P'] text-[11px] min-text-5px text-[#FFEC27] tracking-wider uppercase">
            Synced Class Video
          </h3>
          {status === 'buffering' && (
            <span className="px-1.5 py-0.5 bg-[#FF004D] text-[9px] min-text-5px font-bold text-white border border-black animate-pulse">
              BUFFERING
            </span>
          )}
          {status === 'playing' && (
            <span className="px-1.5 py-0.5 bg-[#00E436] text-[9px] min-text-5px font-bold text-black border border-black">
              SYNCED
            </span>
          )}
        </div>

        {/* Video picker */}
        <div className="flex items-center gap-2">
          <select
            value={selectedVideoId}
            onChange={e => setSelectedVideoId(e.target.value)}
            className="bg-black text-white text-[10px] min-text-5px border-2 border-black px-2 py-1 font-mono outline-none focus:border-[#FFEC27]"
            aria-label="Select class video"
          >
            <option value="">-- No Video (Audio Only) --</option>
            {filteredVideos.map(vid => (
              <option key={vid.id} value={vid.id}>
                {vid.title || `Video ${vid.id.slice(0, 8)}`}
              </option>
            ))}
          </select>

          {videos.length > filteredVideos.length && (
            <button
              type="button"
              onClick={() => setShowAllVideos(!showAllVideos)}
              className="text-[9px] min-text-5px underline text-[#29ADFF] hover:text-[#FFEC27]"
            >
              {showAllVideos ? 'Show Related' : 'Show All'}
            </button>
          )}
        </div>
      </div>

      {/* Screen Frame */}
      <div className="relative bg-black border-4 border-[#000] p-1 shadow-inner mb-3">
        {selectedVideo ? (
          <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
            <video
              ref={videoRef}
              playsInline
              muted={muted}
              src={streamUrl(selectedVideo.driveFileId)}
              className="w-full h-full object-contain"
            />
            {muted && (
              <div className="absolute top-2 right-2 bg-black/80 border border-[#FFEC27] px-2 py-0.5 text-[9px] min-text-5px text-[#FFEC27] font-mono">
                MUTED
              </div>
            )}
          </div>
        ) : (
          <div className="aspect-video bg-[#0c1427] flex flex-col items-center justify-center p-4 text-center border-2 border-dashed border-[#5F574F]">
            <div className="w-10 h-10 border-2 border-[#5F574F] mb-2 flex items-center justify-center text-[#5F574F]">
              ▶
            </div>
            <p className="font-['Press_Start_2P'] text-[9px] min-text-5px text-[#C2C3C7] mb-1">
              NO VIDEO SELECTED
            </p>
            <p className="text-[12px] min-text-5px text-[#83769C]">
              Select a class video above to rehearse side-by-side with your music.
            </p>
          </div>
        )}
      </div>

      {/* Timeline with Start Flag */}
      {selectedVideo && (
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
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-black/40">
        <div className="flex items-center gap-2">
          {/* Mute Toggle */}
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            disabled={!selectedVideoId}
            className={`px-3 py-1.5 border-2 border-black font-['Press_Start_2P'] text-[9px] min-text-5px uppercase transition-colors shadow-[2px_2px_0_#000] active:translate-x-[1px] active:translate-y-[1px] ${
              muted
                ? 'bg-[#5F574F] text-white hover:bg-[#83769C]'
                : 'bg-[#00E436] text-black hover:bg-[#00E436]/90'
            } disabled:opacity-50`}
          >
            {muted ? '🔇 Muted' : '🔊 Audio On'}
          </button>

          {/* Set Start to Current Video Time */}
          <button
            type="button"
            onClick={handleSetStartToCurrent}
            disabled={!selectedVideoId}
            className="px-3 py-1.5 bg-[#FFEC27] text-black border-2 border-black font-['Press_Start_2P'] text-[9px] min-text-5px uppercase hover:bg-[#FFEC27]/90 shadow-[2px_2px_0_#000] active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50"
            title="Set the video alignment start flag to the currently displayed frame"
          >
            ⚑ Set Start Here
          </button>

          {/* Reset Flag */}
          {videoStart > 0 && (
            <button
              type="button"
              onClick={() => setVideoStart(0)}
              className="text-[9px] min-text-5px text-[#C2C3C7] hover:text-white underline ml-1"
            >
              Reset to 0s
            </button>
          )}
        </div>

        {/* Save Loop + Video Alignment */}
        {activeLoopMarker && selectedVideoId && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveLoopWithVideo}
              className="px-3 py-1.5 bg-[#FFA300] text-black border-2 border-black font-['Press_Start_2P'] text-[9px] min-text-5px uppercase hover:bg-[#FFA300]/90 shadow-[2px_2px_0_#000] active:translate-x-[1px] active:translate-y-[1px]"
            >
              Save Loop + Video
            </button>
            {saveSuccess && (
              <span className="text-[9px] min-text-5px font-bold text-[#00E436] animate-bounce">
                SAVED!
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
