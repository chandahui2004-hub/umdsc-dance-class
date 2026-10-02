import { useEffect, useRef, useState } from "react";

/** The part of SoundCloud's Widget API the Studio uses. Times are in milliseconds. */
export type SoundCloudHandle = {
  play: () => void;
  pause: () => void;
  seekTo: (ms: number) => void;
  getPosition: (callback: (ms: number) => void) => void;
  getDuration: (callback: (ms: number) => void) => void;
};

type SoundCloudWidget = SoundCloudHandle & {
  bind: (event: string, callback: (data?: unknown) => void) => void;
};

declare global {
  interface Window {
    SC?: {
      Widget: ((frame: HTMLIFrameElement) => SoundCloudWidget) & {
        Events: Record<"READY" | "PLAY" | "PAUSE" | "FINISH" | "ERROR", string>;
      };
    };
  }
}

type SoundCloudPlayerProps = {
  /** Canonical https://soundcloud.com/{user}/{track}, or null before a SoundCloud song is chosen. */
  url: string | null;
  isVisible: boolean;
  /** Phones can block play on an untouched iframe: ask for one tap on the visible player. */
  needsTap?: boolean;
  onReady: (handle: SoundCloudHandle) => void;
  onPlayState: (playing: boolean) => void;
};

let apiPromise: Promise<void> | null = null;

function loadSoundCloudApi(): Promise<void> {
  if (window.SC?.Widget) {
    return Promise.resolve();
  }

  apiPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://w.soundcloud.com/player/api.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      apiPromise = null; // allow a retry on the next song
      reject(new Error("SoundCloud could not be loaded"));
    };
    document.head.appendChild(script);
  });

  return apiPromise;
}

function widgetSrc(url: string): string {
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=false&visual=false&show_comments=false`;
}

export function SoundCloudPlayer({ url, isVisible, needsTap = false, onReady, onPlayState }: SoundCloudPlayerProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const callbacksRef = useRef({ onReady, onPlayState });
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    callbacksRef.current = { onReady, onPlayState };
  }, [onReady, onPlayState]);

  useEffect(() => {
    setErrorMessage("");
    if (!url) {
      return;
    }

    let cancelled = false;
    void loadSoundCloudApi()
      .then(() => {
        const frame = frameRef.current;
        if (cancelled || !frame || !window.SC) {
          return;
        }

        const widget = window.SC.Widget(frame);
        const events = window.SC.Widget.Events;
        widget.bind(events.READY, () => callbacksRef.current.onReady(widget));
        widget.bind(events.PLAY, () => callbacksRef.current.onPlayState(true));
        widget.bind(events.PAUSE, () => callbacksRef.current.onPlayState(false));
        widget.bind(events.FINISH, () => callbacksRef.current.onPlayState(false));
        widget.bind(events.ERROR, () => setErrorMessage("This song is no longer available."));
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage("SoundCloud could not be loaded. Check your connection and try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url) {
    return null;
  }

  return (
    <div
      data-testid="soundcloud-player-box"
      className={
        isVisible
          ? "space-y-2"
          : "pointer-events-none fixed left-0 top-0 h-[166px] w-[300px] overflow-hidden opacity-0"
      }
      aria-hidden={isVisible ? undefined : "true"}
    >
      {/* A new song gets a new iframe, so the widget is bound fresh each time. */}
      <iframe
        key={url}
        ref={frameRef}
        title="SoundCloud player"
        src={widgetSrc(url)}
        allow="autoplay"
        className="h-[166px] w-full border-2 border-[var(--outline)] bg-black shadow-[4px_4px_0_var(--shadow-hard)]"
      />
      {errorMessage ? (
        <p role="alert" className="text-xs font-mono font-bold text-[var(--neon-pink)]">
          {errorMessage}
        </p>
      ) : needsTap && isVisible ? (
        <p className="text-xs font-mono font-bold text-[var(--neon-gold)]">Tap the SoundCloud player once to start</p>
      ) : null}
    </div>
  );
}
