// Ported from DanceCue by JzeAnson (https://github.com/JzeAnson/DanceCue), used with permission.

import { useState } from "react";
import { getYouTubeVideoId } from "../utils/youtube";

type SourceLoaderProps = {
  activeSource: "file" | "drive" | "youtube" | null;
  onFileSelected: (file: File) => void;
  onYouTubeSelected: (videoId: string) => void;
};

const panelClass =
  "rounded-3xl border border-white/15 bg-white/[0.08] p-4 shadow-[0_0_32px_rgba(235,178,255,0.12),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl";
const inputClass =
  "min-h-12 min-w-0 rounded-lg border border-white/10 bg-white/[0.07] px-4 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] outline-none placeholder:text-zinc-500 focus:border-cyan-200/55 focus:bg-white/[0.1] focus:ring-4 focus:ring-cyan-300/10";
const buttonClass =
  "min-h-12 shrink-0 rounded-lg border border-cyan-200/25 bg-cyan-200/12 px-4 text-sm font-black text-cyan-50 transition hover:border-cyan-100/50 hover:bg-cyan-200/18 active:translate-y-px";
const fileButtonClass =
  "inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-fuchsia-200/25 bg-fuchsia-200/12 px-4 text-sm font-black text-fuchsia-50 transition hover:border-fuchsia-100/50 hover:bg-fuchsia-200/18 active:translate-y-px";
const tabClass =
  "min-h-10 rounded-lg border px-3 text-sm font-black transition active:translate-y-px";

export function SourceLoader({
  activeSource,
  onFileSelected,
  onYouTubeSelected,
}: SourceLoaderProps) {
  const [sourceMode, setSourceMode] = useState<"file" | "youtube">("file");
  const [errorMessage, setErrorMessage] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");

  return (
    <section className={panelClass} aria-label="Track source">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.16em] text-cyan-100">
            Track
          </p>
          <h2 className="mt-1 text-xl font-black text-white">Choose music source</h2>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 font-mono text-xs font-bold uppercase text-zinc-300">
          {activeSource ?? "empty"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/20 p-1">
        <button
          className={`${tabClass} ${
            sourceMode === "file"
              ? "border-fuchsia-100/50 bg-fuchsia-200/18 text-fuchsia-50"
              : "border-transparent bg-transparent text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
          }`}
          type="button"
          aria-pressed={sourceMode === "file"}
          onClick={() => setSourceMode("file")}
        >
          MP3 file
        </button>
        <button
          className={`${tabClass} ${
            sourceMode === "youtube"
              ? "border-cyan-100/50 bg-cyan-200/18 text-cyan-50"
              : "border-transparent bg-transparent text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
          }`}
          type="button"
          aria-pressed={sourceMode === "youtube"}
          onClick={() => setSourceMode("youtube")}
        >
          YouTube link
        </button>
      </div>

      <div className={`mt-4 ${sourceMode === "file" ? "block" : "hidden"}`}>
        <label className={fileButtonClass}>
          <input
            className="absolute size-0 opacity-0"
            accept=".mp3,audio/mpeg,audio/mp3,audio/*"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                onFileSelected(file);
              }
            }}
          />
          Load MP3 or audio file
        </label>
      </div>

      <form
        className={`mt-4 gap-2 ${sourceMode === "youtube" ? "grid" : "hidden"}`}
        onSubmit={(event) => {
          event.preventDefault();
          const videoId = getYouTubeVideoId(youtubeUrl);

          if (!videoId) {
            setErrorMessage("Paste a valid YouTube link.");
            return;
          }

          setErrorMessage("");
          onYouTubeSelected(videoId);
        }}
      >
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            className={inputClass}
            aria-label="YouTube URL"
            placeholder="Paste YouTube link"
            value={youtubeUrl}
            onChange={(event) => {
              setYoutubeUrl(event.target.value);
              setErrorMessage("");
            }}
          />
          <button className={buttonClass} type="submit">
            Use YouTube
          </button>
        </div>
        {errorMessage ? (
          <p className="px-1 text-xs font-bold text-rose-200" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </form>
    </section>
  );
}
