import { Month, ISODate } from '@umdsc/shared';

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

export function parseDateFromName(name: string, month: Month): ISODate | null {
  const [targetYear, targetMonth] = month.split('-');
  if (!targetYear || !targetMonth) return null;

  // 1. YYYY-MM-DD
  const m1 = name.match(/\b(20\d{2})[-_/.](0[1-9]|1[0-2])[-_/.](0[1-9]|[12]\d|3[01])\b/);
  if (m1) {
    const y = m1[1];
    const m = m1[2];
    const d = m1[3];
    if (y === targetYear && m === targetMonth) {
      return `${y}-${m}-${d}`;
    }
  }

  // 2. DD-MM-YYYY
  const m2 = name.match(/\b(0[1-9]|[12]\d|3[01])[-_/.](0[1-9]|1[0-2])[-_/.](20\d{2})\b/);
  if (m2) {
    const d = m2[1];
    const m = m2[2];
    const y = m2[3];
    if (y === targetYear && m === targetMonth) {
      return `${y}-${m}-${d}`;
    }
  }

  // 3. YYYYMMDD_HHMMSS or YYYYMMDD
  const m3 = name.match(/\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:_\d+)?\b/);
  if (m3) {
    const y = m3[1];
    const m = m3[2];
    const d = m3[3];
    if (y === targetYear && m === targetMonth) {
      return `${y}-${m}-${d}`;
    }
  }

  // 4. Day MonthName (e.g. "7 Oct", "07 October", "7th October")
  const m4a = name.match(/\b(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\s+([a-zA-Z]{3,9})\b/i);
  if (m4a) {
    const d = pad(m4a[1]);
    const mon = m4a[2].toLowerCase().slice(0, 3);
    const m = MONTH_NAMES[mon];
    if (m && m === targetMonth) {
      return `${targetYear}-${m}-${d}`;
    }
  }

  // 4b. MonthName Day (e.g. "Oct 7", "October 7th")
  const m4b = name.match(/\b([a-zA-Z]{3,9})\s+(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\b/i);
  if (m4b) {
    const mon = m4b[1].toLowerCase().slice(0, 3);
    const d = pad(m4b[2]);
    const m = MONTH_NAMES[mon];
    if (m && m === targetMonth) {
      return `${targetYear}-${m}-${d}`;
    }
  }

  // 5. D/M or DD/MM (e.g. "7/10", "07/10", "7-10")
  const m5 = name.match(/(?:^|[^\d])(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])(?:[^\d]|$)/);
  if (m5) {
    const d = pad(m5[1]);
    const m = pad(m5[2]);
    if (m === targetMonth) {
      return `${targetYear}-${m}-${d}`;
    }
  }

  return null;
}
