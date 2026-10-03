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

/** `exists` is false for items that are missing, unshared, or in the Drive bin. */
export interface DriveItemInfo {
  exists: boolean;
  kind: 'folder' | 'spreadsheet' | 'file';
  name: string;
  canEdit: boolean;
  /** The Drive mime type (for example audio/mpeg); absent for items that do not exist. */
  mimeType?: string;
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
  /** A child folder with this name that is not in the Drive bin, or null. */
  findChildFolder(parentId: string, name: string): string | null;
  /** Moves the file into folderId unless it is already there. */
  moveToFolder(fileId: string, folderId: string): void;
  renameFolder(folderId: string, name: string): void;
  /** Moves a folder (with everything in it) under newParentId. */
  moveFolder(folderId: string, newParentId: string): void;
  /** Copies a spreadsheet into folderId and returns the copy's id. */
  copySpreadsheet(id: string, name: string, folderId: string): string;
  listFilesRecursive(folderId: string): DriveFileInfo[];
  setAnyoneReader(fileId: string): void;
  exportXlsxBase64(spreadsheetId: string): string;
  getParentFolderId(fileId: string): string | null;
  createFileFromBase64(folderId: string, name: string, mimeType: string, base64Data: string): { id: string; url: string };
  renameFile(fileId: string, name: string): void;
  deleteFile(fileId: string): void;
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

/** Outbound HTTP. Never throws on an HTTP error status, only when the network call itself fails. */
export interface HttpPort {
  fetch(
    url: string,
    opts?: { followRedirects?: boolean }
  ): { status: number; headers: Record<string, string>; body: string };
}

export interface YouTubeSearchResult {
  youtubeId: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
}

export interface YouTubeVideoInfo {
  youtubeId: string;
  durationSec: number;
  embeddable: boolean;
}

/** The YouTube Data API. Both calls throw AppError('QUOTA') when the daily allowance is used up. */
export interface YouTubePort {
  search(q: string, max: number): YouTubeSearchResult[];
  videos(ids: string[]): YouTubeVideoInfo[];
}

export interface Ctx {
  now(): Date;
  drive: DrivePort;
  cache: CachePort;
  lock: LockPort;
  props: PropsPort;
  db: Db;
  clubEmail: string;
  http: HttpPort;
  youtube: YouTubePort;
}
