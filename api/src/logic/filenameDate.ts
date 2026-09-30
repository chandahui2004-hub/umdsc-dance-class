import { ISODate } from '@umdsc/shared';

const MONTH_NAMES: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12'
};

function pad(n: string | number, len = 2): string {
  return String(n).padStart(len, '0');
}

function isRealDate(date: ISODate): boolean {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Finds a date in a file or folder name that falls inside the event range.
 * Formats without a year (DD/MM, "7 Oct") try the range's start year, then its end year.
 */
export function parseDateFromName(
  name: string,
  range: { startDate: ISODate; endDate: ISODate }
): ISODate | null {
  const inRange = (date: ISODate) => isRealDate(date) && date >= range.startDate && date <= range.endDate;
  const years = Array.from(new Set([range.startDate.slice(0, 4), range.endDate.slice(0, 4)]));
  const withYear = (m: string, d: string): ISODate | null => {
    for (const y of years) {
      const date = `${y}-${m}-${d}`;
      if (inRange(date)) return date;
    }
    return null;
  };

  // 1. YYYY-MM-DD
  const m1 = name.match(/\b(20\d{2})[-_/.](0[1-9]|1[0-2])[-_/.](0[1-9]|[12]\d|3[01])\b/);
  if (m1) {
    const date = `${m1[1]}-${m1[2]}-${m1[3]}`;
    if (inRange(date)) return date;
  }

  // 2. DD-MM-YYYY
  const m2 = name.match(/\b(0[1-9]|[12]\d|3[01])[-_/.](0[1-9]|1[0-2])[-_/.](20\d{2})\b/);
  if (m2) {
    const date = `${m2[3]}-${m2[2]}-${m2[1]}`;
    if (inRange(date)) return date;
  }

  // 3. YYYYMMDD_HHMMSS or YYYYMMDD
  const m3 = name.match(/\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:_\d+)?\b/);
  if (m3) {
    const date = `${m3[1]}-${m3[2]}-${m3[3]}`;
    if (inRange(date)) return date;
  }

  // 4. Day MonthName (e.g. "7 Oct", "07 October", "7th October")
  const m4a = name.match(/\b(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\s+([a-zA-Z]{3,9})\b/i);
  if (m4a) {
    const m = MONTH_NAMES[m4a[2].toLowerCase().slice(0, 3)];
    const found = m ? withYear(m, pad(m4a[1])) : null;
    if (found) return found;
  }

  // 4b. MonthName Day (e.g. "Oct 7", "October 7th")
  const m4b = name.match(/\b([a-zA-Z]{3,9})\s+(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\b/i);
  if (m4b) {
    const m = MONTH_NAMES[m4b[1].toLowerCase().slice(0, 3)];
    const found = m ? withYear(m, pad(m4b[2])) : null;
    if (found) return found;
  }

  // 5. D/M or DD/MM (e.g. "7/10", "07/10", "7-10")
  const m5 = name.match(/(?:^|[^\d])(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])(?:[^\d]|$)/);
  if (m5) {
    const found = withYear(pad(m5[2]), pad(m5[1]));
    if (found) return found;
  }

  return null;
}
