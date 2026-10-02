export type VideoCodec = 'hevc' | 'h264' | 'unknown';

const WINDOW_BYTES = 4 * 1024 * 1024;

function readLatin1(part: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new TextDecoder('latin1').decode(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(part);
  });
}

/**
 * Looks for the codec box names (`hvc1`/`hev1` = H.265, `avc1` = H.264) in the first and last 4 MB
 * of an MP4. The moov box that names the codec is at the end of phone and screen recordings, so
 * reading only the ends never loads a multi-GB file into memory.
 */
export async function detectVideoCodec(file: Blob): Promise<VideoCodec> {
  const parts =
    file.size <= 2 * WINDOW_BYTES
      ? [file]
      : [file.slice(0, WINDOW_BYTES), file.slice(file.size - WINDOW_BYTES, file.size)];

  let sawH264 = false;
  for (const part of parts) {
    const text = await readLatin1(part);
    if (text.includes('hvc1') || text.includes('hev1')) return 'hevc';
    if (text.includes('avc1')) sawH264 = true;
  }
  return sawH264 ? 'h264' : 'unknown';
}
