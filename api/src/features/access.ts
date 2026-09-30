import { Route } from '../router';
import { AppError } from '../errors';
import { logAudit } from '../logic/audit';
import { validateRolePermissions } from '../logic/permissions';
import { hashPassword, PASSWORD_ITERATIONS } from '../security/passwords';
import { normalizeMatric } from '../logic/normalize';
import { PermissionCode } from '@umdsc/shared';

function bumpPermVersion(ctx: any): void {
  const current = Number(ctx.props.get('PERM_VERSION') || 1);
  ctx.props.set('PERM_VERSION', String(current + 1));
}

function generateSalt(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function getAccessRoutes(): Record<string, Route> {
  return {
    'admins.list': {
      perm: 'admins.manage',
      write: false,
      handler: (ctx) => {
        const admins = ctx.db.admins.find(a => a.active);
        return admins.map(({ passwordHash, salt, ...rest }) => rest);
      }
    },

    'admins.create': {
      perm: 'admins.manage',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const username = String(payload?.username || '').trim();
        const displayName = String(payload?.displayName || '').trim();
        const password = String(payload?.password || '');
        const roleId = String(payload?.roleId || '').trim();

        if (!username || !displayName || !password || !roleId) {
          throw new AppError('VALIDATION', 'username, displayName, password, and roleId are required');
        }

        const existing = ctx.db.admins.find(a => a.username === username && a.active)[0];
        if (existing) {
          throw new AppError('VALIDATION', `Admin username "${username}" is already taken`);
        }

        const actor = auth?.claims.sub || 'system';
        const salt = generateSalt();
        const hmac = (ctx as any)._secrets?.hmac;
        const passwordHash = hashPassword(password, salt, PASSWORD_ITERATIONS, hmac);

        const inserted = ctx.db.admins.insert(
          {
            username,
            displayName,
            passwordHash,
            salt,
            iterations: PASSWORD_ITERATIONS,
            roleId
          },
          actor,
          ctx.now()
        );

        logAudit(ctx, actor, 'admins.create', username);
        const { passwordHash: _, salt: __, ...safe } = inserted;
        return safe;
      }
    },

    'admins.update': {
      perm: 'admins.manage',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { id, version, displayName, roleId, active } = payload || {};
        if (!id || version === undefined) {
          throw new AppError('VALIDATION', 'id and version are required');
        }

        const existing = ctx.db.admins.find(a => a.id === id && a.active)[0];
        if (!existing) {
          throw new AppError('NOT_FOUND', `Admin not found: ${id}`);
        }

        if (existing.version !== Number(version)) {
          throw new AppError('VERSION_CONFLICT', 'Admin has been modified by another user', false, existing);
        }

        if (active === false || active === 'FALSE') {
          const activeAdmins = ctx.db.admins.find(a => a.active);
          if (activeAdmins.length <= 1) {
            throw new AppError('VALIDATION', 'Cannot deactivate the last active admin');
          }
        }

        const actor = auth?.claims.sub || 'system';
        const updates: any = {};
        if (displayName !== undefined) updates.displayName = displayName;
        if (roleId !== undefined) updates.roleId = roleId;
        if (active !== undefined) updates.active = active;

        const updated = ctx.db.admins.update(id, version, updates, actor, ctx.now());
        logAudit(ctx, actor, 'admins.update', existing.username);
        const { passwordHash: _, salt: __, ...safe } = updated;
        return safe;
      }
    },

    'admins.resetPassword': {
      perm: 'admins.manage',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { id, version, newPassword } = payload || {};
        if (!id || version === undefined || !newPassword) {
          throw new AppError('VALIDATION', 'id, version, and newPassword are required');
        }

        const existing = ctx.db.admins.find(a => a.id === id && a.active)[0];
        if (!existing) {
          throw new AppError('NOT_FOUND', `Admin not found: ${id}`);
        }

        if (existing.version !== Number(version)) {
          throw new AppError('VERSION_CONFLICT', 'Admin has been modified by another user', false, existing);
        }

        const actor = auth?.claims.sub || 'system';
        const salt = generateSalt();
        const hmac = (ctx as any)._secrets?.hmac;
        const passwordHash = hashPassword(newPassword, salt, PASSWORD_ITERATIONS, hmac);

        ctx.db.admins.update(
          id,
          version,
          {
            passwordHash,
            salt,
            iterations: PASSWORD_ITERATIONS
          },
          actor,
          ctx.now()
        );

        logAudit(ctx, actor, 'admins.resetPassword', existing.username);
        return { success: true };
      }
    },

    'roles.list': {
      perm: 'roles.manage',
      write: false,
      handler: (ctx) => {
        const roles = ctx.db.roles.find(r => r.active);
        const permsList = ctx.db.rolePermissions.find(rp => rp.active);

        const permMap: Record<string, PermissionCode[]> = {};
        for (const rp of permsList) {
          if (!permMap[rp.roleId]) permMap[rp.roleId] = [];
          permMap[rp.roleId].push(rp.permission);
        }

        return roles.map(r => ({
          ...r,
          permissions: permMap[r.id] || []
        }));
      }
    },

    'roles.create': {
      perm: 'roles.manage',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const name = String(payload?.name || '').trim();
        const description = String(payload?.description || '').trim();
        const loginType = payload?.loginType === 'admin' ? 'admin' : 'dancer';

        if (!name) {
          throw new AppError('VALIDATION', 'Role name is required');
        }

        const actor = auth?.claims.sub || 'system';
        const inserted = ctx.db.roles.insert(
          {
            name,
            description,
            loginType,
            isSystem: false
          },
          actor,
          ctx.now()
        );

        bumpPermVersion(ctx);
        logAudit(ctx, actor, 'roles.create', name);
        return inserted;
      }
    },

    'roles.update': {
      perm: 'roles.manage',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { id, version, name, description } = payload || {};
        if (!id || version === undefined) {
          throw new AppError('VALIDATION', 'id and version are required');
        }

        const existing = ctx.db.roles.find(r => r.id === id && r.active)[0];
        if (!existing) {
          throw new AppError('NOT_FOUND', `Role not found: ${id}`);
        }

        if (existing.version !== Number(version)) {
          throw new AppError('VERSION_CONFLICT', 'Role has been modified by another user', false, existing);
        }

        const actor = auth?.claims.sub || 'system';
        const updates: any = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;

        const updated = ctx.db.roles.update(id, version, updates, actor, ctx.now());
        bumpPermVersion(ctx);
        logAudit(ctx, actor, 'roles.update', existing.name);
        return updated;
      }
    },

    'roles.deactivate': {
      perm: 'roles.manage',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { id, version } = payload || {};
        if (!id || version === undefined) {
          throw new AppError('VALIDATION', 'id and version are required');
        }

        const existing = ctx.db.roles.find(r => r.id === id && r.active)[0];
        if (!existing) {
          throw new AppError('NOT_FOUND', `Role not found: ${id}`);
        }

        if (existing.isSystem) {
          throw new AppError('VALIDATION', 'Cannot deactivate a system role');
        }

        if (existing.version !== Number(version)) {
          throw new AppError('VERSION_CONFLICT', 'Role has been modified by another user', false, existing);
        }

        const actor = auth?.claims.sub || 'system';
        ctx.db.roles.deactivate(id, Number(version), actor, ctx.now());
        bumpPermVersion(ctx);
        logAudit(ctx, actor, 'roles.deactivate', existing.name);
        return { success: true };
      }
    },

    'roles.setPermissions': {
      perm: 'roles.manage',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const roleId = String(payload?.roleId || '').trim();
        const permissions: PermissionCode[] = Array.isArray(payload?.permissions) ? payload.permissions : [];

        if (!roleId) {
          throw new AppError('VALIDATION', 'roleId is required');
        }

        const role = ctx.db.roles.find(r => r.id === roleId && r.active)[0];
        if (!role) {
          throw new AppError('NOT_FOUND', `Role not found: ${roleId}`);
        }

        validateRolePermissions(role, permissions);

        const actor = auth?.claims.sub || 'system';

        // Deactivate existing rolePermissions
        const oldPerms = ctx.db.rolePermissions.find(rp => rp.roleId === roleId && rp.active);
        for (const op of oldPerms) {
          ctx.db.rolePermissions.deactivate(op.id, op.version, actor, ctx.now());
        }

        // Insert new rolePermissions
        for (const p of permissions) {
          ctx.db.rolePermissions.insert({ roleId, permission: p }, actor, ctx.now());
        }

        bumpPermVersion(ctx);
        logAudit(ctx, actor, 'roles.setPermissions', role.name, JSON.stringify(permissions));
        return { roleId, permissions };
      }
    },

    'memberRoles.list': {
      perm: 'roles.manage',
      write: false,
      handler: (ctx, auth, payload: any) => {
        const roleId = payload?.roleId ? String(payload.roleId).trim() : '';
        let list = ctx.db.memberRoles.find(mr => mr.active);
        if (roleId) {
          list = list.filter(mr => mr.roleId === roleId);
        }
        return list;
      }
    },

    'memberRoles.assign': {
      perm: 'roles.manage',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const matricKey = normalizeMatric(payload?.matricKey);
        const roleId = String(payload?.roleId || '').trim();
        const styleIds: string[] = Array.isArray(payload?.styleIds) ? payload.styleIds : [];

        if (!matricKey || !roleId) {
          throw new AppError('VALIDATION', 'matricKey and roleId are required');
        }

        const actor = auth?.claims.sub || 'system';
        const inserted = ctx.db.memberRoles.insert(
          {
            matricKey,
            roleId,
            styleIds
          },
          actor,
          ctx.now()
        );

        bumpPermVersion(ctx);
        logAudit(ctx, actor, 'memberRoles.assign', matricKey, JSON.stringify({ roleId, styleIds }));
        return inserted;
      }
    },

    'memberRoles.remove': {
      perm: 'roles.manage',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { id, version } = payload || {};
        if (!id || version === undefined) {
          throw new AppError('VALIDATION', 'id and version are required');
        }

        const existing = ctx.db.memberRoles.find(mr => mr.id === id && mr.active)[0];
        if (!existing) {
          throw new AppError('NOT_FOUND', `Member role not found: ${id}`);
        }

        if (existing.version !== Number(version)) {
          throw new AppError('VERSION_CONFLICT', 'Member role has been modified by another user', false, existing);
        }

        const actor = auth?.claims.sub || 'system';
        ctx.db.memberRoles.deactivate(id, Number(version), actor, ctx.now());
        bumpPermVersion(ctx);
        logAudit(ctx, actor, 'memberRoles.remove', existing.matricKey, existing.roleId);
        return { success: true };
      }
    }
  };
}
