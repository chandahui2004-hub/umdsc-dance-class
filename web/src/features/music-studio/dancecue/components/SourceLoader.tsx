// Ported from DanceCue by JzeAnson (https://github.com/JzeAnson/DanceCue), used with permission.

import { useState } from "react";
import { getYouTubeVideoId } from "../utils/youtube";

type SourceLoaderProps = {
  activeSource: "file" | "drive" | "youtube" | null;
  onFileSelected: (file: File) => void;
  onYouTubeSelected: (videoId: string) => void;
};

const panelClass =
  "border-2 border-[var(--outline)] bg-[var(--night-2)] p-4 shadow-[4px_4px_0_var(--shadow-hard)]";
const inputClass =
  "min-h-12 min-w-0 border-2 border-[var(--outline)] bg-[var(--night-1)] px-4 text-xs font-mono text-[var(--text-1)] shadow-[inset_2px_2px_0_var(--shadow-hard)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--neon-cyan)]";
const buttonClass =
  "min-h-12 shrink-0 border-2 border-[var(--outline)] bg-[var(--neon-cyan)] px-4 text-xs font-mono font-bold text-black shadow-[2px_2px_0_var(--shadow-hard)] transition hover:bg-[var(--neon-cyan)]/90 active:translate-x-[1px] active:translate-y-[1px]";
const fileButtonClass =
  "inline-flex min-h-12 cursor-pointer items-center justify-center border-2 border-[var(--outline)] bg-[var(--neon-gold)] px-4 text-xs font-mono font-bold text-black shadow-[2px_2px_0_var(--shadow-hard)] transition hover:bg-[var(--neon-gold)]/90 active:translate-x-[1px] active:translate-y-[1px]";
const tabClass =
  "min-h-10 border-2 px-3 text-xs font-mono font-bold transition active:translate-x-[1px] active:translate-y-[1px]";

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
          <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--neon-cyan)]">
            Track
          </p>
          <h2 className="mt-1 text-lg font-black font-header text-[var(--neon-gold)]">Choose music source</h2>
        </div>
        <span className="border-2 border-[var(--outline)] bg-[var(--night-1)] px-3 py-1 font-mono text-xs font-bold uppercase text-[var(--neon-green)] shadow-[2px_2px_0_var(--shadow-hard)]">
          {activeSource ?? "empty"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 border-2 border-[var(--outline)] bg-[var(--night-1)] p-1 shadow-[2px_2px_0_var(--shadow-hard)]">
        <button
          className={`${tabClass} ${
            sourceMode === "file"
              ? "border-[var(--neon-gold)] bg-[var(--neon-gold)] text-black shadow-[1px_1px_0_var(--shadow-hard)]"
              : "border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[var(--night-2)] hover:text-[var(--text-1)]"
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
              ? "border-[var(--neon-cyan)] bg-[var(--neon-cyan)] text-black shadow-[1px_1px_0_var(--shadow-hard)]"
              : "border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[var(--night-2)] hover:text-[var(--text-1)]"
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
          <p className="px-1 text-xs font-bold text-[var(--neon-pink)] font-mono" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </form>
    </section>
  );
}
