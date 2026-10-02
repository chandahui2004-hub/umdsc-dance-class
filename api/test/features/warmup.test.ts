import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeCtx } from '../fakes/makeCtx';
import { seedEvent } from '../fixtures/events';
import { warmCaches } from '../../src/features/warmup';
import { EventItem } from '@umdsc/shared';

describe('warmCaches', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let event: EventItem;

  beforeEach(() => {
    ctx = makeCtx();
    event = seedEvent(ctx, {
      name: 'OCT MONTHLY CLASS',
      styleIds: ['st_popping', 'st_hiphop'],
      members: [
        { matricKey: '22001111', fullName: 'Popper Ali', styleIds: ['st_popping'] },
        { matricKey: '22002222', fullName: 'Both Bob', styleIds: ['st_popping', 'st_hiphop'] }
      ]
    });
    for (const [matricKey, fullName] of [['22001111', 'Popper Ali'], ['22002222', 'Both Bob']]) {
      ctx.db.memberIndex.insert(
        { matricKey, nameKey: fullName.toLowerCase(), fullName, eventIds: [event.id], lastEventEnd: '2026-10-31' },
        'system',
        ctx.now()
      );
    }
  });

  it('pre-builds the members cache and one chunk per event style at the current data version', () => {
    warmCaches(ctx);

    const dv = Number(ctx.props.get('DATA_VERSION') || 1);
    expect(ctx.cache.get(`evt:members:${event.id}:${event.membersSpreadsheetId}`)).toBeTruthy();
    expect(ctx.cache.get(`boot:chunk:${event.id}:st_popping:${dv}`)).toBeTruthy();
    expect(ctx.cache.get(`boot:chunk:${event.id}:st_hiphop:${dv}`)).toBeTruthy();
  });

  it('backfills eventStyles for dancers indexed before it existed, and drops their cached copy', () => {
    ctx.cache.put('mi:22002222', JSON.stringify({ stale: true }), 600);

    const result = warmCaches(ctx);

    const bob = ctx.db.memberIndex.find(m => m.matricKey === '22002222')[0];
    expect([...bob.eventStyles![event.id]].sort()).toEqual(['st_hiphop', 'st_popping']);
    expect(ctx.cache.get('mi:22002222')).toBeNull();
    expect(result.backfilled).toBe(2);
  });

  it('does nothing the second time (no rewrite, no version bump)', () => {
    warmCaches(ctx);
    const before = ctx.db.memberIndex.find(m => m.matricKey === '22001111')[0].version;

    const again = warmCaches(ctx);

    expect(again.backfilled).toBe(0);
    expect(ctx.db.memberIndex.find(m => m.matricKey === '22001111')[0].version).toBe(before);
  });

  it('keeps warming other events when one event cannot be read', () => {
    const broken = seedEvent(ctx, { name: 'BROKEN EVENT', styleIds: ['st_popping'] });
    const open = ctx.drive.openSpreadsheet.bind(ctx.drive);
    vi.spyOn(ctx.drive, 'openSpreadsheet').mockImplementation((id: string) => {
      if (id === broken.membersSpreadsheetId) throw new Error('No access');
      return open(id);
    });

    const result = warmCaches(ctx);

    const dv = Number(ctx.props.get('DATA_VERSION') || 1);
    expect(ctx.cache.get(`boot:chunk:${event.id}:st_popping:${dv}`)).toBeTruthy();
    expect(result.errors).toBe(1);
  });
});
