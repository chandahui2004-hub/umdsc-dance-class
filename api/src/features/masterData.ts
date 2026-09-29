import { Route } from '../router';
import { AppError } from '../errors';
import { Table } from '../db/table';
import { logAudit } from '../logic/audit';
import { validateLink } from '../logic/linkValidation';
import { PermissionCode } from '@umdsc/shared';

export function crudRoutes<T extends { id: string; version: number; active: boolean }>(opts: {
  prefix: string;
  getTable: (ctx: any) => Table<T>;
  perm: PermissionCode;
  listPerm?: PermissionCode | 'signedIn' | 'public';
  processPayload?: (ctx: any, payload: any, isUpdate: boolean) => any;
  getTargetName?: (row: any) => string;
}): Record<string, Route> {
  const { prefix, getTable, perm, listPerm = perm, processPayload, getTargetName = (r) => r.name || r.id } = opts;

  return {
    [`${prefix}.list`]: {
      perm: listPerm,
      write: false,
      handler: (ctx) => {
        return getTable(ctx).find(r => r.active);
      }
    },

    [`${prefix}.create`]: {
      perm,
      write: true,
      bumpsData: true,
      handler: (ctx, auth, rawPayload: any) => {
        const actor = auth?.claims.sub || 'system';
        const processed = processPayload ? processPayload(ctx, { ...rawPayload }, false) : { ...rawPayload };
        const inserted = getTable(ctx).insert(processed, actor, ctx.now());
        logAudit(ctx, actor, `${prefix}.create`, getTargetName(inserted), JSON.stringify(inserted));
        return inserted;
      }
    },

    [`${prefix}.update`]: {
      perm,
      write: true,
      bumpsData: true,
      handler: (ctx, auth, rawPayload: any) => {
        const { id, version, ...rest } = rawPayload || {};
        if (!id || version === undefined) {
          throw new AppError('VALIDATION', 'id and version are required');
        }

        const table = getTable(ctx);
        const existing = table.find(r => r.id === id && r.active)[0];
        if (!existing) {
          throw new AppError('NOT_FOUND', `${prefix} not found: ${id}`);
        }

        if (existing.version !== Number(version)) {
          throw new AppError('VERSION_CONFLICT', `${prefix} has been modified by another user`, false, existing);
        }

        const actor = auth?.claims.sub || 'system';
        const processed = processPayload ? processPayload(ctx, rest, true) : rest;
        const updated = table.update(id, version, processed, actor, ctx.now());
        logAudit(ctx, actor, `${prefix}.update`, getTargetName(updated), JSON.stringify(updated));
        return updated;
      }
    },

    [`${prefix}.deactivate`]: {
      perm,
      write: true,
      bumpsData: true,
      handler: (ctx, auth, rawPayload: any) => {
        const { id, version } = rawPayload || {};
        if (!id || version === undefined) {
          throw new AppError('VALIDATION', 'id and version are required');
        }

        const table = getTable(ctx);
        const existing = table.find(r => r.id === id && r.active)[0];
        if (!existing) {
          throw new AppError('NOT_FOUND', `${prefix} not found: ${id}`);
        }

        if (existing.version !== Number(version)) {
          throw new AppError('VERSION_CONFLICT', `${prefix} has been modified by another user`, false, existing);
        }

        const actor = auth?.claims.sub || 'system';
        table.deactivate(id, Number(version), actor, ctx.now());
        logAudit(ctx, actor, `${prefix}.deactivate`, getTargetName(existing));
        return { success: true };
      }
    }
  };
}

export function getMasterDataRoutes(): Record<string, Route> {
  const stylesRoutes = crudRoutes({
    prefix: 'styles',
    getTable: (ctx) => ctx.db.styles,
    perm: 'styles.edit',
    listPerm: 'signedIn',
    processPayload: (ctx, payload) => {
      if (payload.videoFolderUrl) {
        payload.videoFolderId = validateLink(ctx, payload.videoFolderUrl, 'folder');
        delete payload.videoFolderUrl;
      }
      if (payload.attendanceFolderUrl) {
        payload.attendanceFolderId = validateLink(ctx, payload.attendanceFolderUrl, 'folder');
        delete payload.attendanceFolderUrl;
      }
      return payload;
    }
  });

  const instructorsRoutes = crudRoutes({
    prefix: 'instructors',
    getTable: (ctx) => ctx.db.instructors,
    perm: 'instructors.edit',
    listPerm: 'instructors.edit'
  });

  return {
    ...stylesRoutes,
    ...instructorsRoutes
  };
}
