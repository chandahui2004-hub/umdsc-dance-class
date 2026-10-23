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

  it('collapses dance styles by default and expands on click like EventsPage', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('toggle-style-st-pop')).toBeInTheDocument();
    });

    // In collapsed state, toggle button shows style name and EXPAND ▼
    expect(screen.getByTestId('toggle-style-st-pop')).toHaveTextContent('Popping');
    expect(screen.getByTestId('toggle-style-st-pop')).toHaveTextContent('EXPAND ▼');
    expect(screen.getByTestId('toggle-style-st-pop')).toHaveTextContent('1 INSTRUCTOR');

    // Details like Aliases and EDIT button are not yet in the document
    expect(screen.queryByRole('button', { name: /^EDIT$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Aliases:/i)).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(screen.getByTestId('toggle-style-st-pop'));

    // In expanded state: toggle label changes to COLLAPSE ▲ and details appear
    expect(screen.getByTestId('toggle-style-st-pop')).toHaveTextContent('COLLAPSE ▲');
    expect(screen.getByRole('button', { name: /^EDIT$/i })).toBeInTheDocument();
    expect(screen.getByText(/Aliases:/i)).toBeInTheDocument();
    expect(screen.getByText('pop')).toBeInTheDocument();
    expect(screen.getByText('boogaloo')).toBeInTheDocument();
    expect(screen.getByText(/Attendance Folder:/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^DEACTIVATE$/i })).toBeInTheDocument();

    // Click again to collapse
    fireEvent.click(screen.getByTestId('toggle-style-st-pop'));
    expect(screen.getByTestId('toggle-style-st-pop')).toHaveTextContent('EXPAND ▼');
    expect(screen.queryByRole('button', { name: /^EDIT$/i })).not.toBeInTheDocument();
  });

  it('supports EXPAND ALL and COLLAPSE ALL for all styles', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /EXPAND ALL/i })).toBeInTheDocument();
    });

    // Click EXPAND ALL
    fireEvent.click(screen.getByRole('button', { name: /EXPAND ALL/i }));

    // Now button flips to COLLAPSE ALL and details are revealed
    expect(screen.getByRole('button', { name: /COLLAPSE ALL/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^EDIT$/i })).toBeInTheDocument();

    // Click COLLAPSE ALL
    fireEvent.click(screen.getByRole('button', { name: /COLLAPSE ALL/i }));
    expect(screen.getByRole('button', { name: /EXPAND ALL/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^EDIT$/i })).not.toBeInTheDocument();
  });
});
