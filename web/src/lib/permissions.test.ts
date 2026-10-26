import { describe, it, expect } from 'vitest';
import {
  can,
  canAccessRoute,
  getFirstPermittedAdminRoute,
  filterPermittedTabs,
  filterPermittedMoreItems
} from './permissions';

describe('can permission helper', () => {
  it('returns false for null/undefined perms or missing code', () => {
    expect(can(undefined, 'styles.edit')).toBe(false);
    expect(can(null, 'styles.edit')).toBe(false);
    expect(can({}, 'styles.edit')).toBe(false);
  });

  it('returns true when permission is wildcard "*"', () => {
    expect(can({ 'styles.edit': '*' }, 'styles.edit')).toBe(true);
    expect(can({ 'styles.edit': '*' }, 'styles.edit', 'st_hiphop')).toBe(true);
  });

  it('handles array permissions for style-scoped permissions', () => {
    expect(can({ 'styles.edit': ['st_hiphop'] }, 'styles.edit')).toBe(true);
    expect(can({ 'styles.edit': ['st_hiphop'] }, 'styles.edit', 'st_hiphop')).toBe(true);
    expect(can({ 'styles.edit': ['st_hiphop'] }, 'styles.edit', 'st_popping')).toBe(false);
    expect(can({ 'styles.edit': [] }, 'styles.edit')).toBe(false);
  });
});

import type { PermMap } from '@umdsc/shared';

describe('canAccessRoute and navigation filtering', () => {
  const superadminPerms: PermMap = {
    'calendar.view': '*',
    'attendance.view.all': '*',
    'attendance.edit': '*',
    'admins.manage': '*',
    'roles.manage': '*'
  };

  const classRepPerms: PermMap = {
    'attendance.view.all': '*',
    'attendance.edit': '*',
    'export.download': '*'
  };

  it('canAccessRoute allows all routes for superadmin', () => {
    expect(canAccessRoute('/admin/calendar', superadminPerms)).toBe(true);
    expect(canAccessRoute('/admin/attendance', superadminPerms)).toBe(true);
    expect(canAccessRoute('/admin/roles', superadminPerms)).toBe(true);
    expect(canAccessRoute('/admin/admins', superadminPerms)).toBe(true);
  });

  it('canAccessRoute restricts class rep to attendance only', () => {
    expect(canAccessRoute('/admin/attendance', classRepPerms)).toBe(true);
    expect(canAccessRoute('/admin/calendar', classRepPerms)).toBe(false);
    expect(canAccessRoute('/admin/media', classRepPerms)).toBe(false);
    expect(canAccessRoute('/admin/members', classRepPerms)).toBe(false);
    expect(canAccessRoute('/admin/roles', classRepPerms)).toBe(false);
    expect(canAccessRoute('/admin/settings', classRepPerms)).toBe(false);
  });

  it('getFirstPermittedAdminRoute returns /admin/calendar for superadmin and /admin/attendance for class rep', () => {
    expect(getFirstPermittedAdminRoute(superadminPerms)).toBe('/admin/calendar');
    expect(getFirstPermittedAdminRoute(classRepPerms)).toBe('/admin/attendance');
    expect(getFirstPermittedAdminRoute({ 'videos.view': '*' })).toBe('/admin/media');
  });

  it('filterPermittedTabs and filterPermittedMoreItems hides unauthorized tabs', () => {
    const tabs = [
      { id: 'calendar', label: 'Calendar', icon: null as any, path: '/admin/calendar' },
      { id: 'attendance', label: 'Attendance', icon: null as any, path: '/admin/attendance' },
      { id: 'media', label: 'Media', icon: null as any, path: '/admin/media' },
      { id: 'more', label: 'More', icon: null as any, path: '#more' }
    ];

    const moreItems = [
      { id: 'roles', label: 'Roles', icon: null as any, path: '/admin/roles' },
      { id: 'settings', label: 'Settings', icon: null as any, path: '/admin/settings' }
    ];

    const permittedTabs = filterPermittedTabs(tabs, classRepPerms, moreItems);
    expect(permittedTabs.map((t) => t.id)).toEqual(['attendance']);

    const permittedMore = filterPermittedMoreItems(moreItems, classRepPerms);
    expect(permittedMore).toEqual([]);

    const adminTabs = filterPermittedTabs(tabs, superadminPerms, moreItems);
    expect(adminTabs.map((t) => t.id)).toEqual(['calendar', 'attendance', 'more']);
  });
});
