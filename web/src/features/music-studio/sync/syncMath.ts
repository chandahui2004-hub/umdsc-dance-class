/**
 * Pure synchronization calculations between audio/YouTube master and class video.
 * Spec §11.5 & Task 31
 */

export function expectedVideoTime(
  musicTime: number,
  musicAnchor: number,
  videoStart: number
): number {
  return videoStart + (musicTime - musicAnchor);
}

export type Correction =
  | { type: 'none' }
  | { type: 'seek'; to: number }
  | { type: 'nudge'; rate: number };

/**
 * Drift control deciding whether to hard-seek, nudge playbackRate, or do nothing.
 *
 * - |drift| > seekThreshold (0.35s for youtube, 0.2s for audio): hard seek to expected
 * - 0.05s < |drift| <= seekThreshold: nudge playbackRate by ±5% (0.95x if ahead, 1.05x if behind)
 * - |drift| <= 0.05s: none
 */
export function decideCorrection(
  expected: number,
  actual: number,
  baseRate: number,
  master: 'audio' | 'youtube'
): Correction {
  const d = actual - expected;
  const absD = Math.abs(d);
  const seekThreshold = master === 'youtube' ? 0.35 : 0.2;

  if (absD > seekThreshold) {
    return { type: 'seek', to: expected };
  }

  if (absD > 0.05) {
    const factor = d > 0 ? 0.95 : 1.05;
    // Keep precision clean
    const rate = Math.round(baseRate * factor * 10000) / 10000;
    return { type: 'nudge', rate };
  }

  return { type: 'none' };
}

/**
 * Which drift tolerance a music source gets. YouTube and SoundCloud play inside an embedded player whose
 * clock is read through the browser and is coarser than an audio element's, so both get the looser one.
 */
export function syncMasterKind(source: 'file' | 'drive' | 'youtube' | 'soundcloud' | null): 'audio' | 'youtube' {
  return source === 'youtube' || source === 'soundcloud' ? 'youtube' : 'audio';
}
