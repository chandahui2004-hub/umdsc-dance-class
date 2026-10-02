import { detectVideoCodec } from './videoCodec';

export const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MiB (multiple of 256 KiB)

export function chunkRanges(total: number, chunk = CHUNK_SIZE): [number, number][] {
  if (total <= 0) return [];
  const ranges: [number, number][] = [];
  let start = 0;
  while (start < total) {
    const end = Math.min(start + chunk - 1, total - 1);
    ranges.push([start, end]);
    start = end + 1;
  }
  return ranges;
}

export function contentRange(start: number, end: number, total: number): string {
  return `bytes ${start}-${end}/${total}`;
}

export function nextOffsetFromRange(rangeHeader: string | null): number {
  if (!rangeHeader) return 0;
  // formats: 'bytes=0-8388607' or 'bytes 0-8388607'
  const match = rangeHeader.match(/bytes[= ]\d+-(\d+)/i);
  if (match && match[1]) {
    return parseInt(match[1], 10) + 1;
  }
  return 0;
}

export const HEVC_WARNING =
  'This video is H.265/HEVC. Many phones and Edge/Firefox show a black screen for it. ' +
  'For every dancer to see it, re-export as H.264 MP4 (iPhone: Settings → Camera → Formats → Most Compatible; ' +
  'CapCut: export 1080p H.264). You can still upload it.';

export async function videoFormatWarning(file: File): Promise<string | null> {
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();

  const isMov = name.endsWith('.mov') || type.includes('quicktime');
  const isHevc = name.endsWith('.hevc') || type.includes('hevc');

  if (isMov || isHevc) {
    return (
      'This file appears to be a QuickTime (.mov) or HEVC video. ' +
      'For maximum browser playback compatibility across Android and Windows devices, ' +
      'MP4 (H.264 / AAC) is strongly recommended. Do you want to continue anyway?'
    );
  }

  // An .mp4 can still hold H.265: look inside the file.
  return (await detectVideoCodec(file)) === 'hevc' ? HEVC_WARNING : null;
}

export async function makePublic(token: string, fileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'anyone',
      role: 'reader'
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to set anyone reader permission (${res.status}): ${text}`);
  }
}

export interface UploadResumableOptions {
  token: string;
  file: File;
  parentId: string;
  name: string;
  chunkSize?: number;
  onProgress: (sent: number, total: number) => void;
  signal?: AbortSignal;
}

export async function uploadResumable(
  opts: UploadResumableOptions
): Promise<{ id: string; mimeType: string; size: number }> {
  const { token, file, parentId, name, onProgress, signal } = opts;
  const chunkSize = opts.chunkSize || CHUNK_SIZE;

  // 1. Initialize resumable session
  const initRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': file.type || 'application/octet-stream',
        'X-Upload-Content-Length': file.size.toString()
      },
      body: JSON.stringify({
        name,
        parents: [parentId]
      }),
      signal
    }
  );

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`Failed to initialize resumable upload session (${initRes.status}): ${errText}`);
  }

  const sessionUri = initRes.headers.get('Location');
  if (!sessionUri) {
    throw new Error('No Location header received for resumable upload session');
  }

  // 2. Upload chunks with status recovery
  let offset = 0;
  const total = file.size;

  while (offset < total) {
    if (signal?.aborted) {
      throw new Error('Upload aborted by user');
    }

    const end = Math.min(offset + chunkSize, total) - 1;
    const chunk = file.slice(offset, end + 1);

    let putSuccess = false;
    let attempts = 0;

    while (!putSuccess && attempts < 10) {
      attempts++;
      try {
        const uploadRes = await fetch(sessionUri, {
          method: 'PUT',
          headers: {
            'Content-Range': contentRange(offset, end, total),
            'Content-Type': file.type || 'application/octet-stream'
          },
          body: chunk,
          signal
        });

        if (uploadRes.status === 200 || uploadRes.status === 201) {
          const data = await uploadRes.json();
          onProgress(total, total);
          return {
            id: data.id,
            mimeType: data.mimeType || file.type,
            size: total
          };
        }

        if (uploadRes.status === 308) {
          // Resume incomplete, read Range header
          const range = uploadRes.headers.get('Range');
          offset = nextOffsetFromRange(range);
          onProgress(offset, total);
          putSuccess = true;
          break;
        }

        // Other status codes: retry
        await new Promise((r) => setTimeout(r, Math.min(1000 * Math.pow(2, attempts), 8000)));
      } catch (err: any) {
        if (signal?.aborted) throw err;

        // Query status from server with 'Content-Range: bytes */total'
        try {
          const statusRes = await fetch(sessionUri, {
            method: 'PUT',
            headers: {
              'Content-Range': `bytes */${total}`
            },
            signal
          });

          if (statusRes.status === 200 || statusRes.status === 201) {
            const data = await statusRes.json();
            return {
              id: data.id,
              mimeType: data.mimeType || file.type,
              size: total
            };
          }

          if (statusRes.status === 308) {
            const range = statusRes.headers.get('Range');
            offset = nextOffsetFromRange(range);
            onProgress(offset, total);
            putSuccess = true;
            break;
          }
        } catch {
          // Status query also failed, backoff and retry
          await new Promise((r) => setTimeout(r, Math.min(1000 * Math.pow(2, attempts), 8000)));
        }
      }
    }

    if (!putSuccess && attempts >= 10) {
      throw new Error(`Upload failed after ${attempts} retries at offset ${offset}`);
    }
  }

  throw new Error('Upload completed loop without receiving file metadata');
}
