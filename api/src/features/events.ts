import { Route } from '../router';
import { AppError } from '../errors';
import { EventItem, EventListItem, EventStatus, EventType } from '@umdsc/shared';
import { Ctx } from '../ports';
import { validateEventFields, eventNameKey, classesOutsideRange, todayKL } from '../logic/events';
import { isDue } from '../logic/retention';
import { validateLink } from '../logic/linkValidation';
import { logAudit } from '../logic/audit';
import { previewSource, openSourceTab } from './eventSource';
import { ensureEventFolder, ensureMembersSheet, ensureEventSheets, saveEventFields } from './eventSheets';
import { getEvent, readEventMembers } from './eventMembers';
import { importEventMembers, sourceUnchanged } from './eventImport';
import { withScriptLock } from '../db/lock';
import { assertSchemaReady } from './reset';

const AUTO_SYNC_SECONDS = 600;
const SYNC_NOW_SECONDS = 60;

const RETENTION_NO_SYNC =
  'This event ended more than 3 years ago, so it no longer syncs (data retention). Archive it when you are done.';

/** Old events stop syncing, so re-reading their form can never undo a retention wipe. */
function pastRetention(event: EventItem, today: string): boolean {
  return isDue(event.endDate, today);
}

function errorText(err: unknown): string {
  if (err instanceof AppError) return err.message.replace(/^[A-Z_]+: /, '');
  return err instanceof Error ? err.message : String(err);
}

function statusRoute(status: EventStatus): Route {
  return {
    perm: 'members.import',
    write: true,
    bumpsData: true,
    handler: (ctx, auth, payload: any) => {
      const { id, version } = payload || {};
      if (!id || version === undefined) {
        throw new AppError('VALIDATION', 'id and version are required');
      }
      const actor = auth?.claims.sub || 'system';
      const updated = ctx.db.events.update(String(id), Number(version), { status }, actor, ctx.now());
      logAudit(ctx, actor, status === 'archived' ? 'events.archive' : 'events.unarchive', updated.id, updated.name);
      return updated;
    }
  };
}

/** Recomputes lastEventEnd (latest end date among each member's events) in one write. */
function recalculateLastEventEnd(ctx: Ctx, event: EventItem): void {
  const matricKeys = new Set(readEventMembers(ctx, event).map(m => m.matricKey));
  const endDates = new Map(ctx.db.events.find(e => e.active).map(e => [e.id, e.endDate]));
  const rows = ctx.db.memberIndex
    .find(m => m.active && matricKeys.has(m.matricKey))
    .map(m => ({
      matricKey: m.matricKey,
      nameKey: m.nameKey,
      fullName: m.fullName,
      eventIds: m.eventIds,
      lastEventEnd: m.eventIds.map(id => endDates.get(id) || '').reduce((a, b) => (b > a ? b : a), '')
    }));
  if (rows.length > 0) {
    ctx.db.memberIndex.upsertMany('matricKey', rows, 'system', ctx.now());
  }
}

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
        const rows: EventListItem[] = ctx.db.events
          .find(e => e.active && (includeArchived || e.status === 'active'))
          .sort((a, b) => b.startDate.localeCompare(a.startDate))
          .map(e => ({
            ...e,
            folderMissing: e.status === 'active' && Boolean(e.folderId) && !ctx.drive.info(e.folderId).exists
          }));
        return rows;
      }
    },

    'events.previewSource': {
      perm: 'members.import',
      write: false,
      handler: (ctx, auth, payload: any) => previewSource(ctx, String(payload?.sheetUrl || ''))
    },

    'events.update': {
      perm: 'members.import',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { id, version } = payload || {};
        if (!id || version === undefined) {
          throw new AppError('VALIDATION', 'id and version are required');
        }
        const existing = getEvent(ctx, id);
        if (existing.version !== Number(version)) {
          throw new AppError('VERSION_CONFLICT', 'Event has been modified by another user', false, existing);
        }

        const next = {
          name: payload.name !== undefined ? String(payload.name).trim() : existing.name,
          type: (payload.type !== undefined ? payload.type : existing.type) as EventType,
          startDate: payload.startDate !== undefined ? String(payload.startDate) : existing.startDate,
          endDate: payload.endDate !== undefined ? String(payload.endDate) : existing.endDate,
          styleIds: Array.isArray(payload.styleIds) ? payload.styleIds : existing.styleIds
        };
        validateEventFields(
          next,
          ctx.db.events.find(e => e.active).map(e => ({ id: e.id, nameKey: e.nameKey })),
          existing.id
        );

        const outside = classesOutsideRange(
          ctx.db.sessions.find(s => s.eventId === existing.id),
          next.startDate,
          next.endDate
        );
        if (outside.length > 0) {
          const styleName = (styleId: string) => ctx.db.styles.find(s => s.id === styleId)[0]?.name || styleId;
          throw new AppError(
            'VALIDATION',
            `These classes are outside the new dates: ${outside
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(s => `${s.date} ${styleName(s.styleId)} #${s.seq}`)
              .join(', ')}`
          );
        }

        const patch: any = { ...next, nameKey: eventNameKey(next.name) };
        if (payload.columnMap !== undefined) patch.columnMapJson = JSON.stringify(payload.columnMap || {});
        if (payload.classIndex !== undefined) patch.classIndex = Number(payload.classIndex);
        if (payload.sheetUrl !== undefined) {
          const sourceSheetId = validateLink(ctx, String(payload.sheetUrl), 'spreadsheet');
          if (sourceSheetId !== existing.sourceSheetId) {
            patch.sourceSheetId = sourceSheetId;
            patch.sourceTab = openSourceTab(ctx, sourceSheetId).tab;
            patch.sourceRowCount = 0;
            patch.sourceLastRowHash = '';
          }
        }

        const actor = auth?.claims.sub || 'system';
        const updated = ctx.db.events.update(existing.id, existing.version, patch, actor, ctx.now());

        if (next.name !== existing.name) {
          if (existing.folderId && ctx.drive.info(existing.folderId).exists) {
            ctx.drive.renameFolder(existing.folderId, next.name);
          }
          if (existing.videoFolderId && ctx.drive.info(existing.videoFolderId).exists) {
            ctx.drive.renameFolder(existing.videoFolderId, next.name);
          }
        }
        if (next.endDate !== existing.endDate) {
          recalculateLastEventEnd(ctx, updated);
        }
        if (next.styleIds.some((s: string) => !existing.styleIds.includes(s))) {
          ensureEventSheets(ctx, updated);
        }

        logAudit(ctx, actor, 'events.update', updated.id, updated.name);
        return ctx.db.events.get(updated.id);
      }
    },

    // Runs every 10 minutes from any open admin page. Registered as a read route:
    // it takes the script lock itself, and only when a form actually changed.
    'events.autoSync': {
      perm: 'members.import',
      write: false,
      handler: (ctx) => {
        const result = { checked: [] as string[], changed: [] as string[], skipped: [] as string[], errors: [] as { eventId: string; message: string }[] };

        const today = todayKL(ctx.now());
        for (const event of ctx.db.events.find(e => e.active && e.status === 'active' && !pastRetention(e, today))) {
          const checkKey = `sync:check:${event.id}`;
          if (ctx.cache.get(checkKey) !== null) {
            result.skipped.push(event.id);
            continue;
          }
          ctx.cache.put(checkKey, '1', AUTO_SYNC_SECONDS);

          try {
            if (sourceUnchanged(ctx, event)) {
              result.checked.push(event.id);
              continue;
            }
          } catch (err) {
            const message = errorText(err);
            result.errors.push({ eventId: event.id, message });
            try {
              withScriptLock(ctx.lock, () => saveEventFields(ctx, event.id, { lastSyncError: message }, 'sync'));
            } catch {
              // lock busy: the error is still returned to the caller
            }
            continue;
          }

          try {
            withScriptLock(ctx.lock, () => {
              // Other requests may have written while this one waited for the lock
              ctx.db.reload();
              const fresh = ctx.db.events.get(event.id);
              if (!fresh || !fresh.active || fresh.status !== 'active') return;
              importEventMembers(ctx, fresh, { full: false });
            });
            result.changed.push(event.id);
          } catch (err) {
            if (err instanceof AppError && err.code === 'BUSY') {
              ctx.cache.remove(checkKey);
              result.skipped.push(event.id);
            } else {
              result.errors.push({ eventId: event.id, message: errorText(err) });
            }
          }
        }

        if (result.changed.length > 0) {
          ctx.props.set('DATA_VERSION', String(Number(ctx.props.get('DATA_VERSION') || 1) + 1));
        }
        return result;
      }
    },

    'events.sync': {
      perm: 'members.import',
      write: true,
      handler: (ctx, auth, payload: any) => {
        const event = getEvent(ctx, String(payload?.id || ''));
        if (event.status === 'archived') {
          throw new AppError('VALIDATION', 'Archived events do not sync');
        }
        if (pastRetention(event, todayKL(ctx.now()))) {
          throw new AppError('VALIDATION', RETENTION_NO_SYNC);
        }
        const forceKey = `sync:force:${event.id}`;
        const recent = ctx.cache.get(forceKey);
        if (recent !== null) {
          return { ...JSON.parse(recent), message: 'Synced less than a minute ago' };
        }

        const result = importEventMembers(ctx, event, { full: true });
        ctx.cache.put(forceKey, JSON.stringify(result), SYNC_NOW_SECONDS);
        if (result.added > 0 || result.updated > 0 || result.flaggedRemoved > 0) {
          ctx.props.set('DATA_VERSION', String(Number(ctx.props.get('DATA_VERSION') || 1) + 1));
        }
        logAudit(ctx, auth?.claims.sub || 'system', 'events.sync', event.id, `+${result.added} ~${result.updated}`);
        return result;
      }
    },

    'events.archive': statusRoute('archived'),
    'events.unarchive': statusRoute('active'),

    'events.recreateFolder': {
      perm: 'members.import',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const event = getEvent(ctx, String(payload?.id || ''));
        const folderId = ensureEventFolder(ctx, event);
        ensureMembersSheet(ctx, ctx.db.events.get(event.id)!, folderId);
        ensureEventSheets(ctx, ctx.db.events.get(event.id)!);
        logAudit(ctx, auth?.claims.sub || 'system', 'events.recreateFolder', event.id, folderId);
        return ctx.db.events.get(event.id);
      }
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
