import { Route, AuthInfo } from '../router';
import { AppError } from '../errors';
import { Table } from '../db/table';
import { logAudit } from '../logic/audit';
import { validateLink } from '../logic/linkValidation';
import { PermissionCode, extractDriveId } from '@umdsc/shared';

export function crudRoutes<T extends { id: string; version: number; active: boolean }>(opts: {
  prefix: string;
  getTable: (ctx: any) => Table<T>;
  perm: PermissionCode;
  listPerm?: PermissionCode | 'signedIn' | 'public';
  processPayload?: (ctx: any, payload: any, isUpdate: boolean, existing?: any) => any;
  onList?: (ctx: any) => void;
  /** Shapes each listed row for the caller, e.g. to hide admin-only fields from dancers. */
  mapListRow?: (row: T, auth: AuthInfo | null) => T;
  getTargetName?: (row: any) => string;
}): Record<string, Route> {
  const { prefix, getTable, perm, listPerm = perm, processPayload, onList, mapListRow, getTargetName = (r) => r.name || r.id } = opts;

  return {
    [`${prefix}.list`]: {
      perm: listPerm,
      write: false,
      handler: (ctx, auth) => {
        if (onList) {
          try {
            onList(ctx);
          } catch {
            // ignore
          }
        }
        const rows = getTable(ctx).find(r => r.active);
        return mapListRow ? rows.map(r => mapListRow(r, auth)) : rows;
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
    },

    [`${prefix}.delete`]: {
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
        logAudit(ctx, actor, `${prefix}.delete`, getTargetName(existing));
        return { success: true };
      }
    }
  };
}

/** Class leads' Google account emails are for admins only; dancers never receive them. */
export function withoutUploaderEmail<S extends { videoUploaderEmail?: string }>(style: S): S {
  const { videoUploaderEmail: _hidden, ...rest } = style;
  return rest as S;
}

export function getMasterDataRoutes(): Record<string, Route> {
  const stylesRoutes = crudRoutes({
    prefix: 'styles',
    getTable: (ctx) => ctx.db.styles,
    perm: 'styles.edit',
    listPerm: 'signedIn',
    mapListRow: (row, auth) => (auth?.claims.role === 'admin' ? row : (withoutUploaderEmail(row as any) as typeof row)),
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

      // The Google account that authorized this style's folder; uploads must use the same account.
      if (payload.videoUploaderEmail !== undefined) {
        const email = String(payload.videoUploaderEmail || '').trim().toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new AppError('VALIDATION', 'Uploader account must be an email address');
        }
        payload.videoUploaderEmail = email;
      } else if (
        payload.videoFolderId !== undefined &&
        existing?.videoFolderId &&
        payload.videoFolderId !== existing.videoFolderId
      ) {
        // A different folder has to be authorized again, possibly by another class lead.
        payload.videoUploaderEmail = '';
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

  const KNOWN_INSTRUCTOR_PHOTOS_FOLDER_ID = '1Hjy3k0LVRE1Vp9WwHde7_D6YbsQroFOP';

  const getInstructorPhotosFolder = (ctx: any): string | null => {
    try {
      const propId = ctx.props?.get('INSTRUCTOR_PHOTOS_FOLDER_ID');
      if (propId) return propId;
      const sysId = ctx.props?.get('SYSTEM_SPREADSHEET_ID');
      const dbFolderId = sysId ? ctx.drive.getParentFolderId(sysId) || 'root' : 'root';
      let folderId = ctx.drive.findChildFolder(dbFolderId, 'Instructor Photos');
      if (folderId) return folderId;
      if (KNOWN_INSTRUCTOR_PHOTOS_FOLDER_ID) {
        try {
          const info = ctx.drive.info(KNOWN_INSTRUCTOR_PHOTOS_FOLDER_ID);
          if (info && info.id) return KNOWN_INSTRUCTOR_PHOTOS_FOLDER_ID;
        } catch {}
      }
      folderId = ctx.drive.createFolder(dbFolderId, 'Instructor Photos');
      try { ctx.drive.setAnyoneReader(folderId); } catch {}
      return folderId;
    } catch (e) {
      console.error('getInstructorPhotosFolder error:', e);
      return KNOWN_INSTRUCTOR_PHOTOS_FOLDER_ID;
    }
  };

  const instructorsRoutes = crudRoutes({
    prefix: 'instructors',
    getTable: (ctx) => ctx.db.instructors,
    perm: 'instructors.edit',
    listPerm: 'public',
    onList: (ctx) => {
      try {
        const folderId = getInstructorPhotosFolder(ctx);
        if (!folderId) return;

        const files = ctx.drive.listFilesRecursive(folderId);
        if (!files) return;

        const instructors = ctx.db.instructors.find(i => i.active);

        // Group files by instructor and assign clean human-readable names:
        // "[Instructor Name] - Photo 1.png", "[Instructor Name] - Photo 2.png"
        for (const inst of instructors) {
          const instClean = inst.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          const matchingFiles = files.filter(f => {
            const fClean = f.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            return fClean.includes(instClean);
          });

          if (matchingFiles.length > 0) {
            let seq = 1;
            const updatedPhotos: any[] = [];
            for (const file of matchingFiles) {
              const ext = file.name.split('.').pop() || 'png';
              const properName = `${inst.name} - Photo ${seq}.${ext}`;
              if (file.name !== properName) {
                try {
                  ctx.drive.renameFile(file.id, properName);
                  file.name = properName;
                } catch {}
              }
              const photoUrl = `https://lh3.googleusercontent.com/d/${file.id}`;
              updatedPhotos.push({
                id: file.id,
                url: photoUrl,
                active: seq === 1,
                uploadedAt: file.createdTime || new Date().toISOString()
              });
              seq++;
            }

            // Sync with instructor record
            let currentPhotos: any[] = [];
            try { currentPhotos = JSON.parse(inst.photosJson || '[]'); } catch {}

            const driveUrls = new Set(updatedPhotos.map(p => p.url));
            // Keep previously active photo active if still in drive
            const prevActive = currentPhotos.find(p => p.active && driveUrls.has(p.url));
            if (prevActive) {
              updatedPhotos.forEach(p => { p.active = p.url === prevActive.url; });
            }

            const activeOne = updatedPhotos.find(p => p.active) || updatedPhotos[0];
            const needsUpdate = inst.photoUrl !== activeOne.url ||
              updatedPhotos.length !== currentPhotos.length ||
              inst.photosJson !== JSON.stringify(updatedPhotos);

            if (needsUpdate) {
              ctx.db.instructors.update(
                inst.id,
                inst.version,
                {
                  photoUrl: activeOne.url,
                  photosJson: JSON.stringify(updatedPhotos)
                },
                'system_drive_sync',
                ctx.now()
              );
            }
          } else {
            // Instructor has no files in Google Drive folder:
            // Ensure website displays no photo for them per user requirement
            if (inst.photoUrl && (inst.photoUrl.startsWith('/instructors/') || inst.photoUrl.startsWith('data:'))) {
              ctx.db.instructors.update(
                inst.id,
                inst.version,
                {
                  photoUrl: '',
                  photosJson: '[]'
                },
                'system_drive_sync',
                ctx.now()
              );
            }
          }
        }
      } catch (e) {
        console.error('onList instructors error:', e);
      }
    },
    processPayload: (ctx, payload, isUpdate, existing) => {
      const folderId = getInstructorPhotosFolder(ctx);

      // Handle removed photos in update: Delete removed files from Google Drive
      if (isUpdate && existing && existing.photosJson && payload.photosJson) {
        try {
          const oldList: any[] = JSON.parse(existing.photosJson);
          const newList: any[] = JSON.parse(payload.photosJson);
          const newUrls = new Set(newList.map(p => p.url));
          for (const oldP of oldList) {
            if (oldP && oldP.url && !newUrls.has(oldP.url)) {
              const res = extractDriveId(oldP.url);
              if (res && res.id) {
                try {
                  ctx.drive.deleteFile(res.id);
                } catch (err) {
                  console.error('Failed to delete removed photo from Drive:', err);
                }
              }
            }
          }
        } catch {}
      }

      // Map to upload base64 images into Drive with clean human names
      const uploadBase64ToDrive = (base64Data: string, prefixName: string): string | null => {
        if (!base64Data || typeof base64Data !== 'string' || !base64Data.startsWith('data:image/')) {
          return null;
        }
        if (!folderId) return null;

        const match = base64Data.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
        const mime = match ? match[1] : 'image/jpeg';
        const ext = mime.includes('webp') ? 'webp' : mime.includes('png') ? 'png' : 'jpg';
        const cleanName = (prefixName || 'Instructor').trim();

        // Sequence number based on existing files in folder
        let seq = 1;
        try {
          const existingFiles = ctx.drive.listFilesRecursive(folderId);
          const matching = existingFiles.filter(f =>
            f.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(cleanName.toLowerCase().replace(/[^a-z0-9]/g, ''))
          );
          seq = matching.length + 1;
        } catch {}

        const fileName = `${cleanName} - Photo ${seq}.${ext}`;
        const uploaded = ctx.drive.createFileFromBase64(folderId, fileName, mime, base64Data);
        try { ctx.drive.setAnyoneReader(uploaded.id); } catch {}
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
                const uploadedUrl = uploadBase64ToDrive(p.url, payload.name || 'Instructor');
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

      // 2. Process photoUrl (single URL)
      if (payload.photoUrl && typeof payload.photoUrl === 'string' && payload.photoUrl.startsWith('data:image/')) {
        let matched = false;
        try {
          const list = JSON.parse(payload.photosJson || '[]');
          const activePhoto = list.find((p: any) => p.active) || list[0];
          if (activePhoto && activePhoto.url && !activePhoto.url.startsWith('data:image/')) {
            payload.photoUrl = activePhoto.url;
            matched = true;
          }
        } catch {}

        if (!matched) {
          const uploadedUrl = uploadBase64ToDrive(payload.photoUrl, payload.name || 'Instructor');
          if (uploadedUrl) {
            payload.photoUrl = uploadedUrl;
          }
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

  const photoRoutes: Record<string, Route> = {
    'instructors.deletePhoto': {
      perm: 'instructors.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { instructorId, photoUrl, fileId: directFileId } = payload || {};
        if (!instructorId || (!photoUrl && !directFileId)) {
          throw new AppError('VALIDATION', 'instructorId and photoUrl (or fileId) are required');
        }

        const driveResult = photoUrl ? extractDriveId(photoUrl) : null;
        const fileId = directFileId || driveResult?.id;
        if (fileId) {
          try {
            ctx.drive.deleteFile(fileId);
          } catch (e) {
            console.error('deleteFile error in Drive:', e);
          }
        }

        const inst = ctx.db.instructors.find(i => i.id === instructorId && i.active)[0];
        if (inst) {
          let photos: any[] = [];
          try {
            photos = JSON.parse(inst.photosJson || '[]');
          } catch {}

          const remaining = photos.filter(p => {
            if (p.url === photoUrl) return false;
            if (fileId && p.url.includes(fileId)) return false;
            return true;
          });

          let nextActiveUrl = inst.photoUrl;
          if (inst.photoUrl === photoUrl || (fileId && inst.photoUrl.includes(fileId))) {
            const first = remaining[0];
            if (first) {
              first.active = true;
              nextActiveUrl = first.url;
            } else {
              nextActiveUrl = '';
            }
          }

          const actor = auth?.claims.sub || 'system';
          const updated = ctx.db.instructors.update(
            inst.id,
            inst.version,
            {
              photoUrl: nextActiveUrl,
              photosJson: JSON.stringify(remaining)
            },
            actor,
            ctx.now()
          );
          logAudit(ctx, actor, 'instructors.deletePhoto', inst.name, `Deleted photo ${fileId || photoUrl}`);
          return updated;
        }

        return { success: true };
      }
    },
    'instructors.drivePhotos': {
      perm: 'public',
      write: false,
      handler: (ctx) => {
        const folderId = getInstructorPhotosFolder(ctx);
        if (!folderId) return { files: [] };
        const files = ctx.drive.listFilesRecursive(folderId) || [];
        return {
          files: files.map((f) => ({
            id: f.id,
            name: f.name,
            url: `https://lh3.googleusercontent.com/d/${f.id}`,
            createdTime: f.createdTime || ctx.now().toISOString()
          }))
        };
      }
    }
  };

  return {
    ...stylesRoutes,
    ...instructorsRoutes,
    ...photoRoutes
  };
}
