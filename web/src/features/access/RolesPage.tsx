import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { MemberRolesPanel } from './MemberRolesPanel';
import { PERMISSIONS, type Role, type PermissionCode, type DanceStyle } from '@umdsc/shared';

export const RolesPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Form states for creating / editing role
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loginType, setLoginType] = useState<'dancer' | 'admin'>('dancer');

  // Permission matrix state
  const [matrixPermissions, setMatrixPermissions] = useState<PermissionCode[]>([]);

  const { data: roles = [], isLoading: loadingRoles } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await api.post<Role[]>('roles.list');
      return res.data;
    }
  });

  const { data: styles = [] } = useQuery<DanceStyle[]>({
    queryKey: ['styles'],
    queryFn: async () => {
      const res = await api.post<DanceStyle[]>('styles.list');
      return res.data;
    }
  });

  const openCreate = () => {
    setIsCreating(true);
    setEditingRole(null);
    setName('');
    setDescription('');
    setLoginType('dancer');
    setFormError(null);
  };

  const openEdit = (role: Role) => {
    setEditingRole(role);
    setIsCreating(false);
    setName(role.name);
    setDescription(role.description || '');
    setLoginType(role.loginType);
    setFormError(null);
  };

  const openPermissions = (role: Role) => {
    setSelectedRole(role);
    setMatrixPermissions(role.permissions || []);
    setFormError(null);
  };

  const closeForm = () => {
    setIsCreating(false);
    setEditingRole(null);
    setFormError(null);
  };

  const saveRoleMutation = useMutation({
    mutationFn: async () => {
      if (isCreating) {
        return await api.post('roles.create', {
          name: name.trim(),
          description: description.trim(),
          loginType
        });
      } else if (editingRole) {
        return await api.post('roles.update', {
          id: editingRole.id,
          version: editingRole.version,
          name: name.trim(),
          description: description.trim()
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['admin.bootstrap'] });
      closeForm();
    },
    onError: (err) => {
      setFormError(errorMessage(err));
    }
  });

  const setPermissionsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRole) return;
      return await api.post('roles.setPermissions', {
        roleId: selectedRole.id,
        permissions: matrixPermissions
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['admin.bootstrap'] });
      setSelectedRole(null);
    },
    onError: (err) => {
      setFormError(errorMessage(err));
    }
  });

  const deactivateMutation = useMutation({
    mutationFn: async (role: Role) => {
      return await api.post('roles.deactivate', { id: role.id, version: role.version });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['admin.bootstrap'] });
    }
  });

  const togglePermission = (code: PermissionCode) => {
    setMatrixPermissions((prev) =>
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code]
    );
  };

  // Group permissions by group name
  const groupedPerms = PERMISSIONS.reduce((acc, p) => {
    acc[p.group] = acc[p.group] || [];
    acc[p.group].push(p);
    return acc;
  }, {} as Record<string, typeof PERMISSIONS[number][]>);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="font-display text-lg tracking-wider text-[var(--text-1)]">
            Roles & Permissions
          </h1>
          <p className="font-body text-base text-[var(--text-2)] mt-1">
            Configure system roles, access permission matrices, and assign dancers.
          </p>
        </div>
        <PixelButton size="md" variant="primary" onClick={openCreate}>
          + NEW ROLE
        </PixelButton>
      </div>

      {/* Relogin notification banner */}
      <div className="bg-[var(--violet-2)] border-2 border-[var(--outline)] p-4 shadow-[2px_2px_0_var(--outline)] space-y-1">
        <h4 className="font-display text-xs text-[var(--neon-gold)] uppercase font-bold">
          SESSION PERMISSION NOTICE
        </h4>
        <p className="font-body text-base text-[var(--text-2)]">
          Changes to roles and permissions take effect when users log in. Dancers and admins with active sessions keep their current permissions until their next login.
        </p>
      </div>

      {loadingRoles ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : roles.length === 0 ? (
        <EmptyState
          scene="shutter"
          title="NO ROLES DEFINED"
          description="Click '+ NEW ROLE' to configure system and custom roles."
          action={
            <PixelButton size="md" variant="primary" onClick={openCreate}>
              + NEW ROLE
            </PixelButton>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {roles.map((role) => (
            <Panel
              key={role.id}
              title={role.name}
              className="px-corners bg-[var(--night-2)] space-y-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`px-2 py-0.5 border-2 border-[var(--outline)] font-mono text-xs font-bold uppercase ${
                    role.loginType === 'admin'
                      ? 'bg-[var(--violet-2)] text-[var(--neon-gold)]'
                      : 'bg-[var(--night-1)] text-[var(--neon-cyan)]'
                  }`}
                >
                  {role.loginType} LOGIN
                </span>
                {role.isSystem && (
                  <span className="px-2 py-0.5 border-2 border-[var(--outline)] bg-[var(--neon-gold)] text-[var(--on-neon)] font-mono text-xs font-bold uppercase">
                    SYSTEM ROLE
                  </span>
                )}
              </div>

              {role.description && (
                <p className="font-body text-base text-[var(--text-2)]">
                  {role.description}
                </p>
              )}

              <div className="font-mono text-xs text-[var(--text-2)]">
                Granted Permissions:{' '}
                <strong className="text-[var(--text-1)] font-display text-xs">
                  {role.permissions?.length || 0}
                </strong>
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t-2 border-[var(--outline)]">
                <PixelButton
                  size="md"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => openPermissions(role)}
                >
                  MANAGE PERMISSIONS
                </PixelButton>
                <PixelButton
                  size="md"
                  variant="secondary"
                  onClick={() => openEdit(role)}
                >
                  EDIT
                </PixelButton>
                {!role.isSystem && (
                  <PixelButton
                    size="md"
                    variant="danger"
                    onClick={() => {
                      if (confirm(`Deactivate role "${role.name}"?`)) {
                        deactivateMutation.mutate(role);
                      }
                    }}
                  >
                    DEACTIVATE
                  </PixelButton>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}

      {/* Permission Matrix & Member Assignment Modal */}
      {selectedRole && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-3xl my-auto py-4 space-y-4">
            <Panel
              title={`PERMISSIONS: ${selectedRole.name}`}
              className="px-corners bg-[var(--night-2)] space-y-4"
            >
              <div className="flex justify-between items-center">
                <div className="font-mono text-xs text-[var(--text-1)]">
                  Login Type:{' '}
                  <span className="font-bold uppercase text-[var(--neon-cyan)]">
                    {selectedRole.loginType}
                  </span>
                </div>
                <div className="font-mono text-xs text-[var(--text-2)]">
                  {matrixPermissions.length} selected
                </div>
              </div>

              {formError && (
                <div
                  role="alert"
                  className="bg-[var(--violet-2)] border-2 border-[var(--neon-red)] p-3 text-[var(--neon-red)] font-body font-bold text-xs"
                >
                  {formError}
                </div>
              )}

              {/* Grouped Permission Checkbox Matrix */}
              <div className="space-y-4 max-h-[50vh] overflow-y-auto p-2 border-2 border-[var(--outline)] bg-[var(--night-1)] pixel-scrollbar">
                {Object.entries(groupedPerms).map(([group, perms]) => (
                  <div key={group} className="space-y-2">
                    <h4 className="font-display text-xs text-[var(--neon-cyan)] uppercase tracking-wider border-b-2 border-[var(--outline)] pb-1">
                      {group}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {perms.map((p) => {
                        const isDancerLogin = selectedRole.loginType === 'dancer';
                        const isDisabled = isDancerLogin && !!p.adminOnly;
                        const isChecked = matrixPermissions.includes(p.code);

                        return (
                          <label
                            key={p.code}
                            htmlFor={`perm-checkbox-${p.code}`}
                            title={
                              isDisabled
                                ? 'Admin login required for this permission'
                                : undefined
                            }
                            className={`flex items-center gap-2 p-2 border-2 border-[var(--outline)] bg-[var(--night-2)] text-xs font-mono select-none ${
                              isDisabled
                                ? 'opacity-40 cursor-not-allowed'
                                : 'cursor-pointer hover:bg-[var(--violet-1)]'
                            }`}
                          >
                            <input
                              id={`perm-checkbox-${p.code}`}
                              aria-label={p.code}
                              type="checkbox"
                              checked={isChecked}
                              disabled={isDisabled}
                              onChange={() => togglePermission(p.code)}
                              className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                            />
                            <div className="flex flex-col">
                              <span className="font-bold text-[var(--text-1)]">
                                {p.code}
                              </span>
                              {isDisabled && (
                                <span className="text-[12px] text-[var(--neon-red)] italic">
                                  Admin login required
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-2 border-t-2 border-[var(--outline)]">
                <PixelButton
                  size="md"
                  variant="primary"
                  className="flex-1"
                  disabled={setPermissionsMutation.isPending}
                  onClick={() => setPermissionsMutation.mutate()}
                >
                  {setPermissionsMutation.isPending ? 'SAVING...' : 'SAVE PERMISSIONS'}
                </PixelButton>
                <PixelButton
                  size="md"
                  variant="secondary"
                  disabled={setPermissionsMutation.isPending}
                  onClick={() => setSelectedRole(null)}
                >
                  CLOSE
                </PixelButton>
              </div>
            </Panel>

            {/* Member Roles Panel if Dancer Login */}
            {selectedRole.loginType === 'dancer' && (
              <MemberRolesPanel role={selectedRole} styles={styles} />
            )}
          </div>
        </div>
      )}

      {/* Create / Edit Role Modal */}
      {(isCreating || editingRole) && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-md my-auto py-4">
            <Panel
              title={isCreating ? 'CREATE NEW ROLE' : `EDIT ${editingRole?.name}`}
              className="px-corners bg-[var(--night-2)] space-y-4"
            >
              {formError && (
                <div
                  role="alert"
                  className="bg-[var(--violet-2)] border-2 border-[var(--neon-red)] p-3 text-[var(--neon-red)] font-body font-bold text-xs"
                >
                  {formError}
                </div>
              )}

              <Field label="Role Name" required>
                <input
                  id="role-name"
                  aria-label="Role Name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Class Lead, Choreographer"
                  className="w-full min-h-[44px] px-3 border-2 border-[var(--outline)] font-body text-base bg-[var(--night-1)] text-[var(--text-1)]"
                  required
                />
              </Field>

              <Field label="Description">
                <input
                  id="role-description"
                  aria-label="Description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Can take class attendance"
                  className="w-full min-h-[44px] px-3 border-2 border-[var(--outline)] font-body text-base bg-[var(--night-1)] text-[var(--text-1)]"
                />
              </Field>

              {isCreating && (
                <Field label="Login Type" hint="Dancer accounts log in via Matric + Name; Admin accounts use username + password">
                  <select
                    id="role-login-type"
                    aria-label="Login Type"
                    value={loginType}
                    onChange={(e) => setLoginType(e.target.value as 'dancer' | 'admin')}
                    className="w-full min-h-[44px] px-2 border-2 border-[var(--outline)] font-body text-base bg-[var(--night-1)] text-[var(--text-1)]"
                  >
                    <option value="dancer">Dancer (Matric Login)</option>
                    <option value="admin">Admin (Password Login)</option>
                  </select>
                </Field>
              )}

              <div className="flex gap-3 pt-3 border-t-2 border-[var(--outline)]">
                <PixelButton
                  size="md"
                  variant="primary"
                  className="flex-1"
                  disabled={saveRoleMutation.isPending || !name.trim()}
                  onClick={() => saveRoleMutation.mutate()}
                >
                  {saveRoleMutation.isPending ? 'SAVING...' : 'SAVE ROLE'}
                </PixelButton>
                <PixelButton
                  size="md"
                  variant="secondary"
                  disabled={saveRoleMutation.isPending}
                  onClick={closeForm}
                >
                  CANCEL
                </PixelButton>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
};
export default RolesPage;
