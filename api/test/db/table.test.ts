import { describe, it, expect, beforeEach } from 'vitest';
import { Table, RowCodec } from '../../src/db/table';
import { RowMeta, DanceStyle } from '@umdsc/shared';
import { SheetPort, Cell } from '../../src/ports';
import { AppError } from '../../src/errors';

class FakeSheet implements SheetPort {
  plainTextColumns: number[] = [];
  hiddenRows: number[] = [];
  protectedRows: number[] = [];

  constructor(public name: string, public rows: Cell[][]) {}

  getDisplayValues(): string[][] {
    return this.rows.map(r => r.map(c => String(c ?? '')));
  }

  getLastRow(): number {
    return this.rows.length;
  }

  getLastColumn(): number {
    return this.rows[0]?.length || 0;
  }

  setValues(row1: number, col1: number, values: Cell[][]): void {
    for (let r = 0; r < values.length; r++) {
      const targetRow = row1 - 1 + r;
      while (this.rows.length <= targetRow) {
        this.rows.push([]);
      }
      for (let c = 0; c < values[r].length; c++) {
        this.rows[targetRow][col1 - 1 + c] = values[r][c];
      }
    }
  }

  appendRows(values: Cell[][]): void {
    for (const row of values) {
      this.rows.push([...row]);
    }
  }

  setPlainTextColumns(col1s: number[]): void {
    this.plainTextColumns = Array.from(new Set([...this.plainTextColumns, ...col1s]));
  }

  hideRow(row1: number): void {
    this.hiddenRows.push(row1);
  }

  protectRowWarningOnly(row1: number): void {
    this.protectedRows.push(row1);
  }
}

interface TestItem extends RowMeta {
  name: string;
  category: string;
}

const testCodec: RowCodec<TestItem> = {
  toCells(item: TestItem): Record<string, Cell> {
    return {
      id: item.id,
      version: item.version,
      updatedBy: item.updatedBy,
      updatedAt: item.updatedAt,
      active: item.active ? 'TRUE' : 'FALSE',
      name: item.name,
      category: item.category
    };
  },
  fromCells(cells: Record<string, string>): TestItem {
    return {
      id: cells.id,
      version: Number(cells.version || 1),
      updatedBy: cells.updatedBy || '',
      updatedAt: cells.updatedAt || '',
      active: cells.active === 'TRUE' || cells.active === 'true',
      name: cells.name || '',
      category: cells.category || ''
    };
  }
};

describe('Table', () => {
  const columns = ['name', 'category', 'id', 'version', 'updatedBy', 'updatedAt', 'active'];

  it('insert assigns id, version 1, audit fields', () => {
    const sheet = new FakeSheet('Items', [[...columns]]);
    const table = new Table<TestItem>(sheet, columns, testCodec, 'item');
    const now = new Date('2026-09-28T12:00:00Z');

    const created = table.insert({ name: 'Hip Hop', category: 'Dance' }, 'admin1', now);

    expect(created.id).toMatch(/^item_/);
    expect(created.version).toBe(1);
    expect(created.updatedBy).toBe('admin1');
    expect(created.updatedAt).toBe(now.toISOString());
    expect(created.active).toBe(true);

    const retrieved = table.get(created.id);
    expect(retrieved).toEqual(created);
  });

  it('columns are found by header name even when reordered', () => {
    const shuffledColumns = ['active', 'id', 'category', 'version', 'name', 'updatedAt', 'updatedBy'];
    const sheet = new FakeSheet('Items', [[...shuffledColumns]]);
    const table = new Table<TestItem>(sheet, columns, testCodec, 'item');
    const now = new Date('2026-09-28T12:00:00Z');

    const created = table.insert({ name: 'Popping', category: 'Street' }, 'admin2', now);
    const retrieved = table.get(created.id);

    expect(retrieved?.name).toBe('Popping');
    expect(retrieved?.category).toBe('Street');
    expect(retrieved?.version).toBe(1);
  });

  it('update with stale version throws VERSION_CONFLICT with latest row', () => {
    const sheet = new FakeSheet('Items', [[...columns]]);
    const table = new Table<TestItem>(sheet, columns, testCodec, 'item');
    const now = new Date('2026-09-28T12:00:00Z');

    const item = table.insert({ name: 'Locking', category: 'Dance' }, 'admin1', now);
    table.update(item.id, 1, { name: 'Locking Updated' }, 'admin1', now);

    expect(() => {
      table.update(item.id, 1, { name: 'Conflict Edit' }, 'admin2', now);
    }).toThrowError();

    try {
      table.update(item.id, 1, { name: 'Conflict Edit' }, 'admin2', now);
    } catch (err: any) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('VERSION_CONFLICT');
      expect(err.latest.version).toBe(2);
      expect(err.latest.name).toBe('Locking Updated');
    }
  });

  it('update bumps version and never touches other rows', () => {
    const sheet = new FakeSheet('Items', [[...columns]]);
    const table = new Table<TestItem>(sheet, columns, testCodec, 'item');
    const now = new Date('2026-09-28T12:00:00Z');

    const item1 = table.insert({ name: 'Item 1', category: 'Cat 1' }, 'admin1', now);
    const item2 = table.insert({ name: 'Item 2', category: 'Cat 2' }, 'admin1', now);

    const updated1 = table.update(item1.id, 1, { name: 'Item 1 Modified' }, 'admin2', now);
    expect(updated1.version).toBe(2);
    expect(updated1.name).toBe('Item 1 Modified');

    const freshItem2 = table.get(item2.id);
    expect(freshItem2?.version).toBe(1);
    expect(freshItem2?.name).toBe('Item 2');
  });

  it('deactivate keeps the row and sets active=false; all() hides it; all({includeInactive:true}) shows it', () => {
    const sheet = new FakeSheet('Items', [[...columns]]);
    const table = new Table<TestItem>(sheet, columns, testCodec, 'item');
    const now = new Date('2026-09-28T12:00:00Z');

    const item = table.insert({ name: 'To Deactivate', category: 'Temp' }, 'admin1', now);
    const deactivated = table.deactivate(item.id, 1, 'admin1', now);

    expect(deactivated.active).toBe(false);
    expect(table.all()).toHaveLength(0);
    expect(table.all({ includeInactive: true })).toHaveLength(1);
    expect(table.get(item.id)?.active).toBe(false);
  });

  it('plain-text columns: insert calls setPlainTextColumns for date/time/matric/phone columns', () => {
    const sheet = new FakeSheet('Items', [['id', 'version', 'updatedBy', 'updatedAt', 'active', 'date', 'contact']]);
    const mockCodec: RowCodec<any> = {
      toCells: (x) => ({ ...x, active: 'TRUE' }),
      fromCells: (c) => ({ ...c, active: true, version: 1 })
    };
    const table = new Table<any>(sheet, ['id', 'version', 'updatedBy', 'updatedAt', 'active', 'date', 'contact'], mockCodec, 'row');
    table.insert({ date: '2026-10-01', contact: '0123456789' }, 'admin', new Date());

    expect(sheet.plainTextColumns).toContain(4); // updatedAt is at col 4 (1-based)
    expect(sheet.plainTextColumns).toContain(6); // date is at col 6
    expect(sheet.plainTextColumns).toContain(7); // contact is at col 7
  });
});
