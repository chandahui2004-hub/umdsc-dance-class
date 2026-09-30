import { get, set } from 'idb-keyval';
import { api, newOpId } from './api';
import type { Month } from '@umdsc/shared';

export interface Tick {
  opId: string;
  month: Month;
  styleId: string;
  sessionId: string;
  memberId: string;
  present: boolean;
  queuedAt: number;
}

export interface TickQueueDeps {
  send: (
    month: Month,
    styleId: string,
    marks: Omit<Tick, 'month' | 'styleId' | 'queuedAt'>[]
  ) => Promise<{ applied: string[] }>;
  now?: () => number;
  storeKey?: string;
}

export function createTickQueue(deps: TickQueueDeps) {
  const storeKey = deps.storeKey || 'umdsc:ticks';
  const getNow = deps.now || (() => Date.now());

  let items: Tick[] = [];
  const listeners = new Set<(pendingCount: number) => void>();
  let isFlushing = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const notify = () => {
    const count = items.length;
    listeners.forEach((fn) => {
      try {
        fn(count);
      } catch (err) {
        console.error('Error in tickQueue subscriber:', err);
      }
    });
  };

  const persist = async () => {
    try {
      await set(storeKey, items);
    } catch (err) {
      console.error('Failed to persist tick queue to IndexedDB:', err);
    }
  };

  const scheduleFlush = (delayMs: number = 1000) => {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      flush().catch((err) => {
        console.error('Error in scheduled flush:', err);
      });
    }, delayMs);
  };

  const pending = (): Tick[] => [...items];

  const enqueue = (t: Omit<Tick, 'opId' | 'queuedAt'>) => {
    const existingIndex = items.findIndex(
      (item) =>
        item.month === t.month &&
        item.styleId === t.styleId &&
        item.sessionId === t.sessionId &&
        item.memberId === t.memberId
    );

    const tick: Tick = {
      ...t,
      opId: newOpId(),
      queuedAt: getNow()
    };

    if (existingIndex >= 0) {
      items[existingIndex] = tick;
    } else {
      items.push(tick);
    }

    persist();
    notify();
    scheduleFlush();
  };

  const flush = async (): Promise<void> => {
    if (isFlushing || items.length === 0) return;
    isFlushing = true;

    try {
      // Group by month and styleId
      const groups = new Map<string, Tick[]>();
      for (const item of items) {
        const key = `${item.month}:${item.styleId}`;
        const group = groups.get(key) || [];
        group.push(item);
        groups.set(key, group);
      }

      for (const [, groupTicks] of groups) {
        // Send batch of <= 50 per (month, styleId)
        const batch = groupTicks.slice(0, 50);
        if (batch.length === 0) continue;

        const { month, styleId } = batch[0];
        const marksToSend = batch.map(({ opId, sessionId, memberId, present }) => ({
          opId,
          sessionId,
          memberId,
          present
        }));

        try {
          const res = await deps.send(month, styleId, marksToSend);
          const appliedSet = new Set(res.applied);
          items = items.filter((x) => !appliedSet.has(x.opId));
        } catch {
          // On network/retryable failure, batch stays in items for next flush
          scheduleFlush(2000);
        }
      }
    } finally {
      isFlushing = false;
      await persist();
      notify();

      if (items.length > 0) {
        scheduleFlush();
      }
    }
  };

  const load = async (): Promise<void> => {
    try {
      const saved = await get<Tick[]>(storeKey);
      if (Array.isArray(saved)) {
        items = saved;
      }
    } catch (err) {
      console.error('Failed to load tick queue from IndexedDB:', err);
    }
    notify();
    if (items.length > 0) {
      scheduleFlush();
    }
  };

  const subscribe = (fn: (pendingCount: number) => void): (() => void) => {
    listeners.add(fn);
    fn(items.length);
    return () => {
      listeners.delete(fn);
    };
  };

  return {
    enqueue,
    pending,
    flush,
    subscribe,
    load
  };
}

export const attendanceQueue = createTickQueue({
  send: async (month, styleId, marks) => {
    const res = await api.post<{ applied: string[]; version: number }>('attendance.mark', {
      month,
      styleId,
      marks
    });
    return res.data;
  }
});
