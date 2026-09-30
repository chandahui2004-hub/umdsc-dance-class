// Ported from DanceCue by JzeAnson (https://github.com/JzeAnson/DanceCue), used with permission.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioPlayer } from "./components/AudioPlayer";
import { MarkerList } from "./components/MarkerList";
import { SourceLoader } from "./components/SourceLoader";
import { VoiceCommandPanel } from "./components/VoiceCommandPanel";
import { YouTubePlayer } from "./components/YouTubePlayer";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import { useSpeechCommands } from "./hooks/useSpeechCommands";
import type { Marker } from "./types/marker";
import {
  deleteStoredAudioFile,
  readStoredAudioFile,
  saveStoredAudioFile,
} from "./utils/storedAudioFile";
import "./dancecue.css";

const starterMarkers: Marker[] = [
  { id: "intro", name: "Intro", time: 0, endTime: 30 },
  { id: "verse", name: "Verse", time: 30, endTime: 60 },
  { id: "chorus", name: "Chorus", time: 60, endTime: 90 },
  { id: "bridge", name: "Bridge", time: 90, endTime: 120 },
];

const sessionStorageKey = "dancecue:session:v1";

type StoredDanceCueSession = {
  activeSource: "file" | "youtube" | null;
  fileName: string | null;
  fileTime: number;
  markers: Marker[];
  playbackRate: number;
  updatedAt: number;
  youtubeTime: number;
  youtubeVideoId: string | null;
};

function isStoredMarker(value: unknown): value is Marker {
  if (!value || typeof value !== "object") {
    return false;
  }

  const marker = value as Marker;

  return (
    typeof marker.id === "string" &&
    typeof marker.name === "string" &&
    typeof marker.time === "number" &&
    typeof marker.endTime === "number"
  );
}

function readStoredSession(): StoredDanceCueSession | null {
  const storedValue = window.localStorage.getItem(sessionStorageKey);

  if (!storedValue) {
    return null;
  }

  try {
    const session = JSON.parse(storedValue) as Partial<StoredDanceCueSession>;

    return {
      activeSource:
        session.activeSource === "file" || session.activeSource === "youtube"
          ? session.activeSource
          : null,
      fileName: typeof session.fileName === "string" && session.fileName ? session.fileName : null,
      fileTime: typeof session.fileTime === "number" ? session.fileTime : 0,
      markers: Array.isArray(session.markers) && session.markers.every(isStoredMarker)
        ? session.markers
        : starterMarkers,
      playbackRate: typeof session.playbackRate === "number" ? session.playbackRate : 1,
      updatedAt: typeof session.updatedAt === "number" ? session.updatedAt : Date.now(),
      youtubeTime: typeof session.youtubeTime === "number" ? session.youtubeTime : 0,
      youtubeVideoId:
        typeof session.youtubeVideoId === "string" && session.youtubeVideoId
          ? session.youtubeVideoId
          : null,
    };
  } catch {
    return null;
  }
}

function hasStoredMusicSource() {
  const storedSession = readStoredSession();

  return storedSession?.activeSource === "youtube" && Boolean(storedSession.youtubeVideoId);
}

function makeMarkerId(name: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
}

export function DanceCueApp() {
  const [storedSession] = useState(() => readStoredSession());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingRestoreTimeRef = useRef(
    storedSession?.activeSource === "file"
      ? storedSession.fileTime
      : storedSession?.youtubeTime ?? 0,
  );
  const hasRestoredPlaybackRef = useRef(false);
  const firstYouTubeRefreshTimeoutRef = useRef<number | null>(null);
  const [isRestoringStoredSource, setIsRestoringStoredSource] = useState(
    () => storedSession?.activeSource !== null && Boolean(storedSession?.activeSource),
  );
  const [markerDraftRange, setMarkerDraftRange] = useState<{ start: number; end: number } | null>(
    null,
  );
  const [isMarkerDraftActive, setIsMarkerDraftActive] = useState(false);
  const [markers, setMarkers] = useState<Marker[]>(() => storedSession?.markers ?? starterMarkers);
  const [localFileName, setLocalFileName] = useState<string | null>(
    () => storedSession?.fileName ?? null,
  );
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(() =>
    storedSession?.activeSource === "youtube" ? storedSession.youtubeVideoId : null,
  );

  const sortedMarkers = useMemo(
    () => [...markers].sort((a, b) => a.time - b.time),
    [markers],
  );

  const player = useAudioPlayer({ audioRef, markers: sortedMarkers });

  useEffect(() => {
    if (!storedSession?.activeSource) {
      return;
    }

    if (storedSession.activeSource === "file") {
      let isCanceled = false;

      readStoredAudioFile()
        .then((file) => {
          if (isCanceled) {
            return;
          }

          if (file) {
            setLocalFileName(file.name);
            player.loadFile(file);
          }

          setIsRestoringStoredSource(false);
        })
        .catch(() => {
          if (!isCanceled) {
            setIsRestoringStoredSource(false);
          }
        });

      return () => {
        isCanceled = true;
      };
    }

    if (!storedSession.youtubeVideoId) {
      setIsRestoringStoredSource(false);
      return;
    }

    player.loadYouTube(storedSession.youtubeVideoId);
    setIsRestoringStoredSource(false);
  }, [player.loadFile, player.loadYouTube, storedSession]);

  useEffect(() => {
    if (
      hasRestoredPlaybackRef.current ||
      !player.activeSource ||
      player.duration <= 0 ||
      pendingRestoreTimeRef.current <= 0
    ) {
      return;
    }

    hasRestoredPlaybackRef.current = true;
    player.setSpeed(storedSession?.playbackRate ?? 1);
    player.seekTo(Math.min(pendingRestoreTimeRef.current, player.duration));
  }, [player.activeSource, player.duration, player.seekTo, player.setSpeed, storedSession]);

  useEffect(() => {
    if (isRestoringStoredSource) {
      return;
    }

    const session: StoredDanceCueSession = {
      activeSource:
        player.activeSource === "file" || player.activeSource === "youtube"
          ? player.activeSource
          : null,
      fileName: player.activeSource === "file" ? localFileName : null,
      fileTime: player.activeSource === "file" ? player.currentTime : 0,
      markers,
      playbackRate: player.playbackRate,
      updatedAt: Date.now(),
      youtubeTime: player.activeSource === "youtube" ? player.currentTime : 0,
      youtubeVideoId: player.activeSource === "youtube" ? youtubeVideoId : null,
    };

    window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
  }, [
    isRestoringStoredSource,
    markers,
    localFileName,
    player.activeSource,
    player.currentTime,
    player.playbackRate,
    youtubeVideoId,
  ]);

  useEffect(() => {
    return () => {
      if (firstYouTubeRefreshTimeoutRef.current !== null) {
        window.clearTimeout(firstYouTubeRefreshTimeoutRef.current);
      }
    };
  }, []);

  const addMarker = (name: string, startTime: number, endTime: number) => {
    setMarkers((currentMarkers) => [
      ...currentMarkers,
      {
        id: makeMarkerId(name),
        endTime,
        name,
        time: startTime,
      },
    ]);
    setMarkerDraftRange(null);
    setIsMarkerDraftActive(false);
  };

  const removeMarker = (markerId: string) => {
    setMarkers((currentMarkers) => currentMarkers.filter((marker) => marker.id !== markerId));
  };

  const updateMarker = (updatedMarker: Marker) => {
    setMarkers((currentMarkers) =>
      currentMarkers.map((marker) => (marker.id === updatedMarker.id ? updatedMarker : marker)),
    );
  };

  const activateMarkerDraft = (range?: { start: number; end: number }) => {
    if (range) {
      setMarkerDraftRange(range);
    }

    setIsMarkerDraftActive(true);
  };

  const cancelMarkerDraft = () => {
    setMarkerDraftRange(null);
    setIsMarkerDraftActive(false);
  };

  const updateMarkerDraftRange = useCallback((range: { start: number; end: number } | null) => {
    setMarkerDraftRange(range);
  }, []);

  const speech = useSpeechCommands({
    markers: sortedMarkers,
    onForward: (seconds) => player.skipBy(seconds),
    onJumpToMarker: player.jumpToMarker,
    onLoopMarker: player.startLoop,
    onPause: player.pause,
    onPlay: () => {
      void player.play();
    },
    onRestart: player.restart,
    onRewind: (seconds) => player.skipBy(-seconds),
    onStopLoop: player.stopLoop,
  });

  return (
    <div className="dancecue-root w-full">
      <main className="min-h-screen bg-[#101114] px-4 py-5 font-sans text-zinc-100 sm:px-6">
        <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-[430px] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#17181c] shadow-2xl shadow-black/40">
          <section className="border-b border-white/10 bg-gradient-to-br from-fuchsia-500/18 via-[#1b1d24] to-cyan-400/14 px-5 pb-5 pt-6">
            <div>
              <div>
                <p className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.16em] text-cyan-200">
                  DanceCue
                </p>
                <h1 className="mt-2 whitespace-nowrap text-2xl font-black leading-tight tracking-normal text-white">
                  Rehearse in motion
                </h1>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-zinc-300">
              Load a track, mark rehearsal sections, and control jumps or loops with short voice
              commands while you stay in motion.
            </p>
          </section>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            <SourceLoader
              activeSource={player.activeSource}
              onFileSelected={(file) => {
                setYoutubeVideoId(null);
                setLocalFileName(file.name);
                void saveStoredAudioFile(file).catch(() => undefined);
                player.loadFile(file);
              }}
              onYouTubeSelected={(videoId) => {
                const shouldRefreshAfterFirstYouTube = !hasStoredMusicSource();

                setYoutubeVideoId(videoId);
                setLocalFileName(null);
                void deleteStoredAudioFile().catch(() => undefined);
                player.loadYouTube(videoId);

                if (
                  shouldRefreshAfterFirstYouTube &&
                  firstYouTubeRefreshTimeoutRef.current === null
                ) {
                  firstYouTubeRefreshTimeoutRef.current = window.setTimeout(() => {
                    window.location.reload();
                  }, 2000);
                }
              }}
            />

            <YouTubePlayer
              isVisible={player.activeSource === "youtube"}
              videoId={youtubeVideoId}
              onReady={player.attachYouTubePlayer}
              onStateChange={player.handleYouTubeStateChange}
            />

            <AudioPlayer
              audioRef={audioRef}
              currentTime={player.currentTime}
              duration={player.duration}
              isMarkerDraftActive={isMarkerDraftActive}
              isLooping={player.isLooping}
              isPlaying={player.isPlaying}
              onLoopToggle={player.toggleLoop}
              markerDraftRange={markerDraftRange}
              onPause={player.pause}
              onPlay={() => {
                void player.play();
              }}
              onMarkerDraftChange={updateMarkerDraftRange}
              onSeek={player.seekTo}
              onSkip={player.skipBy}
              onSpeedChange={player.setSpeed}
              playbackRate={player.playbackRate}
            />

            <MarkerList
              activeMarker={player.activeMarker}
              currentTime={player.currentTime}
              duration={player.duration}
              markerDraftRange={markerDraftRange}
              markerPlaybackMarker={player.markerPlaybackMarker}
              isPlaying={player.isPlaying}
              loopMarker={player.loopMarker}
              markers={sortedMarkers}
              onActivateMarkerDraft={activateMarkerDraft}
              onAddMarker={addMarker}
              onCancelMarkerDraft={cancelMarkerDraft}
              onJumpToMarker={player.jumpToMarker}
              onRemoveMarker={removeMarker}
              onStartLoop={player.startLoop}
              onStopLoop={player.stopLoop}
              onUpdateMarker={updateMarker}
            />

            <VoiceCommandPanel
              isListening={speech.isListening}
              isSupported={speech.isSupported}
              lastTranscript={speech.lastTranscript}
              status={speech.status}
              onSimulateCommand={(command) => {
                speech.runCommand(command);
              }}
              onToggleListening={speech.toggleListening}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default DanceCueApp;
