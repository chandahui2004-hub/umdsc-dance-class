import {
  ApiRequest,
  ApiResponse,
  PermissionCode,
  TokenClaims
} from '@umdsc/shared';
import { Ctx } from './ports';
import { AppError, toErrorBody } from './errors';
import { verifyToken, Hmac } from './security/tokens';
import { can } from './logic/permissions';
import { withScriptLock } from './db/lock';
import { getSetupRoutes } from './features/setup';
import { getAuthRoutes } from './features/auth';
import { getSettingsRoutes } from './features/settings';
import { getMasterDataRoutes } from './features/masterData';
import { getAccessRoutes } from './features/access';
import { getSessionRoutes } from './features/sessions';
import { getMemberRoutes } from './features/members';
import { getAttendanceRoutes } from './features/attendance';
import { getVideoRoutes } from './features/videos';
import { getMusicRoutes } from './features/music';
import { getBootstrapRoutes } from './features/bootstrap';
import { getResetRoutes } from './features/reset';
import { getEventRoutes } from './features/events';

export interface AuthInfo {
  claims: TokenClaims;
}

export interface Route<P = any, R = any> {
  perm: PermissionCode | 'public' | 'signedIn';
  write: boolean;
  bumpsData?: boolean;
  styleOf?: (p: P) => string | undefined;
  handler: (ctx: Ctx, auth: AuthInfo | null, payload: P) => R;
}

export const ROUTES: Record<string, Route> = {};

export function registerRoutes(routes: Record<string, Route>): void {
  for (const [action, route] of Object.entries(routes)) {
    ROUTES[action] = route;
  }
}

// Register built-in routes
registerRoutes(getSetupRoutes());
registerRoutes(getAuthRoutes());
registerRoutes(getSettingsRoutes());
registerRoutes(getMasterDataRoutes());
registerRoutes(getAccessRoutes());
registerRoutes(getSessionRoutes());
registerRoutes(getMemberRoutes());
registerRoutes(getAttendanceRoutes());
registerRoutes(getVideoRoutes());
registerRoutes(getMusicRoutes());
registerRoutes(getBootstrapRoutes());
registerRoutes(getResetRoutes());
registerRoutes(getEventRoutes());

export function handleRequest(
  req: ApiRequest,
  ctx: Ctx,
  secrets: { tokenSecret: string; hmac: Hmac }
): ApiResponse<unknown> {
  try {
    const route = ROUTES[req.action];
    if (!route) {
      throw new AppError('VALIDATION', `Unknown action: ${req.action}`);
    }

    let auth: AuthInfo | null = null;
    const now = ctx.now();
    const nowSec = Math.floor(now.getTime() / 1000);

    if (route.perm !== 'public') {
      if (!req.token) {
        throw new AppError('UNAUTHORIZED', 'Authentication token required');
      }

      const claims = verifyToken(req.token, secrets.tokenSecret, secrets.hmac, nowSec);

      // Verify token permission version (pv)
      const currentPv = Number(ctx.props.get('PERM_VERSION') || 1);
      if (claims.pv !== undefined && claims.pv < currentPv) {
        throw new AppError(
          'UNAUTHORIZED',
          'Session expired due to permission update, please re-login'
        );
      }

      auth = { claims };

      if (route.perm !== 'signedIn') {
        const styleId = route.styleOf ? route.styleOf(req.payload) : undefined;
        if (!can(claims.perms, route.perm, styleId)) {
          throw new AppError('FORBIDDEN', `Permission denied for action: ${req.action}`);
        }
      }
    }

    (ctx as any)._secrets = secrets;

    let result: unknown;

    if (route.write) {
      // Idempotency check with opId
      if (req.opId) {
        const cached = ctx.cache.get('op:' + req.opId);
        if (cached !== null) {
          try {
            const data = JSON.parse(cached);
            const dataVersion = Number(ctx.props.get('DATA_VERSION') || 1);
            return {
              ok: true,
              data,
              dataVersion,
              serverTime: now.toISOString()
            };
          } catch {
            // If json parse failed, continue
          }
        }
      }

      result = withScriptLock(ctx.lock, () => {
        const res = route.handler(ctx, auth, req.payload);

        if (route.bumpsData) {
          const nextDv = Number(ctx.props.get('DATA_VERSION') || 1) + 1;
          ctx.props.set('DATA_VERSION', String(nextDv));
        }

        if (req.opId) {
          ctx.cache.put('op:' + req.opId, JSON.stringify(res), 6 * 3600);
        }

        return res;
      });
    } else {
      result = route.handler(ctx, auth, req.payload);
    }

    const dataVersion = Number(ctx.props.get('DATA_VERSION') || 1);
    return {
      ok: true,
      data: result,
      dataVersion,
      serverTime: now.toISOString()
    };
  } catch (err) {
    console.error('handleRequest error:', err);
    return {
      ok: false,
      error: toErrorBody(err)
    };
  }

}
