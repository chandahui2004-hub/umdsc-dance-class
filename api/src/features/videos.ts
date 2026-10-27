import { Route } from '../router';
import { Ctx } from '../ports';
import { AppError } from '../errors';
import { parseDateFromName } from '../logic/filenameDate';
import { logAudit } from '../logic/audit';
import { can } from '../logic/permissions';
import { getEvent, readEventMembers } from './eventMembers';
import { isMemberEnrolledInStyle } from '../logic/styleMatcher';
import { dancerCanSee, onLiveClass } from './bootstrap';
import { eventYear, findStyleEventFolder } from './eventSheets';

const sessionStyle = (ctx: Ctx, id: unknown) => ctx.db.sessions.find(s => s.id === id && s.active)[0]?.styleId;
const videoStyle = (ctx: Ctx, id: unknown) => ctx.db.videos.find(v => v.id === id && v.active)[0]?.styleId;

function sendRecapNotification(
  ctx: Ctx,
  session: any,
  videoCount: number = 1
): { notifiedCount: number; recipientCount: number } {
  try {
    const event = getEvent(ctx, session.eventId);
    const style = ctx.db.styles.find(s => s.id === session.styleId && s.active)[0];
    const styleName = style?.name || 'Class';
    const allStyles = ctx.db.styles.find(s => s.active);
    const members = readEventMembers(ctx, event);
    const enrolled = members.filter(m => isMemberEnrolledInStyle(m, session.styleId, allStyles));
    const sentEmails = new Set<string>();

    const count = Math.max(1, Math.floor(videoCount) || 1);
    const isPlural = count > 1;

    const subject = isPlural
      ? `[UMDSC] ${count} Class Recap Videos Uploaded - ${styleName} (Class #${session.seq} - ${session.date})`
      : `[UMDSC] Class Recap Video Uploaded - ${styleName} (Class #${session.seq} - ${session.date})`;

    const headlineText = isPlural
      ? `${count} new class recap videos for ${styleName} Class #${session.seq} (${session.date}) have been uploaded and are now available to watch!`
      : `The class recap video for ${styleName} Class #${session.seq} (${session.date}) has been uploaded and is now available to watch!`;

    const headlineHtml = isPlural
      ? `<strong>${count} new class recap videos</strong> for <strong>${styleName} Class #${session.seq} (${session.date})</strong> have been uploaded and are now available to watch!`
      : `The class recap video for <strong>${styleName} Class #${session.seq} (${session.date})</strong> has been uploaded and is now available to watch!`;

    const buttonLabel = isPlural ? 'WATCH CLASS RECAPS' : 'WATCH CLASS RECAP';

    for (const dancer of enrolled) {
      const to = String(dancer.email || '').trim().toLowerCase();
      if (!to || !to.includes('@') || sentEmails.has(to)) continue;
      sentEmails.add(to);

      const name = dancer.fullName || 'Dancer';
      const body = `Hi ${name},\n\n${headlineText}\n\nAccess your class recap and practice music here:\nhttps://umdsc-dance-class.umdancesportc.workers.dev\n\nKeep dancing!\nUniversiti Malaya Dance Sport Club (UMDSC)`;
      const htmlBody = `<div style="font-family: sans-serif; line-height: 1.6; color: #222;">
  <h2 style="color: #6366f1;">UMDSC Dance Class System</h2>
  <p>Hi <strong>${name}</strong>,</p>
  <p>${headlineHtml}</p>
  <p style="margin: 24px 0;">
    <a href="https://umdsc-dance-class.umdancesportc.workers.dev" style="background-color: #6366f1; color: #fff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 4px; display: inline-block;">${buttonLabel}</a>
  </p>
  <p style="color: #666; font-size: 13px;">Or open: <a href="https://umdsc-dance-class.umdancesportc.workers.dev">https://umdsc-dance-class.umdancesportc.workers.dev</a></p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="font-size: 12px; color: #888;">Universiti Malaya Dance Sport Club (UMDSC)</p>
</div>`;

      ctx.mail.sendEmail({ to, subject, body, htmlBody });
    }

    return { notifiedCount: count, recipientCount: sentEmails.size };
  } catch (err) {
    console.warn('[sendRecapNotification] Failed to dispatch recap notification emails:', err);
    return { notifiedCount: 0, recipientCount: 0 };
  }
}

export function getVideoRoutes(): Record<string, Route> {
  return {
    'videos.list': {
      perm: 'videos.view',
      write: false,
      handler: (ctx, auth, payload: any) => {
        const { eventId, styleId, sessionId, includeOrphans } = payload || {};

        let videos = ctx.db.videos.find(v => v.active);
        // Videos of a deleted class are only listed for the admin Media page to clean up
        if (!(includeOrphans === true && auth?.claims.role === 'admin')) {
          videos = videos.filter(onLiveClass(ctx));
        }

        if (eventId) {
          videos = videos.filter(v => v.eventId === eventId);
        }
        if (styleId) {
          videos = videos.filter(v => v.styleId === styleId);
        }
        if (sessionId) {
          videos = videos.filter(v => v.sessionId === sessionId);
        }

        // Dancer scoping: only the event + style classes they registered for
        if (auth?.claims.role === 'dancer') {
          const perm = auth.claims.perms['videos.view'];
          if (Array.isArray(perm)) {
            videos = videos.filter(v => perm.includes(v.styleId));
          }
          videos = videos.filter(dancerCanSee(ctx, auth));
        }

        return videos;
      }
    },

    'videos.targetFolder': {
      perm: 'videos.upload',
      write: false,
      styleOf: (p: any, ctx) => sessionStyle(ctx, p?.sessionId),
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

        if (!style.videoFolderId) {
          throw new AppError(
            'VALIDATION',
            `Class lead video folder link not inserted for ${style.name}. Insert it on the Media page first.`
          );
        }

        const event = getEvent(ctx, session.eventId);
        const found = findStyleEventFolder(ctx, style.videoFolderId, event);

        return {
          videoMasterFolderId: style.videoFolderId,
          eventFolderId: found?.id || '',
          yearFolderName: eventYear(ctx, event),
          // An older folder straight under the style folder: the website files it under the year
          eventFolderInYear: found?.inYear ?? false,
          eventFolderName: event.name,
          classFolderName: `${session.date} ${style.name} Class ${session.seq}`,
          musicFolderName: 'Music'
        };
      }
    },

    'videos.register': {
      perm: 'videos.upload',
      write: true,
      styleOf: (p: any, ctx) => sessionStyle(ctx, p?.sessionId),
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { driveFileId, sessionId, title, eventFolderId } = payload || {};
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

        // Two scans at once, or a scan right after an upload, must not list the same file twice
        const listed = ctx.db.videos.find(v => v.driveFileId === driveFileId && v.active)[0];
        if (listed) return listed;

        const info = ctx.drive.info(driveFileId);
        if (!info.exists || !info.canEdit) {
          throw new AppError(
            'LINK_NO_ACCESS',
            `Share this file with ${ctx.clubEmail} as Editor, then try again.`
          );
        }

        ctx.drive.setAnyoneReader(driveFileId);

        const actor = auth?.claims.sub || 'system';
        const event = getEvent(ctx, session.eventId);
        const inserted = ctx.db.videos.insert(
          {
            styleId: session.styleId,
            eventId: session.eventId,
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

        if (payload?.notifyDancers !== false) {
          sendRecapNotification(ctx, session, 1);
        }

        return inserted;
      }
    },

    'videos.notifyBatch': {
      perm: 'videos.upload',
      write: true,
      styleOf: (p: any, ctx) => sessionStyle(ctx, p?.sessionId),
      bumpsData: false,
      handler: (ctx, auth, payload: any) => {
        const { sessionId, videoCount } = payload || {};
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

        const count = typeof videoCount === 'number' && videoCount > 0 ? videoCount : 1;
        const result = sendRecapNotification(ctx, session, count);

        const actor = auth?.claims.sub || 'system';
        logAudit(ctx, actor, 'videos.notifyBatch', session.id, `${count} videos notified to ${result.recipientCount} dancers`);

        return result;
      }
    },

    'videos.update': {
      perm: 'videos.edit',
      write: true,
      styleOf: (p: any, ctx) => videoStyle(ctx, p?.id),
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
      styleOf: (p: any, ctx) => videoStyle(ctx, p?.id),
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

        // The video leaves the website only once its Drive file is in the trash (recoverable for 30 days)
        // or already gone. The club account can only trash files it owns; otherwise the uploader must
        // sign in and trash it from the website first, so the video stays listed until then.
        const fileId = existing.driveFileId;
        const driveTrashed = !fileId || ctx.drive.deleteFile(fileId) || !ctx.drive.info(fileId).exists;
        if (!driveTrashed) {
          const style = ctx.db.styles.find(s => s.id === existing.styleId)[0];
          return { deactivated: false, driveTrashed: false, uploader: style?.videoUploaderEmail || '' };
        }

        const actor = auth?.claims.sub || 'system';
        ctx.db.videos.deactivate(id, Number(version), actor, ctx.now());
        logAudit(ctx, actor, 'videos.deactivate', id, `Deactivated video ${id}; Drive file trashed`);
        return { deactivated: true, driveTrashed: true };
      }
    },

    'videos.scan': {
      perm: 'videos.edit',
      write: false,
      styleOf: (p: any) => p?.styleId,
      handler: (ctx, auth, payload: any) => {
        const { styleId, eventId } = payload || {};
        if (!styleId || !eventId) {
          throw new AppError('VALIDATION', 'styleId and eventId are required');
        }
        const event = getEvent(ctx, eventId);

        const style = ctx.db.styles.find(s => s.id === styleId && s.active)[0];
        if (!style) {
          throw new AppError('NOT_FOUND', `Style not found: ${styleId}`);
        }

        // Scan only under the dance style's own video folder, inside the event's folder (› <year> › <event>).
        if (!style.videoFolderId) {
          return [];
        }
        const rootFolderId = findStyleEventFolder(ctx, style.videoFolderId, event)?.id;
        if (!rootFolderId) {
          return [];
        }

        const allFiles = ctx.drive.listFilesRecursive(rootFolderId);
        const existingFileIds = new Set(
          ctx.db.videos.find(v => v.styleId === styleId && v.eventId === eventId && v.active).map(v => v.driveFileId)
        );

        const mediaFiles = allFiles.filter(
          f =>
            !existingFileIds.has(f.id) &&
            (f.mimeType.startsWith('video/') ||
              f.mimeType.startsWith('audio/') ||
              /\.(mp4|mov|m4v|webm|avi|mp3|m4a|wav)$/i.test(f.name))
        );

        const sessions = ctx.db.sessions.find(s => s.eventId === eventId && s.styleId === styleId && s.active);
        const range = { startDate: event.startDate, endDate: event.endDate };

        const results = mediaFiles.map(f => {
          let suggestedSessionId: string | null = null;
          let reason = 'no date match';

          // 1. Filename date
          const d1 = parseDateFromName(f.name, range);
          if (d1) {
            const matchS = sessions.find(s => s.date === d1);
            if (matchS) {
              suggestedSessionId = matchS.id;
              reason = 'filename date';
            }
          }

          // 2. Parent class-folder name
          if (!suggestedSessionId && f.parentName) {
            const d2 = parseDateFromName(f.parentName, range);
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
            if (d3 >= event.startDate && d3 <= event.endDate) {
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
