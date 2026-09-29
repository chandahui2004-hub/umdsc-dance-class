import { describe, it, expect } from 'vitest';
import { weekdaysInMonth, generateMonthSessions } from '../../src/logic/sessionGen';
import { DanceStyle } from '@umdsc/shared';

describe('Session Generation Logic (logic/sessionGen)', () => {
  it('weekdaysInMonth calculates correct dates for Tuesdays (2) and Thursdays (4)', () => {
    expect(weekdaysInMonth('2026-10', 2)).toEqual([
      '2026-10-06',
      '2026-10-13',
      '2026-10-20',
      '2026-10-27'
    ]);

    expect(weekdaysInMonth('2026-10', 4)).toEqual([
      '2026-10-01',
      '2026-10-08',
      '2026-10-15',
      '2026-10-22',
      '2026-10-29'
    ]);
  });

  it('generateMonthSessions produces 4 sessions with extraWeekFlag=false for 4 Tuesdays', () => {
    const style = {
      id: 'st1',
      name: 'Popping',
      defaultWeekday: 2,
      defaultStart: '20:00',
      defaultEnd: '22:00',
      defaultInstructorId: 'in1',
      defaultVenue: 'DK1'
    } as DanceStyle;

    const g = generateMonthSessions('2026-10', style);
    expect(g.sessions.map(s => [s.seq, s.date, s.start, s.status])).toEqual([
      [1, '2026-10-06', '20:00', 'scheduled'],
      [2, '2026-10-13', '20:00', 'scheduled'],
      [3, '2026-10-20', '20:00', 'scheduled'],
      [4, '2026-10-27', '20:00', 'scheduled']
    ]);
    expect(g.extraWeekFlag).toBe(false);
  });

  it('generateMonthSessions produces 5 sessions with extraWeekFlag=true for 5 Thursdays', () => {
    const style = {
      id: 'st2',
      name: 'Hip Hop',
      defaultWeekday: 4,
      defaultStart: '20:00',
      defaultEnd: '22:00',
      defaultInstructorId: 'in1',
      defaultVenue: 'DK1'
    } as DanceStyle;

    const g = generateMonthSessions('2026-10', style);
    expect(g.sessions.length).toBe(5);
    expect(g.extraWeekFlag).toBe(true);
  });

  it('generateMonth for a style without defaultWeekday → throws VALIDATION', () => {
    const style = {
      id: 'st3',
      name: 'Latin',
      defaultWeekday: null
    } as DanceStyle;

    expect(() => generateMonthSessions('2026-10', style)).toThrow(
      /Set a default weekday for Latin first/
    );
  });
});
