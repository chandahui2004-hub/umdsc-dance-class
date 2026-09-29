import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTickQueue } from './tickQueue';
import type { Month } from '@umdsc/shared';

describe('createTickQueue', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('toggling the same dancer twice before flush sends only the final state', async () => {
    const sentBatches: Array<{ month: Month; styleId: string; marks: any[] }> = [];
    const sendMock = vi.fn().mockImplementation(async (month: Month, styleId: string, marks: any[]) => {
      sentBatches.push({ month, styleId, marks });
      return { applied: marks.map((m) => m.opId) };
    });

    const queue = createTickQueue({
      send: sendMock,
      storeKey: 'test:ticks:1'
    });

    // Toggle twice for the same dancer
    queue.enqueue({
      month: '2026-10',
      styleId: 'style-hiphop',
      sessionId: 'ses-1',
      memberId: 'mem-1',
      present: true
    });

    queue.enqueue({
      month: '2026-10',
      styleId: 'style-hiphop',
      sessionId: 'ses-1',
      memberId: 'mem-1',
      present: false
    });

    expect(queue.pending().length).toBe(1);
    expect(queue.pending()[0].present).toBe(false);

    await queue.flush();

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sentBatches[0].marks.length).toBe(1);
    expect(sentBatches[0].marks[0].present).toBe(false);
    expect(queue.pending().length).toBe(0);
  });

  it('ticks survive a reload: new queue instance .load() restores pending', async () => {
    const sendMock = vi.fn().mockResolvedValue({ applied: [] });
    const storeKey = 'test:ticks:reload';

    const queue1 = createTickQueue({
      send: sendMock,
      storeKey
    });

    queue1.enqueue({
      month: '2026-10',
      styleId: 'style-hiphop',
      sessionId: 'ses-1',
      memberId: 'mem-2',
      present: true
    });

    // Wait a brief tick for IndexedDB set
    await new Promise((r) => setTimeout(r, 50));

    const queue2 = createTickQueue({
      send: sendMock,
      storeKey
    });

    await queue2.load();
    expect(queue2.pending().length).toBe(1);
    expect(queue2.pending()[0].memberId).toBe('mem-2');
  });

  it('on retryable failure items stay pending and are retried', async () => {
    let attempts = 0;
    const sendMock = vi.fn().mockImplementation(async (_month, _styleId, marks) => {
      attempts++;
      if (attempts === 1) {
        throw new Error('Network error');
      }
      return { applied: marks.map((m: any) => m.opId) };
    });

    const queue = createTickQueue({
      send: sendMock,
      storeKey: 'test:ticks:retry'
    });

    queue.enqueue({
      month: '2026-10',
      styleId: 'style-hiphop',
      sessionId: 'ses-1',
      memberId: 'mem-3',
      present: true
    });

    // Attempt 1 fails
    await queue.flush();
    expect(queue.pending().length).toBe(1);

    // Attempt 2 succeeds
    await queue.flush();
    expect(queue.pending().length).toBe(0);
    expect(attempts).toBe(2);
  });

  it('applied opIds are removed; unapplied stay', async () => {
    const sendMock = vi.fn().mockImplementation(async (_month, _styleId, marks) => {
      // Only apply the first mark
      return { applied: [marks[0].opId] };
    });

    const queue = createTickQueue({
      send: sendMock,
      storeKey: 'test:ticks:partial'
    });

    queue.enqueue({
      month: '2026-10',
      styleId: 'style-hiphop',
      sessionId: 'ses-1',
      memberId: 'mem-4',
      present: true
    });

    queue.enqueue({
      month: '2026-10',
      styleId: 'style-hiphop',
      sessionId: 'ses-1',
      memberId: 'mem-5',
      present: true
    });

    expect(queue.pending().length).toBe(2);
    await queue.flush();

    expect(queue.pending().length).toBe(1);
    expect(queue.pending()[0].memberId).toBe('mem-5');
  });

  it('subscribe reports pending count changes', async () => {
    const sendMock = vi.fn().mockImplementation(async (_month, _styleId, marks) => {
      return { applied: marks.map((m: any) => m.opId) };
    });

    const queue = createTickQueue({
      send: sendMock,
      storeKey: 'test:ticks:sub'
    });

    const counts: number[] = [];
    const unsubscribe = queue.subscribe((count) => {
      counts.push(count);
    });

    queue.enqueue({
      month: '2026-10',
      styleId: 'style-hiphop',
      sessionId: 'ses-1',
      memberId: 'mem-6',
      present: true
    });

    await queue.flush();

    expect(counts).toEqual([0, 1, 0]);
    unsubscribe();
  });
});
