import { describe, it, expect } from 'vitest';
import { monthGrid, todayKL, addMonths, formatDayLabel } from './time';

describe('time logic', () => {
  it('generates full-week monthGrid starting on Monday', () => {
    const g = monthGrid('2026-10');
    expect(g[0][0]).toBe('2026-09-28');
    expect(g[0][3]).toBe('2026-10-01');
    expect(g.at(-1)!.at(-1)).toBe('2026-11-01');

    // All rows should have exactly 7 days
    for (const week of g) {
      expect(week.length).toBe(7);
    }
  });

  it('formats day labels correctly', () => {
    expect(formatDayLabel('2026-10-07')).toBe('Wed 07 Oct');
    expect(formatDayLabel('2026-10-08')).toBe('Thu 08 Oct');
  });

  it('adds and subtracts months correctly', () => {
    expect(addMonths('2026-10', 1)).toBe('2026-11');
    expect(addMonths('2026-10', -1)).toBe('2026-09');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });

  it('gets today in Asia/Kuala_Lumpur format', () => {
    const today = todayKL();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
