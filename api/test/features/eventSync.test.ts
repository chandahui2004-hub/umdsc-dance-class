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
import { seedSourceSheet } from '../fixtures/events';
import { openDb } from '../../src/db/db';

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
});
