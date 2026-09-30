import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import type { Instructor } from '@umdsc/shared';

export const InstructorsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [editingInstructor, setEditingInstructor] = useState<Instructor | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');

  const { data: instructors = [], isLoading } = useQuery<Instructor[]>({
    queryKey: ['instructors'],
    queryFn: async () => {
      const res = await api.post<Instructor[]>('instructors.list');
      return res.data;
    }
  });

  const openCreate = () => {
    setIsCreating(true);
    setEditingInstructor(null);
    setName('');
    setContact('');
    setFormError(null);
  };

  const openEdit = (instructor: Instructor) => {
    setEditingInstructor(instructor);
    setIsCreating(false);
    setName(instructor.name);
    setContact(instructor.contact);
    setFormError(null);
  };

  const closeForm = () => {
    setIsCreating(false);
    setEditingInstructor(null);
    setFormError(null);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: name.trim(),
        contact: contact.trim()
      };

      if (isCreating) {
        return await api.post('instructors.create', payload);
      } else if (editingInstructor) {
        payload.id = editingInstructor.id;
        payload.version = editingInstructor.version;
        return await api.post('instructors.update', payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructors'] });
      queryClient.invalidateQueries({ queryKey: ['admin.bootstrap'] });
      closeForm();
    },
    onError: (err) => {
      setFormError(errorMessage(err));
    }
  });

  const deactivateMutation = useMutation({
    mutationFn: async (inst: Instructor) => {
      return await api.post('instructors.deactivate', { id: inst.id, version: inst.version });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructors'] });
      queryClient.invalidateQueries({ queryKey: ['admin.bootstrap'] });
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="font-display text-lg tracking-wider text-[var(--c-ink)]">
            Instructors
          </h1>
          <p className="font-body text-base text-[var(--c-darkgrey)] mt-1">
            Manage club instructors and their contact information.
          </p>
        </div>
        <PixelButton size="md" variant="primary" onClick={openCreate}>
          + NEW INSTRUCTOR
        </PixelButton>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : instructors.length === 0 ? (
        <EmptyState
          title="NO INSTRUCTORS"
          description="No instructors are registered yet. Click '+ NEW INSTRUCTOR' to add one."
          action={
            <PixelButton size="md" variant="primary" onClick={openCreate}>
              + NEW INSTRUCTOR
            </PixelButton>
          }
        />
      ) : (
        <Panel title={`ALL INSTRUCTORS (${instructors.length})`} className="px-corners">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body text-base border-collapse">
              <thead>
                <tr className="border-b-4 border-[var(--c-ink)] bg-[var(--c-bg)] font-display text-xs text-[var(--c-ink)]">
                  <th className="p-3">NAME</th>
                  <th className="p-3">CONTACT</th>
                  <th className="p-3 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-[var(--c-ink)]">
                {instructors.map((inst) => (
                  <tr key={inst.id} className="hover:bg-[var(--c-bg)]">
                    <td className="p-3 font-bold font-display text-xs">{inst.name}</td>
                    <td className="p-3 font-mono text-sm">{inst.contact || '-'}</td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        <PixelButton
                          size="md"
                          variant="secondary"
                          onClick={() => openEdit(inst)}
                        >
                          EDIT
                        </PixelButton>
                        <PixelButton
                          size="md"
                          variant="danger"
                          onClick={() => {
                            if (confirm(`Deactivate instructor "${inst.name}"?`)) {
                              deactivateMutation.mutate(inst);
                            }
                          }}
                        >
                          DEACTIVATE
                        </PixelButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Modal */}
      {(isCreating || editingInstructor) && (
        <div className="fixed inset-0 bg-[var(--c-ink)]/50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <Panel
              title={isCreating ? 'CREATE INSTRUCTOR' : `EDIT ${editingInstructor?.name}`}
              className="px-corners bg-[var(--c-panel)] space-y-4"
            >
              {formError && (
                <div
                  role="alert"
                  className="bg-[var(--c-peach)] border-4 border-[var(--c-red)] p-3 text-[var(--c-red)] font-body font-bold text-sm"
                >
                  {formError}
                </div>
              )}

              <Field label="Full Name" required>
                <input
                  id="instructor-name"
                  aria-label="Full Name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Kenji Popping"
                  className="w-full min-h-[44px] px-3 border-2 border-[var(--c-ink)] font-body text-base bg-[var(--c-bg)]"
                  required
                />
              </Field>

              <Field label="Contact (Phone / WhatsApp)">
                <input
                  id="instructor-contact"
                  aria-label="Contact"
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="e.g. +60123456789"
                  className="w-full min-h-[44px] px-3 border-2 border-[var(--c-ink)] font-mono text-base bg-[var(--c-bg)]"
                />
              </Field>

              <div className="flex gap-3 pt-3 border-t-2 border-[var(--c-ink)]">
                <PixelButton
                  size="md"
                  variant="primary"
                  className="flex-1"
                  disabled={saveMutation.isPending || !name.trim()}
                  onClick={() => saveMutation.mutate()}
                >
                  {saveMutation.isPending ? 'SAVING...' : 'SAVE INSTRUCTOR'}
                </PixelButton>
                <PixelButton
                  size="md"
                  variant="secondary"
                  disabled={saveMutation.isPending}
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
export default InstructorsPage;
