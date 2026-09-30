import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { call } from './api';

const FIRST_CHECK_MS = 4_000;
const INTERVAL_MS = 600_000;
const REFRESHED_QUERIES = ['events', 'members', 'attendance', 'sessions', 'bootstrap'];

interface AutoSyncResult {
  checked: string[];
  changed: string[];
  skipped: string[];
  errors: { eventId: string; message: string }[];
}

/**
 * Asks the server to check every active event's form for new registrations,
 * 4 s after the admin shell opens and then every 10 minutes while the tab is
 * visible. The server throttles, so several open tabs still cost one check.
 */
export function useEventAutoSync(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        const res = await call<AutoSyncResult>('events.autoSync', {});
        if (!cancelled && res.data?.changed?.length) {
          for (const key of REFRESHED_QUERIES) {
            queryClient.invalidateQueries({ queryKey: [key] });
          }
        }
      } catch (err) {
        console.warn('Auto-sync check failed:', err);
      }
    };

    const first = setTimeout(check, FIRST_CHECK_MS);
    const every = setInterval(check, INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(every);
    };
  }, [queryClient]);
}
