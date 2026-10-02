import { useState, useEffect, useRef, useCallback } from 'react';
import type { Master } from './types';
import { expectedVideoTime, decideCorrection, syncMasterKind } from './syncMath';

export interface UseSyncedVideoOptions {
  master: Master;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoStart: number;
  enabled: boolean;
  anchor?: number;
}

export interface UseSyncedVideoReturn {
  muted: boolean;
  setMuted: (v: boolean) => void;
  status: 'idle' | 'playing' | 'buffering';
}

export function useSyncedVideo({
  master,
  videoRef,
  videoStart,
  enabled,
  anchor,
}: UseSyncedVideoOptions): UseSyncedVideoReturn {
  const [muted, setMutedState] = useState<boolean>(true);
  const [status, setStatus] = useState<'idle' | 'playing' | 'buffering'>('idle');

  // Internal anchor when not explicitly provided (e.g. from an active marker loop)
  const internalAnchorRef = useRef<number>(0);
  const wasPlayingRef = useRef<boolean>(false);
  const bufferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setMuted = useCallback(
    (v: boolean) => {
      setMutedState(v);
      if (videoRef.current) {
        videoRef.current.muted = v;
      }
    },
    [videoRef]
  );

  // Keep video.muted synced on mount / ref attach
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted;
    }
  }, [muted, videoRef]);

  // Buffer handling on HTML5 video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !enabled) return;

    const handleWaiting = () => {
      if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
      bufferTimerRef.current = setTimeout(() => {
        setStatus('buffering');
        master.pauseForBuffer();
      }, 500);
    };

    const handleCanPlay = () => {
      if (bufferTimerRef.current) {
        clearTimeout(bufferTimerRef.current);
        bufferTimerRef.current = null;
      }
      setStatus((current) => {
        if (current === 'buffering') {
          master.resumeFromBuffer();
          return master.isPlaying ? 'playing' : 'idle';
        }
        return current;
      });
    };

    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('playing', handleCanPlay);

    return () => {
      if (bufferTimerRef.current) {
        clearTimeout(bufferTimerRef.current);
        bufferTimerRef.current = null;
      }
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('playing', handleCanPlay);
    };
  }, [enabled, master, videoRef]);

  // Handle loop restart: seek video back to videoStart
  useEffect(() => {
    if (!enabled) return;

    return master.onLoopRestart(() => {
      const video = videoRef.current;
      if (video) {
        video.currentTime = Math.max(0, videoStart);
      }
    });
  }, [enabled, master, videoRef, videoStart]);

  // Handle play / pause transitions & drift correction loop
  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    // Detect play start: set internal anchor if not provided
    if (master.isPlaying && !wasPlayingRef.current) {
      internalAnchorRef.current = master.getTime();
      video.play().catch(() => {});
      setStatus('playing');
    } else if (!master.isPlaying && wasPlayingRef.current) {
      video.pause();
      setStatus((cur) => (cur === 'buffering' ? cur : 'idle'));
    }

    wasPlayingRef.current = master.isPlaying;

    if (!master.isPlaying) return;

    let animId: number;
    const currentAnchor = anchor !== undefined && anchor !== null ? anchor : internalAnchorRef.current;
    const masterType = syncMasterKind(master.source);

    const checkDrift = () => {
      const v = videoRef.current;
      if (!v || !master.isPlaying || !enabled) return;

      const musicTime = master.getTime();
      const expected = expectedVideoTime(musicTime, currentAnchor, videoStart);
      const actual = v.currentTime;

      const correction = decideCorrection(expected, actual, master.rate, masterType);

      if (correction.type === 'seek') {
        v.currentTime = Math.max(0, correction.to);
      } else if (correction.type === 'nudge') {
        v.playbackRate = correction.rate;
      } else {
        v.playbackRate = master.rate;
      }

      animId = requestAnimationFrame(checkDrift);
    };

    animId = requestAnimationFrame(checkDrift);

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [anchor, enabled, master, master.isPlaying, master.rate, master.source, videoRef, videoStart]);

  return {
    muted,
    setMuted,
    status,
  };
}
