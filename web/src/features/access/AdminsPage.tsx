import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import type { AdminUser, Role } from '@umdsc/shared';

export const AdminsPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [isCreating, setIsCreating] = useState(false);
  const [resettingAdmin, setResettingAdmin] = useState<AdminUser | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Form states for create
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');

  // Form state for reset password
  const [newPassword, setNewPassword] = useState('');

  const { data: admins = [], isLoading: loadingAdmins } = useQuery<AdminUser[]>({
    queryKey: ['admins'],
    queryFn: async () => {
      const res = await api.post<AdminUser[]>('admins.list');
      return res.data;
    }
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await api.post<Role[]>('roles.list');
      return res.data;
    }
  });

  const adminRoles = roles.filter((r) => r.loginType === 'admin');

  const openCreate = () => {
    setIsCreating(true);
    setResettingAdmin(null);
    setUsername('');
    setDisplayName('');
    setPassword('');
    setRoleId(adminRoles[0]?.id || '');
    setFormError(null);
  };

  const closeModals = () => {
    setIsCreating(false);
    setResettingAdmin(null);
    setFormError(null);
  };

  const createAdminMutation = useMutation({
    mutationFn: async () => {
      return await api.post('admins.create', {
        username: username.trim(),
        displayName: displayName.trim(),
        password,
        roleId
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] });
      closeModals();
    },
    onError: (err) => {
      setFormError(errorMessage(err));
    }
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      if (!resettingAdmin) return;
      return await api.post('admins.resetPassword', {
        id: resettingAdmin.id,
        version: resettingAdmin.version,
        newPassword
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] });
      closeModals();
    },
    onError: (err) => {
      setFormError(errorMessage(err));
    }
  });

  const deactivateMutation = useMutation({
    mutationFn: async (admin: AdminUser) => {
      return await api.post('admins.update', {
        id: admin.id,
        version: admin.version,
        active: false
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] });
    },
    onError: (err) => {
      alert(errorMessage(err));
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="font-display text-lg tracking-wider text-[var(--text-1)]">
            Admin Accounts
          </h1>
          <p className="font-body text-base text-[var(--text-2)] mt-1">
            Manage club executive admin accounts and passwords.
          </p>
        </div>
        <PixelButton size="md" variant="primary" onClick={openCreate}>
          + NEW ADMIN
        </PixelButton>
      </div>

      {loadingAdmins ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : admins.length === 0 ? (
        <EmptyState
          scene="shutter"
          title="NO ADMINS FOUND"
          description="Click '+ NEW ADMIN' to create an administrator account."
          action={
            <PixelButton size="md" variant="primary" onClick={openCreate}>
              + NEW ADMIN
            </PixelButton>
          }
        />
      ) : (
        <Panel title={`ALL ADMINS (${admins.length})`} className="px-corners bg-[var(--night-2)]">
          <div className="pixel-scrollbar overflow-x-auto">
            <table className="w-full text-left font-body text-base border-collapse">
              <thead>
                <tr className="border-b-2 border-[var(--neon-cyan)] bg-[var(--night-2)] font-display text-xs text-[var(--text-1)]">
                  <th className="p-3">USERNAME</th>
                  <th className="p-3">DISPLAY NAME</th>
                  <th className="p-3">ROLE</th>
                  <th className="p-3 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-[var(--outline)]">
                {admins.map((admin) => {
                  const role = roles.find((r) => r.id === admin.roleId);

                  return (
                    <tr key={admin.id} className="min-h-[48px] odd:bg-[var(--night-2)] even:bg-[var(--violet-1)] hover:bg-[var(--violet-2)]">
                      <td className="p-3 font-mono font-bold text-sm text-[var(--text-1)]">
                        {admin.username}
                      </td>
                      <td className="p-3 font-display text-xs text-[var(--text-1)]">{admin.displayName}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 border border-[var(--outline)] bg-[var(--violet-2)] text-[var(--neon-gold)] font-mono text-xs uppercase font-bold">
                          {role?.name || 'Admin'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          <PixelButton
                            size="md"
                            variant="secondary"
                            onClick={() => {
                              setResettingAdmin(admin);
                              setNewPassword('');
                              setFormError(null);
                            }}
                          >
                            RESET PASSWORD
                          </PixelButton>
                          <PixelButton
                            size="md"
                            variant="danger"
                            onClick={() => {
                              if (confirm(`Deactivate admin "${admin.username}"?`)) {
                                deactivateMutation.mutate(admin);
                              }
                            }}
                          >
                            DEACTIVATE
                          </PixelButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Create Admin Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-md my-auto py-4">
            <Panel
              title="CREATE ADMIN ACCOUNT"
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

              <Field label="Username" required>
                <input
                  id="admin-username"
                  aria-label="Username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. treasurer"
                  className="w-full min-h-[44px] px-3 border-2 border-[var(--outline)] font-mono text-base bg-[var(--night-1)] text-[var(--text-1)]"
                  required
                />
              </Field>

              <Field label="Display Name" required>
                <input
                  id="admin-display-name"
                  aria-label="Display Name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Club Treasurer"
                  className="w-full min-h-[44px] px-3 border-2 border-[var(--outline)] font-body text-base bg-[var(--night-1)] text-[var(--text-1)]"
                  required
                />
              </Field>

              <Field label="Initial Password" required>
                <input
                  id="admin-password"
                  aria-label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[44px] px-3 border-2 border-[var(--outline)] font-mono text-base bg-[var(--night-1)] text-[var(--text-1)]"
                  required
                />
              </Field>

              <Field label="Assigned Role" required>
                <select
                  id="admin-role-id"
                  aria-label="Assigned Role"
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  className="w-full min-h-[44px] px-2 border-2 border-[var(--outline)] font-body text-base bg-[var(--night-1)] text-[var(--text-1)]"
                  required
                >
                  {adminRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="flex gap-3 pt-3 border-t-2 border-[var(--outline)]">
                <PixelButton
                  size="md"
                  variant="primary"
                  className="flex-1"
                  disabled={
                    createAdminMutation.isPending ||
                    !username.trim() ||
                    !displayName.trim() ||
                    !password
                  }
                  onClick={() => createAdminMutation.mutate()}
                >
                  {createAdminMutation.isPending ? 'CREATING...' : 'CREATE ADMIN'}
                </PixelButton>
                <PixelButton
                  size="md"
                  variant="secondary"
                  disabled={createAdminMutation.isPending}
                  onClick={closeModals}
                >
                  CANCEL
                </PixelButton>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resettingAdmin && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-md my-auto py-4">
            <Panel
              title={`RESET PASSWORD: ${resettingAdmin.username}`}
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

              <Field label="New Password" required>
                <input
                  id="reset-password-input"
                  aria-label="New Password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[44px] px-3 border-2 border-[var(--outline)] font-mono text-base bg-[var(--night-1)] text-[var(--text-1)]"
                  required
                />
              </Field>

              <div className="flex gap-3 pt-3 border-t-2 border-[var(--outline)]">
                <PixelButton
                  size="md"
                  variant="primary"
                  className="flex-1"
                  disabled={resetPasswordMutation.isPending || !newPassword}
                  onClick={() => resetPasswordMutation.mutate()}
                >
                  {resetPasswordMutation.isPending ? 'UPDATING...' : 'UPDATE PASSWORD'}
                </PixelButton>
                <PixelButton
                  size="md"
                  variant="secondary"
                  disabled={resetPasswordMutation.isPending}
                  onClick={closeModals}
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
export default AdminsPage;
