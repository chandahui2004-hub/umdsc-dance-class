import { Month, ISODate, DanceStyle, ClassSession, RowMeta } from '@umdsc/shared';
import { AppError } from '../errors';

export function weekdaysInMonth(month: Month, isoWeekday: number): ISODate[] {
  const parts = month.split('-');
  const year = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);

  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();

  const dates: ISODate[] = [];
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(Date.UTC(year, m - 1, day));
    const currentIsoWeekday = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    if (currentIsoWeekday === isoWeekday) {
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
    }
  }

  return dates;
}

export function generateMonthSessions(
  month: Month,
  style: DanceStyle
): {
  sessions: Omit<ClassSession, keyof RowMeta>[];
  extraWeekFlag: boolean;
} {
  if (style.defaultWeekday === null || style.defaultWeekday === undefined) {
    throw new AppError('VALIDATION', `Set a default weekday for ${style.name} first`);
  }

  const dates = weekdaysInMonth(month, style.defaultWeekday);
  const sessions: Omit<ClassSession, keyof RowMeta>[] = [];

  for (let i = 0; i < dates.length; i++) {
    sessions.push({
      month,
      styleId: style.id,
      seq: i + 1,
      date: dates[i],
      start: style.defaultStart || '20:00',
      end: style.defaultEnd || '22:00',
      instructorId: style.defaultInstructorId || '',
      venue: style.defaultVenue || '',
      status: 'scheduled',
      note: ''
    });
  }

  return {
    sessions,
    extraWeekFlag: dates.length > 4
  };
}
