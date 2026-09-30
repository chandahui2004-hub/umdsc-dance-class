import type { Db } from './db/db';

export type Cell = string | number | boolean;

export interface SheetPort {
  name: string;
  getDisplayValues(): string[][];
  getLastRow(): number;
  getLastColumn(): number;
  setValues(row1: number, col1: number, values: Cell[][]): void;
  appendRows(values: Cell[][]): void;
  setPlainTextColumns(col1s: number[]): void;
  hideRow(row1: number): void;
  protectRowWarningOnly(row1: number): void;
  /** One cheap read: the last used row number and that row's display values. */
  lastRowValues(): { lastRow: number; values: string[] };
  /** Removes every row below the header. */
  clearBody(): void;
  /** Replaces row 1 and blanks any header cells to the right of `headers`. */
  setHeaderRow(headers: string[]): void;
}

export interface SpreadsheetPort {
  id: string;
  url: string;
  name: string;
  sheet(name: string): SheetPort | null;
  addSheet(name: string, headers: string[]): SheetPort;
  setName(name: string): void;
  firstSheet?(): SheetPort | null;
  removeSheet(name: string): void;
}

export interface DriveItemInfo {
  exists: boolean;
  kind: 'folder' | 'spreadsheet' | 'file';
  name: string;
  canEdit: boolean;
}

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdTime: string;
  parentId: string;
  parentName: string;
}

export interface DrivePort {
  info(id: string): DriveItemInfo;
  openSpreadsheet(id: string): SpreadsheetPort;
  createSpreadsheet(name: string, folderId: string): SpreadsheetPort;
  createFolder(parentId: string, name: string): string;
  findChildFolder(parentId: string, name: string): string | null;
  /** Moves the file into folderId unless it is already there. */
  moveToFolder(fileId: string, folderId: string): void;
  renameFolder(folderId: string, name: string): void;
  /** Copies a spreadsheet into folderId and returns the copy's id. */
  copySpreadsheet(id: string, name: string, folderId: string): string;
  listFilesRecursive(folderId: string): DriveFileInfo[];
  setAnyoneReader(fileId: string): void;
  exportXlsxBase64(spreadsheetId: string): string;
}

export interface CachePort {
  get(key: string): string | null;
  put(key: string, value: string, ttlSec: number): void;
  remove(key: string): void;
}

export interface LockPort {
  tryLock(ms: number): boolean;
  release(): void;
}

export interface PropsPort {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface Ctx {
  now(): Date;
  drive: DrivePort;
  cache: CachePort;
  lock: LockPort;
  props: PropsPort;
  db: Db;
  clubEmail: string;
}
