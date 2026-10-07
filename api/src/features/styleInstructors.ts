import { Ctx } from '../ports';
import { withScriptLock } from '../db/lock';

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

    const styles = ctx.db.styles.find(() => true);
    const defaultOf = new Map(styles.map(s => [s.id, s.defaultInstructorId]));

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
      if (!instructorId || !styleId) return;
      const list = stylesByInstructor.get(instructorId) || [];
      if (!list.includes(styleId)) list.push(styleId);
      stylesByInstructor.set(instructorId, list);
    };
    for (const s of styles) addStyle(s.defaultInstructorId, s.id);
    for (const cls of classes) addStyle(cls.instructorId, cls.styleId);
    for (const ins of ctx.db.instructors.find(i => (i.styleIds || []).length === 0)) {
      const found = stylesByInstructor.get(ins.id);
      if (found?.length) {
        ctx.db.instructors.update(ins.id, ins.version, { styleIds: found }, ACTOR, now);
        wrote = true;
      }
    }

    // 3. Events with no lists yet: per style, the distinct instructors of its classes in date, seq order, else the style default.
    for (const ev of ctx.db.events.find(e => Object.keys(e.styleInstructors || {}).length === 0)) {
      const lists: Record<string, string[]> = {};
      for (const styleId of ev.styleIds) {
        const ids: string[] = [];
        classes
          .filter(c => c.eventId === ev.id && c.styleId === styleId)
          .sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq)
          .forEach(c => { if (c.instructorId && !ids.includes(c.instructorId)) ids.push(c.instructorId); });
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
