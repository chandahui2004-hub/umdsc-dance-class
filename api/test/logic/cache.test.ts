import { describe, it, expect } from 'vitest';
import { safeCachePut } from '../../src/logic/cache';
import { FakeCache } from '../fakes/fakeCache';

describe('safeCachePut', () => {
  it('stores a normal value and reports true', () => {
    const cache = new FakeCache();
    expect(safeCachePut(cache, 'k', '{"a":1}', 60)).toBe(true);
    expect(cache.get('k')).toBe('{"a":1}');
  });

  it('skips a value over the 100 KB limit instead of storing it', () => {
    const cache = new FakeCache();
    expect(safeCachePut(cache, 'k', 'x'.repeat(95_000), 60)).toBe(false);
    expect(cache.get('k')).toBeNull();
  });

  it('counts bytes, not characters (names like 胶已 use 3 bytes each)', () => {
    const cache = new FakeCache();
    const value = '胶'.repeat(40_000); // 40,000 characters but 120,000 bytes
    expect(safeCachePut(cache, 'k', value, 60)).toBe(false);
    expect(cache.get('k')).toBeNull();
  });

  it('swallows an error from the cache and reports false', () => {
    const cache = new FakeCache();
    cache.put = () => {
      throw new Error('Argument too large: value');
    };
    expect(safeCachePut(cache, 'k', 'small', 60)).toBe(false);
  });
});
