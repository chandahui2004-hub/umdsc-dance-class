import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { session } from './session';

export interface AutoSyncState {
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  lastNewCount: number;
  syncNow: () => Promise<void>;
  statusMessage: string | null;
}

export function useRegistrationAutoSync(month?: string): AutoSyncState {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [lastNewCount, setLastNewCount] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const isSyncingRef = useRef(false);

  const performSync = useCallback(
    async (silent = true) => {
      const currentSession = session.get();
      if (!currentSession || currentSession.claims.role !== 'admin') {
        return;
      }

      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      setIsSyncing(true);

      try {
        const res = await api.post<{
          syncedAt: string;
          results: { month: string; beforeCount: number; afterCount: number; newCount: number }[];
          totalNew: number;
        }>('members.autoSync', { month });

        const totalNew = res.data?.totalNew || 0;
        setLastSyncedAt(new Date());
        setLastNewCount(totalNew);

        if (totalNew > 0) {
          setStatusMessage(`Auto-synced: +${totalNew} new dancer registration(s)!`);
          queryClient.invalidateQueries({ queryKey: ['members'] });
          queryClient.invalidateQueries({ queryKey: ['attendance'] });
          queryClient.invalidateQueries({ queryKey: ['sessions'] });
          queryClient.invalidateQueries({ queryKey: ['admin.bootstrap'] });
        } else {
          if (!silent) {
            setStatusMessage('Checked Google Sheet: already up to date.');
          }
        }
      } catch (err) {
        console.warn('Auto-sync check error:', err);
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    },
    [month, queryClient]
  );

  useEffect(() => {
    const currentSession = session.get();
    if (!currentSession || currentSession.claims.role !== 'admin') {
      return;
    }

    // Initial check after 4 seconds
    const initialTimer = setTimeout(() => {
      performSync(true);
    }, 4000);

    // Periodic check every 60 seconds (1 minute)
    const interval = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        performSync(true);
      }
    }, 60000);

    // On window focus / visibility change
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        performSync(true);
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [performSync]);

  return {
    isSyncing,
    lastSyncedAt,
    lastNewCount,
    syncNow: () => performSync(false),
    statusMessage
  };
}
