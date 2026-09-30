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

  // Must not be a foreign non-Google URL
  if (trimmed.includes('://') && !trimmed.includes('google.com')) {
    return null;
  }

  // 2. Folder patterns: /drive/folders/{id} or /folders/{id}
  const folderMatch = trimmed.match(/\/folders\/([A-Za-z0-9_-]{20,})/);
  if (folderMatch) {
    return { id: folderMatch[1], kind: 'folder' };
  }

  // 3. Spreadsheet patterns: /spreadsheets/d/{id} or /spreadsheets/u/0/d/{id}
  const sheetMatch = trimmed.match(/\/spreadsheets(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]{20,})/);
  if (sheetMatch) {
    return { id: sheetMatch[1], kind: 'spreadsheet' };
  }

  // 4. File patterns: /file/d/{id} or /file/u/0/d/{id}
  const fileMatch = trimmed.match(/\/file(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]{20,})/);
  if (fileMatch) {
    return { id: fileMatch[1], kind: 'file' };
  }

  // 5. Generic /d/{id} pattern
  const dMatch = trimmed.match(/\/d\/([A-Za-z0-9_-]{20,})/);
  if (dMatch) {
    return { id: dMatch[1], kind: 'unknown' };
  }

  // 6. Query parameter: ?id={id} or &id={id} or open?id={id}
  const idParam = trimmed.match(/[?&]id=([A-Za-z0-9_-]{20,})/);
  if (idParam) {
    return { id: idParam[1], kind: 'unknown' };
  }

  return null;
}
