// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DaySheet } from './DaySheet';
import type { ISODate, ClassSession, DanceStyle, Instructor } from '@umdsc/shared';

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const mockDate: ISODate = '2026-10-15';

const mockMeta = {
  version: 1,
  updatedBy: 'admin',
  updatedAt: '2026-10-01T00:00:00.000Z',
  active: true
};

const mockSessions: ClassSession[] = [
  {
    id: 's1',
    eventId: 'evt-1',
    styleId: 'style-salsa',
    seq: 1,
    date: '2026-10-15',
    start: '19:00',
    end: '20:30',
    venue: 'Studio A',
    instructorId: 'inst-1',
    status: 'scheduled',
    note: '',
    ...mockMeta
  },
  {
    id: 's2',
    eventId: 'evt-1',
    styleId: 'style-bachata',
    seq: 2,
    date: '2026-10-15',
    start: '20:30',
    end: '22:00',
    venue: 'Studio B',
    instructorId: 'inst-2',
    status: 'scheduled',
    note: '',
    ...mockMeta
  }
];

const mockStyles: DanceStyle[] = [
  { id: 'style-salsa', name: 'Salsa', level: 'Beginner', ...mockMeta } as unknown as DanceStyle,
  { id: 'style-bachata', name: 'Bachata', level: 'Intermediate', ...mockMeta } as unknown as DanceStyle
];

const mockInstructors: Instructor[] = [
  { id: 'inst-1', name: 'Alex Rivera', styleIds: ['style-salsa'], ...mockMeta } as unknown as Instructor,
  { id: 'inst-2', name: 'Elena Gomez', styleIds: ['style-bachata'], ...mockMeta } as unknown as Instructor
];

describe('DaySheet (Adaptive Dancer & Admin Calendar Sheet)', () => {
  it('does not render when isOpen is false', () => {
    renderWithRouter(
      <DaySheet
        isOpen={false}
        onClose={vi.fn()}
        date={mockDate}
        sessions={mockSessions}
        styles={mockStyles}
        instructors={mockInstructors}
        videos={[]}
        music={[]}
        attendance={[]}
        forceMobile={true}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders with initial 1/3 screen snap on mobile with compact cards and without blocking backdrop', () => {
    renderWithRouter(
      <DaySheet
        isOpen={true}
        onClose={vi.fn()}
        date={mockDate}
        sessions={mockSessions}
        styles={mockStyles}
        instructors={mockInstructors}
        videos={[]}
        music={[]}
        attendance={[]}
        forceMobile={true}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    const panel = screen.getByTestId('day-sheet-panel');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute('data-snap', 'quarter');

    // In 1/4 mode, no backdrop intercepts clicks
    expect(screen.queryByTestId('day-sheet-backdrop')).not.toBeInTheDocument();

    // Shows compact class cards with style, time, venue, and small instructor avatar
    expect(screen.getByTestId('compact-class-s1')).toBeInTheDocument();
    expect(screen.getByTestId('compact-class-s2')).toBeInTheDocument();
    expect(screen.getByText(/Studio A/)).toBeInTheDocument();
    expect(screen.getByText(/19:00 - 20:30/)).toBeInTheDocument();
  });

  it('expands to full screen when tapping directly on a compact class card', () => {
    renderWithRouter(
      <DaySheet
        isOpen={true}
        onClose={vi.fn()}
        date={mockDate}
        sessions={mockSessions}
        styles={mockStyles}
        instructors={mockInstructors}
        videos={[]}
        music={[]}
        attendance={[]}
        forceMobile={true}
      />
    );

    const panel = screen.getByTestId('day-sheet-panel');
    expect(panel).toHaveAttribute('data-snap', 'quarter');

    // Tap on the first compact class card
    const compactCard = screen.getByTestId('compact-class-s1');
    fireEvent.click(compactCard);

    // Should now be expanded to full
    expect(panel).toHaveAttribute('data-snap', 'full');
    expect(screen.getByTestId('day-sheet-backdrop')).toBeInTheDocument();
  });

  it('toggles from 1/4 to full height when drag handle is tapped', () => {
    renderWithRouter(
      <DaySheet
        isOpen={true}
        onClose={vi.fn()}
        date={mockDate}
        sessions={mockSessions}
        styles={mockStyles}
        instructors={mockInstructors}
        videos={[]}
        music={[]}
        attendance={[]}
        forceMobile={true}
      />
    );

    const panel = screen.getByTestId('day-sheet-panel');
    const handle = screen.getByTestId('day-sheet-handle');

    expect(panel).toHaveAttribute('data-snap', 'quarter');

    // Click drag handle to expand
    fireEvent.click(handle);
    expect(panel).toHaveAttribute('data-snap', 'full');
    expect(screen.getByTestId('day-sheet-backdrop')).toBeInTheDocument();

    // Click drag handle again to collapse back to 1/4
    fireEvent.click(handle);
    expect(panel).toHaveAttribute('data-snap', 'quarter');
  });

  it('handles touch drag up to expand and drag down to collapse / close', () => {
    const handleClose = vi.fn();
    renderWithRouter(
      <DaySheet
        isOpen={true}
        onClose={handleClose}
        date={mockDate}
        sessions={mockSessions}
        styles={mockStyles}
        instructors={mockInstructors}
        videos={[]}
        music={[]}
        attendance={[]}
        forceMobile={true}
      />
    );

    const panel = screen.getByTestId('day-sheet-panel');
    const handleArea = screen.getByTestId('day-sheet-drag-area');

    // Drag up from 1/4: deltaY = -40px -> snap to full
    fireEvent.touchStart(handleArea, { touches: [{ clientY: 300 }] });
    fireEvent.touchMove(handleArea, { touches: [{ clientY: 250 }] });
    fireEvent.touchEnd(handleArea);

    expect(panel).toHaveAttribute('data-snap', 'full');

    // Drag down from full: deltaY = +40px -> snap back to 1/4
    fireEvent.touchStart(handleArea, { touches: [{ clientY: 200 }] });
    fireEvent.touchMove(handleArea, { touches: [{ clientY: 250 }] });
    fireEvent.touchEnd(handleArea);

    expect(panel).toHaveAttribute('data-snap', 'quarter');

    // Drag down from 1/4: deltaY = +60px -> close sheet
    fireEvent.touchStart(handleArea, { touches: [{ clientY: 200 }] });
    fireEvent.touchMove(handleArea, { touches: [{ clientY: 270 }] });
    fireEvent.touchEnd(handleArea);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close button is clicked in either mode', () => {
    const handleClose = vi.fn();
    renderWithRouter(
      <DaySheet
        isOpen={true}
        onClose={handleClose}
        date={mockDate}
        sessions={mockSessions}
        styles={mockStyles}
        instructors={mockInstructors}
        videos={[]}
        music={[]}
        attendance={[]}
        forceMobile={true}
      />
    );

    const closeBtn = screen.getByRole('button', { name: /Close/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('renders custom session action for admin mode when expanded to full mode', () => {
    const handleEdit = vi.fn();
    renderWithRouter(
      <DaySheet
        isOpen={true}
        onClose={vi.fn()}
        date={mockDate}
        sessions={mockSessions}
        styles={mockStyles}
        instructors={mockInstructors}
        videos={[]}
        music={[]}
        attendance={[]}
        showAttendance={false}
        forceMobile={true}
        sessionAction={(s) => (
          <button type="button" onClick={() => handleEdit(s.id)}>
            ✎ EDIT CLASS
          </button>
        )}
      />
    );

    // Expand to full mode
    const handle = screen.getByTestId('day-sheet-handle');
    fireEvent.click(handle);

    const editBtns = screen.getAllByRole('button', { name: /✎ EDIT CLASS/i });
    expect(editBtns.length).toBeGreaterThan(0);
    fireEvent.click(editBtns[0]);
    expect(handleEdit).toHaveBeenCalledWith('s1');
  });

  it('resets to 1/4 height when reopened with a new date', () => {
    const { rerender } = render(
      <MemoryRouter>
        <DaySheet
          isOpen={true}
          onClose={vi.fn()}
          date={mockDate}
          sessions={mockSessions}
          styles={mockStyles}
          instructors={mockInstructors}
          videos={[]}
          music={[]}
          attendance={[]}
          forceMobile={true}
        />
      </MemoryRouter>
    );

    const handle = screen.getByTestId('day-sheet-handle');
    fireEvent.click(handle);
    expect(screen.getByTestId('day-sheet-panel')).toHaveAttribute('data-snap', 'full');

    // Close and reopen with another date
    rerender(
      <MemoryRouter>
        <DaySheet
          isOpen={false}
          onClose={vi.fn()}
          date={null}
          sessions={mockSessions}
          styles={mockStyles}
          instructors={mockInstructors}
          videos={[]}
          music={[]}
          attendance={[]}
          forceMobile={true}
        />
      </MemoryRouter>
    );

    rerender(
      <MemoryRouter>
        <DaySheet
          isOpen={true}
          onClose={vi.fn()}
          date={'2026-10-16' as ISODate}
          sessions={mockSessions}
          styles={mockStyles}
          instructors={mockInstructors}
          videos={[]}
          music={[]}
          attendance={[]}
          forceMobile={true}
        />
      </MemoryRouter>
    );

    expect(screen.getByTestId('day-sheet-panel')).toHaveAttribute('data-snap', 'quarter');
  });
});
