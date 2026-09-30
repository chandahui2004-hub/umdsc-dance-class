import type { ClassSession, EventItem, EventType, ISODate, SourcePreview } from '@umdsc/shared';

export interface ScheduledClass {
  seq: number;
  date: ISODate;
  start: string;
  end: string;
  venue?: string;
}

/** Everything the event wizard collects before it creates or updates an event. */
export interface EventDraft {
  sheetUrl: string;
  preview: SourcePreview | null;
  columnMap: Record<string, number | null>;
  classIndex: number;
  name: string;
  type: EventType;
  startDate: ISODate;
  endDate: ISODate;
  styleIds: string[];
  schedule: Record<string, ScheduledClass[]>;
}

export function emptyDraft(today: ISODate): EventDraft {
  return {
    sheetUrl: '',
    preview: null,
    columnMap: {},
    classIndex: -1,
    name: '',
    type: 'monthly',
    startDate: today,
    endDate: today,
    styleIds: [],
    schedule: {}
  };
}

export function draftFromEvent(e: EventItem, sessions: ClassSession[]): EventDraft {
  let columnMap: Record<string, number | null> = {};
  try {
    columnMap = JSON.parse(e.columnMapJson || '{}');
  } catch {
    columnMap = {};
  }

  const schedule: Record<string, ScheduledClass[]> = {};
  for (const s of [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq)) {
    (schedule[s.styleId] ||= []).push({ seq: s.seq, date: s.date, start: s.start, end: s.end, venue: s.venue });
  }

  return {
    sheetUrl: `https://docs.google.com/spreadsheets/d/${e.sourceSheetId}/edit`,
    preview: null,
    columnMap,
    classIndex: e.classIndex,
    name: e.name,
    type: e.type,
    startDate: e.startDate,
    endDate: e.endDate,
    styleIds: [...e.styleIds],
    schedule
  };
}

/** Drops classes outside the range or for unticked styles, and renumbers each style's classes by date. */
export function pruneSchedule(d: EventDraft): EventDraft {
  const schedule: Record<string, ScheduledClass[]> = {};
  for (const styleId of d.styleIds) {
    schedule[styleId] = (d.schedule[styleId] || [])
      .filter(c => c.date >= d.startDate && c.date <= d.endDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((c, i) => ({ ...c, seq: i + 1 }));
  }
  return { ...d, schedule };
}

function nameKey(name: string): string {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Same "unique ignoring case and spaces" rule the server applies. */
export function localNameClash(name: string, events: Pick<EventItem, 'id' | 'name'>[], selfId?: string): boolean {
  const key = nameKey(name);
  return Boolean(key) && events.some(e => e.id !== selfId && nameKey(e.name) === key);
}
