import { Route } from '../router';
import { AppError } from '../errors';
import { validateLink } from '../logic/linkValidation';
import { logAudit } from '../logic/audit';

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
        const url = String(payload?.url || '').trim();

        if (!key || !url) {
          throw new AppError('VALIDATION', 'key and url are required');
        }

        const expectedKind = (key.toLowerCase().includes('spreadsheet') || key.toLowerCase().includes('sheet'))
          ? 'spreadsheet'
          : 'folder';

        const newId = validateLink(ctx, url, expectedKind);

        const existing = ctx.db.settings.find(s => s.key === key && s.active)[0];
        const oldVal = existing ? existing.value : '';
        const actor = auth?.claims.sub || 'system';

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

        return { key, value: newId };
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
    }
  };
}
