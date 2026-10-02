import { describe, it, expect } from 'vitest';
import { detectVideoCodec } from './videoCodec';

const MB = 1024 * 1024;

/** `size` zero bytes with ASCII `marker` written at `offset`. */
function fileWith(size: number, marker: string, offset: number): Blob {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode(marker), offset);
  return new Blob([bytes]);
}

describe('detectVideoCodec', () => {
  it('finds an hvc1 box in the tail (moov at the end, like the owner\'s uploads)', async () => {
    expect(await detectVideoCodec(fileWith(6 * MB, 'hvc1', 6 * MB - 100))).toBe('hevc');
  });

  it('treats hev1 as HEVC too', async () => {
    expect(await detectVideoCodec(fileWith(6 * MB, 'hev1', 100))).toBe('hevc');
  });

  it('finds an avc1 box in the head', async () => {
    expect(await detectVideoCodec(fileWith(6 * MB, 'avc1', 200))).toBe('h264');
  });

  it('is unknown when neither codec box is present', async () => {
    expect(await detectVideoCodec(fileWith(6 * MB, 'zzzz', 200))).toBe('unknown');
  });

  it('reads at most 8 MB of a huge file', async () => {
    const sliced: number[] = [];
    const huge = {
      size: 2 * 1024 * MB,
      slice(start: number, end: number) {
        sliced.push(end - start);
        return new Blob([new Uint8Array(end - start)]);
      }
    } as unknown as Blob;

    await detectVideoCodec(huge);

    expect(sliced.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(8 * MB);
  });
});
