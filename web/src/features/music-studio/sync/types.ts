export interface Master {
  getTime(): number;
  isPlaying: boolean;
  rate: number;
  source: 'file' | 'drive' | 'youtube' | null;
  onLoopRestart(fn: (loopStart: number) => void): () => void;
  pauseForBuffer(): void;
  resumeFromBuffer(): void;
}
