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
vi.mock('../../lib/session', () => ({
  session: {
    get: () => ({ claims: { name: 'Test Dancer', sub: '1', role: 'dancer' } }),
    set: vi.fn(),
    clear: () => {}
  }
}));

const mockCall = vi.fn();
vi.mock('../../lib/api', () => ({
  call: (...args: any[]) => mockCall(...args),
  errorMessage: (e: any) => e?.message || 'Error'
}));

vi.mock('../../lib/queryClient', () => ({
  queryClient: {
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn().mockResolvedValue(undefined)
  }
}));

import { MePage } from './MePage';
import { fireEvent, waitFor } from '@testing-library/react';
import { session } from '../../lib/session';

const renderMe = () =>
  render(
    <MemoryRouter>
      <MePage />
    </MemoryRouter>
  );

describe('MePage attendance totals and profile editing', () => {
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

  it('opens edit profile dialog and submits selfEdit', async () => {
    mockCall.mockResolvedValueOnce({
      data: {
        token: 'new-token',
        claims: { name: 'Renamed Dancer', sub: '22001122', role: 'dancer' },
        bootstrap: { profile: { matricKey: '22001122', fullName: 'Renamed Dancer' } }
      },
      dataVersion: 5
    });

    renderMe();
    const editBtn = screen.getByRole('button', { name: /EDIT INFO/i });
    expect(editBtn).toBeInTheDocument();
    fireEvent.click(editBtn);

    // Verify dialog appears
    expect(screen.getByText('EDIT PERSONAL INFO')).toBeInTheDocument();
    const nameInput = screen.getByLabelText(/FULL NAME/i);
    const matricInput = screen.getByLabelText(/MATRIC NUMBER/i);

    fireEvent.change(nameInput, { target: { value: 'Renamed Dancer' } });
    fireEvent.change(matricInput, { target: { value: '22001122' } });

    const saveBtn = screen.getByRole('button', { name: /SAVE CHANGES/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockCall).toHaveBeenCalledWith('members.selfEdit', {
        newFullName: 'Renamed Dancer',
        newMatric: '22001122'
      });
    });

    expect(session.set).toHaveBeenCalledWith(
      'new-token',
      { name: 'Renamed Dancer', sub: '22001122', role: 'dancer' },
      true
    );
  });
});
