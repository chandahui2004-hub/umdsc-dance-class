import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { FakeDrive } from '../fakes/fakeDrive';
import { FakeProps } from '../fakes/fakeProps';
import { FakeLock } from '../fakes/fakeLock';
import { FakeSheet } from '../fakes/fakeSheets';
import { Hmac, signToken } from '../../src/security/tokens';
import { getEventRoutes } from '../../src/features/events';
import { getMemberRoutes } from '../../src/features/members';
import { seedSourceSheet } from '../fixtures/events';
import { openDb } from '../../src/db/db';
import { membersCacheKey } from '../../src/features/eventMembers';

const nodeHmac: Hmac = (key: string, message: string) => new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
const secrets = { tokenSecret: 'test_secret_key_123456789012345678901234567890', hmac: nodeHmac };
const HEADERS = ['Timestamp', 'Full Name', 'Matric Number', 'Contact Number', 'Email', 'Classes'];

describe('Feature: event auto-sync and sync now', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let drive: FakeDrive;
  let lock: FakeLock;
  let props: FakeProps;
  let token: string;

  const call = (action: string, payload?: any) => handleRequest({ action, token, payload }, ctx, secrets);
  const sourceTab = (id: string) => drive.openSpreadsheet(id).sheet('Form Responses 1') as FakeSheet;
  const totalWrites = () => {
    let n = 0;
    for (const ss of drive.spreadsheets.values()) for (const sh of ss.sheetsMap.values()) n += sh.writeCalls;
    return n;
  };
  const dataVersion = () => Number(props.get('DATA_VERSION') || 1);

  function createEvent(name: string): { id: string; sourceId: string } {
    const sourceId = seedSourceSheet(ctx, [HEADERS, ['2026-10-01', 'Ali', '22001111', '', '', 'Popping']]);
    const res = call('events.create', {
      name, type: 'monthly', startDate: '2026-10-01', endDate: '2026-10-31',
      sheetUrl: `https://docs.google.com/spreadsheets/d/${sourceId}/edit`,
      columnMap: { fullName: 1, matric: 2, contact: 3, email: 4, gender: null, nationality: null },
      classIndex: 5, styleIds: ['st_popping'], sessions: []
    });
    if (!res.ok) throw new Error(res.error.message);
    return { id: (res.data as any).event.id, sourceId };
  }

  beforeEach(() => {
    drive = new FakeDrive();
    lock = new FakeLock();
    props = new FakeProps();
    props.set('SYSTEM_SPREADSHEET_ID', 'test_system_ss');
    ctx = makeCtx({ drive, lock, props });
    registerRoutes(getEventRoutes());
    registerRoutes(getMemberRoutes());
    token = signToken(
      { sub: 'admin', role: 'admin', name: 'Admin', exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1,
        perms: { 'members.import': '*', 'members.view': '*' } },
      secrets.tokenSecret,
      secrets.hmac
    );
    ctx.db.styles.insert(
      { id: 'st_popping', name: 'Popping', aliases: ['popping'], colorKey: 'blue', defaultWeekday: null, defaultStart: '20:00',
        defaultEnd: '22:00', defaultInstructorId: '', defaultVenue: '', attendanceFolderId: '', videoFolderId: '' } as any,
      'system',
      ctx.now()
    );
    const master = drive.createFolder('root', 'Attendance');
    ctx.db.settings.insert({ key: 'defaultAttendanceFolderId', value: master }, 'system', ctx.now());
  });

  const names = (eventId: string) => {
    const res = call('members.list', { eventId });
    return res.ok ? (res.data as any[]).map(m => m.fullName) : [];
  };
  const memberIds = (eventId: string) => {
    const res = call('members.list', { eventId });
    return res.ok ? (res.data as any[]).map(m => m.memberId) : [];
  };
  const attendance = (eventId: string) => {
    const rec = ctx.db.attendanceSheets.find(a => a.eventId === eventId && a.active)[0];
    return drive.openSpreadsheet(rec.spreadsheetId).sheet('Attendance') as FakeSheet;
  };
  /** Adds a class column to the attendance sheet and ticks it for the given dancers. */
  const addTicks = (eventId: string, sessionId: string, ticked: string[]) => {
    const sheet = attendance(eventId);
    const data = sheet.getDisplayValues();
    const col = data[0].length + 1;
    sheet.setValues(1, col, [[sessionId]]);
    sheet.setValues(2, col, [['Class']]);
    data.slice(2).forEach((row, i) => {
      sheet.setValues(i + 3, col, [[ticked.includes(row[0]) ? 'TRUE' : '']]);
    });
  };
  const attendanceRow = (eventId: string, memberId: string) => {
    const data = attendance(eventId).getDisplayValues();
    const key = data[0];
    const row = data.find(r => r[0] === memberId);
    return row ? Object.fromEntries(key.map((k, i) => [k, row[i] ?? ''])) : null;
  };
  const indexEvents = (matricKey: string) =>
    ctx.db.memberIndex.find(m => m.matricKey === matricKey && m.active)[0]?.eventIds || [];

  describe('a correction made in the form response sheet', () => {
    it('is found by the automatic check even when it is not the last response', () => {
      const e = createEvent('OCT');
      sourceTab(e.sourceId).appendRows([['2026-10-02', 'Siti', '22002222', '', '', 'Popping']]);
      call('events.autoSync', {});
      ctx.cache.remove(`sync:check:${e.id}`);

      sourceTab(e.sourceId).setValues(2, 2, [['Ali Bin Abu']]);
      const res = call('events.autoSync', {});

      expect(res.ok && res.data).toMatchObject({ changed: [e.id] });
      expect(names(e.id)).toEqual(['Ali Bin Abu', 'Siti']);
    });

    it('moves a dancer whose matric was corrected, keeping her attendance ticks and sign-in', () => {
      const e = createEvent('OCT');
      addTicks(e.id, 'ses_1', ['M-22001111']);

      sourceTab(e.sourceId).setValues(2, 3, [['22001112']]);
      const res = call('events.sync', { id: e.id });

      expect(res.ok).toBe(true);
      expect(memberIds(e.id)).toEqual(['M-22001112']);
      expect(attendanceRow(e.id, 'M-22001111')).toBeNull();
      expect(attendanceRow(e.id, 'M-22001112')).toMatchObject({ matric: '22001112', fullName: 'Ali', ses_1: 'TRUE' });
      expect(indexEvents('22001111')).not.toContain(e.id);
      expect(indexEvents('22001112')).toContain(e.id);
      expect(ctx.db.events.get(e.id)!.memberCount).toBe(1);
    });

    it('merges a corrected response into the same dancer\'s other response, keeping both ticks', () => {
      const e = createEvent('OCT');
      sourceTab(e.sourceId).appendRows([['2026-10-03', 'Ali', '22001112', '', '', 'Popping']]);
      call('events.sync', { id: e.id });
      ctx.cache.remove(`sync:force:${e.id}`);
      addTicks(e.id, 'ses_1', ['M-22001111']);
      addTicks(e.id, 'ses_2', ['M-22001112']);

      sourceTab(e.sourceId).setValues(2, 3, [['22001112']]);
      call('events.sync', { id: e.id });

      expect(memberIds(e.id)).toEqual(['M-22001112']);
      expect(attendanceRow(e.id, 'M-22001111')).toBeNull();
      expect(attendanceRow(e.id, 'M-22001112')).toMatchObject({ ses_1: 'TRUE', ses_2: 'TRUE' });
      expect(indexEvents('22001111')).not.toContain(e.id);
    });

    it('follows a dancer who sent a new response with the right matric after hers was deleted', () => {
      const e = createEvent('OCT');
      addTicks(e.id, 'ses_1', ['M-22001111']);

      sourceTab(e.sourceId).setValues(2, 1, [['', '', '', '', '', '']]);
      sourceTab(e.sourceId).appendRows([['2026-10-05', 'Ali', '22001112', '', '', 'Popping']]);
      call('events.sync', { id: e.id });

      expect(memberIds(e.id)).toEqual(['M-22001112']);
      expect(attendanceRow(e.id, 'M-22001112')).toMatchObject({ ses_1: 'TRUE' });
    });

    it('a dancer-list read that began before the sync cannot bring the old matric back', () => {
      const e = createEvent('OCT');
      const before = ctx.db.events.get(e.id)!;
      const lateKey = membersCacheKey(ctx, before);
      const oldList = (call('members.list', { eventId: e.id }) as any).data;

      sourceTab(e.sourceId).setValues(2, 3, [['22001112']]);
      call('events.sync', { id: e.id });
      // the late read finishes now and caches what it read before the sync
      ctx.cache.put(lateKey, JSON.stringify(oldList), 600);
      ctx.cache.remove(`sync:force:${e.id}`);
      call('events.sync', { id: e.id });

      expect(memberIds(e.id)).toEqual(['M-22001112']);
      expect(attendanceRow(e.id, 'M-22001111')).toBeNull();
    });

    it('empties a leftover attendance row of someone not on the dancer list, unless it has ticks', () => {
      const e = createEvent('OCT');
      addTicks(e.id, 'ses_1', []);
      const sheet = attendance(e.id);
      sheet.appendRows([
        ['M-29999999', 'Ghost', '29999999', '', '', '', ''],
        ['M-28888888', 'Ticked Ghost', '28888888', '', '', '', '/']
      ]);

      call('events.sync', { id: e.id });

      expect(attendanceRow(e.id, 'M-29999999')).toBeNull();
      expect(attendanceRow(e.id, 'M-28888888')).toMatchObject({ ses_1: '/' });
      expect(attendanceRow(e.id, 'M-22001111')).not.toBeNull();
    });

    it('heals a dancer split by an earlier sync: old row marked removed, corrected row added with the same response', () => {
      const e = createEvent('OCT');
      addTicks(e.id, 'ses_1', ['M-22001111']);
      // What a Sync now before this fix left behind
      const ev = ctx.db.events.get(e.id)!;
      const members = drive.openSpreadsheet(ev.membersSpreadsheetId).sheet('Members') as FakeSheet;
      members.setValues(2, 13, [['removed-from-form']]);
      members.appendRows([['M-22001112', 'Ali', '22001112', '22001112', 'ali', '', '', '', '', 'st_popping', 'Popping', '2026-10-01', '']]);
      sourceTab(e.sourceId).setValues(2, 3, [['22001112']]);
      call('events.sync', { id: e.id });
      ctx.cache.remove(`sync:force:${e.id}`);

      call('events.sync', { id: e.id });

      expect(memberIds(e.id)).toEqual(['M-22001112']);
      expect(attendanceRow(e.id, 'M-22001111')).toBeNull();
      expect(attendanceRow(e.id, 'M-22001112')).toMatchObject({ ses_1: 'TRUE' });
    });

    it('does not move a response that now belongs to a different person (same timestamp, new name and matric)', () => {
      const e = createEvent('OCT');
      addTicks(e.id, 'ses_1', ['M-22001111']);

      sourceTab(e.sourceId).setValues(2, 2, [['Siti', '22005555']]);
      call('events.sync', { id: e.id });

      expect(memberIds(e.id)).toEqual(['M-22001111', 'M-22005555']);
      expect(attendanceRow(e.id, 'M-22001111')).toMatchObject({ ses_1: 'TRUE' });
      expect(attendanceRow(e.id, 'M-22005555')).toMatchObject({ ses_1: '' });
    });

    it('moves nobody when many matrics change at once (a moved form column), and says so', () => {
      const e = createEvent('OCT');
      const src = sourceTab(e.sourceId);
      src.appendRows([2, 3, 4, 5].map(n => [`2026-10-0${n}`, `D${n}`, `2200${n}${n}${n}${n}`, '', '', 'Popping']));
      call('events.sync', { id: e.id });
      ctx.cache.remove(`sync:force:${e.id}`);

      src.getDisplayValues().slice(1).forEach((row, i) => src.setValues(i + 2, 3, [[row[2] + '9']]));
      call('events.sync', { id: e.id });

      expect(indexEvents('22001111')).toContain(e.id);
      expect(ctx.db.events.get(e.id)!.lastSyncError).toContain('Many matric numbers changed at once');
    });

    it('never merges a removed dancer into another dancer who only shares the name', () => {
      const e = createEvent('OCT');
      sourceTab(e.sourceId).appendRows([['2026-10-02', 'Ali', '22003333', '', '', 'Popping']]);
      call('events.sync', { id: e.id });
      ctx.cache.remove(`sync:force:${e.id}`);
      addTicks(e.id, 'ses_1', ['M-22001111']);

      sourceTab(e.sourceId).setValues(2, 1, [['', '', '', '', '', '']]);
      call('events.sync', { id: e.id });

      expect(memberIds(e.id)).toEqual(['M-22001111', 'M-22003333']);
      expect(attendanceRow(e.id, 'M-22001111')).toMatchObject({ ses_1: 'TRUE' });
      expect(attendanceRow(e.id, 'M-22003333')).toMatchObject({ ses_1: '' });
    });
  });

  describe('editing a dancer on the website', () => {
    it('writes the name into the form response sheet and shows it at once', () => {
      const e = createEvent('OCT');
      expect(names(e.id)).toEqual(['Ali']);

      const res = call('members.edit', { eventId: e.id, memberId: 'M-22001111', fullName: 'Ali Bin Abu' });

      expect(res.ok).toBe(true);
      expect(sourceTab(e.sourceId).getDisplayValues()[1][1]).toBe('Ali Bin Abu');
      expect(names(e.id)).toEqual(['Ali Bin Abu']);
      expect(ctx.db.memberIndex.find(m => m.matricKey === '22001111' && m.active)[0].fullName).toBe('Ali Bin Abu');
      expect(attendanceRow(e.id, 'M-22001111')).toMatchObject({ fullName: 'Ali Bin Abu' });
    });

    it('writes a corrected matric into every response of the dancer and moves her', () => {
      const e = createEvent('OCT');
      sourceTab(e.sourceId).appendRows([['2026-10-04', 'Ali', '22001111', '', '', 'Popping']]);
      call('events.sync', { id: e.id });
      addTicks(e.id, 'ses_1', ['M-22001111']);

      const res = call('members.edit', { eventId: e.id, memberId: 'M-22001111', matricRaw: '22001112', contact: '0123456789' });

      expect(res.ok && res.data).toMatchObject({ memberId: 'M-22001112' });
      const rows = sourceTab(e.sourceId).getDisplayValues();
      expect(rows.slice(1).map(r => r[2])).toEqual(['22001112', '22001112']);
      expect(rows.slice(1).map(r => r[3])).toEqual(['0123456789', '0123456789']);
      expect(memberIds(e.id)).toEqual(['M-22001112']);
      expect(attendanceRow(e.id, 'M-22001112')).toMatchObject({ ses_1: 'TRUE' });
    });

    it('a matric changed and changed back leaves both sign-ins working', () => {
      const e = createEvent('OCT');
      call('members.edit', { eventId: e.id, memberId: 'M-22001111', matricRaw: '22001112' });
      const back = call('members.edit', { eventId: e.id, memberId: 'M-22001112', matricRaw: '22001111' });

      expect(back.ok).toBe(true);
      expect(memberIds(e.id)).toEqual(['M-22001111']);
      expect(indexEvents('22001111')).toContain(e.id);
      expect(ctx.db.memberIndex.find(m => m.matricKey === '22001112')[0].active).toBe(true);
    });

    it('refuses a matric that already belongs to another dancer in the event, writing nothing', () => {
      const e = createEvent('OCT');
      sourceTab(e.sourceId).appendRows([['2026-10-02', 'Siti', '22002222', '', '', 'Popping']]);
      call('events.sync', { id: e.id });

      const res = call('members.edit', { eventId: e.id, memberId: 'M-22001111', fullName: 'Ali Bin Abu', matricRaw: '22002222' });

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toContain('already belongs to Siti');
      expect(sourceTab(e.sourceId).getDisplayValues()[1].slice(1, 3)).toEqual(['Ali', '22001111']);
    });

    it('refuses a matric that signs in another dancer (other name) in another event', () => {
      const e = createEvent('OCT');
      ctx.db.memberIndex.insert(
        { matricKey: '22007777', nameKey: 'siti', fullName: 'Siti', eventIds: ['evt_nov'], lastEventEnd: '2026-11-30' } as any,
        'system',
        ctx.now()
      );

      const res = call('members.edit', { eventId: e.id, memberId: 'M-22001111', matricRaw: '22007777' });

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toContain('already belongs to Siti');
      expect(sourceTab(e.sourceId).getDisplayValues()[1][2]).toBe('22001111');
    });

    it('refuses an event past the 3-year retention, so its wiped dancers stay wiped', () => {
      const sourceId = seedSourceSheet(ctx, [HEADERS, ['2023-09-01', 'Ali', '22001111', '', '', 'Popping']]);
      const created = call('events.create', {
        name: 'SEP 2023', type: 'monthly', startDate: '2023-09-01', endDate: '2023-09-20',
        sheetUrl: `https://docs.google.com/spreadsheets/d/${sourceId}/edit`,
        columnMap: { fullName: 1, matric: 2, contact: 3, email: 4, gender: null, nationality: null },
        classIndex: 5, styleIds: ['st_popping'], sessions: []
      });
      const id = created.ok ? (created.data as any).event.id : '';

      const res = call('members.edit', { eventId: id, memberId: 'M-22001111', fullName: 'Ali Bin Abu' });

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toContain('ended more than 3 years ago');
    });

    it('refuses an empty name or a matric without digits or letters', () => {
      const e = createEvent('OCT');
      const blankName = call('members.edit', { eventId: e.id, memberId: 'M-22001111', fullName: '  ' });
      const badMatric = call('members.edit', { eventId: e.id, memberId: 'M-22001111', matricRaw: ' - ' });
      expect(blankName.ok).toBe(false);
      expect(badMatric.ok).toBe(false);
      expect(sourceTab(e.sourceId).getDisplayValues()[1][1]).toBe('Ali');
    });

    it('refuses a detail the form does not ask for', () => {
      const e = createEvent('OCT');
      const res = call('members.edit', { eventId: e.id, memberId: 'M-22001111', gender: 'Male' });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toContain('gender');
    });
  });

  it('quiet round: no lock, no writes', () => {
    const e = createEvent('OCT');
    lock.tryLockCalls = 0;
    const writes = totalWrites();
    const dv = dataVersion();

    const res = call('events.autoSync', {});

    expect(res.ok && res.data).toMatchObject({ checked: [e.id], changed: [], skipped: [], errors: [] });
    expect(lock.tryLockCalls).toBe(0);
    expect(totalWrites()).toBe(writes);
    expect(dataVersion()).toBe(dv);
  });

  it('second call within 10 minutes skips', () => {
    const e = createEvent('OCT');
    call('events.autoSync', {});
    const res = call('events.autoSync', {});
    expect(res.ok && res.data).toMatchObject({ checked: [], skipped: [e.id] });
  });

  it('change found: one DATA_VERSION bump', () => {
    const e = createEvent('OCT');
    sourceTab(e.sourceId).appendRows([['2026-10-02', 'Bala', '22002222', '', '', 'Popping']]);
    const dv = dataVersion();

    const res = call('events.autoSync', {});

    expect(res.ok && res.data).toMatchObject({ changed: [e.id] });
    expect(dataVersion()).toBe(dv + 1);
    expect(ctx.db.events.get(e.id)!.memberCount).toBe(2);
  });

  it('archived events are not checked', () => {
    const e = createEvent('OCT');
    const ev = ctx.db.events.get(e.id)!;
    call('events.archive', { id: e.id, version: ev.version });

    const res = call('events.autoSync', {});
    expect(res.ok && res.data).toMatchObject({ checked: [], changed: [], skipped: [] });
  });

  it('one broken form link does not stop others', () => {
    const e1 = createEvent('OCT');
    const e2 = createEvent('TRIAL');
    (drive as any).items.delete(e1.sourceId);
    sourceTab(e2.sourceId).appendRows([['2026-10-02', 'Bala', '22002222', '', '', 'Popping']]);

    const res = call('events.autoSync', {});

    expect(res.ok).toBe(true);
    const data = res.ok ? (res.data as any) : {};
    expect(data.errors.map((x: any) => x.eventId)).toEqual([e1.id]);
    expect(data.changed).toEqual([e2.id]);
    expect(ctx.db.events.get(e1.id)!.lastSyncError).toContain('umdancesportc@gmail.com');
  });

  it('sync now twice within a minute returns cached result', () => {
    const e = createEvent('OCT');
    const first = call('events.sync', { id: e.id });
    expect(first.ok).toBe(true);

    const second = call('events.sync', { id: e.id });
    expect(second.ok && (second.data as any).message).toBe('Synced less than a minute ago');
  });

  it('sync now refuses an archived event', () => {
    const e = createEvent('OCT');
    call('events.archive', { id: e.id, version: ctx.db.events.get(e.id)!.version });
    const res = call('events.sync', { id: e.id });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain('Archived events do not sync');
  });

  it('syncing does not bump the event version, so an open edit still saves (review #5)', () => {
    const e = createEvent('OCT');
    const version = ctx.db.events.get(e.id)!.version;
    sourceTab(e.sourceId).appendRows([['2026-10-02', 'Bala', '22002222', '', '', 'Popping']]);

    expect(call('events.sync', { id: e.id }).ok).toBe(true);

    expect(ctx.db.events.get(e.id)!.version).toBe(version);
    const edit = call('events.update', { id: e.id, version, name: 'OCT RENAMED' });
    expect(edit.ok).toBe(true);
  });

  it('auto-sync re-reads the event after waiting for the lock (review #4)', () => {
    const e = createEvent('OCT');
    sourceTab(e.sourceId).appendRows([['2026-10-02', 'Bala', '22002222', '', '', 'Popping']]);
    call('events.autoSync', {}); // loads the Events table, then cheap-checks
    ctx.cache.remove(`sync:check:${e.id}`);
    sourceTab(e.sourceId).appendRows([['2026-10-03', 'Chong', '22003333', '', '', 'Popping']]);

    // Another admin renames and archives-then-unarchives while this request waits for the lock
    lock.onAcquire = () => {
      const other = openDb(drive, 'test_system_ss');
      const row = other.events.get(e.id)!;
      other.events.update(e.id, row.version, { name: 'RENAMED BY OTHER' }, 'other', ctx.now());
    };
    const res = call('events.autoSync', {});

    expect(res.ok && (res.data as any).changed).toEqual([e.id]);
    const fresh = openDb(drive, 'test_system_ss').events.get(e.id)!;
    expect(fresh.name).toBe('RENAMED BY OTHER');
    expect(fresh.memberCount).toBe(3);
  });

  it('events past the 3-year retention never sync, so a retention wipe stays wiped (review #2)', () => {
    const sourceId = seedSourceSheet(ctx, [HEADERS, ['2023-09-01', 'Ali', '22001111', '', '', 'Popping']]);
    const created = call('events.create', {
      name: 'SEP 2023', type: 'monthly', startDate: '2023-09-01', endDate: '2023-09-20',
      sheetUrl: `https://docs.google.com/spreadsheets/d/${sourceId}/edit`,
      columnMap: { fullName: 1, matric: 2, contact: 3, email: 4, gender: null, nationality: null },
      classIndex: 5, styleIds: ['st_popping'], sessions: []
    });
    const id = created.ok ? (created.data as any).event.id : '';
    sourceTab(sourceId).appendRows([['2023-09-02', 'Bala', '22002222', '', '', 'Popping']]);

    const auto = call('events.autoSync', {});
    expect(auto.ok && (auto.data as any).checked).not.toContain(id);
    expect(auto.ok && (auto.data as any).changed).not.toContain(id);

    const now = call('events.sync', { id });
    expect(now.ok).toBe(false);
    if (!now.ok) expect(now.error.message).toContain('ended more than 3 years ago');
  });

  it('busy lock skips and clears the throttle key', () => {
    const e = createEvent('OCT');
    sourceTab(e.sourceId).appendRows([['2026-10-02', 'Bala', '22002222', '', '', 'Popping']]);
    lock.willSucceed = false;

    const res = call('events.autoSync', {});

    expect(res.ok && res.data).toMatchObject({ skipped: [e.id], changed: [] });
    expect(ctx.cache.get(`sync:check:${e.id}`)).toBeNull();
  });

  describe('registration confirmation email', () => {
    it('automatically sends confirmation email to newly detected members in added', () => {
      ctx.mail.sent = [];
      const sourceId = seedSourceSheet(ctx, [
        HEADERS,
        ['2026-10-01', 'Alice Tan', '22001111', '0123456789', 'alice@example.com', 'Popping']
      ]);

      const created = call('events.create', {
        name: 'OCT INTENSIVE',
        type: 'monthly',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        sheetUrl: `https://docs.google.com/spreadsheets/d/${sourceId}/edit`,
        columnMap: { fullName: 1, matric: 2, contact: 3, email: 4, gender: null, nationality: null },
        classIndex: 5,
        styleIds: ['st_popping'],
        sessions: []
      });
      expect(created.ok).toBe(true);
      const eventId = (created.data as any).event.id;

      // 1 email should have been sent to Alice
      expect(ctx.mail.sent.length).toBe(1);
      const email = ctx.mail.sent[0];
      expect(email.to).toBe('alice@example.com');
      expect(email.subject).toBe('[UMDSC] Registration Confirmed - OCT INTENSIVE');
      expect(email.body).toContain('Hi Alice Tan,');
      expect(email.body).toContain('Welcome to UMDSC! Your registration for OCT INTENSIVE has been confirmed.');
      expect(email.body).toContain('Enrolled Style(s): Popping');
      expect(email.body).toContain('Matric Number: 22001111');
      expect(email.body).toContain('https://umdsc-dance-class.umdancesportc.workers.dev');
      expect(email.htmlBody).toContain('Alice Tan');
      expect(email.htmlBody).toContain('OCT INTENSIVE');

      // Append new member Bob, and sync
      sourceTab(sourceId).appendRows([
        ['2026-10-02', 'Bob Lee', '22002222', '0123456788', 'bob@example.com', 'Popping']
      ]);
      const syncRes = call('events.sync', { id: eventId });
      expect(syncRes.ok).toBe(true);

      // Now 2 total emails sent (1 new email for Bob)
      expect(ctx.mail.sent.length).toBe(2);
      const email2 = ctx.mail.sent[1];
      expect(email2.to).toBe('bob@example.com');
      expect(email2.subject).toBe('[UMDSC] Registration Confirmed - OCT INTENSIVE');
      expect(email2.body).toContain('Hi Bob Lee,');
      expect(email2.body).toContain('Matric Number: 22002222');

      // Syncing again without new members does not send any more emails
      const syncAgain = call('events.sync', { id: eventId });
      expect(syncAgain.ok).toBe(true);
      expect(ctx.mail.sent.length).toBe(2);
    });

    it('skips dancers without valid email addresses', () => {
      ctx.mail.sent = [];
      const sourceId = seedSourceSheet(ctx, [
        HEADERS,
        ['2026-10-01', 'No Email Dancer', '22003333', '', '', 'Popping'],
        ['2026-10-01', 'Bad Email Dancer', '22004444', '', 'notanemail', 'Popping']
      ]);

      const created = call('events.create', {
        name: 'OCT WORKSHOP',
        type: 'monthly',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        sheetUrl: `https://docs.google.com/spreadsheets/d/${sourceId}/edit`,
        columnMap: { fullName: 1, matric: 2, contact: 3, email: 4, gender: null, nationality: null },
        classIndex: 5,
        styleIds: ['st_popping'],
        sessions: []
      });
      expect(created.ok).toBe(true);
      expect(ctx.mail.sent.length).toBe(0);
    });

    it('sends confirmation email and does not flag duplicate when an existing member adds a new class via a second submission', () => {
      ctx.mail.sent = [];
      const sourceId = seedSourceSheet(ctx, [
        HEADERS,
        ['2026-10-01', 'Chan Da Hui', '23005147/1', '0128178863', 'chandahui2004@gmail.com', 'Popping']
      ]);

      ctx.db.styles.insert(
        { id: 'st_hiphop', name: 'Hip Hop', aliases: ['hip hop'], colorKey: 'green', defaultWeekday: null, defaultStart: '20:00',
          defaultEnd: '22:00', defaultInstructorId: '', defaultVenue: '', attendanceFolderId: '', videoFolderId: '' } as any,
        'system',
        ctx.now()
      );

      const created = call('events.create', {
        name: 'OCT SPECIAL',
        type: 'monthly',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        sheetUrl: `https://docs.google.com/spreadsheets/d/${sourceId}/edit`,
        columnMap: { fullName: 1, matric: 2, contact: 3, email: 4, gender: null, nationality: null },
        classIndex: 5,
        styleIds: ['st_popping', 'st_hiphop'],
        sessions: []
      });
      expect(created.ok).toBe(true);
      const eventId = (created.data as any).event.id;

      expect(ctx.mail.sent.length).toBe(1);
      ctx.mail.sent = [];

      // Add a second submission for Chan Da Hui adding Hip Hop
      sourceTab(sourceId).appendRows([
        ['2026-10-16 03:59:22', 'Chan Da Hui', '23005147/1', '0128178863', 'chandahui2004@gmail.com', 'Hip Hop']
      ]);

      const syncRes = call('events.sync', { id: eventId });
      expect(syncRes.ok).toBe(true);

      // Verify email sent with updated classes
      expect(ctx.mail.sent.length).toBe(1);
      const email = ctx.mail.sent[0];
      expect(email.to).toBe('chandahui2004@gmail.com');
      expect(email.body).toContain('Enrolled Style(s): Popping, Hip Hop');
      expect(email.body).toContain('Matric Number: 23005147/1');

      // Verify member is NOT flagged as duplicate
      const membersRes = call('members.list', { eventId });
      expect(membersRes.ok).toBe(true);
      const member = (membersRes.data as any[]).find(m => m.matricKey === '230051471' || m.matricRaw === '23005147/1');
      expect(member).toBeDefined();
      expect(member.flags || []).not.toContain('duplicate');
      expect(member.styleNames).toEqual(expect.arrayContaining(['Popping', 'Hip Hop']));
    });

    it('events.sync bumps DATA_VERSION and purges removed members', () => {
      const sourceId = seedSourceSheet(ctx, [
        HEADERS,
        ['2026-10-01', 'Dancer 1', '24001', '', '', 'Popping'],
        ['2026-10-01', 'Dancer 2', '24002', '', '', 'Popping']
      ]);
      const created = call('events.create', {
        name: 'FREESTYLE TEST',
        type: 'workshop',
        startDate: '2026-10-23',
        endDate: '2026-10-23',
        sheetUrl: `https://docs.google.com/spreadsheets/d/${sourceId}/edit`,
        columnMap: { fullName: 1, matric: 2, contact: 3, email: 4, gender: null, nationality: null },
        classIndex: 5,
        styleIds: ['st_popping'],
        sessions: []
      });
      const eventId = (created.data as any).event.id;
      const vBefore = dataVersion();

      // Now remove Dancer 2 from source sheet
      const tab = sourceTab(sourceId);
      tab.rows = [tab.rows[0], tab.rows[1]]; // only Dancer 1 left

      // Sync with purge
      const res = call('events.sync', { id: eventId, force: true, purgeRemoved: true });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect((res.data as any).purged).toBe(1);
        expect((res.data as any).memberCount).toBe(1);
      }

      // DATA_VERSION MUST be bumped
      expect(dataVersion()).toBeGreaterThan(vBefore);

      // Members list should only have 1 dancer
      const members = call('members.list', { eventId });
      expect(members.ok).toBe(true);
      if (members.ok) {
        expect((members.data as any[]).length).toBe(1);
        expect((members.data as any[])[0].fullName).toBe('Dancer 1');
      }

      // Event memberCount in db must be 1
      const ev = ctx.db.events.get(eventId)!;
      expect(ev.memberCount).toBe(1);
    });
  });
});
