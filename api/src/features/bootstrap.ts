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
  Section,
  EventItem
} from '@umdsc/shared';
import { withoutUploaderEmail } from './masterData';
import { dancerStylesInEvent } from './eventMembers';
import { ensureEventSheets } from './eventSheets';
import { safeCachePut } from '../logic/cache';
import { createTimer, logTimings, type Timer } from '../logic/timing';

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
    const videos = ctx.db.videos.find(v => v.active);
    const music = ctx.db.music.find(m => m.active);
    const sections = ctx.db.sections.find(s => s.active);

    sharedData = { styles, instructors, sessions, roles: roles as any, events, settings, videos, music, sections };
    safeCachePut(ctx.cache, cacheKey, JSON.stringify(sharedData), 600);
  }

  return {
    profile: { username, displayName, perms },
    ...sharedData
  };
}

/** The dancer's MemberIndex row, from the 10-minute cache when present. */
function loadDancerIndex(ctx: Ctx, matricKey: string): any {
  const miKey = 'mi:' + matricKey;
  const miCached = ctx.cache.get(miKey);
  if (miCached) {
    try {
      return JSON.parse(miCached);
    } catch {
      // fall through to the sheet
    }
  }

  const dancer = ctx.db.memberIndex.find(m => m.matricKey === matricKey && m.active)[0];
  if (!dancer) {
    throw new AppError('NOT_FOUND', 'Dancer record not found');
  }
  safeCachePut(ctx.cache, miKey, JSON.stringify(dancer), 600);
  return dancer;
}

/** The dancer's events, and which styles they take in each (limited by calendar.view). */
function resolveDancerEventStyles(
  ctx: Ctx,
  dancer: any,
  matricKey: string,
  perms: PermMap,
  timer?: Timer
): { dancerEvents: EventItem[]; eventStylesMap: Map<string, Set<string>> } {
  const dancerEventIds: string[] = dancer.eventIds || [];
  const dancerEvents = ctx.db.events.find(e => e.active && dancerEventIds.includes(e.id));
  timer?.mark('events');

  const eventStylesMap = new Map<string, Set<string>>();
  const calPerm = perms['calendar.view'];
  for (const event of dancerEvents) {
    const styleSet = new Set<string>();
    // Styles stored at sync time need no sheet read; dancers indexed before that fall back to the Members sheet.
    const stored = dancer.eventStyles?.[event.id];
    if (Array.isArray(stored) && stored.length > 0) {
      for (const sId of stored) styleSet.add(sId);
    }
    if (styleSet.size === 0) {
      try {
        for (const sId of dancerStylesInEvent(ctx, event, matricKey)) styleSet.add(sId);
      } catch {
        // unreadable Members sheet: the dancer simply sees nothing for this event
      }
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
  timer?.mark('styles');

  return { dancerEvents, eventStylesMap };
}

/** The signed-in dancer's own attendance per class. Loaded after the calendar so login never waits on it. */
export function getDancerAttendance(
  ctx: Ctx,
  matricKey: string,
  perms: PermMap,
  timer?: Timer
): { sessionId: string; present: boolean }[] {
  const dancer = loadDancerIndex(ctx, matricKey);
  const { eventStylesMap } = resolveDancerEventStyles(ctx, dancer, matricKey, perms, timer);

  const attendance: { sessionId: string; present: boolean }[] = [];
  const memberId = 'M-' + matricKey;

  for (const [eventId, styleSet] of eventStylesMap.entries()) {
    for (const styleId of styleSet) {
      let attRec = ctx.db.attendanceSheets.find(
        a => a.eventId === eventId && a.styleId === styleId && a.active
      )[0];
      if (!attRec) {
        try {
          const ev = ctx.db.events.get(eventId);
          if (ev) {
            ensureEventSheets(ctx, ev);
            attRec = ctx.db.attendanceSheets.find(
              a => a.eventId === eventId && a.styleId === styleId && a.active
            )[0];
          }
        } catch {
          // ignore
        }
      }
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

          safeCachePut(
            ctx.cache,
            `att:${eventId}:${styleId}:${curAttVer}`,
            JSON.stringify({ present: presentMap, sessions: gridSessions }),
            600
          );
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

  timer?.mark('attendance');
  return attendance;
}

export interface DancerChunk {
  sessions: ClassSession[];
  videos: VideoItem[];
  music: MusicItem[];
  sections: Section[];
}

/** One event+style's shared content (same for every dancer in it), cached per data version. */
export function getDancerChunk(ctx: Ctx, eventId: string, styleId: string, dataVersion: number): DancerChunk {
  const chunkKey = `boot:chunk:${eventId}:${styleId}:${dataVersion}`;
  const cachedChunk = ctx.cache.get(chunkKey);
  if (cachedChunk) {
    try {
      return JSON.parse(cachedChunk);
    } catch {
      // rebuild below
    }
  }

  const chunkMusic = ctx.db.music.find(mus => mus.eventId === eventId && mus.styleId === styleId && mus.active);
  const musicIds = new Set(chunkMusic.map(mus => mus.id));
  const chunkData: DancerChunk = {
    sessions: ctx.db.sessions.find(s => s.eventId === eventId && s.styleId === styleId && s.active),
    videos: ctx.db.videos.find(v => v.eventId === eventId && v.styleId === styleId && v.active),
    music: chunkMusic,
    sections: ctx.db.sections.find(sec => musicIds.has(sec.musicId) && sec.active)
  };
  safeCachePut(ctx.cache, chunkKey, JSON.stringify(chunkData), 600);
  return chunkData;
}

/**
 * The dancer's calendar data only if it is already cached for the current data version. Never reads
 * a sheet, so login can include it for free on a repeat visit and skip a second round trip.
 */
export function peekDancerBootstrap(ctx: Ctx, matricKey: string): DancerBootstrap | null {
  const dataVersion = Number(ctx.props.get('DATA_VERSION') || 1);
  const cached = ctx.cache.get(`boot:dancer:${matricKey}:${dataVersion}`);
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

export function getDancerBootstrap(
  ctx: Ctx,
  matricKey: string,
  perms: PermMap,
  sinceVersion?: number,
  timer?: Timer
): DancerBootstrap | { notModified: true } {
  const dataVersion = Number(ctx.props.get('DATA_VERSION') || 1);
  if (sinceVersion !== undefined && Number(sinceVersion) === dataVersion) {
    return { notModified: true };
  }

  const dancerBootKey = `boot:dancer:${matricKey}:${dataVersion}`;
  const cachedDancerBoot = ctx.cache.get(dancerBootKey);
  if (cachedDancerBoot) {
    try {
      return JSON.parse(cachedDancerBoot);
    } catch {
      // ignore
    }
  }

  const dancer = loadDancerIndex(ctx, matricKey);
  const dancerEventIds: string[] = dancer.eventIds || [];
  const { dancerEvents, eventStylesMap } = resolveDancerEventStyles(ctx, dancer, matricKey, perms, timer);

  const sessionsMap = new Map<string, ClassSession>();
  const videosMap = new Map<string, VideoItem>();
  const musicMap = new Map<string, MusicItem>();
  const sectionsMap = new Map<string, Section>();
  const allDancerStyleIds = new Set<string>();

  for (const [eventId, styleSet] of eventStylesMap.entries()) {
    for (const styleId of styleSet) {
      allDancerStyleIds.add(styleId);

      const chunkData = getDancerChunk(ctx, eventId, styleId, dataVersion);
      for (const s of chunkData.sessions) sessionsMap.set(s.id, s);
      for (const v of chunkData.videos) videosMap.set(v.id, v);
      for (const mus of chunkData.music) musicMap.set(mus.id, mus);
      for (const sec of chunkData.sections) sectionsMap.set(sec.id, sec);
    }
  }

  timer?.mark('chunks');

  const styles = ctx.db.styles.find(s => allDancerStyleIds.has(s.id) && s.active);
  const instructorIds = new Set(Array.from(sessionsMap.values()).map(s => s.instructorId).filter(Boolean));
  for (const st of styles) {
    if (st.defaultInstructorId) instructorIds.add(st.defaultInstructorId);
  }
  const instructors = ctx.db.instructors.find(i => (instructorIds.size === 0 ? true : instructorIds.has(i.id)) && i.active);

  const result: DancerBootstrap = {
    profile: {
      matricKey,
      fullName: dancer.fullName,
      eventIds: dancerEventIds,
      perms
    },
    events: dancerEvents.map(e => ({
      id: e.id, name: e.name, type: e.type, startDate: e.startDate, endDate: e.endDate, status: e.status, styleIds: e.styleIds
    })),
    styles: styles.map(withoutUploaderEmail),
    instructors,
    sessions: Array.from(sessionsMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    attendance: [],
    videos: Array.from(videosMap.values()),
    music: Array.from(musicMap.values()),
    sections: Array.from(sectionsMap.values())
  };

  safeCachePut(ctx.cache, dancerBootKey, JSON.stringify(result), 300);

  return result;
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
        const timer = createTimer();
        const result = getDancerBootstrap(
          ctx,
          auth.claims.sub.replace(/^M-/, ''),
          auth.claims.perms,
          payload?.sinceVersion,
          timer
        );
        logTimings('dancer.bootstrap', timer.result());
        return result;
      }
    },

    'dancer.attendance': {
      perm: 'signedIn',
      write: false,
      handler: (ctx, auth) => {
        if (!auth || auth.claims.role !== 'dancer') {
          throw new AppError('FORBIDDEN', 'Dancer access required');
        }
        const timer = createTimer();
        const result = getDancerAttendance(ctx, auth.claims.sub.replace(/^M-/, ''), auth.claims.perms, timer);
        logTimings('dancer.attendance', timer.result());
        return result;
      }
    }
  };
}
