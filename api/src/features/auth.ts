import { Route } from '../router';
import { AppError } from '../errors';
import { normalizeMatric, fullNameMatches } from '../logic/normalize';
import { verifyPassword } from '../security/passwords';
import { signToken } from '../security/tokens';
import { resolvePermissions } from '../logic/permissions';
import { TokenClaims, PermissionCode } from '@umdsc/shared';
import { getAdminBootstrap, peekDancerBootstrap } from './bootstrap';
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

        const admin = ctx.db.admins.find(a => a.username === username && a.active)[0];
        const hmac = (ctx as any)._secrets?.hmac;

        if (!admin || !verifyPassword(password, admin, hmac)) {
          throw new AppError('UNAUTHORIZED', 'Invalid username or password');
        }

        // Fetch role permissions
        const rolePermsList = ctx.db.rolePermissions
          .find(rp => rp.roleId === admin.roleId && rp.active)
          .map(rp => rp.permission);

        const perms = resolvePermissions({
          roleIds: [admin.roleId],
          memberRoles: [],
          rolePerms: { [admin.roleId]: rolePermsList }
        });

        const pv = Number(ctx.props.get('PERM_VERSION') || 1);
        const exp = Math.floor(ctx.now().getTime() / 1000) + 12 * 3600;

        const claims: TokenClaims = {
          sub: admin.username,
          role: 'admin',
          name: admin.displayName,
          exp,
          pv,
          perms
        };

        const token = signToken(claims, (ctx as any)._secrets?.tokenSecret, hmac);

        const bootstrap = getAdminBootstrap(
          ctx,
          admin.username,
          admin.displayName,
          perms
        );

        return { token, claims, bootstrap };
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

        if (!fullNameMatches(fullName, dancer.fullName)) {
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

        const claims: TokenClaims = {
          sub: 'M-' + matricKey,
          role: 'dancer',
          name: dancer.fullName,
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

    'auth.me': {
      perm: 'signedIn',
      write: false,
      handler: (ctx, auth) => {
        return auth!.claims;
      }
    }
  };
}
