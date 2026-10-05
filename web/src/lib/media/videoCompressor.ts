import { detectVideoCodec } from '../google/videoCodec';

export interface CompressionResult {
  file: File;
  compressed: boolean;
  reason?: string;
  originalSize?: number;
  newSize?: number;
  error?: string;
}

/** Videos up to this size upload as the original by default; compressing them takes longer than it saves. */
export const FAST_UPLOAD_MAX_BYTES = 150 * 1024 * 1024;

/** 'original' = Fast: upload the file as recorded. 'compress' = Smaller: shrink to 720p first. */
export type UploadMode = 'original' | 'compress';

export function defaultUploadMode(files: { size: number }[]): UploadMode {
  return files.some(f => f.size > FAST_UPLOAD_MAX_BYTES) ? 'compress' : 'original';
}

export interface CompressOptions {
  onProgress?: (percent: number) => void;
  onStatus?: (status: string) => void;
}

/**
 * Compresses video using WebCodecs (via mediabunny lazy-loaded) into H.264 MP4:
 * - Max 1280px long side (even pixel dimensions)
 * - Max 30 fps, ~2.5 Mbps bitrate
 * - Copies AAC audio track when possible, never drops audio silently
 * - Skips compression if file is already H.264 MP4 and < 60 MB
 * - Falls back to original file if VideoEncoder is unsupported or conversion throws
 */
export async function compressVideo(
  file: File,
  options?: CompressOptions
): Promise<CompressionResult> {
  // 1. Check WebCodecs support
  const hasWebCodecs = typeof window !== 'undefined' && 'VideoEncoder' in window;
  if (!hasWebCodecs) {
    return { file, compressed: false, reason: 'unsupported' };
  }

  // 2. Skip if already H.264 MP4 and under 60 MB
  const isUnder60MB = file.size < 60 * 1024 * 1024;
  const isMp4 = file.type === 'video/mp4' || /\.mp4$/i.test(file.name);
  if (isUnder60MB && isMp4) {
    try {
      const codec = await detectVideoCodec(file);
      if (codec === 'h264') {
        return { file, compressed: false, reason: 'already_h264_under_60mb' };
      }
    } catch {
      // Proceed to conversion attempt if detection fails
    }
  }

  // 3. Convert via mediabunny
  try {
    options?.onStatus?.('Loading video compressor...');
    const {
      Input,
      Output,
      Conversion,
      ALL_FORMATS,
      BlobSource,
      Mp4OutputFormat,
      BufferTarget
    } = await import('mediabunny');

    options?.onStatus?.('Analyzing video...');
    const input = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS
    });

    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      return { file, compressed: false, reason: 'no_video_track' };
    }

    const origWidth = await videoTrack.getDisplayWidth();
    const origHeight = await videoTrack.getDisplayHeight();
    const longSide = Math.max(origWidth, origHeight);
    const maxLongSide = 1280;

    let targetWidth: number;
    let targetHeight: number;
    if (longSide > maxLongSide) {
      const scale = maxLongSide / longSide;
      targetWidth = Math.round((origWidth * scale) / 2) * 2;
      targetHeight = Math.round((origHeight * scale) / 2) * 2;
    } else {
      targetWidth = Math.round(origWidth / 2) * 2;
      targetHeight = Math.round(origHeight / 2) * 2;
    }

    targetWidth = Math.max(2, targetWidth);
    targetHeight = Math.max(2, targetHeight);

    // Ask for the phone's hardware video chip first (much faster); some devices refuse it,
    // so retry once with the browser's default choice before giving up.
    const buildConversion = async (hardwareAcceleration: 'prefer-hardware' | 'no-preference') => {
      const target = new BufferTarget();
      const output = new Output({
        format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
        target
      });
      const conversion = await Conversion.init({
        input,
        output,
        video: {
          codec: 'avc',
          width: targetWidth,
          height: targetHeight,
          fit: 'contain',
          bitrate: 2_500_000,
          frameRate: 30,
          hardwareAcceleration
        },
        copy: {
          mode: 'preferred'
        }
      });
      return { target, conversion };
    };

    let { target, conversion } = await buildConversion('prefer-hardware');
    if (conversion.isValid === false) {
      ({ target, conversion } = await buildConversion('no-preference'));
    }
    if (conversion.isValid === false) {
      const reasons = conversion.discardedTracks.map(t => t.reason).join(', ');
      throw new Error(`This device cannot convert the video (${reasons || 'unsupported'})`);
    }

    // Verify audio track is not silently dropped
    const hasInputAudio = (await input.getPrimaryAudioTrack()) !== null;
    if (hasInputAudio) {
      const discardedAudio = conversion.discardedTracks.find(t => t.track.type === 'audio');
      if (discardedAudio) {
        throw new Error(`Audio track could not be preserved: ${discardedAudio.reason}`);
      }
    }

    if (options?.onProgress) {
      conversion.onProgress = (prog) => {
        options.onProgress?.(Math.min(100, Math.round(prog * 100)));
      };
    }

    options?.onStatus?.('Compressing video with WebCodecs...');
    await conversion.execute();

    if (!target.buffer || target.buffer.byteLength === 0) {
      throw new Error('Compression generated an empty buffer');
    }

    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const compressedFile = new File([target.buffer], `${baseName}.mp4`, {
      type: 'video/mp4'
    });

    if (compressedFile.size >= file.size) {
      return {
        file,
        compressed: false,
        reason: 'larger_than_original',
        originalSize: file.size,
        newSize: compressedFile.size
      };
    }

    return {
      file: compressedFile,
      compressed: true,
      originalSize: file.size,
      newSize: compressedFile.size
    };
  } catch (err: any) {
    console.warn('Video compression fallback to original file:', err);
    return {
      file,
      compressed: false,
      reason: 'conversion_failed',
      error: err?.message || String(err)
    };
  }
}
