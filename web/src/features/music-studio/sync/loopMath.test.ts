import { describe, it, expect } from 'vitest';
import { shouldRestartLoop } from './loopMath';

describe('loopMath: shouldRestartLoop', () => {
  it('checks when loop has explicit end > start', () => {
    expect(shouldRestartLoop(45.99, { start: 30, end: 46 }, 200)).toBe(false);
    expect(shouldRestartLoop(46.0, { start: 30, end: 46 }, 200)).toBe(true);
    expect(shouldRestartLoop(47.2, { start: 30, end: 46 }, 200)).toBe(true);
  });

  it('handles end=0 falling back to total duration', () => {
    expect(shouldRestartLoop(10, { start: 30, end: 0 }, 200)).toBe(false);
    expect(shouldRestartLoop(199.9, { start: 30, end: 0 }, 200)).toBe(false);
    expect(shouldRestartLoop(200, { start: 30, end: 0 }, 200)).toBe(true);
    expect(shouldRestartLoop(201, { start: 30, end: 0 }, 200)).toBe(true);
  });

  it('returns false when loop is null or invalid range', () => {
    expect(shouldRestartLoop(50, null, 200)).toBe(false);
    expect(shouldRestartLoop(50, { start: 60, end: 50 }, 200)).toBe(false);
  });
});
