// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PixelDropdown } from './PixelDropdown';

const mockOptions = [
  { value: 'ev-1', label: 'Semester 1 Freestyle 2026' },
  { value: 'ev-2', label: 'Semester 1 Popping Intensive' },
  { value: 'ev-3', label: 'Locking Basics Workshop' },
  { value: 'ev-4', label: 'Choreography Showcase' },
  { value: 'ev-5', label: 'Battle Night 2026' },
  { value: 'ev-6', label: 'Semester 2 Open Class' },
  { value: 'ev-7', label: 'Graduation Jam' }
];

describe('PixelDropdown', () => {
  it('renders trigger with placeholder when no value is selected', () => {
    render(
      <PixelDropdown
        options={mockOptions}
        value=""
        onChange={vi.fn()}
        placeholder="Select an event"
      />
    );
    expect(screen.getByRole('button')).toHaveTextContent('Select an event');
  });

  it('renders trigger with selected option label', () => {
    render(
      <PixelDropdown
        options={mockOptions}
        value="ev-2"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole('button')).toHaveTextContent('Semester 1 Popping Intensive');
  });

  it('opens options list when trigger is clicked, showing max 5 items visible height and scrollbar', () => {
    render(
      <PixelDropdown
        options={mockOptions}
        value="ev-1"
        onChange={vi.fn()}
      />
    );
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    // Listbox should be visible
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();
    expect(listbox.className).toContain('pixel-scrollbar');
    expect(listbox.className).toContain('overflow-y-auto');

    // All options should be rendered
    const items = screen.getAllByRole('option');
    expect(items.length).toBe(7);
  });

  it('calls onChange with selected value and closes menu when option is clicked', () => {
    const handleChange = vi.fn();
    render(
      <PixelDropdown
        options={mockOptions}
        value="ev-1"
        onChange={handleChange}
      />
    );
    fireEvent.click(screen.getByRole('button'));

    const option3 = screen.getByRole('option', { name: /Locking Basics Workshop/ });
    fireEvent.click(option3);

    expect(handleChange).toHaveBeenCalledWith('ev-3');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes dropdown when Escape key is pressed', () => {
    render(
      <PixelDropdown
        options={mockOptions}
        value="ev-1"
        onChange={vi.fn()}
      />
    );
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes dropdown when clicking outside', () => {
    render(
      <div>
        <div data-testid="outside">Outside Element</div>
        <PixelDropdown
          options={mockOptions}
          value="ev-1"
          onChange={vi.fn()}
        />
      </div>
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('does not open when disabled', () => {
    render(
      <PixelDropdown
        options={mockOptions}
        value="ev-1"
        onChange={vi.fn()}
        disabled={true}
      />
    );
    const trigger = screen.getByRole('button');
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
