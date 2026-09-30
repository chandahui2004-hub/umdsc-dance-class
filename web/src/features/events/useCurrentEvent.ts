import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EventListItem } from '@umdsc/shared';
import { call } from '../../lib/api';

const STORAGE_KEY = 'umdsc:currentEvent';
const listeners = new Set<() => void>();

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage blocked: the choice lasts until reload
  }
  listeners.forEach(fn => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Active event with the latest start date, else any event, else null. */
function defaultEvent(events: EventListItem[]): EventListItem | null {
  const byStart = [...events].sort((a, b) => b.startDate.localeCompare(a.startDate));
  return byStart.find(e => e.status === 'active') || byStart[0] || null;
}

export function useEvents() {
  return useQuery({
    queryKey: ['events'],
    queryFn: async () => (await call<EventListItem[]>('events.list', { includeArchived: true })).data || []
  });
}

/** The event every admin page works on, shared across the app and remembered in this browser. */
export function useCurrentEvent(): {
  events: EventListItem[];
  current: EventListItem | null;
  setCurrentId(id: string): void;
  isLoading: boolean;
  isAll: boolean;
} {
  const { data: events = [], isLoading } = useEvents();
  const storedId = useSyncExternalStore(subscribe, readStored, () => null);

  const isAll = storedId === 'ALL';
  const current = useMemo(
    () => (isAll ? null : events.find(e => e.id === storedId) || defaultEvent(events)),
    [events, storedId, isAll]
  );
  const setCurrentId = useCallback((id: string) => writeStored(id), []);

  return { events, current, setCurrentId, isLoading, isAll };
}
