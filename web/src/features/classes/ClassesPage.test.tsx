import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ClassesPage } from './ClassesPage';

const mockCall = vi.fn();
vi.mock('../../lib/api', () => ({
  call: (...args: any[]) => mockCall(...args),
  errorMessage: (err: any) => String(err)
}));

const mockEvents = [
  { id: 'evt-trial', name: 'TRIAL CLASS 2026', startDate: '2026-10-01', endDate: '2026-10-10', status: 'active', styleIds: ['st-pop', 'st-lat'], styleInstructors: { 'st-pop': ['inst-lam'], 'st-lat': ['inst-lam', 'inst-kelvin'] } },
  { id: 'evt-oct', name: 'OCT MONTHLY CLASS', startDate: '2026-10-11', endDate: '2026-10-31', status: 'active', styleIds: ['st-pop', 'st-hip'], styleInstructors: { 'st-pop': ['inst-carmen'], 'st-hip': ['inst-kelvin'] } }
];

let mockCurrentEventState = {
  events: mockEvents,
  current: null as any,
  setCurrentId: vi.fn(),
  isLoading: false,
  isAll: true
};

vi.mock('../events/useCurrentEvent', () => ({
  useCurrentEvent: () => mockCurrentEventState
}));

const mockStyles = [
  { id: 'st-pop', name: 'Popping', colorKey: 'blue', active: true, defaultStart: '20:00', defaultEnd: '21:30', defaultInstructorId: 'inst-carmen' },
  { id: 'st-lat', name: 'Latin', colorKey: 'pink', active: true, defaultStart: '20:00', defaultEnd: '22:00', defaultInstructorId: 'inst-lam' },
  { id: 'st-hip', name: 'Hip Hop', colorKey: 'orange', active: true, defaultStart: '20:00', defaultEnd: '22:00', defaultInstructorId: 'inst-kelvin' }
];

const mockInstructors = [
  { id: 'inst-carmen', name: 'Carmen Loh', active: true },
  { id: 'inst-lam', name: 'Lam Hong Woh', active: true },
  { id: 'inst-kelvin', name: 'Newstyle Kelvin', active: true }
];

const mockSessions = [
  {
    id: 's1',
    eventId: 'evt-trial',
    styleId: 'st-pop',
    seq: 1,
    date: '2026-10-05',
    start: '20:00',
    end: '21:30',
    instructorId: 'inst-carmen',
    venue: 'Studio A',
    status: 'scheduled',
    active: true
  },
  {
    id: 's2',
    eventId: 'evt-trial',
    styleId: 'st-lat',
    seq: 1,
    date: '2026-10-06',
    start: '20:00',
    end: '22:00',
    instructorId: 'inst-lam',
    venue: 'Studio B',
    status: 'scheduled',
    active: true
  },
  {
    id: 's3',
    eventId: 'evt-oct',
    styleId: 'st-hip',
    seq: 1,
    date: '2026-10-14',
    start: '20:00',
    end: '22:00',
    instructorId: 'inst-kelvin',
    venue: 'Studio A',
    status: 'scheduled',
    active: true
  }
];

describe('ClassesPage Filter Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });

    mockCall.mockImplementation(async (action: string) => {
      if (action === 'styles.list') return { ok: true, data: mockStyles };
      if (action === 'instructors.list') return { ok: true, data: mockInstructors };
      if (action === 'sessions.list') return { ok: true, data: mockSessions };
      return { ok: true, data: [] };
    });
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ClassesPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

  it('renders all classes initially with filter dropdowns', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText(/Popping Class 1/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/Latin Class 1/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/Hip Hop Class 1/i)[0]).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/Filter classes by dance style/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Filter classes by instructor/i)).toBeInTheDocument();
    expect(screen.getByTestId('classes-count-badge')).toHaveTextContent(/SHOWING 3 OF 3 CLASSES/i);
  });

  it('filters classes by dance style', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText(/Popping Class 1/i)[0]).toBeInTheDocument();
    });

    // Select Popping
    fireEvent.change(screen.getByLabelText(/Filter classes by dance style/i), {
      target: { value: 'st-pop' }
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Popping Class 1/i)[0]).toBeInTheDocument();
      expect(screen.queryByText(/Latin Class 1/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Hip Hop Class 1/i)).not.toBeInTheDocument();
      expect(screen.getByTestId('classes-count-badge')).toHaveTextContent(/SHOWING 1 OF 3 CLASSES/i);
    });
  });

  it('filters classes by instructor', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText(/Latin Class 1/i)[0]).toBeInTheDocument();
    });

    // Select Lam Hong Woh
    fireEvent.change(screen.getByLabelText(/Filter classes by instructor/i), {
      target: { value: 'Lam Hong Woh' }
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Latin Class 1/i)[0]).toBeInTheDocument();
      expect(screen.queryByText(/Popping Class 1/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Hip Hop Class 1/i)).not.toBeInTheDocument();
      expect(screen.getByTestId('classes-count-badge')).toHaveTextContent(/SHOWING 1 OF 3 CLASSES/i);
    });
  });

  it('shows empty state when no classes match filters and allows reset', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText(/Popping Class 1/i)[0]).toBeInTheDocument();
    });

    // Filter by Popping and Lam Hong Woh (no match)
    fireEvent.change(screen.getByLabelText(/Filter classes by dance style/i), {
      target: { value: 'st-pop' }
    });
    fireEvent.change(screen.getByLabelText(/Filter classes by instructor/i), {
      target: { value: 'Lam Hong Woh' }
    });

    await waitFor(() => {
      expect(screen.getByText('NO CLASSES MATCH FILTERS')).toBeInTheDocument();
      expect(screen.getByTestId('classes-count-badge')).toHaveTextContent(/SHOWING 0 OF 3 CLASSES/i);
    });

    // Click Reset
    fireEvent.click(screen.getAllByRole('button', { name: /RESET FILTERS/i })[0]);

    await waitFor(() => {
      expect(screen.getAllByText(/Popping Class 1/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/Latin Class 1/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/Hip Hop Class 1/i)[0]).toBeInTheDocument();
      expect(screen.getByTestId('classes-count-badge')).toHaveTextContent(/SHOWING 3 OF 3 CLASSES/i);
    });
  });

  it("the class editor offers only the event's instructors for the style, plus a current one outside the list", async () => {
    renderComponent();
    await waitFor(() => expect(screen.getAllByText(/Popping Class 1/i)[0]).toBeInTheDocument());

    // s1: Popping in evt-trial, list = [Lam], current = Carmen (outside the list)
    fireEvent.click(screen.getAllByText(/Popping Class 1/i)[0]);
    const select = (await screen.findByLabelText(/^Instructor$/i)) as HTMLSelectElement;
    const labels = Array.from(select.options).map(o => o.textContent);
    expect(labels).toEqual(['Select Instructor...', 'Lam Hong Woh', "Carmen Loh (not in this event's list)"]);
    expect(select.value).toBe('inst-carmen');
  });

  it('the class editor does not fall back to the style default instructor', async () => {
    mockCall.mockImplementation(async (action: string) => {
      if (action === 'styles.list') return { ok: true, data: mockStyles };
      if (action === 'instructors.list') return { ok: true, data: mockInstructors };
      if (action === 'sessions.list') return { ok: true, data: [{ ...mockSessions[1], instructorId: '' }] };
      return { ok: true, data: [] };
    });
    renderComponent();
    await waitFor(() => expect(screen.getAllByText(/Latin Class 1/i)[0]).toBeInTheDocument());
    fireEvent.click(screen.getAllByText(/Latin Class 1/i)[0]);
    const select = (await screen.findByLabelText(/^Instructor$/i)) as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(screen.queryByText(/Default instructor for/i)).not.toBeInTheDocument();
    expect(Array.from(select.options).map(o => o.textContent)).toEqual(['Select Instructor...', 'Lam Hong Woh', 'Newstyle Kelvin']);
  });
});
