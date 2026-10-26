import type { PermissionCode, PermMap } from '@umdsc/shared';

/**
 * Client-side permission helper matching API logic:
 * returns true if perms[code] is '*' or (if styleId given) includes styleId.
 */
export function can(perms: any, code: string, styleId?: string): boolean {
  if (!perms) return false;
  const val = perms[code];
  if (!val) return false;
  if (val === '*') return true;
  if (Array.isArray(val)) {
    if (!styleId) return val.length > 0;
    return val.includes(styleId);
  }
  return false;
}

export const ADMIN_ROUTE_PERMS: Record<string, PermissionCode[]> = {
  '/admin/calendar': ['calendar.view', 'sessions.edit'],
  '/admin/attendance': ['attendance.view.all', 'attendance.edit'],
  '/admin/media': ['videos.view', 'videos.upload', 'videos.edit', 'music.view', 'music.edit'],
  '/admin/members': ['members.view', 'members.import'],
  '/admin/events': ['calendar.view', 'sessions.edit'],
  '/admin/events/new': ['calendar.view', 'sessions.edit'],
  '/admin/styles': ['styles.edit'],
  '/admin/instructors': ['instructors.edit'],
  '/admin/roles': ['roles.manage'],
  '/admin/admins': ['admins.manage'],
  '/admin/settings': ['settings.edit']
};

export function canAccessRoute(routePath: string, perms: PermMap | undefined): boolean {
  if (!perms) return false;

  // Normalized path without trailing slash or query
  const cleanPath = routePath.split('?')[0].replace(/\/+$/, '') || '/';

  // If this route matches one in our table
  const matchedKey = Object.keys(ADMIN_ROUTE_PERMS).find(
    (key) => cleanPath === key || cleanPath.startsWith(key + '/')
  );
  if (!matchedKey) {
    // If it's a generic /admin route not explicitly listed, permit
    if (cleanPath.startsWith('/admin')) {
      return true;
    }
    return true;
  }

  const requiredPerms = ADMIN_ROUTE_PERMS[matchedKey];
  return requiredPerms.some((code) => can(perms, code));
}

export function getFirstPermittedAdminRoute(perms: PermMap | undefined): string {
  if (!perms) return '/admin/attendance';

  const order = [
    '/admin/calendar',
    '/admin/attendance',
    '/admin/media',
    '/admin/members',
    '/admin/events',
    '/admin/styles',
    '/admin/instructors',
    '/admin/roles',
    '/admin/admins',
    '/admin/settings'
  ];

  for (const route of order) {
    if (canAccessRoute(route, perms)) {
      return route;
    }
  }

  return '/admin/attendance';
}

export function filterPermittedTabs<T extends { id: string; path: string }>(
  tabs: T[],
  perms: PermMap | undefined,
  moreItems?: { path: string }[]
): T[] {
  return tabs.filter((tab) => {
    if (tab.path === '#more') {
      if (!moreItems || moreItems.length === 0) return false;
      return moreItems.some((item) => canAccessRoute(item.path, perms));
    }
    return canAccessRoute(tab.path, perms);
  });
}

export function filterPermittedMoreItems<T extends { path: string }>(
  items: T[],
  perms: PermMap | undefined
): T[] {
  return items.filter((item) => canAccessRoute(item.path, perms));
}
