// Ported from DanceCue by JzeAnson (https://github.com/JzeAnson/DanceCue), used with permission.

import { useEffect, useRef, useState } from "react";

export type YouTubePlayerHandle = {
  cueVideoById: (videoId: string) => void;
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlaybackRate: () => number;
  loadVideoById: (videoId: string) => void;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setPlaybackRate: (speed: number) => void;
};

type YouTubePlayerConstructor = new (
  element: HTMLElement,
  options: {
    events: {
      onError: (event: { data: number }) => void;
      onReady: (event: { target: YouTubePlayerHandle }) => void;
      onStateChange: (event: { data: number }) => void;
    };
    height: string;
    playerVars: Record<string, number>;
    videoId?: string;
    width: string;
  },
) => YouTubePlayerHandle;

declare global {
  interface Window {
    YT?: {
      Player: YouTubePlayerConstructor;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YouTubePlayerProps = {
  isVisible: boolean;
  onReady: (player: YouTubePlayerHandle) => void;
  onStateChange: (state: number) => void;
  videoId: string | null;
  /** Phones can block play on an untouched iframe: ask for one tap on the visible player. */
  needsTap?: boolean;
};

const youtubePlayerStates = {
  cued: 5,
  ended: 0,
  paused: 2,
  playing: 1,
};

let apiReadyPromise: Promise<void> | null = null;

function preconnectYouTube() {
  if (typeof document === 'undefined') return;
  const origins = ['https://www.youtube.com', 'https://s.ytimg.com', 'https://googlevideo.com'];
  origins.forEach((origin) => {
    if (!document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = origin;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    }
  });
}

function loadYouTubeApi() {
  preconnectYouTube();

  if (window.YT?.Player) {
    return Promise.resolve();
  }

  apiReadyPromise ??= new Promise<void>((resolve) => {
    const previousReadyHandler = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousReadyHandler?.();
      resolve();
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return apiReadyPromise;
}

export function YouTubePlayer({
  isVisible,
  onReady,
  onStateChange,
  videoId,
  needsTap = false,
}: YouTubePlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const latestVideoIdRef = useRef(videoId);
  // playerRef is set only once YouTube reports onReady, so nothing calls a half-built player.
  const playerRef = useRef<YouTubePlayerHandle | null>(null);
  const createdRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isApiLoading, setIsApiLoading] = useState(false);

  useEffect(() => {
    preconnectYouTube();
  }, []);

  useEffect(() => {
    latestVideoIdRef.current = videoId;
  }, [videoId]);

  useEffect(() => {
    let isMounted = true;

    setIsApiLoading(true);
    setErrorMessage("");

    void loadYouTubeApi().then(() => {
      if (!isMounted || !containerRef.current || createdRef.current || !window.YT?.Player) {
        return;
      }
      createdRef.current = true;

      // The YouTube API throws "Invalid video id" for { videoId: undefined }, so the key is
      // left out until a track is chosen (it is cued from onReady via latestVideoIdRef).
      const initialVideoId = latestVideoIdRef.current;

      new window.YT.Player(containerRef.current, {
        height: "200",
        width: "200",
        ...(initialVideoId ? { videoId: initialVideoId } : {}),
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: (event) => {
            playerRef.current = event.target;
            setIsApiLoading(false);
            setErrorMessage("");
            try {
              (event.target as any).setPlaybackQuality?.('small');
            } catch {
              // Ignore quality errors on restricted streams
            }
            onReady(event.target);

            if (latestVideoIdRef.current) {
              event.target.cueVideoById(latestVideoIdRef.current);
            }
          },
          onError: () => {
            setIsApiLoading(false);
            setErrorMessage("This YouTube link cannot be played here.");
          },
          onStateChange: (event) => {
            if (
              event.data === youtubePlayerStates.cued ||
              event.data === youtubePlayerStates.playing ||
              event.data === youtubePlayerStates.paused ||
              event.data === youtubePlayerStates.ended
            ) {
              setIsApiLoading(false);
              setErrorMessage("");
            }

            onStateChange(event.data);
          },
        },
      });
    });

    return () => {
      isMounted = false;
    };
  }, [onReady, onStateChange, videoId]);

  useEffect(() => {
    if (!videoId || !isApiLoading) {
      return;
    }

    const retryTimeoutId = window.setTimeout(() => {
      playerRef.current?.cueVideoById(videoId);
    }, 8000);

    const failedTimeoutId = window.setTimeout(() => {
      setIsApiLoading(false);
      setErrorMessage("Still loading. Check your internet connection, ad blocker, or try another link.");
    }, 20000);

    return () => {
      window.clearTimeout(retryTimeoutId);
      window.clearTimeout(failedTimeoutId);
    };
  }, [isApiLoading, videoId]);

  useEffect(() => {
    if (videoId && playerRef.current) {
      setIsApiLoading(false);
      setErrorMessage("");
      playerRef.current.cueVideoById(videoId);
      try {
        (playerRef.current as any).setPlaybackQuality?.('small');
      } catch {
        // Ignore quality errors
      }
    }
  }, [videoId]);

  useEffect(() => {
    if (!videoId || !isApiLoading) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const duration = playerRef.current?.getDuration() ?? 0;

      if (duration > 0) {
        setIsApiLoading(false);
        setErrorMessage("");
      }
    }, 500);

    return () => window.clearInterval(intervalId);
  }, [isApiLoading, videoId]);

  const statusMessage = errorMessage
    ? errorMessage
    : isApiLoading
      ? "Loading YouTube audio..."
      : "YouTube audio ready";

  return (
    <>
      {/* One mounted box: the YouTube script builds the player into it once. It stays on screen while
          YouTube is the active source (200x200 is YouTube's minimum player size) so a dancer can tap it. */}
      <div
        data-testid="youtube-player-box"
        className={
          isVisible
            ? "mx-auto h-[200px] w-[200px] overflow-hidden border-2 border-black bg-black [&_iframe]:h-full [&_iframe]:w-full"
            : "pointer-events-none fixed left-0 top-0 h-[200px] w-[200px] overflow-hidden opacity-0"
        }
        aria-hidden={isVisible ? undefined : "true"}
      >
        <div ref={containerRef} className="h-[200px] w-[200px]" />
      </div>
      {isVisible ? (
        <section
          className=" border border-white/10 bg-black/25 px-4 py-3 shadow-lg shadow-black/20"
          aria-label="YouTube audio status"
          role={errorMessage ? "alert" : "status"}
        >
          <div className="flex items-center gap-3">
            {isApiLoading && !errorMessage ? (
              <span
                className="size-3 shrink-0 animate-pulse rounded-full bg-cyan-200 shadow-[0_0_16px_rgba(103,232,249,0.8)]"
                aria-hidden="true"
              />
            ) : (
              <span
                className={`size-3 shrink-0 rounded-full ${
                  errorMessage ? "bg-rose-300" : "bg-emerald-300"
                }`}
                aria-hidden="true"
              />
            )}
            <p
              className={`text-xs font-bold ${
                errorMessage ? "text-rose-200" : "text-zinc-300"
              }`}
            >
              {statusMessage}
            </p>
          </div>
          {needsTap ? (
            <p className="mt-2 text-xs font-bold text-yellow-200">
              Tap the YouTube player once to start
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
