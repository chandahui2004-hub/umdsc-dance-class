import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { ColorSwatchPicker } from '../../components/ui/ColorSwatchPicker';
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
          <h1 className="font-display text-lg tracking-wider text-[var(--c-ink)]">
            Instructors
          </h1>
          <p className="font-body text-base text-[var(--c-darkgrey)] mt-1">
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
                className="bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] p-4 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  {/* Portrait photo (1080x1350 4:5 aspect ratio) */}
                  <div className="relative w-full aspect-[4/5] bg-[var(--c-bg)] border-2 border-[var(--c-ink)] overflow-hidden flex items-center justify-center">
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt={inst.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center p-4 text-center">
                        <span className="font-display text-3xl text-[var(--c-darkgrey)] mb-2">
                          👤
                        </span>
                        <span className="font-display text-[9px] text-[var(--c-darkgrey)] uppercase">
                          No Photo
                        </span>
                      </div>
                    )}
                    {/* Instructor Color Banner */}
                    <div
                      className="absolute top-2 left-2 px-2 py-0.5 border border-[var(--c-ink)] shadow-[1px_1px_0_var(--c-ink)] font-display text-[9px] font-bold text-[var(--c-ink)]"
                      style={{ backgroundColor: instColor }}
                    >
                      {inst.color?.toUpperCase() || 'COLOR'}
                    </div>
                  </div>

                  {/* Instructor Meta */}
                  <div>
                    <h3 className="font-display text-sm text-[var(--c-ink)] font-bold truncate">
                      {inst.name}
                    </h3>
                    <p className="font-mono text-xs text-[var(--c-darkgrey)] mt-1 truncate">
                      📞 {inst.contact || 'No contact specified'}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-3 border-t-2 border-[var(--c-ink)]">
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
        <div className="fixed inset-0 bg-[var(--c-ink)]/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl my-8">
            <Panel
              title={isCreating ? 'CREATE INSTRUCTOR' : `EDIT ${editingInstructor?.name}`}
              className="px-corners bg-[var(--c-panel)] p-4 sm:p-6 space-y-5"
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
                  placeholder="e.g. Lam Hong Woh"
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

              {/* Signature Color Swatch Picker */}
              <ColorSwatchPicker
                value={color}
                onChange={setColor}
                label="Instructor Signature Color"
              />

              {/* Photo Management Section */}
              <div className="space-y-3 pt-3 border-t-2 border-[var(--c-ink)]/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <h3 className="font-display text-xs text-[var(--c-ink)] tracking-wider">
                      INSTRUCTOR PICTURE
                    </h3>
                    <p className="font-body text-xs text-[var(--c-darkgrey)] mt-0.5">
                      {STANDARD_PHOTO_HINT}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="self-start sm:self-auto px-3 py-1.5 bg-[var(--c-ink)] text-[var(--c-yellow)] font-display text-[9px] font-bold border-2 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)] hover:bg-[var(--c-darkgrey)] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
                  >
                    + UPLOAD PICTURE
                  </button>
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
                  <div className="p-4 bg-[var(--c-bg)] border-2 border-dashed border-[var(--c-ink)] text-center space-y-1">
                    <p className="font-display text-[10px] text-[var(--c-darkgrey)]">
                      NO PICTURE UPLOADED YET
                    </p>
                    <p className="font-body text-xs text-[var(--c-darkgrey)]">
                      Upload a 1080 × 1350 px portrait for this instructor to display on the calendar.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-[10px] font-display text-[var(--c-ink)]">
                      PICTURE GALLERY ({photos.length})
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {photos.map((p) => {
                        const isActive = p.active || p.url === activePhotoUrl;
                        return (
                          <div
                            key={p.id}
                            className={`relative aspect-[4/5] bg-[var(--c-bg)] border-2 ${
                              isActive
                                ? 'border-[var(--c-ink)] shadow-[3px_3px_0_var(--c-ink)] ring-2 ring-[var(--c-yellow)]'
                                : 'border-[var(--c-ink)]/40 opacity-75 hover:opacity-100'
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
                                <span className="bg-[var(--c-yellow)] text-[var(--c-ink)] px-1.5 py-0.5 border border-[var(--c-ink)] font-display text-[8px] font-bold">
                                  ACTIVE
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSetActivePhoto(p.id)}
                                  className="bg-[var(--c-panel)] text-[var(--c-ink)] px-1.5 py-0.5 border border-[var(--c-ink)] font-display text-[8px] hover:bg-[var(--c-yellow)] cursor-pointer"
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
                                className="w-5 h-5 bg-[var(--c-red)] text-white font-display text-[8px] flex items-center justify-center border border-[var(--c-ink)] shadow-[1px_1px_0_var(--c-ink)] hover:bg-red-700 cursor-pointer"
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
