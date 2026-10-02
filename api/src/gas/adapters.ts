import {
  SheetPort,
  SpreadsheetPort,
  DrivePort,
  DriveItemInfo,
  DriveFileInfo,
  CachePort,
  LockPort,
  PropsPort,
  Cell,
  HttpPort,
  YouTubePort,
  YouTubeSearchResult,
  YouTubeVideoInfo
} from '../ports';
import { parseIsoDurationSeconds } from '../logic/isoDuration';
import { AppError } from '../errors';

export class GasSheetAdapter implements SheetPort {
  constructor(private sheet: GoogleAppsScript.Spreadsheet.Sheet) {}

  get name(): string {
    return this.sheet.getName();
  }

  getDisplayValues(): string[][] {
    const lastRow = this.sheet.getLastRow();
    const lastCol = this.sheet.getLastColumn();
    if (lastRow === 0 || lastCol === 0) return [];
    return this.sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  }

  getLastRow(): number {
    return this.sheet.getLastRow();
  }

  getLastColumn(): number {
    return this.sheet.getLastColumn();
  }

  setValues(row1: number, col1: number, values: Cell[][]): void {
    if (values.length === 0 || values[0].length === 0) return;
    this.sheet.getRange(row1, col1, values.length, values[0].length).setValues(values as any);
  }

  appendRows(values: Cell[][]): void {
    if (values.length === 0) return;
    const lastRow = this.sheet.getLastRow();
    const cols = values[0].length;
    this.sheet.getRange(lastRow + 1, 1, values.length, cols).setValues(values as any);
  }

  setPlainTextColumns(col1s: number[]): void {
    for (const col1 of col1s) {
      const maxRows = this.sheet.getMaxRows();
      this.sheet.getRange(1, col1, maxRows, 1).setNumberFormat('@');
    }
  }

  hideRow(row1: number): void {
    const range = this.sheet.getRange(row1, 1);
    this.sheet.hideRow(range);
  }

  protectRowWarningOnly(row1: number): void {
    const protection = this.sheet.getRange(row1, 1, 1, this.sheet.getMaxColumns()).protect();
    protection.setWarningOnly(true);
  }

  lastRowValues(): { lastRow: number; values: string[] } {
    const lastRow = this.sheet.getLastRow();
    const lastCol = this.sheet.getLastColumn();
    if (lastRow === 0 || lastCol === 0) return { lastRow: 0, values: [] };
    return { lastRow, values: this.sheet.getRange(lastRow, 1, 1, lastCol).getDisplayValues()[0] };
  }

  clearBody(): void {
    const lastRow = this.sheet.getLastRow();
    if (lastRow > 1) {
      this.sheet.deleteRows(2, lastRow - 1);
    }
  }

  setHeaderRow(headers: string[]): void {
    const width = Math.max(headers.length, this.sheet.getLastColumn(), 1);
    const row: string[] = [];
    for (let i = 0; i < width; i++) row.push(headers[i] ?? '');
    this.sheet.getRange(1, 1, 1, width).setValues([row]);
  }
}

export class GasSpreadsheetAdapter implements SpreadsheetPort {
  constructor(private ss: GoogleAppsScript.Spreadsheet.Spreadsheet) {}

  get id(): string {
    return this.ss.getId();
  }

  get url(): string {
    return this.ss.getUrl();
  }

  get name(): string {
    return this.ss.getName();
  }

  sheet(name: string): SheetPort | null {
    const s = this.ss.getSheetByName(name);
    return s ? new GasSheetAdapter(s) : null;
  }

  addSheet(name: string, headers: string[] = []): SheetPort {
    let s = this.ss.getSheetByName(name);
    if (!s) {
      s = this.ss.insertSheet(name);
    }
    if (headers.length > 0) {
      s.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    return new GasSheetAdapter(s);
  }

  setName(name: string): void {
    this.ss.setName(name);
  }

  firstSheet(): SheetPort | null {
    const sheets = this.ss.getSheets();
    return sheets.length > 0 ? new GasSheetAdapter(sheets[0]) : null;
  }

  removeSheet(name: string): void {
    const s = this.ss.getSheetByName(name);
    if (s) this.ss.deleteSheet(s);
  }
}

export class GasDriveAdapter implements DrivePort {
  info(id: string): DriveItemInfo {
    try {
      // Use advanced Drive service (v3) to get metadata & capabilities
      const file = (Drive as any).Files.get(id, {
        fields: 'id,name,mimeType,trashed,capabilities(canEdit)'
      });
      if (file.trashed) {
        // Drive still returns binned items; they would be purged after 30 days
        return { exists: false, kind: 'file', name: '', canEdit: false };
      }

      const mime = file.mimeType || '';
      let kind: 'folder' | 'spreadsheet' | 'file' = 'file';
      if (mime === 'application/vnd.google-apps.folder') {
        kind = 'folder';
      } else if (mime === 'application/vnd.google-apps.spreadsheet') {
        kind = 'spreadsheet';
      }

      return {
        exists: true,
        kind,
        name: file.name || '',
        canEdit: Boolean(file.capabilities?.canEdit),
        mimeType: mime
      };
    } catch {
      return { exists: false, kind: 'file', name: '', canEdit: false };
    }
  }

  openSpreadsheet(id: string): SpreadsheetPort {
    const ss = SpreadsheetApp.openById(id);
    return new GasSpreadsheetAdapter(ss);
  }

  createSpreadsheet(name: string, folderId: string): SpreadsheetPort {
    const ss = SpreadsheetApp.create(name);
    const file = DriveApp.getFileById(ss.getId());
    const folder = DriveApp.getFolderById(folderId);
    file.moveTo(folder);
    return new GasSpreadsheetAdapter(ss);
  }

  createFolder(parentId: string, name: string): string {
    const parent = DriveApp.getFolderById(parentId);
    const child = parent.createFolder(name);
    return child.getId();
  }

  findChildFolder(parentId: string, name: string): string | null {
    const parent = DriveApp.getFolderById(parentId);
    const folders = parent.getFoldersByName(name);
    while (folders.hasNext()) {
      const folder = folders.next();
      if (!folder.isTrashed()) return folder.getId();
    }
    return null;
  }

  moveToFolder(fileId: string, folderId: string): void {
    const file = DriveApp.getFileById(fileId);
    const parents = file.getParents();
    while (parents.hasNext()) {
      if (parents.next().getId() === folderId) return;
    }
    file.moveTo(DriveApp.getFolderById(folderId));
  }

  moveFolder(folderId: string, newParentId: string): void {
    DriveApp.getFolderById(folderId).moveTo(DriveApp.getFolderById(newParentId));
  }

  renameFolder(folderId: string, name: string): void {
    DriveApp.getFolderById(folderId).setName(name);
  }

  copySpreadsheet(id: string, name: string, folderId: string): string {
    return DriveApp.getFileById(id).makeCopy(name, DriveApp.getFolderById(folderId)).getId();
  }

  listFilesRecursive(folderId: string): DriveFileInfo[] {
    const results: DriveFileInfo[] = [];
    const collect = (folder: GoogleAppsScript.Drive.Folder) => {
      const files = folder.getFiles();
      while (files.hasNext()) {
        const file = files.next();
        results.push({
          id: file.getId(),
          name: file.getName(),
          mimeType: file.getMimeType(),
          sizeBytes: file.getSize(),
          createdTime: file.getDateCreated().toISOString(),
          parentId: folder.getId(),
          parentName: folder.getName()
        });
      }
      const subs = folder.getFolders();
      while (subs.hasNext()) {
        collect(subs.next());
      }
    };

    const rootFolder = DriveApp.getFolderById(folderId);
    collect(rootFolder);
    return results;
  }

  setAnyoneReader(fileId: string): void {
    try {
      (Drive as any).Permissions.create(
        { type: 'anyone', role: 'reader' },
        fileId
      );
    } catch (err: any) {
      Logger.log('Error setting anyone reader: ' + err.message);
    }
  }

  exportXlsxBase64(spreadsheetId: string): string {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
    const res = UrlFetchApp.fetch(url, {
      headers: {
        Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
      }
    });
    return Utilities.base64Encode(res.getBlob().getBytes());
  }
}

export class GasCacheAdapter implements CachePort {
  private cache: GoogleAppsScript.Base.Cache;

  constructor() {
    this.cache = CacheService.getScriptCache();
  }

  get(key: string): string | null {
    return this.cache.get(key);
  }

  put(key: string, value: string, ttlSec: number): void {
    this.cache.put(key, value, ttlSec);
  }

  remove(key: string): void {
    this.cache.remove(key);
  }
}

export class GasLockAdapter implements LockPort {
  private lock: GoogleAppsScript.Lock.Lock;

  constructor() {
    this.lock = LockService.getScriptLock();
  }

  tryLock(ms: number): boolean {
    return this.lock.tryLock(ms);
  }

  release(): void {
    this.lock.releaseLock();
  }
}

export class GasPropsAdapter implements PropsPort {
  private props: GoogleAppsScript.Properties.Properties;

  constructor() {
    this.props = PropertiesService.getScriptProperties();
  }

  get(key: string): string | null {
    return this.props.getProperty(key);
  }

  set(key: string, value: string): void {
    this.props.setProperty(key, value);
  }
}

export class GasHttpAdapter implements HttpPort {
  fetch(url: string, opts?: { followRedirects?: boolean }) {
    const res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: opts?.followRedirects !== false
    });
    const headers: Record<string, string> = {};
    const raw = res.getAllHeaders() as Record<string, string | string[]>;
    for (const name of Object.keys(raw)) {
      const value = raw[name];
      headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
    }
    return { status: res.getResponseCode(), headers, body: res.getContentText() };
  }
}

function youTubeError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  return /quota/i.test(message)
    ? new AppError('QUOTA', 'YouTube search limit reached for today.')
    : new AppError('INTERNAL', 'YouTube lookup failed: ' + message);
}

export class GasYouTubeAdapter implements YouTubePort {
  search(q: string, max: number): YouTubeSearchResult[] {
    try {
      const res = (YouTube as any).Search.list('snippet', {
        q,
        type: 'video',
        videoEmbeddable: 'true',
        maxResults: max
      });
      return (res.items || [])
        .filter((item: any) => item.id && item.id.videoId)
        .map((item: any) => ({
          youtubeId: item.id.videoId,
          title: item.snippet?.title || '',
          channel: item.snippet?.channelTitle || '',
          thumbnailUrl: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || ''
        }));
    } catch (err) {
      throw youTubeError(err);
    }
  }

  videos(ids: string[]): YouTubeVideoInfo[] {
    if (ids.length === 0) return [];
    try {
      const res = (YouTube as any).Videos.list('contentDetails,status', { id: ids.join(',') });
      return (res.items || []).map((item: any) => ({
        youtubeId: item.id,
        durationSec: parseIsoDurationSeconds(item.contentDetails?.duration || ''),
        embeddable: item.status?.embeddable !== false
      }));
    } catch (err) {
      throw youTubeError(err);
    }
  }
}
