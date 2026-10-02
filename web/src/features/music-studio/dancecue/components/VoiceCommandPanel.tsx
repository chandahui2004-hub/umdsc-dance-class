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
  "min-h-11 border-2 border-[var(--outline)] bg-[var(--night-3)] px-3 text-xs font-mono font-bold text-[var(--text-1)] shadow-[2px_2px_0_var(--shadow-hard)] transition hover:bg-[var(--violet-2)] active:translate-x-[1px] active:translate-y-[1px]";
const panelClass = "border-2 border-[var(--outline)] bg-[var(--night-2)] p-4 shadow-[4px_4px_0_var(--shadow-hard)]";
const eyebrowClass = "font-mono text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--neon-cyan)]";

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
          <h2 className="mt-1 text-lg font-black font-header text-[var(--neon-gold)]">Voice Cue</h2>
        </div>
        <span
          className={`size-3 border border-black ${
            isListening ? "animate-pulse bg-[var(--neon-green)] shadow-[0_0_8px_var(--neon-green)]" : "bg-[var(--night-3)]"
          }`}
        />
      </div>

      <div className="mt-5 flex items-center gap-3 border-2 border-[var(--outline)] bg-[var(--night-1)] p-3 shadow-[2px_2px_0_var(--shadow-hard)]">
        <button
          aria-label={isListening ? "Stop listening" : "Start listening"}
          className={`grid size-12 shrink-0 place-items-center border-2 border-[var(--outline)] text-black shadow-[2px_2px_0_var(--shadow-hard)] transition disabled:cursor-not-allowed disabled:opacity-45 ${
            isListening ? "animate-pulse bg-[var(--neon-pink)] shadow-[0_0_8px_var(--neon-pink)] text-white" : "bg-[var(--neon-cyan)] hover:bg-[var(--neon-cyan)]/90"
          }`}
          disabled={!isSupported}
          title={isListening ? "Stop listening" : "Start listening"}
          type="button"
          onClick={onToggleListening}
        >
          <MicrophoneIcon />
        </button>
        <div className="min-w-0">
          <span className="block truncate font-mono text-sm font-bold text-[var(--text-1)]">{status}</span>
          <small className="block truncate font-mono text-xs leading-5 text-[var(--text-muted)]">
            {lastTranscript ? `Heard: "${lastTranscript}"` : "Press the microphone to start voice control."}
          </small>
        </div>
      </div>

      {!isSupported && (
        <p className="mt-3 text-xs font-mono leading-relaxed text-[var(--text-muted)]">
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
