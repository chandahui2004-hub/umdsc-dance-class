import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MonthCalendar } from './MonthCalendar';

describe('MonthCalendar', () => {
  it('hides the next-month arrow when allowedMonths excludes it', () => {
    const onMonthChange = vi.fn();

    render(
      <MonthCalendar
        month="2026-10"
        onMonthChange={onMonthChange}
        allowedMonths={['2026-09', '2026-10']}
      />
    );

    // Prev month is allowed (2026-09)
    expect(screen.getByRole('button', { name: /Previous Month/i })).toBeInTheDocument();

    // Next month is excluded (2026-11)
    expect(screen.queryByRole('button', { name: /Next Month/i })).not.toBeInTheDocument();
  });

  it('a day with two class marks renders two coloured markers and an accessible label listing both styles', () => {
    const onSelect = vi.fn();
    const marks = {
      '2026-10-07': [
        { colorKey: 'orange', kind: 'class' as const, label: 'Hip Hop' },
        { colorKey: 'blue', kind: 'class' as const, label: 'Popping' }
      ]
    };

    render(
      <MonthCalendar
        month="2026-10"
        onMonthChange={vi.fn()}
        marks={marks}
        selected="2026-10-07"
        onSelect={onSelect}
      />
    );

    const dayBtn = screen.getByRole('button', { name: /Wed 07 Oct.*Hip Hop.*Popping/i });
    expect(dayBtn).toBeInTheDocument();

    const coloredMarkers = dayBtn.querySelectorAll('[data-marker]');
    expect(coloredMarkers.length).toBe(2);

    fireEvent.click(dayBtn);
    expect(onSelect).toHaveBeenCalledWith('2026-10-07');
  });
});
