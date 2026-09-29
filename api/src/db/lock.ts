import { LockPort } from '../ports';
import { AppError } from '../errors';

export function withScriptLock<R>(lock: LockPort, fn: () => R, ms = 20000): R {
  const acquired = lock.tryLock(ms);
  if (!acquired) {
    throw new AppError('BUSY', 'Server is busy, please retry.', true);
  }

  try {
    return fn();
  } finally {
    try {
      lock.release();
    } catch {
      // Ignore release errors
    }
  }
}
