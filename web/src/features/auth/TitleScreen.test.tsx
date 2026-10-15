import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TitleScreen } from './TitleScreen';
import * as api from '../../lib/api';

vi.mock('../../lib/api', () => ({
  call: vi.fn(),
  errorMessage: (e: any) => e?.message || 'Error'
}));

vi.mock('../../lib/session', () => ({
  session: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    clear: vi.fn()
  }
}));

describe('TitleScreen Autocomplete & Smart Features', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('queries auth.suggestDancers when typing >= 2 chars in name field, shows suggestions, and 1-tap directly logs in on select', async () => {
    vi.mocked(api.call).mockImplementation(async (action: string) => {
      if (action === 'auth.suggestDancers') {
        return {
          ok: true,
          data: {
            suggestions: [
              { fullName: 'Ahmad Fiqri Bin Mohd Zamri', matric: '22004591' }
            ]
          },
          dataVersion: 1,
          serverTime: ''
        };
      }
      if (action === 'auth.dancerLogin') {
        return {
          ok: true,
          data: {
            token: 'mock-token',
            claims: { sub: 'M-22004591', role: 'dancer', name: 'Ahmad Fiqri Bin Mohd Zamri', exp: 123456, pv: 1, perms: {} }
          },
          dataVersion: 1,
          serverTime: ''
        };
      }
      return { ok: true, data: {}, dataVersion: 1, serverTime: '' };
    });

    render(
      <MemoryRouter>
        <TitleScreen />
      </MemoryRouter>
    );

    const nameInput = screen.getByLabelText(/Full Name/i);
    fireEvent.change(nameInput, { target: { value: 'Ah' } });

    await waitFor(() => {
      expect(api.call).toHaveBeenCalledWith('auth.suggestDancers', {
        query: 'Ah',
        type: 'name'
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Ahmad Fiqri Bin Mohd Zamri')).toBeInTheDocument();
      expect(screen.getByText('22004591')).toBeInTheDocument();
    });

    // Clicking suggestion executes Proposal 1: 1-Tap Instant Login!
    fireEvent.click(screen.getByText('Ahmad Fiqri Bin Mohd Zamri'));

    await waitFor(() => {
      expect(api.call).toHaveBeenCalledWith('auth.dancerLogin', {
        fullName: 'Ahmad Fiqri Bin Mohd Zamri',
        matric: '22004591',
        matricRaw: '22004591'
      });
    });
  });

  it('queries auth.suggestDancers when typing >= 3 chars in matric field and logs in on select', async () => {
    vi.mocked(api.call).mockImplementation(async (action: string) => {
      if (action === 'auth.suggestDancers') {
        return {
          ok: true,
          data: {
            suggestions: [
              { fullName: 'Tan Wei Jie', matric: 'S2100047' }
            ]
          },
          dataVersion: 1,
          serverTime: ''
        };
      }
      if (action === 'auth.dancerLogin') {
        return {
          ok: true,
          data: {
            token: 'mock-token-2',
            claims: { sub: 'M-S2100047', role: 'dancer', name: 'Tan Wei Jie', exp: 123456, pv: 1, perms: {} }
          },
          dataVersion: 1,
          serverTime: ''
        };
      }
      return { ok: true, data: {}, dataVersion: 1, serverTime: '' };
    });

    render(
      <MemoryRouter>
        <TitleScreen />
      </MemoryRouter>
    );

    const matricInput = screen.getByLabelText(/Matric Number/i);
    fireEvent.change(matricInput, { target: { value: 'S21' } });

    await waitFor(() => {
      expect(api.call).toHaveBeenCalledWith('auth.suggestDancers', {
        query: 'S21',
        type: 'matric'
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Tan Wei Jie')).toBeInTheDocument();
      expect(screen.getByText('S2100047')).toBeInTheDocument();
    });

    // Clicking suggestion 1-tap logs in
    fireEvent.click(screen.getByText('Tan Wei Jie'));

    await waitFor(() => {
      expect(api.call).toHaveBeenCalledWith('auth.dancerLogin', {
        fullName: 'Tan Wei Jie',
        matric: 'S2100047',
        matricRaw: 'S2100047'
      });
    });
  });

  it('shows returning dancer quick chip when saved in localStorage and logs in with 1-tap (Proposal 4)', async () => {
    localStorage.setItem(
      'umdsc_last_dancer',
      JSON.stringify({ fullName: 'Sarah Binti Ahmad', matric: '17201234' })
    );

    vi.mocked(api.call).mockResolvedValue({
      data: {
        token: 'sarah-token',
        claims: { sub: 'M-17201234', role: 'dancer', name: 'Sarah Binti Ahmad', exp: 123456, pv: 1, perms: {} }
      },
      dataVersion: 1,
      serverTime: ''
    } as any);

    render(
      <MemoryRouter>
        <TitleScreen />
      </MemoryRouter>
    );

    expect(screen.getByText(/RETURNING DANCER/i)).toBeInTheDocument();
    expect(screen.getByText('Sarah Binti Ahmad')).toBeInTheDocument();
    expect(screen.getByText('17201234')).toBeInTheDocument();

    const quickInBtn = screen.getByRole('button', { name: /1-TAP IN ►/i });
    fireEvent.click(quickInBtn);

    await waitFor(() => {
      expect(api.call).toHaveBeenCalledWith('auth.dancerLogin', {
        fullName: 'Sarah Binti Ahmad',
        matric: '17201234',
        matricRaw: '17201234'
      });
    });
  });

  it('switches to Walk-In mode and authenticates via auth.walkInLogin', async () => {
    vi.mocked(api.call).mockImplementation(async (action: string) => {
      if (action === 'auth.walkInLogin') {
        return {
          ok: true,
          data: {
            token: 'walkin-token-123',
            claims: { sub: 'W-s1-alex', name: 'Alex Tan (Walk-In)', role: 'dancer' },
            bootstrap: {
              profile: { fullName: 'Alex Tan (Walk-In)', matricKey: 'WALK-IN' },
              sessions: [{ id: 's1' }]
            }
          },
          dataVersion: 1,
          serverTime: ''
        };
      }
      return { ok: true, data: {}, dataVersion: 1, serverTime: '' };
    });

    render(
      <MemoryRouter>
        <TitleScreen />
      </MemoryRouter>
    );

    // Click Walk-In toggle
    const walkInTab = screen.getByRole('button', { name: /WALK-IN PASS/i });
    fireEvent.click(walkInTab);

    // Should see Class Code and Your Name fields
    const codeInput = screen.getByLabelText(/Class Code/i);
    const nameInput = screen.getByLabelText(/Your Name/i);

    fireEvent.change(codeInput, { target: { value: 'lck-7x9' } });
    fireEvent.change(nameInput, { target: { value: 'Alex Tan' } });

    const submitBtn = screen.getByRole('button', { name: /ENTER CLASS/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.call).toHaveBeenCalledWith('auth.walkInLogin', {
        code: 'LCK-7X9',
        name: 'Alex Tan'
      });
    });
  });
});

