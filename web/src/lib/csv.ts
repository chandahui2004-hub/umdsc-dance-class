export interface CsvHeader {
  key: string;
  label: string;
}

export function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCsvString(
  rows: Record<string, any>[],
  headers?: CsvHeader[]
): string {
  if (!rows || rows.length === 0) return '';

  const headerList: CsvHeader[] =
    headers && headers.length > 0
      ? headers
      : Object.keys(rows[0]).map((key) => ({ key, label: key }));

  const headerLine = headerList.map((h) => escapeCsvField(h.label)).join(',');
  const rowLines = rows.map((row) =>
    headerList.map((h) => escapeCsvField(row[h.key])).join(',')
  );

  return [headerLine, ...rowLines].join('\n');
}

export function exportToCsv(
  filename: string,
  rows: Record<string, any>[],
  headers?: CsvHeader[]
): void {
  const csvContent = generateCsvString(rows, headers);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
