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
    expect(screen.getByTestId('sign-out-btn-compact')).toBeInTheDocument();
    expect(screen.getByTestId('live-clock-compact')).toBeInTheDocument();
  });
});
