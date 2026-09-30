import { EventItem, Member } from '@umdsc/shared';
import { Ctx, SheetPort } from '../ports';
import { MEMBERS_COLUMNS } from '../db/schema';
import { matchHeaders, Field } from '../logic/headerMatch';
import { buildMembers } from '../logic/buildMembers';
import { hashRow } from '../logic/events';
import { openSourceTab, timestampColumn, countUnknownClasses } from './eventSource';
import { ensureEventFolder, ensureMembersSheet, ensureEventSheets, saveEventFields } from './eventSheets';

export interface ImportResult {
  changed: boolean;
  added: number;
  updated: number;
  flaggedRemoved: number;
  memberCount: number;
  unknownClasses: { token: string; count: number }[];
}

const REMOVED_FLAG = 'removed-from-form';
/** Member fields that Sync now refreshes from the form. */
const REFRESHED_FIELDS: (keyof Member)[] = [
  'fullName', 'nameKey', 'contact', 'email', 'gender', 'nationality', 'styleIds', 'styleNames'
];
/** Fixed (non-tick) attendance columns refreshed by Sync now. */
const ATTENDANCE_FIXED: [string, (m: Member) => string][] = [
  ['fullName', m => m.fullName],
  ['matric', m => m.matricRaw || m.matricKey],
  ['contact', m => m.contact],
  ['gender', m => m.gender],
  ['nationality', m => m.nationality]
];

function cellsOf(m: Member): string[] {
  return MEMBERS_COLUMNS.map(col => {
    const v = (m as any)[col];
    return Array.isArray(v) ? v.join(',') : String(v ?? '');
  });
}

function parseColumnMap(json: string, headers: string[]): Record<Field, number | null> {
  try {
    const parsed = JSON.parse(json || '{}');
    if (parsed && Object.keys(parsed).length > 0) return parsed;
  } catch {
    // fall through to automatic matching
  }
  return matchHeaders(headers).map;
}

function buildEventMembers(ctx: Ctx, event: EventItem, data: string[][]) {
  const headers = data[0] || [];
  const rows = data.slice(1);
  const styles = ctx.db.styles.find(s => event.styleIds.includes(s.id));
  const { members } = buildMembers({
    headers,
    rows,
    map: parseColumnMap(event.columnMapJson, headers),
    classIndex: event.classIndex,
    styles,
    timestampIndex: timestampColumn(headers)
  });

  // A single-style event whose form has no class question: everyone takes that style.
  if (event.classIndex < 0 && event.styleIds.length === 1) {
    const only = styles.find(s => s.id === event.styleIds[0]);
    for (const m of members) {
      m.styleIds = [event.styleIds[0]];
      m.styleNames = [only ? only.name : event.styleIds[0]];
      m.flags = m.flags.filter(f => f !== 'noStyle');
    }
  }
  return { members, unknownClasses: countUnknownClasses(rows, event.classIndex, styles) };
}

function refreshAttendanceFixedColumns(ctx: Ctx, event: EventItem, changed: Map<string, Member>): void {
  for (const rec of ctx.db.attendanceSheets.find(a => a.eventId === event.id && a.active)) {
    const sheet = ctx.drive.openSpreadsheet(rec.spreadsheetId).sheet('Attendance');
    if (!sheet) continue;
    const data = sheet.getDisplayValues();
    const keyRow = data[0] || [];
    const idCol = keyRow.indexOf('memberId');
    const width = ATTENDANCE_FIXED.reduce((w, [key]) => Math.max(w, keyRow.indexOf(key) + 1), idCol + 1);
    let touched = false;
    const block = data.slice(2).map(row => {
      const cells = row.slice(0, width);
      const m = changed.get(row[idCol]);
      if (m) {
        for (const [key, value] of ATTENDANCE_FIXED) {
          const col = keyRow.indexOf(key);
          if (col >= 0) cells[col] = value(m);
        }
        touched = true;
      }
      return cells;
    });
    if (touched) sheet.setValues(3, 1, block);
  }
}

/** Cheap check (one small read, no writes): true when the form's row count and last row are unchanged. */
export function sourceUnchanged(ctx: Ctx, event: EventItem): boolean {
  const { sheet } = openSourceTab(ctx, event.sourceSheetId, event.sourceTab);
  const { lastRow, values } = sheet.lastRowValues();
  return lastRow === event.sourceRowCount && hashRow(values) === event.sourceLastRowHash;
}

/**
 * Brings an event's Members sheet, attendance sheets and MemberIndex up to date
 * with its form. Call with the script lock held. Without `full`, returns early
 * with no writes when the form's row count and last row are unchanged.
 */
export function importEventMembers(ctx: Ctx, event: EventItem, opts: { full: boolean }): ImportResult {
  const { tab, sheet: source } = openSourceTab(ctx, event.sourceSheetId, event.sourceTab);
  const { lastRow, values } = source.lastRowValues();
  const hash = hashRow(values);
  if (!opts.full && lastRow === event.sourceRowCount && hash === event.sourceLastRowHash) {
    return { changed: false, added: 0, updated: 0, flaggedRemoved: 0, memberCount: event.memberCount, unknownClasses: [] };
  }

  const { members, unknownClasses } = buildEventMembers(ctx, event, source.getDisplayValues());
  const incoming = new Map(members.map(m => [m.memberId, m]));

  // Members sheet: rewrite changed rows in one write, append new members in one write
  const folderId = ensureEventFolder(ctx, event);
  const membersId = ensureMembersSheet(ctx, ctx.db.events.get(event.id) || event, folderId);
  const membersSheet = ctx.drive.openSpreadsheet(membersId).sheet('Members') as SheetPort;
  const existing = membersSheet.getDisplayValues();
  const header = existing[0] || [...MEMBERS_COLUMNS];
  const col = (name: string) => header.indexOf(name);
  const body = existing.slice(1).map(r => MEMBERS_COLUMNS.map((_, i) => r[i] ?? ''));

  let updated = 0;
  let flaggedRemoved = 0;
  let bodyChanged = false;
  const refreshed = new Map<string, Member>();
  const known = new Set<string>();

  body.forEach((row, i) => {
    const id = row[col('memberId')];
    if (!id) return;
    known.add(id);
    const flags = String(row[col('flags')] || '').split(',').filter(Boolean);
    const m = incoming.get(id);
    if (!m) {
      if (!flags.includes(REMOVED_FLAG)) {
        body[i][col('flags')] = [...flags, REMOVED_FLAG].join(',');
        flaggedRemoved++;
        bodyChanged = true;
      }
      return;
    }
    if (!opts.full) return;
    const next = cellsOf(m);
    const differs = REFRESHED_FIELDS.some(f => next[col(f)] !== row[col(f)]);
    if (differs || flags.includes(REMOVED_FLAG)) {
      body[i] = next;
      bodyChanged = true;
      if (differs) {
        updated++;
        refreshed.set(id, m);
      }
    }
  });

  if (bodyChanged) membersSheet.setValues(2, 1, body);
  const added = members.filter(m => !known.has(m.memberId));
  if (added.length > 0) membersSheet.appendRows(added.map(cellsOf));

  // Attendance sheets: append new members / classes; Sync now also refreshes names
  const latest = ctx.db.events.get(event.id) || event;
  ensureEventSheets(ctx, latest);
  if (refreshed.size > 0) refreshAttendanceFixedColumns(ctx, latest, refreshed);

  // MemberIndex: one write for every dancer in this form
  const index = new Map(ctx.db.memberIndex.find(m => m.active).map(m => [m.matricKey, m]));
  ctx.db.memberIndex.upsertMany(
    'matricKey',
    members.map(m => {
      const prev = index.get(m.matricKey);
      const eventIds = Array.from(new Set([...(prev ? prev.eventIds : []), event.id]));
      const lastEventEnd = prev && prev.lastEventEnd > latest.endDate ? prev.lastEventEnd : latest.endDate;
      if (!prev || !prev.eventIds.includes(event.id) || prev.fullName !== m.fullName) {
        ctx.cache.remove('mi:' + m.matricKey);
      }
      return { matricKey: m.matricKey, nameKey: m.nameKey, fullName: m.fullName, eventIds, lastEventEnd };
    }),
    'sync',
    ctx.now()
  );

  const memberCount = body.filter(r => r[col('memberId')]).length + added.length;
  saveEventFields(ctx, event.id, {
    sourceTab: tab,
    sourceRowCount: lastRow,
    sourceLastRowHash: hash,
    memberCount,
    lastSyncAt: ctx.now().toISOString(),
    lastSyncError: unknownClasses.length
      ? `Unknown class in form: ${unknownClasses.map(u => u.token).join(', ')}`
      : ''
  });

  return { changed: true, added: added.length, updated, flaggedRemoved, memberCount, unknownClasses };
}
