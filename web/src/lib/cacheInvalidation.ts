import { QueryClient } from '@tanstack/react-query';

/**
 * Invalidates sessions, bootstrap, and media caches across both Admin and Dancer views,
 * and clears cached bootstrap in localStorage so stale copies are never displayed.
 */
export async function invalidateSessionCaches(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['sessions'] }),
    queryClient.invalidateQueries({ queryKey: ['bootstrap'] }),
    queryClient.invalidateQueries({ queryKey: ['videos'] }),
    queryClient.invalidateQueries({ queryKey: ['music'] })
  ]);

  try {
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if (k.startsWith('boot:')) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    // Ignore storage access errors in private/incognito mode
  }
}
