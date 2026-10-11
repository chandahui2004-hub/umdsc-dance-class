import { Ctx } from '../ports';

/** Cache key of an event style's attendance version; attendance.get answers notModified while it is unchanged. */
export const attendanceVersionKey = (eventId: string, styleId: string) => `attv:${eventId}:${styleId}`;

/** Any change to what attendance.get shows (ticks, classes, members) must bump this, or open pages keep the old grid. */
export function bumpAttendanceVersion(ctx: Ctx, eventId: string, styleId: string): number {
  const next = Number(ctx.cache.get(attendanceVersionKey(eventId, styleId)) || 1) + 1;
  ctx.cache.put(attendanceVersionKey(eventId, styleId), String(next), 86400 * 30);
  return next;
}
