import { RowMeta } from '@umdsc/shared';
import { SheetPort, Cell } from '../ports';
import { AppError } from '../errors';
import { newId } from './ids';
import { PLAIN_TEXT_COLUMNS } from './schema';

export interface RowCodec<T> {
  toCells(row: T): Record<string, Cell>;
  fromCells(cells: Record<string, string>): T;
}

export class Table<T extends RowMeta> {
  private headerIndices: Map<string, number> = new Map();
  private cachedValues: string[][] | null = null;
  private plainTextConfigured = false;

  constructor(
    private sheet: SheetPort,
    private columns: readonly string[],
    private codec: RowCodec<T>,
    private prefix: string = 'row'
  ) {
    this.ensureLoaded();
  }

  private ensureLoaded(): string[][] {
    if (this.cachedValues === null) {
      this.cachedValues = this.sheet.getDisplayValues();
      let headers = this.cachedValues[0] || [];

      // A sheet created before a column was added to the schema would silently drop that column's
      // data (cells are matched by header name). Append the missing headers once; old rows read ''.
      if (headers.length > 0) {
        const present = new Set(headers.map(h => h.trim()));
        const missing = this.columns.filter(c => !present.has(c));
        if (missing.length > 0) {
          this.sheet.setValues(1, headers.length + 1, [missing]);
          headers = [...headers, ...missing];
          this.cachedValues[0] = headers;
        }
      }

      this.headerIndices.clear();
      headers.forEach((h, idx) => {
        this.headerIndices.set(h.trim(), idx);
      });
    }
    return this.cachedValues;
  }

  private configurePlainText(): void {
    if (this.plainTextConfigured) return;
    this.ensureLoaded();
    const plainCols: number[] = [];
    this.headerIndices.forEach((idx, name) => {
      if (PLAIN_TEXT_COLUMNS.has(name)) {
        plainCols.push(idx + 1);
      }
    });
    if (plainCols.length > 0) {
      this.sheet.setPlainTextColumns(plainCols);
    }
    this.plainTextConfigured = true;
  }

  private rowToObject(row: string[]): T {
    const cells: Record<string, string> = {};
    this.headerIndices.forEach((colIdx, name) => {
      cells[name] = row[colIdx] ?? '';
    });
    return this.codec.fromCells(cells);
  }

  private objectToRowCells(item: T, headersLength: number): Cell[] {
    const cellsRecord = this.codec.toCells(item);
    const rowCells: Cell[] = new Array(headersLength).fill('');
    this.headerIndices.forEach((colIdx, name) => {
      rowCells[colIdx] = cellsRecord[name] ?? '';
    });
    return rowCells;
  }

  all(opts?: { includeInactive?: boolean }): T[] {
    const rows = this.ensureLoaded();
    const items: T[] = [];
    for (let r = 1; r < rows.length; r++) {
      if (rows[r].length === 0 || rows[r].every(c => !c)) continue;
      const item = this.rowToObject(rows[r]);
      if (opts?.includeInactive || item.active) {
        items.push(item);
      }
    }
    return items;
  }

  get(id: string): T | null {
    if (!id) return null;
    const items = this.all({ includeInactive: true });
    return items.find(item => item.id === id) || null;
  }

  find(pred: (r: T) => boolean): T[] {
    return this.all({ includeInactive: true }).filter(pred);
  }

  insert(data: Omit<T, keyof RowMeta>, actor: string, now: Date): T {
    this.configurePlainText();
    const rows = this.ensureLoaded();
    const headers = rows[0] || [];

    const id = (data as any).id || newId(this.prefix);
    const newItem: T = {
      ...(data as any),
      id,
      version: 1,
      updatedBy: actor,
      updatedAt: now.toISOString(),
      active: true
    };

    const rowCells = this.objectToRowCells(newItem, headers.length);
    this.sheet.appendRows([rowCells]);
    this.cachedValues?.push(rowCells.map(c => String(c ?? '')));

    return newItem;
  }

  /** Drops the cached copy so the next read sees rows written by other requests. */
  reload(): void {
    this.cachedValues = null;
  }

  /**
   * With keepVersion, the row keeps its version: used for system bookkeeping (sync
   * status, folder ids) so it never causes a VERSION_CONFLICT for an admin's edit.
   */
  update(
    id: string,
    version: number,
    patch: Partial<Omit<T, keyof RowMeta>>,
    actor: string,
    now: Date,
    opts?: { keepVersion?: boolean }
  ): T {
    this.configurePlainText();
    const rows = this.ensureLoaded();
    const idColIdx = this.headerIndices.get('id');
    if (idColIdx === undefined) {
      throw new AppError('INTERNAL', 'Column id not found in table');
    }

    let targetRowIndex = -1;
    for (let r = 1; r < rows.length; r++) {
      if (rows[r][idColIdx] === id) {
        targetRowIndex = r;
        break;
      }
    }

    if (targetRowIndex === -1) {
      throw new AppError('NOT_FOUND', `Item with id ${id} not found`);
    }

    const currentItem = this.rowToObject(rows[targetRowIndex]);
    if (currentItem.version !== version) {
      throw new AppError(
        'VERSION_CONFLICT',
        `Version conflict on item ${id}: expected ${version}, found ${currentItem.version}`,
        false,
        currentItem
      );
    }

    const updatedItem: T = {
      ...currentItem,
      ...(patch as any),
      id,
      version: opts?.keepVersion ? version : version + 1,
      updatedBy: opts?.keepVersion ? currentItem.updatedBy : actor,
      updatedAt: opts?.keepVersion ? currentItem.updatedAt : now.toISOString(),
      active: patch.active !== undefined ? patch.active : currentItem.active
    };

    const headers = rows[0] || [];
    const updatedCells = this.objectToRowCells(updatedItem, headers.length);

    this.sheet.setValues(targetRowIndex + 1, 1, [updatedCells]);
    rows[targetRowIndex] = updatedCells.map(c => String(c ?? ''));

    return updatedItem;
  }

  deactivate(id: string, version: number, actor: string, now: Date): T {
    return this.update(id, version, { active: false } as any, actor, now);
  }

  /**
   * Inserts or updates many rows matched on `key`, writing the whole table body
   * with a single setValues call. Rows whose cells do not change keep their version.
   */
  upsertMany(key: keyof T, rows: Omit<T, keyof RowMeta>[], actor: string, now: Date): T[] {
    this.configurePlainText();
    const values = this.ensureLoaded();
    const headers = values[0] || [];
    const width = headers.length;
    const pad = (cells: string[]) => {
      const out = cells.slice(0, width);
      while (out.length < width) out.push('');
      return out;
    };

    const body: string[][] = values.slice(1).map(pad);
    const indexByKey = new Map<string, number>();
    body.forEach((cells, i) => {
      if (cells.every(c => !c)) return;
      const item = this.rowToObject(cells);
      indexByKey.set(String(item[key]), i);
    });

    const result: T[] = [];
    for (const data of rows) {
      const k = String((data as any)[key]);
      const idx = indexByKey.get(k);
      if (idx !== undefined) {
        const current = this.rowToObject(body[idx]);
        const merged: T = { ...current, ...(data as any), id: current.id, version: current.version,
          updatedBy: current.updatedBy, updatedAt: current.updatedAt, active: current.active };
        const mergedCells = this.objectToRowCells(merged, width).map(c => String(c ?? ''));
        if (mergedCells.join('\u001f') === body[idx].join('\u001f')) {
          result.push(current);
          continue;
        }
        const updated: T = { ...merged, version: current.version + 1, updatedBy: actor, updatedAt: now.toISOString() };
        body[idx] = this.objectToRowCells(updated, width).map(c => String(c ?? ''));
        result.push(updated);
      } else {
        const created: T = {
          ...(data as any),
          id: (data as any).id || newId(this.prefix),
          version: 1,
          updatedBy: actor,
          updatedAt: now.toISOString(),
          active: true
        };
        indexByKey.set(k, body.length);
        body.push(this.objectToRowCells(created, width).map(c => String(c ?? '')));
        result.push(created);
      }
    }

    if (body.length > 0) {
      this.sheet.setValues(2, 1, body);
    }
    this.cachedValues = [values[0] || [], ...body];
    return result;
  }

  upsertBy(key: keyof T, data: Omit<T, keyof RowMeta>, actor: string, now: Date): T {
    const existing = this.all({ includeInactive: true }).find(r => r[key] === (data as any)[key]);
    if (existing) {
      return this.update(existing.id, existing.version, data, actor, now);
    }
    return this.insert(data, actor, now);
  }
}
