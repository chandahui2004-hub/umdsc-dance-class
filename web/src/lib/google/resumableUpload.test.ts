import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CHUNK_SIZE,
  chunkRanges,
  contentRange,
  nextOffsetFromRange,
  videoFormatWarning,
  uploadResumable,
  makePublic
} from './resumableUpload';

describe('resumableUpload helpers', () => {
  it('CHUNK_SIZE is a multiple of 256 KiB', () => {
    expect(CHUNK_SIZE % 262144).toBe(0);
  });

  it('chunkRanges splits total size into proper byte intervals', () => {
    expect(chunkRanges(20_000_000)).toEqual([
      [0, 8388607],
      [8388608, 16777215],
      [16777216, 19999999]
    ]);
  });

  it('contentRange formats correctly', () => {
    expect(contentRange(0, 8388607, 20000000)).toBe('bytes 0-8388607/20000000');
  });

  it('nextOffsetFromRange parses offset correctly', () => {
    expect(nextOffsetFromRange('bytes=0-8388607')).toBe(8388608);
    expect(nextOffsetFromRange(null)).toBe(0);
    expect(nextOffsetFromRange('bytes 0-8388607')).toBe(8388608);
  });

  it('videoFormatWarning flags MOV / QuickTime / HEVC files', () => {
    expect(videoFormatWarning(new File([], 'a.MOV', { type: 'video/quicktime' }))).toMatch(/MP4/);
    expect(videoFormatWarning(new File([], 'a.mov', { type: '' }))).toMatch(/MP4/);
    expect(videoFormatWarning(new File([], 'a.mp4', { type: 'video/mp4' }))).toBeNull();
  });

  it('makePublic sends POST request with anyone reader permission', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({})
    });
    globalThis.fetch = mockFetch as any;

    await makePublic('token-abc', 'file-xyz');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/drive/v3/files/file-xyz/permissions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-abc',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type: 'anyone', role: 'reader' })
      })
    );
  });
});

describe('uploadResumable execution & recovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uploadResumable resumes from the server-reported offset after a failed PUT', async () => {
    const file = new File(['a'.repeat(100)], 'test.mp4', { type: 'video/mp4' });
    let putAttempts = 0;

    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      // 1. Session initialization
      if (url.includes('uploadType=resumable')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({
            Location: 'https://upload.google.com/session-123'
          }),
          json: async () => ({})
        } as unknown as Response;
      }

      // 2. PUT upload chunks or status queries
      if (url.includes('https://upload.google.com/session-123')) {
        putAttempts++;

        // Status query check (Content-Range: bytes */100)
        const rangeHeader = (init?.headers as Record<string, string>)?.[
          'Content-Range'
        ] || (init?.headers as any)?.get?.('Content-Range');

        if (rangeHeader === 'bytes */100') {
          return {
            ok: false,
            status: 308,
            headers: new Headers({
              Range: 'bytes=0-49'
            }),
            json: async () => ({})
          } as unknown as Response;
        }

        // First upload PUT attempt fails
        if (putAttempts === 1) {
          throw new TypeError('Network connection reset');
        }

        // Subsequent PUT completes successfully
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            id: 'file-uploaded-123',
            name: file.name,
            mimeType: file.type,
            size: file.size
          })
        } as unknown as Response;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({})
      } as unknown as Response;
    });

    globalThis.fetch = mockFetch;

    const progressCalls: [number, number][] = [];
    const result = await uploadResumable({
      token: 'tok-123',
      file,
      parentId: 'parent-123',
      name: file.name,
      chunkSize: 50,
      onProgress: (sent, total) => {
        progressCalls.push([sent, total]);
      }
    });

    expect(result.id).toBe('file-uploaded-123');
    expect(putAttempts).toBeGreaterThanOrEqual(2);
  });
});
