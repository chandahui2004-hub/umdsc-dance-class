import { describe, it, expect } from 'vitest';
import {
  eventNameKey,
  validateEventFields,
  classesOutsideRange,
  hashRow,
  todayKL
} from '../../src/logic/events';
import { ClassSession } from '@umdsc/shared';

const base = { name: 'Trial Class 2027', type: 'trial', startDate: '2027-01-05', endDate: '2027-01-07', styleIds: ['sty_a'] };
const existing = [{ id: 'evt_1', nameKey: 'oct monthly class' }];

function session(date: string, active = true): ClassSession {
  return {
    id: 'ses_' + date, version: 1, updatedBy: '', updatedAt: '', active,
    eventId: 'evt_1', styleId: 'sty_a', seq: 1, date, start: '20:00', end: '22:00',
    instructorId: '', venue: '', status: 'scheduled', note: ''
  } as unknown as ClassSession;
}

describe('logic/events', () => {
  it('eventNameKey trims, lower-cases and collapses spaces', () => {
    expect(eventNameKey(' Oct  Monthly Class ')).toBe('oct monthly class');
  });

  it('rejects a name that differs only in spaces or case (Review Focus 1)', () => {
    expect(() => validateEventFields({ ...base, name: ' Oct  Monthly Class ' }, existing))
      .toThrow('An event called "Oct  Monthly Class" already exists.');
  });

  it('allows the same name when it belongs to the event being edited', () => {
    expect(() => validateEventFields({ ...base, name: 'OCT MONTHLY CLASS' }, existing, 'evt_1')).not.toThrow();
  });

  it('requires a name, a valid type, ordered dates and at least one style', () => {
    expect(() => validateEventFields({ ...base, name: '  ' }, existing)).toThrow('Event name is required');
    expect(() => validateEventFields({ ...base, type: 'party' }, existing))
      .toThrow('Event type must be monthly, trial, workshop or other');
    expect(() => validateEventFields({ ...base, endDate: '2027-01-04' }, existing))
      .toThrow('End date must be on or after the start date');
    expect(() => validateEventFields({ ...base, styleIds: [] }, existing)).toThrow('Choose at least one dance style');
  });

  it('classesOutsideRange lists only active classes outside the range', () => {
    const list = [session('2027-01-04'), session('2027-01-05'), session('2027-01-08'), session('2027-01-09', false)];
    expect(classesOutsideRange(list, '2027-01-05', '2027-01-07').map(s => s.date)).toEqual(['2027-01-04', '2027-01-08']);
  });

  it('hashRow is stable and separates cells', () => {
    expect(hashRow(['a', 'b'])).toBe(hashRow(['a', 'b']));
    expect(hashRow(['a', 'b'])).not.toBe(hashRow(['ab', '']));
    expect(hashRow(['x'])).toMatch(/^[0-9a-f]+$/);
  });

  it('todayKL uses Malaysia time (Review Focus 3)', () => {
    expect(todayKL(new Date('2026-10-08T16:30:00Z'))).toBe('2026-10-09');
    expect(todayKL(new Date('2026-10-08T15:59:00Z'))).toBe('2026-10-08');
  });
});
