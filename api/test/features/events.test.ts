import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { FakeDrive } from '../fakes/fakeDrive';
import { FakeProps } from '../fakes/fakeProps';
import { Hmac, signToken } from '../../src/security/tokens';
import { getEventRoutes } from '../../src/features/events';
import { seedEvent, seedSourceSheet } from '../fixtures/events';
import { readEventMembers } from '../../src/features/eventMembers';

const nodeHmac: Hmac = (key: string, message: string) => new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
const secrets = { tokenSecret: 'test_secret_key_123456789012345678901234567890', hmac: nodeHmac };
const HEADERS = ['Timestamp', 'Full Name', 'Matric Number', 'Contact Number', 'Email', 'Classes'];

describe('Feature: events (features/events)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let drive: FakeDrive;
  let token: string;
  let master: string;
  let sourceUrl: string;

  const call = (action: string, payload?: any) => handleRequest({ action, token, payload }, ctx, secrets);

  function createPayload(overrides: any = {}) {
    return {
      name: 'OCT MONTHLY CLASS',
      type: 'monthly',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      sheetUrl: sourceUrl,
      columnMap: { fullName: 1, matric: 2, contact: 3, email: 4, gender: null, nationality: null },
      classIndex: 5,
      styleIds: ['st_popping', 'st_hiphop'],
      sessions: [
        { styleId: 'st_popping', seq: 2, date: '2026-10-13', start: '20:00', end: '22:00' },
        { styleId: 'st_popping', seq: 1, date: '2026-10-06', start: '20:00', end: '22:00' },
        { styleId: 'st_hiphop', seq: 1, date: '2026-10-08', start: '19:00', end: '21:00' }
      ],
      ...overrides
    };
  }

  beforeEach(() => {
    drive = new FakeDrive();
    const props = new FakeProps();
    props.set('SYSTEM_SPREADSHEET_ID', 'test_system_ss');
    ctx = makeCtx({ drive, props });
    registerRoutes(getEventRoutes());
    token = signToken(
      { sub: 'admin', role: 'admin', name: 'Admin', exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1,
        perms: { 'members.import': '*', 'members.view': '*' } },
      secrets.tokenSecret,
      secrets.hmac
    );
    for (const [id, name, aliases] of [['st_popping', 'Popping', ['popping']], ['st_hiphop', 'Hip Hop', ['hip hop', 'hiphop']]] as const) {
      ctx.db.styles.insert(
        { id, name, aliases: [...aliases], colorKey: 'blue', defaultWeekday: null, defaultStart: '20:00', defaultEnd: '22:00',
          defaultInstructorId: '', defaultVenue: '', attendanceFolderId: '', videoFolderId: '' } as any,
        'system',
        ctx.now()
      );
    }
    master = drive.createFolder('root', 'Attendance');
    ctx.db.settings.insert({ key: 'defaultAttendanceFolderId', value: master }, 'system', ctx.now());
    const sourceId = seedSourceSheet(ctx, [
      HEADERS,
      ['2026-10-01', 'Ali', '22001111', '0123456789', 'a@t.com', 'Popping (RM60/month)'],
      ['2026-10-01', 'Bala', '22002222', '0123456789', 'b@t.com', 'Hip Hop (RM60/month), Waacking']
    ]);
    sourceUrl = `https://docs.google.com/spreadsheets/d/${sourceId}/edit`;
  });

  it('create builds folder, members sheet, classes and attendance sheets', () => {
    const res = call('events.create', createPayload());

    expect(res.ok).toBe(true);
    const { event, sheets } = res.ok ? (res.data as any) : ({} as any);
    const folder = drive.findChildFolder(master, 'OCT MONTHLY CLASS');
    expect(event.folderId).toBe(folder);
    expect(event.status).toBe('active');
    expect(drive.parentOf(event.membersSpreadsheetId)).toBe(folder);
    expect(readEventMembers(ctx, event).map(m => m.fullName)).toEqual(['Ali', 'Bala']);
    expect(sheets.length).toBe(2);

    const pop = sheets.find((s: any) => s.styleId === 'st_popping');
    const keyRow = drive.openSpreadsheet(pop.spreadsheetId).sheet('Attendance')!.getDisplayValues()[0];
    const classes = ctx.db.sessions.find(s => s.eventId === event.id && s.styleId === 'st_popping');
    const byDate = [...classes].sort((a, b) => a.date.localeCompare(b.date)).map(s => s.id);
    expect(keyRow.slice(6)).toEqual(byDate);
    expect(drive.parentOf(pop.spreadsheetId)).toBe(folder);
  });

  it('create rejects duplicate name ignoring case and spaces', () => {
    expect(call('events.create', createPayload()).ok).toBe(true);
    const res = call('events.create', createPayload({ name: ' oct  monthly class ' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain('An event called "oct  monthly class" already exists.');
  });

  it('create refuses on old schema', () => {
    drive.openSpreadsheet('test_system_ss').addSheet('MemberMonths', ['month']);
    const res = call('events.create', createPayload());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain('Run Settings › Reset test data first');
  });

  it('create rejects a class outside the range or for a style not in the event', () => {
    const outside = call('events.create', createPayload({
      sessions: [{ styleId: 'st_popping', seq: 1, date: '2026-11-03', start: '20:00', end: '22:00' }]
    }));
    expect(outside.ok).toBe(false);

    const wrongStyle = call('events.create', createPayload({
      styleIds: ['st_popping'],
      sessions: [{ styleId: 'st_hiphop', seq: 1, date: '2026-10-08', start: '20:00', end: '22:00' }]
    }));
    expect(wrongStyle.ok).toBe(false);
    expect(ctx.db.events.all().length).toBe(0);
  });

  it('create without an attendance master folder creates nothing', () => {
    const s = ctx.db.settings.find(x => x.key === 'defaultAttendanceFolderId')[0];
    ctx.db.settings.deactivate(s.id, s.version, 'admin', ctx.now());

    const res = call('events.create', createPayload());

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain('Set the attendance master folder on the Events page first');
    expect(ctx.db.events.all().length).toBe(0);
  });

  it('list hides archived unless asked', () => {
    seedEvent(ctx, { name: 'A', startDate: '2026-10-01' });
    seedEvent(ctx, { name: 'B', startDate: '2026-11-01' });
    seedEvent(ctx, { name: 'OLD', status: 'archived', startDate: '2026-01-01' });

    const active = call('events.list', {});
    expect(active.ok && (active.data as any[]).map(e => e.name)).toEqual(['B', 'A']);
    const all = call('events.list', { includeArchived: true });
    expect(all.ok && (all.data as any[]).map(e => e.name)).toEqual(['B', 'A', 'OLD']);
  });

  describe('editing', () => {
    let event: any;
    const fresh = () => ctx.db.events.get(event.id)!;
    const update = (fields: any) => call('events.update', { id: event.id, version: fresh().version, ...fields });

    beforeEach(() => {
      const res = call('events.create', createPayload());
      event = res.ok ? (res.data as any).event : null;
    });

    it('rename renames the drive folder', () => {
      const res = update({ name: 'OCT MONTHLY CLASS 2026' });
      expect(res.ok).toBe(true);
      expect(fresh().nameKey).toBe('oct monthly class 2026');
      expect(drive.nameOf(fresh().folderId)).toBe('OCT MONTHLY CLASS 2026');
    });

    it('date change blocked by classes outside range, lists them', () => {
      const res = update({ endDate: '2026-10-10' });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toBe('VALIDATION: These classes are outside the new dates: 2026-10-13 Popping #2');
      expect(fresh().endDate).toBe('2026-10-31');
    });

    it('end date change updates lastEventEnd', () => {
      expect(update({ endDate: '2026-11-30' }).ok).toBe(true);
      expect(ctx.db.memberIndex.find(m => m.matricKey === '22001111')[0].lastEventEnd).toBe('2026-11-30');
      expect(update({ endDate: '2026-10-20' }).ok).toBe(true);
      expect(ctx.db.memberIndex.find(m => m.matricKey === '22001111')[0].lastEventEnd).toBe('2026-10-20');
    });

    it('removing a style keeps its sheet; adding a style creates one', () => {
      ctx.db.styles.insert(
        { id: 'st_latin', name: 'Latin', aliases: ['latin'], colorKey: 'pink', defaultWeekday: null, defaultStart: '20:00', defaultEnd: '22:00',
          defaultInstructorId: '', defaultVenue: '', attendanceFolderId: '', videoFolderId: '' } as any,
        'system',
        ctx.now()
      );
      const hh = ctx.db.attendanceSheets.find(a => a.eventId === event.id && a.styleId === 'st_hiphop')[0];

      expect(update({ styleIds: ['st_popping', 'st_latin'] }).ok).toBe(true);

      expect(fresh().styleIds).toEqual(['st_popping', 'st_latin']);
      expect(ctx.db.attendanceSheets.get(hh.id)!.active).toBe(true);
      expect(drive.info(hh.spreadsheetId).exists).toBe(true);
      expect(ctx.db.attendanceSheets.find(a => a.eventId === event.id && a.styleId === 'st_latin' && a.active).length).toBe(1);
    });

    it('replacing the form link makes the next sync re-read', () => {
      const other = seedSourceSheet(ctx, [HEADERS, ['2026-10-02', 'Chong', '22003333', '', '', 'Popping']]);
      expect(update({ sheetUrl: `https://docs.google.com/spreadsheets/d/${other}/edit` }).ok).toBe(true);
      expect(fresh().sourceSheetId).toBe(other);
      expect(fresh().sourceRowCount).toBe(0);
    });

    it('archive then unarchive', () => {
      expect(call('events.archive', { id: event.id, version: fresh().version }).ok).toBe(true);
      expect(fresh().status).toBe('archived');
      expect(call('events.unarchive', { id: event.id, version: fresh().version }).ok).toBe(true);
      expect(fresh().status).toBe('active');
    });

    it('recreate folder moves sheets into a new folder', () => {
      const oldFolder = fresh().folderId;
      (drive as any).items.delete(oldFolder);

      const res = call('events.recreateFolder', { id: event.id });

      expect(res.ok).toBe(true);
      const folder = fresh().folderId;
      expect(folder).not.toBe(oldFolder);
      expect(drive.parentOf(folder)).toBe(master);
      expect(drive.parentOf(fresh().membersSpreadsheetId)).toBe(folder);
      for (const a of ctx.db.attendanceSheets.find(x => x.eventId === event.id)) {
        expect(drive.parentOf(a.spreadsheetId)).toBe(folder);
      }
    });
  });

  it('preview reports detected styles and unknown classes', () => {
    const res = call('events.previewSource', { sheetUrl: sourceUrl });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const p = res.data as any;
      expect(p.rowCount).toBe(2);
      expect(p.detectedStyleIds.sort()).toEqual(['st_hiphop', 'st_popping']);
      expect(p.unknownClasses).toEqual([{ token: 'Waacking', count: 1 }]);
    }
  });
});
