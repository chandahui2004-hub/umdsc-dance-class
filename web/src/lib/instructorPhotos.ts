import type { Instructor, InstructorPhoto } from '@umdsc/shared';

export const DEFAULT_INSTRUCTOR_PHOTOS: Record<string, string> = {
  'Carmen Loh': '/instructors/carmen-loh.png',
  'Lam Hong Woh': '/instructors/lam-hong-woh.png',
  'Newstyle Kelvin': '/instructors/newstyle-kelvin.png'
};

export const DEFAULT_INSTRUCTORS = {
  latin: {
    id: 'inst-lam',
    name: 'Lam Hong Woh',
    contact: '',
    color: 'pink',
    photoUrl: '/instructors/lam-hong-woh.png',
    active: true,
    version: 1,
    updatedBy: '',
    updatedAt: ''
  },
  popping: {
    id: 'inst-carmen',
    name: 'Carmen Loh',
    contact: '',
    color: 'blue',
    photoUrl: '/instructors/carmen-loh.png',
    active: true,
    version: 1,
    updatedBy: '',
    updatedAt: ''
  },
  hiphop: {
    id: 'inst-kelvin',
    name: 'Newstyle Kelvin',
    contact: '',
    color: 'orange',
    photoUrl: '/instructors/newstyle-kelvin.png',
    active: true,
    version: 1,
    updatedBy: '',
    updatedAt: ''
  }
} as const;

export const STANDARD_PHOTO_WIDTH = 1080;
export const STANDARD_PHOTO_HEIGHT = 1350;
export const STANDARD_PHOTO_ASPECT = '4/5';
export const STANDARD_PHOTO_HINT = 'Recommended size: 1080 × 1350 px (4:5 aspect ratio)';

/**
 * Robust instructor resolver that checks:
 * 1. Explicit session.instructorId
 * 2. Style's defaultInstructorId
 * 3. Style name matching known club instructors (Latin -> Lam, Popping -> Carmen, Locking/Hip Hop -> Kelvin)
 */
export function resolveInstructor(
  session?: { instructorId?: string; styleId?: string } | null,
  style?: { id?: string; name?: string; defaultInstructorId?: string } | null,
  instructors: Instructor[] = []
): Instructor | undefined {
  // 1. Direct match on session.instructorId
  if (session?.instructorId) {
    const direct = instructors.find((i) => i.id === session.instructorId);
    if (direct) return direct;
  }

  // 2. Match on style.defaultInstructorId
  if (style?.defaultInstructorId) {
    const byStyle = instructors.find((i) => i.id === style.defaultInstructorId);
    if (byStyle) return byStyle;
  }

  // 3. Fallback based on style name and known instructors
  const sName = (style?.name || '').toLowerCase();
  if (sName) {
    if (sName.includes('latin') || sName.includes('ballroom')) {
      const match = instructors.find((i) => {
        const n = i.name.toLowerCase();
        return n.includes('lam') || n.includes('hong woh');
      });
      if (match) return match;
      return DEFAULT_INSTRUCTORS.latin;
    }
    if (sName.includes('popping')) {
      const match = instructors.find((i) => i.name.toLowerCase().includes('carmen'));
      if (match) return match;
      return DEFAULT_INSTRUCTORS.popping;
    }
    if (sName.includes('locking') || sName.includes('hip hop') || sName.includes('hiphop')) {
      const match = instructors.find((i) => i.name.toLowerCase().includes('kelvin'));
      if (match) return match;
      return DEFAULT_INSTRUCTORS.hiphop;
    }
  }

  // 4. If session.instructorId wasn't found by ID, try matching by name
  if (session?.instructorId) {
    const lower = session.instructorId.toLowerCase();
    const match = instructors.find((i) => i.name.toLowerCase().includes(lower) || lower.includes(i.name.toLowerCase()));
    if (match) return match;
  }

  return undefined;
}

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
