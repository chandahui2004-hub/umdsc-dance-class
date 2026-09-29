import { describe, it, expect, vi } from 'vitest';
import { exportToCsv, generateCsvString } from './csv';

describe('CSV export', () => {
  it('generates proper CSV string escaping commas and quotes', () => {
    const data = [
      { name: 'Alice, Tan', matric: '17201234', styles: 'Hip Hop, Popping' },
      { name: 'Bob "The Dancer"', matric: '17205678', styles: 'Latin' }
    ];

    const headers = [
      { key: 'name', label: 'Full Name' },
      { key: 'matric', label: 'Matric No' },
      { key: 'styles', label: 'Styles' }
    ];

    const csv = generateCsvString(data, headers);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('Full Name,Matric No,Styles');
    expect(lines[1]).toBe('"Alice, Tan",17201234,"Hip Hop, Popping"');
    expect(lines[2]).toBe('"Bob ""The Dancer""",17205678,Latin');
  });

  it('triggers browser download with blob and anchor click', () => {
    const clickMock = vi.fn();
    const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/mock-blob');
    const revokeObjectURLMock = vi.fn();

    vi.stubGlobal('URL', {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock
    });

    const appendChildMock = vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any);
    const removeChildMock = vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any);

    vi.spyOn(document, 'createElement').mockReturnValue({
      set href(_val: string) {},
      set download(_val: string) {},
      click: clickMock
    } as any);

    exportToCsv('dancers.csv', [{ name: 'Sarah', matric: '12345' }]);

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(clickMock).toHaveBeenCalledTimes(1);

    appendChildMock.mockRestore();
    removeChildMock.mockRestore();
  });
});
