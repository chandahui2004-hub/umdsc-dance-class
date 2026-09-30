import { describe, it, expect, beforeEach } from 'vitest';
import { makeCtx } from '../fakes/makeCtx';
import { FakeDrive } from '../fakes/fakeDrive';
import { FakeSpreadsheet, FakeSheet } from '../fakes/fakeSheets';
import { seedEvent, seedSourceSheet } from '../fixtures/events';
import { importEventMembers } from '../../src/features/eventImport';
import { readEventMembers } from '../../src/features/eventMembers';
import { EventItem } from '@umdsc/shared';

const HEADERS = ['Timestamp', 'Full Name', 'Matric Number', 'Contact Number', 'Email', 'Classes'];
const row = (name: string, matric: string, classes: string) =>
  ['2026-10-01 10:00:00', name, matric, '0123456789', `${matric}@test.com`, classes];

describe('importEventMembers', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let drive: FakeDrive;
  let master: string;

  function addStyle(id: string, name: string, aliases: string[]) {
    ctx.db.styles.insert(
      { id, name, aliases, colorKey: 'blue', defaultWeekday: null, defaultStart: '20:00', defaultEnd: '22:00',
        defaultInstructorId: '', defaultVenue: '', attendanceFolderId: '', videoFolderId: '' } as any,
      'system',
      ctx.now()
    );
  }

  function makeEvent(rows: string[][], fields: Partial<EventItem> = {}): { event: EventItem; sourceId: string } {
    const sourceId = seedSourceSheet(ctx, [HEADERS, ...rows]);
    const event = seedEvent(ctx, {
      name: 'OCT MONTHLY CLASS',
      sourceSheetId: sourceId,
      sourceTab: 'Form Responses 1',
      classIndex: 5,
      styleIds: ['st_popping', 'st_hiphop'],
      ...fields
    });
    return { event, sourceId };
  }

  const fresh = (e: EventItem) => ctx.db.events.get(e.id)!;
  const source = (id: string) => (drive.openSpreadsheet(id) as FakeSpreadsheet).sheet('Form Responses 1') as FakeSheet;
  const attendanceSheet = (e: EventItem, styleId: string) => {
    const rec = ctx.db.attendanceSheets.find(a => a.eventId === e.id && a.styleId === styleId && a.active)[0];
    return drive.openSpreadsheet(rec.spreadsheetId).sheet('Attendance') as FakeSheet;
  };
  const totalWrites = () => {
    let n = 0;
    for (const ss of drive.spreadsheets.values()) for (const sh of ss.sheetsMap.values()) n += sh.writeCalls;
    return n;
  };

  beforeEach(() => {
    drive = new FakeDrive();
    ctx = makeCtx({ drive });
    addStyle('st_popping', 'Popping', ['popping']);
    addStyle('st_hiphop', 'Hip Hop', ['hip hop', 'hiphop']);
    master = drive.createFolder('root', 'Attendance');
    ctx.db.settings.insert({ key: 'defaultAttendanceFolderId', value: master }, 'system', ctx.now());
  });

  it('first import creates members sheet rows, attendance rows and MemberIndex in batched writes', () => {
    const { event } = makeEvent([
      row('Ali', '22001111', 'Popping (RM60/month)'),
      row('Bala', '22002222', 'Hip Hop (RM60/month)'),
      row('Chong', '22003333', 'Popping (RM60/month), Hip Hop (RM60/month)')
    ]);
    ctx.db.memberIndex.all();
    const indexSheet = (drive.openSpreadsheet('test_system_ss') as FakeSpreadsheet).sheet('MemberIndex') as FakeSheet;
    const before = indexSheet.writeCalls;

    const result = importEventMembers(ctx, event, { full: false });

    expect(result).toMatchObject({ changed: true, added: 3, memberCount: 3 });
    expect(readEventMembers(ctx, fresh(event)).map(m => m.fullName)).toEqual(['Ali', 'Bala', 'Chong']);
    const pop = attendanceSheet(event, 'st_popping').getDisplayValues().slice(2).map(r => r[1]);
    const hh = attendanceSheet(event, 'st_hiphop').getDisplayValues().slice(2).map(r => r[1]);
    expect(pop).toEqual(['Ali', 'Chong']);
    expect(hh).toEqual(['Bala', 'Chong']);
    const index = ctx.db.memberIndex.all();
    expect(index.length).toBe(3);
    expect(index.every(m => m.eventIds.join() === event.id && m.lastEventEnd === '2026-10-31')).toBe(true);
    expect(indexSheet.writeCalls - before).toBe(1);
    expect(drive.parentOf(fresh(event).membersSpreadsheetId)).toBe(fresh(event).folderId);
    expect(drive.nameOf(fresh(event).folderId)).toBe('OCT MONTHLY CLASS');
  });

  it('cheap check with no change does nothing', () => {
    const { event } = makeEvent([row('Ali', '22001111', 'Popping')]);
    importEventMembers(ctx, event, { full: false });
    const writes = totalWrites();

    const second = importEventMembers(ctx, fresh(event), { full: false });

    expect(second.changed).toBe(false);
    expect(totalWrites()).toBe(writes);
  });

  it('new response appends one member and keeps existing ticks', () => {
    const { event, sourceId } = makeEvent([row('Ali', '22001111', 'Popping'), row('Bala', '22002222', 'Popping')]);
    importEventMembers(ctx, event, { full: false });
    ctx.db.sessions.insert(
      { eventId: event.id, styleId: 'st_popping', seq: 1, date: '2026-10-06', start: '20:00', end: '22:00', instructorId: '', venue: '', status: 'scheduled', note: '' },
      'admin',
      ctx.now()
    );
    importEventMembers(ctx, fresh(event), { full: true });
    const pop = attendanceSheet(event, 'st_popping');
    pop.setValues(3, 7, [['/']]);

    source(sourceId).appendRows([row('Devi', '22004444', 'Popping')]);
    const result = importEventMembers(ctx, fresh(event), { full: false });

    expect(result).toMatchObject({ changed: true, added: 1 });
    const rows = pop.getDisplayValues();
    expect(rows.slice(2).map(r => r[1])).toEqual(['Ali', 'Bala', 'Devi']);
    expect(rows[2][6]).toBe('/');
  });

  it('sync now picks up an edited older response (Review Focus 2)', () => {
    const { event, sourceId } = makeEvent([row('Ali', '22001111', 'Popping'), row('Bala', '22002222', 'Popping')]);
    importEventMembers(ctx, event, { full: false });
    const pop = attendanceSheet(event, 'st_popping');
    pop.setValues(1, 7, [['ses_x']]);
    pop.setValues(3, 7, [['/']]);

    source(sourceId).setValues(2, 2, [['Ali Bin Abu']]);

    expect(importEventMembers(ctx, fresh(event), { full: false }).changed).toBe(false);
    const result = importEventMembers(ctx, fresh(event), { full: true });

    expect(result.updated).toBe(1);
    expect(readEventMembers(ctx, fresh(event))[0].fullName).toBe('Ali Bin Abu');
    expect(pop.getDisplayValues()[2][1]).toBe('Ali Bin Abu');
    expect(pop.getDisplayValues()[2][6]).toBe('/');
    expect(ctx.db.memberIndex.find(m => m.matricKey === '22001111')[0].fullName).toBe('Ali Bin Abu');
  });

  it('unknown class in form is reported, other styles kept (Review Focus 4)', () => {
    const { event } = makeEvent([row('Ali', '22001111', 'Popping, Waacking')]);

    const result = importEventMembers(ctx, event, { full: true });

    expect(readEventMembers(ctx, fresh(event))[0].styleIds).toEqual(['st_popping']);
    expect(result.unknownClasses).toEqual([{ token: 'Waacking', count: 1 }]);
    expect(fresh(event).lastSyncError).toContain('Waacking');
  });

  it('single-style event with no class column puts everyone in that style', () => {
    const sourceId = seedSourceSheet(ctx, [
      ['Timestamp', 'Full Name', 'Matric Number'],
      ['2026-10-01', 'Ali', '22001111'],
      ['2026-10-01', 'Bala', '22002222']
    ]);
    const event = seedEvent(ctx, {
      name: 'WAACKING WORKSHOP', sourceSheetId: sourceId, sourceTab: 'Form Responses 1', classIndex: -1, styleIds: ['st_popping']
    });

    importEventMembers(ctx, event, { full: true });

    const members = readEventMembers(ctx, fresh(event));
    expect(members.map(m => m.styleIds)).toEqual([['st_popping'], ['st_popping']]);
    expect(members.every(m => !m.flags.includes('noStyle'))).toBe(true);
  });

  it('same dancer in two overlapping events', () => {
    const a = makeEvent([row('Ali', '22001111', 'Popping')]).event;
    const bSource = seedSourceSheet(ctx, [HEADERS, row('Ali', '22001111', 'Popping')]);
    const b = seedEvent(ctx, {
      name: 'TRIAL CLASS', sourceSheetId: bSource, sourceTab: 'Form Responses 1', classIndex: 5,
      styleIds: ['st_popping'], startDate: '2026-10-10', endDate: '2026-11-15'
    });

    importEventMembers(ctx, a, { full: true });
    importEventMembers(ctx, b, { full: true });

    const mi = ctx.db.memberIndex.find(m => m.matricKey === '22001111')[0];
    expect(mi.eventIds.sort()).toEqual([a.id, b.id].sort());
    expect(mi.lastEventEnd).toBe('2026-11-15');
  });

  it('auto-sync picks up a second submission that adds a style (review #3)', () => {
    const { event, sourceId } = makeEvent([row('Ali', '22001111', 'Popping'), row('Bala', '22002222', 'Popping')]);
    importEventMembers(ctx, event, { full: true });

    source(sourceId).appendRows([['2026-10-05 09:00:00', 'Ali', '22001111', '0123456789', 'a@t.com', 'Hip Hop']]);
    const result = importEventMembers(ctx, fresh(event), { full: false });

    expect(result.changed).toBe(true);
    const ali = readEventMembers(ctx, fresh(event)).find(m => m.matricKey === '22001111')!;
    expect(ali.styleIds.sort()).toEqual(['st_hiphop', 'st_popping']);
    const hh = attendanceSheet(event, 'st_hiphop').getDisplayValues().slice(2).map(r => r[1]);
    expect(hh).toContain('Ali');
  });

  it('a member missing from the form is flagged, never removed', () => {
    const { event, sourceId } = makeEvent([row('Ali', '22001111', 'Popping'), row('Bala', '22002222', 'Popping')]);
    importEventMembers(ctx, event, { full: true });
    const src = source(sourceId);
    src.rows = src.rows.slice(0, 2);

    const result = importEventMembers(ctx, fresh(event), { full: true });

    const members = readEventMembers(ctx, fresh(event));
    expect(members.length).toBe(2);
    expect(members[1].flags).toContain('removed-from-form');
    expect(result.flaggedRemoved).toBe(1);
  });
});
