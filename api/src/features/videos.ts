import { Route } from '../router';
import { AppError } from '../errors';
import { parseDateFromName } from '../logic/filenameDate';
import { logAudit } from '../logic/audit';
import { can } from '../logic/permissions';

export function getVideoRoutes(): Record<string, Route> {
  return {
    'videos.list': {
      perm: 'videos.view',
      write: false,
      handler: (ctx, auth, payload: any) => {
        const { month, styleId, sessionId } = payload || {};

        let videos = ctx.db.videos.find(v => v.active);

        if (month) {
          videos = videos.filter(v => v.month === month);
        }
        if (styleId) {
          videos = videos.filter(v => v.styleId === styleId);
        }
        if (sessionId) {
          videos = videos.filter(v => v.sessionId === sessionId);
        }

        // Dancer scoping
        if (auth?.claims.role === 'dancer') {
          const perm = auth.claims.perms['videos.view'];
          if (Array.isArray(perm)) {
            videos = videos.filter(v => perm.includes(v.styleId));
          }

          const matricKey = auth.claims.sub.replace(/^M-/, '');
          const mi = ctx.db.memberIndex.find(m => m.matricKey === matricKey && m.active)[0];
          if (mi && mi.months) {
            videos = videos.filter(v => mi.months.includes(v.month));
          }
        }

        return videos;
      }
    },

    'videos.targetFolder': {
      perm: 'videos.upload',
      write: false,
      handler: (ctx, auth, payload: any) => {
        const sessionId = String(payload?.sessionId || '').trim();
        if (!sessionId) {
          throw new AppError('VALIDATION', 'sessionId is required');
        }

        const session = ctx.db.sessions.find(s => s.id === sessionId && s.active)[0];
        if (!session) {
          throw new AppError('NOT_FOUND', `Session not found: ${sessionId}`);
        }

        if (auth && !can(auth.claims.perms, 'videos.upload', session.styleId)) {
          throw new AppError('FORBIDDEN', 'Permission denied for style: ' + session.styleId);
        }

        const style = ctx.db.styles.find(s => s.id === session.styleId && s.active)[0];
        if (!style) {
          throw new AppError('NOT_FOUND', `Style not found: ${session.styleId}`);
        }

        const defaultFolder = ctx.db.settings.find(s => s.key === 'defaultVideoFolderId' && s.active)[0]?.value;
        const rootFolderId = style.videoFolderId || defaultFolder || '';

        return {
          rootFolderId,
          monthFolderName: session.month,
          classFolderName: `${session.date} ${style.name} Class ${session.seq}`,
          musicFolderName: 'Music'
        };
      }
    },

    'videos.register': {
      perm: 'videos.upload',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { driveFileId, sessionId, title } = payload || {};
        if (!driveFileId || !sessionId) {
          throw new AppError('VALIDATION', 'driveFileId and sessionId are required');
        }

        const session = ctx.db.sessions.find(s => s.id === sessionId && s.active)[0];
        if (!session) {
          throw new AppError('NOT_FOUND', `Session not found: ${sessionId}`);
        }

        if (auth && !can(auth.claims.perms, 'videos.upload', session.styleId)) {
          throw new AppError('FORBIDDEN', 'Permission denied for style: ' + session.styleId);
        }

        const info = ctx.drive.info(driveFileId);
        if (!info.exists || !info.canEdit) {
          throw new AppError(
            'LINK_NO_ACCESS',
            `Share this file with ${ctx.clubEmail} as Editor, then try again.`
          );
        }

        ctx.drive.setAnyoneReader(driveFileId);

        const actor = auth?.claims.sub || 'system';
        const inserted = ctx.db.videos.insert(
          {
            styleId: session.styleId,
            month: session.month,
            sessionId: session.id,
            title: title || info.name || 'Untitled Video',
            driveFileId,
            mimeType: (info as any).mimeType || 'video/mp4',
            sizeBytes: (info as any).sizeBytes || 0,
            folderId: (info as any).parentId || '',
            uploadedBy: actor,
            source: 'upload'
          },
          actor,
          ctx.now()
        );

        logAudit(ctx, actor, 'videos.register', inserted.id, inserted.title);
        return inserted;
      }
    },

    'videos.update': {
      perm: 'videos.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { id, version, title, sessionId } = payload || {};
        if (!id || version === undefined) {
          throw new AppError('VALIDATION', 'id and version are required');
        }

        const existing = ctx.db.videos.find(v => v.id === id && v.active)[0];
        if (!existing) {
          throw new AppError('NOT_FOUND', `Video not found: ${id}`);
        }

        if (existing.version !== Number(version)) {
          throw new AppError('VERSION_CONFLICT', 'Video modified by another user', false, existing);
        }

        const patch: any = {};
        if (title !== undefined) patch.title = title;
        if (sessionId !== undefined) patch.sessionId = sessionId;

        const actor = auth?.claims.sub || 'system';
        const updated = ctx.db.videos.update(id, version, patch, actor, ctx.now());
        logAudit(ctx, actor, 'videos.update', id, `Updated video ${id}`);
        return updated;
      }
    },

    'videos.deactivate': {
      perm: 'videos.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { id, version } = payload || {};
        if (!id || version === undefined) {
          throw new AppError('VALIDATION', 'id and version are required');
        }

        const existing = ctx.db.videos.find(v => v.id === id && v.active)[0];
        if (!existing) {
          throw new AppError('NOT_FOUND', `Video not found: ${id}`);
        }

        if (existing.version !== Number(version)) {
          throw new AppError('VERSION_CONFLICT', 'Video modified by another user', false, existing);
        }

        const actor = auth?.claims.sub || 'system';
        ctx.db.videos.deactivate(id, Number(version), actor, ctx.now());
        logAudit(ctx, actor, 'videos.deactivate', id, `Deactivated video ${id}`);
        return { deactivated: true };
      }
    },

    'videos.scan': {
      perm: 'videos.edit',
      write: false,
      handler: (ctx, auth, payload: any) => {
        const { styleId, month } = payload || {};
        if (!styleId || !month) {
          throw new AppError('VALIDATION', 'styleId and month are required');
        }

        const style = ctx.db.styles.find(s => s.id === styleId && s.active)[0];
        if (!style) {
          throw new AppError('NOT_FOUND', `Style not found: ${styleId}`);
        }

        const defaultFolder = ctx.db.settings.find(s => s.key === 'defaultVideoFolderId' && s.active)[0]?.value;
        const rootFolderId = style.videoFolderId || defaultFolder;
        if (!rootFolderId) {
          return [];
        }

        const allFiles = ctx.drive.listFilesRecursive(rootFolderId);
        const existingFileIds = new Set(
          ctx.db.videos.find(v => v.styleId === styleId && v.month === month && v.active).map(v => v.driveFileId)
        );

        const mediaFiles = allFiles.filter(
          f =>
            !existingFileIds.has(f.id) &&
            (f.mimeType.startsWith('video/') ||
              f.mimeType.startsWith('audio/') ||
              /\.(mp4|mov|m4v|webm|avi|mp3|m4a|wav)$/i.test(f.name))
        );

        const sessions = ctx.db.sessions.find(s => s.month === month && s.styleId === styleId && s.active);

        const results = mediaFiles.map(f => {
          let suggestedSessionId: string | null = null;
          let reason = 'no date match';

          // 1. Filename date
          const d1 = parseDateFromName(f.name, month);
          if (d1) {
            const matchS = sessions.find(s => s.date === d1);
            if (matchS) {
              suggestedSessionId = matchS.id;
              reason = 'filename date';
            }
          }

          // 2. Parent class-folder name
          if (!suggestedSessionId && f.parentName) {
            const d2 = parseDateFromName(f.parentName, month);
            if (d2) {
              const matchS = sessions.find(s => s.date === d2);
              if (matchS) {
                suggestedSessionId = matchS.id;
                reason = 'parent folder date';
              }
            }
          }

          // 3. Created time date
          if (!suggestedSessionId && f.createdTime) {
            const d3 = f.createdTime.slice(0, 10);
            if (d3.startsWith(month)) {
              const matchS = sessions.find(s => s.date === d3);
              if (matchS) {
                suggestedSessionId = matchS.id;
                reason = 'created date';
              }
            }
          }

          return {
            fileId: f.id,
            name: f.name,
            sizeBytes: f.sizeBytes,
            mimeType: f.mimeType,
            suggestedSessionId,
            reason
          };
        });

        return results;
      }
    }
  };
}
