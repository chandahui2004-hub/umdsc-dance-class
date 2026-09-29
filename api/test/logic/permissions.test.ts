import { describe, it, expect } from 'vitest';
import {
  resolvePermissions,
  can,
  validateRolePermissions
} from '../../src/logic/permissions';
import { PermissionCode } from '@umdsc/shared';

describe('Permissions resolution and verification', () => {
  it('resolves combined roles and style-scoped permissions', () => {
    expect(
      resolvePermissions({
        roleIds: ['dancer'],
        memberRoles: [{ roleId: 'lead', styleIds: ['popping'] }],
        rolePerms: {
          dancer: ['calendar.view'],
          lead: ['attendance.edit', 'calendar.view']
        }
      })
    ).toEqual({
      'calendar.view': '*',
      'attendance.edit': ['popping'],
      'attendance.view.all': ['popping']
    });
  });

  it('implies view when edit is granted', () => {
    expect(
      resolvePermissions({
        roleIds: [],
        memberRoles: [{ roleId: 'lead', styleIds: ['popping'] }],
        rolePerms: { lead: ['attendance.edit'] }
      })
    ).toEqual({
      'attendance.edit': ['popping'],
      'attendance.view.all': ['popping']
    });
  });

  it('checks if a user can perform an action', () => {
    expect(can({ 'attendance.edit': ['popping'] }, 'attendance.edit', 'popping')).toBe(true);
    expect(can({ 'attendance.edit': ['popping'] }, 'attendance.edit', 'latin')).toBe(false);
    expect(can({ 'attendance.edit': '*' }, 'attendance.edit', 'latin')).toBe(true);
    expect(can({ 'attendance.edit': '*' }, 'attendance.edit')).toBe(true);
    expect(can({ 'attendance.edit': ['popping'] }, 'attendance.edit')).toBe(false); // No style provided but required
  });

  it('validates role permissions according to guard rails', () => {
    // Admin role must keep roles.manage and admins.manage
    expect(() =>
      validateRolePermissions(
        { name: 'Admin', loginType: 'admin', isSystem: true },
        ['calendar.view']
      )
    ).toThrow(/VALIDATION/);

    // Dancer-login role cannot receive settings.edit, admins.manage, roles.manage
    expect(() =>
      validateRolePermissions(
        { name: 'Class Lead', loginType: 'dancer', isSystem: false },
        ['settings.edit']
      )
    ).toThrow(/VALIDATION/);

    expect(() =>
      validateRolePermissions(
        { name: 'Class Lead', loginType: 'dancer', isSystem: false },
        ['admins.manage']
      )
    ).toThrow(/VALIDATION/);

    expect(() =>
      validateRolePermissions(
        { name: 'Class Lead', loginType: 'dancer', isSystem: false },
        ['roles.manage']
      )
    ).toThrow(/VALIDATION/);
  });
});
