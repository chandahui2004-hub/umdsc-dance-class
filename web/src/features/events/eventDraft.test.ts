import { describe, it, expect } from 'vitest';
import type { ClassSession, EventItem, Instructor } from '@umdsc/shared';
import {
  emptyDraft, draftFromEvent, pruneSchedule, localNameClash,
  instructorsForStyle, setStyleInstructors, missingInstructorStyle, effectiveInstructorId
} from './eventDraft';

const cls = (seq: number, date: string) => ({ seq, date, start: '20:00', end: '22:00' });

describe('eventDraft', () => {
  it('emptyDraft starts on today with no styles or classes', () => {
    const d = emptyDraft('2026-09-30');
    expect(d).toMatchObject({ startDate: '2026-09-30', endDate: '2026-09-30', type: 'monthly', styleIds: [], schedule: {} });
  });

  it('pruneSchedule drops out-of-range classes and renumbers by date', () => {
    const d = {
      ...emptyDraft('2026-10-01'),
      startDate: '2026-10-05',
      endDate: '2026-10-31',
      styleIds: ['pop'],
      schedule: { pop: [cls(1, '2026-10-20'), cls(2, '2026-09-30'), cls(3, '2026-10-06')] }
    };
    expect(pruneSchedule(d).schedule.pop).toEqual([cls(1, '2026-10-06'), cls(2, '2026-10-20')]);
  });

  it('pruneSchedule drops classes of unticked styles', () => {
    const d = {
      ...emptyDraft('2026-10-01'),
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      styleIds: ['pop'],
      schedule: { pop: [cls(1, '2026-10-06')], hh: [cls(1, '2026-10-08')] }
    };
    expect(pruneSchedule(d).schedule).toEqual({ pop: [cls(1, '2026-10-06')] });
  });

  it('localNameClash ignores case and spaces and self', () => {
    const events = [{ id: 'e1', name: 'OCT MONTHLY CLASS' }] as EventItem[];
    expect(localNameClash(' oct  monthly class ', events)).toBe(true);
    expect(localNameClash('OCT MONTHLY CLASS', events, 'e1')).toBe(false);
    expect(localNameClash('TRIAL', events)).toBe(false);
  });

  it('draftFromEvent groups sessions by style sorted by date', () => {
    const event = {
      id: 'e1', name: 'OCT', type: 'trial', startDate: '2026-10-01', endDate: '2026-10-31',
      sourceSheetId: 'src', columnMapJson: '{"fullName":1}', classIndex: 5, styleIds: ['pop', 'hh']
    } as unknown as EventItem;
    const sessions = [
      { id: 's2', styleId: 'pop', seq: 2, date: '2026-10-13', start: '20:00', end: '22:00', venue: 'A' },
      { id: 's1', styleId: 'pop', seq: 1, date: '2026-10-06', start: '20:00', end: '22:00', venue: 'A' },
      { id: 's3', styleId: 'hh', seq: 1, date: '2026-10-08', start: '19:00', end: '21:00', venue: '' }
    ] as unknown as ClassSession[];

    const d = draftFromEvent(event, sessions);

    expect(d.name).toBe('OCT');
    expect(d.type).toBe('trial');
    expect(d.sheetUrl).toBe('https://docs.google.com/spreadsheets/d/src/edit');
    expect(d.columnMap).toEqual({ fullName: 1 });
    expect(d.classIndex).toBe(5);
    expect(d.schedule.pop.map(c => c.date)).toEqual(['2026-10-06', '2026-10-13']);
    expect(d.schedule.hh[0]).toMatchObject({ seq: 1, date: '2026-10-08', start: '19:00' });
  });

  it('emptyDraft has no style instructors', () => {
    expect(emptyDraft('2026-09-30').styleInstructors).toEqual({});
  });

  it('instructorsForStyle lists only active instructors who teach the style', () => {
    const ins = [
      { id: 'i1', name: 'Zed', active: true, styleIds: ['pop', 'hh'] },
      { id: 'i2', name: 'Amy', active: true, styleIds: ['pop'] },
      { id: 'i3', name: 'Bob', active: false, styleIds: ['pop'] },
      { id: 'i4', name: 'Cat', active: true, styleIds: ['hh'] }
    ] as unknown as Instructor[];
    expect(instructorsForStyle(ins, 'pop').map(i => i.id)).toEqual(['i2', 'i1']);
    expect(instructorsForStyle(ins, 'none')).toEqual([]);
  });

  it('instructorsForStyle tolerates an instructor with no styleIds (cached pre-deploy data)', () => {
    const ins = [
      { id: 'old', name: 'Old', active: true },
      { id: 'i2', name: 'Amy', active: true, styleIds: ['pop'] }
    ] as unknown as Instructor[];
    expect(instructorsForStyle(ins, 'pop').map(i => i.id)).toEqual(['i2']);
  });

  it('effectiveInstructorId falls back to the first listed instructor only when the class has none', () => {
    expect(effectiveInstructorId({ instructorId: '' }, ['a', 'b'])).toBe('a');
    expect(effectiveInstructorId({}, ['a', 'b'])).toBe('a');
    expect(effectiveInstructorId({ instructorId: 'b' }, ['a', 'b'])).toBe('b');
    expect(effectiveInstructorId({ instructorId: 'x' }, ['a', 'b'])).toBe('x');
    expect(effectiveInstructorId({}, [])).toBe('');
  });

  it('setStyleInstructors moves classes of a removed instructor to the first remaining', () => {
    const d = {
      ...emptyDraft('2026-10-01'),
      styleIds: ['pop'],
      styleInstructors: { pop: ['a', 'b'] },
      schedule: {
        pop: [
          { ...cls(1, '2026-10-06'), instructorId: 'a' },
          { ...cls(2, '2026-10-13'), instructorId: 'b' }
        ]
      }
    };
    const next = setStyleInstructors(d, 'pop', ['b'], '2026-10-01');
    expect(next.styleInstructors.pop).toEqual(['b']);
    expect(next.schedule.pop.map(c => c.instructorId)).toEqual(['b', 'b']);
    const none = setStyleInstructors(d, 'pop', [], '2026-10-01');
    expect(none.schedule.pop.map(c => c.instructorId)).toEqual(['', '']);
    expect(d.schedule.pop[0].instructorId).toBe('a');
  });

  it('setStyleInstructors keeps the instructor of classes that already happened', () => {
    const d = {
      ...emptyDraft('2026-10-01'),
      styleIds: ['pop'],
      styleInstructors: { pop: ['a', 'b'] },
      schedule: {
        pop: [
          { ...cls(1, '2026-10-06'), instructorId: 'a' },
          { ...cls(2, '2026-10-13'), instructorId: 'a' },
          { ...cls(3, '2026-10-20'), instructorId: 'a' }
        ]
      }
    };
    // Today is the 13th: the 6 Oct class keeps 'a'; today's and later classes move to 'b'
    const next = setStyleInstructors(d, 'pop', ['b'], '2026-10-13');
    expect(next.schedule.pop.map(c => c.instructorId)).toEqual(['a', 'b', 'b']);
  });

  it('missingInstructorStyle names the first ticked style with no instructor', () => {
    const d = { ...emptyDraft('2026-10-01'), styleIds: ['pop', 'hh', 'jazz'], styleInstructors: { pop: ['a'], jazz: [] } };
    const active = ['pop', 'hh', 'jazz'];
    expect(missingInstructorStyle(d, active)).toBe('hh');
    expect(missingInstructorStyle({ ...d, styleInstructors: { pop: ['a'], hh: ['b'], jazz: ['c'] } }, active)).toBeNull();
  });

  it('missingInstructorStyle ignores a ticked style that is no longer active', () => {
    const d = { ...emptyDraft('2026-10-01'), styleIds: ['pop', 'gone'], styleInstructors: { pop: ['a'] } };
    expect(missingInstructorStyle(d, ['pop', 'hh'])).toBeNull();
    expect(missingInstructorStyle(d, ['pop', 'gone'])).toBe('gone');
  });

  it('draftFromEvent seeds empty style lists from the event classes', () => {
    const event = {
      id: 'e1', name: 'OCT', type: 'trial', startDate: '2026-10-01', endDate: '2026-10-31',
      sourceSheetId: 'src', columnMapJson: '{}', classIndex: 5, styleIds: ['pop', 'hh', 'jazz'],
      styleInstructors: { pop: ['x'], hh: [] }
    } as unknown as EventItem;
    const sessions = [
      { id: 's1', styleId: 'pop', seq: 1, date: '2026-10-06', start: '20:00', end: '22:00', instructorId: 'y' },
      { id: 's2', styleId: 'hh', seq: 1, date: '2026-10-08', start: '19:00', end: '21:00', instructorId: 'p' },
      { id: 's3', styleId: 'hh', seq: 2, date: '2026-10-15', start: '19:00', end: '21:00', instructorId: 'q' },
      { id: 's4', styleId: 'hh', seq: 3, date: '2026-10-22', start: '19:00', end: '21:00', instructorId: 'p' }
    ] as unknown as ClassSession[];
    const d = draftFromEvent(event, sessions);
    expect(d.styleInstructors).toEqual({ pop: ['x'], hh: ['p', 'q'], jazz: [] });
    expect(d.schedule.pop[0].instructorId).toBe('y');
    expect(d.schedule.hh.map(c => c.instructorId)).toEqual(['p', 'q', 'p']);
  });

  it('draftFromEvent tolerates an event without styleInstructors', () => {
    const event = {
      id: 'e1', name: 'OCT', type: 'trial', startDate: '2026-10-01', endDate: '2026-10-31',
      sourceSheetId: 'src', columnMapJson: '{}', classIndex: 5, styleIds: ['pop']
    } as unknown as EventItem;
    expect(draftFromEvent(event, []).styleInstructors).toEqual({ pop: [] });
  });

  it('pruneSchedule drops instructor lists of unticked styles', () => {
    const d = {
      ...emptyDraft('2026-10-01'),
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      styleIds: ['pop'],
      styleInstructors: { pop: ['a'], hh: ['b'] },
      schedule: { pop: [cls(1, '2026-10-06')] }
    };
    expect(pruneSchedule(d).styleInstructors).toEqual({ pop: ['a'] });
  });
});
