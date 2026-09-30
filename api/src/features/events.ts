import { Route } from '../router';
import { AppError } from '../errors';
import { EventType } from '@umdsc/shared';
import { validateEventFields, eventNameKey } from '../logic/events';
import { validateLink } from '../logic/linkValidation';
import { logAudit } from '../logic/audit';
import { previewSource, openSourceTab } from './eventSource';
import { ensureEventFolder, ensureMembersSheet } from './eventSheets';
import { importEventMembers } from './eventImport';
import { assertSchemaReady } from './reset';

interface SessionInput {
  styleId: string;
  seq: number;
  date: string;
  start: string;
  end: string;
  venue?: string;
}

export function getEventRoutes(): Record<string, Route> {
  return {
    'events.list': {
      perm: 'members.view',
      write: false,
      handler: (ctx, auth, payload: any) => {
        const includeArchived = Boolean(payload?.includeArchived);
        return ctx.db.events
          .find(e => e.active && (includeArchived || e.status === 'active'))
          .sort((a, b) => b.startDate.localeCompare(a.startDate));
      }
    },

    'events.previewSource': {
      perm: 'members.import',
      write: false,
      handler: (ctx, auth, payload: any) => previewSource(ctx, String(payload?.sheetUrl || ''))
    },

    'events.create': {
      perm: 'members.import',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        assertSchemaReady(ctx);

        const name = String(payload?.name || '').trim();
        const type = String(payload?.type || '') as EventType;
        const startDate = String(payload?.startDate || '');
        const endDate = String(payload?.endDate || '');
        const styleIds: string[] = Array.isArray(payload?.styleIds) ? payload.styleIds : [];
        const sessions: SessionInput[] = Array.isArray(payload?.sessions) ? payload.sessions : [];

        validateEventFields(
          { name, type, startDate, endDate, styleIds },
          ctx.db.events.find(e => e.active).map(e => ({ id: e.id, nameKey: e.nameKey }))
        );
        const sourceSheetId = validateLink(ctx, String(payload?.sheetUrl || ''), 'spreadsheet');
        for (const s of sessions) {
          if (!styleIds.includes(s.styleId)) {
            throw new AppError('VALIDATION', `Class #${s.seq} is for a style that is not in this event`);
          }
          if (!s.date || s.date < startDate || s.date > endDate) {
            throw new AppError('VALIDATION', `Class date must be inside the event (${startDate} to ${endDate})`);
          }
          if (!s.seq || !s.start || !s.end) {
            throw new AppError('VALIDATION', 'Each class needs seq, date, start and end');
          }
        }
        if (!ctx.db.settings.find(s => s.key === 'defaultAttendanceFolderId' && s.active)[0]?.value) {
          throw new AppError('VALIDATION', 'Set the attendance master folder on the Events page first');
        }

        const actor = auth?.claims.sub || 'system';
        const created = ctx.db.events.insert(
          {
            name,
            nameKey: eventNameKey(name),
            type,
            startDate,
            endDate,
            sourceSheetId,
            sourceTab: openSourceTab(ctx, sourceSheetId).tab,
            columnMapJson: JSON.stringify(payload?.columnMap || {}),
            classIndex: payload?.classIndex === undefined || payload?.classIndex === null ? -1 : Number(payload.classIndex),
            styleIds,
            folderId: '',
            videoFolderId: '',
            membersSpreadsheetId: '',
            status: 'active',
            sourceRowCount: 0,
            sourceLastRowHash: '',
            lastSyncAt: '',
            lastSyncError: '',
            memberCount: 0
          },
          actor,
          ctx.now()
        );

        const folderId = ensureEventFolder(ctx, created);
        ensureMembersSheet(ctx, ctx.db.events.get(created.id)!, folderId);
        for (const s of sessions) {
          ctx.db.sessions.insert(
            {
              eventId: created.id,
              styleId: s.styleId,
              seq: Number(s.seq),
              date: s.date,
              start: s.start,
              end: s.end,
              instructorId: '',
              venue: s.venue || '',
              status: 'scheduled',
              note: ''
            },
            actor,
            ctx.now()
          );
        }

        const imported = importEventMembers(ctx, ctx.db.events.get(created.id)!, { full: true });
        const event = ctx.db.events.get(created.id)!;
        const sheets = ctx.db.attendanceSheets
          .find(a => a.eventId === event.id && a.active)
          .map(a => ({ styleId: a.styleId, spreadsheetId: a.spreadsheetId }));

        logAudit(ctx, actor, 'events.create', event.id, `${event.name}: ${imported.memberCount} dancers`);
        return { event, import: imported, sheets };
      }
    }
  };
}
