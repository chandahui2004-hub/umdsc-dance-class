import { describe, it, expect } from 'vitest';
import { expectedVideoTime, decideCorrection, syncMasterKind } from './syncMath';

describe('syncMath', () => {
  it('calculates expectedVideoTime correctly', () => {
    // expectedVideoTime(musicTime, musicAnchor, videoStart) = videoStart + (musicTime - musicAnchor)
    expect(expectedVideoTime(50, 45, 12)).toBe(17);
    expect(expectedVideoTime(10, 10, 5)).toBe(5);
    expect(expectedVideoTime(15, 10, 5)).toBe(10);
  });

  describe('decideCorrection', () => {
    it('returns seek for audio master when drift > 0.2s', () => {
      // actual = 17.3, expected = 17 => drift = 0.3 > 0.2
      expect(decideCorrection(17, 17.3, 1, 'audio')).toEqual({ type: 'seek', to: 17 });
    });

    it('returns nudge with slower rate for audio master when actual is slightly ahead (0.05 < d <= 0.2)', () => {
      // actual = 17.1, expected = 17 => drift = 0.1, d > 0 => rate = 1 * 0.95 = 0.95
      expect(decideCorrection(17, 17.1, 1, 'audio')).toEqual({ type: 'nudge', rate: 0.95 });
    });

    it('returns nudge with faster rate for audio master when actual is slightly behind (-0.2 <= d < -0.05)', () => {
      // actual = 16.9, expected = 17 => drift = -0.1, d < 0 => rate = 1 * 1.05 = 1.05
      expect(decideCorrection(17, 16.9, 1, 'audio')).toEqual({ type: 'nudge', rate: 1.05 });
    });

    it('returns none when drift is within tolerance (|d| <= 0.05)', () => {
      // actual = 17.03, expected = 17 => drift = 0.03 <= 0.05
      expect(decideCorrection(17, 17.03, 1, 'audio')).toEqual({ type: 'none' });
    });

    it('uses 0.35s seek threshold for youtube master', () => {
      // actual = 17.3, expected = 17 => drift = 0.3 <= 0.35 for youtube => nudge rate 0.95
      expect(decideCorrection(17, 17.3, 1, 'youtube')).toEqual({ type: 'nudge', rate: 0.95 });

      // actual = 17.4, expected = 17 => drift = 0.4 > 0.35 for youtube => seek to 17
      expect(decideCorrection(17, 17.4, 1, 'youtube')).toEqual({ type: 'seek', to: 17 });
    });

    it('scales nudge relative to baseRate', () => {
      // baseRate 0.8 * 0.95 = 0.76
      const res = decideCorrection(10, 10.1, 0.8, 'audio');
      expect(res.type).toBe('nudge');
      if (res.type === 'nudge') {
        expect(res.rate).toBeCloseTo(0.76, 3);
      }

      // baseRate 1.5 * 1.05 = 1.575
      const resFast = decideCorrection(10, 9.9, 1.5, 'audio');
      expect(resFast.type).toBe('nudge');
      if (resFast.type === 'nudge') {
        expect(resFast.rate).toBeCloseTo(1.575, 3);
      }
    });
  });

  describe('syncMasterKind', () => {
    it.each([
      ['youtube', 'youtube'],
      ['soundcloud', 'youtube'], // an embedded player's clock is as coarse as YouTube's, so it gets the looser tolerance
      ['drive', 'audio'],
      ['file', 'audio'],
      [null, 'audio']
    ] as const)('maps the %s source to the %s tolerance', (source, expected) => {
      expect(syncMasterKind(source)).toBe(expected);
    });
  });
});
