import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    const folder = drive.findChildFolder(drive.findChildFolder(master, '2026')!, 'OCT MONTHLY CLASS');
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

  describe('style instructors', () => {
    const addStyle = (id: string, name: string) =>
      ctx.db.styles.insert(
        { id, name, aliases: [name.toLowerCase()], colorKey: 'pink', defaultWeekday: null, defaultStart: '20:00', defaultEnd: '22:00',
          defaultInstructorId: 'ins_default', defaultVenue: '', attendanceFolderId: '', videoFolderId: '' } as any,
        'system',
        ctx.now()
      );
    const addInstructor = (name: string, styleIds: string[], active = true) => {
      const i = ctx.db.instructors.insert({ name, contact: '', styleIds } as any, 'system', ctx.now());
      if (!active) ctx.db.instructors.deactivate(i.id, i.version, 'system', ctx.now());
      return i.id;
    };
    let kelvin: string;
    let lam: string;

    beforeEach(() => {
      addStyle('st_latin', 'Latin');
      addStyle('st_locking', 'Locking');
      kelvin = addInstructor('Kelvin', ['st_popping', 'st_hiphop', 'st_latin']);
      lam = addInstructor('Lam', ['st_popping', 'st_hiphop']);
    });

    const one = (extra: any = {}) => createPayload({
      styleIds: ['st_popping', 'st_hiphop'],
      styleInstructors: { st_popping: [kelvin, lam], st_hiphop: [lam] },
      ...extra
    });

    it('create saves styleInstructors and gives classes their chosen instructor', () => {
      const res = call('events.create', one({
        sessions: [
          { styleId: 'st_popping', seq: 1, date: '2026-10-06', start: '20:00', end: '22:00', instructorId: lam },
          { styleId: 'st_hiphop', seq: 1, date: '2026-10-08', start: '19:00', end: '21:00' }
        ]
      }));

      expect(res.ok).toBe(true);
      const event = res.ok ? (res.data as any).event : null;
      expect(ctx.db.events.get(event.id)!.styleInstructors).toEqual({ st_popping: [kelvin, lam], st_hiphop: [lam] });
      const classes = ctx.db.sessions.find(s => s.eventId === event.id);
      expect(classes.find(c => c.styleId === 'st_popping')!.instructorId).toBe(lam);
    });

    it('create gives a class with no instructor the first in the list', () => {
      const res = call('events.create', one());

      const event = res.ok ? (res.data as any).event : null;
      const classes = ctx.db.sessions.find(s => s.eventId === event.id);
      expect(classes.filter(c => c.styleId === 'st_popping').every(c => c.instructorId === kelvin)).toBe(true);
      expect(classes.filter(c => c.styleId === 'st_hiphop').every(c => c.instructorId === lam)).toBe(true);
    });

    it("create refuses an instructor who doesn't teach the style", () => {
      const res = call('events.create', one({
        styleIds: ['st_popping', 'st_locking'],
        styleInstructors: { st_popping: [kelvin], st_locking: [lam] },
        sessions: []
      }));

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toBe("Lam doesn't teach Locking.");
      expect(ctx.db.events.all().length).toBe(0);
    });

    it('create refuses a style with no instructors', () => {
      const res = call('events.create', one({
        styleIds: ['st_popping', 'st_locking'],
        styleInstructors: { st_popping: [kelvin] },
        sessions: []
      }));

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toBe('Choose at least one instructor for Locking.');
      expect(ctx.db.events.all().length).toBe(0);
    });

    it('create refuses an inactive or unknown instructor', () => {
      const gone = addInstructor('Gone', ['st_popping'], false);
      const res = call('events.create', one({ styleInstructors: { st_popping: [gone], st_hiphop: [lam] } }));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toBe("Gone doesn't teach Popping.");

      const unknown = call('events.create', one({ styleInstructors: { st_popping: ['ins_nope'], st_hiphop: [lam] } }));
      expect(unknown.ok).toBe(false);
    });

    it('create de-duplicates, keeps order and ignores styles not in the event', () => {
      const res = call('events.create', one({
        styleInstructors: { st_popping: [lam, kelvin, lam], st_hiphop: [lam], st_latin: [kelvin] },
        sessions: []
      }));

      const event = res.ok ? (res.data as any).event : null;
      expect(ctx.db.events.get(event.id)!.styleInstructors).toEqual({ st_popping: [lam, kelvin], st_hiphop: [lam] });
    });

    it('create refuses a class instructor outside its style list', () => {
      const other = addInstructor('Other', ['st_latin', 'st_popping']);
      const res = call('events.create', one({
        styleIds: ['st_popping', 'st_latin'],
        styleInstructors: { st_popping: [kelvin], st_latin: [other] },
        sessions: [{ styleId: 'st_latin', seq: 1, date: '2026-10-06', start: '20:00', end: '22:00', instructorId: kelvin }]
      }));

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toBe("Kelvin isn't an instructor for Latin in this event.");
      expect(ctx.db.events.all().length).toBe(0);
    });

    it('old website create without styleInstructors fills lists from active teachers, and allows a style nobody teaches', () => {
      addInstructor('Retired', ['st_popping'], false);
      const res = call('events.create', createPayload({
        styleIds: ['st_popping', 'st_locking'],
        sessions: [{ styleId: 'st_locking', seq: 1, date: '2026-10-06', start: '20:00', end: '22:00' }]
      }));

      expect(res.ok).toBe(true);
      const event = res.ok ? (res.data as any).event : null;
      expect(ctx.db.events.get(event.id)!.styleInstructors).toEqual({ st_popping: [kelvin, lam], st_locking: [] });
      const cls = ctx.db.sessions.find(s => s.eventId === event.id)[0];
      expect(cls.instructorId).toBe('');
    });

    describe('update', () => {
      let event: any;
      const fresh = () => ctx.db.events.get(event.id)!;
      const update = (fields: any) => call('events.update', { id: event.id, version: fresh().version, ...fields });

      beforeEach(() => {
        const res = call('events.create', one());
        event = res.ok ? (res.data as any).event : null;
      });

      it('replaces the lists and drops styles removed from the event', () => {
        const res = update({ styleIds: ['st_popping', 'st_latin'], styleInstructors: { st_popping: [lam], st_latin: [kelvin], st_hiphop: [lam] } });

        expect(res.ok).toBe(true);
        expect(fresh().styleInstructors).toEqual({ st_popping: [lam], st_latin: [kelvin] });
      });

      it('without styleInstructors keeps the stored lists (old website)', () => {
        const res = update({ name: 'OCT MONTHLY CLASS 2026' });
        expect(res.ok).toBe(true);
        expect(fresh().styleInstructors).toEqual({ st_popping: [kelvin, lam], st_hiphop: [lam] });

        expect(update({ styleIds: ['st_popping'] }).ok).toBe(true);
        expect(fresh().styleInstructors).toEqual({ st_popping: [kelvin, lam] });
      });

      it('refuses a style left with no instructors', () => {
        const res = update({ styleIds: ['st_popping', 'st_locking'], styleInstructors: { st_popping: [kelvin] } });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error.message).toBe('Choose at least one instructor for Locking.');
        expect(fresh().styleIds).toEqual(['st_popping', 'st_hiphop']);
      });

      it('keeps an already-listed instructor who no longer teaches the style', () => {
        const k = ctx.db.instructors.get(kelvin)!;
        ctx.db.instructors.update(kelvin, k.version, { styleIds: ['st_hiphop'] }, 'system', ctx.now());
        const res = update({ name: 'OCT RENAMED', styleInstructors: { st_popping: [kelvin, lam], st_hiphop: [lam] } });
        expect(res.ok, JSON.stringify(res)).toBe(true);
        expect(fresh().styleInstructors).toEqual({ st_popping: [kelvin, lam], st_hiphop: [lam] });
      });

      it('keeps an already-listed deactivated instructor', () => {
        const l = ctx.db.instructors.get(lam)!;
        ctx.db.instructors.deactivate(lam, l.version, 'system', ctx.now());
        const res = update({ name: 'OCT RENAMED', styleInstructors: { st_popping: [kelvin, lam], st_hiphop: [lam] } });
        expect(res.ok, JSON.stringify(res)).toBe(true);
        expect(fresh().styleInstructors).toEqual({ st_popping: [kelvin, lam], st_hiphop: [lam] });
      });

      it('still refuses adding an instructor who does not teach the style', () => {
        addInstructor('Other', ['st_latin']);
        const other = ctx.db.instructors.find(i => i.name === 'Other')[0].id;
        const res = update({ styleInstructors: { st_popping: [kelvin, other], st_hiphop: [lam] } });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error.message).toBe("Other doesn't teach Popping.");
      });

      it('does not require instructors for a style that has been deactivated', () => {
        const hh = ctx.db.styles.get('st_hiphop')!;
        ctx.db.styles.deactivate('st_hiphop', hh.version, 'system', ctx.now());
        const res = update({ name: 'OCT RENAMED', styleInstructors: { st_popping: [kelvin] } });
        expect(res.ok, JSON.stringify(res)).toBe(true);
        expect(fresh().styleIds).toEqual(['st_popping', 'st_hiphop']);
        expect(fresh().styleInstructors).toEqual({ st_popping: [kelvin], st_hiphop: [] });
      });
    });
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
    if (!res.ok) expect(res.error.message).toContain('Set the attendance master folder on the Attendance page first');
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

    it('start date moved into another year moves the attendance and style video folders to that year', () => {
      const styleFolder = drive.createFolder('root', 'Popping videos');
      const style = ctx.db.styles.find(s => s.id === 'st_popping')[0];
      ctx.db.styles.update(style.id, style.version, { videoFolderId: styleFolder }, 'system', ctx.now());
      const videoFolder = drive.createFolder(drive.createFolder(styleFolder, '2026'), 'OCT MONTHLY CLASS');
      drive.createFolder(styleFolder, '2025');

      expect(update({ startDate: '2025-12-15' }).ok).toBe(true);

      expect(drive.parentOf(fresh().folderId)).toBe(drive.findChildFolder(master, '2025'));
      expect(drive.parentOf(videoFolder)).toBe(drive.findChildFolder(styleFolder, '2025'));
    });

    it('start date moved into another year leaves the video folder if that year has no folder yet (the website makes it)', () => {
      const styleFolder = drive.createFolder('root', 'Popping videos');
      const style = ctx.db.styles.find(s => s.id === 'st_popping')[0];
      ctx.db.styles.update(style.id, style.version, { videoFolderId: styleFolder }, 'system', ctx.now());
      const year2026 = drive.createFolder(styleFolder, '2026');
      const videoFolder = drive.createFolder(year2026, 'OCT MONTHLY CLASS');

      expect(update({ startDate: '2025-12-15' }).ok).toBe(true);

      expect(drive.findChildFolder(styleFolder, '2025')).toBeNull();
      expect(drive.parentOf(videoFolder)).toBe(year2026);
    });

    it('rename also renames the event folder in each style video folder', () => {
      const styleFolder = drive.createFolder('root', 'Popping videos');
      const style = ctx.db.styles.find(s => s.id === 'st_popping')[0];
      ctx.db.styles.update(style.id, style.version, { videoFolderId: styleFolder }, 'system', ctx.now());
      const videoFolder = drive.createFolder(drive.createFolder(styleFolder, '2026'), 'OCT MONTHLY CLASS');

      expect(update({ name: 'OCT MONTHLY CLASS 2026' }).ok).toBe(true);

      expect(drive.nameOf(videoFolder)).toBe('OCT MONTHLY CLASS 2026');
    });

    it('rename and a new start year with no year folder there yet: the video folder stays but is renamed', () => {
      const styleFolder = drive.createFolder('root', 'Popping videos');
      const style = ctx.db.styles.find(s => s.id === 'st_popping')[0];
      ctx.db.styles.update(style.id, style.version, { videoFolderId: styleFolder }, 'system', ctx.now());
      const year2026 = drive.createFolder(styleFolder, '2026');
      const videoFolder = drive.createFolder(year2026, 'OCT MONTHLY CLASS');

      expect(update({ name: 'DEC-OCT CLASS', startDate: '2025-12-15' }).ok).toBe(true);

      expect(drive.parentOf(videoFolder)).toBe(year2026);
      expect(drive.nameOf(videoFolder)).toBe('DEC-OCT CLASS');
    });

    it('rename and a new start year together: video folder moves to the new year and takes the new name', () => {
      const styleFolder = drive.createFolder('root', 'Popping videos');
      const style = ctx.db.styles.find(s => s.id === 'st_popping')[0];
      ctx.db.styles.update(style.id, style.version, { videoFolderId: styleFolder }, 'system', ctx.now());
      const videoFolder = drive.createFolder(drive.createFolder(styleFolder, '2026'), 'OCT MONTHLY CLASS');
      const year2025 = drive.createFolder(styleFolder, '2025');

      expect(update({ name: 'DEC-OCT CLASS', startDate: '2025-12-15' }).ok).toBe(true);

      expect(drive.parentOf(videoFolder)).toBe(year2025);
      expect(drive.nameOf(videoFolder)).toBe('DEC-OCT CLASS');
      expect(drive.nameOf(fresh().folderId)).toBe('DEC-OCT CLASS');
      expect(drive.parentOf(fresh().folderId)).toBe(drive.findChildFolder(master, '2025'));
    });

    it('date change blocked by classes outside range, lists them', () => {
      const res = update({ endDate: '2026-10-10' });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toBe('These classes are outside the new dates: 2026-10-13 Popping #2');
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
      expect(drive.parentOf(folder)).toBe(drive.findChildFolder(master, '2026'));
      expect(drive.parentOf(fresh().membersSpreadsheetId)).toBe(folder);
      for (const a of ctx.db.attendanceSheets.find(x => x.eventId === event.id)) {
        expect(drive.parentOf(a.spreadsheetId)).toBe(folder);
      }
    });
  });

  it('list flags a missing folder', () => {
    const kept = drive.createFolder(master, 'KEPT');
    seedEvent(ctx, { name: 'KEPT', folderId: kept });
    seedEvent(ctx, { name: 'LOST', folderId: 'fld_deleted' });

    const res = call('events.list', {});
    const byName = new Map((res.ok ? (res.data as any[]) : []).map(e => [e.name, e.folderMissing]));
    expect(byName.get('KEPT')).toBe(false);
    expect(byName.get('LOST')).toBe(true);
  });

  it('list skips Drive folder checks and returns folderMissing: false for non-admin callers', () => {
    seedEvent(ctx, { name: 'LOST ACTIVE', folderId: 'fld_deleted' });
    seedEvent(ctx, { name: 'OLD ARCHIVED', status: 'archived', folderId: 'fld_old_deleted' });

    const dancerToken = signToken(
      { sub: 'M-22001111', role: 'dancer', name: 'Dancer', exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1, perms: {} },
      secrets.tokenSecret,
      secrets.hmac
    );
    const infoSpy = vi.spyOn(ctx.drive, 'info');

    const res = handleRequest({ action: 'events.list', token: dancerToken, payload: { includeArchived: true } }, ctx, secrets);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const list = res.data as any[];
      expect(list.length).toBe(2);
      expect(list.every(e => e.folderMissing === false)).toBe(true);
    }
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('list projects only safe EventSummary fields for non-admins and restricts walk-in W- tokens', () => {
    const activeEv = seedEvent(ctx, {
      name: 'SAFE PROJECTION EVENT',
      folderId: 'fld_deleted',
      videoFolderId: 'fld_vid_1',
      sourceSheetId: 'ss_source_1',
      formUrl: 'https://docs.google.com/forms/d/f1/edit',
      formId: 'f1',
      sourceLastRowHash: 'hash_secret',
      lastSyncError: 'sync err',
      styleIds: ['st_popping'],
      styleInstructors: { st_popping: ['ins_1'] }
    });
    const archivedEv = seedEvent(ctx, {
      name: 'SAFE ARCHIVED EVENT',
      status: 'archived',
      folderId: 'fld_old_deleted',
      sourceSheetId: 'ss_source_2',
      styleIds: ['st_hiphop']
    });

    const walkInSess = ctx.db.sessions.insert(
      { eventId: activeEv.id, styleId: 'st_popping', seq: 1, date: '2026-10-06', start: '20:00', end: '22:00',
        instructorId: '', venue: 'Studio A', status: 'scheduled', note: '' },
      'admin',
      ctx.now()
    );
    const inactiveSess = ctx.db.sessions.insert(
      { eventId: archivedEv.id, styleId: 'st_hiphop', seq: 1, date: '2026-09-06', start: '20:00', end: '22:00',
        instructorId: '', venue: 'Studio B', status: 'scheduled', note: '' },
      'admin',
      ctx.now()
    );
    ctx.db.sessions.deactivate(inactiveSess.id, inactiveSess.version, 'admin', ctx.now());

    const dancerToken = signToken(
      { sub: 'M-22001111', role: 'dancer', name: 'Dancer', exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1, perms: {} },
      secrets.tokenSecret,
      secrets.hmac
    );

    const res = handleRequest({ action: 'events.list', token: dancerToken, payload: { includeArchived: true } }, ctx, secrets);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const list = res.data as any[];
      expect(list.length).toBe(2);
      for (const item of list) {
        expect(Object.keys(item).sort()).toEqual([
          'endDate',
          'folderMissing',
          'id',
          'name',
          'startDate',
          'status',
          'styleIds',
          'type'
        ]);
        expect(item.folderMissing).toBe(false);
        expect(item.sourceSheetId).toBeUndefined();
        expect(item.membersSpreadsheetId).toBeUndefined();
        expect(item.folderId).toBeUndefined();
        expect(item.videoFolderId).toBeUndefined();
        expect(item.formUrl).toBeUndefined();
        expect(item.formId).toBeUndefined();
        expect(item.sourceLastRowHash).toBeUndefined();
        expect(item.lastSyncError).toBeUndefined();
        expect(item.styleInstructors).toBeUndefined();
      }
    }

    // Admin still receives full EventListItem fields
    const adminRes = call('events.list', { includeArchived: true });
    expect(adminRes.ok).toBe(true);
    if (adminRes.ok) {
      const adminActive = (adminRes.data as any[]).find(e => e.id === activeEv.id);
      expect(adminActive.sourceSheetId).toBe('ss_source_1');
      expect(adminActive.membersSpreadsheetId).toBeTruthy();
      expect(adminActive.folderId).toBe('fld_deleted');
      expect(adminActive.videoFolderId).toBe('fld_vid_1');
      expect(adminActive.formUrl).toBe('https://docs.google.com/forms/d/f1/edit');
      expect(adminActive.styleInstructors).toEqual({ st_popping: ['ins_1'] });
      expect(adminActive.folderMissing).toBe(true);
    }

    // Walk-in W- token only receives its own active session's event with safe fields
    const walkInToken = signToken(
      { sub: `W-${walkInSess.id}-alex`, role: 'dancer', name: 'Alex (Walk-In)', exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1, perms: {} },
      secrets.tokenSecret,
      secrets.hmac
    );
    const walkInRes = handleRequest({ action: 'events.list', token: walkInToken, payload: { includeArchived: true } }, ctx, secrets);
    expect(walkInRes.ok).toBe(true);
    if (walkInRes.ok) {
      const list = walkInRes.data as any[];
      expect(list.map(e => e.id)).toEqual([activeEv.id]);
      expect(Object.keys(list[0]).sort()).toEqual([
        'endDate',
        'folderMissing',
        'id',
        'name',
        'startDate',
        'status',
        'styleIds',
        'type'
      ]);
      expect(list[0].folderMissing).toBe(false);
      expect(list[0].sourceSheetId).toBeUndefined();
    }

    // Invalid or inactive walk-in token receives []
    for (const badSub of ['W-ses_missing-alex', `W-${inactiveSess.id}-alex`]) {
      const badToken = signToken(
        { sub: badSub, role: 'dancer', name: 'Bad Walk-In', exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1, perms: {} },
        secrets.tokenSecret,
        secrets.hmac
      );
      const badRes = handleRequest({ action: 'events.list', token: badToken, payload: { includeArchived: true } }, ctx, secrets);
      expect(badRes.ok).toBe(true);
      if (badRes.ok) expect(badRes.data).toEqual([]);
    }
  });

  it('rejects create when validateStyleClasses is true and a selected style has no classes', () => {
    const res = call('events.create', createPayload({
      styleIds: ['st_popping', 'st_hiphop'],
      sessions: [{ styleId: 'st_popping', seq: 1, date: '2026-10-06', start: '20:00', end: '22:00' }],
      validateStyleClasses: true
    }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain('Each selected dance style must have at least 1 class. Missing: Hip Hop');
    }
  });

  it('stores styleSlots on created event and in database', () => {
    const res = call('events.create', createPayload({
      styleSlots: { st_popping: 35, st_hiphop: 20 }
    }));
    expect(res.ok).toBe(true);
    const event = res.ok ? (res.data as any).event : null;
    const dbEvent = ctx.db.events.get(event.id)!;
    expect(dbEvent.styleSlots).toEqual({ st_popping: 35, st_hiphop: 20 });
    expect(JSON.parse(dbEvent.styleSlotsJson!)).toEqual({ st_popping: 35, st_hiphop: 20 });
  });
  it('events.autoSync polls form status and bumps DATA_VERSION when formClosed changes', () => {
    const res = call('events.create', createPayload());
    expect(res.ok).toBe(true);
    const event = res.ok ? (res.data as any).event : null;

    const formId = 'auto_sync_form_test';
    const form = ctx.form.createForm(formId);
    ctx.form.setLinkedForm(event.sourceSheetId, `https://docs.google.com/forms/d/${formId}/edit`);

    // Ensure event has formId set and starts open
    ctx.db.events.update(event.id, event.version, {
      formId,
      formClosed: false,
      formClosedReason: 'none'
    }, 'test', ctx.now());

    ctx.props.set('DATA_VERSION', '1');

    // Admin closes form directly in Google Forms
    form.setAcceptingResponses(false);
    form.setCustomClosedFormMessage('Paused by admin');

    // Call events.autoSync
    const syncRes = call('events.autoSync', {});
    expect(syncRes.ok).toBe(true);
    if (syncRes.ok) {
      expect((syncRes.data as any).changed).toContain(event.id);
    }

    const updated = ctx.db.events.get(event.id)!;
    expect(updated.formClosed).toBe(true);
    expect(updated.formClosedReason).toBe('manual');
    expect(Number(ctx.props.get('DATA_VERSION'))).toBeGreaterThan(1);
  });

  it('events.autoSync with stabilize reads getDisplayValues only once on first stabilization check', () => {
    const res = call('events.create', createPayload());
    expect(res.ok).toBe(true);
    const event = res.ok ? (res.data as any).event : null;

    // Append a new response to the source sheet so it differs from event.sourceRowCount
    const sourceSs = ctx.drive.openSpreadsheet(event.sourceSheetId);
    const sourceSheet = sourceSs.sheet(event.sourceTab);
    expect(sourceSheet).toBeTruthy();
    sourceSheet!.appendRows([
      ['2026-10-02', 'Charlie', '22003333', '0123456789', 'c@t.com', 'Popping']
    ]);

    const getDisplayValuesSpy = vi.spyOn(sourceSheet!, 'getDisplayValues');

    const syncRes = call('events.autoSync', { stabilize: true });
    expect(syncRes.ok).toBe(true);
    if (syncRes.ok) {
      expect((syncRes.data as any).checked).toContain(event.id);
      expect((syncRes.data as any).changed).not.toContain(event.id);
    }

    // Should read getDisplayValues exactly once before caching sync:pendingHash
    expect(getDisplayValuesSpy).toHaveBeenCalledTimes(1);
    expect(ctx.cache.get(`sync:pendingHash:${event.id}`)).toBeTruthy();
  });

  describe('events.reopenFormSlots', () => {
    it('adds +N slots over max(currentCap, enrolledCount), clears notifiedFullStyles, restores choices, and reopens closed Google Form', () => {
      const formId = 'reopen_single_form';
      const form = ctx.form.createForm(formId);
      form.addQuestion({ id: 'q_name', title: 'Full Name', choices: [], helpText: '' });

      // 21 enrolled dancers against a limit of 20 (over-enrolled via admin override)
      const twentyOneRows = Array.from({ length: 21 }, (_, idx) => [
        '2026-10-01',
        `Dancer ${idx + 1}`,
        `2300${String(idx + 1).padStart(4, '0')}`,
        '0123456789',
        `d${idx + 1}@t.com`,
        'Popping'
      ]);
      const srcId = seedSourceSheet(ctx, [HEADERS, ...twentyOneRows]);
      ctx.form.setLinkedForm(srcId, `https://docs.google.com/forms/d/${formId}/edit`);

      const created = call('events.create', createPayload({
        name: 'FULL POPPING EVENT',
        sheetUrl: `https://docs.google.com/spreadsheets/d/${srcId}/edit`,
        formUrl: `https://docs.google.com/forms/d/${formId}/edit`,
        styleIds: ['st_popping'],
        styleSlots: { st_popping: 20 },
        sessions: []
      }));
      expect(created.ok).toBe(true);
      const ev = (created.data as any).event;

      expect(ctx.db.events.get(ev.id)!.formClosed).toBe(true);
      expect(ctx.db.events.get(ev.id)!.notifiedFullStyles).toContain('st_popping');
      expect(form.isAcceptingResponses()).toBe(false);

      const reopenRes = call('events.reopenFormSlots', {
        id: ev.id,
        addOnSlots: { st_popping: 5 }
      });

      expect(reopenRes.ok, JSON.stringify(reopenRes)).toBe(true);
      if (reopenRes.ok) {
        const data = reopenRes.data as any;
        expect(data.styleSlots.st_popping).toBe(26);
        expect(data.event.styleSlots.st_popping).toBe(26);
        expect(data.event.notifiedFullStyles).not.toContain('st_popping');
        expect(data.event.formClosed).toBe(false);
        expect(data.event.formClosedReason).toBe('none');
        expect(data.formResult.formClosed).toBe(false);
      }

      expect(form.isAcceptingResponses()).toBe(true);
      expect(form.getCustomClosedFormMessage()).toBe('');
    });

    it('reopens only the requested style in a multi-style full-house event and restores its choice while keeping other full styles closed', () => {
      const formId = 'reopen_multi_form';
      const form = ctx.form.createForm(formId);
      form.addQuestion({
        id: 'q_cls',
        title: 'Classes',
        choices: ['Popping', 'Hip Hop'],
        helpText: ''
      });

      const srcId = seedSourceSheet(ctx, [
        HEADERS,
        ['2026-10-01', 'Ali', '22001111', '0123456789', 'a@t.com', 'Popping'],
        ['2026-10-01', 'Bala', '22002222', '0123456789', 'b@t.com', 'Popping'],
        ['2026-10-01', 'Chong', '22003333', '0123456789', 'c@t.com', 'Popping'],
        ['2026-10-01', 'Devi', '22004444', '0123456789', 'd@t.com', 'Hip Hop'],
        ['2026-10-01', 'Evan', '22005555', '0123456789', 'e@t.com', 'Hip Hop']
      ]);
      ctx.form.setLinkedForm(srcId, `https://docs.google.com/forms/d/${formId}/edit`);

      const created = call('events.create', createPayload({
        name: 'FULL MULTI EVENT',
        sheetUrl: `https://docs.google.com/spreadsheets/d/${srcId}/edit`,
        formUrl: `https://docs.google.com/forms/d/${formId}/edit`,
        styleIds: ['st_popping', 'st_hiphop'],
        styleSlots: { st_popping: 2, st_hiphop: 2 },
        sessions: []
      }));
      expect(created.ok).toBe(true);
      const ev = (created.data as any).event;
      expect(form.isAcceptingResponses()).toBe(false);

      // Reopen only Popping (+5 -> max(2, 3) + 5 = 8); leave Hip Hop at 2 (2/2 full)
      const reopenRes = call('events.reopenFormSlots', {
        id: ev.id,
        addOnSlots: { st_popping: 5, st_hiphop: 0 }
      });

      expect(reopenRes.ok, JSON.stringify(reopenRes)).toBe(true);
      const refreshed = ctx.db.events.get(ev.id)!;
      expect(refreshed.styleSlots).toEqual({ st_popping: 8, st_hiphop: 2 });
      expect(refreshed.notifiedFullStyles).toEqual(['st_hiphop']);
      expect(refreshed.formClosed).toBe(false);
      expect(form.isAcceptingResponses()).toBe(true);
      expect(form.getStyleQuestion()!.choices).toEqual(['Popping']);
      expect(form.getStyleQuestion()!.helpText).toContain('Hip Hop');
    });

    it('reopens even a manually closed form and rejects invalid addOnSlots', () => {
      const formId = 'reopen_manual_form';
      const form = ctx.form.createForm(formId);
      form.addQuestion({ id: 'q_cls', title: 'Classes', choices: ['Popping'], helpText: '' });

      const created = call('events.create', createPayload({
        name: 'MANUAL CLOSED EVENT',
        formUrl: `https://docs.google.com/forms/d/${formId}/edit`,
        styleIds: ['st_popping'],
        styleSlots: { st_popping: 5 },
        sessions: []
      }));
      const ev = (created.data as any).event;
      form.setAcceptingResponses(false);
      form.setCustomClosedFormMessage('Paused manually');
      ctx.db.events.update(ev.id, ctx.db.events.get(ev.id)!.version, {
        formClosed: true,
        formClosedReason: 'manual'
      }, 'test', ctx.now());

      // Invalid payloads rejected
      const zeroRes = call('events.reopenFormSlots', { id: ev.id, addOnSlots: { st_popping: 0 } });
      expect(zeroRes.ok).toBe(false);
      const negRes = call('events.reopenFormSlots', { id: ev.id, addOnSlots: { st_popping: -2 } });
      expect(negRes.ok).toBe(false);
      const badStyleRes = call('events.reopenFormSlots', { id: ev.id, addOnSlots: { st_hiphop: 3 } });
      expect(badStyleRes.ok).toBe(false);

      // Valid reopen succeeds (1 enrolled, 5 cap -> max(5, 1) + 3 = 8)
      const okRes = call('events.reopenFormSlots', { id: ev.id, addOnSlots: { st_popping: 3 } });
      expect(okRes.ok, JSON.stringify(okRes)).toBe(true);
      expect(ctx.db.events.get(ev.id)!.styleSlots?.st_popping).toBe(8);
      expect(ctx.db.events.get(ev.id)!.formClosed).toBe(false);
      expect(form.isAcceptingResponses()).toBe(true);
    });
  });
});
