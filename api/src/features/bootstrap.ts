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
  Month
} from '@umdsc/shared';

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
    const months = Array.from(new Set(ctx.db.memberMonths.find(m => m.active).map(m => m.month))).sort();
    const settings: Record<string, string> = {};
    for (const s of ctx.db.settings.find(s => s.active)) {
      settings[s.key] = s.value;
    }
    settings.clubEmail = ctx.clubEmail;

    sharedData = { styles, instructors, sessions, roles, months, settings };
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

  const dancerMonths: Month[] = dancer.months || [];

  // Determine dancer's styleIds per month
  const monthStylesMap = new Map<string, Set<string>>();

  for (const m of dancerMonths) {
    const styleSet = new Set<string>();
    const mm = ctx.db.memberMonths.find(row => row.month === m && row.active)[0];
    if (mm && mm.membersSpreadsheetId) {
      try {
        const memSs = ctx.drive.openSpreadsheet(mm.membersSpreadsheetId);
        const memSheet = memSs.sheet('Members') || (memSs as any).getSheet?.('Members');
        if (memSheet) {
          const rows = memSheet.getDisplayValues();
          const headers = rows[0] || [];
          const matricIdx = headers.indexOf('matricKey');
          const stylesIdx = headers.indexOf('styleIds');
          for (let i = 1; i < rows.length; i++) {
            if (rows[i][matricIdx] === matricKey) {
              const sIds = String(rows[i][stylesIdx] || '').split(',').map(s => s.trim()).filter(Boolean);
              for (const sId of sIds) styleSet.add(sId);
              break;
            }
          }
        }
      } catch {
        // ignore
      }
    }

    // Add extra member roles styles
    const memberRoles = ctx.db.memberRoles.find(mr => mr.matricKey === matricKey && mr.active);
    for (const mr of memberRoles) {
      for (const sId of mr.styleIds || []) {
        styleSet.add(sId);
      }
    }

    // Apply calendar.view perm restriction if array
    const calPerm = perms['calendar.view'];
    if (Array.isArray(calPerm)) {
      for (const sId of Array.from(styleSet)) {
        if (!calPerm.includes(sId)) {
          styleSet.delete(sId);
        }
      }
    }

    monthStylesMap.set(m, styleSet);
  }

  const sessionsMap = new Map<string, ClassSession>();
  const videosMap = new Map<string, VideoItem>();
  const musicMap = new Map<string, MusicItem>();
  const sectionsMap = new Map<string, Section>();
  const allDancerStyleIds = new Set<string>();

  for (const [m, styleSet] of monthStylesMap.entries()) {
    for (const styleId of styleSet) {
      allDancerStyleIds.add(styleId);

      // Check chunk cache
      const chunkKey = `boot:chunk:${m}:${styleId}:${dataVersion}`;
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
        const chunkSessions = ctx.db.sessions.find(s => s.month === m && s.styleId === styleId && s.active);
        const chunkVideos = ctx.db.videos.find(v => v.month === m && v.styleId === styleId && v.active);
        const chunkMusic = ctx.db.music.find(mus => mus.month === m && mus.styleId === styleId && mus.active);
        const musicIds = new Set(chunkMusic.map(mus => mus.id));
        const chunkSections = ctx.db.sections.find(sec => musicIds.has(sec.musicId) && sec.active);

        chunkData = {
          sessions: chunkSessions,
          videos: chunkVideos,
          music: chunkMusic,
          sections: chunkSections
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

  for (const [m, styleSet] of monthStylesMap.entries()) {
    for (const styleId of styleSet) {
      const attRec = ctx.db.attendanceSheets.find(
        a => a.month === m && a.styleId === styleId && a.active
      )[0];
      if (!attRec) continue;

      const curAttVer = Number(ctx.cache.get(`attv:${m}:${styleId}`) || 1);
      const cachedGridStr = ctx.cache.get(`att:${m}:${styleId}:${curAttVer}`);
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
        const ss = ctx.drive.openSpreadsheet(attRec.spreadsheetId);
        const sheet = ss.sheet('Attendance') || (ss as any).getSheet?.('Attendance');
        if (sheet) {
          const data = sheet.getDisplayValues();
          if (data.length >= 2) {
            const keyRow = data[0];
            const mIdCol = keyRow.indexOf('memberId');
            gridSessions = ctx.db.sessions
              .find(s => s.month === m && s.styleId === styleId && s.active)
              .sort((a, b) => a.seq - b.seq);
            const sessCols = gridSessions
              .map(s => ({ id: s.id, colIdx: keyRow.indexOf(s.id) }))
              .filter(x => x.colIdx !== -1);

            presentMap = {};
            for (let r = 2; r < data.length; r++) {
              const rowMId = data[r][mIdCol];
              if (!rowMId) continue;
              presentMap[rowMId] = [];
              for (const sc of sessCols) {
                if (data[r][sc.colIdx] === '/') {
                  presentMap[rowMId].push(sc.id);
                }
              }
            }

            ctx.cache.put(
              `att:${m}:${styleId}:${curAttVer}`,
              JSON.stringify({ month: m, styleId, version: curAttVer, sessions: gridSessions, members: [], present: presentMap }),
              60
            );
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
      months: dancerMonths,
      perms
    },
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
