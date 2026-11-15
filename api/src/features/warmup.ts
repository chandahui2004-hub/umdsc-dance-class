import { Ctx } from '../ports';
import { AppError } from '../errors';
import { withScriptLock } from '../db/lock';
import { readEventMembers } from './eventMembers';
import { getDancerChunk } from './bootstrap';
import { importEventMembers, checkSourceState, AUTO_SYNC_SECONDS } from './eventImport';
import { syncFormStatusIfDue } from './formGating';
import { pastRetention } from './events';
import { todayKL } from '../logic/events';
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
  let dataVersion = Number(ctx.props.get('DATA_VERSION') || 1);
  const events = ctx.db.events.find(e => e.active && e.status !== 'archived');
  const result: WarmResult = { events: events.length, chunks: 0, backfilled: 0, errors: 0 };
  const today = todayKL(ctx.now());

  for (const event of events) {
    try {
      if (event.status === 'active' && !pastRetention(event, today)) {
        if (syncFormStatusIfDue(ctx, event)) {
          dataVersion = Number(ctx.props.get('DATA_VERSION') || 1) + 1;
          ctx.props.set('DATA_VERSION', String(dataVersion));
        }

        if (event.sourceSheetId) {
          const checkKey = `sync:check:${event.id}`;
          if (ctx.cache.get(checkKey) === null) {
            ctx.cache.put(checkKey, '1', AUTO_SYNC_SECONDS);
            const { unchanged } = checkSourceState(ctx, event);
            if (!unchanged) {
              try {
                withScriptLock(ctx.lock, () => {
                  ctx.db.reload();
                  const fresh = ctx.db.events.get(event.id);
                  if (fresh && fresh.active && fresh.status === 'active') {
                    const res = importEventMembers(ctx, fresh, { full: false, purgeRemoved: true });
                    if (res.changed || fresh.memberCount !== res.memberCount) {
                      dataVersion = Number(ctx.props.get('DATA_VERSION') || 1) + 1;
                      ctx.props.set('DATA_VERSION', String(dataVersion));
                    }
                  }
                }, 10000);
              } catch {
                // If lock is held, next warm round picks it up
              }
            }
          }
        }
      }

      const freshEvent = ctx.db.events.get(event.id) || event;
      const members = readEventMembers(ctx, freshEvent);
      try {
        result.backfilled += withScriptLock(ctx.lock, () => backfillEventStyles(ctx, freshEvent, members), 5000);
      } catch (err) {
        // Another request holds the lock: skip the backfill this round, the next run retries.
        if (!(err instanceof AppError && err.code === 'BUSY')) throw err;
      }
      for (const styleId of freshEvent.styleIds) {
        getDancerChunk(ctx, event.id, styleId, dataVersion);
        result.chunks++;
      }
    } catch {
      result.errors++;
    }
  }
  return result;
}
