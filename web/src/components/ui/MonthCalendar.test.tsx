import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MonthCalendar } from './MonthCalendar';
import { todayKL } from '../../lib/time';

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
  it('marks the chosen date as pressed with a pink frame, distinct from today', () => {
    const today = todayKL();
    const other = today.endsWith('-15') ? today.slice(0, 8) + '16' : today.slice(0, 8) + '15';
    const { rerender } = render(
      <MonthCalendar month={today.slice(0, 7) as any} onMonthChange={vi.fn()} selected={other as any} onSelect={vi.fn()} />
    );
    const chosen = document.querySelector(`[data-date="${other}"]`)!;
    const todayBtn = document.querySelector(`[data-date="${today}"]`)!;
    expect(chosen.getAttribute('aria-pressed')).toBe('true');
    expect(chosen.className).toContain('--neon-pink');
    expect(todayBtn.getAttribute('aria-pressed')).toBe('false');
    expect(todayBtn.className).not.toContain('--neon-pink');
    expect(todayBtn.className).toContain('px-neon');

    // Choosing today keeps today's glow and adds the pressed pink frame
    rerender(<MonthCalendar month={today.slice(0, 7) as any} onMonthChange={vi.fn()} selected={today as any} onSelect={vi.fn()} />);
    const both = document.querySelector(`[data-date="${today}"]`)!;
    expect(both.className).toContain('px-neon');
    expect(both.className).toContain('--neon-pink');
  });
});
