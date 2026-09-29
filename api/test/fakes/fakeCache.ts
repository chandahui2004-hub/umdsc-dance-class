import { CachePort } from '../../src/ports';

export class FakeCache implements CachePort {
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
