import { describe, it, expect } from 'vitest';
import { FakeDrive } from './fakeDrive';
import { FakeSheet } from './fakeSheets';

describe('fake ports', () => {
  it('lastRowValues returns the last row and clearBody keeps only the header', () => {
    const sheet = new FakeSheet('S', [['h1', 'h2'], ['a', 'b'], ['c', 'd']]);
    expect(sheet.lastRowValues()).toEqual({ lastRow: 3, values: ['c', 'd'] });
    sheet.clearBody();
    expect(sheet.getDisplayValues()).toEqual([['h1', 'h2']]);
    expect(new FakeSheet('E', []).lastRowValues()).toEqual({ lastRow: 0, values: [] });
  });

  it('setHeaderRow replaces row 1 and blanks extra header cells', () => {
    const sheet = new FakeSheet('S', [['w', 'x', 'y', 'z'], ['1', '2', '3', '4']]);
    sheet.setHeaderRow(['a', 'b']);
    expect(sheet.getDisplayValues()[0]).toEqual(['a', 'b', '', '']);
  });

  it('removeSheet removes the tab', () => {
    const drive = new FakeDrive();
    const ss = drive.createSpreadsheet('Book', 'root');
    ss.addSheet('Old', ['a']);
    ss.removeSheet('Old');
    expect(ss.sheet('Old')).toBeNull();
    ss.removeSheet('Missing');
  });

  it('renameFolder changes the folder name', () => {
    const drive = new FakeDrive();
    const id = drive.createFolder('root', 'OLD NAME');
    drive.renameFolder(id, 'NEW NAME');
    expect(drive.nameOf(id)).toBe('NEW NAME');
  });

  it('copySpreadsheet copies all tabs into the target folder', () => {
    const drive = new FakeDrive();
    const ss = drive.createSpreadsheet('Book', 'root');
    ss.addSheet('Tab', ['h']).appendRows([['v']]);
    const folder = drive.createFolder('root', 'Backups');

    const copyId = drive.copySpreadsheet(ss.id, 'Book backup', folder);

    expect(copyId).not.toBe(ss.id);
    expect(drive.parentOf(copyId)).toBe(folder);
    expect(drive.nameOf(copyId)).toBe('Book backup');
    expect(drive.openSpreadsheet(copyId).sheet('Tab')!.getDisplayValues()).toEqual([['h'], ['v']]);
  });
});
