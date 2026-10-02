import { useQuery } from '@tanstack/react-query';
import { call } from '../../lib/api';
import { session } from '../../lib/session';

export type AttendanceRecord = { sessionId: string; present: boolean };

/**
 * The signed-in dancer's attendance. It loads after the calendar (it is the slowest part of the
 * bootstrap), so the last saved copy is shown at once while a fresh one is fetched.
 */
export function useDancerAttendance() {
  const current = session.get();
  const sub = current?.claims?.sub;
  const storageKey = sub ? `att:dancer:${sub}` : null;

  let saved: AttendanceRecord[] | undefined;
  if (storageKey) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) saved = JSON.parse(raw);
    } catch {
      saved = undefined;
    }
  }

  const query = useQuery({
    queryKey: ['dancerAttendance', sub],
    enabled: !!sub && current?.claims?.role === 'dancer',
    initialData: saved,
    initialDataUpdatedAt: 0, // saved data counts as stale, so it is refreshed straight away
    queryFn: async (): Promise<AttendanceRecord[]> => {
      const res = await call<AttendanceRecord[]>('dancer.attendance');
      const records = Array.isArray(res.data) ? res.data : [];
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(records));
        } catch {
          // storage full or blocked: the fresh data is still returned
        }
      }
      return records;
    }
  });

  return { attendance: query.data ?? [], isLoading: query.data === undefined };
}
