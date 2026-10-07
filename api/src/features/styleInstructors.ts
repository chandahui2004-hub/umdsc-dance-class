import { EventItem } from '@umdsc/shared';
import { Ctx } from '../ports';
import { withScriptLock } from '../db/lock';
import { AppError } from '../errors';

const PROP_KEY = 'STYLE_INSTRUCTORS_V1';
const CACHE_KEY = 'mig:si1';
const CACHE_TTL_SEC = 6 * 3600;
const ACTOR = 'system';

/**
 * One-time, write-only fill-in for "one style, many instructors": gives classes without an
 * instructor their style's default, records which styles each instructor teaches, and builds
 * each event's per-style instructor list. Existing values are never overwritten.
 * Returns true when it wrote anything.
 */
export function ensureStyleInstructors(ctx: Ctx): boolean {
  if (ctx.cache.get(CACHE_KEY)) return false;
  if (ctx.props.get(PROP_KEY) === 'done') {
    ctx.cache.put(CACHE_KEY, '1', CACHE_TTL_SEC);
    return false;
  }

  return withScriptLock(ctx.lock, () => {
    // Another request may have finished while this one waited for the lock.
    if (ctx.props.get(PROP_KEY) === 'done') {
      ctx.cache.put(CACHE_KEY, '1', CACHE_TTL_SEC);
      return false;
    }

    const now = ctx.now();
    let wrote = false;

    // Only active styles and active (not deleted) instructors take part.
    const styles = ctx.db.styles.find(s => s.active);
    const activeInstructors = ctx.db.instructors.find(i => i.active);
    const isActiveInstructor = new Set(activeInstructors.map(i => i.id));
    const defaultOf = new Map(
      styles.map(s => [s.id, isActiveInstructor.has(s.defaultInstructorId) ? s.defaultInstructorId : ''])
    );

    // 1. Classes without an instructor take the style default (before the lists below read them).
    const classes = ctx.db.sessions.find(s => s.active);
    for (const cls of classes) {
      const def = defaultOf.get(cls.styleId);
      if (!cls.instructorId && def) {
        ctx.db.sessions.update(cls.id, cls.version, { instructorId: def }, ACTOR, now);
        cls.instructorId = def;
        wrote = true;
      }
    }

    // 2. Instructors with no styles yet: the styles whose default they are, plus styles of their classes.
    const stylesByInstructor = new Map<string, string[]>();
    const addStyle = (instructorId: string, styleId: string) => {
      if (!instructorId || !styleId || !defaultOf.has(styleId)) return; // defaultOf holds the active styles
      const list = stylesByInstructor.get(instructorId) || [];
      if (!list.includes(styleId)) list.push(styleId);
      stylesByInstructor.set(instructorId, list);
    };
    for (const s of styles) addStyle(defaultOf.get(s.id) || '', s.id);
    for (const cls of classes) addStyle(cls.instructorId, cls.styleId);
    for (const ins of activeInstructors.filter(i => (i.styleIds || []).length === 0)) {
      const found = stylesByInstructor.get(ins.id);
      if (found?.length) {
        ctx.db.instructors.update(ins.id, ins.version, { styleIds: found }, ACTOR, now);
        wrote = true;
      }
    }

    // 3. Events with no lists yet: per style, the distinct instructors of its classes in date, seq order, else the style default.
    for (const ev of ctx.db.events.find(e => e.active && Object.keys(e.styleInstructors || {}).length === 0)) {
      const lists: Record<string, string[]> = {};
      for (const styleId of ev.styleIds) {
        const ids: string[] = [];
        classes
          .filter(c => c.eventId === ev.id && c.styleId === styleId)
          .sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq)
          .forEach(c => {
            if (isActiveInstructor.has(c.instructorId) && !ids.includes(c.instructorId)) ids.push(c.instructorId);
          });
        if (ids.length === 0 && defaultOf.get(styleId)) ids.push(defaultOf.get(styleId)!);
        if (ids.length) lists[styleId] = ids;
      }
      if (Object.keys(lists).length) {
        ctx.db.events.update(ev.id, ev.version, { styleInstructors: lists }, ACTOR, now);
        wrote = true;
      }
    }

    ctx.props.set(PROP_KEY, 'done');
    ctx.cache.put(CACHE_KEY, '1', CACHE_TTL_SEC);
    if (wrote) {
      ctx.props.set('DATA_VERSION', String(Number(ctx.props.get('DATA_VERSION') || 1) + 1));
    }
    return wrote;
  });
}

/** Comparison key for style names and aliases: trimmed, lower-case, runs of whitespace collapsed. */
export function styleKey(s: string): string {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Refuses a style whose name matches another active style's name or alias, or whose alias
 * matches another active style's name or alias. selfId excludes the style being edited.
 */
export function assertUniqueStyle(ctx: Ctx, name: string, aliases: string[], selfId?: string): void {
  const others = ctx.db.styles.find(s => s.active && s.id !== selfId);
  const takenAny = new Set<string>();
  for (const o of others) {
    takenAny.add(styleKey(o.name));
    for (const a of o.aliases || []) takenAny.add(styleKey(a));
  }
  const shown = String(name ?? '').trim();
  if (takenAny.has(styleKey(shown))) {
    throw new AppError('VALIDATION', `A style named "${shown}" already exists.`);
  }
  for (const alias of aliases) {
    if (takenAny.has(styleKey(alias))) {
      throw new AppError('VALIDATION', `A style named "${String(alias).trim()}" already exists.`);
    }
  }
}

/**
 * Validates the styles an instructor teaches: at least one active style. Inactive or unknown ids the
 * instructor already had (previous) are dropped silently; newly sent ones are refused. Returns the cleaned ids.
 */
export function assertInstructorStyles(ctx: Ctx, styleIds: unknown, previous: string[] = []): string[] {
  const ids: string[] = [];
  if (Array.isArray(styleIds)) {
    for (const raw of styleIds) {
      const id = typeof raw === 'string' ? raw.trim() : '';
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  const active = new Set(ctx.db.styles.find(s => s.active).map(s => s.id));
  const bad = ids.filter(id => !active.has(id) && !previous.includes(id));
  if (bad.length) {
    throw new AppError('VALIDATION', `Unknown or inactive dance style: ${bad.join(', ')}`);
  }
  const kept = ids.filter(id => active.has(id));
  if (kept.length === 0) {
    throw new AppError('VALIDATION', 'Choose at least one dance style this instructor teaches.');
  }
  return kept;
}

/** Takes a deleted instructor out of every event's per-style instructor lists. Classes are left alone. */
export function removeInstructorFromEvents(ctx: Ctx, instructorId: string, actor: string): void {
  const now = ctx.now();
  for (const ev of ctx.db.events.find(e => Object.values(e.styleInstructors || {}).some(l => l.includes(instructorId)))) {
    const lists: Record<string, string[]> = {};
    for (const [styleId, ids] of Object.entries(ev.styleInstructors)) {
      lists[styleId] = ids.filter(id => id !== instructorId);
    }
    ctx.db.events.update(ev.id, ev.version, { styleInstructors: lists }, actor, now);
  }
}

const styleName = (ctx: Ctx, styleId: string): string => ctx.db.styles.find(s => s.id === styleId)[0]?.name || styleId;

/**
 * Cleans an event's per-style instructor lists. Keeps only styles in styleIds, drops duplicates
 * (order kept), and requires every ACTIVE style to have at least one instructor. Each newly added
 * instructor must be active and teach the style; one already in that style's list (previous) is
 * kept as is, even if they stopped teaching it or were deleted.
 */
export function cleanStyleInstructors(
  ctx: Ctx,
  styleIds: string[],
  raw: unknown,
  previous: Record<string, string[]> = {}
): Record<string, string[]> {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const instructors = new Map(ctx.db.instructors.find(i => i.active).map(i => [i.id, i]));
  const activeStyles = new Set(ctx.db.styles.find(s => s.active).map(s => s.id));
  const out: Record<string, string[]> = {};
  for (const styleId of styleIds) {
    const ids: string[] = [];
    const given = input[styleId];
    if (Array.isArray(given)) {
      for (const v of given) {
        const id = typeof v === 'string' ? v.trim() : '';
        if (id && !ids.includes(id)) ids.push(id);
      }
    }
    if (ids.length === 0 && activeStyles.has(styleId)) {
      throw new AppError('VALIDATION', `Choose at least one instructor for ${styleName(ctx, styleId)}.`);
    }
    const listed = previous[styleId] || [];
    for (const id of ids) {
      if (listed.includes(id)) continue;
      const ins = instructors.get(id);
      if (!ins || !(ins.styleIds || []).includes(styleId)) {
        const name = ins?.name || ctx.db.instructors.find(i => i.id === id)[0]?.name || id;
        throw new AppError('VALIDATION', `${name} doesn't teach ${styleName(ctx, styleId)}.`);
      }
    }
    out[styleId] = ids;
  }
  return out;
}

/** The first instructor listed for a style in an event, or '' when there is none. */
export function firstInstructor(event: EventItem, styleId: string): string {
  return (event.styleInstructors || {})[styleId]?.[0] || '';
}

/**
 * A class's instructor must be one of its event's instructors for that style. An empty id and the
 * instructor the class already has (previous) always pass.
 */
export function assertClassInstructor(ctx: Ctx, event: EventItem, styleId: string, instructorId: string, previous?: string): void {
  if (instructorId === '' || instructorId === previous) return;
  if ((event.styleInstructors || {})[styleId]?.includes(instructorId)) return;
  const name = ctx.db.instructors.find(i => i.id === instructorId)[0]?.name || instructorId;
  throw new AppError('VALIDATION', `${name} isn't an instructor for ${styleName(ctx, styleId)} in this event.`);
}
