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
 * Converts a Google Drive share link into a direct public image stream URL.
 */
export function convertDriveImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }
  return trimmed;
}

/**
 * Downscales and optimizes an instructor portrait in the browser using HTML5 Canvas.
 * - Standardizes to 4:5 aspect ratio (center-crops faces cleanly).
 * - Exports to WebP (with JPEG fallback) at target 360 × 450 px.
 * - Guarantees data URL character length stays comfortably below Google Sheets' 50,000 limit (~10k-25k chars).
 */
export async function optimizeInstructorPhoto(
  file: File,
  options?: {
    targetWidth?: number;
    targetHeight?: number;
    quality?: number;
    maxChars?: number;
  }
): Promise<string> {
  const targetWidth = options?.targetWidth ?? 360;
  const targetHeight = options?.targetHeight ?? 450;
  const maxChars = options?.maxChars ?? 35000;
  let quality = options?.quality ?? 0.82;

  // In non-DOM / test environments without Canvas support, fallback to FileReader
  if (typeof document === 'undefined') {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = (e) => reject(new Error('Failed to load image: ' + String(e)));
      el.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext ? canvas.getContext('2d') : null;

    if (!ctx) {
      // Fallback if 2d context unavailable
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve((e.target?.result as string) || '');
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const imgAspect = (img.width || targetWidth) / (img.height || targetHeight);
    const targetAspect = targetWidth / targetHeight; // 0.8

    let srcX = 0;
    let srcY = 0;
    let srcW = img.width || targetWidth;
    let srcH = img.height || targetHeight;

    if (imgAspect > targetAspect) {
      // Wider than 4:5 -> crop horizontally
      srcW = (img.height || targetHeight) * targetAspect;
      srcX = ((img.width || targetWidth) - srcW) / 2;
    } else {
      // Taller than 4:5 -> crop vertically (30% from top favors portrait head/chest)
      srcH = (img.width || targetWidth) / targetAspect;
      srcY = Math.max(0, ((img.height || targetHeight) - srcH) * 0.3);
    }

    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, targetWidth, targetHeight);

    // Try WebP first
    let dataUrl = canvas.toDataURL('image/webp', quality);
    if (!dataUrl.startsWith('data:image/webp')) {
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    // Guard against oversized outputs
    if (dataUrl.length > maxChars) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.65);
      if (dataUrl.length > maxChars) {
        const smallCanvas = document.createElement('canvas');
        smallCanvas.width = 240;
        smallCanvas.height = 300;
        const smallCtx = smallCanvas.getContext('2d');
        if (smallCtx) {
          smallCtx.drawImage(canvas, 0, 0, 240, 300);
          dataUrl = smallCanvas.toDataURL('image/jpeg', 0.60);
        }
      }
    }

    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}


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
