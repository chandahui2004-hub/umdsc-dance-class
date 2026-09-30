import { Route } from '../router';
import { Ctx, SpreadsheetPort } from '../ports';
import { AppError } from '../errors';
import { SCHEMA } from '../db/schema';
import { todayKL } from '../logic/events';
import { logAudit } from '../logic/audit';

const CONFIRM_PHRASE = 'DELETE TEST DATA';
/** Tabs whose month-based test rows are cleared and whose headers become event-based. */
const CLEARED_TABS = ['ClassSessions', 'MemberIndex', 'AttendanceSheets', 'Videos', 'Music', 'Sections'] as const;

function systemSpreadsheet(ctx: Ctx): SpreadsheetPort {
  const id = ctx.props.get('SYSTEM_SPREADSHEET_ID');
  if (!id) {
    throw new AppError('SETUP_REQUIRED', 'System is not set up');
  }
  return ctx.drive.openSpreadsheet(id);
}

function header(ss: SpreadsheetPort, tab: string): string[] | null {
  const sheet = ss.sheet(tab);
  return sheet ? sheet.getDisplayValues()[0] || [] : null;
}

/** True once the database uses event ids (a missing tab is created with the new columns later). */
export function schemaReady(ctx: Ctx): boolean {
  const ss = systemSpreadsheet(ctx);
  if (ss.sheet('MemberMonths')) return false;
  for (const tab of ['ClassSessions', 'AttendanceSheets', 'Videos', 'Music']) {
    const h = header(ss, tab);
    if (h && !h.includes('eventId')) return false;
  }
  const mi = header(ss, 'MemberIndex');
  return !mi || mi.includes('eventIds');
}

export function assertSchemaReady(ctx: Ctx): void {
  if (!schemaReady(ctx)) {
    throw new AppError('VALIDATION', 'Run Settings › Reset test data first');
  }
}

export function getResetRoutes(): Record<string, Route> {
  return {
    'admin.resetStatus': {
      perm: 'settings.edit',
      write: false,
      handler: (ctx) => ({ needed: !schemaReady(ctx) })
    },

    'admin.resetTestData': {
      perm: 'settings.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        if (String(payload?.confirm ?? '') !== CONFIRM_PHRASE) {
          throw new AppError('VALIDATION', `Type ${CONFIRM_PHRASE} to confirm`);
        }
        if (schemaReady(ctx)) {
          throw new AppError('VALIDATION', 'Test data has already been reset');
        }

        const ss = systemSpreadsheet(ctx);
        const dbFolder = ctx.db.settings.find(s => s.key === 'dbFolderId' && s.active)[0]?.value || 'root';
        const backupSpreadsheetId = ctx.drive.copySpreadsheet(
          ss.id,
          `UMDSC_System backup ${todayKL(ctx.now())}`,
          dbFolder
        );

        for (const tab of CLEARED_TABS) {
          const sheet = ss.sheet(tab) || ss.addSheet(tab, []);
          sheet.clearBody();
          sheet.setHeaderRow([...SCHEMA[tab]]);
        }
        ss.removeSheet('MemberMonths');
        if (!ss.sheet('Events')) ss.addSheet('Events', [...SCHEMA.Events]);

        const actor = auth?.claims.sub || 'system';
        logAudit(ctx, actor, 'admin.resetTestData', ss.id, `backup ${backupSpreadsheetId}`);
        return { backupSpreadsheetId };
      }
    }
  };
}
