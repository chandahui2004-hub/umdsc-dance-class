import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { YouTubePlayerHandle } from "../components/YouTubePlayer";
import type { SoundCloudHandle } from "../components/SoundCloudPlayer";
import type { Marker } from "../types/marker";
import type { Master } from "../../sync/types";
import { shouldRestartLoop } from "../../sync/loopMath";

type UseAudioPlayerOptions = {
  audioRef: RefObject<HTMLAudioElement | null>;
  markers: Marker[];
};

export type PlayerSource = "file" | "drive" | "youtube" | "soundcloud" | null;

const youtubeStates = {
  ended: 0,
  playing: 1,
  paused: 2,
  cued: 5,
};

export function useAudioPlayer({ audioRef, markers }: UseAudioPlayerOptions) {
  const [activeSource, setActiveSource] = useState<PlayerSource>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [effectiveRate, setEffectiveRate] = useState(1);
  const [loopMarkerId, setLoopMarkerId] = useState<string | null>(null);
  const [markerPlaybackMarkerId, setMarkerPlaybackMarkerId] = useState<string | null>(null);
  const markerPlaybackEndRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const pendingYouTubeVideoIdRef = useRef<string | null>(null);
  // YouTube drops a playVideo() that arrives before the cued track has loaded, so a Play pressed
  // too early is remembered and re-sent when the player reports the track as cued.
  const youtubePlayRequestedRef = useRef(false);
  // Phones block playVideo() on an iframe the dancer never touched: when YouTube has not started
  // 3 s after Play, the UI asks for one tap on the visible player.
  const [needsTap, setNeedsTap] = useState(false);
  const tapTimerRef = useRef<number | null>(null);

  const clearTapPrompt = useCallback(() => {
    if (tapTimerRef.current !== null) {
      window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }
    setNeedsTap(false);
  }, []);

  useEffect(
    () => () => {
      if (tapTimerRef.current !== null) window.clearTimeout(tapTimerRef.current);
    },
    []
  );
  const youtubePlayerRef = useRef<YouTubePlayerHandle | null>(null);
  // The SoundCloud widget reports its position asynchronously, so the last answer is kept here and
  // read by the loop and sync code that need the time at once. Seconds, like the other sources.
  const soundcloudPlayerRef = useRef<SoundCloudHandle | null>(null);
  const soundcloudPositionRef = useRef(0);
  const loopRestartListenersRef = useRef<Set<(loopStart: number) => void>>(new Set());

  const notifyLoopRestart = useCallback((startSec: number) => {
    loopRestartListenersRef.current.forEach((listener) => {
      try {
        listener(startSec);
      } catch (err) {
        console.error("Error in onLoopRestart listener", err);
      }
    });
  }, []);

  const sortedMarkers = useMemo(
    () => [...markers].sort((a, b) => a.time - b.time),
    [markers],
  );

  const loopMarker = sortedMarkers.find((marker) => marker.id === loopMarkerId) ?? null;
  const markerPlaybackMarker =
    sortedMarkers.find((marker) => marker.id === markerPlaybackMarkerId) ?? null;

  const activeMarker = useMemo(() => {
    return sortedMarkers.reduce<Marker | null>(
      (active, marker) =>
        marker.time <= currentTime && currentTime < marker.endTime ? marker : active,
      null,
    );
  }, [currentTime, sortedMarkers]);

  const loadFile = useCallback(
    (file: File) => {
      const audio = audioRef.current;

      if (!audio) {
        return;
      }

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }

      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      youtubePlayerRef.current?.pauseVideo();
      soundcloudPlayerRef.current?.pause();
      audio.src = url;
      audio.loop = false;
      audio.playbackRate = 1;
      audio.load();
      setActiveSource("file");
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      setIsLooping(false);
      setPlaybackRate(1);
      setEffectiveRate(1);
      setLoopMarkerId(null);
      setMarkerPlaybackMarkerId(null);
      markerPlaybackEndRef.current = null;
    },
    [audioRef],
  );

  const loadUrl = useCallback(
    (url: string, _label?: string) => {
      const audio = audioRef.current;

      if (!audio) {
        return;
      }

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }

      youtubePlayerRef.current?.pauseVideo();
      soundcloudPlayerRef.current?.pause();
      audio.src = url;
      audio.loop = false;
      audio.playbackRate = playbackRate;
      audio.load();
      setActiveSource("drive");
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      setIsLooping(false);
      setEffectiveRate(playbackRate);
      setLoopMarkerId(null);
      setMarkerPlaybackMarkerId(null);
      markerPlaybackEndRef.current = null;
    },
    [audioRef, playbackRate],
  );

  const loadYouTube = useCallback(
    (videoId: string) => {
      const audio = audioRef.current;

      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }

      soundcloudPlayerRef.current?.pause();
      pendingYouTubeVideoIdRef.current = videoId;
      youtubePlayRequestedRef.current = false;
      clearTapPrompt();
      setActiveSource("youtube");
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      setIsLooping(false);
      setPlaybackRate(1);
      setLoopMarkerId(null);
      setMarkerPlaybackMarkerId(null);
      markerPlaybackEndRef.current = null;

      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.cueVideoById(videoId);
        youtubePlayerRef.current.setPlaybackRate(1);
      }
    },
    [audioRef, clearTapPrompt],
  );

  const attachYouTubePlayer = useCallback((player: YouTubePlayerHandle) => {
    youtubePlayerRef.current = player;

    if (pendingYouTubeVideoIdRef.current) {
      player.cueVideoById(pendingYouTubeVideoIdRef.current);
    }
  }, []);

  const handleYouTubeStateChange = useCallback((state: number) => {
    setIsPlaying(state === youtubeStates.playing);

    if (state === youtubeStates.cued && youtubePlayRequestedRef.current) {
      youtubePlayerRef.current?.playVideo();
    } else if (
      state === youtubeStates.playing ||
      state === youtubeStates.paused ||
      state === youtubeStates.ended
    ) {
      youtubePlayRequestedRef.current = false;
    }

    if (state === youtubeStates.playing) {
      clearTapPrompt();
    }

    if (state === youtubeStates.ended) {
      setIsPlaying(false);
    }
  }, [clearTapPrompt]);

  const loadSoundCloud = useCallback(
    (_url: string) => {
      const audio = audioRef.current;

      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }

      youtubePlayerRef.current?.pauseVideo();
      youtubePlayRequestedRef.current = false;
      clearTapPrompt();
      soundcloudPositionRef.current = 0;
      setActiveSource("soundcloud");
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      setIsLooping(false);
      setPlaybackRate(1);
      setEffectiveRate(1);
      setLoopMarkerId(null);
      setMarkerPlaybackMarkerId(null);
      markerPlaybackEndRef.current = null;
    },
    [audioRef, clearTapPrompt],
  );

  const attachSoundCloudPlayer = useCallback((player: SoundCloudHandle) => {
    soundcloudPlayerRef.current = player;
  }, []);

  const handleSoundCloudPlayState = useCallback(
    (playing: boolean) => {
      setIsPlaying(playing);
      if (playing) {
        clearTapPrompt();
      }
    },
    [clearTapPrompt],
  );

  const startPlayback = useCallback(async () => {
    if (activeSource === "youtube") {
      youtubePlayRequestedRef.current = true;
      youtubePlayerRef.current?.playVideo();
      if (tapTimerRef.current !== null) window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = window.setTimeout(() => setNeedsTap(true), 3000);
      return;
    }

    if (activeSource === "soundcloud") {
      soundcloudPlayerRef.current?.play();
      if (tapTimerRef.current !== null) window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = window.setTimeout(() => setNeedsTap(true), 3000);
      return;
    }

    const audio = audioRef.current;

    if (!audio || !audio.src) {
      return;
    }

    await audio.play();
  }, [activeSource, audioRef]);

  const play = useCallback(async () => {
    markerPlaybackEndRef.current = null;
    setMarkerPlaybackMarkerId(null);
    await startPlayback();
  }, [startPlayback]);

  const pause = useCallback(() => {
    if (activeSource === "youtube") {
      youtubePlayRequestedRef.current = false;
      clearTapPrompt();
      youtubePlayerRef.current?.pauseVideo();
      return;
    }

    if (activeSource === "soundcloud") {
      clearTapPrompt();
      soundcloudPlayerRef.current?.pause();
      return;
    }

    audioRef.current?.pause();
  }, [activeSource, audioRef, clearTapPrompt]);

  const restart = useCallback(() => {
    markerPlaybackEndRef.current = null;
    setMarkerPlaybackMarkerId(null);

    if (activeSource === "youtube") {
      youtubePlayerRef.current?.seekTo(0, true);
      youtubePlayerRef.current?.playVideo();
      setCurrentTime(0);
      return;
    }

    if (activeSource === "soundcloud") {
      soundcloudPlayerRef.current?.seekTo(0);
      soundcloudPlayerRef.current?.play();
      soundcloudPositionRef.current = 0;
      setCurrentTime(0);
      return;
    }

    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.currentTime = 0;
    void audio.play();
  }, [activeSource, audioRef]);

  const seekTo = useCallback(
    (time: number) => {
      if (activeSource === "youtube") {
        const youtubeDuration = youtubePlayerRef.current?.getDuration() ?? duration;
        const safeTime = Math.min(Math.max(time, 0), youtubeDuration || time);
        youtubePlayerRef.current?.seekTo(safeTime, true);
        setCurrentTime(safeTime);
        return;
      }

      if (activeSource === "soundcloud") {
        const safeTime = Math.min(Math.max(time, 0), duration || time);
        soundcloudPlayerRef.current?.seekTo(safeTime * 1000);
        soundcloudPositionRef.current = safeTime;
        setCurrentTime(safeTime);
        return;
      }

      const audio = audioRef.current;

      if (!audio) {
        return;
      }

      const safeTime = Math.min(Math.max(time, 0), duration || time);
      audio.currentTime = safeTime;
      setCurrentTime(safeTime);
    },
    [activeSource, audioRef, duration],
  );

  const skipBy = useCallback(
    (seconds: number) => {
      const sourceCurrentTime =
        activeSource === "youtube"
          ? youtubePlayerRef.current?.getCurrentTime() ?? currentTime
          : activeSource === "soundcloud"
            ? soundcloudPositionRef.current
            : audioRef.current?.currentTime ?? currentTime;

      seekTo(sourceCurrentTime + seconds);
    },
    [activeSource, audioRef, currentTime, seekTo],
  );

  const jumpToMarker = useCallback(
    (marker: Marker) => {
      markerPlaybackEndRef.current = marker.endTime;
      setMarkerPlaybackMarkerId(marker.id);
      seekTo(marker.time);
      void startPlayback();
    },
    [seekTo, startPlayback],
  );

  const startLoop = useCallback(
    (marker: Marker) => {
      markerPlaybackEndRef.current = null;
      setMarkerPlaybackMarkerId(null);

      if (audioRef.current) {
        audioRef.current.loop = false;
      }

      setIsLooping(false);
      setLoopMarkerId(marker.id);
      seekTo(marker.time);
      void startPlayback();
    },
    [audioRef, seekTo, startPlayback],
  );

  const stopLoop = useCallback(() => {
    setLoopMarkerId(null);
  }, []);

  const toggleLoop = useCallback(() => {
    setIsLooping((currentValue) => {
      const nextValue = !currentValue;
      markerPlaybackEndRef.current = null;
      setMarkerPlaybackMarkerId(null);

      if (audioRef.current && activeSource !== "youtube" && activeSource !== "soundcloud") {
        audioRef.current.loop = nextValue;
      }

      if (nextValue) {
        setLoopMarkerId(null);
      }

      return nextValue;
    });
  }, [activeSource, audioRef]);

  const setSpeed = useCallback(
    (speed: number) => {
      if (activeSource === "soundcloud") {
        return; // the SoundCloud player has no speed control; the UI says so
      }

      setPlaybackRate(speed);

      if (activeSource === "youtube") {
        youtubePlayerRef.current?.setPlaybackRate(speed);
        const actual = youtubePlayerRef.current?.getPlaybackRate() ?? speed;
        setEffectiveRate(actual);
        return;
      }

      if (audioRef.current) {
        audioRef.current.playbackRate = speed;
        setEffectiveRate(speed);
      }
    },
    [activeSource, audioRef],
  );

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  // Sync state and duration from YouTube player
  useEffect(() => {
    if (activeSource !== "youtube") {
      return;
    }

    const intervalId = window.setInterval(() => {
      const player = youtubePlayerRef.current;

      if (!player) {
        return;
      }

      const nextCurrentTime = player.getCurrentTime() || 0;
      const nextDuration = player.getDuration() || 0;
      setCurrentTime(nextCurrentTime);
      setDuration(nextDuration);

      const actualRate = player.getPlaybackRate();
      if (actualRate && actualRate !== effectiveRate) {
        setEffectiveRate(actualRate);
      }
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [activeSource, effectiveRate]);

  // SoundCloud only answers asynchronously: refresh the cached position and length often enough for loops
  useEffect(() => {
    if (activeSource !== "soundcloud") {
      return;
    }

    const intervalId = window.setInterval(() => {
      const player = soundcloudPlayerRef.current;

      if (!player) {
        return;
      }

      player.getPosition((ms) => {
        soundcloudPositionRef.current = ms / 1000;
        setCurrentTime(ms / 1000);
      });
      player.getDuration((ms) => {
        if (ms > 0) setDuration(ms / 1000);
      });
    }, 100);

    return () => window.clearInterval(intervalId);
  }, [activeSource]);

  // High-precision rAF loop while playing for loop restart and marker boundary checking
  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    let rafId: number;

    const tick = () => {
      const audio = audioRef.current;
      const yt = youtubePlayerRef.current;
      const sc = soundcloudPlayerRef.current;

      const now =
        activeSource === "youtube"
          ? yt?.getCurrentTime() ?? currentTime
          : activeSource === "soundcloud"
            ? soundcloudPositionRef.current
            : audio?.currentTime ?? currentTime;

      setCurrentTime(now);

      if (loopMarker) {
        if (shouldRestartLoop(now, { start: loopMarker.time, end: loopMarker.endTime }, duration)) {
          if (activeSource === "youtube") {
            yt?.seekTo(loopMarker.time, true);
          } else if (activeSource === "soundcloud") {
            sc?.seekTo(loopMarker.time * 1000);
            soundcloudPositionRef.current = loopMarker.time;
          } else if (audio) {
            audio.currentTime = loopMarker.time;
          }
          setCurrentTime(loopMarker.time);
          notifyLoopRestart(loopMarker.time);
        }
      } else if (markerPlaybackEndRef.current !== null) {
        if (now >= markerPlaybackEndRef.current) {
          const end = markerPlaybackEndRef.current;
          if (activeSource === "youtube") {
            yt?.pauseVideo();
            yt?.seekTo(end, true);
          } else if (activeSource === "soundcloud") {
            sc?.pause();
            sc?.seekTo(end * 1000);
            soundcloudPositionRef.current = end;
          } else if (audio) {
            audio.pause();
            audio.currentTime = end;
          }
          setCurrentTime(end);
          setIsPlaying(false);
          setMarkerPlaybackMarkerId(null);
          markerPlaybackEndRef.current = null;
        }
      } else if (isLooping && duration > 0 && now >= duration - 0.2) {
        if (activeSource === "youtube") {
          yt?.seekTo(0, true);
          yt?.playVideo();
        } else if (activeSource === "soundcloud") {
          sc?.seekTo(0);
          sc?.play();
          soundcloudPositionRef.current = 0;
        } else if (audio) {
          audio.currentTime = 0;
          void audio.play();
        }
        setCurrentTime(0);
        notifyLoopRestart(0);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, activeSource, loopMarker, isLooping, duration, audioRef, notifyLoopRestart, currentTime]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const handleLoadedMetadata = () => setDuration(audio.duration || 0);
    const handleTimeUpdate = () => {
      if (activeSource === "youtube" || activeSource === "soundcloud") {
        return;
      }

      const nextTime = audio.currentTime;
      setCurrentTime(nextTime);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [activeSource, audioRef]);

  const master: Master = useMemo(
    () => ({
      getTime: () => {
        if (activeSource === "youtube") {
          return youtubePlayerRef.current?.getCurrentTime() ?? currentTime;
        }
        if (activeSource === "soundcloud") {
          return soundcloudPositionRef.current;
        }
        return audioRef.current?.currentTime ?? currentTime;
      },
      isPlaying,
      rate: effectiveRate,
      source: activeSource,
      onLoopRestart: (fn: (loopStart: number) => void) => {
        loopRestartListenersRef.current.add(fn);
        return () => {
          loopRestartListenersRef.current.delete(fn);
        };
      },
      pauseForBuffer: () => {
        if (activeSource === "youtube") {
          youtubePlayerRef.current?.pauseVideo();
        } else if (activeSource === "soundcloud") {
          soundcloudPlayerRef.current?.pause();
        } else {
          audioRef.current?.pause();
        }
      },
      resumeFromBuffer: () => {
        if (isPlaying) {
          if (activeSource === "youtube") {
            youtubePlayerRef.current?.playVideo();
          } else if (activeSource === "soundcloud") {
            soundcloudPlayerRef.current?.play();
          } else {
            void audioRef.current?.play();
          }
        }
      },
    }),
    [activeSource, audioRef, currentTime, effectiveRate, isPlaying],
  );

  return {
    activeMarker,
    activeSource,
    attachYouTubePlayer,
    attachSoundCloudPlayer,
    currentTime,
    duration,
    effectiveRate,
    handleYouTubeStateChange,
    handleSoundCloudPlayState,
    needsTap,
    speedDisabled: activeSource === "soundcloud",
    isLooping,
    isPlaying,
    playbackRate,
    loopMarker,
    markerPlaybackMarker,
    master,
    jumpToMarker,
    loadFile,
    loadUrl,
    loadYouTube,
    loadSoundCloud,
    pause,
    play,
    restart,
    seekTo,
    skipBy,
    startLoop,
    stopLoop,
    toggleLoop,
    setSpeed,
  };
}
