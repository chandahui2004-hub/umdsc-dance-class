import type { CachePort } from '../ports';

// Apps Script's CacheService rejects values over 100 KB (bytes); stay under it with some margin.
const MAX_CACHE_BYTES = 90_000;

function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4; // a surrogate pair is one 4-byte character
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Caches `value` unless it is too big for the cache or the cache refuses it. A cache is only a
 * shortcut, so a failure to store must never fail the request. Returns whether it was stored.
 */
export function safeCachePut(cache: CachePort, key: string, value: string, ttlSec: number): boolean {
  if (utf8Length(value) > MAX_CACHE_BYTES) return false;
  try {
    cache.put(key, value, ttlSec);
    return true;
  } catch {
    return false;
  }
}
