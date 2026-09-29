import { CachePort } from '../ports';

const CHUNK_SIZE = 90_000;

interface ChunkMeta {
  chunks: number;
  length: number;
}

export function putLarge(cache: CachePort, key: string, value: string, ttlSec: number): void {
  const chunks = Math.ceil(value.length / CHUNK_SIZE);
  const meta: ChunkMeta = { chunks, length: value.length };

  cache.put(`${key}:meta`, JSON.stringify(meta), ttlSec);

  for (let i = 0; i < chunks; i++) {
    const chunk = value.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    cache.put(`${key}:chunk:${i}`, chunk, ttlSec);
  }
}

export function getLarge(cache: CachePort, key: string): string | null {
  const metaRaw = cache.get(`${key}:meta`);
  if (!metaRaw) return null;

  let meta: ChunkMeta;
  try {
    meta = JSON.parse(metaRaw);
  } catch {
    return null;
  }

  let full = '';
  for (let i = 0; i < meta.chunks; i++) {
    const chunk = cache.get(`${key}:chunk:${i}`);
    if (chunk === null) {
      return null;
    }
    full += chunk;
  }

  if (full.length !== meta.length) {
    return null;
  }

  return full;
}
