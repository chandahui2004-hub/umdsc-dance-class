/**
 * Determines whether the player has reached or passed the end of the active loop
 * and should seek back to loop.start.
 */
export function shouldRestartLoop(
  time: number,
  loop: { start: number; end: number } | null,
  duration: number
): boolean {
  if (!loop) {
    return false;
  }

  const effectiveEnd = loop.end || duration;
  if (effectiveEnd <= loop.start) {
    return false;
  }

  return time >= effectiveEnd;
}
