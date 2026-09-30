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
