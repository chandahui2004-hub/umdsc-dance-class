export interface Timer {
  /** Records the ms since the previous mark (or since creation) under `label`; repeats add up. */
  mark(label: string): void;
  result(): Record<string, number>;
}

export function createTimer(now: () => number = Date.now): Timer {
  let last = now();
  const marks: Record<string, number> = {};
  return {
    mark(label) {
      const t = now();
      marks[label] = (marks[label] ?? 0) + (t - last);
      last = t;
    },
    result: () => ({ ...marks })
  };
}

/** Writes timings to the Apps Script execution log; does nothing outside Apps Script (tests, node). */
export function logTimings(action: string, timings: Record<string, number>): void {
  if (typeof Utilities !== 'undefined') {
    console.log(JSON.stringify({ action, timings }));
  }
}
