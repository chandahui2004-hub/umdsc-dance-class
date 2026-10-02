import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ColorSwatchPicker, DEFAULT_SWATCHES } from '../../components/ui/ColorSwatchPicker';

describe('ColorSwatchPicker Component', () => {
  it('renders default swatches and allows selecting a color', () => {
    const handleChange = vi.fn();
    render(<ColorSwatchPicker value="orange" onChange={handleChange} label="Test Swatch" />);

    expect(screen.getByText('Test Swatch')).toBeInTheDocument();
    expect(screen.getByText('+ ADD NEW COLOR')).toBeInTheDocument();

    const blueButton = screen.getByText('BLUE');
    fireEvent.click(blueButton);
    expect(handleChange).toHaveBeenCalledWith('blue');
  });

  it('supports adding a new custom color by hex code and selecting it', () => {
    const handleChange = vi.fn();
    render(<ColorSwatchPicker value="green" onChange={handleChange} />);

    // Click "+ ADD NEW COLOR"
    fireEvent.click(screen.getByText('+ ADD NEW COLOR'));

    const hexInput = screen.getByPlaceholderText('#FF5500');
    fireEvent.change(hexInput, { target: { value: '#9C27B0' } });

    const saveButton = screen.getByText('SAVE COLOR');
    fireEvent.click(saveButton);

    expect(handleChange).toHaveBeenCalledWith('#9C27B0');
    expect(screen.getByText('#9C27B0')).toBeInTheDocument();
  });

  it('allows removing a custom color', () => {
    const handleChange = vi.fn();
    const { rerender } = render(<ColorSwatchPicker value="green" onChange={handleChange} />);

    // Add a custom color
    fireEvent.click(screen.getByText('+ ADD NEW COLOR'));
    fireEvent.change(screen.getByPlaceholderText('#FF5500'), { target: { value: '#E91E63' } });
    fireEvent.click(screen.getByText('SAVE COLOR'));

    expect(screen.getByText('#E91E63')).toBeInTheDocument();

    // Rerender with the new selected value
    rerender(<ColorSwatchPicker value="#E91E63" onChange={handleChange} />);

    // Find remove button for custom color
    const removeBtn = screen.getByLabelText('Remove color #E91E63');
    fireEvent.click(removeBtn);

    expect(screen.queryByText('#E91E63')).not.toBeInTheDocument();
    expect(handleChange).toHaveBeenCalledWith(DEFAULT_SWATCHES[0].key);
  });
});
