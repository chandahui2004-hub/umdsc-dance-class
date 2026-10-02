// Ported from DanceCue by JzeAnson (https://github.com/JzeAnson/DanceCue), used with permission.

type VoiceCommandPanelProps = {
  isListening: boolean;
  isSupported: boolean;
  lastTranscript: string;
  onSimulateCommand: (command: string) => void;
  onToggleListening: () => void;
  status: string;
};

const sampleCommands = [
  "Play",
  "Pause",
  "Go to Chorus",
  "Loop Chorus",
  "Stop loop",
  "Back 5 seconds",
  "Forward 10 seconds",
  "Restart",
];

const buttonClass =
  "min-h-11 rounded-full border border-white/10 bg-white/[0.08] px-3 text-sm font-bold text-zinc-100 transition hover:border-cyan-200/35 hover:bg-cyan-200/10 active:translate-y-px";
const panelClass = " border border-white/10 bg-white/[0.06] p-4 shadow-lg shadow-black/20";
const eyebrowClass = "font-mono text-[0.68rem] font-bold uppercase tracking-[0.16em] text-cyan-200";

function MicrophoneIcon() {
  return (
    <svg aria-hidden="true" className="size-6" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v5a3.5 3.5 0 0 0 3.5 3.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M5 10.5a7 7 0 0 0 14 0M12 17.5V21M9 21h6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function VoiceCommandPanel({
  isListening,
  isSupported,
  lastTranscript,
  onSimulateCommand,
  onToggleListening,
  status,
}: VoiceCommandPanelProps) {
  return (
    <section className={panelClass} aria-label="Voice commands">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={eyebrowClass}>Hands-free</p>
          <h2 className="mt-1 text-xl font-black text-white">Voice Cue</h2>
        </div>
        <span
          className={`size-4 rounded-full ${
            isListening ? "animate-pulse bg-cyan-300 shadow-[0_0_0_8px_rgba(103,232,249,0.14)]" : "bg-zinc-600"
          }`}
        />
      </div>

      <div className="mt-5 flex items-center gap-3 border border-white/10 bg-black/25 p-3">
        <button
          aria-label={isListening ? "Stop listening" : "Start listening"}
          className={`grid size-14 shrink-0 place-items-center rounded-full border border-white/20 bg-gradient-to-r from-fuchsia-500 to-cyan-400 text-white shadow-lg shadow-fuchsia-950/40 transition hover:from-fuchsia-400 hover:to-cyan-300 disabled:cursor-not-allowed disabled:opacity-45 ${
            isListening ? "animate-pulse" : ""
          }`}
          disabled={!isSupported}
          title={isListening ? "Stop listening" : "Start listening"}
          type="button"
          onClick={onToggleListening}
        >
          <MicrophoneIcon />
        </button>
        <div className="min-w-0">
          <span className="block truncate font-black text-white">{status}</span>
          <small className="block truncate text-sm leading-5 text-zinc-400">
            {lastTranscript ? `Heard: "${lastTranscript}"` : "Press the microphone to start voice control."}
          </small>
        </div>
      </div>

      {!isSupported && (
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Speech recognition is not available in this browser. Use the demo buttons below.
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {sampleCommands.map((command) => (
          <button
            className={buttonClass}
            key={command}
            type="button"
            onClick={() => onSimulateCommand(command)}
          >
            {command}
          </button>
        ))}
      </div>
    </section>
  );
}
