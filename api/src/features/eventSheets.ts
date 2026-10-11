import { EventItem, RowMeta } from '@umdsc/shared';
import { Ctx } from '../ports';
import { AppError } from '../errors';
import { MEMBERS_COLUMNS } from '../db/schema';
import { buildLayout, planSync, sessionLabel } from '../logic/attendanceGrid';
import { readEventMembers } from './eventMembers';
import { isMemberEnrolledInStyle } from '../logic/styleMatcher';
import { todayKL } from '../logic/events';

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
    throw new AppError('VALIDATION', 'Set the attendance master folder on the Attendance page first');
  }
  return master;
}

/** The year an event's folders are filed under: the year it starts in. */
export function eventYear(ctx: Ctx, event: Pick<EventItem, 'startDate'>): string {
  return /^\d{4}/.test(event.startDate || '') ? event.startDate.slice(0, 4) : todayKL(ctx.now()).slice(0, 4);
}

/** The year folder (for example `2026`) under a master folder, created if missing. */
export function ensureYearFolder(ctx: Ctx, parentId: string, event: Pick<EventItem, 'startDate'>): string {
  const year = eventYear(ctx, event);
  return ctx.drive.findChildFolder(parentId, year) || ctx.drive.createFolder(parentId, year);
}

/**
 * A style's video folder for this event: `style folder › <year> › <event>`, else an
 * older one made straight under the style folder before folders were grouped by year.
 *
 * Only the website makes folders inside a class lead's style folder. It uploads with the
 * drive.file scope, which cannot see a folder the club Gmail made there, so it would
 * make a second year folder next to it. The server only finds and moves.
 */
export function findStyleEventFolder(
  ctx: Ctx,
  styleFolderId: string,
  event: EventItem
): { id: string; inYear: boolean } | null {
  const yearId = ctx.drive.findChildFolder(styleFolderId, eventYear(ctx, event));
  const inYear = yearId && ctx.drive.findChildFolder(yearId, event.name);
  if (inYear) return { id: inYear, inYear: true };
  const older = ctx.drive.findChildFolder(styleFolderId, event.name);
  return older ? { id: older, inYear: false } : null;
}

/** The event's folder: its saved folder if it still exists, else `master › <year> › <event name>`. */
export function ensureEventFolder(ctx: Ctx, event: EventItem): string {
  const master = attendanceMaster(ctx);
  if (event.folderId && ctx.drive.info(event.folderId).exists) {
    return event.folderId;
  }
  const yearId = ensureYearFolder(ctx, master, event);
  const folderId = ctx.drive.findChildFolder(yearId, event.name) || ctx.drive.createFolder(yearId, event.name);
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
 * under the new master's year folder: reuse a same-named folder already there, else
 * move the existing folder, else create one. Attendance folders also get their sheets
 * moved in. Saving the same link again files older event folders under their year.
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

  const yearId = ensureYearFolder(ctx, newMasterId, event);
  let target = ctx.drive.findChildFolder(yearId, event.name);
  if (!target) {
    // An event folder made straight under the master, before folders were grouped by year
    const older = ctx.drive.findChildFolder(newMasterId, event.name);
    if (older && older !== currentId) {
      ctx.drive.moveFolder(older, yearId);
      target = older;
    }
  }
  if (target && target !== currentId) {
    counts.reused++;
  } else if (target) {
    return; // already in place
  } else if (currentId && ctx.drive.info(currentId).exists) {
    ctx.drive.moveFolder(currentId, yearId);
    target = currentId;
    counts.moved++;
  } else {
    target = ctx.drive.createFolder(yearId, event.name);
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

/**
 * Files every event's video folder in each dance style's video folder under its year:
 * `style folder › <event>` moves to `style folder › <year> › <event>`, but only once the
 * website has made that year folder (see findStyleEventFolder); until then it is
 * counted as waiting. Folders the club Gmail cannot move are reported and left where
 * they are; running again retries them.
 */
export function moveStyleVideoFoldersIntoYears(
  ctx: Ctx
): { moved: number; waiting: number; failed: { styleName: string; eventName: string; message: string }[] } {
  const counts = { moved: 0, waiting: 0, failed: [] as { styleName: string; eventName: string; message: string }[] };
  const events = ctx.db.events.find(e => e.active);

  for (const style of ctx.db.styles.find(s => s.active && Boolean(s.videoFolderId))) {
    for (const event of events) {
      try {
        const old = ctx.drive.findChildFolder(style.videoFolderId, event.name);
        if (!old) continue;
        const yearId = ctx.drive.findChildFolder(style.videoFolderId, eventYear(ctx, event));
        if (!yearId) {
          counts.waiting++;
          continue;
        }
        if (ctx.drive.findChildFolder(yearId, event.name)) {
          throw new Error(`"${event.name}" is already in the ${eventYear(ctx, event)} folder; move the files across by hand`);
        }
        ctx.drive.moveFolder(old, yearId);
        counts.moved++;
      } catch (err) {
        counts.failed.push({
          styleName: style.name,
          eventName: event.name,
          message: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  return counts;
}

/**
 * After an event's start date moves to another year, moves its attendance folder and
 * each style's video folder into the new year's folder. `updated` already has the new
 * name, so the video folders are looked up by the old event. A video folder stays put
 * when the style folder has no folder for the new year yet: only the website makes those.
 */
export function refileEventYear(ctx: Ctx, old: EventItem, updated: EventItem): void {
  const master = ctx.db.settings.find(s => s.key === 'defaultAttendanceFolderId' && s.active)[0]?.value;
  if (master && updated.folderId && ctx.drive.info(updated.folderId).exists) {
    ctx.drive.moveFolder(updated.folderId, ensureYearFolder(ctx, master, updated));
  }
  for (const style of ctx.db.styles.find(s => s.active && Boolean(s.videoFolderId))) {
    try {
      const found = findStyleEventFolder(ctx, style.videoFolderId, old);
      const yearId = ctx.drive.findChildFolder(style.videoFolderId, eventYear(ctx, updated));
      if (found && yearId) ctx.drive.moveFolder(found.id, yearId);
    } catch {
      // A class lead's folder the club Gmail cannot move stays put; uploads still find it.
    }
  }
}

/** One attendance sheet per event style, in the event folder, with every class and member. */
export function ensureEventSheets(ctx: Ctx, event: EventItem): { styleId: string; spreadsheetId: string }[] {
  const folderId = ensureEventFolder(ctx, event);
  const current = ctx.db.events.get(event.id) || event;
  const members = readEventMembers(ctx, current);
  const allStyles = ctx.db.styles.find(s => s.active);
  const result: { styleId: string; spreadsheetId: string }[] = [];

  for (const styleId of current.styleIds) {
    const style = allStyles.find(
      s => s.id.toLowerCase() === styleId.toLowerCase() || s.name.toLowerCase() === styleId.toLowerCase()
    );
    const styleName = style ? style.name : styleId;
    const targetStyleIds = new Set([styleId, ...(style ? [style.id, style.name] : [])]);

    const sessions = ctx.db.sessions
      .find(s => s.eventId === current.id && targetStyleIds.has(s.styleId) && s.active)
      .sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq);
    const styleMembers = members.filter(m => isMemberEnrolledInStyle(m, styleId, allStyles));

    const rec = ctx.db.attendanceSheets.find(
      a => a.eventId === current.id && targetStyleIds.has(a.styleId) && a.active
    )[0];
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

    const effectiveStyleId = style ? style.id : styleId;
    if (rec) {
      ctx.db.attendanceSheets.update(rec.id, rec.version, { spreadsheetId: ss.id, styleId: effectiveStyleId }, 'system', ctx.now());
    } else {
      ctx.db.attendanceSheets.insert({ eventId: current.id, styleId: effectiveStyleId, spreadsheetId: ss.id }, 'system', ctx.now());
    }
    result.push({ styleId: effectiveStyleId, spreadsheetId: ss.id });
  }

  return result;
}
