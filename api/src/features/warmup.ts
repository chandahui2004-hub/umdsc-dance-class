import { Ctx } from '../ports';
import { AppError } from '../errors';
import { withScriptLock } from '../db/lock';
import { readEventMembers } from './eventMembers';
import { getDancerChunk } from './bootstrap';
import type { EventItem, Member } from '@umdsc/shared';

export interface WarmResult {
  events: number;
  chunks: number;
  backfilled: number;
  errors: number;
}

/**
 * Stores each member's styles for this event in MemberIndex when it is not there yet, so a dancer
 * indexed before `eventStyles` existed stops needing the event's Members sheet at login.
 * Returns how many dancers were updated.
 */
function backfillEventStyles(ctx: Ctx, event: EventItem, members: Member[]): number {
  const index = new Map(ctx.db.memberIndex.find(m => m.active).map(m => [m.matricKey, m]));
  const rows = [];
  for (const member of members) {
    const row = index.get(member.matricKey);
    if (!row || row.eventStyles?.[event.id]) continue;
    rows.push({
      matricKey: row.matricKey,
      nameKey: row.nameKey,
      fullName: row.fullName,
      eventIds: row.eventIds,
      lastEventEnd: row.lastEventEnd,
      eventStyles: { ...(row.eventStyles || {}), [event.id]: [...member.styleIds] }
    });
    ctx.cache.remove('mi:' + row.matricKey);
  }
  if (rows.length > 0) {
    ctx.db.memberIndex.upsertMany('matricKey', rows, 'system', ctx.now());
  }
  return rows.length;
}

/**
 * Rebuilds the caches a dancer's first request would otherwise pay for (the event Members list and
 * each event+style chunk at the current data version). One unreadable event never stops the rest.
 */
export function warmCaches(ctx: Ctx): WarmResult {
  const dataVersion = Number(ctx.props.get('DATA_VERSION') || 1);
  const events = ctx.db.events.find(e => e.active && e.status !== 'archived');
  const result: WarmResult = { events: events.length, chunks: 0, backfilled: 0, errors: 0 };

  for (const event of events) {
    try {
      const members = readEventMembers(ctx, event);
      try {
        result.backfilled += withScriptLock(ctx.lock, () => backfillEventStyles(ctx, event, members), 5000);
      } catch (err) {
        // Another request holds the lock: skip the backfill this round, the next run retries.
        if (!(err instanceof AppError && err.code === 'BUSY')) throw err;
      }
      for (const styleId of event.styleIds) {
        getDancerChunk(ctx, event.id, styleId, dataVersion);
        result.chunks++;
      }
    } catch {
      result.errors++;
    }
  }
  return result;
}
