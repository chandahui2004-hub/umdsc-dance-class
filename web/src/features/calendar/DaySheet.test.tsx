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

describe('DaySheet (Adaptive Dancer Calendar Sheet)', () => {
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
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders with initial half-height snap on mobile and displays classes', () => {
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
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    const panel = screen.getByTestId('day-sheet-panel');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute('data-snap', 'half');

    // Shows date title and class details
    expect(screen.getByText(/2 classes scheduled/i)).toBeInTheDocument();
    expect(screen.getByText(/Salsa/i)).toBeInTheDocument();
    expect(screen.getByText(/Bachata/i)).toBeInTheDocument();
  });

  it('toggles from half to full height when drag handle is tapped', () => {
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
      />
    );

    const panel = screen.getByTestId('day-sheet-panel');
    const handle = screen.getByTestId('day-sheet-handle');

    expect(panel).toHaveAttribute('data-snap', 'half');

    // Click drag handle to expand
    fireEvent.click(handle);
    expect(panel).toHaveAttribute('data-snap', 'full');

    // Click drag handle again to collapse back to half
    fireEvent.click(handle);
    expect(panel).toHaveAttribute('data-snap', 'half');
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
      />
    );

    const panel = screen.getByTestId('day-sheet-panel');
    const handleArea = screen.getByTestId('day-sheet-drag-area');

    // Drag up from half: deltaY = -60px -> snap to full
    fireEvent.touchStart(handleArea, { touches: [{ clientY: 300 }] });
    fireEvent.touchMove(handleArea, { touches: [{ clientY: 240 }] });
    fireEvent.touchEnd(handleArea);

    expect(panel).toHaveAttribute('data-snap', 'full');

    // Drag down from full: deltaY = +60px -> snap back to half
    fireEvent.touchStart(handleArea, { touches: [{ clientY: 200 }] });
    fireEvent.touchMove(handleArea, { touches: [{ clientY: 260 }] });
    fireEvent.touchEnd(handleArea);

    expect(panel).toHaveAttribute('data-snap', 'half');

    // Drag down from half: deltaY = +70px -> close sheet
    fireEvent.touchStart(handleArea, { touches: [{ clientY: 200 }] });
    fireEvent.touchMove(handleArea, { touches: [{ clientY: 270 }] });
    fireEvent.touchEnd(handleArea);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close button is clicked', () => {
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
      />
    );

    const closeBtn = screen.getByRole('button', { name: /Close/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
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
      />
    );

    const backdrop = screen.getByTestId('day-sheet-backdrop');
    fireEvent.click(backdrop);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
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
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('resets to half height when reopened with a new date', () => {
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
        />
      </MemoryRouter>
    );

    expect(screen.getByTestId('day-sheet-panel')).toHaveAttribute('data-snap', 'half');
  });
});
