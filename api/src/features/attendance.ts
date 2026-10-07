import { Route } from '../router';
import { AppError } from '../errors';
import { Ctx } from '../ports';
import { AttendanceGrid, ClassSession } from '@umdsc/shared';
import { sessionLabel, locateCell } from '../logic/attendanceGrid';
import { onSessionChanged } from './sessions';
import { getEvent, readEventMembers } from './eventMembers';
import { ensureEventSheets } from './eventSheets';
import { isMemberEnrolledInStyle } from '../logic/styleMatcher';
import { safeCachePut } from '../logic/cache';

const versionKey = (eventId: string, styleId: string) => `attv:${eventId}:${styleId}`;
const gridKey = (eventId: string, styleId: string, ver: number) => `att:${eventId}:${styleId}:${ver}`;

export function bumpAttendanceVersion(ctx: Ctx, eventId: string, styleId: string): number {
  const next = Number(ctx.cache.get(versionKey(eventId, styleId)) || 1) + 1;
  ctx.cache.put(versionKey(eventId, styleId), String(next), 86400 * 30);
  return next;
}

export function attendanceRelabel(ctx: Ctx, session: ClassSession): void {
  const rec = ctx.db.attendanceSheets.find(
    s => s.eventId === session.eventId && s.styleId === session.styleId && s.active
  )[0];
  if (!rec) return;

  try {
    const sheet = ctx.drive.openSpreadsheet(rec.spreadsheetId).sheet('Attendance');
    if (!sheet) return;
    const data = sheet.getDisplayValues();
    if (data.length < 2) return;
    const colIdx = data[0].indexOf(session.id);
    if (colIdx !== -1) {
      sheet.setValues(2, colIdx + 1, [[sessionLabel(session)]]);
      bumpAttendanceVersion(ctx, session.eventId, session.styleId);
    }
  } catch (err) {
    console.error('Failed to relabel attendance session:', err);
  }
}

// Automatically subscribe to session updates
onSessionChanged((ctx, s) => {
  attendanceRelabel(ctx, s);
});

export function getAttendanceRoutes(): Record<string, Route> {
  return {
    'attendance.get': {
      perm: 'attendance.view.all',
      write: false,
      styleOf: (p: any) => p?.styleId,
      handler: (ctx, auth, payload: any) => {
        const { eventId, styleId, ifVersion } = payload || {};
        if (!eventId || !styleId) {
          throw new AppError('VALIDATION', 'eventId and styleId are required');
        }

        const curVer = Number(ctx.cache.get(versionKey(eventId, styleId)) || 1);
        if (ifVersion !== undefined && Number(ifVersion) === curVer) {
          return { notModified: true, version: curVer };
        }

        const cached = ctx.cache.get(gridKey(eventId, styleId, curVer));
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed && Array.isArray(parsed.members) && parsed.members.length > 0) {
              return parsed;
            }
          } catch {
            // ignore cache parse failure
          }
        }

        const allStyles = ctx.db.styles.find(s => s.active);
        const matchedStyle = allStyles.find(
          s => s.id.toLowerCase() === styleId.toLowerCase() || s.name.toLowerCase() === styleId.toLowerCase()
        );
        const targetStyleIds = new Set([
          styleId,
          ...(matchedStyle ? [matchedStyle.id, matchedStyle.name] : [])
        ]);

        const sessions = ctx.db.sessions
          .find(s => s.eventId === eventId && targetStyleIds.has(s.styleId) && s.active)
          .sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq);

        const grid: AttendanceGrid = { eventId, styleId, version: curVer, sessions, members: [], present: {} };

        let rec = ctx.db.attendanceSheets.find(
          s => s.eventId === eventId && targetStyleIds.has(s.styleId) && s.active
        )[0];

        if (!rec) {
          try {
            ensureEventSheets(ctx, getEvent(ctx, eventId));
            rec = ctx.db.attendanceSheets.find(
              s => s.eventId === eventId && targetStyleIds.has(s.styleId) && s.active
            )[0];
          } catch {
            // Master folder not set or Drive mock, continue to member fallback
          }
        }

        if (rec) {
          grid.spreadsheetId = rec.spreadsheetId;
          const sheet = ctx.drive.openSpreadsheet(rec.spreadsheetId).sheet('Attendance');
          const data = sheet ? sheet.getDisplayValues() : [];
          if (data.length >= 2) {
            const keyRow = data[0];
            const memberIdColIdx = keyRow.indexOf('memberId');
            const fullNameColIdx = keyRow.indexOf('fullName');
            const matricColIdx = keyRow.indexOf('matric');
            const sessionCols = sessions
              .map(s => ({ id: s.id, colIdx: keyRow.indexOf(s.id) }))
              .filter(x => x.colIdx !== -1);

            for (let r = 2; r < data.length; r++) {
              const row = data[r];
              const mId = row[memberIdColIdx];
              if (!mId) continue;
              grid.members.push({ memberId: mId, fullName: row[fullNameColIdx] || '', matric: row[matricColIdx] || '' });
              grid.present[mId] = sessionCols.filter(sc => row[sc.colIdx] === '/').map(sc => sc.id);
            }
          }
        }

        // Fallback: If sheet has no members or couldn't be loaded, read enrolled event members
        if (grid.members.length === 0) {
          try {
            const ev = getEvent(ctx, eventId);
            const enrolled = readEventMembers(ctx, ev).filter(m =>
              isMemberEnrolledInStyle(m, styleId, allStyles)
            );
            for (const m of enrolled) {
              grid.members.push({
                memberId: m.memberId,
                fullName: m.fullName,
                matric: m.matricRaw || m.matricKey
              });
              if (!grid.present[m.memberId]) {
                grid.present[m.memberId] = [];
              }
            }
          } catch {
            // Ignore fallback errors
          }
        }

        if (grid.members.length > 0) {
          safeCachePut(ctx.cache, gridKey(eventId, styleId, curVer), JSON.stringify(grid), 60);
        }
        return grid;
      }
    },

    'attendance.mark': {
      perm: 'attendance.edit',
      write: true,
      styleOf: (p: any) => p?.styleId,
      handler: (ctx, auth, payload: any) => {
        const { eventId, styleId, marks } = payload || {};
        if (!eventId || !styleId || !Array.isArray(marks)) {
          throw new AppError('VALIDATION', 'eventId, styleId, and marks array are required');
        }

        const event = getEvent(ctx, eventId);
        const allStyles = ctx.db.styles.find(s => s.active);
        const matchedStyle = allStyles.find(
          s => s.id.toLowerCase() === styleId.toLowerCase() || s.name.toLowerCase() === styleId.toLowerCase()
        );
        const targetStyleIds = new Set([
          styleId,
          ...(matchedStyle ? [matchedStyle.id, matchedStyle.name] : [])
        ]);

        const validMemberIds = new Set(
          readEventMembers(ctx, event)
            .filter(m => isMemberEnrolledInStyle(m, styleId, allStyles))
            .map(m => m.memberId)
        );
        for (const m of marks) {
          if (!validMemberIds.has(m.memberId)) {
            throw new AppError('VALIDATION', `Member ${m.memberId} is not registered in style ${styleId}`);
          }
        }

        let rec = ctx.db.attendanceSheets.find(
          s => s.eventId === eventId && targetStyleIds.has(s.styleId) && s.active
        )[0];
        if (!rec) {
          try {
            ensureEventSheets(ctx, event);
            rec = ctx.db.attendanceSheets.find(
              s => s.eventId === eventId && targetStyleIds.has(s.styleId) && s.active
            )[0];
          } catch {
            // ignore
          }
        }
        if (!rec) {
          throw new AppError('NOT_FOUND', `Attendance sheet for ${event.name} ${styleId} not found`);
        }

        const sheet = ctx.drive.openSpreadsheet(rec.spreadsheetId).sheet('Attendance');
        if (!sheet) {
          throw new AppError('NOT_FOUND', 'Attendance tab not found');
        }

        const data = sheet.getDisplayValues();
        const keyRow = [...data[0]];
        const memberIdColIdx = keyRow.indexOf('memberId');
        const applied: string[] = [];

        for (const mark of marks) {
          if (mark.opId && ctx.cache.get('op:' + mark.opId)) {
            // Already applied by an earlier send whose reply was lost: confirm it again so the
            // page stops re-sending it, without writing the cell twice
            applied.push(mark.opId);
            continue;
          }

          let cell = locateCell(keyRow, data.map((r: string[]) => r[memberIdColIdx]), mark.memberId, mark.sessionId);

          if (!cell) {
            if (keyRow.indexOf(mark.sessionId) === -1) {
              const sess = ctx.db.sessions.find(s => s.id === mark.sessionId && s.active)[0];
              const newCol = keyRow.length + 1;
              sheet.setValues(1, newCol, [[mark.sessionId]]);
              sheet.setValues(2, newCol, [[sess ? sessionLabel(sess) : mark.sessionId]]);
              keyRow.push(mark.sessionId);
              data[0] = keyRow;
            }

            if (data.findIndex((r: string[], idx: number) => idx >= 2 && r[memberIdColIdx] === mark.memberId) === -1) {
              const newRow = [mark.memberId, '', '', '', '', ''];
              while (newRow.length < keyRow.length) newRow.push('');
              sheet.appendRows([newRow]);
              data.push(newRow);
            }

            cell = locateCell(keyRow, data.map((r: string[]) => r[memberIdColIdx]), mark.memberId, mark.sessionId);
          }

          if (cell) {
            sheet.setValues(cell.row1, cell.col1, [[mark.present ? '/' : '']]);
            if (data[cell.row1 - 1]) {
              data[cell.row1 - 1][cell.col1 - 1] = mark.present ? '/' : '';
            }
          }

          if (mark.opId) {
            ctx.cache.put('op:' + mark.opId, '1', 6 * 3600);
            applied.push(mark.opId);
          } else {
            applied.push('');
          }
        }

        const version = bumpAttendanceVersion(ctx, eventId, styleId);
        return { applied, version };
      }
    },

    'attendance.ensureSheets': {
      perm: 'members.import',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const eventId = String(payload?.eventId || '').trim();
        if (!eventId) {
          throw new AppError('VALIDATION', 'eventId is required');
        }
        return { sheets: ensureEventSheets(ctx, getEvent(ctx, eventId)) };
      }
    },

    'attendance.export': {
      perm: 'export.download',
      write: false,
      styleOf: (p: any) => p?.styleId,
      handler: (ctx, auth, payload: any) => {
        const { eventId, styleId } = payload || {};
        if (!eventId || !styleId) {
          throw new AppError('VALIDATION', 'eventId and styleId are required');
        }

        const event = getEvent(ctx, eventId);
        const rec = ctx.db.attendanceSheets.find(
          s => s.eventId === eventId && s.styleId === styleId && s.active
        )[0];
        if (!rec) {
          throw new AppError('NOT_FOUND', 'Attendance sheet not found');
        }

        const style = ctx.db.styles.find(s => s.id === styleId && s.active)[0];
        const fileName = `${event.name} ${style ? style.name : styleId} Attendance.xlsx`;
        return { fileName, base64: ctx.drive.exportXlsxBase64(rec.spreadsheetId) };
      }
    }
  };
}
