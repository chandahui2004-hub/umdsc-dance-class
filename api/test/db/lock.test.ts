import { describe, it, expect } from 'vitest';
import { withScriptLock } from '../../src/db/lock';
import { LockPort } from '../../src/ports';
import { AppError } from '../../src/errors';

class FakeLock implements LockPort {
  isLocked = false;
  releaseCalled = false;

  constructor(private willSucceed: boolean) {}

  tryLock(ms: number): boolean {
    if (this.willSucceed && !this.isLocked) {
      this.isLocked = true;
      return true;
    }
    return false;
  }

  release(): void {
    this.isLocked = false;
    this.releaseCalled = true;
  }
}

describe('withScriptLock', () => {
  it('executes function and releases lock on success', () => {
    const lock = new FakeLock(true);
    let ran = false;

    const result = withScriptLock(lock, () => {
      ran = true;
      return 'ok';
    }, 1000);

    expect(result).toBe('ok');
    expect(ran).toBe(true);
    expect(lock.releaseCalled).toBe(true);
  });

  it('throws BUSY retryable when lock not acquired and always releases', () => {
    const lock = new FakeLock(false);

    expect(() => {
      withScriptLock(lock, () => 'should not run', 500);
    }).toThrowError();

    try {
      withScriptLock(lock, () => 'should not run', 500);
    } catch (err: any) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('BUSY');
      expect(err.retryable).toBe(true);
    }
  });

  it('releases lock even if fn throws', () => {
    const lock = new FakeLock(true);

    expect(() => {
      withScriptLock(lock, () => {
        throw new Error('business logic error');
      });
    }).toThrow('business logic error');

    expect(lock.releaseCalled).toBe(true);
    expect(lock.isLocked).toBe(false);
  });
});
