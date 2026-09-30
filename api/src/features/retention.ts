import { Route } from '../router';
import { Ctx, SheetPort } from '../ports';
import { EventItem } from '@umdsc/shared';
import { isDue, anonymizedMemberId } from '../logic/retention';
import { todayKL } from '../logic/events';
import { logAudit } from '../logic/audit';
import { readEventMembers } from './eventMembers';

const REMOVED_NAME = 'Removed dancer';
/** Personal columns blanked in a Members sheet (fullName becomes REMOVED_NAME). */
const MEMBER_PERSONAL = ['matricRaw', 'matricKey', 'nameKey', 'contact', 'email', 'gender', 'nationality'];
/** Personal columns blanked in an attendance sheet. */
const ATTENDANCE_PERSONAL = ['matric', 'contact', 'gender', 'nationality'];

function dueIndexRows(ctx: Ctx) {
  const today = todayKL(ctx.now());
  return ctx.db.memberIndex.find(m => m.active && m.matricKey !== '' && isDue(m.lastEventEnd, today));
}

/** Rewrites every row of `sheet` below `firstBodyRow` for which `change` returns true, in one write. */
function rewriteRows(sheet: SheetPort, firstBodyRow: number, change: (row: string[], header: string[]) => boolean): void {
  const data = sheet.getDisplayValues();
  const header = data[0] || [];
  const body = data.slice(firstBodyRow - 1);
  let touched = false;
  for (const row of body) {
    if (change(row, header)) touched = true;
  }
  if (touched) sheet.setValues(firstBodyRow, 1, body);
}

function wipeInEvent(ctx: Ctx, event: EventItem, anonIdByMatric: Map<string, string>): void {
  const anonByMemberId = new Map(Array.from(anonIdByMatric, ([matric, anon]) => ['M-' + matric, anon]));

  const members = event.membersSpreadsheetId
    ? ctx.drive.openSpreadsheet(event.membersSpreadsheetId).sheet('Members')
    : null;
  if (members) {
    rewriteRows(members, 2, (row, header) => {
      const anon = anonIdByMatric.get(row[header.indexOf('matricKey')]);
      if (!anon) return false;
      row[header.indexOf('memberId')] = anon;
      row[header.indexOf('fullName')] = REMOVED_NAME;
      for (const col of MEMBER_PERSONAL) if (header.indexOf(col) >= 0) row[header.indexOf(col)] = '';
      return true;
    });
  }

  for (const rec of ctx.db.attendanceSheets.find(a => a.eventId === event.id)) {
    const sheet = ctx.drive.info(rec.spreadsheetId).exists
      ? ctx.drive.openSpreadsheet(rec.spreadsheetId).sheet('Attendance')
      : null;
    if (!sheet) continue;
    rewriteRows(sheet, 3, (row, header) => {
      const anon = anonByMemberId.get(row[header.indexOf('memberId')]);
      if (!anon) return false;
      row[header.indexOf('memberId')] = anon;
      row[header.indexOf('fullName')] = REMOVED_NAME;
      for (const col of ATTENDANCE_PERSONAL) if (header.indexOf(col) >= 0) row[header.indexOf(col)] = '';
      return true;
    });
  }
}

export function getRetentionRoutes(): Record<string, Route> {
  return {
    'retention.preview': {
      perm: 'settings.edit',
      write: false,
      handler: (ctx) => {
        const dueRows = dueIndexRows(ctx);
        const dueSet = new Set(dueRows.map(m => m.matricKey));
        const events = ctx.db.events.find(e => e.active);

        const due = dueRows.map(m => {
          const last = events.find(e => m.eventIds.includes(e.id) && e.endDate === m.lastEventEnd);
          return { matricKey: m.matricKey, fullName: m.fullName, lastEventName: last ? last.name : '', lastEventEnd: m.lastEventEnd };
        });

        const formsToClean = events
          .filter(e => {
            const members = readEventMembers(ctx, e);
            return members.length > 0 && members.every(m => !m.matricKey || dueSet.has(m.matricKey));
          })
          .map(e => ({ eventName: e.name, sourceSheetId: e.sourceSheetId }));

        return { due, formsToClean };
      }
    },

    'retention.apply': {
      perm: 'settings.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const requested = new Set<string>(Array.isArray(payload?.matricKeys) ? payload.matricKeys.map(String) : []);
        const targets = dueIndexRows(ctx).filter(m => requested.has(m.matricKey));
        const actor = auth?.claims.sub || 'system';
        if (targets.length === 0) return { wiped: 0 };

        const anonIdByMatric = new Map(targets.map(m => [m.matricKey, anonymizedMemberId()]));
        for (const event of ctx.db.events.find(e => e.active)) {
          if (targets.some(t => t.eventIds.includes(event.id))) {
            wipeInEvent(ctx, event, anonIdByMatric);
          }
        }

        for (const m of targets) {
          ctx.db.memberIndex.update(
            m.id,
            m.version,
            { matricKey: '', nameKey: '', fullName: '', eventIds: [], lastEventEnd: '', active: false },
            actor,
            ctx.now()
          );
          for (const role of ctx.db.memberRoles.find(r => r.active && r.matricKey === m.matricKey)) {
            ctx.db.memberRoles.deactivate(role.id, role.version, actor, ctx.now());
          }
          for (const entry of ctx.db.auditLog.find(a => a.target.includes(m.matricKey) || a.detail.includes(m.matricKey))) {
            ctx.db.auditLog.update(
              entry.id,
              entry.version,
              {
                target: entry.target.includes(m.matricKey) ? '' : entry.target,
                detail: entry.detail.includes(m.matricKey) ? '' : entry.detail
              },
              actor,
              ctx.now()
            );
          }
          ctx.cache.remove('mi:' + m.matricKey);
        }

        logAudit(ctx, actor, 'retention.apply', '', `wiped ${targets.length} dancers`);
        return { wiped: targets.length };
      }
    }
  };
}
