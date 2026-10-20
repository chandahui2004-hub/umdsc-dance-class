// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { StylesPage } from './StylesPage';

const mockCall = vi.fn();
vi.mock('../../lib/api', () => ({
  api: {
    post: (...args: any[]) => mockCall(...args)
  },
  errorMessage: (err: any) => String(err)
}));

const mockStyles = [
  {
    id: 'st-pop',
    name: 'Popping',
    aliases: ['pop', 'boogaloo'],
    version: 1,
    attendanceFolderId: 'folder-1',
    videoFolderId: ''
  }
];

const mockInstructors = [
  { id: 'inst-1', name: 'Carmen Loh', active: true, styleIds: ['st-pop'] }
];

describe('StylesPage', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    mockCall.mockImplementation(async (action: string) => {
      if (action === 'styles.list') return { data: mockStyles };
      if (action === 'instructors.list') return { data: mockInstructors };
      return { data: [] };
    });
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StylesPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

  it('style cards do not display default schedule or venue', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Popping')[0]).toBeInTheDocument();
    });

    expect(screen.queryByText(/Schedule:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Venue:/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Carmen Loh/i)).toBeInTheDocument();
  });

  it('create style modal does not display default day, time, or venue inputs', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /\+ NEW STYLE/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /\+ NEW STYLE/i }));

    expect(screen.getByLabelText(/Style Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Aliases/i)).toBeInTheDocument();

    // Verify removed fields are not present
    expect(screen.queryByLabelText(/Default Day/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Start Time/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/End Time/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Default Venue/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/DEFAULT SCHEDULE & VENUE/i)).not.toBeInTheDocument();
  });
});
