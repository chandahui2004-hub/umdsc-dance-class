import { EventItem, Member } from '@umdsc/shared';
import { Ctx } from '../../src/ports';
import { MEMBERS_COLUMNS } from '../../src/db/schema';
import { eventNameKey } from '../../src/logic/events';

let counter = 0;

/**
 * Inserts an active event (default TEST EVENT, 2026-10-01..2026-10-31) and creates
 * its Members sheet holding the given members.
 */
export function seedEvent(
  ctx: Ctx,
  overrides: Partial<EventItem> & { members?: Partial<Member>[] } = {}
): EventItem {
  const { members = [], ...fields } = overrides;
  counter++;
  const name = fields.name || (counter === 1 ? 'TEST EVENT' : `TEST EVENT ${counter}`);

  const membersSs = ctx.drive.createSpreadsheet(`${name} Members`, 'root');
  const sheet = membersSs.addSheet('Members', [...MEMBERS_COLUMNS]);
  const rows = members.map(m => {
    const full: Member = {
      memberId: m.memberId || `M-${m.matricKey || ''}`,
      fullName: m.fullName || '',
      matricRaw: m.matricRaw || m.matricKey || '',
      matricKey: m.matricKey || '',
      nameKey: m.nameKey || (m.fullName || '').toLowerCase(),
      contact: m.contact || '',
      email: m.email || '',
      gender: m.gender || '',
      nationality: m.nationality || '',
      styleIds: m.styleIds || [],
      styleNames: m.styleNames || [],
      sourceTimestamp: m.sourceTimestamp || '',
      flags: m.flags || []
    };
    return MEMBERS_COLUMNS.map(col => {
      const v = (full as any)[col];
      return Array.isArray(v) ? v.join(',') : String(v ?? '');
    });
  });
  if (rows.length) sheet.appendRows(rows);

  return ctx.db.events.insert(
    {
      name,
      nameKey: eventNameKey(name),
      type: 'monthly',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      sourceSheetId: '',
      sourceTab: '',
      columnMapJson: '{}',
      classIndex: -1,
      styleIds: [],
      styleInstructors: {},
      folderId: '',
      videoFolderId: '',
      membersSpreadsheetId: membersSs.id,
      status: 'active',
      sourceRowCount: 0,
      sourceLastRowHash: '',
      lastSyncAt: '',
      lastSyncError: '',
      memberCount: rows.length,
      ...fields
    },
    'seed',
    ctx.now()
  );
}

/** Creates a fake form response sheet (tab "Form Responses 1"); first row = headers. */
export function seedSourceSheet(ctx: Ctx, rows: string[][]): string {
  const ss = ctx.drive.createSpreadsheet('Responses', 'root');
  ss.addSheet('Form Responses 1', rows[0] || []);
  if (rows.length > 1) ss.sheet('Form Responses 1')!.appendRows(rows.slice(1));
  return ss.id;
}
