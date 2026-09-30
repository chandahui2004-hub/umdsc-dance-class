import { describe, it, expect } from 'vitest';
import type { ClassSession, EventItem } from '@umdsc/shared';
import { emptyDraft, draftFromEvent, pruneSchedule, localNameClash } from './eventDraft';

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
});
