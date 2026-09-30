import { LockPort } from '../../src/ports';

export class FakeLock implements LockPort {
  isLocked = false;
  releaseCalled = false;
  tryLockCalls = 0;
  /** Runs once when the lock is next acquired: simulates another request finishing while this one waited. */
  onAcquire: (() => void) | null = null;

  constructor(public willSucceed = true) {}

  tryLock(ms: number): boolean {
    this.tryLockCalls++;
    if (this.willSucceed && !this.isLocked) {
      const hook = this.onAcquire;
      this.onAcquire = null;
      hook?.();
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
