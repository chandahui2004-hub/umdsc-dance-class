import { Route } from '../router';
import { AppError } from '../errors';
import { Ctx } from '../ports';
import { AttendanceGrid, ClassSession, Member } from '@umdsc/shared';
import { sessionLabel, buildLayout, locateCell, planSync } from '../logic/attendanceGrid';
import { generateMonthSessions } from '../logic/sessionGen';
import { onSessionChanged } from './sessions';

export function attendanceEnsureSheets(
  ctx: Ctx,
  month: string
): { styleId: string; spreadsheetId: string }[] {
  const styles = ctx.db.styles.find(s => s.active);
  let sessions = ctx.db.sessions.find(s => s.month === month && s.active);

  // Auto-generate 4 classes for each style if not scheduled yet for this month
  for (const style of styles) {
    const existing = sessions.filter(s => s.styleId === style.id);
    if (existing.length === 0) {
      try {
        const { sessions: genSessions } = generateMonthSessions(month, style);
        for (const s of genSessions) {
          ctx.db.sessions.insert(s, 'system', ctx.now());
        }
      } catch (err) {
        console.error('Could not auto-generate sessions for style:', style.name, err);
      }
    }
  }
  sessions = ctx.db.sessions.find(s => s.month === month && s.active);
  
  // Read members for this month from Members sheet if imported
  const mm = ctx.db.memberMonths.find(m => m.month === month && m.active)[0];
  let members: Member[] = [];
  if (mm && mm.membersSpreadsheetId) {
    try {
      const memSs = ctx.drive.openSpreadsheet(mm.membersSpreadsheetId);
      const memSheet = memSs.sheet('Members') || (memSs as any).getSheet?.('Members');
      if (memSheet) {
        const rows = memSheet.getDisplayValues();
        const headers = rows[0] || [];
        const idCol = headers.indexOf('memberId');
        const nameCol = headers.indexOf('fullName');
        const rawCol = headers.indexOf('matricRaw');
        const keyCol = headers.indexOf('matricKey');
        const nameKeyCol = headers.indexOf('nameKey');
        const contactCol = headers.indexOf('contact');
        const emailCol = headers.indexOf('email');
        const genderCol = headers.indexOf('gender');
        const natCol = headers.indexOf('nationality');
        const stylesCol = headers.indexOf('styleIds');
        const styleNamesCol = headers.indexOf('styleNames');
        const tsCol = headers.indexOf('sourceTimestamp');
        const flagsCol = headers.indexOf('flags');

        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r[idCol]) continue;
          members.push({
            memberId: r[idCol],
            fullName: r[nameCol] || '',
            matricRaw: r[rawCol] || '',
            matricKey: r[keyCol] || '',
            nameKey: r[nameKeyCol] || '',
            contact: r[contactCol] || '',
            email: r[emailCol] || '',
            gender: r[genderCol] || '',
            nationality: r[natCol] || '',
            styleIds: String(r[stylesCol] || '').split(',').map(s => s.trim()).filter(Boolean),
            styleNames: String(r[styleNamesCol] || '').split(',').map(s => s.trim()).filter(Boolean),
            sourceTimestamp: r[tsCol] || '',
            flags: String(r[flagsCol] || '').split(',').map(s => s.trim()).filter(Boolean)
          });
        }
      }
    } catch (err) {
      console.error('Failed to read members spreadsheet:', err);
    }
  }

  const defaultFolder = ctx.db.settings.find(s => s.key === 'defaultAttendanceFolderId' && s.active)[0]?.value;
  const dbFolder = ctx.db.settings.find(s => s.key === 'dbFolderId' && s.active)[0]?.value;
  const fallbackFolder = defaultFolder || dbFolder || 'root';

  const result: { styleId: string; spreadsheetId: string }[] = [];

  for (const style of styles) {
    let folderId = style.attendanceFolderId;
    if (!folderId) {
      const existing = ctx.drive.findChildFolder(fallbackFolder, style.name);
      if (existing) {
        folderId = existing;
      } else {
        folderId = ctx.drive.createFolder(fallbackFolder, style.name);
      }
    }
    const styleSessions = sessions.filter(s => s.styleId === style.id).sort((a, b) => a.seq - b.seq);
    const styleMembers = members.filter(m => m.styleIds.includes(style.id));

    let rec = ctx.db.attendanceSheets.find(s => s.month === month && s.styleId === style.id && s.active)[0];
    let sheetExists = false;
    if (rec) {
      try {
        const info = ctx.drive.info(rec.spreadsheetId);
        sheetExists = Boolean(info && info.exists);
      } catch {
        sheetExists = false;
      }
    }

    if (rec && sheetExists) {
      // The master folder may have changed since this sheet was created: move the
      // sheet into the style's folder under the current master folder.
      try {
        ctx.drive.moveToFolder(rec.spreadsheetId, folderId);
      } catch (err) {
        console.error('Could not move attendance sheet into style folder:', err);
      }

      // Spreadsheet already exists, sync
      const ss = ctx.drive.openSpreadsheet(rec.spreadsheetId);
      let sheet = ss.sheet('Attendance') || (ss as any).getSheet?.('Attendance');
      if (sheet) {
        const data = sheet.getDisplayValues();
        if (data.length >= 2) {
          const keyRow = [...data[0]];
          const memberIdColIdx = keyRow.indexOf('memberId');
          const existingMemberIds = memberIdColIdx !== -1 ? data.slice(2).map(r => r[memberIdColIdx]).filter(Boolean) : [];
          const { appendColumns, appendRows } = planSync(keyRow, existingMemberIds, styleMembers, styleSessions);

          if (appendColumns.length > 0) {
            const startCol = keyRow.length + 1;
            const newLabels = appendColumns.map(colId => {
              const sess = styleSessions.find(s => s.id === colId);
              return sess ? sessionLabel(sess) : colId;
            });
            sheet.setValues(1, startCol, [appendColumns]);
            sheet.setValues(2, startCol, [newLabels]);
            keyRow.push(...appendColumns);
          }

          if (appendRows.length > 0) {
            for (const m of appendRows) {
              const rowCells = [m.memberId, m.fullName, m.matricRaw, m.contact, m.gender, m.nationality];
              while (rowCells.length < keyRow.length) {
                rowCells.push('');
              }
              sheet.appendRows([rowCells]);
            }
          }
        } else {
          const { keyRow, labelRow, rows } = buildLayout(styleMembers, styleSessions);
          sheet.setValues(1, 1, [keyRow, labelRow, ...rows]);
          sheet.hideRow(1);
          sheet.protectRowWarningOnly(1);
        }
      }
      result.push({ styleId: style.id, spreadsheetId: rec.spreadsheetId });
    } else {
      // Create new attendance spreadsheet
      const ss = ctx.drive.createSpreadsheet(`${month} ${style.name} Attendance`, folderId);
      let sheet = ss.sheet('Attendance') || (ss as any).getSheet?.('Attendance');
      if (!sheet) {
        sheet = ss.addSheet('Attendance', []);
      }
      const { keyRow, labelRow, rows } = buildLayout(styleMembers, styleSessions);
      sheet.setValues(1, 1, [keyRow, labelRow, ...rows]);
      sheet.hideRow(1);
      sheet.protectRowWarningOnly(1);
      sheet.setPlainTextColumns([1, 3, 4]);

      if (rec) {
        ctx.db.attendanceSheets.update(
          rec.id,
          rec.version,
          { spreadsheetId: ss.id },
          'system',
          ctx.now()
        );
        result.push({ styleId: style.id, spreadsheetId: ss.id });
      } else {
        const inserted = ctx.db.attendanceSheets.insert(
          {
            month,
            styleId: style.id,
            spreadsheetId: ss.id
          },
          'system',
          ctx.now()
        );
        result.push({ styleId: style.id, spreadsheetId: inserted.spreadsheetId });
      }
    }
  }

  return result;
}

export function attendanceRelabel(ctx: Ctx, session: ClassSession): void {
  const rec = ctx.db.attendanceSheets.find(
    s => s.month === session.month && s.styleId === session.styleId && s.active
  )[0];
  if (!rec) return;

  try {
    const ss = ctx.drive.openSpreadsheet(rec.spreadsheetId);
    const sheet = ss.sheet('Attendance') || (ss as any).getSheet?.('Attendance');
    if (!sheet) return;
    const data = sheet.getDisplayValues();
    if (data.length < 2) return;
    const keyRow = data[0];
    const colIdx = keyRow.indexOf(session.id);
    if (colIdx !== -1) {
      const newLabel = sessionLabel(session);
      sheet.setValues(2, colIdx + 1, [[newLabel]]);
      const curVer = Number(ctx.cache.get(`attv:${session.month}:${session.styleId}`) || 1) + 1;
      ctx.cache.put(`attv:${session.month}:${session.styleId}`, String(curVer), 86400 * 30);
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
        const { month, styleId, ifVersion } = payload || {};
        if (!month || !styleId) {
          throw new AppError('VALIDATION', 'month and styleId are required');
        }

        const curVer = Number(ctx.cache.get(`attv:${month}:${styleId}`) || 1);
        if (ifVersion !== undefined && Number(ifVersion) === curVer) {
          return { notModified: true, version: curVer };
        }

        const cached = ctx.cache.get(`att:${month}:${styleId}:${curVer}`);
        if (cached) {
          try {
            return JSON.parse(cached);
          } catch {
            // ignore cache parse failure
          }
        }

        const defaultFolder = ctx.db.settings.find(
          s => s.key === 'defaultAttendanceFolderId' && s.active
        )[0]?.value;

        const rec = ctx.db.attendanceSheets.find(
          s => s.month === month && s.styleId === styleId && s.active
        )[0];

        const sessions = ctx.db.sessions
          .find(s => s.month === month && s.styleId === styleId && s.active)
          .sort((a, b) => a.seq - b.seq);

        if (!rec) {
          return {
            month,
            styleId,
            version: curVer,
            sessions,
            members: [],
            present: {},
            masterFolderId: defaultFolder
          };
        }

        const ss = ctx.drive.openSpreadsheet(rec.spreadsheetId);
        const sheet = ss.sheet('Attendance') || (ss as any).getSheet?.('Attendance');
        if (!sheet) {
          return {
            month,
            styleId,
            version: curVer,
            sessions,
            members: [],
            present: {},
            spreadsheetId: rec.spreadsheetId,
            folderId: rec.folderId,
            masterFolderId: defaultFolder
          };
        }

        const data = sheet.getDisplayValues();
        if (data.length < 2) {
          return {
            month,
            styleId,
            version: curVer,
            sessions,
            members: [],
            present: {},
            spreadsheetId: rec.spreadsheetId,
            folderId: rec.folderId,
            masterFolderId: defaultFolder
          };
        }

        const keyRow = data[0];
        const memberIdColIdx = keyRow.indexOf('memberId');
        const fullNameColIdx = keyRow.indexOf('fullName');
        const matricColIdx = keyRow.indexOf('matric');

        const sessionCols = sessions
          .map(s => ({ id: s.id, colIdx: keyRow.indexOf(s.id) }))
          .filter(x => x.colIdx !== -1);

        const members: { memberId: string; fullName: string; matric: string }[] = [];
        const present: Record<string, string[]> = {};

        for (let r = 2; r < data.length; r++) {
          const row = data[r];
          const mId = row[memberIdColIdx];
          if (!mId) continue;

          members.push({
            memberId: mId,
            fullName: row[fullNameColIdx] || '',
            matric: row[matricColIdx] || ''
          });

          present[mId] = [];
          for (const sCol of sessionCols) {
            if (row[sCol.colIdx] === '/') {
              present[mId].push(sCol.id);
            }
          }
        }

        const grid: AttendanceGrid = {
          month,
          styleId,
          version: curVer,
          sessions,
          members,
          present,
          spreadsheetId: rec.spreadsheetId,
          folderId: rec.folderId,
          masterFolderId: defaultFolder
        };

        ctx.cache.put(`att:${month}:${styleId}:${curVer}`, JSON.stringify(grid), 60);
        return grid;
      }
    },

    'attendance.mark': {
      perm: 'attendance.edit',
      write: true,
      styleOf: (p: any) => p?.styleId,
      handler: (ctx, auth, payload: any) => {
        const { month, styleId, marks } = payload || {};
        if (!month || !styleId || !Array.isArray(marks)) {
          throw new AppError('VALIDATION', 'month, styleId, and marks array are required');
        }

        // Validate that members are registered for this month & style
        const mm = ctx.db.memberMonths.find(m => m.month === month && m.active)[0];
        const validMemberIds = new Set<string>();
        if (mm && mm.membersSpreadsheetId) {
          try {
            const memSs = ctx.drive.openSpreadsheet(mm.membersSpreadsheetId);
            const memSheet = memSs.sheet('Members') || (memSs as any).getSheet?.('Members');
            if (memSheet) {
              const rows = memSheet.getDisplayValues();
              const headers = rows[0] || [];
              const mIdIdx = headers.indexOf('memberId');
              const stylesIdx = headers.indexOf('styleIds');
              for (let i = 1; i < rows.length; i++) {
                const sIds = String(rows[i][stylesIdx] || '').split(',').map(s => s.trim());
                if (sIds.includes(styleId)) {
                  validMemberIds.add(rows[i][mIdIdx]);
                }
              }
            }
          } catch {
            // ignore
          }
        }

        for (const m of marks) {
          if (!validMemberIds.has(m.memberId)) {
            throw new AppError('VALIDATION', `Member ${m.memberId} is not registered in style ${styleId}`);
          }
        }

        const rec = ctx.db.attendanceSheets.find(
          s => s.month === month && s.styleId === styleId && s.active
        )[0];
        if (!rec) {
          throw new AppError('NOT_FOUND', `Attendance sheet for ${month} ${styleId} not found`);
        }

        const ss = ctx.drive.openSpreadsheet(rec.spreadsheetId);
        const sheet = ss.sheet('Attendance') || (ss as any).getSheet?.('Attendance');
        if (!sheet) {
          throw new AppError('NOT_FOUND', 'Attendance tab not found');
        }

        const data = sheet.getDisplayValues();
        let keyRow = [...data[0]];
        const memberIdColIdx = keyRow.indexOf('memberId');

        const applied: string[] = [];

        for (const mark of marks) {
          if (mark.opId && ctx.cache.get('op:' + mark.opId)) {
            // Already applied
            continue;
          }

          let cell = locateCell(keyRow, data.map(r => r[memberIdColIdx]), mark.memberId, mark.sessionId);

          if (!cell) {
            // Check if session column missing
            let sCol = keyRow.indexOf(mark.sessionId);
            if (sCol === -1) {
              const sess = ctx.db.sessions.find(s => s.id === mark.sessionId && s.active)[0];
              const label = sess ? sessionLabel(sess) : mark.sessionId;
              const newCol = keyRow.length + 1;
              sheet.setValues(1, newCol, [[mark.sessionId]]);
              sheet.setValues(2, newCol, [[label]]);
              keyRow.push(mark.sessionId);
              data[0] = keyRow;
            }

            // Check if member row missing
            let mRow = data.findIndex((r, idx) => idx >= 2 && r[memberIdColIdx] === mark.memberId);
            if (mRow === -1) {
              const newRow = [mark.memberId, '', '', '', '', ''];
              while (newRow.length < keyRow.length) {
                newRow.push('');
              }
              sheet.appendRows([newRow]);
              data.push(newRow);
            }

            cell = locateCell(keyRow, data.map(r => r[memberIdColIdx]), mark.memberId, mark.sessionId);
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

        const nextVer = Number(ctx.cache.get(`attv:${month}:${styleId}`) || 1) + 1;
        ctx.cache.put(`attv:${month}:${styleId}`, String(nextVer), 86400 * 30);

        return { applied, version: nextVer };
      }
    },

    'attendance.export': {
      perm: 'export.download',
      write: false,
      styleOf: (p: any) => p?.styleId,
      handler: (ctx, auth, payload: any) => {
        const { month, styleId } = payload || {};
        if (!month || !styleId) {
          throw new AppError('VALIDATION', 'month and styleId are required');
        }

        const rec = ctx.db.attendanceSheets.find(
          s => s.month === month && s.styleId === styleId && s.active
        )[0];
        if (!rec) {
          throw new AppError('NOT_FOUND', 'Attendance sheet not found');
        }

        const style = ctx.db.styles.find(s => s.id === styleId && s.active)[0];
        const styleName = style ? style.name : styleId;
        const fileName = `${month} ${styleName} Attendance.xlsx`;
        const base64 = ctx.drive.exportXlsxBase64(rec.spreadsheetId);

        return { fileName, base64 };
      }
    },

    'attendance.ensureSheets': {
      perm: 'settings.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { month } = payload || {};
        if (!month) {
          throw new AppError('VALIDATION', 'month is required');
        }
        const sheets = attendanceEnsureSheets(ctx, month);
        return { sheets };
      }
    }
  };
}
