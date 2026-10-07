import { get, set } from 'idb-keyval';
import { api, newOpId, ApiError } from './api';

export interface Tick {
  opId: string;
  eventId: string;
  styleId: string;
  sessionId: string;
  memberId: string;
  present: boolean;
  queuedAt: number;
}

export interface TickQueueDeps {
  send: (
    eventId: string,
    styleId: string,
    marks: Omit<Tick, 'eventId' | 'styleId' | 'queuedAt'>[]
  ) => Promise<{ applied: string[] }>;
  now?: () => number;
  storeKey?: string;
}

/** v2: ticks are keyed by event; month-based ticks saved under the old key are ignored. */
export const TICK_STORE_KEY = 'umdsc:ticks:v2';

export function createTickQueue(deps: TickQueueDeps) {
  const storeKey = deps.storeKey || TICK_STORE_KEY;
  const getNow = deps.now || (() => Date.now());

  let items: Tick[] = [];
  // The server's reason for ticks it refused, per event + style, until the page reads it
  const refused = new Map<string, string>();
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
        item.eventId === t.eventId &&
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
      // Group by event and styleId
      const groups = new Map<string, Tick[]>();
      for (const item of items) {
        const key = `${item.eventId}:${item.styleId}`;
        const group = groups.get(key) || [];
        group.push(item);
        groups.set(key, group);
      }

      for (const [, groupTicks] of groups) {
        // Send batch of <= 50 per (eventId, styleId)
        const batch = groupTicks.slice(0, 50);
        if (batch.length === 0) continue;

        const { eventId, styleId } = batch[0];
        const marksToSend = batch.map(({ opId, sessionId, memberId, present }) => ({
          opId,
          sessionId,
          memberId,
          present
        }));

        try {
          const res = await deps.send(eventId, styleId, marksToSend);
          const appliedSet = new Set(res.applied);
          items = items.filter((x) => !appliedSet.has(x.opId));
        } catch (err) {
          if (err instanceof ApiError && !err.retryable && err.code !== 'UNAUTHORIZED') {
            // Refused (e.g. not registered): retrying can't help and would block later ticks forever
            const batchIds = new Set(batch.map((t) => t.opId));
            items = items.filter((x) => !batchIds.has(x.opId));
            refused.set(`${eventId}:${styleId}`, err.message);
          } else {
            // Busy server, lost connection or expired login: keep the ticks for another try
            scheduleFlush(2000);
          }
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

  /** The server's reason for refused ticks of this event + style (reported once), or null. */
  const takeError = (eventId: string, styleId: string): string | null => {
    const key = `${eventId}:${styleId}`;
    const message = refused.get(key) ?? null;
    refused.delete(key);
    return message;
  };

  return {
    enqueue,
    pending,
    flush,
    subscribe,
    load,
    takeError
  };
}

export const attendanceQueue = createTickQueue({
  send: async (eventId, styleId, marks) => {
    const res = await api.post<{ applied: string[]; version: number }>('attendance.mark', {
      eventId,
      styleId,
      marks
    });
    return res.data;
  }
});
