import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let attendanceState = { attendance: [] as { sessionId: string; present: boolean }[], isLoading: true };

vi.mock('../auth/useBootstrap', () => ({
  useBootstrap: () => ({
    isLoading: false,
    data: {
      profile: { matricKey: '1', fullName: 'Test Dancer', eventIds: ['e1'], perms: {} },
      events: [{ id: 'e1', name: 'OCT', type: 'monthly', startDate: '2026-10-01', endDate: '2026-10-31', status: 'active', styleIds: ['st1'] }],
      styles: [{ id: 'st1', name: 'Locking', colorKey: 'orange' }],
      sessions: [
        { id: 's1', eventId: 'e1', styleId: 'st1', seq: 1, date: '2026-10-15' },
        { id: 's2', eventId: 'e1', styleId: 'st1', seq: 2, date: '2026-10-22' }
      ],
      attendance: []
    }
  })
}));
vi.mock('../auth/useDancerAttendance', () => ({ useDancerAttendance: () => attendanceState }));
vi.mock('../../lib/session', () => ({ session: { get: () => ({ claims: { name: 'Test Dancer' } }), clear: () => {} } }));

import { MePage } from './MePage';

const renderMe = () =>
  render(
    <MemoryRouter>
      <MePage />
    </MemoryRouter>
  );

describe('MePage attendance totals', () => {
  it('does not show 0 / N while attendance is still loading', () => {
    attendanceState = { attendance: [], isLoading: true };
    renderMe();
    expect(screen.queryByText(/^0 \/ 2 classes$/)).toBeNull();
    expect(screen.getByText('… / 2 classes')).toBeInTheDocument();
  });

  it('shows the real total once attendance has loaded', () => {
    attendanceState = { attendance: [{ sessionId: 's1', present: true }], isLoading: false };
    renderMe();
    expect(screen.getByText('1 / 2 classes')).toBeInTheDocument();
  });
});
