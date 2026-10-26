import { Route } from '../router';
import { AppError } from '../errors';
import { EventItem, EventListItem, EventStatus, EventType } from '@umdsc/shared';
import { Ctx } from '../ports';
import { validateEventFields, eventNameKey, classesOutsideRange, todayKL } from '../logic/events';
import { isDue } from '../logic/retention';
import { validateLink } from '../logic/linkValidation';
import { logAudit } from '../logic/audit';
import { previewSource, openSourceTab } from './eventSource';
import { ensureEventFolder, ensureMembersSheet, ensureEventSheets, saveEventFields, eventYear, refileEventYear, renameStyleVideoFolders } from './eventSheets';
import { getEvent, readEventMembers } from './eventMembers';
import { importEventMembers, sourceUnchanged, checkAndNotifySlotCapacities } from './eventImport';
import { syncGoogleFormSlotChoices } from './formGating';
import { extractGoogleFormId } from '../logic/googleForm';

export { extractGoogleFormId };
import { withScriptLock } from '../db/lock';
import { assertSchemaReady } from './reset';
import { cleanStyleInstructors, firstInstructor, assertClassInstructor } from './styleInstructors';

const AUTO_SYNC_SECONDS = 600;
const SYNC_NOW_SECONDS = 60;

export const RETENTION_NO_SYNC =
  'This event ended more than 3 years ago, so it no longer syncs (data retention). Archive it when you are done.';

/** Old events stop syncing, so re-reading their form can never undo a retention wipe. */
export function pastRetention(event: EventItem, today: string): boolean {
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
      id: m.id,
      matricKey: m.matricKey,
      nameKey: m.nameKey,
      fullName: m.fullName,
      eventIds: m.eventIds,
      lastEventEnd: m.eventIds.map(id => endDates.get(id) || '').reduce((a, b) => (b > a ? b : a), '')
    }));
  if (rows.length > 0) {
    ctx.db.memberIndex.upsertMany('id', rows, 'system', ctx.now());
  }
}

interface SessionInput {
  styleId: string;
  seq: number;
  date: string;
  start: string;
  end: string;
  instructorId?: string;
  venue?: string;
}

export function getEventRoutes(): Record<string, Route> {
  return {
    'events.list': {
      perm: 'signedIn',
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

    // Read-only check of where a dancer's data really is: every tab of the form's spreadsheet, the tab a
    // sync opens, and the rows mentioning `find` there, in the event's Members sheet and in sign-in.
    'events.inspectSource': {
      perm: 'settings.edit',
      write: false,
      handler: (ctx, auth, payload: any) => {
        const event = getEvent(ctx, String(payload?.id || ''));
        const find = String(payload?.find || '').trim().toLowerCase();
        if (!find) throw new AppError('VALIDATION', 'find is required');
        const hits = (rows: string[][], skipHeader: boolean) =>
          rows
            .map((r, i) => ({ row: i + 1, cells: r }))
            .filter(({ row, cells }) => !(skipHeader && row === 1) && cells.some(c => String(c).toLowerCase().includes(find)))
            .map(({ row, cells }) => ({ row, cells: cells.slice(0, 13) }));

        const source = ctx.drive.openSpreadsheet(event.sourceSheetId);
        const { tab, sheet } = openSourceTab(ctx, event.sourceSheetId, event.sourceTab);
        const members = event.membersSpreadsheetId
          ? ctx.drive.openSpreadsheet(event.membersSpreadsheetId).sheet('Members')
          : null;
        return {
          sourceTab: event.sourceTab,
          openedTab: { asked: tab, actualName: sheet.name },
          sheets: source.listSheets ? source.listSheets() : [],
          sourceMatches: hits(sheet.getDisplayValues(), true),
          membersMatches: members ? hits(members.getDisplayValues(), true) : [],
          signIn: ctx.db.memberIndex
            .find(m => m.fullName.toLowerCase().includes(find) || m.matricKey.toLowerCase().includes(find))
            .map(m => ({ matricKey: m.matricKey, fullName: m.fullName, active: m.active, eventIds: m.eventIds, eventStyles: m.eventStyles }))
        };
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

        const styleInstructors =
          payload.styleInstructors !== undefined
            ? cleanStyleInstructors(ctx, next.styleIds, payload.styleInstructors, existing.styleInstructors || {})
            : Object.fromEntries(
                Object.entries(existing.styleInstructors || {}).filter(([styleId]) => next.styleIds.includes(styleId))
              );

        const patch: any = { ...next, styleInstructors, nameKey: eventNameKey(next.name) };
        if (payload.styleSlots !== undefined && typeof payload.styleSlots === 'object') {
          const slots: Record<string, number> = {};
          for (const id of next.styleIds) {
            const val = Number(payload.styleSlots[id]);
            if (val && !isNaN(val) && val > 0) slots[id] = val;
          }
          patch.styleSlots = slots;
          patch.styleSlotsJson = JSON.stringify(slots);
        }
        if (payload.styleFormLabels !== undefined && typeof payload.styleFormLabels === 'object') {
          const labels: Record<string, string> = {};
          for (const id of next.styleIds) {
            const val = String(payload.styleFormLabels[id] || '').trim();
            if (val) labels[id] = val;
          }
          patch.styleFormLabels = labels;
          patch.styleFormLabelsJson = JSON.stringify(labels);
        }
        if (payload.columnMap !== undefined) patch.columnMapJson = JSON.stringify(payload.columnMap || {});
        if (payload.classIndex !== undefined) patch.classIndex = Number(payload.classIndex);
        if (payload.formUrl !== undefined) {
          const formUrl = String(payload.formUrl || '').trim();
          patch.formUrl = formUrl;
          patch.formId = extractGoogleFormId(formUrl);
        }
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

        // Year first: it finds the style video folders by the old name
        if (eventYear(ctx, updated) !== eventYear(ctx, existing)) {
          refileEventYear(ctx, existing, updated);
        }
        if (next.name !== existing.name) {
          if (existing.folderId && ctx.drive.info(existing.folderId).exists) {
            ctx.drive.renameFolder(existing.folderId, next.name);
          }
          if (existing.videoFolderId && ctx.drive.info(existing.videoFolderId).exists) {
            ctx.drive.renameFolder(existing.videoFolderId, next.name);
          }
          renameStyleVideoFolders(ctx, existing, updated.startDate, next.name);
        }
        if (next.endDate !== existing.endDate) {
          recalculateLastEventEnd(ctx, updated);
        }
        if (next.styleIds.some((s: string) => !existing.styleIds.includes(s))) {
          ensureEventSheets(ctx, updated);
        }

        // Check slot capacities immediately upon saving or updating styleSlots or formUrl
        if (payload.styleSlots !== undefined || (payload.formUrl !== undefined && patch.formId)) {
          checkAndNotifySlotCapacities(ctx, updated);
        }

        logAudit(ctx, actor, 'events.update', updated.id, updated.name);
        return ctx.db.events.get(updated.id);
      }
    },

    'events.delete': {
      perm: 'members.import',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { id } = payload || {};
        if (!id) throw new AppError('VALIDATION', 'id is required');
        const event = getEvent(ctx, String(id));
        const actor = auth?.claims.sub || 'system';

        // 1. Trash linked Google Drive folders and files
        if (event.folderId) {
          try {
            ctx.drive.trashFolder(event.folderId);
          } catch (e) {
            console.warn(`[events.delete] Failed to trash folder ${event.folderId}:`, e);
          }
        }
        if (event.videoFolderId && event.videoFolderId !== event.folderId) {
          try {
            ctx.drive.trashFolder(event.videoFolderId);
          } catch (e) {
            console.warn(`[events.delete] Failed to trash videoFolder ${event.videoFolderId}:`, e);
          }
        }
        if (event.membersSpreadsheetId) {
          try {
            ctx.drive.deleteFile(event.membersSpreadsheetId);
          } catch (e) {
            console.warn(`[events.delete] Failed to delete members spreadsheet ${event.membersSpreadsheetId}:`, e);
          }
        }

        // 2. Attendance sheets
        const attSheets = ctx.db.attendanceSheets.find(a => a.eventId === event.id);
        for (const sheet of attSheets) {
          if (sheet.spreadsheetId) {
            try {
              ctx.drive.deleteFile(sheet.spreadsheetId);
            } catch (e) {
              console.warn(`[events.delete] Failed to delete attendance sheet spreadsheet ${sheet.spreadsheetId}:`, e);
            }
          }
          if (sheet.active) {
            ctx.db.attendanceSheets.deactivate(sheet.id, sheet.version, actor, ctx.now());
          }
        }

        // 3. Class sessions
        const sessions = ctx.db.sessions.find(s => s.eventId === event.id && s.active);
        for (const s of sessions) {
          ctx.db.sessions.deactivate(s.id, s.version, actor, ctx.now());
        }

        // 4. Clean up memberIndex event links
        const members = ctx.db.memberIndex.find(m => m.active && m.eventIds.includes(event.id));
        for (const m of members) {
          const nextEventIds = m.eventIds.filter(eId => eId !== event.id);
          ctx.db.memberIndex.update(m.id, m.version, { eventIds: nextEventIds }, actor, ctx.now());
        }

        // 5. Deactivate associated videos and music records
        const videos = ctx.db.videos.find(v => v.eventId === event.id && v.active);
        for (const v of videos) {
          ctx.db.videos.deactivate(v.id, v.version, actor, ctx.now());
        }
        const musics = ctx.db.music.find(m => m.eventId === event.id && m.active);
        for (const m of musics) {
          ctx.db.music.deactivate(m.id, m.version, actor, ctx.now());
        }

        // 6. Deactivate Event
        ctx.db.events.deactivate(event.id, event.version, actor, ctx.now());

        logAudit(ctx, actor, 'events.delete', event.id, `Permanently deleted event ${event.name}`);
        return { success: true, id: event.id };
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
              // Check if any unnotified style has reached slot capacity
              const slotCap = event.styleSlots || (event.styleSlotsJson ? JSON.parse(event.styleSlotsJson) : {});
              const hasUnnotifiedCaps = (event.styleIds || []).some(
                sid => Number(slotCap[sid]) > 0 && !(event.notifiedFullStyles || []).includes(sid)
              );
              if (hasUnnotifiedCaps) {
                withScriptLock(ctx.lock, () => {
                  ctx.db.reload();
                  const fresh = ctx.db.events.get(event.id);
                  if (fresh && fresh.active && fresh.status === 'active') {
                    checkAndNotifySlotCapacities(ctx, fresh);
                  }
                });
              }
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
              const res = importEventMembers(ctx, fresh, { full: false, purgeRemoved: true });
              if (res.changed || fresh.memberCount !== res.memberCount) {
                result.changed.push(event.id);
              }
            });
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
        const force = Boolean(payload?.force);
        const forceKey = `sync:force:${event.id}`;
        const recent = ctx.cache.get(forceKey);
        if (!force && recent !== null) {
          return { ...JSON.parse(recent), message: 'Synced less than a minute ago' };
        }

        const purgeRemoved = Boolean(payload?.purgeRemoved);
        const result = importEventMembers(ctx, event, { full: true, purgeRemoved, force });
        ctx.cache.put(forceKey, JSON.stringify(result), SYNC_NOW_SECONDS);
        if (
          result.changed ||
          result.added > 0 ||
          result.updated > 0 ||
          result.flaggedRemoved > 0 ||
          result.purged > 0 ||
          result.corrected > 0 ||
          event.memberCount !== result.memberCount
        ) {
          ctx.props.set('DATA_VERSION', String(Number(ctx.props.get('DATA_VERSION') || 1) + 1));
        }
        logAudit(ctx, auth?.claims.sub || 'system', 'events.sync', event.id, `+${result.added} ~${result.updated}`);
        return result;
      }
    },

    'events.syncFormSlots': {
      perm: 'members.import',
      write: true,
      handler: (ctx, auth, payload: any) => {
        const event = getEvent(ctx, String(payload?.id || ''));
        const result = syncGoogleFormSlotChoices(ctx, event);
        if (result.discoveredStyleIds && result.discoveredStyleIds.length > 0) {
          ctx.props.set('DATA_VERSION', String(Number(ctx.props.get('DATA_VERSION') || 1) + 1));
        }
        logAudit(ctx, auth?.claims.sub || 'system', 'events.syncFormSlots', event.id, JSON.stringify(result));
        return {
          ...result,
          event: ctx.db.events.get(event.id)
        };
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
        // The current website sends no lists: fill each from the active instructors who teach the style
        // (a style nobody teaches gets an empty list) instead of requiring a choice.
        const styleInstructors =
          payload?.styleInstructors === undefined
            ? Object.fromEntries(
                styleIds.map(styleId => [
                  styleId,
                  ctx.db.instructors.find(i => i.active && (i.styleIds || []).includes(styleId)).map(i => i.id)
                ])
              )
            : cleanStyleInstructors(ctx, styleIds, payload.styleInstructors);
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
          assertClassInstructor(ctx, { styleInstructors } as EventItem, s.styleId, s.instructorId || '');
        }

        if (payload?.validateStyleClasses) {
          const coveredStyles = new Set(sessions.map(s => s.styleId));
          const missingStyles = styleIds.filter(id => !coveredStyles.has(id));
          if (missingStyles.length > 0) {
            const styleName = (styleId: string) => ctx.db.styles.find(s => s.id === styleId)[0]?.name || styleId;
            throw new AppError(
              'VALIDATION',
              `Each selected dance style must have at least 1 class. Missing: ${missingStyles.map(styleName).join(', ')}`
            );
          }
        }
        if (!ctx.db.settings.find(s => s.key === 'defaultAttendanceFolderId' && s.active)[0]?.value) {
          throw new AppError('VALIDATION', 'Set the attendance master folder on the Attendance page first');
        }

        const styleSlots: Record<string, number> = {};
        if (payload?.styleSlots && typeof payload.styleSlots === 'object') {
          for (const id of styleIds) {
            const val = Number(payload.styleSlots[id]);
            if (val && !isNaN(val) && val > 0) {
              styleSlots[id] = val;
            }
          }
        }

        const styleFormLabels: Record<string, string> = {};
        if (payload?.styleFormLabels && typeof payload.styleFormLabels === 'object') {
          for (const id of styleIds) {
            const val = String(payload.styleFormLabels[id] || '').trim();
            if (val) {
              styleFormLabels[id] = val;
            }
          }
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
            formUrl: payload?.formUrl ? String(payload.formUrl).trim() : '',
            formId: extractGoogleFormId(payload?.formUrl),
            styleInstructors,
            styleSlots,
            styleSlotsJson: JSON.stringify(styleSlots),
            styleFormLabels,
            styleFormLabelsJson: JSON.stringify(styleFormLabels),
            notifiedFullStyles: [],
            notifiedFullStylesJson: '[]',
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
          const style = ctx.db.styles.find(st => st.id === s.styleId && st.active)[0];
          ctx.db.sessions.insert(
            {
              eventId: created.id,
              styleId: s.styleId,
              seq: Number(s.seq),
              date: s.date,
              start: s.start,
              end: s.end,
              instructorId: s.instructorId || firstInstructor(created, s.styleId),
              venue: s.venue || style?.defaultVenue || '',
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
