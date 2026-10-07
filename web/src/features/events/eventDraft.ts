import type { ClassSession, EventItem, EventType, Instructor, ISODate, SourcePreview } from '@umdsc/shared';

export interface ScheduledClass {
  /** Set for classes that already exist (edit mode). */
  id?: string;
  seq: number;
  date: ISODate;
  start: string;
  end: string;
  venue?: string;
  status?: ClassSession['status'];
  instructorId?: string;
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
  /** Instructors chosen per style; each class then picks one of its style's list. */
  styleInstructors: Record<string, string[]>;
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
    styleInstructors: {},
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
    (schedule[s.styleId] ||= []).push({
      id: s.id,
      seq: s.seq,
      date: s.date,
      start: s.start,
      end: s.end,
      venue: s.venue,
      status: s.status,
      instructorId: s.instructorId
    });
  }

  // A style the event has no instructor list for falls back to whoever its classes already use.
  const styleInstructors: Record<string, string[]> = {};
  for (const styleId of e.styleIds) {
    const saved = e.styleInstructors?.[styleId] ?? [];
    styleInstructors[styleId] = saved.length
      ? [...saved]
      : [...new Set((schedule[styleId] || []).map(c => c.instructorId).filter((id): id is string => Boolean(id)))];
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
    styleInstructors,
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
  const styleInstructors: Record<string, string[]> = {};
  for (const styleId of d.styleIds) {
    if (styleId in d.styleInstructors) styleInstructors[styleId] = d.styleInstructors[styleId];
  }
  return { ...d, schedule, styleInstructors };
}

/** Active instructors who teach the style, by name. */
export function instructorsForStyle(instructors: Instructor[], styleId: string): Instructor[] {
  return instructors
    .filter(i => i.active && (i.styleIds || []).includes(styleId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The instructor a class is saved with: its own, else the first one listed for its style. */
export function effectiveInstructorId(c: { instructorId?: string }, listed: string[]): string {
  return c.instructorId || listed[0] || '';
}

/** Sets a style's instructors; classes whose instructor was removed move to the first remaining one. */
export function setStyleInstructors(d: EventDraft, styleId: string, ids: string[]): EventDraft {
  const fallback = ids[0] ?? '';
  const classes = (d.schedule[styleId] || []).map(c =>
    c.instructorId && !ids.includes(c.instructorId) ? { ...c, instructorId: fallback } : c
  );
  return {
    ...d,
    styleInstructors: { ...d.styleInstructors, [styleId]: ids },
    schedule: { ...d.schedule, [styleId]: classes }
  };
}

/**
 * The first ticked ACTIVE style that still has no instructor. A ticked style that has since been
 * deactivated (not in activeStyleIds) needs none, so it never blocks the wizard.
 */
export function missingInstructorStyle(d: EventDraft, activeStyleIds: readonly string[]): string | null {
  return (
    d.styleIds.find(styleId => activeStyleIds.includes(styleId) && !(d.styleInstructors[styleId]?.length)) ?? null
  );
}

/** Classes to send to the server, one list across all styles. */
export function flattenSchedule(d: EventDraft): (ScheduledClass & { styleId: string })[] {
  return d.styleIds.flatMap(styleId => (d.schedule[styleId] || []).map(c => ({ ...c, styleId })));
}

function nameKey(name: string): string {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Same "unique ignoring case and spaces" rule the server applies. */
export function localNameClash(name: string, events: Pick<EventItem, 'id' | 'name'>[], selfId?: string): boolean {
  const key = nameKey(name);
  return Boolean(key) && events.some(e => e.id !== selfId && nameKey(e.name) === key);
}
