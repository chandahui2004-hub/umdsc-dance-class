import { PropsPort } from '../../src/ports';

export class FakeProps implements PropsPort {
  store = new Map<string, string>();

  get(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.store.set(key, value);
  }
}
