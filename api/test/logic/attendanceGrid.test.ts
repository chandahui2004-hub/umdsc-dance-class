import { describe, it, expect } from 'vitest';
import {
  sessionLabel,
  buildLayout,
  locateCell,
  planSync,
  ATTENDANCE_FIXED_KEYS,
  FIXED_LABELS
} from '../../src/logic/attendanceGrid';
import { ClassSession, Member } from '@umdsc/shared';

describe('Attendance Grid Logic (logic/attendanceGrid)', () => {
  const dummySessions: ClassSession[] = [
    {
      id: 'sess_1',
      version: 1,
      updatedBy: 'system',
      updatedAt: '2026-09-28',
      active: true,
      month: '2026-10',
      styleId: 'popping',
      seq: 1,
      date: '2026-10-07',
      start: '20:00',
      end: '22:00',
      instructorId: '',
      venue: '',
      status: 'scheduled',
      note: ''
    },
    {
      id: 'sess_2',
      version: 1,
      updatedBy: 'system',
      updatedAt: '2026-09-28',
      active: true,
      month: '2026-10',
      styleId: 'popping',
      seq: 2,
      date: '2026-10-14',
      start: '20:00',
      end: '22:00',
      instructorId: '',
      venue: '',
      status: 'cancelled',
      note: ''
    }
  ];

  const dummyMembers: Member[] = [
    {
      memberId: 'M-22004591',
      fullName: 'Ahmad Fiqri',
      matricRaw: '22004591/1',
      matricKey: '22004591',
      nameKey: 'ahmad fiqri',
      contact: '0123456789',
      email: 'ahmad@test.com',
      gender: 'M',
      nationality: 'Malaysian',
      styleIds: ['popping'],
      styleNames: ['Popping'],
      sourceTimestamp: '2026-10-01',
      flags: []
    },
    {
      memberId: 'M-S2199647',
      fullName: 'Tan Wei Jie',
      matricRaw: 'S2199647',
      matricKey: 'S2199647',
      nameKey: 'tan wei jie',
      contact: '0198765432',
      email: 'tan@test.com',
      gender: 'M',
      nationality: 'Malaysian',
      styleIds: ['popping'],
      styleNames: ['Popping'],
      sourceTimestamp: '2026-10-01',
      flags: []
    }
  ];

  it('sessionLabel formats scheduled and cancelled sessions', () => {
    expect(sessionLabel({ seq: 1, date: '2026-10-07', status: 'scheduled' })).toBe('C1 07/10 Wed');
    expect(sessionLabel({ seq: 2, date: '2026-10-14', status: 'cancelled' })).toBe('C2 14/10 Wed (cancelled)');
  });

  it('buildLayout produces keyRow, labelRow, and empty marks for members', () => {
    const layout = buildLayout(dummyMembers, dummySessions);
    expect(layout.keyRow).toEqual([...ATTENDANCE_FIXED_KEYS, 'sess_1', 'sess_2']);
    expect(layout.labelRow).toEqual([...FIXED_LABELS, 'C1 07/10 Wed', 'C2 14/10 Wed (cancelled)']);
    expect(layout.rows.length).toBe(2);
    // 6 fixed columns + 2 session columns = 8 columns
    expect(layout.rows[0].length).toBe(8);
    // Session marks initially empty string
    expect(layout.rows[0][6]).toBe('');
    expect(layout.rows[0][7]).toBe('');
  });

  it('locateCell finds the right cell after rows are sorted by name and a manual column is inserted', () => {
    // Row 1 keys: inserted manual column 'remarks' at index 2
    const keyRow = ['memberId', 'fullName', 'custom_col', 'matric', 'contact', 'gender', 'nationality', 'sess_1', 'sess_2'];
    // Column memberId: row 1 is key, row 2 is label, row 3 is Tan Wei Jie (sorted first), row 4 is Ahmad Fiqri
    const memberIdColumn = ['memberId', 'Member ID', 'M-S2199647', 'M-22004591'];

    // Locate Ahmad Fiqri for sess_1
    const loc = locateCell(keyRow, memberIdColumn, 'M-22004591', 'sess_1');
    expect(loc).toEqual({ row1: 4, col1: 8 });

    // Locate Tan Wei Jie for sess_2
    const loc2 = locateCell(keyRow, memberIdColumn, 'M-S2199647', 'sess_2');
    expect(loc2).toEqual({ row1: 3, col1: 9 });
  });

  it('locateCell returns null for unknown member or session', () => {
    const keyRow = ['memberId', 'sess_1'];
    const memberIdColumn = ['memberId', 'Member ID', 'M-22004591'];

    expect(locateCell(keyRow, memberIdColumn, 'M-UNKNOWN', 'sess_1')).toBeNull();
    expect(locateCell(keyRow, memberIdColumn, 'M-22004591', 'sess_UNKNOWN')).toBeNull();
  });

  it('planSync appends only missing session columns and members, never removes', () => {
    const existingKeyRow = ['memberId', 'fullName', 'matric', 'contact', 'gender', 'nationality', 'sess_1'];
    const existingMemberIds = ['M-22004591'];

    const sync = planSync(existingKeyRow, existingMemberIds, dummyMembers, dummySessions);
    // sess_2 is missing
    expect(sync.appendColumns).toEqual(['sess_2']);
    // M-S2199647 is missing
    expect(sync.appendRows.map(m => m.memberId)).toEqual(['M-S2199647']);
  });
});
