import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveClock } from './LiveClock';

describe('LiveClock', () => {
  it('renders time in HH:mm format without seconds by default', () => {
    render(<LiveClock />);
    const clock = screen.getByTestId('live-clock');
    expect(clock).toBeInTheDocument();
    // Clock contains digits and colon: e.g. 10:20
    expect(clock.textContent).toMatch(/\d{2}:\d{2}/);
    expect(clock.textContent).toContain('KL (UTC+8)');
  });

  it('renders compact clock with HH:mm format', () => {
    render(<LiveClock compact />);
    const clock = screen.getByTestId('live-clock-compact');
    expect(clock).toBeInTheDocument();
    expect(clock.textContent).toMatch(/\d{2}:\d{2}/);
    // Does not show seconds in compact mode
    expect(clock.textContent).not.toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('renders seconds when showSeconds is true', () => {
    render(<LiveClock showSeconds />);
    const clock = screen.getByTestId('live-clock');
    expect(clock.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});
