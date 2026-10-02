import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { ColorSwatchPicker } from '../../components/ui/ColorSwatchPicker';
import { PixelPortraitFrame } from '../../components/ui/PixelPortraitFrame';
import { getInstructorPhotoUrl, STANDARD_PHOTO_HINT } from '../../lib/instructorPhotos';
import type { Instructor, InstructorPhoto } from '@umdsc/shared';

export const InstructorsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingInstructor, setEditingInstructor] = useState<Instructor | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [color, setColor] = useState('orange');
  const [photos, setPhotos] = useState<InstructorPhoto[]>([]);
  const [activePhotoUrl, setActivePhotoUrl] = useState<string>('');

  const { data: instructors = [], isLoading } = useQuery<Instructor[]>({
    queryKey: ['instructors'],
    queryFn: async () => {
      const res = await api.post<Instructor[]>('instructors.list');
      return res.data;
    }
  });

  const parseInstructorPhotos = (instructor: Instructor): InstructorPhoto[] => {
    let list: InstructorPhoto[] = [];
    if (instructor.photosJson) {
      try {
        const parsed = JSON.parse(instructor.photosJson);
        if (Array.isArray(parsed)) list = parsed;
      } catch {
        // fallback
      }
    }
    if (list.length === 0 && instructor.photos && Array.isArray(instructor.photos)) {
      list = instructor.photos;
    }

    // If no custom photos yet, check default pre-seeded photo
    const defaultUrl = getInstructorPhotoUrl(instructor);
    if (list.length === 0 && defaultUrl) {
      list = [
        {
          id: 'seed-photo',
          url: defaultUrl,
          active: true,
          uploadedAt: new Date().toISOString()
        }
      ];
    }
    return list;
  };

  const openCreate = () => {
    setIsCreating(true);
    setEditingInstructor(null);
    setName('');
    setContact('');
    setColor('orange');
    setPhotos([]);
    setActivePhotoUrl('');
    setFormError(null);
  };

  const openEdit = (instructor: Instructor) => {
    setEditingInstructor(instructor);
    setIsCreating(false);
    setName(instructor.name);
    setContact(instructor.contact || '');
    setColor(instructor.color || 'orange');

    const existingPhotos = parseInstructorPhotos(instructor);
    setPhotos(existingPhotos);
    const activeOne = existingPhotos.find((p) => p.active);
    setActivePhotoUrl(activeOne?.url || instructor.photoUrl || getInstructorPhotoUrl(instructor) || '');
    setFormError(null);
  };

  const closeForm = () => {
    setIsCreating(false);
    setEditingInstructor(null);
    setFormError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle uploading and standardizing photo
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFormError('Please select a valid image file (PNG, JPG, or WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;

      const newPhotoId = 'photo_' + Date.now();
      const newPhoto: InstructorPhoto = {
        id: newPhotoId,
        url: dataUrl,
        active: true,
        uploadedAt: new Date().toISOString()
      };

      // Set all other photos to inactive
      const updatedPhotos = [
        newPhoto,
        ...photos.map((p) => ({ ...p, active: false }))
      ];

      setPhotos(updatedPhotos);
      setActivePhotoUrl(dataUrl);
      setFormError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSetActivePhoto = (photoId: string) => {
    const target = photos.find((p) => p.id === photoId);
    if (!target) return;

    const updated = photos.map((p) => ({
      ...p,
      active: p.id === photoId
    }));
    setPhotos(updated);
    setActivePhotoUrl(target.url);
  };

  const handleDeletePhoto = (photoId: string) => {
    const remaining = photos.filter((p) => p.id !== photoId);
    setPhotos(remaining);

    // If we deleted the active photo, activate the first remaining
    if (remaining.length > 0) {
      const nextActive = remaining[0];
      const updated = remaining.map((p, idx) => ({ ...p, active: idx === 0 }));
      setPhotos(updated);
      setActivePhotoUrl(nextActive.url);
    } else {
      setActivePhotoUrl('');
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: name.trim(),
        contact: contact.trim(),
        color: color.trim(),
        photoUrl: activePhotoUrl || '',
        photosJson: JSON.stringify(photos)
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
          <h1 className="font-display text-lg tracking-wider text-[var(--text-1)]">
            Instructors
          </h1>
          <p className="font-body text-base text-[var(--text-2)] mt-1">
            Manage club instructors, signature colors, and standardized portraits.
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {instructors.map((inst) => {
            const photoUrl = getInstructorPhotoUrl(inst);
            const instColor = inst.color?.startsWith('#')
              ? inst.color
              : `var(--c-${inst.color || 'orange'})`;

            return (
              <div
                key={inst.id}
                className="px-panel p-4 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3 flex flex-col items-center sm:items-start">
                  {/* Portrait photo frame */}
                  <PixelPortraitFrame
                    src={photoUrl || ''}
                    alt={inst.name}
                    name="INSTRUCTOR"
                    glow="var(--neon-cyan)"
                    size="sm"
                  />
                  {/* Instructor Color Banner below picture */}
                  <div
                    className="w-full py-1 text-center border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)] font-display text-[8px] font-bold text-[var(--on-neon)] uppercase tracking-wider"
                    style={{ backgroundColor: instColor }}
                  >
                    INSTRUCTOR · {inst.color?.toUpperCase() || 'DEFAULT'}
                  </div>

                  {/* Instructor Meta */}
                  <div className="w-full">
                    <h3 className="font-display text-[12px] text-[var(--text-1)] font-bold truncate">
                      {inst.name}
                    </h3>
                    <p className="font-mono text-[14px] text-[var(--text-2)] mt-1 truncate">
                      📞 {inst.contact || 'No contact specified'}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-3 border-t-2 border-[var(--outline)]">
                  <PixelButton
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => openEdit(inst)}
                  >
                    EDIT
                  </PixelButton>
                  <PixelButton
                    size="sm"
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
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {(isCreating || editingInstructor) && (
        <div className="fixed inset-0 bg-[var(--night-0)]/80 px-dither z-[var(--z-modal)] flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl my-8">
            <Panel
              title={isCreating ? 'CREATE INSTRUCTOR' : `EDIT ${editingInstructor?.name}`}
              className="px-corners p-4 sm:p-6 space-y-5"
            >
              {formError && (
                <div
                  role="alert"
                  className="bg-[var(--night-2)] border-2 border-[var(--neon-red)] text-[var(--neon-red)] p-3 text-[14px] font-body font-bold"
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
                  placeholder="e.g. Lam Hong Woh"
                  className="px-well w-full min-h-[44px] px-3 font-body text-[16px]"
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
                  className="px-well w-full min-h-[44px] px-3 font-mono text-[16px]"
                />
              </Field>

              {/* Signature Color Swatch Picker */}
              <ColorSwatchPicker
                value={color}
                onChange={setColor}
                label="Instructor Signature Color"
              />

              {/* Photo Management Section */}
              <div className="space-y-3 pt-3 border-t-2 border-[var(--outline)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <h3 className="font-display text-[12px] text-[var(--text-1)] tracking-wider">
                      INSTRUCTOR PICTURE
                    </h3>
                    <p className="font-body text-[14px] text-[var(--text-2)] mt-0.5">
                      {STANDARD_PHOTO_HINT}
                    </p>
                  </div>
                  <PixelButton
                    size="sm"
                    variant="secondary"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    + UPLOAD PICTURE
                  </PixelButton>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </div>

                {/* Active Photo Preview & Gallery */}
                {photos.length === 0 && !activePhotoUrl ? (
                  <div className="px-well p-4 text-center space-y-1">
                    <p className="font-display text-[8px] md:text-[12px] text-[var(--text-2)]">
                      NO PICTURE UPLOADED YET
                    </p>
                    <p className="font-body text-[14px] text-[var(--text-3)]">
                      Upload a 1080 × 1350 px portrait for this instructor to display on the calendar.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-[12px] font-display text-[var(--text-1)]">
                      PICTURE GALLERY ({photos.length})
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {photos.map((p) => {
                        const isActive = p.active || p.url === activePhotoUrl;
                        return (
                          <div
                            key={p.id}
                            className={`relative aspect-[4/5] bg-[var(--night-2)] border-2 ${
                              isActive
                                ? 'border-[var(--neon-gold)] shadow-[3px_3px_0_var(--outline)] ring-2 ring-[var(--neon-gold)]'
                                : 'border-[var(--outline)] opacity-75 hover:opacity-100'
                            } overflow-hidden group flex flex-col justify-between p-1`}
                          >
                            <img
                              src={p.url}
                              alt="Instructor thumbnail"
                              className="w-full h-full object-cover absolute inset-0"
                            />

                            {/* Badge */}
                            <div className="relative z-10">
                              {isActive ? (
                                <span className="bg-[var(--neon-gold)] text-[var(--on-neon)] px-1.5 py-0.5 border border-[var(--outline)] font-display text-[8px] font-bold">
                                  ACTIVE
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSetActivePhoto(p.id)}
                                  className="bg-[var(--night-2)] text-[var(--text-1)] px-1.5 py-0.5 border border-[var(--outline)] font-display text-[8px] hover:bg-[var(--neon-gold)] hover:text-[var(--on-neon)] cursor-pointer"
                                >
                                  SET ACTIVE
                                </button>
                              )}
                            </div>

                            {/* Delete Button */}
                            <div className="relative z-10 self-end">
                              <button
                                type="button"
                                onClick={() => handleDeletePhoto(p.id)}
                                title="Remove photo"
                                aria-label="Remove photo"
                                className="w-6 h-6 bg-[var(--neon-red)] text-white font-display text-[8px] flex items-center justify-center border border-[var(--outline)] shadow-[1px_1px_0_var(--outline)] hover:opacity-90 cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-3 border-t-2 border-[var(--outline)]">
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
