import { Route } from '../router';
import { AppError } from '../errors';
import { Ctx } from '../ports';
import {
  AdminBootstrap,
  DancerBootstrap,
  PermMap,
  ClassSession,
  VideoItem,
  MusicItem,
  Section
} from '@umdsc/shared';
import { dancerStylesInEvent } from './eventMembers';

export function getAdminBootstrap(
  ctx: Ctx,
  username: string,
  displayName: string,
  perms: PermMap,
  sinceVersion?: number
): AdminBootstrap | { notModified: true } {
  const dataVersion = Number(ctx.props.get('DATA_VERSION') || 1);
  if (sinceVersion !== undefined && Number(sinceVersion) === dataVersion) {
    return { notModified: true };
  }

  const cacheKey = 'boot:admin:' + dataVersion;
  const cached = ctx.cache.get(cacheKey);
  let sharedData: Omit<AdminBootstrap, 'profile'> | null = null;

  if (cached) {
    try {
      sharedData = JSON.parse(cached);
    } catch {
      // ignore
    }
  }

  if (!sharedData) {
    const styles = ctx.db.styles.find(s => s.active);
    const instructors = ctx.db.instructors.find(i => i.active);
    const sessions = ctx.db.sessions.find(s => s.active);
    const roles = ctx.db.roles.find(r => r.active);
    const events = ctx.db.events.find(e => e.active).sort((a, b) => b.startDate.localeCompare(a.startDate));
    const settings: Record<string, string> = {};
    for (const s of ctx.db.settings.find(s => s.active)) {
      settings[s.key] = s.value;
    }
    settings.clubEmail = ctx.clubEmail;

    sharedData = { styles, instructors, sessions, roles: roles as any, events, settings };
    ctx.cache.put(cacheKey, JSON.stringify(sharedData), 600);
  }

  return {
    profile: { username, displayName, perms },
    ...sharedData
  };
}

export function getDancerBootstrap(
  ctx: Ctx,
  matricKey: string,
  perms: PermMap,
  sinceVersion?: number
): DancerBootstrap | { notModified: true } {
  const dataVersion = Number(ctx.props.get('DATA_VERSION') || 1);
  if (sinceVersion !== undefined && Number(sinceVersion) === dataVersion) {
    return { notModified: true };
  }

  const miKey = 'mi:' + matricKey;
  let dancer: any = null;
  const miCached = ctx.cache.get(miKey);
  if (miCached) {
    try {
      dancer = JSON.parse(miCached);
    } catch {
      // ignore
    }
  }

  if (!dancer) {
    dancer = ctx.db.memberIndex.find(m => m.matricKey === matricKey && m.active)[0];
    if (!dancer) {
      throw new AppError('NOT_FOUND', 'Dancer record not found');
    }
    ctx.cache.put(miKey, JSON.stringify(dancer), 600);
  }

  const dancerEventIds: string[] = dancer.eventIds || [];
  const dancerEvents = ctx.db.events.find(e => e.active && dancerEventIds.includes(e.id));

  // The dancer's styles per event come from that event's Members sheet
  const eventStylesMap = new Map<string, Set<string>>();
  const calPerm = perms['calendar.view'];
  for (const event of dancerEvents) {
    const styleSet = new Set<string>();
    try {
      for (const sId of dancerStylesInEvent(ctx, event, matricKey)) styleSet.add(sId);
    } catch {
      // unreadable Members sheet: the dancer simply sees nothing for this event
    }
    for (const mr of ctx.db.memberRoles.find(r => r.matricKey === matricKey && r.active)) {
      for (const sId of mr.styleIds || []) {
        if (event.styleIds.includes(sId)) styleSet.add(sId);
      }
    }
    if (Array.isArray(calPerm)) {
      for (const sId of Array.from(styleSet)) {
        if (!calPerm.includes(sId)) styleSet.delete(sId);
      }
    }
    eventStylesMap.set(event.id, styleSet);
  }

  const sessionsMap = new Map<string, ClassSession>();
  const videosMap = new Map<string, VideoItem>();
  const musicMap = new Map<string, MusicItem>();
  const sectionsMap = new Map<string, Section>();
  const allDancerStyleIds = new Set<string>();

  for (const [eventId, styleSet] of eventStylesMap.entries()) {
    for (const styleId of styleSet) {
      allDancerStyleIds.add(styleId);

      const chunkKey = `boot:chunk:${eventId}:${styleId}:${dataVersion}`;
      let chunkData: any = null;
      const cachedChunk = ctx.cache.get(chunkKey);
      if (cachedChunk) {
        try {
          chunkData = JSON.parse(cachedChunk);
        } catch {
          // ignore
        }
      }

      if (!chunkData) {
        const chunkMusic = ctx.db.music.find(mus => mus.eventId === eventId && mus.styleId === styleId && mus.active);
        const musicIds = new Set(chunkMusic.map(mus => mus.id));
        chunkData = {
          sessions: ctx.db.sessions.find(s => s.eventId === eventId && s.styleId === styleId && s.active),
          videos: ctx.db.videos.find(v => v.eventId === eventId && v.styleId === styleId && v.active),
          music: chunkMusic,
          sections: ctx.db.sections.find(sec => musicIds.has(sec.musicId) && sec.active)
        };
        ctx.cache.put(chunkKey, JSON.stringify(chunkData), 600);
      }

      for (const s of chunkData.sessions) sessionsMap.set(s.id, s);
      for (const v of chunkData.videos) videosMap.set(v.id, v);
      for (const mus of chunkData.music) musicMap.set(mus.id, mus);
      for (const sec of chunkData.sections) sectionsMap.set(sec.id, sec);
    }
  }

  // Attendance
  const attendance: { sessionId: string; present: boolean }[] = [];
  const memberId = 'M-' + matricKey;

  for (const [eventId, styleSet] of eventStylesMap.entries()) {
    for (const styleId of styleSet) {
      const attRec = ctx.db.attendanceSheets.find(
        a => a.eventId === eventId && a.styleId === styleId && a.active
      )[0];
      if (!attRec) continue;

      const curAttVer = Number(ctx.cache.get(`attv:${eventId}:${styleId}`) || 1);
      const cachedGridStr = ctx.cache.get(`att:${eventId}:${styleId}:${curAttVer}`);
      let presentMap: Record<string, string[]> | null = null;
      let gridSessions: ClassSession[] = [];

      if (cachedGridStr) {
        try {
          const parsed = JSON.parse(cachedGridStr);
          presentMap = parsed.present;
          gridSessions = parsed.sessions;
        } catch {
          // ignore
        }
      }

      if (!presentMap) {
        const sheet = ctx.drive.openSpreadsheet(attRec.spreadsheetId).sheet('Attendance');
        const data = sheet ? sheet.getDisplayValues() : [];
        if (data.length >= 2) {
          const keyRow = data[0];
          const mIdCol = keyRow.indexOf('memberId');
          gridSessions = ctx.db.sessions
            .find(s => s.eventId === eventId && s.styleId === styleId && s.active)
            .sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq);
          const sessCols = gridSessions
            .map(s => ({ id: s.id, colIdx: keyRow.indexOf(s.id) }))
            .filter(x => x.colIdx !== -1);

          presentMap = {};
          for (let r = 2; r < data.length; r++) {
            const rowMId = data[r][mIdCol];
            if (!rowMId) continue;
            presentMap[rowMId] = sessCols.filter(sc => data[r][sc.colIdx] === '/').map(sc => sc.id);
          }
        }
      }

      if (presentMap) {
        const attended = new Set(presentMap[memberId] || []);
        for (const s of gridSessions) {
          attendance.push({ sessionId: s.id, present: attended.has(s.id) });
        }
      }
    }
  }

  const styles = ctx.db.styles.find(s => allDancerStyleIds.has(s.id) && s.active);
  const instructorIds = new Set(Array.from(sessionsMap.values()).map(s => s.instructorId).filter(Boolean));
  const instructors = ctx.db.instructors.find(i => instructorIds.has(i.id) && i.active);

  return {
    profile: {
      matricKey,
      fullName: dancer.fullName,
      eventIds: dancerEventIds,
      perms
    },
    events: dancerEvents.map(e => ({
      id: e.id, name: e.name, type: e.type, startDate: e.startDate, endDate: e.endDate, status: e.status, styleIds: e.styleIds
    })),
    styles,
    instructors,
    sessions: Array.from(sessionsMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    attendance,
    videos: Array.from(videosMap.values()),
    music: Array.from(musicMap.values()),
    sections: Array.from(sectionsMap.values())
  };
}

export function getBootstrapRoutes(): Record<string, Route> {
  return {
    'admin.bootstrap': {
      perm: 'signedIn',
      write: false,
      handler: (ctx, auth, payload: any) => {
        if (!auth || auth.claims.role !== 'admin') {
          throw new AppError('FORBIDDEN', 'Admin access required');
        }
        return getAdminBootstrap(
          ctx,
          auth.claims.sub,
          auth.claims.name,
          auth.claims.perms,
          payload?.sinceVersion
        );
      }
    },

    'dancer.bootstrap': {
      perm: 'signedIn',
      write: false,
      handler: (ctx, auth, payload: any) => {
        if (!auth || auth.claims.role !== 'dancer') {
          throw new AppError('FORBIDDEN', 'Dancer access required');
        }
        return getDancerBootstrap(
          ctx,
          auth.claims.sub.replace(/^M-/, ''),
          auth.claims.perms,
          payload?.sinceVersion
        );
      }
    }
  };
}
