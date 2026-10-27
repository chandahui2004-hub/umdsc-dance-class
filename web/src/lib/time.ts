import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays
} from 'date-fns';
import { toZonedTime, format as formatTz } from 'date-fns-tz';
import type { Month, ISODate } from '@umdsc/shared';

const TIMEZONE = 'Asia/Kuala_Lumpur';

export function todayKL(): ISODate {
  const now = new Date();
  const zoned = toZonedTime(now, TIMEZONE);
  return formatTz(zoned, 'yyyy-MM-dd', { timeZone: TIMEZONE });
}

export function addMonths(month: Month, n: number): Month {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  const year = d.getUTCFullYear();
  const monthNum = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${monthNum}`;
}

export function getMonthsRange(startMonth: Month, endMonth: Month): Month[] {
  if (startMonth > endMonth) {
    return [startMonth];
  }
  const result: Month[] = [];
  let curr = startMonth;
  while (curr <= endMonth) {
    result.push(curr);
    curr = addMonths(curr, 1);
  }
  return result;
}

export function formatDayLabel(d: ISODate): string {
  const date = parseISO(d);
  return format(date, 'EEE dd MMM');
}

export function monthGrid(month: Month): ISODate[][] {
  const [y, m] = month.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1);
  const monthStart = startOfMonth(firstDay);
  const monthEnd = endOfMonth(firstDay);

  // Weeks start Monday: weekStartsOn: 1
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const grid: ISODate[][] = [];
  let current = startDate;

  while (current <= endDate) {
    const week: ISODate[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(format(current, 'yyyy-MM-dd'));
      current = addDays(current, 1);
    }
    grid.push(week);
  }

  return grid;
}

export function getDatesBetween(start: ISODate, end: ISODate): ISODate[] {
  const s = start <= end ? start : end;
  const e = start <= end ? end : start;
  const list: ISODate[] = [];
  let curr = parseISO(s);
  const stop = parseISO(e);
  while (curr <= stop) {
    list.push(format(curr, 'yyyy-MM-dd') as ISODate);
    curr = addDays(curr, 1);
  }
  return list;
}

/**
 * Parses timestamps in various formats including:
 * - Malaysian Google Form format: DD/MM/YYYY HH:mm:ss or D/M/YYYY H:mm:ss
 * - ISO string: 2026-10-26T21:04:12Z or 2026-10-26 21:04:12
 * - Standard date string: YYYY-MM-DD
 * Returns timestamp in milliseconds, or null if invalid.
 */
export function parseFlexibleTimestamp(raw?: string | null): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const str = raw.trim();
  if (!str) return null;

  // Check DD/MM/YYYY or D/M/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmyMatch) {
    let day = parseInt(dmyMatch[1], 10);
    let month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    if (month > 12 && day <= 12) {
      const tmp = day;
      day = month;
      month = tmp;
    }
    const h = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const m = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const s = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    const d = new Date(year, month - 1, day, h, m, s);
    if (!isNaN(d.getTime())) return d.getTime();
  }

  // Standard ISO / Date.parse fallback
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) return parsed;

  return null;
}

/**
 * Formats a registration timestamp into a user-friendly string:
 * - If time is present: "DD/MM/YYYY, HH:mm"
 * - If only date: "DD/MM/YYYY"
 * Returns empty string if invalid or empty.
 */
export function formatRegistrationDate(raw?: string | null): string {
  const ts = parseFlexibleTimestamp(raw);
  if (!ts) return '';
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  const hasTime = Boolean(raw && (raw.includes(':') || raw.includes('T')));
  if (hasTime) {
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year}, ${hours}:${mins}`;
  }

  return `${day}/${month}/${year}`;
}

