import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage, newOpId } from '../../lib/api';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { ColorSwatchPicker } from '../../components/ui/ColorSwatchPicker';
import { PixelPortraitFrame } from '../../components/ui/PixelPortraitFrame';
import {
  getInstructorPhotoUrl,
  STANDARD_PHOTO_HINT,
  optimizeInstructorPhoto,
  convertDriveImageUrl,
  getDriveThumbnailUrl,
  fetchGoogleDrivePhotos,
  getInstructorPhotosWithDrive,
  type DrivePhotoFile
} from '../../lib/instructorPhotos';
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
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);

  const { data: instructors = [], isLoading } = useQuery<Instructor[]>({
    queryKey: ['instructors'],
    queryFn: async () => {
      const res = await api.post<Instructor[]>('instructors.list');
      return res.data;
    }
  });

  // Query Google Drive folder directly for all uploaded instructor photos
  const { data: driveFiles = [] } = useQuery<DrivePhotoFile[]>({
    queryKey: ['drive-instructor-photos'],
    queryFn: async () => {
      const direct = await fetchGoogleDrivePhotos();
      if (direct && direct.length > 0) return direct;
      try {
        const res = await api.post<{ files: DrivePhotoFile[] }>('instructors.drivePhotos', {});
        if (res.data?.files) return res.data.files;
      } catch {}
      return [];
    },
    refetchInterval: 10000
  });

  // Keep modal photos gallery in sync with Google Drive folder photos
  useEffect(() => {
    if (editingInstructor && driveFiles.length > 0) {
      setPhotos((prev) => {
        const newLocal = prev.filter((p) => p.url.startsWith('data:image/'));
        const drivePhotos = getInstructorPhotosWithDrive(editingInstructor, driveFiles);
        if (drivePhotos.length === 0) return prev;

        const currentActive = activePhotoUrl || editingInstructor.photoUrl;
        const mapped = drivePhotos.map((p) => ({
          ...p,
          active: currentActive ? currentActive.includes(p.id) || currentActive === p.url : p.active
        }));
        if (!mapped.some((p) => p.active) && mapped.length > 0 && newLocal.length === 0) {
          mapped[0].active = true;
        }
        return [...newLocal, ...mapped];
      });
    }
  }, [driveFiles, editingInstructor?.name, editingInstructor?.id]);

  const openCreate = () => {
    setIsCreating(true);
    setEditingInstructor(null);
    setName('');
    setContact('');
    setColor('orange');
    setPhotos([]);
    setActivePhotoUrl('');
    setPhotoUrlInput('');
    setShowUrlInput(false);
    setIsProcessingPhoto(false);
    setFormError(null);
  };

  const openEdit = (instructor: Instructor) => {
    setEditingInstructor(instructor);
    setIsCreating(false);
    setName(instructor.name);
    setContact(instructor.contact || '');
    setColor(instructor.color || 'orange');

    // Retrieve all photos including all duplicates in Google Drive
    const existingPhotos = getInstructorPhotosWithDrive(instructor, driveFiles);
    setPhotos(existingPhotos);
    const activeOne = existingPhotos.find((p) => p.active);
    setActivePhotoUrl(activeOne?.url || instructor.photoUrl || getInstructorPhotoUrl(instructor, driveFiles) || '');
    setPhotoUrlInput('');
    setShowUrlInput(false);
    setIsProcessingPhoto(false);
    setFormError(null);
  };

  const closeForm = () => {
    setIsCreating(false);
    setEditingInstructor(null);
    setFormError(null);
    setPhotoUrlInput('');
    setShowUrlInput(false);
    setIsProcessingPhoto(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle uploading and standardizing photo using canvas optimization
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFormError('Please select a valid image file (PNG, JPG, or WEBP).');
      return;
    }

    setIsProcessingPhoto(true);
    setFormError(null);

    try {
      const optimizedDataUrl = await optimizeInstructorPhoto(file);
      if (!optimizedDataUrl) {
        throw new Error('Could not optimize image');
      }

      const newPhotoId = 'photo_' + Date.now();
      const newPhoto: InstructorPhoto = {
        id: newPhotoId,
        url: optimizedDataUrl,
        active: true,
        uploadedAt: new Date().toISOString()
      };

      // Set all other photos to inactive, allow up to 10 in the gallery
      const updatedPhotos = [
        newPhoto,
        ...photos.map((p) => ({ ...p, active: false }))
      ].slice(0, 10);

      setPhotos(updatedPhotos);
      setActivePhotoUrl(optimizedDataUrl);
      setFormError(null);
    } catch (err: any) {
      setFormError('Failed to process image: ' + (err?.message || 'unknown error'));
    } finally {
      setIsProcessingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Add photo via direct URL or Google Drive link
  const handleAddPhotoFromUrl = () => {
    const directUrl = convertDriveImageUrl(photoUrlInput.trim());
    if (!directUrl) return;

    const newPhotoId = 'photo_' + Date.now();
    const newPhoto: InstructorPhoto = {
      id: newPhotoId,
      url: directUrl,
      active: true,
      uploadedAt: new Date().toISOString()
    };

    const updatedPhotos = [
      newPhoto,
      ...photos.map((p) => ({ ...p, active: false }))
    ].slice(0, 10);

    setPhotos(updatedPhotos);
    setActivePhotoUrl(directUrl);
    setPhotoUrlInput('');
    setShowUrlInput(false);
    setFormError(null);
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

  const handleDeletePhoto = async (photoId: string) => {
    const target = photos.find((p) => p.id === photoId);
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

    // Direct deletion in Google Drive if photo was already stored on Drive
    if (target?.url && editingInstructor && !target.url.startsWith('data:image/')) {
      try {
        await api.post('instructors.deletePhoto', {
          instructorId: editingInstructor.id,
          photoUrl: target.url,
          fileId: target.id
        });
        queryClient.invalidateQueries({ queryKey: ['instructors'] });
        queryClient.invalidateQueries({ queryKey: ['admin.bootstrap'] });
        queryClient.invalidateQueries({ queryKey: ['drive-instructor-photos'] });
      } catch (e) {
        console.error('Failed to delete photo directly from Drive:', e);
      }
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
        return await api.post('instructors.create', payload, { opId: newOpId() });
      } else if (editingInstructor) {
        payload.id = editingInstructor.id;
        payload.version = editingInstructor.version;
        return await api.post('instructors.update', payload, { opId: newOpId() });
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

  const deleteMutation = useMutation({
    mutationFn: async (inst: Instructor) => {
      return await api.post('instructors.delete', { id: inst.id, version: inst.version }, { opId: newOpId() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructors'] });
      queryClient.invalidateQueries({ queryKey: ['admin.bootstrap'] });
    },
    onError: (err) => {
      setFormError('Failed to delete instructor: ' + errorMessage(err));
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
        <div className="flex flex-wrap items-center gap-2">
          <PixelButton size="md" variant="primary" onClick={openCreate}>
            + NEW INSTRUCTOR
          </PixelButton>
        </div>
      </div>

      {formError && !isCreating && !editingInstructor && (
        <div role="alert" className="p-3 bg-[var(--night-1)] border-2 border-[var(--neon-red)] text-[var(--neon-red)] font-body text-sm font-bold">
          {formError}
        </div>
      )}

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
            const photoUrl = getInstructorPhotoUrl(inst, driveFiles);
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
                    name={inst.name}
                    glow={instColor}
                    size="sm"
                  />
                  {/* Instructor Color Banner below picture */}
                  <div
                    className="w-full py-1 text-center border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)] font-display text-[8px] font-bold text-[var(--on-neon)] uppercase tracking-wider"
                    style={{ backgroundColor: instColor }}
                  >
                    INSTRUCTOR{inst.color ? ` · ${inst.color.toUpperCase()}` : ''}
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
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (confirm(`Delete instructor "${inst.name}"? This will remove them from the system.`)) {
                        deleteMutation.mutate(inst);
                      }
                    }}
                  >
                    {deleteMutation.isPending && (deleteMutation.variables as any)?.id === inst.id
                      ? 'DELETING...'
                      : 'DELETE'}
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-[12px] text-[var(--text-1)] tracking-wider">
                      INSTRUCTOR PICTURE
                    </h3>
                    <p className="font-body text-[14px] text-[var(--text-2)] mt-0.5">
                      {STANDARD_PHOTO_HINT}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <PixelButton
                      size="sm"
                      variant="secondary"
                      type="button"
                      disabled={isProcessingPhoto}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {isProcessingPhoto ? 'OPTIMIZING...' : '+ UPLOAD PICTURE'}
                    </PixelButton>
                    <PixelButton
                      size="sm"
                      variant="secondary"
                      type="button"
                      onClick={() => setShowUrlInput(!showUrlInput)}
                    >
                      {showUrlInput ? 'CANCEL LINK' : '+ LINK URL'}
                    </PixelButton>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </div>

                {showUrlInput && (
                  <div className="flex flex-col sm:flex-row gap-2 p-3 bg-[var(--night-2)] border border-[var(--outline)]">
                    <input
                      type="url"
                      placeholder="Paste image URL or Google Drive link..."
                      value={photoUrlInput}
                      onChange={(e) => setPhotoUrlInput(e.target.value)}
                      className="px-well flex-1 min-h-[38px] px-2 font-mono text-[13px]"
                    />
                    <PixelButton
                      size="sm"
                      variant="primary"
                      type="button"
                      disabled={!photoUrlInput.trim()}
                      onClick={handleAddPhotoFromUrl}
                    >
                      APPLY LINK
                    </PixelButton>
                  </div>
                )}

                {isProcessingPhoto && (
                  <div className="p-3 bg-[var(--night-2)] border border-[var(--neon-cyan)] flex items-center justify-center gap-2">
                    <Spinner />
                    <span className="font-display text-[10px] text-[var(--neon-cyan)]">
                      OPTIMIZING PORTRAIT IMAGE FOR CLOUD SYNC...
                    </span>
                  </div>
                )}

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
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover object-top absolute inset-0"
                              onError={(e) => {
                                const thumb = getDriveThumbnailUrl(p.url, 400);
                                if (thumb && thumb !== p.url && e.currentTarget.src !== thumb) {
                                  e.currentTarget.src = thumb;
                                }
                              }}
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

              <div className="flex flex-wrap gap-3 pt-3 border-t-2 border-[var(--outline)]">
                <PixelButton
                  size="md"
                  variant="primary"
                  className="flex-1"
                  disabled={saveMutation.isPending || !name.trim()}
                  onClick={() => saveMutation.mutate()}
                >
                  {saveMutation.isPending ? 'SAVING...' : 'SAVE INSTRUCTOR'}
                </PixelButton>
                {editingInstructor && (
                  <PixelButton
                    size="md"
                    variant="danger"
                    type="button"
                    disabled={deleteMutation.isPending || saveMutation.isPending}
                    onClick={() => {
                      if (confirm(`Delete instructor "${editingInstructor.name}"? This will remove them from the system.`)) {
                        deleteMutation.mutate(editingInstructor);
                        closeForm();
                      }
                    }}
                  >
                    {deleteMutation.isPending ? 'DELETING...' : 'DELETE INSTRUCTOR'}
                  </PixelButton>
                )}
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
