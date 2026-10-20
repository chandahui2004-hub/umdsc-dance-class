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
  });

  describe('StyleStep', () => {
    const mockStyles = [
      { id: 'st-pop', name: 'Popping' },
      { id: 'st-lock', name: 'Locking' },
      { id: 'st-hip', name: 'Hip Hop' },
      { id: 'st-break', name: 'Breaking' },
      { id: 'st-waack', name: 'Waacking' },
      { id: 'st-house', name: 'House' }
    ];

    it('renders PixelDropdown with dance styles and max 5 items visible height', () => {
      const handleChange = vi.fn();
      render(
        <StyleStep
          styles={mockStyles}
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
          styles={mockStyles}
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
          styles={mockStyles}
          value="st-pop"
          onChange={vi.fn()}
          disabled={true}
        />
      );

      expect(screen.getByText(/Choose an event first/i)).toBeInTheDocument();
    });
  });
});
