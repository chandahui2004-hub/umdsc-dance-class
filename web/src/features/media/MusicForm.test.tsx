import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DanceStyle } from '@umdsc/shared';
import { MusicForm } from './MusicForm';

vi.mock('../../lib/api', () => ({
  api: { post: vi.fn() },
  errorMessage: (e: unknown) => String(e)
}));

const style = { id: 'st1', name: 'Locking' } as DanceStyle;

describe('MusicForm', () => {
  it('recommends MP3 for the most reliable practice playback', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MusicForm style={style} eventId="e1" sessions={[]} onClose={() => {}} onSuccess={() => {}} />
      </QueryClientProvider>
    );
    expect(
      screen.getByText('Tip: upload an MP3 for the most reliable practice playback (works offline, on every phone).')
    ).toBeInTheDocument();
  });
});
