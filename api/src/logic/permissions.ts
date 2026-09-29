import { PermissionCode, PermMap } from '@umdsc/shared';
import { AppError } from '../errors';

export function resolvePermissions(input: {
  roleIds: string[];
  memberRoles: { roleId: string; styleIds: string[] }[];
  rolePerms: Record<string, PermissionCode[]>;
}): PermMap {
  const result: PermMap = {};

  const addPerm = (code: PermissionCode, scope: '*' | string[]) => {
    const existing = result[code];
    if (existing === '*') {
      return;
    }
    if (scope === '*') {
      result[code] = '*';
      return;
    }
    if (Array.isArray(existing)) {
      result[code] = Array.from(new Set([...existing, ...scope]));
    } else {
      result[code] = [...scope];
    }
  };

  // 1. Process base roles (scoped to '*')
  for (const roleId of input.roleIds) {
    const perms = input.rolePerms[roleId] || [];
    for (const code of perms) {
      addPerm(code, '*');
    }
  }

  // 2. Process member extra roles (scoped to styleIds, or '*' if empty)
  for (const mr of input.memberRoles) {
    const perms = input.rolePerms[mr.roleId] || [];
    const scope = mr.styleIds && mr.styleIds.length > 0 ? mr.styleIds : '*';
    for (const code of perms) {
      addPerm(code, scope);
    }
  }

  // 3. Implication: attendance.edit implies attendance.view.all with the same scope
  if (result['attendance.edit']) {
    addPerm('attendance.view.all', result['attendance.edit']);
  }

  return result;
}

export function can(perms: PermMap, code: PermissionCode, styleId?: string): boolean {
  const granted = perms[code];
  if (!granted) return false;

  if (granted === '*') return true;

  if (Array.isArray(granted)) {
    if (!styleId) return false;
    return granted.includes(styleId);
  }

  return false;
}

export function validateRolePermissions(
  role: { name: string; loginType: 'admin' | 'dancer'; isSystem: boolean },
  perms: PermissionCode[]
): void {
  // Guard rail 1: Admin role must always keep roles.manage and admins.manage
  if (role.name === 'Admin' || (role.isSystem && role.loginType === 'admin')) {
    if (!perms.includes('roles.manage') || !perms.includes('admins.manage')) {
      throw new AppError(
        'VALIDATION',
        'Admin role must retain roles.manage and admins.manage'
      );
    }
  }

  // Guard rail 2: Dancer-login roles can never receive admins.manage, roles.manage or settings.edit
  if (role.loginType === 'dancer') {
    const forbidden: PermissionCode[] = ['settings.edit', 'admins.manage', 'roles.manage'];
    for (const p of forbidden) {
      if (perms.includes(p)) {
        throw new AppError(
          'VALIDATION',
          `Dancer role cannot be assigned administrative permission "${p}"`
        );
      }
    }
  }
}
