import { ClassSession, ISODate } from '@umdsc/shared';
import { AppError } from '../errors';

const EVENT_TYPES = ['monthly', 'trial', 'workshop', 'other'];

/** Key used for the "unique ignoring case and spaces" rule on event names. */
export function eventNameKey(name: string): string {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function validateEventFields(
  input: { name: string; type: string; startDate: string; endDate: string; styleIds: string[] },
  existing: { id: string; nameKey: string }[],
  selfId?: string
): void {
  const trimmed = String(input.name || '').trim();
  if (!trimmed) {
    throw new AppError('VALIDATION', 'Event name is required');
  }
  const key = eventNameKey(trimmed);
  if (existing.some(e => e.nameKey === key && e.id !== selfId)) {
    throw new AppError('VALIDATION', `An event called "${trimmed}" already exists.`);
  }
  if (!EVENT_TYPES.includes(input.type)) {
    throw new AppError('VALIDATION', 'Event type must be monthly, trial, workshop or other');
  }
  if (!input.startDate || !input.endDate || input.endDate < input.startDate) {
    throw new AppError('VALIDATION', 'End date must be on or after the start date');
  }
  if (!Array.isArray(input.styleIds) || input.styleIds.length === 0) {
    throw new AppError('VALIDATION', 'Choose at least one dance style');
  }
}

export function classesOutsideRange(sessions: ClassSession[], startDate: ISODate, endDate: ISODate): ClassSession[] {
  return sessions.filter(s => s.active && (s.date < startDate || s.date > endDate));
}

/** djb2 hash of a sheet row, used to notice a changed last form response cheaply. */
export function hashRow(values: string[]): string {
  const text = values.join('\u001f');
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

export function todayKL(now: Date): ISODate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(now);
}
