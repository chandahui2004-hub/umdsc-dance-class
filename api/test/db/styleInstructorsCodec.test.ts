import { describe, it, expect, beforeEach } from 'vitest';
import { makeCtx } from '../fakes/makeCtx';
import { FakeSheet } from '../fakes/fakeSheets';
import { seedEvent } from '../fixtures/events';

describe('style instructors codec', () => {
  let ctx: ReturnType<typeof makeCtx>;
  beforeEach(() => {
    ctx = makeCtx();
  });

  function systemSheet(name: string): FakeSheet {
    return ctx.drive.openSpreadsheet('test_system_ss')!.sheet(name) as FakeSheet;
  }

  it('round-trips instructor styleIds', () => {
    const i = ctx.db.instructors.insert({ name: 'Kelvin', contact: '', styleIds: ['sty_a', 'sty_b'] } as any, 'a', ctx.now());
    ctx.db.reload();
    expect(ctx.db.instructors.get(i.id)!.styleIds).toEqual(['sty_a', 'sty_b']);
  });

  it('round-trips event styleInstructors', () => {
    const e = seedEvent(ctx, { styleIds: ['sty_a'], styleInstructors: { sty_a: ['ins_1', 'ins_2'] } });
    ctx.db.reload();
    expect(ctx.db.events.get(e.id)!.styleInstructors).toEqual({ sty_a: ['ins_1', 'ins_2'] });
  });

  it.each(['', '{}', 'not json', '[1,2]', '{"sty_a":"ins_1"}', '{"sty_a":[1]}', 'null'])(
    'reads styleInstructorsJson %j as {}',
    raw => {
      const e = seedEvent(ctx, { styleIds: ['sty_a'] });
      const sheet = systemSheet('Events');
      const col = sheet.rows[0].indexOf('styleInstructorsJson');
      const row = sheet.rows.findIndex(r => r[sheet.rows[0].indexOf('id')] === e.id);
      expect(col).toBeGreaterThanOrEqual(0);
      expect(row).toBeGreaterThan(0);
      sheet.setValues(row + 1, col + 1, [[raw]]);
      ctx.db.reload();
      expect(ctx.db.events.get(e.id)!.styleInstructors).toEqual({});
    }
  );

  it('old instructor rows without the column read styleIds as []', () => {
    const i = ctx.db.instructors.insert({ name: 'Old', contact: '', styleIds: [] } as any, 'a', ctx.now());
    const sheet = systemSheet('Instructors');
    const col = sheet.rows[0].indexOf('styleIds');
    expect(col).toBeGreaterThanOrEqual(0);
    sheet.rows = sheet.rows.map(r => r.filter((_, idx) => idx !== col));
    ctx.db.reload();
    expect(ctx.db.instructors.get(i.id)!.styleIds).toEqual([]);
  });
});
