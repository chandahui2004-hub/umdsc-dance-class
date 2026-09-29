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
}

export class FakeDrive implements DrivePort {
  items = new Map<string, Item>();
  spreadsheets = new Map<string, FakeSpreadsheet>();

  info(id: string): DriveItemInfo {
    const item = this.items.get(id);
    if (!item) {
      return { exists: false, kind: 'file', name: '', canEdit: false };
    }
    return {
      exists: true,
      kind: item.kind,
      name: item.name,
      canEdit: item.canEdit
    };
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
      if (item.parentId === parentId && item.name === name && item.kind === 'folder') {
        return item.id;
      }
    }
    return null;
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
}
