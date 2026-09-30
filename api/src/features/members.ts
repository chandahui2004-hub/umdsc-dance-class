import { Route } from '../router';
import { AppError } from '../errors';
import { logAudit } from '../logic/audit';
import { normalizeMatric, nameKey } from '../logic/normalize';
import { getEvent, readEventMembers } from './eventMembers';

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
        return styleId ? members.filter(m => m.styleIds.includes(styleId)) : members;
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
        const rawCol = headers.indexOf('matricRaw');
        const keyCol = headers.indexOf('matricKey');
        const nameKeyCol = headers.indexOf('nameKey');

        const rowIndex = rows.findIndex((r, idx) => idx >= 1 && r[idCol] === memberId);
        if (rowIndex === -1) {
          throw new AppError('NOT_FOUND', `Member ${memberId} not found`);
        }

        const row = [...rows[rowIndex]];
        if (fullName !== undefined) {
          row[nameCol] = fullName;
          row[nameKeyCol] = nameKey(fullName);
        }
        if (matricRaw !== undefined) {
          row[rawCol] = matricRaw;
          row[keyCol] = normalizeMatric(matricRaw);
        }
        sheet.setValues(rowIndex + 1, 1, [row]);

        const oldMatricKey = rows[rowIndex][keyCol];
        const actor = auth?.claims.sub || 'system';
        const mi = ctx.db.memberIndex.find(idx => idx.matricKey === oldMatricKey && idx.active)[0];
        if (mi) {
          ctx.db.memberIndex.update(
            mi.id,
            mi.version,
            { matricKey: row[keyCol], fullName: row[nameCol], nameKey: row[nameKeyCol] },
            actor,
            ctx.now()
          );
        }

        logAudit(ctx, actor, 'members.update', memberId, `Updated member ${memberId} in ${event.name}`);
        return { updated: true };
      }
    }
  };
}
