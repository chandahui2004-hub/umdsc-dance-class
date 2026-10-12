import { EventItem, Member } from '@umdsc/shared';
import { Ctx, SheetPort } from '../ports';
import { MEMBERS_COLUMNS } from '../db/schema';
import { matchHeaders, Field } from '../logic/headerMatch';
import { buildMembers } from '../logic/buildMembers';
import { hashSheet } from '../logic/events';
import { bumpAttendanceVersion } from '../logic/attendanceVersion';
import { logAudit } from '../logic/audit';
import { openSourceTab, timestampColumn, countUnknownClasses } from './eventSource';
import { ensureEventFolder, ensureMembersSheet, ensureEventSheets, saveEventFields } from './eventSheets';

export interface ImportResult {
  changed: boolean;
  added: number;
  updated: number;
  flaggedRemoved: number;
  /** Dancers whose matric was corrected in the form and who were moved to it. */
  corrected: number;
  memberCount: number;
  unknownClasses: { token: string; count: number }[];
}

const REMOVED_FLAG = 'removed-from-form';
/** Member fields refreshed from the form on every sync that reads it. */
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

export function parseColumnMap(json: string, headers: string[]): Record<Field, number | null> {
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
  const { members, timestampsByMember } = buildMembers({
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
  return { members, timestampsByMember, unknownClasses: countUnknownClasses(rows, event.classIndex, styles) };
}

export function refreshAttendanceFixedColumns(ctx: Ctx, event: EventItem, changed: Map<string, Member>): void {
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

/** One read, no writes: true when nothing in the form changed (any response, not only the newest). */
export function sourceUnchanged(ctx: Ctx, event: EventItem): boolean {
  const { sheet } = openSourceTab(ctx, event.sourceSheetId, event.sourceTab);
  const data = sheet.getDisplayValues();
  return data.length === event.sourceRowCount && hashSheet(data) === event.sourceLastRowHash;
}

interface GoneRow {
  memberId: string;
  matricKey: string;
  nameKey: string;
  sourceTimestamp: string;
  /** Already marked as gone by an earlier sync: only an exact response match may claim it. */
  removedBefore: boolean;
}

/**
 * Members no longer in the form, paired with the member they became. The same response (timestamp)
 * now under another matric is a corrected matric; a timestamp that two listed dancers share proves
 * nothing, so it is not used. Otherwise a dancer who has just appeared with the same name is taken
 * as a re-sent response; a name alone never joins two dancers already listed.
 */
export function findCorrections(
  gone: GoneRow[],
  members: Member[],
  timestampsByMember: Record<string, string[]>,
  knownIds: Set<string>,
  listedTimestamps: string[]
): Map<string, Member> {
  const corrections = new Map<string, Member>();
  for (const g of gone) {
    let target: Member | undefined;
    if (g.sourceTimestamp && listedTimestamps.filter(t => t === g.sourceTimestamp).length === 1) {
      const sameResponse = members.filter(
        m => m.memberId !== g.memberId && (timestampsByMember[m.memberId] || []).includes(g.sourceTimestamp)
      );
      if (sameResponse.length === 1) target = sameResponse[0];
    }
    if (!target && !g.removedBefore && g.nameKey) {
      const sameName = members.filter(m => !knownIds.has(m.memberId) && m.nameKey === g.nameKey);
      if (sameName.length === 1) target = sameName[0];
    }
    if (target) corrections.set(g.memberId, target);
  }
  return corrections;
}

/**
 * Moves corrected dancers in the attendance sheets: the old row takes the new id and details, or,
 * when the dancer already has a row, its ticks are added to that row and the old row is emptied.
 */
function moveAttendanceRows(ctx: Ctx, event: EventItem, corrections: Map<string, Member>): void {
  for (const rec of ctx.db.attendanceSheets.find(a => a.eventId === event.id && a.active)) {
    const sheet = ctx.drive.openSpreadsheet(rec.spreadsheetId).sheet('Attendance');
    if (!sheet) continue;
    const data = sheet.getDisplayValues();
    const keyRow = data[0] || [];
    const idCol = keyRow.indexOf('memberId');
    if (idCol === -1) continue;
    const fixedCols = new Set([idCol, ...ATTENDANCE_FIXED.map(([key]) => keyRow.indexOf(key)).filter(c => c >= 0)]);
    const fixedWidth = Math.max(...fixedCols) + 1;
    const rowOf = new Map<string, number>();
    data.forEach((r, i) => {
      if (i >= 2 && r[idCol]) rowOf.set(r[idCol], i);
    });

    let touched = false;
    for (const [oldId, target] of corrections) {
      const from = rowOf.get(oldId);
      if (from === undefined) continue;
      const into = rowOf.get(target.memberId);
      if (into === undefined) {
        const cells = keyRow.slice(0, fixedWidth).map((_, c) => data[from][c] ?? '');
        cells[idCol] = target.memberId;
        for (const [key, value] of ATTENDANCE_FIXED) {
          const c = keyRow.indexOf(key);
          if (c >= 0) cells[c] = value(target);
        }
        sheet.setValues(from + 1, 1, [cells]);
        rowOf.set(target.memberId, from);
      } else {
        keyRow.forEach((_, c) => {
          if (!fixedCols.has(c) && data[from][c] && !data[into][c]) {
            sheet.setValues(into + 1, c + 1, [[data[from][c]]]);
            data[into][c] = data[from][c];
          }
        });
        sheet.setValues(from + 1, 1, [keyRow.map(() => '')]);
      }
      rowOf.delete(oldId);
      touched = true;
    }
    if (touched) bumpAttendanceVersion(ctx, event.id, rec.styleId);
  }
}

/** The old matric no longer belongs to this event, so signing in with it stops showing the event. */
function dropEventFromIndex(ctx: Ctx, event: EventItem, matricKey: string): void {
  const entry = ctx.db.memberIndex.find(m => m.matricKey === matricKey && m.active)[0];
  if (entry && entry.eventIds.includes(event.id)) {
    const eventIds = entry.eventIds.filter(id => id !== event.id);
    const eventStyles = { ...(entry.eventStyles || {}) };
    delete eventStyles[event.id];
    if (eventIds.length === 0) {
      ctx.db.memberIndex.deactivate(entry.id, entry.version, 'sync', ctx.now());
    } else {
      ctx.db.memberIndex.update(entry.id, entry.version, { eventIds, eventStyles }, 'sync', ctx.now());
    }
  }
  ctx.cache.remove('mi:' + matricKey);
}

/**
 * Brings an event's Members sheet, attendance sheets and MemberIndex up to date
 * with its form. Call with the script lock held. Without `full`, returns early
 * with no writes when the form's row count and last row are unchanged; `full`
 * (Sync now) always re-reads, which also catches edits to older responses.
 */
export function importEventMembers(ctx: Ctx, event: EventItem, opts: { full: boolean }): ImportResult {
  const { tab, sheet: source } = openSourceTab(ctx, event.sourceSheetId, event.sourceTab);
  const data = source.getDisplayValues();
  const lastRow = data.length;
  const hash = hashSheet(data);
  if (!opts.full && lastRow === event.sourceRowCount && hash === event.sourceLastRowHash) {
    return { changed: false, added: 0, updated: 0, flaggedRemoved: 0, corrected: 0, memberCount: event.memberCount, unknownClasses: [] };
  }

  const { members, timestampsByMember, unknownClasses } = buildEventMembers(ctx, event, data);
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
  const known = new Set(body.map(row => row[col('memberId')]).filter(Boolean));

  const gone: GoneRow[] = body
    .filter(row => row[col('memberId')] && !incoming.has(row[col('memberId')]))
    .map(row => ({
      memberId: row[col('memberId')],
      matricKey: row[col('matricKey')],
      nameKey: row[col('nameKey')],
      sourceTimestamp: row[col('sourceTimestamp')],
      removedBefore: String(row[col('flags')] || '').split(',').includes(REMOVED_FLAG)
    }));
  const listedTimestamps = body.filter(row => row[col('memberId')]).map(row => row[col('sourceTimestamp')]);
  const corrections = findCorrections(gone, members, timestampsByMember, known, listedTimestamps);
  const placed = new Set<string>();

  body.forEach((row, i) => {
    const id = row[col('memberId')];
    if (!id) return;
    const flags = String(row[col('flags')] || '').split(',').filter(Boolean);
    const m = incoming.get(id);
    if (!m) {
      const target = corrections.get(id);
      if (target) {
        // A corrected matric: this row becomes the dancer's row, or is emptied when she already has one
        if (!known.has(target.memberId) && !placed.has(target.memberId)) {
          body[i] = cellsOf(target);
          placed.add(target.memberId);
        } else {
          body[i] = MEMBERS_COLUMNS.map(() => '');
        }
        bodyChanged = true;
        return;
      }
      if (!flags.includes(REMOVED_FLAG)) {
        body[i][col('flags')] = [...flags, REMOVED_FLAG].join(',');
        flaggedRemoved++;
        bodyChanged = true;
      }
      return;
    }
    // The whole form was read, so refresh known members too (e.g. a second
    // submission adding a style); this writes only when something differs.
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
  const added = members.filter(m => !known.has(m.memberId) && !placed.has(m.memberId));
  if (added.length > 0) membersSheet.appendRows(added.map(cellsOf));

  if (bodyChanged || added.length > 0) {
    ctx.cache.remove(`evt:members:${event.id}:${membersId}`);
    ctx.cache.remove(`evt:members:${event.id}:${event.membersSpreadsheetId}`);
  }

  // Corrected matrics: move attendance rows (keeping ticks) and the sign-in link before new rows are added
  if (corrections.size > 0) {
    moveAttendanceRows(ctx, event, corrections);
    for (const g of gone) {
      const target = corrections.get(g.memberId);
      if (!target) continue;
      if (g.matricKey !== target.matricKey) dropEventFromIndex(ctx, event, g.matricKey);
      logAudit(ctx, 'sync', 'members.matricCorrected', target.memberId, `${g.memberId} → ${target.memberId} in ${event.name}`);
    }
  }

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
      const styleIds = [...m.styleIds];
      const prevStyles = prev?.eventStyles?.[event.id];
      if (
        !prev ||
        !prev.eventIds.includes(event.id) ||
        prev.fullName !== m.fullName ||
        !prevStyles ||
        prevStyles.join(',') !== styleIds.join(',')
      ) {
        ctx.cache.remove('mi:' + m.matricKey);
      }
      const eventStyles = { ...(prev?.eventStyles || {}), [event.id]: styleIds };
      return { matricKey: m.matricKey, nameKey: m.nameKey, fullName: m.fullName, eventIds, lastEventEnd, eventStyles };
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

  return { changed: true, added: added.length, updated, flaggedRemoved, corrected: corrections.size, memberCount, unknownClasses };
}
