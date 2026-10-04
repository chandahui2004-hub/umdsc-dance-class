import { Route, AuthInfo } from '../router';
import { Ctx } from '../ports';
import { AppError } from '../errors';
import { Music, getYouTubeVideoId } from '@umdsc/shared';
import { logAudit } from '../logic/audit';
import { getEvent } from './eventMembers';
import { resolveMusicLink, deriveMusicSource } from './musicLinks';

export function visibleMusic(
  ctx: Ctx,
  auth: AuthInfo | null,
  filters: { eventId?: string; styleId?: string; sessionId?: string } = {}
): Music[] {
  const { eventId, styleId, sessionId } = filters;

  let musicList = ctx.db.music.find(m => m.active);

  if (eventId) {
    musicList = musicList.filter(m => m.eventId === eventId);
  }
  if (sessionId) {
    musicList = musicList.filter(m => !m.sessionId || m.sessionId === sessionId);
  }
  if (styleId) {
    musicList = musicList.filter(m => m.styleId === styleId);
  }

  // Dancer scoping
  if (auth?.claims.role === 'dancer') {
    const perm = auth.claims.perms['music.view'];
    if (Array.isArray(perm)) {
      musicList = musicList.filter(m => perm.includes(m.styleId));
    }

    const matricKey = auth.claims.sub.replace(/^M-/, '');
    const mi = ctx.db.memberIndex.find(m => m.matricKey === matricKey && m.active)[0];
    const myEvents = mi ? mi.eventIds : [];
    musicList = musicList.filter(m => myEvents.includes(m.eventId));
  }

  return musicList;
}

export function getMusicRoutes(): Record<string, Route> {
  return {
    'music.list': {
      perm: 'music.view',
      write: false,
      handler: (ctx, auth, payload: any) => {
        return visibleMusic(ctx, auth, payload || {});
      }
    },

    'music.resolveLink': {
      perm: 'music.edit',
      write: false,
      handler: (ctx, _auth, payload: any) => resolveMusicLink(ctx, String(payload?.url ?? ''))
    },

    'music.create': {
      perm: 'music.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const {
          styleId,
          eventId,
          sessionId = '',
          title,
          sourceType,
          driveFileId = '',
          youtubeUrl = '',
          url = ''
        } = payload || {};

        if (String(url).trim()) {
          // A pasted link: every stored field is derived from the link, not from client-sent ids.
          if (!styleId || !eventId || !title) {
            throw new AppError('VALIDATION', 'styleId, eventId and title are required');
          }
          getEvent(ctx, eventId);
          const derived = deriveMusicSource(ctx, {
            url: String(url),
            chosenYoutubeId: payload.chosenYoutubeId,
            practiceUrl: payload.practiceUrl,
            listenOnly: payload.listenOnly === true
          });
          if (derived.sourceType === 'mp3') ctx.drive.setAnyoneReader(derived.driveFileId);

          const actor = auth?.claims.sub || 'system';
          const inserted = ctx.db.music.insert({ styleId, eventId, sessionId, title, ...derived }, actor, ctx.now());
          logAudit(ctx, actor, 'music.create', inserted.id, title);
          return inserted;
        }

        if (!styleId || !eventId || !title || !sourceType) {
          throw new AppError('VALIDATION', 'styleId, eventId, title, and sourceType are required');
        }
        getEvent(ctx, eventId);

        let parsedYoutubeId = '';
        let validDriveFileId = driveFileId;

        if (sourceType === 'youtube') {
          const id = getYouTubeVideoId(youtubeUrl);
          if (!id) {
            throw new AppError('VALIDATION', 'Invalid YouTube URL or ID');
          }
          parsedYoutubeId = id;
        } else if (sourceType === 'mp3') {
          if (!validDriveFileId) {
            throw new AppError('VALIDATION', 'driveFileId is required for MP3 source');
          }
          ctx.drive.setAnyoneReader(validDriveFileId);
        } else {
          throw new AppError('VALIDATION', `Unknown sourceType: ${sourceType}`);
        }

        const actor = auth?.claims.sub || 'system';
        const inserted = ctx.db.music.insert(
          {
            styleId,
            eventId,
            sessionId,
            title,
            sourceType,
            driveFileId: validDriveFileId,
            youtubeId: parsedYoutubeId
          },
          actor,
          ctx.now()
        );

        logAudit(ctx, actor, 'music.create', inserted.id, title);
        return inserted;
      }
    },

    'music.update': {
      perm: 'music.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { id, version, title, sessionId, sourceType, driveFileId, youtubeUrl } = payload || {};
        if (!id || version === undefined) {
          throw new AppError('VALIDATION', 'id and version are required');
        }

        const existing = ctx.db.music.find(m => m.id === id && m.active)[0];
        if (!existing) {
          throw new AppError('NOT_FOUND', `Music item not found: ${id}`);
        }

        if (existing.version !== Number(version)) {
          throw new AppError('VERSION_CONFLICT', 'Music modified by another user', false, existing);
        }

        const patch: any = {};
        if (title !== undefined) patch.title = title;
        if (sessionId !== undefined) patch.sessionId = sessionId;

        if (String(payload.url ?? '').trim()) {
          // A new pasted link replaces the whole source, so no stale id from the old one is kept.
          const derived = deriveMusicSource(ctx, {
            url: String(payload.url),
            chosenYoutubeId: payload.chosenYoutubeId,
            practiceUrl: payload.practiceUrl,
            listenOnly: payload.listenOnly === true
          });
          if (derived.sourceType === 'mp3') ctx.drive.setAnyoneReader(derived.driveFileId);
          Object.assign(patch, derived);
          const actor = auth?.claims.sub || 'system';
          const updated = ctx.db.music.update(id, version, patch, actor, ctx.now());
          logAudit(ctx, actor, 'music.update', id, `Updated music ${id}`);
          return updated;
        }

        if (sourceType !== undefined) patch.sourceType = sourceType;

        const effectiveType = sourceType || existing.sourceType;
        if (effectiveType === 'youtube' && youtubeUrl !== undefined) {
          const yId = getYouTubeVideoId(youtubeUrl);
          if (!yId) {
            throw new AppError('VALIDATION', 'Invalid YouTube URL');
          }
          patch.youtubeId = yId;
        } else if (effectiveType === 'mp3' && driveFileId !== undefined) {
          patch.driveFileId = driveFileId;
          ctx.drive.setAnyoneReader(driveFileId);
        }

        const actor = auth?.claims.sub || 'system';
        const updated = ctx.db.music.update(id, version, patch, actor, ctx.now());
        logAudit(ctx, actor, 'music.update', id, `Updated music ${id}`);
        return updated;
      }
    },

    'music.deactivate': {
      perm: 'music.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { id, version } = payload || {};
        if (!id || version === undefined) {
          throw new AppError('VALIDATION', 'id and version are required');
        }

        const existing = ctx.db.music.find(m => m.id === id && m.active)[0];
        if (!existing) {
          throw new AppError('NOT_FOUND', `Music item not found: ${id}`);
        }

        if (existing.version !== Number(version)) {
          throw new AppError('VERSION_CONFLICT', 'Music modified by another user', false, existing);
        }

        const actor = auth?.claims.sub || 'system';
        ctx.db.music.deactivate(id, Number(version), actor, ctx.now());
        logAudit(ctx, actor, 'music.deactivate', id, `Deactivated music ${id}`);
        return { deactivated: true };
      }
    },

    'sections.list': {
      perm: 'music.view',
      write: false,
      handler: (ctx, auth, payload: any) => {
        const musicId = String(payload?.musicId || '').trim();
        if (musicId) {
          return ctx.db.sections
            .find(s => s.musicId === musicId && s.active)
            .sort((a, b) => a.startSec - b.startSec);
        }

        const ids = new Set(visibleMusic(ctx, auth, {}).map(m => m.id));
        return ctx.db.sections
          .find(s => ids.has(s.musicId) && s.active)
          .sort((a, b) => {
            if (a.musicId !== b.musicId) {
              return a.musicId.localeCompare(b.musicId);
            }
            return a.startSec - b.startSec;
          });
      }
    },

    'sections.create': {
      perm: 'sections.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { musicId, name, startSec, endSec, videoId = '', videoStartSec = null } = payload || {};
        if (!musicId || !name || startSec === undefined || endSec === undefined) {
          throw new AppError('VALIDATION', 'musicId, name, startSec, and endSec are required');
        }

        const start = Number(startSec);
        const end = Number(endSec);

        if (isNaN(start) || isNaN(end) || start < 0 || end <= start) {
          throw new AppError('VALIDATION', 'Invalid section range: must satisfy 0 <= startSec < endSec');
        }

        const actor = auth?.claims.sub || 'system';
        const inserted = ctx.db.sections.insert(
          {
            musicId,
            name,
            startSec: start,
            endSec: end,
            videoId,
            videoStartSec: videoStartSec !== null && videoStartSec !== undefined ? Number(videoStartSec) : null
          },
          actor,
          ctx.now()
        );

        logAudit(ctx, actor, 'sections.create', inserted.id, `${name} (${start}-${end}s)`);
        return inserted;
      }
    },

    'sections.update': {
      perm: 'sections.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { id, version, name, startSec, endSec, videoId, videoStartSec } = payload || {};
        if (!id || version === undefined) {
          throw new AppError('VALIDATION', 'id and version are required');
        }

        const existing = ctx.db.sections.find(s => s.id === id && s.active)[0];
        if (!existing) {
          throw new AppError('NOT_FOUND', `Section not found: ${id}`);
        }

        if (existing.version !== Number(version)) {
          throw new AppError('VERSION_CONFLICT', 'Section modified by another user', false, existing);
        }

        const start = startSec !== undefined ? Number(startSec) : existing.startSec;
        const end = endSec !== undefined ? Number(endSec) : existing.endSec;

        if (start < 0 || end <= start) {
          throw new AppError('VALIDATION', 'Invalid section range: must satisfy 0 <= startSec < endSec');
        }

        const patch: any = {};
        if (name !== undefined) patch.name = name;
        if (startSec !== undefined) patch.startSec = start;
        if (endSec !== undefined) patch.endSec = end;
        if (videoId !== undefined) patch.videoId = videoId;
        if (videoStartSec !== undefined) {
          patch.videoStartSec = videoStartSec !== null ? Number(videoStartSec) : null;
        }

        const actor = auth?.claims.sub || 'system';
        const updated = ctx.db.sections.update(id, version, patch, actor, ctx.now());
        logAudit(ctx, actor, 'sections.update', id, `Updated section ${id}`);
        return updated;
      }
    },

    'sections.deactivate': {
      perm: 'sections.edit',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { id, version } = payload || {};
        if (!id || version === undefined) {
          throw new AppError('VALIDATION', 'id and version are required');
        }

        const existing = ctx.db.sections.find(s => s.id === id && s.active)[0];
        if (!existing) {
          throw new AppError('NOT_FOUND', `Section not found: ${id}`);
        }

        if (existing.version !== Number(version)) {
          throw new AppError('VERSION_CONFLICT', 'Section modified by another user', false, existing);
        }

        const actor = auth?.claims.sub || 'system';
        ctx.db.sections.deactivate(id, Number(version), actor, ctx.now());
        logAudit(ctx, actor, 'sections.deactivate', id, `Deactivated section ${id}`);
        return { deactivated: true };
      }
    }
  };
}
