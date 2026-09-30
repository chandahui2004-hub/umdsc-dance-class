import {
  SheetPort,
  SpreadsheetPort,
  DrivePort,
  DriveItemInfo,
  DriveFileInfo,
  CachePort,
  LockPort,
  PropsPort,
  Cell
} from '../ports';

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
}

export class GasDriveAdapter implements DrivePort {
  info(id: string): DriveItemInfo {
    try {
      // Use advanced Drive service (v3) to get metadata & capabilities
      const file = (Drive as any).Files.get(id, {
        fields: 'id,name,mimeType,capabilities(canEdit)'
      });

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
        canEdit: Boolean(file.capabilities?.canEdit)
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
    if (folders.hasNext()) {
      return folders.next().getId();
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
