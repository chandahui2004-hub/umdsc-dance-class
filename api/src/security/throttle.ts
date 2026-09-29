import { CachePort } from '../ports';
import { AppError } from '../errors';

export function checkThrottle(cache: CachePort, key: string, max: number, windowSec: number): void {
  const current = Number(cache.get(`throttle:${key}`) || 0);
  if (current >= max) {
    throw new AppError(
      'LOCKED_OUT',
      `Too many failed attempts. Locked out for ${Math.ceil(windowSec / 60)} minutes.`,
      false
    );
  }
}

export function recordFailure(cache: CachePort, key: string, windowSec: number): void {
  const current = Number(cache.get(`throttle:${key}`) || 0);
  cache.put(`throttle:${key}`, String(current + 1), windowSec);
}

export function clearFailures(cache: CachePort, key: string): void {
  cache.remove(`throttle:${key}`);
}
