import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compressVideo, defaultUploadMode, FAST_UPLOAD_MAX_BYTES } from './videoCompressor';

vi.mock('../google/videoCodec', () => ({
  detectVideoCodec: vi.fn()
}));

const mockExecute = vi.fn();
const mockInit = vi.fn();
const mockGetDisplayWidth = vi.fn();
const mockGetDisplayHeight = vi.fn();
const mockGetPrimaryVideoTrack = vi.fn();
const mockGetPrimaryAudioTrack = vi.fn();

let mockDiscardedTracks: any[] = [];
// Validity per init call, in order; missing entries mean valid.
let mockValidity: boolean[] = [];
let mockBuffer: ArrayBuffer | null = new Uint8Array([1, 2, 3, 4]).buffer;

vi.mock('mediabunny', () => {
  return {
    ALL_FORMATS: {},
    BlobSource: vi.fn(),
    Input: vi.fn().mockImplementation(() => ({
      getPrimaryVideoTrack: mockGetPrimaryVideoTrack,
      getPrimaryAudioTrack: mockGetPrimaryAudioTrack
    })),
    Output: vi.fn().mockImplementation(() => ({})),
    Mp4OutputFormat: vi.fn(),
    BufferTarget: vi.fn().mockImplementation(function (this: any) {
      this.buffer = mockBuffer;
    }),
    Conversion: {
      init: mockInit.mockImplementation(async (opts: any) => {
        const isValid = mockValidity.length ? mockValidity.shift() : true;
        return {
          isValid,
          discardedTracks: isValid ? mockDiscardedTracks : [{ track: { type: 'video' }, reason: 'no_encodable_target_codec' }],
          execute: async () => {
            if (opts.output?.target) {
              opts.output.target.buffer = mockBuffer;
            }
            return mockExecute();
          }
        };
      })
    }
  };
});

describe('videoCompressor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDiscardedTracks = [];
    mockValidity = [];
    mockBuffer = new Uint8Array([1, 2, 3, 4]).buffer;
    mockExecute.mockResolvedValue(undefined);
    (window as any).VideoEncoder = vi.fn();
    mockGetDisplayWidth.mockResolvedValue(1920);
    mockGetDisplayHeight.mockResolvedValue(1080);
    mockGetPrimaryVideoTrack.mockResolvedValue({
      getDisplayWidth: mockGetDisplayWidth,
      getDisplayHeight: mockGetDisplayHeight
    });
    mockGetPrimaryAudioTrack.mockResolvedValue({ type: 'audio' });
  });

  it('falls back to original file if VideoEncoder is unsupported', async () => {
    delete (window as any).VideoEncoder;
    const file = new File([new Uint8Array(100)], 'dance.mp4', { type: 'video/mp4' });

    const result = await compressVideo(file);
    expect(result.compressed).toBe(false);
    expect(result.reason).toBe('unsupported');
    expect(result.file).toBe(file);
  });

  it('skips compression if file is already H.264 MP4 and < 60 MB', async () => {
    const { detectVideoCodec } = await import('../google/videoCodec');
    vi.mocked(detectVideoCodec).mockResolvedValue('h264');

    const file = new File([new Uint8Array(1024 * 1024 * 10)], 'dance.mp4', { type: 'video/mp4' }); // 10MB
    const result = await compressVideo(file);

    expect(result.compressed).toBe(false);
    expect(result.reason).toBe('already_h264_under_60mb');
    expect(result.file).toBe(file);
    expect(mockInit).not.toHaveBeenCalled();
  });

  it('compresses video when file is > 60 MB or not H.264', async () => {
    const { detectVideoCodec } = await import('../google/videoCodec');
    vi.mocked(detectVideoCodec).mockResolvedValue('hevc');

    const file = new File([new Uint8Array(1024 * 1024 * 5)], 'dance.mov', { type: 'video/quicktime' });
    const progressUpdates: number[] = [];

    const result = await compressVideo(file, {
      onProgress: (p) => progressUpdates.push(p)
    });

    expect(result.compressed).toBe(true);
    expect(result.file.name).toBe('dance.mp4');
    expect(result.file.type).toBe('video/mp4');
    expect(mockInit).toHaveBeenCalled();

    const initArgs = mockInit.mock.calls[0][0];
    // Scaled down to max 1280px long side
    expect(initArgs.video.width).toBe(1280);
    expect(initArgs.video.height).toBe(720);
    expect(initArgs.video.codec).toBe('avc');
    expect(initArgs.video.bitrate).toBe(2500000);
  });

  it('falls back to original file if conversion throws', async () => {
    const { detectVideoCodec } = await import('../google/videoCodec');
    vi.mocked(detectVideoCodec).mockResolvedValue('unknown');

    mockExecute.mockRejectedValue(new Error('WebCodecs out of memory'));

    const file = new File([new Uint8Array(100)], 'corrupt.mp4', { type: 'video/mp4' });
    const result = await compressVideo(file);

    expect(result.compressed).toBe(false);
    expect(result.reason).toBe('conversion_failed');
    expect(result.error).toContain('WebCodecs out of memory');
    expect(result.file).toBe(file);
  });

  it('falls back to original file if audio track is discarded', async () => {
    const { detectVideoCodec } = await import('../google/videoCodec');
    vi.mocked(detectVideoCodec).mockResolvedValue('unknown');

    mockDiscardedTracks = [{ track: { type: 'audio' }, reason: 'unsupported_audio_codec' }];

    const file = new File([new Uint8Array(100)], 'dance.mp4', { type: 'video/mp4' });
    const result = await compressVideo(file);

    expect(result.compressed).toBe(false);
    expect(result.reason).toBe('conversion_failed');
    expect(result.error).toContain('Audio track could not be preserved');
    expect(result.file).toBe(file);
  });

  it('falls back to original file if compressed file is larger than original', async () => {
    const { detectVideoCodec } = await import('../google/videoCodec');
    vi.mocked(detectVideoCodec).mockResolvedValue('unknown');

    // mockBuffer has size 4; file has size 2
    mockBuffer = new Uint8Array([1, 2, 3, 4]).buffer;
    const file = new File([new Uint8Array([1, 2])], 'small.mov', { type: 'video/quicktime' });

    const result = await compressVideo(file);

    expect(result.compressed).toBe(false);
    expect(result.reason).toBe('larger_than_original');
    expect(result.file).toBe(file);
  });

  describe('choosing Fast (original) or Smaller (compress)', () => {
    const MB = 1024 * 1024;

    it('the cut-off is 150 MB', () => {
      expect(FAST_UPLOAD_MAX_BYTES).toBe(150 * MB);
    });

    it('picks Fast when every video is 150 MB or less', () => {
      expect(defaultUploadMode([{ size: 20 * MB }, { size: 150 * MB }])).toBe('original');
    });

    it('picks Smaller when any video is over 150 MB', () => {
      expect(defaultUploadMode([{ size: 20 * MB }, { size: 150 * MB + 1 }])).toBe('compress');
    });

    it('picks Fast when nothing is chosen yet', () => {
      expect(defaultUploadMode([])).toBe('original');
    });
  });

  describe('hardware video chip', () => {
    it('asks for hardware acceleration first', async () => {
      const file = new File([new Uint8Array(100)], 'big.mov', { type: 'video/quicktime' });
      await compressVideo(file);
      expect(mockInit.mock.calls[0][0].video.hardwareAcceleration).toBe('prefer-hardware');
    });

    it('retries without the hardware hint when the phone refuses it', async () => {
      mockValidity = [false, true];
      const file = new File([new Uint8Array(100)], 'big.mov', { type: 'video/quicktime' });

      const result = await compressVideo(file);

      expect(mockInit).toHaveBeenCalledTimes(2);
      expect(mockInit.mock.calls[1][0].video.hardwareAcceleration).toBe('no-preference');
      expect(result.reason).not.toBe('conversion_failed');
    });

    it('falls back to the original when neither setting works', async () => {
      mockValidity = [false, false];
      const file = new File([new Uint8Array(100)], 'big.mov', { type: 'video/quicktime' });

      const result = await compressVideo(file);

      expect(result.compressed).toBe(false);
      expect(result.reason).toBe('conversion_failed');
      expect(result.file).toBe(file);
    });
  });
});
