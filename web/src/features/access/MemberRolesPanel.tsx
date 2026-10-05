import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import type { Role, DanceStyle } from '@umdsc/shared';

interface MemberRoleItem {
  id: string;
  matricKey: string;
  roleId: string;
  styleIds: string[];
  version: number;
}

interface MemberRolesPanelProps {
  role: Role;
  styles: DanceStyle[];
}

export const MemberRolesPanel: React.FC<MemberRolesPanelProps> = ({ role, styles }) => {
  const queryClient = useQueryClient();
  const [isAssigning, setIsAssigning] = useState(false);
  const [matricInput, setMatricInput] = useState('');
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: assignments = [], isLoading } = useQuery<MemberRoleItem[]>({
    queryKey: ['memberRoles', role.id],
    queryFn: async () => {
      const res = await api.post<MemberRoleItem[]>('memberRoles.list', { roleId: role.id });
      return res.data;
    }
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      return await api.post('memberRoles.assign', {
        matricKey: matricInput.trim(),
        roleId: role.id,
        styleIds: selectedStyles
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['memberRoles', role.id] });
      setIsAssigning(false);
      setMatricInput('');
      setSelectedStyles([]);
      setFormError(null);
    },
    onError: (err) => {
      setFormError(errorMessage(err));
    }
  });

  const removeMutation = useMutation({
    mutationFn: async (item: MemberRoleItem) => {
      return await api.post('memberRoles.remove', { id: item.id, version: item.version });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['memberRoles', role.id] });
    }
  });

  const toggleStyle = (styleId: string) => {
    setSelectedStyles((prev) =>
      prev.includes(styleId) ? prev.filter((s) => s !== styleId) : [...prev, styleId]
    );
  };

  const getStyleNames = (styleIds: string[]) => {
    if (!styleIds || styleIds.length === 0) return 'All Styles';
    return styleIds
      .map((id) => styles.find((s) => s.id === id)?.name || id)
      .join(', ');
  };

  return (
    <Panel
      title={`MEMBERS ASSIGNED TO: ${role.name}`}
      className="px-corners bg-[var(--night-2)] space-y-4"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <p className="font-body text-sm text-[var(--text-2)]">
          Dancers granted this role will receive these permissions when logging in.
        </p>
        {!isAssigning && (
          <PixelButton
            size="md"
            variant="primary"
            onClick={() => setIsAssigning(true)}
          >
            + ASSIGN DANCER
          </PixelButton>
        )}
      </div>

      {isAssigning && (
        <div className="bg-[var(--night-1)] border-2 border-[var(--outline)] p-4 space-y-3">
          <h4 className="font-display text-xs text-[var(--text-1)] uppercase">
            ASSIGN DANCER TO {role.name}
          </h4>

          {formError && (
            <div
              role="alert"
              className="bg-[var(--violet-2)] border-2 border-[var(--neon-red)] p-2 text-[var(--neon-red)] font-body font-bold text-xs"
            >
              {formError}
            </div>
          )}

          <Field label="Dancer Matric Number" required>
            <input
              id="assign-matric-input"
              aria-label="Dancer Matric Number"
              type="text"
              value={matricInput}
              onChange={(e) => setMatricInput(e.target.value)}
              placeholder="e.g. 22001234"
              className="w-full min-h-[44px] px-3 border-2 border-[var(--outline)] font-mono text-base bg-[var(--night-2)] text-[var(--text-1)]"
              required
            />
          </Field>

          <div className="space-y-1">
            <span className="font-display text-xs text-[var(--text-1)] uppercase">
              Style Scopes (Leave unselected for all styles)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              {styles.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 p-2 border-2 border-[var(--outline)] bg-[var(--night-2)] cursor-pointer text-xs font-mono text-[var(--text-1)]"
                >
                  <input
                    type="checkbox"
                    checked={selectedStyles.includes(s.id)}
                    onChange={() => toggleStyle(s.id)}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <span>{s.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t-2 border-[var(--outline)]">
            <PixelButton
              size="md"
              variant="primary"
              disabled={assignMutation.isPending || !matricInput.trim()}
              onClick={() => assignMutation.mutate()}
            >
              {assignMutation.isPending ? 'ASSIGNING...' : 'CONFIRM ASSIGNMENT'}
            </PixelButton>
            <PixelButton
              size="md"
              variant="secondary"
              onClick={() => {
                setIsAssigning(false);
                setFormError(null);
              }}
            >
              CANCEL
            </PixelButton>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="p-4 text-center">
          <Spinner />
        </div>
      ) : assignments.length === 0 ? (
        <p className="font-body text-sm text-[var(--text-2)] italic py-2">
          No dancers are currently assigned to this role.
        </p>
      ) : (
        <div className="pixel-scrollbar overflow-x-auto">
          <table className="w-full text-left font-body text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-[var(--neon-cyan)] bg-[var(--night-2)] font-display text-[12px] text-[var(--text-1)]">
                <th className="p-2">MATRIC</th>
                <th className="p-2">SCOPED STYLES</th>
                <th className="p-2 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-[var(--outline)]">
              {assignments.map((item) => (
                <tr key={item.id} className="min-h-[48px] odd:bg-[var(--night-2)] even:bg-[var(--violet-1)] hover:bg-[var(--violet-2)]">
                  <td className="p-2 font-mono font-bold text-[var(--text-1)]">{item.matricKey}</td>
                  <td className="p-2 font-mono text-xs text-[var(--text-2)]">{getStyleNames(item.styleIds)}</td>
                  <td className="p-2 text-right">
                    <PixelButton
                      size="md"
                      variant="danger"
                      disabled={removeMutation.isPending}
                      onClick={() => {
                        if (confirm(`Remove role assignment for matric ${item.matricKey}?`)) {
                          removeMutation.mutate(item);
                        }
                      }}
                    >
                      {removeMutation.isPending && removeMutation.variables?.id === item.id ? 'REMOVING…' : 'REMOVE'}
                    </PixelButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
};
