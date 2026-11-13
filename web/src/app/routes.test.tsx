import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DANCER_TABS, ADMIN_TABS, ADMIN_MORE_ITEMS, AdminRouteGuard } from './routes';
import { session } from '../lib/session';

describe('Dancer Navigation Structure', () => {
  it('contains Home, Library, Studio, and Me tabs in order', () => {
    expect(DANCER_TABS.map(t => ({ id: t.id, label: t.label, path: t.path }))).toEqual([
      { id: 'calendar', label: 'Home', path: '/' },
      { id: 'library', label: 'Library', path: '/library' },
      { id: 'studio', label: 'Studio', path: '/studio' },
      { id: 'me', label: 'Me', path: '/me' }
    ]);
  });
});

describe('Admin Navigation Structure', () => {
  it('does not contain Today tab in primary tabs', () => {
    const hasToday = ADMIN_TABS.some(t => t.id === 'today' || t.label.toLowerCase() === 'today');
    expect(hasToday).toBe(false);
  });

  it('contains Calendar, Attendance, Media, Library, Dancers, and More in primary tabs', () => {
    const tabIds = ADMIN_TABS.map(t => t.id);
    expect(tabIds).toContain('calendar');
    expect(tabIds).toContain('attendance');
    expect(tabIds).toContain('media');
    expect(tabIds).toContain('library');
    expect(tabIds).toContain('members');
    expect(tabIds).toContain('more');
    expect(ADMIN_TABS[0].id).toBe('calendar');
    expect(ADMIN_TABS[0].path).toBe('/admin/calendar');
    const libTab = ADMIN_TABS.find(t => t.id === 'library');
    expect(libTab?.path).toBe('/admin/library');
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

describe('AdminRouteGuard for /admin/library and /admin/studio', () => {
  beforeEach(() => {
    session.clear();
  });

  const renderGuarded = (initialPath: string) =>
    render(
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/admin/library"
            element={
              <AdminRouteGuard path="/admin/library">
                <div>LIBRARY CONTENT</div>
              </AdminRouteGuard>
            }
          />
          <Route
            path="/admin/studio"
            element={
              <AdminRouteGuard path="/admin/studio">
                <div>STUDIO CONTENT</div>
              </AdminRouteGuard>
            }
          />
          <Route path="/admin/attendance" element={<div>ATTENDANCE REDIRECT</div>} />
        </Routes>
      </MemoryRouter>
    );

  it('redirects attendance-only class rep away from /admin/library and /admin/studio to /admin/attendance', () => {
    session.set('tok-rep', {
      sub: 'rep',
      role: 'admin',
      name: 'Class Rep',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: { 'attendance.view.all': '*', 'attendance.edit': '*' }
    });

    const { unmount } = renderGuarded('/admin/library');
    expect(screen.getByText('ATTENDANCE REDIRECT')).toBeInTheDocument();
    expect(screen.queryByText('LIBRARY CONTENT')).not.toBeInTheDocument();
    unmount();

    renderGuarded('/admin/studio');
    expect(screen.getByText('ATTENDANCE REDIRECT')).toBeInTheDocument();
    expect(screen.queryByText('STUDIO CONTENT')).not.toBeInTheDocument();
  });

  it('allows media/music rep to access /admin/library and /admin/studio', () => {
    session.set('tok-media', {
      sub: 'media',
      role: 'admin',
      name: 'Media Rep',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: { 'music.view': '*' }
    });

    const { unmount } = renderGuarded('/admin/library');
    expect(screen.getByText('LIBRARY CONTENT')).toBeInTheDocument();
    unmount();

    renderGuarded('/admin/studio');
    expect(screen.getByText('STUDIO CONTENT')).toBeInTheDocument();
  });
});
