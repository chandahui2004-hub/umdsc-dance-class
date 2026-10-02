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

function list(value: string): string[] {
  return String(value || '').split(',').map(s => s.trim()).filter(Boolean);
}

/** Reads the event's Members sheet (tab "Members") by header name. */
export function readEventMembers(ctx: Ctx, event: EventItem): Member[] {
  if (!event.membersSpreadsheetId) return [];

  const cacheKey = `evt:members:${event.id}:${event.membersSpreadsheetId}`;
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
      flags: list(get(r, 'flags'))
    });
  }

  safeCachePut(ctx.cache, cacheKey, JSON.stringify(members), 600);
  return members;
}

/** Style ids a dancer registered for in one event (empty if not in it). */
export function dancerStylesInEvent(ctx: Ctx, event: EventItem, matricKey: string): string[] {
  const member = readEventMembers(ctx, event).find(m => m.matricKey === matricKey);
  if (!member) return [];
  return Array.from(new Set([...(member.styleIds || []), ...(member.styleNames || [])]));
}
