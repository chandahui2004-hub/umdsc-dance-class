import { LockPort } from '../../src/ports';

export class FakeLock implements LockPort {
  isLocked = false;
  releaseCalled = false;

  constructor(private willSucceed = true) {}

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
