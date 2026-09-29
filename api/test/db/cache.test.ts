import { describe, it, expect } from 'vitest';
import { putLarge, getLarge } from '../../src/db/cache';
import { CachePort } from '../../src/ports';

class FakeCache implements CachePort {
  store = new Map<string, { value: string; expiresAt: number }>();

  get(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  put(key: string, value: string, ttlSec: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
  }

  remove(key: string): void {
    this.store.delete(key);
  }
}

describe('Cache large chunking', () => {
  it('putLarge/getLarge round-trips a 250_000-char string across chunks', () => {
    const cache = new FakeCache();
    const str = 'A'.repeat(100000) + 'B'.repeat(100000) + 'C'.repeat(50000);

    putLarge(cache, 'big_data', str, 60);
    const result = getLarge(cache, 'big_data');

    expect(result).toBe(str);
  });

  it('getLarge returns null if any chunk expired', () => {
    const cache = new FakeCache();
    const str = 'A'.repeat(100000) + 'B'.repeat(100000);

    putLarge(cache, 'big_data2', str, 60);
    // simulate one chunk expiring or missing
    cache.remove('big_data2:chunk:1');

    const result = getLarge(cache, 'big_data2');
    expect(result).toBeNull();
  });
});
