import { ISODate } from '@umdsc/shared';
import { newId } from '../db/ids';

export const RETENTION_YEARS = 3;

/** Adds whole years to a YYYY-MM-DD date; 29 Feb becomes 28 Feb in non-leap years. */
export function addYearsClamped(date: ISODate, years: number): ISODate {
  const [y, m, d] = date.split('-').map(Number);
  const year = y + years;
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** A dancer is due for removal once today is past lastEventEnd + RETENTION_YEARS. */
export function isDue(lastEventEnd: ISODate, today: ISODate): boolean {
  if (!lastEventEnd) return false;
  return today > addYearsClamped(lastEventEnd, RETENTION_YEARS);
}

export function anonymizedMemberId(): string {
  return 'X-' + newId('');
}
