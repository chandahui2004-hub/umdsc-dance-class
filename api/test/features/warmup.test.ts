import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeCtx } from '../fakes/makeCtx';
import { seedEvent } from '../fixtures/events';
import { membersCacheKey } from '../../src/features/eventMembers';
import { warmCaches } from '../../src/features/warmup';
import { FULL_HOUSE_CLOSED_MESSAGE } from '../../src/features/formGating';
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
    expect(ctx.cache.get(membersCacheKey(ctx, event))).toBeTruthy();
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

  it('warmCaches checks Google Form status every 10 min and bumps DATA_VERSION and warms chunks at bumped version', () => {
    const formId = 'warmup_form_test';
    const form = ctx.form.createForm(formId);

    ctx.db.events.update(event.id, event.version, {
      formId,
      formClosed: false,
      formClosedReason: 'none'
    }, 'test', ctx.now());

    ctx.props.set('DATA_VERSION', '1');

    // Admin closes form directly in Google Forms
    form.setAcceptingResponses(false);
    form.setCustomClosedFormMessage(FULL_HOUSE_CLOSED_MESSAGE);

    const result = warmCaches(ctx);

    expect(ctx.cache.get(`sync:formCheck:${event.id}`)).toBe('1');
    expect(Number(ctx.props.get('DATA_VERSION'))).toBe(2);

    const updated = ctx.db.events.get(event.id)!;
    expect(updated.formClosed).toBe(true);
    expect(updated.formClosedReason).toBe('capacity');

    // Chunks should be warmed at bumped dataVersion (2)
    expect(ctx.cache.get(`boot:chunk:${event.id}:st_popping:2`)).toBeTruthy();
    expect(ctx.cache.get(`boot:chunk:${event.id}:st_hiphop:2`)).toBeTruthy();
  });

  it('warmCaches respects sync:check key and skips source check when already checked within 60s', () => {
    const sourceSs = ctx.drive.createSpreadsheet('Source Sheet', 'root');
    const sourceTab = sourceSs.addSheet('Form Responses 1', [
      ['Timestamp', 'Full Name', 'Matric Number', 'Contact Number', 'Email', 'Classes'],
      ['2026-10-01', 'Popper Ali', '22001111', '0123456789', 'a@t.com', 'Popping']
    ]);

    ctx.db.events.update(event.id, event.version, {
      sourceSheetId: sourceSs.id,
      sourceTab: 'Form Responses 1',
      sourceRowCount: 2,
      sourceLastRowHash: 'dummy_hash',
      memberCount: 1
    }, 'test', ctx.now());

    // Mark sync:check:<eventId> as already checked (e.g. by events.autoSync)
    ctx.cache.put(`sync:check:${event.id}`, '1', 60);

    const getDisplayValuesSpy = vi.spyOn(sourceTab, 'getDisplayValues');

    warmCaches(ctx);

    // Since sync:check is cached, sourceTab.getDisplayValues should NOT be called
    expect(getDisplayValuesSpy).not.toHaveBeenCalled();

    // Now clear the cache and warm again: sourceTab.getDisplayValues SHOULD be called and sync:check set
    ctx.cache.remove(`sync:check:${event.id}`);
    warmCaches(ctx);

    expect(getDisplayValuesSpy).toHaveBeenCalled();
    expect(ctx.cache.get(`sync:check:${event.id}`)).toBe('1');
  });
});
