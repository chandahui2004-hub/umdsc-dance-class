import { Route } from '../router';
import { AppError } from '../errors';
import { normalizeMatric, fullNameMatches, maskMatric, nameSimilarity, levenshtein } from '../logic/normalize';
import { verifyPassword, passwordFingerprint } from '../security/passwords';
import { loginDirectory } from './adminAccounts';
import { signToken } from '../security/tokens';
import { resolvePermissions } from '../logic/permissions';
import { TokenClaims, PermissionCode, DancerBootstrap } from '@umdsc/shared';
import { peekAdminBootstrap, peekDancerBootstrap, getWalkInBootstrap } from './bootstrap';
import { ensureEventSheets } from './eventSheets';
import { createTimer, logTimings } from '../logic/timing';

export function getAuthRoutes(): Record<string, Route> {
  return {
    'auth.adminLogin': {
      perm: 'public',
      write: false,
      handler: (ctx, auth, payload: any) => {
        const username = payload?.username ? String(payload.username).trim() : '';
        const password = payload?.password ? String(payload.password) : '';

        if (!username || !password) {
          throw new AppError('VALIDATION', 'Username and password are required');
        }

        // Accounts come from the server cache, so a login normally reads no sheet
        const directory = loginDirectory(ctx);
        // Phone keyboards capitalise the first letter, so capitals are ignored when only one account fits
        const sameCase = directory.admins.filter(a => a.username.toLowerCase() === username.toLowerCase());
        const admin = directory.admins.find(a => a.username === username) || (sameCase.length === 1 ? sameCase[0] : undefined);
        const hmac = (ctx as any)._secrets?.hmac;
        const secret: string = (ctx as any)._secrets?.tokenSecret || '';

        if (!admin) {
          throw new AppError('UNAUTHORIZED', 'Invalid username or password');
        }
        // A correct password seen in the last 6 hours skips the 2,000 hashing rounds
        const fastKey = 'pwok:' + admin.username;
        const fingerprint = secret ? passwordFingerprint(password, admin.passwordHash, secret, hmac) : '';
        const fast = Boolean(fingerprint) && ctx.cache.get(fastKey) === fingerprint;
        if (!fast) {
          if (!verifyPassword(password, admin, hmac)) {
            throw new AppError('UNAUTHORIZED', 'Invalid username or password');
          }
          if (fingerprint) ctx.cache.put(fastKey, fingerprint, 6 * 3600);
        }

        const rolePermsList = directory.rolePerms[admin.roleId] || [];

        const perms = resolvePermissions({
          roleIds: [admin.roleId],
          memberRoles: [],
          rolePerms: { [admin.roleId]: rolePermsList }
        });

        const pv = Number(ctx.props.get('PERM_VERSION') || 1);
        const exp = Math.floor(ctx.now().getTime() / 1000) + 12 * 3600;

        const roleInfo = directory.roles?.[admin.roleId] || ctx.db.roles.find(r => r.id === admin.roleId && r.active)[0];
        const roleName = roleInfo?.name || 'Admin';

        const claims: TokenClaims = {
          sub: admin.username,
          role: 'admin',
          name: admin.displayName,
          roleName,
          roleId: admin.roleId,
          exp,
          pv,
          perms
        };

        const token = signToken(claims, (ctx as any)._secrets?.tokenSecret, hmac);

        // Token first: the starting data loads afterwards unless it is already cached
        const bootstrap = peekAdminBootstrap(ctx, admin.username, admin.displayName, perms);

        return { token, claims, ...(bootstrap ? { bootstrap } : {}) };
      }
    },

    'auth.dancerLogin': {
      perm: 'public',
      write: false,
      handler: (ctx, auth, payload: any) => {
        const timer = createTimer();
        const fullName = payload?.fullName ? String(payload.fullName).trim() : '';
        const matric = payload?.matric ? String(payload.matric).trim() : '';

        if (!matric) {
          throw new AppError('VALIDATION', 'Matric number is required');
        }

        const matricKey = normalizeMatric(matric);

        const dancer = ctx.db.memberIndex.find(m => m.matricKey === matricKey && m.active)[0];
        if (!dancer) {
          throw new AppError(
            'NOT_REGISTERED',
            "Matric number and name don't match a registered dancer. Type your full name as on the registration form."
          );
        }

        if (fullName && !fullNameMatches(fullName, dancer.fullName)) {
          throw new AppError(
            'NOT_REGISTERED',
            "Matric number and name don't match a registered dancer. Type your full name as on the registration form."
          );
        }

        timer.mark('memberIndex');

        // Fetch Dancer role + MemberRoles extras
        const dancerRole = ctx.db.roles.find(
          r => r.name === 'Dancer' && r.loginType === 'dancer' && r.active
        )[0] || { id: 'role_dancer' };

        timer.mark('roles');
        const memberRoles = ctx.db.memberRoles.find(
          mr => mr.matricKey === matricKey && mr.active
        );
        timer.mark('memberRoles');

        const allRoleIds = Array.from(
          new Set([dancerRole.id, ...memberRoles.map(mr => mr.roleId)])
        );

        const rolePerms: Record<string, PermissionCode[]> = {};
        for (const rId of allRoleIds) {
          rolePerms[rId] = ctx.db.rolePermissions
            .find(rp => rp.roleId === rId && rp.active)
            .map(rp => rp.permission);
        }

        timer.mark('rolePermissions');

        const perms = resolvePermissions({
          roleIds: [dancerRole.id],
          memberRoles: memberRoles.map(mr => ({
            roleId: mr.roleId,
            styleIds: mr.styleIds
          })),
          rolePerms
        });

        const pv = Number(ctx.props.get('PERM_VERSION') || 1);
        const exp = Math.floor(ctx.now().getTime() / 1000) + 30 * 24 * 3600;

        const sub = dancer.id && dancer.id.startsWith('M-') ? dancer.id : 'M-' + matricKey;

        const claims: TokenClaims = {
          sub,
          role: 'dancer',
          name: dancer.fullName,
          roleName: 'Dancer',
          roleId: dancerRole.id,
          exp,
          pv,
          perms
        };

        const hmac = (ctx as any)._secrets?.hmac;
        const token = signToken(claims, (ctx as any)._secrets?.tokenSecret, hmac);
        timer.mark('sign');

        // Token first: the calendar (dancer.bootstrap) and attendance (dancer.attendance) load afterwards.
        // If the calendar is already cached it rides along for free, saving a round trip.
        const bootstrap = peekDancerBootstrap(ctx, matricKey);
        const timings = timer.result();
        logTimings('auth.dancerLogin', timings);
        return {
          token,
          claims,
          ...(bootstrap ? { bootstrap } : {}),
          ...(payload?.debugTimings === true ? { timings } : {})
        };
      }
    },

    'auth.suggestDancers': {
      perm: 'public',
      write: false,
      handler: (ctx, auth, payload: any) => {
        const query = payload?.query ? String(payload.query).trim() : '';
        const type = payload?.type === 'matric' ? 'matric' : 'name';

        if (type === 'name' && query.length < 2) {
          return { suggestions: [] };
        }
        if (type === 'matric' && query.length < 3) {
          return { suggestions: [] };
        }

        const rawMembers = ctx.db.memberIndex.find(
          m => m.active && m.fullName && m.matricKey && m.eventIds && m.eventIds.length > 0
        );
        if (rawMembers.length === 0) return { suggestions: [] };

        const seenMatric = new Set<string>();
        const members: typeof rawMembers = [];
        for (const m of rawMembers) {
          const normKey = normalizeMatric(m.matricKey);
          if (!seenMatric.has(normKey)) {
            seenMatric.add(normKey);
            members.push(m);
          }
        }

        let scored: { member: typeof members[0]; score: number }[] = [];

        if (type === 'name') {
          const qLower = query.toLowerCase();
          scored = members.map(m => {
            const mName = m.fullName.toLowerCase();
            let score = nameSimilarity(query, m.fullName);
            if (mName.startsWith(qLower)) score += 1.0;
            else if (mName.includes(qLower)) score += 0.5;
            return { member: m, score };
          });
        } else {
          const normQ = normalizeMatric(query);
          scored = members.map(m => {
            let score = 0;
            const normM = m.matricKey;
            if (normM.startsWith(normQ)) score = 2.0;
            else if (normM.includes(normQ)) score = 1.0;
            else {
              const dist = levenshtein(normQ, normM);
              score = Math.max(0, 1 - dist / Math.max(normQ.length, normM.length));
            }
            return { member: m, score };
          });
        }

        scored.sort((a, b) => b.score - a.score);

        // Filter top scoring above threshold, or fallback to top 1 closest if none match well
        const MATCH_THRESHOLD = 0.25;
        let top = scored.filter(s => s.score >= MATCH_THRESHOLD).slice(0, 3);
        if (top.length === 0 && scored.length > 0) {
          top = [scored[0]];
        }

        const suggestions = top.map(s => ({
          fullName: s.member.fullName,
          matric: s.member.matricKey,
          matricMasked: s.member.matricKey
        }));

        return { suggestions };
      }
    },

    'auth.walkInLogin': {
      perm: 'public',
      write: true,
      bumpsData: false,
      handler: (ctx, auth, payload: any) => {
        const code = String(payload?.code || '').trim().toUpperCase();
        const name = String(payload?.name || '').trim();

        if (!code || !name) {
          throw new AppError('VALIDATION', 'Class code and name are required');
        }

        // Find session by walkInCode or deterministic fallback
        const session = ctx.db.sessions.find(s => {
          if (!s.active) return false;
          if (s.walkInCode && s.walkInCode.toUpperCase() === code) return true;
          const fallbackCode = (s.styleId.replace(/[^A-Za-z]/g, '').slice(0, 3) + '-' + s.id.replace(/[^A-Za-z0-9]/g, '').slice(-3)).toUpperCase();
          return fallbackCode === code;
        })[0];

        if (!session) {
          throw new AppError('NOT_FOUND', 'Invalid or inactive class code');
        }

        // Log into Attendance spreadsheet Walk-ins tab
        let attRec = ctx.db.attendanceSheets.find(
          a => a.eventId === session.eventId && a.styleId === session.styleId && a.active
        )[0];
        if (!attRec) {
          try {
            const ev = ctx.db.events.get(session.eventId);
            if (ev) {
              ensureEventSheets(ctx, ev);
              attRec = ctx.db.attendanceSheets.find(
                a => a.eventId === session.eventId && a.styleId === session.styleId && a.active
              )[0];
            }
          } catch {
            // ignore
          }
        }
        if (attRec && attRec.spreadsheetId) {
          try {
            const ss = ctx.drive.openSpreadsheet(attRec.spreadsheetId);
            let walkInSheet = ss.sheet('Walk-ins');
            if (!walkInSheet) {
              walkInSheet = ss.addSheet('Walk-ins', ['Timestamp', 'Dancer Name', 'Class Date', 'Session Seq', 'Class Code']);
            }
            walkInSheet.appendRows([[ctx.now().toISOString(), name, session.date, session.seq, code]]);
          } catch (err) {
            console.error('Failed to log walk-in attendance:', err);
          }
        }

        const sub = 'W-' + session.id + '-' + encodeURIComponent(name.toLowerCase());
        const perms = {
          'calendar.view': [session.styleId],
          'videos.view': [session.styleId],
          'music.view': [session.styleId]
        };

        const claims: TokenClaims = {
          sub,
          role: 'dancer',
          name: `${name} (Walk-In)`,
          exp: Math.floor(ctx.now().getTime() / 1000) + 10 * 365 * 24 * 3600,
          perms
        };

        const hmac = (ctx as any)._secrets?.hmac;
        const secret: string = (ctx as any)._secrets?.tokenSecret || '';
        const token = signToken(claims, secret, hmac);

        const bootstrap = getWalkInBootstrap(ctx, claims) as DancerBootstrap;

        return {
          token,
          claims,
          bootstrap
        };
      }
    },

    'auth.me': {
      perm: 'signedIn',
      write: false,
      handler: (ctx, auth) => {
        return auth!.claims;
      }
    }
  };
}
