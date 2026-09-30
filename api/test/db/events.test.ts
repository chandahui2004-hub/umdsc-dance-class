import { describe, it, expect } from 'vitest';
import { FakeDrive } from '../fakes/fakeDrive';
import { openDb } from '../../src/db/db';

describe('Events table', () => {
  it('events table round-trips styleIds and numbers', () => {
    const drive = new FakeDrive();
    const db = openDb(drive, 'sys');
    const now = new Date('2026-09-30T12:00:00Z');

    const created = db.events.insert(
      {
        name: 'OCT MONTHLY CLASS',
        nameKey: 'oct monthly class',
        type: 'monthly',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        sourceSheetId: 'src1',
        sourceTab: 'Form Responses 1',
        columnMapJson: '{}',
        classIndex: 5,
        styleIds: ['sty_a', 'sty_b'],
        folderId: '',
        videoFolderId: '',
        membersSpreadsheetId: '',
        status: 'active',
        sourceRowCount: 0,
        sourceLastRowHash: '',
        lastSyncAt: '',
        lastSyncError: '',
        memberCount: 0
      },
      'admin',
      now
    );

    const reread = openDb(drive, 'sys').events.get(created.id)!;
    expect(created.id).toMatch(/^evt_/);
    expect(reread.styleIds).toEqual(['sty_a', 'sty_b']);
    expect(reread.classIndex).toBe(5);
    expect(reread.memberCount).toBe(0);
    expect(reread.status).toBe('active');
    expect(reread.startDate).toBe('2026-10-01');
  });
});
