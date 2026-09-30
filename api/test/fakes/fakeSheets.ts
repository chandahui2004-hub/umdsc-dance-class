import { SheetPort, SpreadsheetPort, Cell } from '../../src/ports';

export class FakeSheet implements SheetPort {
  plainTextColumns: number[] = [];
  hiddenRows: number[] = [];
  protectedRows: number[] = [];
  writeCalls = 0;

  constructor(public name: string, public rows: Cell[][] = []) {}

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
    this.writeCalls++;
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
    this.writeCalls++;
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
  getDataRange(): Cell[][] {
    return this.getDisplayValues();
  }

  lastRowValues(): { lastRow: number; values: string[] } {
    const lastRow = this.rows.length;
    if (lastRow === 0) return { lastRow: 0, values: [] };
    return { lastRow, values: this.rows[lastRow - 1].map(c => String(c ?? '')) };
  }

  clearBody(): void {
    this.writeCalls++;
    this.rows = this.rows.slice(0, 1);
  }

  setHeaderRow(headers: string[]): void {
    this.writeCalls++;
    const width = Math.max(headers.length, this.rows[0]?.length || 0);
    const row: Cell[] = [];
    for (let i = 0; i < width; i++) row.push(headers[i] ?? '');
    if (this.rows.length === 0) this.rows.push(row);
    else this.rows[0] = row;
  }
}

export class FakeSpreadsheet implements SpreadsheetPort {
  sheetsMap = new Map<string, FakeSheet>();

  constructor(
    public id: string,
    public name: string,
    public url = `https://docs.google.com/spreadsheets/d/${id}/edit`
  ) {}

  sheet(name: string): SheetPort | null {
    return this.sheetsMap.get(name) || null;
  }

  getSheet(name: string): SheetPort | null {
    return this.sheet(name);
  }

  addSheet(name: string, headers: string[] = []): SheetPort {
    const existing = this.sheetsMap.get(name);
    if (existing) return existing;
    const newSheet = new FakeSheet(name, headers.length ? [[...headers]] : []);
    this.sheetsMap.set(name, newSheet);
    return newSheet;
  }

  setName(name: string): void {
    this.name = name;
  }

  firstSheet(): SheetPort | null {
    return this.sheetsMap.values().next().value || null;
  }

  removeSheet(name: string): void {
    this.sheetsMap.delete(name);
  }
}
