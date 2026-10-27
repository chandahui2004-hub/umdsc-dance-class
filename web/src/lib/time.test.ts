import { describe, it, expect } from 'vitest';
import {
  monthGrid,
  todayKL,
  addMonths,
  formatDayLabel,
  getMonthsRange,
  getDatesBetween,
  parseFlexibleTimestamp,
  formatRegistrationDate
} from './time';

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

  it('generates a range of consecutive months from start to end', () => {
    expect(getMonthsRange('2026-10', '2026-12')).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(getMonthsRange('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(getMonthsRange('2026-10', '2026-10')).toEqual(['2026-10']);
    expect(getMonthsRange('2026-12', '2026-10')).toEqual(['2026-12']);
  });

  it('generates consecutive dates between start and end dates', () => {
    const dates = getDatesBetween('2026-10-01', '2026-10-05');
    expect(dates).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05'
    ]);
  });

  describe('parseFlexibleTimestamp & formatRegistrationDate', () => {
    it('parses Malaysian Google Form timestamp format DD/MM/YYYY HH:mm:ss', () => {
      const ts = parseFlexibleTimestamp('26/10/2026 21:04:12');
      expect(ts).not.toBeNull();
      const d = new Date(ts!);
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(9); // 0-indexed October
      expect(d.getDate()).toBe(26);
      expect(d.getHours()).toBe(21);
      expect(d.getMinutes()).toBe(4);
    });

    it('parses single digit D/M/YYYY H:mm:ss', () => {
      const ts = parseFlexibleTimestamp('5/10/2026 9:30:00');
      expect(ts).not.toBeNull();
      const d = new Date(ts!);
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(9);
      expect(d.getDate()).toBe(5);
      expect(d.getHours()).toBe(9);
    });

    it('parses ISO date and datetime strings', () => {
      const ts = parseFlexibleTimestamp('2026-10-26T12:00:00.000Z');
      expect(ts).not.toBeNull();
      expect(typeof ts).toBe('number');
    });

    it('returns null for empty, missing, or invalid values', () => {
      expect(parseFlexibleTimestamp('')).toBeNull();
      expect(parseFlexibleTimestamp(null)).toBeNull();
      expect(parseFlexibleTimestamp(undefined)).toBeNull();
      expect(parseFlexibleTimestamp('not-a-date')).toBeNull();
    });

    it('formats registration date cleanly', () => {
      expect(formatRegistrationDate('26/10/2026 21:04:12')).toBe('26/10/2026, 21:04');
      expect(formatRegistrationDate('26/10/2026')).toBe('26/10/2026');
      expect(formatRegistrationDate('')).toBe('');
      expect(formatRegistrationDate(null)).toBe('');
    });
  });
});
