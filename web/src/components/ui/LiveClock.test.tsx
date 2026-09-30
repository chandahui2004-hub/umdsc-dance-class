import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveClock } from './LiveClock';

describe('LiveClock', () => {
  it('renders time in HH:mm:ss format', () => {
    render(<LiveClock />);
    const clock = screen.getByTestId('live-clock');
    expect(clock).toBeInTheDocument();
    // Clock contains digits and colons: e.g. 10:20:30
    expect(clock.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(clock.textContent).toContain('KL (UTC+8)');
  });

  it('renders compact clock', () => {
    render(<LiveClock compact />);
    const clock = screen.getByTestId('live-clock-compact');
    expect(clock).toBeInTheDocument();
    expect(clock.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});
