import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NeonSign } from './NeonSign';
import { PixelPortraitFrame } from './PixelPortraitFrame';

describe('NeonSign & PixelPortraitFrame', () => {
  it('NeonSign renders text with custom --glow while preserving var(--text-1) text colour', () => {
    render(<NeonSign text="Hip Hop" color="#123456" />);
    const sign = screen.getByTestId('neon-sign');
    expect(sign).toBeInTheDocument();
    expect(sign).toHaveTextContent('HIP HOP');
    expect(sign.style.getPropertyValue('--glow')).toBe('#123456');
    expect(sign.style.color).toBe('var(--text-1)');
  });

  it('PixelPortraitFrame renders photo, name, and glow property', () => {
    render(
      <PixelPortraitFrame
        src="/photo.jpg"
        alt="Carmen Loh"
        name="Carmen Loh"
        glow="#3EE6FF"
        size="sm"
      />
    );
    expect(screen.getByAltText('Carmen Loh')).toBeInTheDocument();
    expect(screen.getByText('Carmen Loh')).toBeInTheDocument();
    const frame = screen.getByTestId('pixel-portrait-frame');
    expect(frame.style.getPropertyValue('--glow')).toBe('#3EE6FF');
  });
});
