import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

    // Wait for the queries to resolve with the non-array mock
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('music.list', {});
      expect(api.post).toHaveBeenCalledWith('styles.list', {});
      expect(api.post).toHaveBeenCalledWith('events.list', { includeArchived: true });
      expect(queryClient.getQueryData(['music'])).toEqual({});
      expect(queryClient.getQueryData(['styles'])).toEqual({});
      expect(queryClient.getQueryData(['events'])).toEqual({});
    });

    // After live queries return non-arrays, Studio must still display the bootstrap song and metadata
    await waitFor(() => {
      expect(screen.getByText(/Hip Hop Routine Song/i)).toBeInTheDocument();
      expect(screen.getAllByText('OCT').length).toBeGreaterThan(0);
    });
  });

  it('Studio preserves queryClient cache without firing duplicate network calls on immediate remount', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    });

    vi.mocked(api.post).mockClear();

    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/studio']}>
          <Studio />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('music.list', {});
      expect(api.post).toHaveBeenCalledWith('styles.list', {});
      expect(api.post).toHaveBeenCalledWith('events.list', { includeArchived: true });
    });

    vi.mocked(api.post).mockClear();

    unmount();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/studio']}>
          <Studio />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // StaleTime ensures no immediate duplicate network calls fire on remount
    expect(api.post).not.toHaveBeenCalledWith('styles.list', {});
    expect(api.post).not.toHaveBeenCalledWith('events.list', { includeArchived: true });
    expect(api.post).not.toHaveBeenCalledWith('music.list', {});
    expect(queryClient.getQueryData(['styles'])).toBeDefined();
    expect(queryClient.getQueryData(['events'])).toBeDefined();
    expect(queryClient.getQueryData(['music'])).toBeDefined();
  });
});
