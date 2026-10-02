import type { Instructor, InstructorPhoto } from '@umdsc/shared';

export const DEFAULT_INSTRUCTOR_PHOTOS: Record<string, string> = {
  'Carmen Loh': '/instructors/carmen-loh.png',
  'Lam Hong Woh': '/instructors/lam-hong-woh.png',
  'Newstyle Kelvin': '/instructors/newstyle-kelvin.png'
};

export const STANDARD_PHOTO_WIDTH = 1080;
export const STANDARD_PHOTO_HEIGHT = 1350;
export const STANDARD_PHOTO_ASPECT = '4/5';
export const STANDARD_PHOTO_HINT = 'Recommended size: 1080 × 1350 px (4:5 aspect ratio)';

/**
 * Returns the effective photo URL for an instructor, checking:
 * 1. Explicit active photoUrl
 * 2. Active photo in photos array / photosJson
 * 3. Pre-seeded fallback photo for known instructors (Carmen, Lam, Newstyle Kelvin)
 */
export function getInstructorPhotoUrl(instructor?: Partial<Instructor> | null): string | null {
  if (!instructor) return null;

  if (instructor.photoUrl && instructor.photoUrl.trim()) {
    return instructor.photoUrl.trim();
  }

  if (instructor.photosJson) {
    try {
      const photos: InstructorPhoto[] = JSON.parse(instructor.photosJson);
      const active = photos.find((p) => p.active);
      if (active?.url) return active.url;
      if (photos[0]?.url) return photos[0].url;
    } catch {
      // ignore
    }
  }

  if (Array.isArray(instructor.photos) && instructor.photos.length > 0) {
    const active = instructor.photos.find((p) => p.active);
    if (active?.url) return active.url;
    if (instructor.photos[0]?.url) return instructor.photos[0].url;
  }

  const name = instructor.name?.trim();
  if (name) {
    if (DEFAULT_INSTRUCTOR_PHOTOS[name]) {
      return DEFAULT_INSTRUCTOR_PHOTOS[name];
    }
    const lower = name.toLowerCase();
    for (const [key, path] of Object.entries(DEFAULT_INSTRUCTOR_PHOTOS)) {
      if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
        return path;
      }
    }
  }

  return null;
}
