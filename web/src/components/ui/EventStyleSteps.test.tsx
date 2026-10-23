// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EventStep, StyleStep } from './EventStyleSteps';
import { MemoryRouter } from 'react-router-dom';

const mockSetCurrentId = vi.fn();
let mockEventState = {
  events: [
    { id: 'ev-1', name: 'Semester 1 Freestyle', status: 'active' },
    { id: 'ev-2', name: 'Semester 1 Popping', status: 'active' },
    { id: 'ev-3', name: 'Locking Basics', status: 'active' },
    { id: 'ev-4', name: 'Choreography Showcase', status: 'active' },
    { id: 'ev-5', name: 'Battle Night 2026', status: 'active' },
    { id: 'ev-6', name: 'Old Jam 2025', status: 'archived' }
  ],
  current: { id: 'ev-1', name: 'Semester 1 Freestyle', status: 'active' },
  setCurrentId: mockSetCurrentId,
  isLoading: false,
  isAll: false
};

vi.mock('../../features/events/useCurrentEvent', () => ({
  useCurrentEvent: () => mockEventState
}));

describe('EventStyleSteps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('EventStep', () => {
    it('renders PixelDropdown with event options and selects event', () => {
      render(
        <MemoryRouter>
          <EventStep />
        </MemoryRouter>
      );

      // PixelDropdown button exists
      const trigger = screen.getByRole('button', { name: /Current event/i });
      expect(trigger).toHaveTextContent('Semester 1 Freestyle');

      // Click to open dropdown
      fireEvent.click(trigger);
      const listbox = screen.getByRole('listbox');
      expect(listbox).toBeInTheDocument();
      expect(listbox.className).toContain('pixel-scrollbar');

      // Choose another event
      const poppingOption = screen.getByRole('option', { name: /Semester 1 Popping/i });
      fireEvent.click(poppingOption);

      expect(mockSetCurrentId).toHaveBeenCalledWith('ev-2');
    });

    it('renders ALL EVENTS option when allowAll is true', () => {
      mockEventState = {
        ...mockEventState,
        isAll: true,
        current: null as any
      };

      render(
        <MemoryRouter>
          <EventStep allowAll />
        </MemoryRouter>
      );

      const trigger = screen.getByRole('button', { name: /Current event/i });
      expect(trigger).toHaveTextContent('ALL EVENTS');
    });

    it('archived events are kept in a collapsible accordion with year tabs instead of the main dropdown', () => {
      mockEventState = {
        events: [
          { id: 'ev-1', name: 'Semester 1 Freestyle', status: 'active' },
          { id: 'ev-archived-2026', name: 'Showcase 2026', status: 'archived', startDate: '2026-02-15' } as any,
          { id: 'ev-archived-2025', name: 'Old Jam 2025', status: 'archived', startDate: '2025-05-01' } as any
        ],
        current: { id: 'ev-1', name: 'Semester 1 Freestyle', status: 'active' },
        setCurrentId: mockSetCurrentId,
        isLoading: false,
        isAll: false
      };

      render(
        <MemoryRouter>
          <EventStep />
        </MemoryRouter>
      );

      // Open primary dropdown
      const trigger = screen.getByRole('button', { name: /Current event/i });
      fireEvent.click(trigger);

      // Archived events should NOT be options in the primary dropdown
      expect(screen.queryByRole('option', { name: /Showcase 2026/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Old Jam 2025/i })).not.toBeInTheDocument();

      // Close dropdown
      fireEvent.click(trigger);

      // Collapsible button for archived events exists
      const archiveToggle = screen.getByRole('button', { name: /ARCHIVED EVENTS \(2\)/i });
      expect(archiveToggle).toBeInTheDocument();

      // Click to expand archived events
      fireEvent.click(archiveToggle);

      // Year buttons should appear
      const year2026Btn = screen.getByRole('button', { name: '2026' });
      const year2025Btn = screen.getByRole('button', { name: '2025' });
      expect(year2026Btn).toBeInTheDocument();
      expect(year2025Btn).toBeInTheDocument();

      // Clicking 2025 year tab shows Old Jam 2025
      fireEvent.click(year2025Btn);
      const oldJamBtn = screen.getByRole('button', { name: /Old Jam 2025/i });
      expect(oldJamBtn).toBeInTheDocument();

      // Clicking the archived event sets current event
      fireEvent.click(oldJamBtn);
      expect(mockSetCurrentId).toHaveBeenCalledWith('ev-archived-2025');
    });
  });

  describe('StyleStep', () => {
    const mockStylesMany = [
      { id: 'st-pop', name: 'Popping' },
      { id: 'st-lock', name: 'Locking' },
      { id: 'st-hip', name: 'Hip Hop' },
      { id: 'st-break', name: 'Breaking' },
      { id: 'st-waack', name: 'Waacking' },
      { id: 'st-house', name: 'House' },
      { id: 'st-krump', name: 'Krump' }
    ];

    it('renders 1-click button pills when there are 6 or fewer dance styles', () => {
      const handleChange = vi.fn();
      render(
        <StyleStep
          styles={mockStylesMany.slice(0, 3)}
          value="st-pop"
          onChange={handleChange}
        />
      );

      const popBtn = screen.getByRole('button', { name: 'Popping' });
      expect(popBtn).toHaveAttribute('aria-pressed', 'true');
      const lockBtn = screen.getByRole('button', { name: 'Locking' });
      fireEvent.click(lockBtn);
      expect(handleChange).toHaveBeenCalledWith('st-lock');
    });

    it('renders PixelDropdown with dance styles and max 5 items visible height when > 6 styles', () => {
      const handleChange = vi.fn();
      render(
        <StyleStep
          styles={mockStylesMany}
          value="st-pop"
          onChange={handleChange}
        />
      );

      const trigger = screen.getByRole('button', { name: /Choose dance style/i });
      expect(trigger).toHaveTextContent('Popping');

      fireEvent.click(trigger);
      const listbox = screen.getByRole('listbox');
      expect(listbox).toBeInTheDocument();
      expect(listbox.className).toContain('pixel-scrollbar');

      const lockingOption = screen.getByRole('option', { name: /Locking/i });
      fireEvent.click(lockingOption);
      expect(handleChange).toHaveBeenCalledWith('st-lock');
    });

    it('renders allOption when provided', () => {
      const handleChange = vi.fn();
      render(
        <StyleStep
          styles={mockStylesMany}
          value="all"
          onChange={handleChange}
          allOption="ALL DANCE STYLES"
        />
      );

      const trigger = screen.getByRole('button', { name: /Choose dance style/i });
      expect(trigger).toHaveTextContent('ALL DANCE STYLES');
    });

    it('shows message when no dance styles in event', () => {
      render(
        <StyleStep
          styles={[]}
          value=""
          onChange={vi.fn()}
        />
      );

      expect(screen.getByText(/No dance styles in this event yet/i)).toBeInTheDocument();
    });

    it('disables dropdown when disabled is true', () => {
      render(
        <StyleStep
          styles={mockStylesMany}
          value="st-pop"
          onChange={vi.fn()}
          disabled={true}
        />
      );

      expect(screen.getByText(/Choose an event first/i)).toBeInTheDocument();
    });
  });
});
