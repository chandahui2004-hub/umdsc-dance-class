import {
  DrivePort,
  DriveItemInfo,
  DriveFileInfo,
  SpreadsheetPort
} from '../../src/ports';
import { FakeSpreadsheet } from './fakeSheets';
import { newId } from '../../src/db/ids';

interface Item {
  id: string;
  kind: 'folder' | 'spreadsheet' | 'file';
  name: string;
  parentId?: string;
  canEdit: boolean;
  mimeType?: string;
  sizeBytes?: number;
  createdTime?: string;
  /** In the Drive bin: Drive still returns it, but the system treats it as missing. */
  trashed?: boolean;
}

export class FakeDrive implements DrivePort {
  items = new Map<string, Item>();
  spreadsheets = new Map<string, FakeSpreadsheet>();

  info(id: string): DriveItemInfo {
    const item = this.items.get(id);
    if (!item || item.trashed) {
      return { exists: false, kind: 'file', name: '', canEdit: false };
    }
    return {
      exists: true,
      kind: item.kind,
      name: item.name,
      canEdit: item.canEdit,
      mimeType: this.mimeTypes.get(id)
    };
  }

  private mimeTypes = new Map<string, string>();

  /** Test helper: what Drive should report as this item's mime type. */
  setMimeType(id: string, mimeType: string): void {
    this.mimeTypes.set(id, mimeType);
  }

  openSpreadsheet(id: string): SpreadsheetPort {
    let ss = this.spreadsheets.get(id);
    if (!ss) {
      ss = new FakeSpreadsheet(id, `Spreadsheet_${id}`);
      this.spreadsheets.set(id, ss);
      this.items.set(id, { id, kind: 'spreadsheet', name: ss.name, canEdit: true });
    }
    return ss;
  }

  createSpreadsheet(name: string, folderId: string): SpreadsheetPort {
    const id = '1' + newId('ss') + newId('drive');
    const ss = new FakeSpreadsheet(id, name);
    this.spreadsheets.set(id, ss);
    this.items.set(id, { id, kind: 'spreadsheet', name, parentId: folderId, canEdit: true });
    return ss;
  }

  createFolder(parentId: string, name: string): string {
    const id = '1' + newId('fld') + newId('folder');
    this.items.set(id, { id, kind: 'folder', name, parentId, canEdit: true });
    return id;
  }

  setAccess(id: string, canEdit: boolean): void {
    const item = this.items.get(id);
    if (item) {
      item.canEdit = canEdit;
    }
  }

  findChildFolder(parentId: string, name: string): string | null {
    for (const item of this.items.values()) {
      if (item.parentId === parentId && item.name === name && item.kind === 'folder' && !item.trashed) {
        return item.id;
      }
    }
    return null;
  }

  moveToFolder(fileId: string, folderId: string): void {
    const item = this.items.get(fileId);
    if (item) {
      item.parentId = folderId;
    }
  }

  parentOf(id: string): string | undefined {
    return this.items.get(id)?.parentId;
  }

  /** Moves an item to the Drive bin (it keeps its id and parent). */
  trash(id: string): void {
    const item = this.items.get(id);
    if (item) item.trashed = true;
  }

  nameOf(id: string): string | undefined {
    return this.items.get(id)?.name;
  }

  /** Folder ids whose move fails, e.g. a folder owned by another account. */
  failMovesFor = new Set<string>();

  moveFolder(folderId: string, newParentId: string): void {
    if (this.failMovesFor.has(folderId)) {
      throw new Error('Access denied: cannot move this folder');
    }
    const item = this.items.get(folderId);
    if (item) item.parentId = newParentId;
  }

  renameFolder(folderId: string, name: string): void {
    const item = this.items.get(folderId);
    if (item) item.name = name;
  }

  copySpreadsheet(id: string, name: string, folderId: string): string {
    const source = this.openSpreadsheet(id) as FakeSpreadsheet;
    const copy = this.createSpreadsheet(name, folderId) as FakeSpreadsheet;
    for (const [tab, sheet] of source.sheetsMap) {
      const rows = sheet.getDisplayValues();
      copy.addSheet(tab, []).setValues(1, 1, rows.length ? rows : [[]]);
    }
    return copy.id;
  }

  listFilesRecursive(folderId: string): DriveFileInfo[] {
    const results: DriveFileInfo[] = [];
    const collect = (pId: string) => {
      for (const item of this.items.values()) {
        if (item.parentId === pId) {
          if (item.kind === 'file') {
            results.push({
              id: item.id,
              name: item.name,
              mimeType: item.mimeType || 'video/mp4',
              sizeBytes: item.sizeBytes || 1024,
              createdTime: item.createdTime || new Date().toISOString(),
              parentId: pId,
              parentName: this.items.get(pId)?.name || ''
            });
          } else if (item.kind === 'folder') {
            collect(item.id);
          }
        }
      }
    };
    collect(folderId);
    return results;
  }

  setAnyoneReader(fileId: string): void {
    // no-op in fake
  }

  exportXlsxBase64(spreadsheetId: string): string {
    return 'fake-base64-xlsx-content';
  }

  getParentFolderId(fileId: string): string | null {
    return this.items.get(fileId)?.parentId || 'root';
  }

  createFileFromBase64(folderId: string, name: string, mimeType: string, _base64Data: string): { id: string; url: string } {
    const id = '1' + newId('file') + newId('drive');
    this.items.set(id, { id, kind: 'file', name, mimeType, parentId: folderId, canEdit: true });
    return { id, url: `https://lh3.googleusercontent.com/d/${id}` };
  }

  renameFile(fileId: string, name: string): void {
    const item = this.items.get(fileId);
    if (item) {
      item.name = name;
    }
  }

  /** Returns false (like Drive) when the file is missing or owned by another account. */
  deleteFile(fileId: string): boolean {
    const item = this.items.get(fileId) as any;
    if (!item || item.ownedByOther) return false;
    this.items.delete(fileId);
    return true;
  }
}

