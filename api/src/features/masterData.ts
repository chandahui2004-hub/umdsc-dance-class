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
  processPayload?: (ctx: any, payload: any, isUpdate: boolean, existing?: any) => any;
  onList?: (ctx: any) => void;
  getTargetName?: (row: any) => string;
}): Record<string, Route> {
  const { prefix, getTable, perm, listPerm = perm, processPayload, onList, getTargetName = (r) => r.name || r.id } = opts;

  return {
    [`${prefix}.list`]: {
      perm: listPerm,
      write: false,
      handler: (ctx) => {
        if (onList) {
          try {
            onList(ctx);
          } catch {
            // ignore
          }
        }
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
        const processed = processPayload ? processPayload(ctx, rest, true, existing) : rest;
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
    processPayload: (ctx, payload, isUpdate, existing) => {
      let folders: { id: string; name: string; url: string; addedAt: string }[] = [];
      if (existing?.videoFoldersJson) {
        try {
          folders = JSON.parse(existing.videoFoldersJson);
        } catch {
          folders = [];
        }
      } else if (existing?.videoFolderId) {
        folders = [{
          id: existing.videoFolderId,
          name: 'Video Folder',
          url: `https://drive.google.com/drive/folders/${existing.videoFolderId}`,
          addedAt: existing.updatedAt || ctx.now().toISOString()
        }];
      }

      // Add a video folder URL
      if (payload.addVideoFolderUrl !== undefined) {
        const url = payload.addVideoFolderUrl.trim();
        if (url) {
          const folderId = validateLink(ctx, url, 'folder');
          const info = ctx.drive.info(folderId);
          const folderName = info.name || 'Video Folder';
          const existingIdx = folders.findIndex(f => f.id === folderId);
          if (existingIdx >= 0) {
            folders[existingIdx] = { ...folders[existingIdx], name: folderName, url };
          } else {
            folders.push({
              id: folderId,
              name: folderName,
              url,
              addedAt: ctx.now().toISOString()
            });
          }
          if (!existing?.videoFolderId || payload.makeActive) {
            payload.videoFolderId = folderId;
          }
        }
        delete payload.addVideoFolderUrl;
        delete payload.makeActive;
        payload.videoFoldersJson = JSON.stringify(folders);
      }

      // Activate a video folder by ID
      if (payload.activateVideoFolderId !== undefined) {
        const targetId = payload.activateVideoFolderId.trim();
        if (targetId) {
          payload.videoFolderId = targetId;
        }
        delete payload.activateVideoFolderId;
      }

      // Remove a video folder by ID
      if (payload.removeVideoFolderId !== undefined) {
        const targetId = payload.removeVideoFolderId.trim();
        folders = folders.filter(f => f.id !== targetId);
        payload.videoFoldersJson = JSON.stringify(folders);
        if (existing?.videoFolderId === targetId || payload.videoFolderId === targetId) {
          payload.videoFolderId = folders.length > 0 ? folders[0].id : '';
        }
        delete payload.removeVideoFolderId;
      }

      // Legacy / simple videoFolderUrl
      if (payload.videoFolderUrl !== undefined) {
        const url = payload.videoFolderUrl.trim();
        if (url) {
          const folderId = validateLink(ctx, url, 'folder');
          const info = ctx.drive.info(folderId);
          const folderName = info.name || 'Video Folder';
          payload.videoFolderId = folderId;
          if (!folders.some(f => f.id === folderId)) {
            folders.push({
              id: folderId,
              name: folderName,
              url,
              addedAt: ctx.now().toISOString()
            });
            payload.videoFoldersJson = JSON.stringify(folders);
          }
        } else {
          payload.videoFolderId = '';
        }
        delete payload.videoFolderUrl;
      }

      if (payload.attendanceFolderUrl !== undefined) {
        payload.attendanceFolderId = payload.attendanceFolderUrl.trim()
          ? validateLink(ctx, payload.attendanceFolderUrl.trim(), 'folder')
          : '';
        delete payload.attendanceFolderUrl;
      }
      return payload;
    }
  });

  const instructorsRoutes = crudRoutes({
    prefix: 'instructors',
    getTable: (ctx) => ctx.db.instructors,
    perm: 'instructors.edit',
    listPerm: 'signedIn',
    onList: (ctx) => {
      try {
        const sysId = ctx.props.get('SYSTEM_SPREADSHEET_ID');
        const dbFolderId = sysId ? ctx.drive.getParentFolderId(sysId) || 'root' : 'root';
        if (!ctx.drive.findChildFolder(dbFolderId, 'Instructor Photos')) {
          const fld = ctx.drive.createFolder(dbFolderId, 'Instructor Photos');
          try { ctx.drive.setAnyoneReader(fld); } catch {}
        }
      } catch {}
    },
    processPayload: (ctx, payload) => {
      const getInstructorPhotosFolder = (): string | null => {
        try {
          const sysId = ctx.props.get('SYSTEM_SPREADSHEET_ID');
          const dbFolderId = sysId ? ctx.drive.getParentFolderId(sysId) || 'root' : 'root';
          let folderId = ctx.drive.findChildFolder(dbFolderId, 'Instructor Photos');
          if (!folderId) {
            folderId = ctx.drive.createFolder(dbFolderId, 'Instructor Photos');
            try {
              ctx.drive.setAnyoneReader(folderId);
            } catch {
              // ignore
            }
          }
          return folderId;
        } catch (e) {
          console.error('getInstructorPhotosFolder error:', e);
          return null;
        }
      };

      // Deduplicate base64 uploads to Google Drive
      const uploadedBase64Map = new Map<string, string>();

      const uploadBase64ToDrive = (base64Data: string, prefixName: string): string | null => {
        if (!base64Data || typeof base64Data !== 'string' || !base64Data.startsWith('data:image/')) {
          return null;
        }
        if (uploadedBase64Map.has(base64Data)) {
          return uploadedBase64Map.get(base64Data)!;
        }
        const folderId = getInstructorPhotosFolder();
        if (!folderId) return null;

        const match = base64Data.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
        const mime = match ? match[1] : 'image/jpeg';
        const ext = mime.includes('webp') ? 'webp' : mime.includes('png') ? 'png' : 'jpg';
        const cleanName = prefixName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `${cleanName}_${Date.now()}.${ext}`;
        const uploaded = ctx.drive.createFileFromBase64(folderId, fileName, mime, base64Data);
        uploadedBase64Map.set(base64Data, uploaded.url);
        return uploaded.url;
      };

      // 1. Process photosJson (gallery array)
      if (payload.photosJson && typeof payload.photosJson === 'string') {
        try {
          const list = JSON.parse(payload.photosJson);
          if (Array.isArray(list)) {
            let modified = false;
            for (const p of list) {
              if (p && typeof p.url === 'string' && p.url.startsWith('data:image/')) {
                const uploadedUrl = uploadBase64ToDrive(p.url, payload.name || 'instructor');
                if (uploadedUrl) {
                  p.url = uploadedUrl;
                  modified = true;
                }
              }
            }
            if (modified) {
              payload.photosJson = JSON.stringify(list);
            }
          }
        } catch {
          // ignore
        }
      }

      // 2. Process photoUrl (single URL) - reuses uploaded URL from map if identical base64
      if (payload.photoUrl && typeof payload.photoUrl === 'string' && payload.photoUrl.startsWith('data:image/')) {
        const uploadedUrl = uploadBase64ToDrive(payload.photoUrl, payload.name || 'instructor');
        if (uploadedUrl) {
          payload.photoUrl = uploadedUrl;
        }
      }

      // Ensure length never exceeds safe limits
      if (payload.photoUrl && typeof payload.photoUrl === 'string' && payload.photoUrl.length > 48000) {
        payload.photoUrl = payload.photoUrl.slice(0, 48000);
      }
      if (payload.photosJson && typeof payload.photosJson === 'string' && payload.photosJson.length > 48000) {
        payload.photosJson = '[]';
      }

      return payload;
    }
  });

  return {
    ...stylesRoutes,
    ...instructorsRoutes
  };
}
