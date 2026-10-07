import { Route } from '../router';
import { AppError } from '../errors';
import { Ctx } from '../ports';
import { ClassSession, EventItem, TodayClass } from '@umdsc/shared';
import { logAudit } from '../logic/audit';
import { todayKL } from '../logic/events';
import { getEvent, dancerStylesInEvent } from './eventMembers';
import { assertClassInstructor, firstInstructor } from './styleInstructors';

type SessionListener = (ctx: Ctx, s: ClassSession) => void;
const sessionListeners: SessionListener[] = [];

export function onSessionChanged(fn: SessionListener): void {
  sessionListeners.push(fn);
}

function notifySessionChanged(ctx: Ctx, s: ClassSession): void {
  for (const fn of sessionListeners) {
    try {
      fn(ctx, s);
    } catch (err) {
      console.error('Error in session listener:', err);
    }
  }
}

function assertDateInEvent(event: EventItem, date: string): void {
  if (!date || date < event.startDate || date > event.endDate) {
    throw new AppError(
      'VALIDATION',
      `Class date must be inside the event (${event.startDate} to ${event.endDate})`
    );
  }
}

export function getSessionRoutes(): Record<string, Route> {
  return {
    'sessions.list': {
      perm: 'calendar.view',
      write: false,
      handler: (ctx, auth, payload: any) => {
        const eventId = String(payload?.eventId || '').trim();
        const isAll = !eventId || eventId === 'ALL';
        const styleId = String(payload?.styleId || '').trim();

        let sessions = ctx.db.sessions.find(
          s => s.active && (isAll || s.eventId === eventId) && (!styleId || s.styleId === styleId)
        );

        if (auth?.claims.role === 'dancer') {
          const matricKey = auth.claims.sub.replace(/^M-/, '');
          const mi = ctx.db.memberIndex.find(m => m.matricKey === matricKey && m.active)[0];
          if (!mi) return [];
          const targetEventIds = isAll ? mi.eventIds : (mi.eventIds.includes(eventId) ? [eventId] : []);
          if (targetEventIds.length === 0) return [];

          sessions = sessions.filter(s => targetEventIds.includes(s.eventId));

          const eventMap = new Map<string, string[]>();
          const calPerm = auth.claims.perms['calendar.view'];

          sessions = sessions.filter(s => {
            let allowed = eventMap.get(s.eventId);
            if (!allowed) {
              const ev = ctx.db.events.find(e => e.id === s.eventId && e.active)[0];
              allowed = ev ? dancerStylesInEvent(ctx, ev, matricKey) : [];
              if (Array.isArray(calPerm)) {
                allowed = allowed.filter(id => calPerm.includes(id));
              }
              eventMap.set(s.eventId, allowed);
            }
            return allowed.includes(s.styleId);
          });
        }

        return sessions;
      }
    },

    'sessions.today': {
      perm: 'calendar.view',
      write: false,
      handler: (ctx) => {
        const today = todayKL(ctx.now());
        const activeEvents = new Map(
          ctx.db.events.find(e => e.active && e.status === 'active').map(e => [e.id, e])
        );
        const result: TodayClass[] = ctx.db.sessions
          .find(s => s.active && s.date === today && activeEvents.has(s.eventId))
          .map(s => ({ ...s, eventName: activeEvents.get(s.eventId)!.name }));
        return result.sort((a, b) => a.start.localeCompare(b.start));
      }
    },

    'sessions.create': {
      perm: 'sessions.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const {
          eventId,
          styleId,
          seq,
          date,
          start,
          end,
          instructorId = '',
          venue = '',
          status = 'scheduled',
          note = ''
        } = payload || {};

        if (!eventId || !styleId || !seq || !date || !start || !end) {
          throw new AppError('VALIDATION', 'eventId, styleId, seq, date, start, and end are required');
        }
        const event = getEvent(ctx, eventId);
        assertDateInEvent(event, date);

        const actor = auth?.claims.sub || 'system';
        const style = ctx.db.styles.find(st => st.id === styleId && st.active)[0];
        const finalInstructorId = instructorId || firstInstructor(event, styleId);
        assertClassInstructor(ctx, event, styleId, finalInstructorId);
        const finalVenue = venue || style?.defaultVenue || '';
        const inserted = ctx.db.sessions.insert(
          { eventId, styleId, seq: Number(seq), date, start, end, instructorId: finalInstructorId, venue: finalVenue, status, note },
          actor,
          ctx.now()
        );

        notifySessionChanged(ctx, inserted);
        logAudit(ctx, actor, 'sessions.create', inserted.id, `${eventId} ${styleId} C${seq}`);
        return inserted;
      }
    },

    'sessions.update': {
      perm: 'sessions.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { id, version, date, start, end, instructorId, venue, status, note } = payload || {};
        if (!id || version === undefined) {
          throw new AppError('VALIDATION', 'id and version are required');
        }

        const existing = ctx.db.sessions.find(s => s.id === id && s.active)[0];
        if (!existing) {
          throw new AppError('NOT_FOUND', `Session not found: ${id}`);
        }

        if (existing.version !== Number(version)) {
          throw new AppError('VERSION_CONFLICT', 'Session has been modified by another user', false, existing);
        }

        if (date !== undefined && date !== existing.date) {
          assertDateInEvent(getEvent(ctx, existing.eventId), date);
        }
        if (instructorId !== undefined) {
          assertClassInstructor(ctx, getEvent(ctx, existing.eventId), existing.styleId, instructorId, existing.instructorId);
        }

        const actor = auth?.claims.sub || 'system';
        const patch: any = {};
        if (date !== undefined) patch.date = date;
        if (start !== undefined) patch.start = start;
        if (end !== undefined) patch.end = end;
        if (instructorId !== undefined) patch.instructorId = instructorId;
        if (venue !== undefined) patch.venue = venue;
        if (status !== undefined) patch.status = status;
        if (note !== undefined) patch.note = note;

        const updated = ctx.db.sessions.update(id, version, patch, actor, ctx.now());
        notifySessionChanged(ctx, updated);
        logAudit(ctx, actor, 'sessions.update', id, `Updated session C${existing.seq}`);
        return updated;
      }
    },

    'sessions.cancel': {
      perm: 'sessions.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { id, version } = payload || {};
        if (!id || version === undefined) {
          throw new AppError('VALIDATION', 'id and version are required');
        }

        const existing = ctx.db.sessions.find(s => s.id === id && s.active)[0];
        if (!existing) {
          throw new AppError('NOT_FOUND', `Session not found: ${id}`);
        }

        if (existing.version !== Number(version)) {
          throw new AppError('VERSION_CONFLICT', 'Session has been modified by another user', false, existing);
        }

        const actor = auth?.claims.sub || 'system';
        const updated = ctx.db.sessions.update(id, version, { status: 'cancelled' }, actor, ctx.now());
        notifySessionChanged(ctx, updated);
        logAudit(ctx, actor, 'sessions.cancel', id, `Cancelled session C${existing.seq}`);
        return updated;
      }
    },

    // Removes a class created by mistake. Unlike cancel (which keeps the class
    // greyed out on the schedule), a deleted class disappears from every page.
    // The row stays in the sheet with active=FALSE, and any ticks in its
    // attendance column are kept.
    'sessions.delete': {
      perm: 'sessions.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { id, version } = payload || {};
        if (!id || version === undefined) {
          throw new AppError('VALIDATION', 'id and version are required');
        }

        const existing = ctx.db.sessions.find(s => s.id === id && s.active)[0];
        if (!existing) {
          throw new AppError('NOT_FOUND', `Session not found: ${id}`);
        }

        if (existing.version !== Number(version)) {
          throw new AppError('VERSION_CONFLICT', 'Session has been modified by another user', false, existing);
        }

        const actor = auth?.claims.sub || 'system';
        ctx.db.sessions.deactivate(id, Number(version), actor, ctx.now());
        logAudit(ctx, actor, 'sessions.delete', id, `Deleted session ${existing.date} C${existing.seq}`);
        return { deleted: true };
      }
    },

    'sessions.batchUpsert': {
      perm: 'sessions.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { sessions } = payload || {};
        if (!Array.isArray(sessions)) {
          throw new AppError('VALIDATION', 'sessions array is required');
        }

        // Classes named by id in this batch are never matched by seq for another entry
        const claimedIds = new Set(sessions.map((s: any) => s?.id).filter(Boolean));
        const findExisting = (s: any): ClassSession | undefined =>
          s.id
            ? ctx.db.sessions.find(x => x.id === s.id && x.active)[0]
            : ctx.db.sessions.find(
                x =>
                  x.eventId === s.eventId &&
                  x.styleId === s.styleId &&
                  x.seq === Number(s.seq) &&
                  x.active &&
                  !claimedIds.has(x.id)
              )[0];

        // Validate everything before writing anything
        const events = new Map<string, EventItem>();
        for (const s of sessions) {
          if (!s?.eventId || !s.styleId || !s.seq || !s.date || !s.start || !s.end) {
            throw new AppError('VALIDATION', 'Each class needs eventId, styleId, seq, date, start and end');
          }
          if (!events.has(s.eventId)) events.set(s.eventId, getEvent(ctx, s.eventId));
          const event = events.get(s.eventId)!;
          assertDateInEvent(event, s.date);
          if (s.instructorId !== undefined) {
            assertClassInstructor(ctx, event, s.styleId, s.instructorId, findExisting(s)?.instructorId);
          }
        }

        const actor = auth?.claims?.sub || 'system';
        const results: ClassSession[] = [];
        const OPTIONAL = ['instructorId', 'venue', 'status', 'note'] as const;

        for (const s of sessions) {
          const { eventId, styleId, seq, date, start, end } = s;

          const existing = findExisting(s);

          let saved: ClassSession;
          if (existing) {
            // Only the fields the caller sent change; instructor, note etc. are kept otherwise
            const patch: any = { seq: Number(seq), date, start, end };
            for (const key of OPTIONAL) if (s[key] !== undefined) patch[key] = s[key];
            saved = ctx.db.sessions.update(existing.id, existing.version, patch, actor, ctx.now());
          } else {
            saved = ctx.db.sessions.insert(
              {
                eventId, styleId, seq: Number(seq), date, start, end,
                instructorId: s.instructorId || firstInstructor(events.get(eventId)!, styleId), venue: s.venue || '', status: s.status || 'scheduled', note: s.note || ''
              },
              actor,
              ctx.now()
            );
          }
          notifySessionChanged(ctx, saved);
          results.push(saved);
        }

        logAudit(ctx, actor, 'sessions.batchUpsert', '', `Upserted ${results.length} sessions`);
        return { sessions: results };
      }
    }
  };
}
