export interface DriveIdResult {
  id: string;
  kind: 'folder' | 'spreadsheet' | 'file' | 'unknown';
}

const ID_REGEX = /^[A-Za-z0-9_-]{20,}$/;

export function extractDriveId(urlOrId: string): DriveIdResult | null {
  if (!urlOrId || typeof urlOrId !== 'string') return null;
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;

  // 1. Bare ID check
  if (ID_REGEX.test(trimmed)) {
    return { id: trimmed, kind: 'unknown' };
  }

  // 2. URL parsing
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname !== 'drive.google.com' && hostname !== 'docs.google.com') {
    return null;
  }

  const pathname = parsedUrl.pathname;

  // Folder patterns: /drive/folders/{id} or /drive/u/0/folders/{id}
  const folderMatch = pathname.match(/\/folders\/([A-Za-z0-9_-]{20,})/);
  if (folderMatch) {
    return { id: folderMatch[1], kind: 'folder' };
  }

  // Spreadsheet patterns: /spreadsheets/d/{id} or /spreadsheets/u/0/d/{id}
  const sheetMatch = pathname.match(/\/spreadsheets(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]{20,})/);
  if (sheetMatch) {
    return { id: sheetMatch[1], kind: 'spreadsheet' };
  }

  // File patterns: /file/d/{id} or /file/u/0/d/{id}
  const fileMatch = pathname.match(/\/file(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]{20,})/);
  if (fileMatch) {
    return { id: fileMatch[1], kind: 'file' };
  }

  // Generic /d/{id} pattern
  const dMatch = pathname.match(/\/d\/([A-Za-z0-9_-]{20,})/);
  if (dMatch) {
    return { id: dMatch[1], kind: 'unknown' };
  }

  // Query parameter: ?id={id} or open?id={id}
  const idParam = parsedUrl.searchParams.get('id');
  if (idParam && ID_REGEX.test(idParam)) {
    return { id: idParam, kind: 'unknown' };
  }

  return null;
}
