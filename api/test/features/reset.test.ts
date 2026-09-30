import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { FakeDrive } from '../fakes/fakeDrive';
import { FakeProps } from '../fakes/fakeProps';
import { Hmac, signToken } from '../../src/security/tokens';
import { getResetRoutes, schemaReady } from '../../src/features/reset';

const nodeHmac: Hmac = (key: string, message: string) => new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
const secrets = { tokenSecret: 'test_secret_key_123456789012345678901234567890', hmac: nodeHmac };
const COMMON = ['id', 'version', 'updatedBy', 'updatedAt', 'active'];

/** The live database as it was before events: month-based tabs with test rows. */
function buildOldDatabase(drive: FakeDrive): void {
  const ss = drive.openSpreadsheet('test_system_ss');
  const tab = (name: string, headers: string[], rows: string[][] = []) => {
    const sheet = ss.addSheet(name, [...headers, ...COMMON]);
    if (rows.length) sheet.appendRows(rows);
  };
  tab('Settings', ['key', 'value'], [['dbFolderId', 'fld_db', 'set_1', '1', 'x', '', 'TRUE']]);
  tab('ClassSessions', ['month', 'styleId', 'seq', 'date', 'start', 'end', 'instructorId', 'venue', 'status', 'note'],
    [['2026-09', 'st_a', '1', '2026-09-30', '20:00', '22:00', '', '', 'scheduled', '', 'ses_1', '1', 'x', '', 'TRUE']]);
  tab('MemberIndex', ['matricKey', 'nameKey', 'fullName', 'months', 'lastMonth'],
    [['22001111', 'ali', 'Ali', '2026-10', '2026-10', 'mi_1', '1', 'x', '', 'TRUE']]);
  tab('MemberMonths', ['month', 'sourceSheetId'], [['2026-10', 'src', 'mm_1', '1', 'x', '', 'TRUE']]);
  tab('AttendanceSheets', ['month', 'styleId', 'spreadsheetId'], [['2026-10', 'st_a', 'att', 'as_1', '1', 'x', '', 'TRUE']]);
  tab('Videos', ['styleId', 'month', 'sessionId', 'title'], [['st_a', '2026-10', 'ses_1', 'v', 'vid_1', '1', 'x', '', 'TRUE']]);
  tab('Music', ['styleId', 'month', 'sessionId', 'title'], [['st_a', '2026-10', 'ses_1', 'm', 'mus_1', '1', 'x', '', 'TRUE']]);
  tab('Sections', ['musicId', 'name'], [['mus_1', 'Intro', 'sec_1', '1', 'x', '', 'TRUE']]);
  tab('Admins', ['username'], [['admin', 'adm_1', '1', 'x', '', 'TRUE']]);
  tab('Roles', ['name'], [['Admin', 'rol_1', '1', 'x', '', 'TRUE'], ['Dancer', 'rol_2', '1', 'x', '', 'TRUE']]);
  tab('DanceStyles', ['name'], [['Popping', 'st_a', '1', 'x', '', 'TRUE']]);
  tab('Instructors', ['name'], [['Kim', 'ins_1', '1', 'x', '', 'TRUE']]);
}

describe('Feature: reset test data (features/reset)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let drive: FakeDrive;
  let token: string;

  const call = (action: string, payload?: any) => handleRequest({ action, token, payload }, ctx, secrets);
  const rows = (tab: string) => drive.openSpreadsheet('test_system_ss').sheet(tab)?.getDisplayValues() || null;

  beforeEach(() => {
    drive = new FakeDrive();
    buildOldDatabase(drive);
    const props = new FakeProps();
    props.set('SYSTEM_SPREADSHEET_ID', 'test_system_ss');
    ctx = makeCtx({ drive, props });
    registerRoutes(getResetRoutes());
    token = signToken(
      { sub: 'admin', role: 'admin', name: 'Admin', exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1, perms: { 'settings.edit': '*' } },
      secrets.tokenSecret,
      secrets.hmac
    );
  });

  it('status says needed on old schema', () => {
    expect(schemaReady(ctx)).toBe(false);
    expect(call('admin.resetStatus')).toMatchObject({ ok: true, data: { needed: true } });
  });

  it('wrong phrase is refused and nothing changes', () => {
    const res = call('admin.resetTestData', { confirm: 'delete test data' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain('Type DELETE TEST DATA to confirm');
    expect(rows('ClassSessions')!.length).toBe(2);
    expect(rows('MemberMonths')).not.toBeNull();
  });

  it('reset backs up, clears old rows, rewrites headers, keeps admins roles styles', () => {
    const res = call('admin.resetTestData', { confirm: 'DELETE TEST DATA' });

    expect(res.ok).toBe(true);
    const backupId = res.ok ? (res.data as any).backupSpreadsheetId : '';
    expect(drive.nameOf(backupId)).toBe('UMDSC_System backup 2026-09-28');
    expect(drive.parentOf(backupId)).toBe('fld_db');
    expect(drive.openSpreadsheet(backupId).sheet('ClassSessions')!.getDisplayValues().length).toBe(2);

    for (const tab of ['ClassSessions', 'MemberIndex', 'AttendanceSheets', 'Videos', 'Music', 'Sections']) {
      expect(rows(tab)!.length).toBe(1);
    }
    expect(rows('ClassSessions')![0]).toContain('eventId');
    expect(rows('ClassSessions')![0]).not.toContain('month');
    expect(rows('MemberIndex')![0]).toEqual(expect.arrayContaining(['eventIds', 'lastEventEnd']));
    expect(rows('MemberMonths')).toBeNull();
    expect(rows('Events')![0]).toContain('nameKey');
    expect(rows('Admins')!.length).toBe(2);
    expect(rows('Roles')!.length).toBe(3);
    expect(rows('DanceStyles')!.length).toBe(2);
    expect(rows('Instructors')!.length).toBe(2);
    expect(schemaReady(ctx)).toBe(true);
  });

  it('second reset is refused', () => {
    expect(call('admin.resetTestData', { confirm: 'DELETE TEST DATA' }).ok).toBe(true);
    const again = call('admin.resetTestData', { confirm: 'DELETE TEST DATA' });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.message).toContain('Test data has already been reset');
    expect(call('admin.resetStatus')).toMatchObject({ ok: true, data: { needed: false } });
  });
});
