import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

if (typeof window !== 'undefined') {
  window.PointerEvent = window.MouseEvent as any;
}

vi.mock('../../lib/api', () => ({
  api: {
    post: vi.fn().mockResolvedValue({ data: {} })
  }
}));

vi.mock('../../lib/session', () => ({
  session: {
    get: () => ({
      claims: {
        sub: 'M-12345',
        role: 'dancer',
        name: 'Test Dancer',
        perms: {}
      }
    })
  }
}));

vi.mock('../auth/useBootstrap', () => ({
  useBootstrap: () => ({
    isLoading: false,
    data: {
      profile: { matricKey: '12345', fullName: 'Test Dancer', eventIds: ['e1'], perms: {} },
      events: [{ id: 'e1', name: 'OCT', type: 'monthly', startDate: '2026-10-01', endDate: '2026-10-31', status: 'active', styleIds: ['st1'] }],
      styles: [{ id: 'st1', name: 'Hip Hop', colorKey: 'orange' }],
      music: [
        {
          id: 'm1',
          styleId: 'st1',
          eventId: 'e1',
          title: 'Hip Hop Routine Song',
          sourceType: 'youtube',
          youtubeId: 'vid123',
          active: true
        }
      ],
      sections: [],
      videos: []
    }
  })
}));

import { waitFor } from '@testing-library/react';
import { api } from '../../lib/api';
import { Studio } from './Studio';

describe('Studio guard against non-array live queries', () => {
  it('Studio falls back to bootstrap lists when live queries return non-arrays', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/studio']}>
          <Studio />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Wait for the query to resolve with the non-array mock
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('music.list', {});
      expect(queryClient.getQueryData(['music'])).toEqual({});
    });

    // After live queries return non-arrays, Studio must still display the bootstrap song and not crash
    await waitFor(() => {
      expect(screen.getByText(/Hip Hop Routine Song/i)).toBeInTheDocument();
    });
  });
});

