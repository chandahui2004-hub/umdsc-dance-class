import { describe, it, expect } from 'vitest';
import { applyPersonMask, personConfidence } from './removeBackground';

describe('applyPersonMask', () => {
  const pixels = (n: number) => new Uint8ClampedArray(n * 4).fill(200);

  it('keeps the person opaque, clears the background, and feathers the edge', () => {
    const px = pixels(4);
    applyPersonMask(px, 4, 1, new Float32Array([1, 0, 0.5, 0.2]), 4, 1);
    expect([px[3], px[7], px[11], px[15]]).toEqual([255, 0, 128, 0]);
    expect(px[0]).toBe(200); // colours are untouched
  });

  it('stretches a smaller mask over the photo', () => {
    const px = pixels(4); // 2 x 2 photo
    applyPersonMask(px, 2, 2, new Float32Array([1]), 1, 1);
    expect([px[3], px[7], px[11], px[15]]).toEqual([255, 255, 255, 255]);
  });
});

describe('personConfidence', () => {
  it('uses a single person mask as is', () => {
    expect(Array.from(personConfidence([new Float32Array([0.9, 0.1])]))).toEqual([
      expect.closeTo(0.9),
      expect.closeTo(0.1)
    ]);
  });

  it('inverts the background mask of a multi-class model', () => {
    expect(Array.from(personConfidence([new Float32Array([0.9, 0.1]), new Float32Array([0, 0])]))).toEqual([
      expect.closeTo(0.1),
      expect.closeTo(0.9)
    ]);
  });
});
