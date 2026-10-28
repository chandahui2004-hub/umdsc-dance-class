import { EventItem, Member } from '@umdsc/shared';
import { Ctx } from '../ports';
import { AppError } from '../errors';
import { safeCachePut } from '../logic/cache';

export function getEvent(ctx: Ctx, eventId: string): EventItem {
  const event = eventId ? ctx.db.events.find(e => e.id === eventId && e.active)[0] : undefined;
  if (!event) {
    throw new AppError('NOT_FOUND', `Event not found: ${eventId}`);
  }
  return event;
}

/**
 * Marks a Members row whose name an admin corrected: syncs keep that name instead of the form's.
 * Bookkeeping only, so it is not listed among the member's flags (the dancer list shows those as FLAGGED).
 */
export const NAME_EDITED_FLAG = 'name-edited';

const membersVersionKey = (eventId: string) => 'MEMBERS_V_' + eventId;

/**
 * The Members sheet cache key of an event. It carries a version that every write to that sheet moves
 * on (membersChanged), so a list read that started before a write can only cache its old copy under
 * a key nobody reads any more; removing the key instead let such a late read put old dancers back.
 */
export const membersCacheKey = (ctx: Ctx, event: EventItem) =>
  `evt:members:${event.id}:${event.membersSpreadsheetId}:${ctx.props.get(membersVersionKey(event.id)) || '0'}`;

/** Call after writing an event's Members sheet. */
export function membersChanged(ctx: Ctx, event: EventItem): void {
  const key = membersVersionKey(event.id);
  ctx.props.set(key, String(Number(ctx.props.get(key) || 0) + 1));
}

function list(value: string): string[] {
  return String(value || '').split(',').map(s => s.trim()).filter(Boolean);
}

/** Reads the event's Members sheet (tab "Members") by header name. */
export function readEventMembers(ctx: Ctx, event: EventItem): Member[] {
  if (!event.membersSpreadsheetId) return [];

  const cacheKey = membersCacheKey(ctx, event);
  const cached = ctx.cache.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // ignore
    }
  }

  const sheet = ctx.drive.openSpreadsheet(event.membersSpreadsheetId).sheet('Members');
  if (!sheet) return [];

  const rows = sheet.getDisplayValues();
  const headers = rows[0] || [];
  const col = (name: string) => headers.indexOf(name);
  const get = (r: string[], name: string) => (col(name) >= 0 ? r[col(name)] || '' : '');

  const members: Member[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!get(r, 'memberId')) continue;
    members.push({
      memberId: get(r, 'memberId'),
      fullName: get(r, 'fullName'),
      matricRaw: get(r, 'matricRaw'),
      matricKey: get(r, 'matricKey'),
      nameKey: get(r, 'nameKey'),
      contact: get(r, 'contact'),
      email: get(r, 'email'),
      gender: get(r, 'gender'),
      nationality: get(r, 'nationality'),
      styleIds: list(get(r, 'styleIds')),
      styleNames: list(get(r, 'styleNames')),
      sourceTimestamp: get(r, 'sourceTimestamp'),
      flags: list(get(r, 'flags')).filter(f => f !== NAME_EDITED_FLAG)
    });
  }

  safeCachePut(ctx.cache, cacheKey, JSON.stringify(members), 60);
  return members;
}

/** Style ids a dancer registered for in one event (empty if not in it). */
export function dancerStylesInEvent(ctx: Ctx, event: EventItem, matricKey: string): string[] {
  const member = readEventMembers(ctx, event).find(m => m.matricKey === matricKey);
  if (!member) return [];
  return Array.from(new Set([...(member.styleIds || []), ...(member.styleNames || [])]));
}
