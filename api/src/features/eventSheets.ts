import { EventItem, RowMeta } from '@umdsc/shared';
import { Ctx } from '../ports';
import { AppError } from '../errors';
import { MEMBERS_COLUMNS } from '../db/schema';
import { buildLayout, planSync, sessionLabel } from '../logic/attendanceGrid';
import { readEventMembers } from './eventMembers';

/**
 * Saves system bookkeeping on an event (sync status, counts, folder and sheet ids).
 * Re-reads the row first and keeps its version, so it never overwrites or conflicts
 * with an admin's edit of the event.
 */
export function saveEventFields(
  ctx: Ctx,
  eventId: string,
  patch: Partial<Omit<EventItem, keyof RowMeta>>,
  actor = 'system'
): EventItem {
  ctx.db.events.reload();
  const current = ctx.db.events.get(eventId);
  if (!current) {
    throw new AppError('NOT_FOUND', `Event not found: ${eventId}`);
  }
  return ctx.db.events.update(current.id, current.version, patch, actor, ctx.now(), { keepVersion: true });
}

function attendanceMaster(ctx: Ctx): string {
  const master = ctx.db.settings.find(s => s.key === 'defaultAttendanceFolderId' && s.active)[0]?.value;
  if (!master) {
    throw new AppError('VALIDATION', 'Set the attendance master folder on the Events page first');
  }
  return master;
}

/** The event's folder: its saved folder if it still exists, else the master's child named after the event. */
export function ensureEventFolder(ctx: Ctx, event: EventItem): string {
  const master = attendanceMaster(ctx);
  if (event.folderId && ctx.drive.info(event.folderId).exists) {
    return event.folderId;
  }
  const folderId = ctx.drive.findChildFolder(master, event.name) || ctx.drive.createFolder(master, event.name);
  saveEventFields(ctx, event.id, { folderId });
  return folderId;
}

export function ensureMembersSheet(ctx: Ctx, event: EventItem, folderId: string): string {
  if (event.membersSpreadsheetId && ctx.drive.info(event.membersSpreadsheetId).exists) {
    ctx.drive.moveToFolder(event.membersSpreadsheetId, folderId);
    const ss = ctx.drive.openSpreadsheet(event.membersSpreadsheetId);
    if (!ss.sheet('Members')) ss.addSheet('Members', [...MEMBERS_COLUMNS]);
    return event.membersSpreadsheetId;
  }
  const ss = ctx.drive.createSpreadsheet(`${event.name} Members`, folderId);
  const sheet = ss.addSheet('Members', [...MEMBERS_COLUMNS]);
  sheet.setPlainTextColumns([1, 3, 4, 6]);
  saveEventFields(ctx, event.id, { membersSpreadsheetId: ss.id });
  return ss.id;
}

/**
 * After a master folder link changes, puts every event's folder (active and archived)
 * under the new master: reuse a same-named folder already there, else move the
 * existing folder, else create one. Attendance folders also get their sheets moved in.
 */
export function moveEventFolders(
  ctx: Ctx,
  kind: 'attendance' | 'video',
  newMasterId: string
): { moved: number; created: number; reused: number; failed: { eventName: string; message: string }[] } {
  const counts = { moved: 0, created: 0, reused: 0, failed: [] as { eventName: string; message: string }[] };

  for (const event of ctx.db.events.find(e => e.active)) {
    try {
      moveOneEventFolder(ctx, event, kind, newMasterId, counts);
    } catch (err) {
      // One folder the club Gmail cannot move must not stop the others; saving
      // the same link again retries only what is still out of place.
      counts.failed.push({ eventName: event.name, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return counts;
}

function moveOneEventFolder(
  ctx: Ctx,
  event: EventItem,
  kind: 'attendance' | 'video',
  newMasterId: string,
  counts: { moved: number; created: number; reused: number }
): void {
  const currentId = kind === 'attendance' ? event.folderId : event.videoFolderId;
  if (kind === 'video' && !currentId) return;

  let target = ctx.drive.findChildFolder(newMasterId, event.name);
  if (target && target !== currentId) {
    counts.reused++;
  } else if (target) {
    return; // already in place
  } else if (currentId && ctx.drive.info(currentId).exists) {
    ctx.drive.moveFolder(currentId, newMasterId);
    target = currentId;
    counts.moved++;
  } else {
    target = ctx.drive.createFolder(newMasterId, event.name);
    counts.created++;
  }

  if (kind === 'video') {
    saveEventFields(ctx, event.id, { videoFolderId: target });
    return;
  }
  saveEventFields(ctx, event.id, { folderId: target });
  const files = [
    event.membersSpreadsheetId,
    ...ctx.db.attendanceSheets.find(a => a.eventId === event.id && a.active).map(a => a.spreadsheetId)
  ];
  for (const fileId of files) {
    if (fileId && ctx.drive.info(fileId).exists) ctx.drive.moveToFolder(fileId, target);
  }
}

/** One attendance sheet per event style, in the event folder, with every class and member. */
export function ensureEventSheets(ctx: Ctx, event: EventItem): { styleId: string; spreadsheetId: string }[] {
  const folderId = ensureEventFolder(ctx, event);
  const current = ctx.db.events.get(event.id) || event;
  const members = readEventMembers(ctx, current);
  const result: { styleId: string; spreadsheetId: string }[] = [];

  for (const styleId of current.styleIds) {
    const style = ctx.db.styles.find(s => s.id === styleId)[0];
    const styleName = style ? style.name : styleId;
    const sessions = ctx.db.sessions
      .find(s => s.eventId === current.id && s.styleId === styleId && s.active)
      .sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq);
    const styleMembers = members.filter(m => m.styleIds.includes(styleId));

    const rec = ctx.db.attendanceSheets.find(a => a.eventId === current.id && a.styleId === styleId && a.active)[0];
    if (rec && ctx.drive.info(rec.spreadsheetId).exists) {
      ctx.drive.moveToFolder(rec.spreadsheetId, folderId);
      const sheet = ctx.drive.openSpreadsheet(rec.spreadsheetId).sheet('Attendance');
      if (sheet) {
        const data = sheet.getDisplayValues();
        const keyRow = [...(data[0] || [])];
        const idCol = keyRow.indexOf('memberId');
        const existingIds = idCol === -1 ? [] : data.slice(2).map(r => r[idCol]).filter(Boolean);
        const { appendColumns, appendRows } = planSync(keyRow, existingIds, styleMembers, sessions);

        if (appendColumns.length > 0) {
          const startCol = keyRow.length + 1;
          const labels = appendColumns.map(id => {
            const s = sessions.find(x => x.id === id);
            return s ? sessionLabel(s) : id;
          });
          sheet.setValues(1, startCol, [appendColumns]);
          sheet.setValues(2, startCol, [labels]);
          keyRow.push(...appendColumns);
        }
        if (appendRows.length > 0) {
          sheet.appendRows(
            appendRows.map(m => {
              const cells = [m.memberId, m.fullName, m.matricRaw || m.matricKey, m.contact, m.gender, m.nationality];
              while (cells.length < keyRow.length) cells.push('');
              return cells;
            })
          );
        }
      }
      result.push({ styleId, spreadsheetId: rec.spreadsheetId });
      continue;
    }

    const ss = ctx.drive.createSpreadsheet(`${styleName} Attendance`, folderId);
    const sheet = ss.addSheet('Attendance', []);
    const { keyRow, labelRow, rows } = buildLayout(styleMembers, sessions);
    sheet.setValues(1, 1, [keyRow, labelRow, ...rows]);
    sheet.hideRow(1);
    sheet.protectRowWarningOnly(1);
    sheet.setPlainTextColumns([1, 3, 4]);

    if (rec) {
      ctx.db.attendanceSheets.update(rec.id, rec.version, { spreadsheetId: ss.id }, 'system', ctx.now());
    } else {
      ctx.db.attendanceSheets.insert({ eventId: current.id, styleId, spreadsheetId: ss.id }, 'system', ctx.now());
    }
    result.push({ styleId, spreadsheetId: ss.id });
  }

  return result;
}
