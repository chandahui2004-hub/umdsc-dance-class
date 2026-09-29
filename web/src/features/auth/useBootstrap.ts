import { useQuery } from '@tanstack/react-query';
import { call } from '../../lib/api';
import { session } from '../../lib/session';
import type { DancerBootstrap, AdminBootstrap } from '@umdsc/shared';

interface CachedBootstrap<T> {
  data: T;
  dataVersion: number;
}

export function useBootstrap<T extends 'dancer' | 'admin'>(role: T) {
  const currentSession = session.get();
  const sub = currentSession?.claims?.sub;
  const storageKey = sub ? `boot:${role}:${sub}` : null;

  const getCachedData = (): CachedBootstrap<T extends 'dancer' ? DancerBootstrap : AdminBootstrap> | null => {
    if (!storageKey) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const initial = getCachedData();

  return useQuery({
    queryKey: ['bootstrap', role, sub],
    initialData: initial?.data,
    enabled: !!sub && currentSession?.claims?.role === role,
    queryFn: async (): Promise<T extends 'dancer' ? DancerBootstrap : AdminBootstrap> => {
      const cached = getCachedData();
      const action = role === 'dancer' ? 'dancer.bootstrap' : 'admin.bootstrap';
      const res = await call<any>(action, undefined, {
        sinceVersion: cached?.dataVersion
      });

      if (res.data?.notModified && cached) {
        return cached.data;
      }

      if (storageKey && res.data) {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            data: res.data,
            dataVersion: res.dataVersion
          })
        );
      }

      return res.data;
    }
  });
}
