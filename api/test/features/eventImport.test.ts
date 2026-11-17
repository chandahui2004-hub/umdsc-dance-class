import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { makeCtx } from '../fakes/makeCtx';
import { FakeDrive } from '../fakes/fakeDrive';
import { FakeSpreadsheet, FakeSheet } from '../fakes/fakeSheets';
import { seedEvent, seedSourceSheet } from '../fixtures/events';
import { importEventMembers, sourceUnchanged, checkSourceState, AUTO_SYNC_SECONDS, FORM_CHECK_SECONDS } from '../../src/features/eventImport';
import { readEventMembers } from '../../src/features/eventMembers';
import { handleRequest } from '../../src/router';
import { signToken, Hmac } from '../../src/security/tokens';
import { EventItem } from '@umdsc/shared';

const nodeHmac: Hmac = (key: string, message: string) =>
  new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
const secrets = {
  tokenSecret: 'test_secret_key_123456789012345678901234567890',
  hmac: nodeHmac
};

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

  it('the automatic check picks up an edited older response (Review Focus 2)', () => {
    const { event, sourceId } = makeEvent([row('Ali', '22001111', 'Popping'), row('Bala', '22002222', 'Popping')]);
    importEventMembers(ctx, event, { full: false });
    const pop = attendanceSheet(event, 'st_popping');
    pop.setValues(1, 7, [['ses_x']]);
    pop.setValues(3, 7, [['/']]);
    expect(importEventMembers(ctx, fresh(event), { full: false }).changed).toBe(false);

    source(sourceId).setValues(2, 2, [['Ali Bin Abu']]);

    const result = importEventMembers(ctx, fresh(event), { full: false });

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

  it('sync stores each dancer styles per event in MemberIndex so login never opens the Members sheet', () => {
    const { event } = makeEvent([
      row('Ali', '22001111', 'Popping'),
      row('Chong', '22003333', 'Popping, Hip Hop')
    ]);

    importEventMembers(ctx, event, { full: true });

    const ali = ctx.db.memberIndex.find(m => m.matricKey === '22001111')[0];
    const chong = ctx.db.memberIndex.find(m => m.matricKey === '22003333')[0];
    expect(ali.eventStyles![event.id]).toEqual(['st_popping']);
    expect([...chong.eventStyles![event.id]].sort()).toEqual(['st_hiphop', 'st_popping']);
  });

  it('a dancer who adds a style gets fresh eventStyles and a dropped cached copy', () => {
    const { event, sourceId } = makeEvent([row('Ali', '22001111', 'Popping'), row('Bala', '22002222', 'Popping')]);
    importEventMembers(ctx, event, { full: true });
    ctx.cache.put('mi:22001111', JSON.stringify({ stale: true }), 600);

    source(sourceId).appendRows([['2026-10-05 09:00:00', 'Ali', '22001111', '0123456789', 'a@t.com', 'Hip Hop']]);
    importEventMembers(ctx, fresh(event), { full: false });

    const ali = ctx.db.memberIndex.find(m => m.matricKey === '22001111')[0];
    expect([...ali.eventStyles![event.id]].sort()).toEqual(['st_hiphop', 'st_popping']);
    expect(ctx.cache.get('mi:22001111')).toBeNull();
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

  it('sends alert email when style enrollment reaches slot capacity, and only once across subsequent syncs', () => {
    // Set videoUploaderEmail on popping style
    const popping = ctx.db.styles.find(s => s.id === 'st_popping')[0];
    ctx.db.styles.update(popping.id, popping.version, { videoUploaderEmail: 'lead@popping.com' } as any, 'system', ctx.now());
    ctx.db.admins.insert({ username: 'admin@umdsc.com', displayName: 'Admin User', roleId: 'admin' } as any, 'system', ctx.now());

    const { event, sourceId } = makeEvent(
      [
        row('Ali', '22001111', 'Popping'),
        row('Bala', '22002222', 'Popping')
      ],
      {
        styleSlots: { st_popping: 2 },
        styleSlotsJson: JSON.stringify({ st_popping: 2 })
      }
    );

    ctx.mail.reset();
    importEventMembers(ctx, event, { full: true });

    // Should have sent alert emails to clubEmail, admin, and class lead
    const alertEmails = ctx.mail.sent.filter(m => m.subject.includes('Slot Full: Popping'));
    expect(alertEmails.length).toBeGreaterThanOrEqual(1);
    const recipients = alertEmails.map(m => m.to);
    expect(recipients).toContain('umdancesportc@gmail.com');
    expect(recipients).toContain('admin@umdsc.com');
    expect(recipients).toContain('lead@popping.com');

    // Verify event is marked as notified
    const updatedEv = fresh(event);
    expect(updatedEv.notifiedFullStyles).toContain('st_popping');

    // Run sync again with an additional dancer (3rd dancer)
    ctx.mail.reset();
    source(sourceId).appendRows([['2026-10-06 10:00:00', 'Charlie', '22003333', '0123456789', 'c@test.com', 'Popping']]);
    importEventMembers(ctx, fresh(event), { full: false });

    // Should NOT re-send duplicate alert emails
    const repeatAlerts = ctx.mail.sent.filter(m => m.subject.includes('Slot Full: Popping'));
    expect(repeatAlerts.length).toBe(0);

    // If capacity is raised to 5 (greater than current 3 enrolled), it re-arms
    const currentEv = fresh(event);
    ctx.db.events.update(currentEv.id, currentEv.version, {
      styleSlots: { st_popping: 5 },
      styleSlotsJson: JSON.stringify({ st_popping: 5 })
    } as any, 'system', ctx.now());
    ctx.mail.reset();
    importEventMembers(ctx, fresh(event), { full: true });
    expect(fresh(event).notifiedFullStyles).not.toContain('st_popping');

    // Add 4th and 5th dancer to hit the new cap of 5
    source(sourceId).appendRows([
      ['2026-10-06 11:00:00', 'David', '22004444', '0123456789', 'd@test.com', 'Popping'],
      ['2026-10-06 12:00:00', 'Emma', '22005555', '0123456789', 'e@test.com', 'Popping']
    ]);
    ctx.mail.reset();
    importEventMembers(ctx, fresh(event), { full: true });
    const rearmedAlerts = ctx.mail.sent.filter(m => m.subject.includes('Slot Full: Popping'));
    expect(rearmedAlerts.length).toBeGreaterThanOrEqual(1);
    expect(fresh(event).notifiedFullStyles).toContain('st_popping');
  });

  it('sends slot alert to adminNotificationEmails from settings and counts single-style members', () => {
    ctx.db.settings.insert({ key: 'adminNotificationEmails', value: 'personal@umdsc.com, manager@umdsc.com' } as any, 'system', ctx.now());

    // Single-style event without class question in form
    const { event } = makeEvent(
      [
        row('Freestyle Dancer 1', '24001111', ''),
        row('Freestyle Dancer 2', '24002222', '')
      ],
      {
        styleIds: ['st_popping'],
        classIndex: -1,
        styleSlots: { st_popping: 2 },
        styleSlotsJson: JSON.stringify({ st_popping: 2 })
      }
    );

    ctx.mail.reset();
    importEventMembers(ctx, event, { full: true });

    const alerts = ctx.mail.sent.filter(m => m.subject.includes('Slot Full: Popping'));
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const recipients = alerts.map(m => m.to);
    expect(recipients).toContain('personal@umdsc.com');
    expect(recipients).toContain('manager@umdsc.com');
    expect(recipients).toContain('umdancesportc@gmail.com');
  });

  it('purges removed responses when purgeRemoved is true and updates memberCount to active members', () => {
    const { event, sourceId } = makeEvent([
      row('Dancer 1', '24001', 'Popping'),
      row('Dancer 2', '24002', 'Popping'),
      row('Dancer 3', '24003', 'Popping')
    ]);
    importEventMembers(ctx, event, { full: true });
    expect(fresh(event).memberCount).toBe(3);

    // Source sheet now only has 1 dancer (2 removed)
    const src = source(sourceId);
    src.rows = [src.rows[0], src.rows[1]]; // header + Dancer 1

    importEventMembers(ctx, fresh(event), { full: true, purgeRemoved: true });

    const members = readEventMembers(ctx, fresh(event));
    expect(members.length).toBe(1);
    expect(members[0].fullName).toBe('Dancer 1');
    expect(fresh(event).memberCount).toBe(1);

    // MemberIndex should not have eventId for purged dancers
    const d2 = ctx.db.memberIndex.find(m => m.matricKey === '24002')[0];
    expect(d2?.eventIds || []).not.toContain(event.id);
  });

  it('sourceUnchanged returns false when source rows are fewer than stored memberCount', () => {
    const { event, sourceId } = makeEvent([
      row('Dancer 1', '24001', 'Popping'),
      row('Dancer 2', '24002', 'Popping'),
      row('Dancer 3', '24003', 'Popping')
    ]);
    const res1 = importEventMembers(ctx, event, { full: true });
    expect(res1.memberCount).toBe(3);

    const ev = fresh(event);
    expect(ev.memberCount).toBe(3);

    // Now remove 2 dancers from source
    const src = source(sourceId);
    src.rows = [src.rows[0], src.rows[1]]; // 1 dancer + 1 header = 2 rows

    // Even if sourceRowCount was somehow cached at 2, sourceUnchanged sees 2 rows vs 3 memberCount
    expect(sourceUnchanged(ctx, { ...ev, sourceRowCount: 2, sourceLastRowHash: '' })).toBe(false);
  });

  it('checkSourceState returns unchanged: true when rows and hash match, and returns currentHash and rowCount', () => {
    const { event } = makeEvent([
      row('Dancer 1', '24001', 'Popping')
    ]);
    const res1 = importEventMembers(ctx, event, { full: true });
    const ev = fresh(event);

    const state = checkSourceState(ctx, ev);
    expect(state.unchanged).toBe(true);
    expect(state.rowCount).toBe(2);
    expect(state.currentHash).toBe(ev.sourceLastRowHash);
    expect(AUTO_SYNC_SECONDS).toBe(60);
    expect(FORM_CHECK_SECONDS).toBe(600);
  });

  it('automatically remaps Testing1 and Testing2 on matric 23005147 to unique alphanumeric TEST9001 and TEST9002', () => {
    const { event, sourceId } = makeEvent([
      row('Chan Da Hui', '23005147', 'Popping'),
      row('Testing1', '23005147', 'Hip Hop'),
      row('Testing2', '23005147', 'Popping')
    ]);

    const res = importEventMembers(ctx, event, { full: true });
    expect(res.memberCount).toBe(3);

    const members = readEventMembers(ctx, fresh(event));
    expect(members.length).toBe(3);

    const dahui = members.find(m => m.fullName === 'Chan Da Hui')!;
    const test1 = members.find(m => m.fullName === 'Testing1')!;
    const test2 = members.find(m => m.fullName === 'Testing2')!;

    expect(dahui.matricKey).toBe('23005147');
    expect(dahui.memberId).toBe('M-23005147');

    expect(test1.matricKey).toBe('TEST9001');
    expect(test1.memberId).toBe('M-TEST9001');

    expect(test2.matricKey).toBe('TEST9002');
    expect(test2.memberId).toBe('M-TEST9002');

    // And verify the source sheet was updated
    const src = source(sourceId);
    expect(src.getDisplayValues()[2][2]).toBe('TEST9001');
    expect(src.getDisplayValues()[3][2]).toBe('TEST9002');
  });

  it('ignores a new incomplete row while admin is typing in Google Sheets, then imports it once completed', () => {
    const { event, sourceId } = makeEvent([
      row('Ali', '22001111', 'Popping')
    ]);
    importEventMembers(ctx, event, { full: true });
    ctx.mail.reset();

    // Admin starts typing a new row in Google Sheets (missing dance class)
    const src = source(sourceId);
    src.appendRows([['2026-10-05 11:00:00', 'Half Typed Dancer', '24008888', '0123456789', 'half@test.com', '']]);

    const midEditRes = importEventMembers(ctx, fresh(event), { full: false, purgeRemoved: true });
    expect(midEditRes.added).toBe(0);
    expect(readEventMembers(ctx, fresh(event)).map(m => m.fullName)).toEqual(['Ali']);
    expect(ctx.mail.sent.length).toBe(0);
    // Hash must not be locked as clean while incomplete rows exist
    expect(sourceUnchanged(ctx, fresh(event))).toBe(false);

    // Admin finishes typing the class cell in Google Sheets
    src.setValues(3, 6, [['Hip Hop']]);
    const finalRes = importEventMembers(ctx, fresh(event), { full: false, purgeRemoved: true });
    expect(finalRes.added).toBe(1);
    expect(readEventMembers(ctx, fresh(event)).map(m => m.fullName)).toEqual(['Ali', 'Half Typed Dancer']);
    expect(ctx.mail.sent.length).toBe(1);
    expect(ctx.mail.sent[0].to).toBe('half@test.com');
  });

  it('preserves existing members and does not purge or flag them when an admin is mid-edit on an existing row in Google Sheets', () => {
    const { event, sourceId } = makeEvent([
      row('Ali', '22001111', 'Popping'),
      row('Bala', '22002222', 'Hip Hop')
    ]);
    importEventMembers(ctx, event, { full: true });

    // Admin temporarily clears Bala's matric cell while editing in Google Sheets
    const src = source(sourceId);
    src.setValues(3, 3, [['']]);

    const res = importEventMembers(ctx, fresh(event), { full: true, purgeRemoved: true });
    expect(res.purged).toBe(0);
    expect(res.flaggedRemoved).toBe(0);

    const members = readEventMembers(ctx, fresh(event));
    expect(members.map(m => m.fullName)).toEqual(['Ali', 'Bala']);
    expect(members.find(m => m.fullName === 'Bala')!.flags).not.toContain('removed-from-form');
  });

  it('readEventMembers skips rows in Members sheet that are missing fullName or matric', () => {
    const { event } = makeEvent([row('Ali', '22001111', 'Popping')]);
    importEventMembers(ctx, event, { full: true });
    const ev = fresh(event);
    const membersSheet = (drive.openSpreadsheet(ev.membersSpreadsheetId) as FakeSpreadsheet).sheet('Members') as FakeSheet;
    // Admin types half-empty rows directly into Members sheet (missing fullName or missing matric)
    membersSheet.appendRows([
      ['M-99999999', '', '22009999', '22009999', '', '', '', '', '', 'st_popping', 'Popping', '', ''],
      ['M-99999998', 'Half Typed Name', '', '', '', '', '', '', '', 'st_popping', 'Popping', '', '']
    ]);
    membersChangedAndClearCache();

    function membersChangedAndClearCache() {
      ctx.props.set('MEMBERS_V_' + ev.id, '999');
    }

    const members = readEventMembers(ctx, ev);
    expect(members.map(m => m.fullName)).toEqual(['Ali']);
  });

  it('preserves custom matric edits on testing1 and testing2 when their matric is not the conflicting 23005147', () => {
    const { event } = makeEvent([
      row('testing1', 'TEST9003', 'Popping'),
      row('testing2', 'TEST9004', 'Hip Hop')
    ]);
    importEventMembers(ctx, event, { full: true });
    const members = readEventMembers(ctx, fresh(event));
    expect(members.find(m => m.fullName === 'testing1')?.matricKey).toBe('TEST9003');
    expect(members.find(m => m.fullName === 'testing2')?.matricKey).toBe('TEST9004');
  });

  it('sync updates existing memberIndex row keyed by matricKey without creating duplicate rows when existing row has mi_ id', () => {
    // Existing row with auto-generated id mi_legacy_123
    ctx.db.memberIndex.insert(
      {
        id: 'mi_legacy_123',
        matricKey: '22001111',
        nameKey: 'ali',
        fullName: 'Ali',
        eventIds: ['evt_old'],
        eventStyles: { evt_old: ['st_popping'] },
        lastEventEnd: '2026-10-31',
        active: true
      } as any,
      'test',
      ctx.now()
    );

    const { event } = makeEvent([row('Ali', '22001111', 'Popping')]);
    importEventMembers(ctx, event, { full: true });

    const activeRows = ctx.db.memberIndex.find(m => m.matricKey === '22001111' && m.active);
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0].eventIds).toContain('evt_old');
    expect(activeRows[0].eventIds).toContain(event.id);
  });

  it('clears dropped style row (even with ticks) from Attendance sheet, updates MemberIndex.eventStyles, and excludes from attendance.get', () => {
    const { event, sourceId } = makeEvent([
      row('Ali', '22001111', 'Popping'),
      row('Bala', '22002222', 'Popping')
    ]);
    const session = ctx.db.sessions.insert(
      {
        eventId: event.id,
        styleId: 'st_popping',
        seq: 1,
        date: '2026-10-06',
        start: '20:00',
        end: '22:00',
        instructorId: '',
        venue: '',
        status: 'scheduled',
        note: ''
      },
      'admin',
      ctx.now()
    );
    importEventMembers(ctx, fresh(event), { full: true });

    // Tick Ali present in Popping
    const popSheet = attendanceSheet(event, 'st_popping');
    const popData = popSheet.getDisplayValues();
    const sesCol = popData[0].indexOf(session.id);
    const aliRow = popData.findIndex(r => r[0] === 'M-22001111');
    popSheet.setValues(aliRow + 1, sesCol + 1, [['/']]);

    // Populate attendance.get cache for Popping before the style switch
    const adminToken = signToken(
      {
        sub: 'admin',
        role: 'admin',
        name: 'Admin',
        exp: Math.floor(ctx.now().getTime() / 1000) + 3600,
        pv: 1,
        perms: { 'attendance.view.all': '*' }
      },
      secrets.tokenSecret,
      secrets.hmac
    );
    const beforeGrid = handleRequest(
      { action: 'attendance.get', token: adminToken, payload: { eventId: event.id, styleId: 'st_popping' } },
      ctx,
      secrets
    );
    expect(beforeGrid.ok && (beforeGrid.data as any).members.map((m: any) => m.memberId)).toEqual(['M-22001111', 'M-22002222']);

    // Ali switches from Popping to Hip Hop in the response sheet
    source(sourceId).setValues(2, 6, [['Hip Hop']]);
    importEventMembers(ctx, fresh(event), { full: true, purgeRemoved: true });

    // Popping Attendance sheet row for Ali is cleared (despite the '/' tick)
    const popRows = popSheet.getDisplayValues().slice(2).filter(r => r[0]);
    expect(popRows.map(r => r[0])).toEqual(['M-22002222']);

    // Hip Hop Attendance sheet now includes Ali
    const hhRows = attendanceSheet(event, 'st_hiphop').getDisplayValues().slice(2).filter(r => r[0]);
    expect(hhRows.map(r => r[0])).toEqual(['M-22001111']);

    // attendance.get for Popping no longer returns Ali
    const afterGrid = handleRequest(
      { action: 'attendance.get', token: adminToken, payload: { eventId: event.id, styleId: 'st_popping' } },
      ctx,
      secrets
    );
    expect(afterGrid.ok).toBe(true);
    if (afterGrid.ok) {
      expect((afterGrid.data as any).members.map((m: any) => m.memberId)).toEqual(['M-22002222']);
      expect((afterGrid.data as any).present['M-22001111']).toBeUndefined();
    }

    // MemberIndex.eventStyles[event.id] only lists st_hiphop
    const mi = ctx.db.memberIndex.find(m => m.matricKey === '22001111' && m.active)[0];
    expect(mi.eventStyles?.[event.id]).toEqual(['st_hiphop']);
  });

  it('clears last/only dancer (even with ticks) from Members and Attendance sheets and deactivates MemberIndex when 0 events remain', () => {
    const { event, sourceId } = makeEvent([row('Ali', '22001111', 'Popping')]);
    const session = ctx.db.sessions.insert(
      {
        eventId: event.id,
        styleId: 'st_popping',
        seq: 1,
        date: '2026-10-06',
        start: '20:00',
        end: '22:00',
        instructorId: '',
        venue: '',
        status: 'scheduled',
        note: ''
      },
      'admin',
      ctx.now()
    );
    importEventMembers(ctx, fresh(event), { full: true });

    // Tick Ali present in Popping
    const popSheet = attendanceSheet(event, 'st_popping');
    const sesCol = popSheet.getDisplayValues()[0].indexOf(session.id);
    popSheet.setValues(3, sesCol + 1, [['/']]);

    const miBefore = ctx.db.memberIndex.find(m => m.matricKey === '22001111' && m.active)[0];
    ctx.cache.put('mi:22001111', JSON.stringify(miBefore), 600);
    ctx.cache.put('mi:' + miBefore.id, JSON.stringify(miBefore), 600);

    // Delete Ali (the only dancer) from the source response sheet
    const src = source(sourceId);
    src.rows = [src.rows[0]];
    importEventMembers(ctx, fresh(event), { full: true, purgeRemoved: true });

    // Members sheet and Attendance sheet are both empty of Ali
    expect(readEventMembers(ctx, fresh(event))).toEqual([]);
    const remainingAttRows = popSheet.getDisplayValues().slice(2).filter(r => r[0]);
    expect(remainingAttRows).toEqual([]);

    // MemberIndex entry is deactivated with 0 events and caches evicted
    const miAfter = ctx.db.memberIndex.get(miBefore.id)!;
    expect(miAfter.active).toBe(false);
    expect(miAfter.eventIds).toEqual([]);
    expect(miAfter.eventStyles).toEqual({});
    expect(ctx.cache.get('mi:22001111')).toBeNull();
    expect(ctx.cache.get('mi:' + miBefore.id)).toBeNull();
  });

  it('removes only the dropped event from MemberIndex when dancer remains enrolled in another event', () => {
    const { event: event1 } = makeEvent([row('Ali', '22001111', 'Popping')], { name: 'EVENT ONE' });
    const { event: event2, sourceId: source2 } = makeEvent([row('Ali', '22001111', 'Hip Hop')], { name: 'EVENT TWO' });
    importEventMembers(ctx, fresh(event1), { full: true });
    importEventMembers(ctx, fresh(event2), { full: true });

    // Remove Ali from Event 2 (without purgeRemoved, verifying MemberIndex still cleans up)
    const src2 = source(source2);
    src2.rows = [src2.rows[0]];
    importEventMembers(ctx, fresh(event2), { full: true });

    // Event 2's Hip Hop attendance sheet is cleared of Ali
    const hhRows2 = attendanceSheet(event2, 'st_hiphop').getDisplayValues().slice(2).filter(r => r[0]);
    expect(hhRows2).toEqual([]);

    // Event 1's Popping attendance sheet still has Ali
    const popRows1 = attendanceSheet(event1, 'st_popping').getDisplayValues().slice(2).filter(r => r[0]);
    expect(popRows1.map(r => r[0])).toEqual(['M-22001111']);

    // MemberIndex stays active with only Event 1 intact
    const mi = ctx.db.memberIndex.find(m => m.matricKey === '22001111' && m.active)[0];
    expect(mi).toBeDefined();
    expect(mi.active).toBe(true);
    expect(mi.eventIds).toEqual([event1.id]);
    expect(mi.eventStyles?.[event1.id]).toEqual(['st_popping']);
    expect(mi.eventStyles?.[event2.id]).toBeUndefined();
  });

  it('sweeps stale MemberIndex entries still referencing an event when no longer in source sheet', () => {
    const { event, sourceId } = makeEvent([row('Ali', '22001111', 'Popping')]);
    importEventMembers(ctx, fresh(event), { full: true });

    // Inject a stale active MemberIndex entry referencing event.id even though not in Members or source sheet
    const stale = ctx.db.memberIndex.insert(
      {
        matricKey: '22009999',
        nameKey: 'ghost',
        fullName: 'Ghost Dancer',
        eventIds: [event.id],
        eventStyles: { [event.id]: ['st_popping'] },
        lastEventEnd: '2026-10-31',
        active: true
      } as any,
      'test',
      ctx.now()
    );
    ctx.cache.put('mi:22009999', JSON.stringify(stale), 600);

    // Sync runs after a new dancer joins
    source(sourceId).appendRows([row('Bala', '22002222', 'Popping')]);
    importEventMembers(ctx, fresh(event), { full: false });

    const staleAfter = ctx.db.memberIndex.get(stale.id)!;
    expect(staleAfter.active).toBe(false);
    expect(staleAfter.eventIds).toEqual([]);
    expect(ctx.cache.get('mi:22009999')).toBeNull();
  });
});

