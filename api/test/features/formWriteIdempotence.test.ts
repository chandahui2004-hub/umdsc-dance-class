import { describe, it, expect, beforeEach } from 'vitest';
import { makeCtx } from '../fakes/makeCtx';
import { FakeDrive } from '../fakes/fakeDrive';
import { seedEvent, seedSourceSheet } from '../fixtures/events';
import { syncGoogleFormSlotChoices, checkEventFormStatus, FULL_HOUSE_CLOSED_MESSAGE } from '../../src/features/formGating';
import { Member } from '@umdsc/shared';

describe('Google Form Sync Idempotency & Live Form Protection', () => {
  let ctx: ReturnType<typeof makeCtx>;

  beforeEach(() => {
    ctx = makeCtx({ drive: new FakeDrive() });
    for (const [id, name] of [['st_hiphop', 'Hip Hop'], ['st_popping', 'Popping'], ['st_locking', 'Locking']]) {
      ctx.db.styles.insert({
        id,
        name,
        aliases: [name.toLowerCase()],
        colorKey: 'blue',
        defaultWeekday: null,
        defaultStart: '20:00',
        defaultEnd: '22:00',
        defaultInstructorId: '',
        defaultVenue: '',
        attendanceFolderId: '',
        videoFolderId: ''
      } as any, 'system', ctx.now());
    }
  });

  it('performs 0 live form writes across repeated syncs when choices and capacity are unchanged', () => {
    const sourceId = seedSourceSheet(ctx, [['Timestamp', 'Full Name', 'Matric Number', 'Contact Number', 'Email', 'Classes']]);
    const form = ctx.form.createForm('f1');
    form.addQuestion({ id: 'q', title: 'Select your dance classes', choices: ['Hip Hop', 'Popping', 'Locking'], helpText: 'Pick any' });
    let writes = 0;
    const realSetChoices = form.setChoices.bind(form);
    form.setChoices = (...args: Parameters<typeof form.setChoices>) => { writes++; realSetChoices(...args); };
    const realSetAccepting = form.setAcceptingResponses.bind(form);
    form.setAcceptingResponses = (v: boolean) => { writes++; realSetAccepting(v); };

    const event = seedEvent(ctx, {
      name: 'NOV',
      sourceSheetId: sourceId,
      formId: 'f1',
      classIndex: 5,
      styleIds: ['st_hiphop', 'st_popping', 'st_locking'],
      styleSlots: { st_hiphop: 25, st_popping: 25, st_locking: 25 }
    });
    const members: Member[] = [
      { memberId: 'm1', fullName: 'A', matricRaw: '1', matricKey: '1', nameKey: 'a', styleIds: ['st_hiphop'], styleNames: ['Hip Hop'] } as any
    ];

    for (let i = 0; i < 10; i++) {
      syncGoogleFormSlotChoices(ctx, event, members);
    }

    expect(writes).toBe(0);
  });

  it('writes exactly once when a style fills up, and 0 times on subsequent syncs', () => {
    const sourceId = seedSourceSheet(ctx, [['Timestamp', 'Full Name', 'Matric Number', 'Contact Number', 'Email', 'Classes']]);
    const form = ctx.form.createForm('f2');
    form.addQuestion({ id: 'q', title: 'Select your dance classes', choices: ['Hip Hop', 'Popping', 'Locking'], helpText: 'Pick any' });
    let writes = 0;
    const realSetChoices = form.setChoices.bind(form);
    form.setChoices = (...args: Parameters<typeof form.setChoices>) => { writes++; realSetChoices(...args); };

    const event = seedEvent(ctx, {
      name: 'NOV',
      sourceSheetId: sourceId,
      formId: 'f2',
      classIndex: 5,
      styleIds: ['st_hiphop', 'st_popping', 'st_locking'],
      styleSlots: { st_hiphop: 2, st_popping: 25, st_locking: 25 }
    });
    const membersFull: Member[] = [
      { memberId: 'm1', fullName: 'A', matricRaw: '1', matricKey: '1', nameKey: 'a', styleIds: ['st_hiphop'], styleNames: ['Hip Hop'] } as any,
      { memberId: 'm2', fullName: 'B', matricRaw: '2', matricKey: '2', nameKey: 'b', styleIds: ['st_hiphop'], styleNames: ['Hip Hop'] } as any
    ];

    // First run detects Hip Hop full -> exactly 1 write to remove Hip Hop
    syncGoogleFormSlotChoices(ctx, event, membersFull);
    expect(writes).toBe(1);

    // Subsequent 5 runs with same state -> 0 additional writes
    for (let i = 0; i < 5; i++) {
      syncGoogleFormSlotChoices(ctx, event, membersFull);
    }
    expect(writes).toBe(1);
  });

  it('checkEventFormStatus is purely read-only and never writes to Google Form', () => {
    const sourceId = seedSourceSheet(ctx, [['Timestamp', 'Full Name', 'Matric Number', 'Contact Number', 'Email', 'Classes']]);
    const form = ctx.form.createForm('f3');
    form.addQuestion({ id: 'q', title: 'Select your dance classes', choices: ['Hip Hop', 'Popping', 'Locking'], helpText: 'Pick any' });
    let writes = 0;
    form.setChoices = () => { writes++; };
    form.setAcceptingResponses = () => { writes++; };

    const event = seedEvent(ctx, {
      name: 'NOV',
      sourceSheetId: sourceId,
      formId: 'f3',
      classIndex: 5,
      styleIds: ['st_hiphop', 'st_popping', 'st_locking'],
      styleSlots: { st_hiphop: 25, st_popping: 25, st_locking: 25 }
    });

    for (let i = 0; i < 10; i++) {
      const res = checkEventFormStatus(ctx, event);
      expect(res.synced).toBe(true);
      expect(res.formClosed).toBe(false);
    }
    expect(writes).toBe(0);

    // If form is closed in Google Forms, it reads closed without writing to form
    form.setAcceptingResponses = () => {};
    (form as any).accepting = false;
    (form as any).closedMessage = 'Closed by committee';

    const closedRes = checkEventFormStatus(ctx, event);
    expect(closedRes.synced).toBe(true);
    expect(closedRes.formClosed).toBe(true);
    expect(closedRes.formClosedReason).toBe('manual');
    expect(writes).toBe(0);
  });
});
