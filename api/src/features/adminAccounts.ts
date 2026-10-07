import { Ctx } from '../ports';
import { PermissionCode } from '@umdsc/shared';
import { safeCachePut } from '../logic/cache';

/**
 * Admin accounts and their role permissions, kept in the server cache so a login reads no sheet.
 * Only the stored password hash is kept, never a password. Admin edits made on the website clear it;
 * an edit made straight in the sheet shows after admins.refresh (or within 6 hours).
 */
export interface LoginAccount {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  salt: string;
  iterations: number;
  roleId: string;
}

interface LoginDirectory {
  admins: LoginAccount[];
  rolePerms: Record<string, PermissionCode[]>;
}

const SIX_HOURS = 6 * 3600;

// Permission changes bump PERM_VERSION, so they start a fresh copy without any extra hook.
const cacheKey = (ctx: Ctx) => `adminlogin:${ctx.props.get('PERM_VERSION') || 1}`;

function readDirectory(ctx: Ctx): LoginDirectory {
  const admins = ctx.db.admins.find(a => a.active).map(a => ({
    id: a.id,
    username: a.username,
    displayName: a.displayName,
    passwordHash: a.passwordHash,
    salt: a.salt,
    iterations: a.iterations,
    roleId: a.roleId
  }));
  const roleIds = new Set(admins.map(a => a.roleId));
  const rolePerms: Record<string, PermissionCode[]> = {};
  for (const rp of ctx.db.rolePermissions.find(rp => rp.active && roleIds.has(rp.roleId))) {
    (rolePerms[rp.roleId] ||= []).push(rp.permission);
  }
  return { admins, rolePerms };
}

export function loginDirectory(ctx: Ctx): LoginDirectory {
  const key = cacheKey(ctx);
  const cached = ctx.cache.get(key);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // rebuild below
    }
  }
  const directory = readDirectory(ctx);
  safeCachePut(ctx.cache, key, JSON.stringify(directory), SIX_HOURS);
  return directory;
}

/** Drops the cached copy so the next login reads the sheets again. */
export function forgetLoginDirectory(ctx: Ctx): void {
  ctx.cache.remove(cacheKey(ctx));
}
