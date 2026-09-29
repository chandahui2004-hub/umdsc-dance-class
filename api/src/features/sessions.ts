import { Route } from '../router';
import { AppError } from '../errors';
import { Ctx } from '../ports';
import { ClassSession } from '@umdsc/shared';
import { generateMonthSessions } from '../logic/sessionGen';
import { logAudit } from '../logic/audit';

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

export function getSessionRoutes(): Record<string, Route> {
  return {
    'sessions.list': {
      perm: 'calendar.view',
      write: false,
      handler: (ctx, auth, payload: any) => {
        const month = String(payload?.month || '').trim();
        if (!month) {
          throw new AppError('VALIDATION', 'month is required');
        }

        let sessions = ctx.db.sessions.find(s => s.month === month && s.active);

        if (auth?.claims.role === 'dancer') {
          const matricKey = auth.claims.sub.replace(/^M-/, '');
          const mi = ctx.db.memberIndex.find(m => m.matricKey === matricKey && m.active)[0];
          if (!mi || !mi.months || !mi.months.includes(month)) {
            return [];
          }

          let dancerStyleIds: string[] | null = null;

          // 1. Check memberMonths -> members sheet
          const mm = ctx.db.memberMonths.find(m => m.month === month && m.active)[0];
          if (mm && mm.membersSpreadsheetId) {
            try {
              const ss = ctx.drive.openSpreadsheet(mm.membersSpreadsheetId);
              const sheet = ss.getSheet('Members');
              if (sheet) {
                const rows = sheet.getDataRange();
                const headers = rows[0] || [];
                const matricIdx = headers.indexOf('matricKey');
                const stylesIdx = headers.indexOf('styleIds');
                if (matricIdx !== -1 && stylesIdx !== -1) {
                  for (let i = 1; i < rows.length; i++) {
                    if (rows[i][matricIdx] === matricKey) {
                      dancerStyleIds = String(rows[i][stylesIdx] || '')
                        .split(',')
                        .map(s => s.trim())
                        .filter(Boolean);
                      break;
                    }
                  }
                }
              }
            } catch {
              // ignore
            }
          }

          // 2. Check memberRoles
          if (!dancerStyleIds) {
            const mrList = ctx.db.memberRoles.find(m => m.matricKey === matricKey && m.active);
            const extraStyles = mrList.flatMap(m => m.styleIds || []);
            if (extraStyles.length > 0) {
              dancerStyleIds = extraStyles;
            }
          }

          // 3. Permission scope
          const calPerm = auth.claims.perms['calendar.view'];
          if (Array.isArray(calPerm)) {
            dancerStyleIds = dancerStyleIds ? dancerStyleIds.filter(id => calPerm.includes(id)) : calPerm;
          }

          if (dancerStyleIds) {
            sessions = sessions.filter(s => dancerStyleIds!.includes(s.styleId));
          }
        }

        return sessions;
      }
    },

    'sessions.generateMonth': {
      perm: 'sessions.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const month = String(payload?.month || '').trim();
        if (!month) {
          throw new AppError('VALIDATION', 'month is required');
        }

        const requestedStyleIds: string[] = Array.isArray(payload?.styleIds) ? payload.styleIds : [];
        let styles = ctx.db.styles.find(s => s.active);
        if (requestedStyleIds.length > 0) {
          styles = styles.filter(s => requestedStyleIds.includes(s.id));
        }

        const actor = auth?.claims.sub || 'system';
        const generated: ClassSession[] = [];
        const extraWeekFlags: Record<string, boolean> = {};

        for (const style of styles) {
          // Skip styles that already have active sessions that month
          const existing = ctx.db.sessions.find(s => s.month === month && s.styleId === style.id && s.active);
          if (existing.length > 0) {
            continue;
          }

          const { sessions, extraWeekFlag } = generateMonthSessions(month, style);
          extraWeekFlags[style.id] = extraWeekFlag;

          for (const s of sessions) {
            const inserted = ctx.db.sessions.insert(s, actor, ctx.now());
            generated.push(inserted);
            notifySessionChanged(ctx, inserted);
          }
        }

        logAudit(ctx, actor, 'sessions.generateMonth', month, `Generated ${generated.length} sessions`);
        return { generated, extraWeekFlags };
      }
    },

    'sessions.create': {
      perm: 'sessions.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const {
          month,
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

        if (!month || !styleId || !seq || !date || !start || !end) {
          throw new AppError('VALIDATION', 'month, styleId, seq, date, start, and end are required');
        }

        const actor = auth?.claims.sub || 'system';
        const inserted = ctx.db.sessions.insert(
          {
            month,
            styleId,
            seq: Number(seq),
            date,
            start,
            end,
            instructorId,
            venue,
            status,
            note
          },
          actor,
          ctx.now()
        );

        notifySessionChanged(ctx, inserted);
        logAudit(ctx, actor, 'sessions.create', inserted.id, `${month} ${styleId} C${seq}`);
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
    }
  };
}
