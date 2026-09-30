import { Route } from '../router';
import { AppError } from '../errors';
import { Ctx } from '../ports';
import { AttendanceGrid, ClassSession } from '@umdsc/shared';
import { sessionLabel, locateCell } from '../logic/attendanceGrid';
import { onSessionChanged } from './sessions';
import { getEvent, readEventMembers } from './eventMembers';
import { ensureEventSheets } from './eventSheets';

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
            return JSON.parse(cached);
          } catch {
            // ignore cache parse failure
          }
        }

        const sessions = ctx.db.sessions
          .find(s => s.eventId === eventId && s.styleId === styleId && s.active)
          .sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq);

        const grid: AttendanceGrid = { eventId, styleId, version: curVer, sessions, members: [], present: {} };

        const rec = ctx.db.attendanceSheets.find(
          s => s.eventId === eventId && s.styleId === styleId && s.active
        )[0];
        if (!rec) return grid;
        grid.spreadsheetId = rec.spreadsheetId;

        const sheet = ctx.drive.openSpreadsheet(rec.spreadsheetId).sheet('Attendance');
        const data = sheet ? sheet.getDisplayValues() : [];
        if (data.length < 2) return grid;

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

        ctx.cache.put(gridKey(eventId, styleId, curVer), JSON.stringify(grid), 60);
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
        const validMemberIds = new Set(
          readEventMembers(ctx, event).filter(m => m.styleIds.includes(styleId)).map(m => m.memberId)
        );
        for (const m of marks) {
          if (!validMemberIds.has(m.memberId)) {
            throw new AppError('VALIDATION', `Member ${m.memberId} is not registered in style ${styleId}`);
          }
        }

        const rec = ctx.db.attendanceSheets.find(
          s => s.eventId === eventId && s.styleId === styleId && s.active
        )[0];
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
            continue; // already applied
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
