import { describe, it, expect } from 'vitest';
import { ADMIN_TABS, ADMIN_MORE_ITEMS } from './routes';

describe('Admin Navigation Structure', () => {
  it('does not contain Today tab in primary tabs', () => {
    const hasToday = ADMIN_TABS.some(t => t.id === 'today' || t.label.toLowerCase() === 'today');
    expect(hasToday).toBe(false);
  });

  it('contains Calendar, Attendance, Media, and Dancers in primary tabs', () => {
    const tabIds = ADMIN_TABS.map(t => t.id);
    expect(tabIds).toContain('calendar');
    expect(tabIds).toContain('attendance');
    expect(tabIds).toContain('media');
    expect(tabIds).toContain('members');
    expect(tabIds).toContain('more');
  });

  it('contains exactly the 6 sub-items inside ADMIN_MORE_ITEMS', () => {
    const moreIds = ADMIN_MORE_ITEMS.map(item => item.id);
    expect(moreIds).toEqual([
      'styles',
      'instructors',
      'roles',
      'admins',
      'settings',
      'events'
    ]);
  });
});
