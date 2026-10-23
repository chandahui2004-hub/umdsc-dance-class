import { Route } from '../router';
import { AppError } from '../errors';
import { validateLink } from '../logic/linkValidation';
import { logAudit } from '../logic/audit';
import { moveEventFolders, moveStyleVideoFoldersIntoYears } from './eventSheets';

const MASTER_FOLDER_KINDS: Record<string, 'attendance' | 'video'> = {
  defaultAttendanceFolderId: 'attendance',
  defaultVideoFolderId: 'video'
};

export function getSettingsRoutes(): Record<string, Route> {
  return {
    'settings.get': {
      perm: 'settings.edit',
      write: false,
      handler: (ctx) => {
        const rows = ctx.db.settings.find(s => s.active);
        const settings: Record<string, string> = {
          clubEmail: ctx.clubEmail
        };
        for (const row of rows) {
          settings[row.key] = row.value;
        }
        return settings;
      }
    },

    'settings.setLink': {
      perm: 'settings.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const key = String(payload?.key || '').trim();
        const url = String(payload?.url || payload?.value || payload?.urlOrId || '').trim();

        if (!key || !url) {
          throw new AppError('VALIDATION', 'key and url are required');
        }

        const expectedKind = (key.toLowerCase().includes('spreadsheet') || key.toLowerCase().includes('sheet'))
          ? 'spreadsheet'
          : 'folder';

        const newId = validateLink(ctx, url, expectedKind);

        const existing = ctx.db.settings.find(s => s.key === key && s.active)[0];
        const oldVal = existing ? existing.value : '';
        const actor = auth?.claims?.sub || 'system';

        if (existing) {
          ctx.db.settings.update(existing.id, existing.version, { value: newId }, actor, ctx.now());
        } else {
          ctx.db.settings.insert({ key, value: newId }, actor, ctx.now());
        }

        ctx.db.linkHistory.insert(
          {
            key,
            oldValue: oldVal,
            newValue: newId,
            changedBy: actor,
            changedAt: ctx.now().toISOString()
          },
          actor,
          ctx.now()
        );

        logAudit(ctx, actor, 'settings.setLink', key, JSON.stringify({ oldValue: oldVal, newValue: newId }));

        const kind = MASTER_FOLDER_KINDS[key];
        if (kind) {
          return { key, value: newId, ...moveEventFolders(ctx, kind, newId) };
        }
        return { key, value: newId };
      }
    },

    'settings.set': {
      perm: 'settings.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const key = String(payload?.key || '').trim();
        const value = String(payload?.value ?? '').trim();
        if (!key) {
          throw new AppError('VALIDATION', 'key is required');
        }
        const existing = ctx.db.settings.find(s => s.key === key && s.active)[0];
        const actor = auth?.claims?.sub || 'system';
        if (existing) {
          ctx.db.settings.update(existing.id, existing.version, { value }, actor, ctx.now());
        } else {
          ctx.db.settings.insert({ key, value }, actor, ctx.now());
        }
        logAudit(ctx, actor, 'settings.set', key, value);
        return { key, value };
      }
    },

    'settings.update': {
      perm: 'settings.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const setLinkRoute = getSettingsRoutes()['settings.setLink'];
        return setLinkRoute.handler(ctx, auth, payload);
      }
    },

    // One-off tidy-up: files event folders made before year folders existed under their year.
    'settings.organizeFoldersByYear': {
      perm: 'settings.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth) => {
        const attendanceMaster = ctx.db.settings.find(s => s.key === 'defaultAttendanceFolderId' && s.active)[0]?.value;
        const attendance = attendanceMaster ? moveEventFolders(ctx, 'attendance', attendanceMaster) : null;
        const videos = moveStyleVideoFoldersIntoYears(ctx);
        logAudit(ctx, auth?.claims?.sub || 'system', 'settings.organizeFoldersByYear', '', JSON.stringify({ attendance, videos }));
        return { attendance, videos };
      }
    },

    'links.history': {
      perm: 'settings.edit',
      write: false,
      handler: (ctx, auth, payload: any) => {
        const key = payload?.key ? String(payload.key).trim() : '';
        let rows = ctx.db.linkHistory.find(h => h.active);
        if (key) {
          rows = rows.filter(h => h.key === key);
        }
        return rows.reverse();
      }
    },

    'audit.list': {
      perm: 'members.view',
      write: false,
      handler: (ctx, auth, payload: any) => {
        const limit = Number(payload?.limit) || 50;
        const all = ctx.db.auditLog.all({ includeInactive: true });
        return all.slice(-limit).reverse();
      }
    }
  };
}
