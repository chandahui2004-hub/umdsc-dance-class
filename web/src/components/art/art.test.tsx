import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { CityBackdrop } from './CityBackdrop';
import { SkylineStrip } from './SkylineStrip';
import { Boombox } from './Boombox';
import { LogoBadge } from '../ui/LogoBadge';

describe('Art Components', () => {
  it('CityBackdrop renders properly with layers and fallback background', () => {
    render(<CityBackdrop />);
    const backdrop = screen.getByTestId('city-backdrop');
    expect(backdrop).toBeInTheDocument();
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    expect(backdrop.style.backgroundColor).toBe('var(--night-1)');

    const sky = backdrop.querySelector('[data-layer="sky"]');
    const far = backdrop.querySelector('[data-layer="far"]');
    const mid = backdrop.querySelector('[data-layer="mid"]');
    const near = backdrop.querySelector('[data-layer="near"]');

    expect(sky).toBeInTheDocument();
    expect(far).toBeInTheDocument();
    expect(mid).toBeInTheDocument();
    expect(near).toBeInTheDocument();
  });

  it('SkylineStrip renders with aria-hidden and 48px height', () => {
    render(<SkylineStrip />);
    const strip = screen.getByTestId('skyline-strip');
    expect(strip).toBeInTheDocument();
    expect(strip).toHaveAttribute('aria-hidden', 'true');
    expect(strip.style.height).toBe('48px');
  });

  it('Boombox renders with specified size and px-bounce class', () => {
    render(<Boombox size={32} />);
    const boombox = screen.getByAltText('');
    expect(boombox).toBeInTheDocument();
    expect(boombox).toHaveAttribute('aria-hidden', 'true');
    expect(boombox.style.width).toBe('32px');
    expect(boombox.style.height).toBe('32px');
    expect(boombox).toHaveClass('px-bounce');
  });

  it('LogoBadge renders UMDSC logo image', () => {
    render(<LogoBadge />);
    const logo = screen.getByAltText('UMDSC logo');
    expect(logo).toBeInTheDocument();
  });
});
