import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UserInfoBoard } from './UserInfoBoard';
import { session } from '../../lib/session';

describe('UserInfoBoard', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders dancer role, name, and matriks number', () => {
    session.set('tok-dancer', {
      sub: 'M-17201234',
      role: 'dancer',
      name: 'Tan Ah Kow',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: {}
    });

    render(
      <MemoryRouter>
        <UserInfoBoard />
      </MemoryRouter>
    );

    expect(screen.getByTestId('user-role-badge')).toHaveTextContent('DANCER');
    expect(screen.getByTestId('user-name-display')).toHaveTextContent('Tan Ah Kow');
    expect(screen.getByTestId('user-matriks-display')).toHaveTextContent('17201234');
    expect(screen.getByTestId('live-clock')).toBeInTheDocument();
    expect(screen.getByTestId('sign-out-btn')).toBeInTheDocument();
  });

  it('renders admin role, display name, and staff matriks indicator', () => {
    session.set('tok-admin', {
      sub: 'admin_boss',
      role: 'admin',
      name: 'Super Admin',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: {}
    });

    render(
      <MemoryRouter>
        <UserInfoBoard />
      </MemoryRouter>
    );

    expect(screen.getByTestId('user-role-badge')).toHaveTextContent('ADMIN');
    expect(screen.getByTestId('user-name-display')).toHaveTextContent('Super Admin');
    expect(screen.getByTestId('user-matriks-display')).toHaveTextContent('STAFF (admin_boss)');
  });

  it('renders custom role name (e.g. CLASS REP) when roleName is provided in claims', () => {
    session.set('tok-classrep', {
      sub: 'classrep_user',
      role: 'admin',
      roleName: 'Class Rep',
      name: 'Class Representative',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: { 'attendance.view.all': '*', 'attendance.edit': '*' }
    });

    render(
      <MemoryRouter>
        <UserInfoBoard />
      </MemoryRouter>
    );

    expect(screen.getByTestId('user-role-badge')).toHaveTextContent('CLASS REP');
    expect(screen.getByTestId('user-name-display')).toHaveTextContent('Class Representative');
    expect(screen.getByTestId('user-matriks-display')).toHaveTextContent('STAFF (classrep_user)');
  });

  it('stacks long role names onto a full-width wrapping row and wraps long usernames/matriks inside the frame', () => {
    session.set('tok-viewer', {
      sub: 'mda_long_username_account',
      role: 'admin',
      roleName: 'Attendance Viewer',
      name: 'Very Long Username Display String',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: { 'attendance.view.all': '*' }
    });

    render(
      <MemoryRouter>
        <UserInfoBoard />
      </MemoryRouter>
    );

    const badge = screen.getByTestId('user-role-badge');
    expect(badge).toHaveTextContent('ATTENDANCE VIEWER');
    expect(badge.className).toContain('w-full');
    expect(badge.className).toContain('break-words');
    expect(badge.parentElement?.className).toContain('flex-col');

    const nameEl = screen.getByTestId('user-name-display');
    const matriksEl = screen.getByTestId('user-matriks-display');
    expect(nameEl.className).toContain('break-words');
    expect(matriksEl.className).toContain('break-words');
  });

  it('clicking sign out clears session', () => {
    session.set('tok-dancer', {
      sub: '17201234',
      role: 'dancer',
      name: 'Sarah',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: {}
    });

    expect(session.get()).not.toBeNull();

    render(
      <MemoryRouter>
        <UserInfoBoard />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('sign-out-btn'));
    expect(session.get()).toBeNull();
  });

  it('renders compact mode with compact avatar and clock', () => {
    session.set('tok-dancer', {
      sub: '17201234',
      role: 'dancer',
      name: 'Sarah',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: {}
    });

    render(
      <MemoryRouter>
        <UserInfoBoard compact />
      </MemoryRouter>
    );

    expect(screen.getByTestId('user-info-board-compact')).toBeInTheDocument();
    expect(screen.getByTestId('user-role-avatar-compact')).toHaveAttribute('aria-label', 'Dancer Profile');
    expect(screen.getByTestId('sign-out-btn-compact')).toBeInTheDocument();
    expect(screen.getByTestId('live-clock-compact')).toBeInTheDocument();
  });

  it('renders admin crown icon in compact mode for admin role', () => {
    session.set('tok-admin', {
      sub: 'admin_boss',
      role: 'admin',
      name: 'Super Admin',
      exp: Math.floor(Date.now() / 1000) + 3600,
      pv: 1,
      perms: {}
    });

    render(
      <MemoryRouter>
        <UserInfoBoard compact />
      </MemoryRouter>
    );

    expect(screen.getByTestId('user-role-avatar-compact')).toHaveAttribute('aria-label', 'Admin Profile');
  });
});
