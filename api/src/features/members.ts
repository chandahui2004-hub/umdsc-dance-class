import { Route } from '../router';
import { AppError } from '../errors';
import { logAudit } from '../logic/audit';
import { normalizeMatric, nameKey } from '../logic/normalize';
import { getEvent, readEventMembers, membersCacheKey, NAME_EDITED_FLAG } from './eventMembers';
import { refreshAttendanceFixedColumns } from './eventImport';
import { isMemberEnrolledInStyle } from '../logic/styleMatcher';

export function getMemberRoutes(): Record<string, Route> {
  return {
    'members.list': {
      perm: 'members.view',
      write: false,
      handler: (ctx, auth, payload: any) => {
        const { eventId, styleId } = payload || {};
        if (!eventId) {
          throw new AppError('VALIDATION', 'eventId is required');
        }
        const members = readEventMembers(ctx, getEvent(ctx, eventId));
        if (!styleId) return members;
        const allStyles = ctx.db.styles.find(s => s.active);
        return members.filter(m => isMemberEnrolledInStyle(m, styleId, allStyles));
      }
    },

    'members.update': {
      perm: 'members.import',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { eventId, memberId, fullName, matricRaw } = payload || {};
        if (!eventId || !memberId) {
          throw new AppError('VALIDATION', 'eventId and memberId are required');
        }

        const event = getEvent(ctx, eventId);
        const sheet = event.membersSpreadsheetId
          ? ctx.drive.openSpreadsheet(event.membersSpreadsheetId).sheet('Members')
          : null;
        if (!sheet) {
          throw new AppError('NOT_FOUND', 'Members sheet not found');
        }

        const rows = sheet.getDisplayValues();
        const headers = rows[0] || [];
        const idCol = headers.indexOf('memberId');
        const nameCol = headers.indexOf('fullName');
        const keyCol = headers.indexOf('matricKey');
        const nameKeyCol = headers.indexOf('nameKey');

        const rowIndex = rows.findIndex((r, idx) => idx >= 1 && r[idCol] === memberId);
        if (rowIndex === -1) {
          throw new AppError('NOT_FOUND', `Member ${memberId} not found`);
        }

        const row = [...rows[rowIndex]];
        // The matric number is the dancer's id (memberId, sign-in, attendance rows), so it is only
        // ever taken from the form
        if (matricRaw !== undefined && normalizeMatric(matricRaw) !== row[keyCol]) {
          throw new AppError(
            'VALIDATION',
            "A matric number can't be changed here. Correct it in the registration form's response sheet, then press Sync now."
          );
        }
        const name = String(fullName ?? '').trim();
        if (fullName !== undefined && !name) {
          throw new AppError('VALIDATION', 'Name cannot be empty');
        }
        if (name) {
          row[nameCol] = name;
          row[nameKeyCol] = nameKey(name);
          const flagsCol = headers.indexOf('flags');
          const flags = String(row[flagsCol] || '').split(',').filter(Boolean);
          if (flagsCol >= 0 && !flags.includes(NAME_EDITED_FLAG)) row[flagsCol] = [...flags, NAME_EDITED_FLAG].join(',');
        }
        sheet.setValues(rowIndex + 1, 1, [row]);
        ctx.cache.remove(membersCacheKey(event));

        const changed = readEventMembers(ctx, event).find(m => m.memberId === memberId);
        if (changed) refreshAttendanceFixedColumns(ctx, event, new Map([[memberId, changed]]));

        const oldMatricKey = rows[rowIndex][keyCol];
        const actor = auth?.claims.sub || 'system';
        const mi = ctx.db.memberIndex.find(idx => idx.matricKey === oldMatricKey && idx.active)[0];
        if (mi) {
          ctx.db.memberIndex.update(
            mi.id,
            mi.version,
            { fullName: row[nameCol], nameKey: row[nameKeyCol] },
            actor,
            ctx.now()
          );
        }
        ctx.cache.remove('mi:' + oldMatricKey);

        logAudit(ctx, actor, 'members.update', memberId, `Updated member ${memberId} in ${event.name}`);
        return { updated: true };
      }
    }
  };
}
