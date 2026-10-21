import { describe, it, expect, beforeEach } from 'vitest';
import { makeCtx } from '../fakes/makeCtx';
import { FakeDrive } from '../fakes/fakeDrive';
import { seedEvent, seedSourceSheet } from '../fixtures/events';
import { syncGoogleFormSlotChoices, FULL_HOUSE_CLOSED_MESSAGE } from '../../src/features/formGating';
import { Member } from '@umdsc/shared';

const HEADERS = ['Timestamp', 'Full Name', 'Matric Number', 'Contact Number', 'Email', 'Classes'];

describe('Google Form Gating Edge Cases & Precision Stress Tests', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let drive: FakeDrive;

  function addStyle(id: string, name: string, aliases: string[]) {
    ctx.db.styles.insert(
      {
        id,
        name,
        aliases,
        colorKey: 'blue',
        defaultWeekday: null,
        defaultStart: '20:00',
        defaultEnd: '22:00',
        defaultInstructorId: '',
        defaultVenue: '',
        attendanceFolderId: '',
        videoFolderId: ''
      } as any,
      'system',
      ctx.now()
    );
  }

  beforeEach(() => {
    drive = new FakeDrive();
    ctx = makeCtx({ drive });
    // Add multiple styles where names or aliases could have substrings in common
    addStyle('st_popping', 'Popping', ['pop', 'popping']);
    addStyle('st_kpop', 'K-Pop', ['kpop', 'k-pop']);
    addStyle('st_hiphop', 'Hip Hop', ['hip hop', 'hiphop', 'urban']);
    addStyle('st_choreo', 'Choreo', ['choreography', 'open choreo']);
  });

  it('correctly prioritizes exact name match over short alias substrings (e.g. K-Pop vs Pop)', () => {
    const sourceId = seedSourceSheet(ctx, [HEADERS]);
    const formId = 'form_kpop_test';
    const form = ctx.form.createForm(formId);
    ctx.form.setLinkedForm(sourceId, `https://docs.google.com/forms/d/${formId}/edit`);

    // Question contains both Popping and K-Pop
    form.addQuestion({
      id: 'q_classes',
      title: 'Select dance class',
      choices: ['Popping', 'K-Pop'],
      helpText: ''
    });

    const event = seedEvent(ctx, {
      name: 'KPOP & POPPING WORKSHOP',
      sourceSheetId: sourceId,
      styleIds: ['st_popping', 'st_kpop'],
      styleSlots: { st_popping: 1, st_kpop: 5 }
    });

    // 1 dancer enrolled in Popping -> Popping is FULL (1/1). K-Pop has 0/5 -> K-Pop is AVAILABLE.
    const members: Member[] = [
      { memberId: 'm1', fullName: 'Alice', matricRaw: '2301', matricKey: '2301', nameKey: 'alice', styleIds: ['st_popping'], styleNames: ['Popping'] }
    ];

    const result = syncGoogleFormSlotChoices(ctx, event, members);

    expect(result.synced).toBe(true);
    expect(result.fullStyleIds).toEqual(['st_popping']);
    expect(result.availableStyleIds).toEqual(['st_kpop']);

    const question = form.getStyleQuestion()!;
    // Popping must be removed, K-Pop MUST remain!
    expect(question.choices).toContain('K-Pop');
    expect(question.choices).not.toContain('Popping');
    expect(question.helpText).toContain('Popping');
  });

  it('keeps form OPEN when some styles have limits but other styles are unlimited (slots=0 or undefined)', () => {
    const sourceId = seedSourceSheet(ctx, [HEADERS]);
    const formId = 'form_unlimited_test';
    const form = ctx.form.createForm(formId);
    ctx.form.setLinkedForm(sourceId, `https://docs.google.com/forms/d/${formId}/edit`);

    form.addQuestion({
      id: 'q_classes',
      title: 'Select dance class',
      choices: ['Hip Hop', 'Choreo'],
      helpText: ''
    });

    const event = seedEvent(ctx, {
      name: 'MIXED SLOTS WORKSHOP',
      sourceSheetId: sourceId,
      styleIds: ['st_hiphop', 'st_choreo'],
      // Hip Hop is capped at 1, Choreo has NO limit (unlimited)
      styleSlots: { st_hiphop: 1, st_choreo: 0 }
    });

    const members: Member[] = [
      { memberId: 'm1', fullName: 'Alice', matricRaw: '2301', matricKey: '2301', nameKey: 'alice', styleIds: ['st_hiphop'], styleNames: ['Hip Hop'] }
    ];

    const result = syncGoogleFormSlotChoices(ctx, event, members);

    expect(result.synced).toBe(true);
    expect(result.formClosed).toBe(false);
    expect(result.fullStyleIds).toEqual(['st_hiphop']);
    expect(result.availableStyleIds).toEqual(['st_choreo']);
    expect(form.isAcceptingResponses()).toBe(true);

    const question = form.getStyleQuestion()!;
    expect(question.choices).toEqual(['Choreo']);
  });

  it('counts multi-style dancers towards capacity of each selected style', () => {
    const sourceId = seedSourceSheet(ctx, [HEADERS]);
    const formId = 'form_multi_dancer_test';
    const form = ctx.form.createForm(formId);
    ctx.form.setLinkedForm(sourceId, `https://docs.google.com/forms/d/${formId}/edit`);

    form.addQuestion({
      id: 'q_classes',
      title: 'Classes',
      choices: ['Hip Hop', 'Choreo'],
      helpText: ''
    });

    const event = seedEvent(ctx, {
      name: 'TWO STYLE DANCER EVENT',
      sourceSheetId: sourceId,
      styleIds: ['st_hiphop', 'st_choreo'],
      styleSlots: { st_hiphop: 1, st_choreo: 1 }
    });

    // 1 dancer enrolled in BOTH Hip Hop and Choreo -> BOTH are FULL!
    const members: Member[] = [
      {
        memberId: 'm1',
        fullName: 'Alice',
        matricRaw: '2301',
        matricKey: '2301',
        nameKey: 'alice',
        styleIds: ['st_hiphop', 'st_choreo'],
        styleNames: ['Hip Hop', 'Choreo']
      }
    ];

    const result = syncGoogleFormSlotChoices(ctx, event, members);

    expect(result.synced).toBe(true);
    expect(result.formClosed).toBe(true);
    expect(result.fullStyleIds).toContain('st_hiphop');
    expect(result.fullStyleIds).toContain('st_choreo');
    expect(form.isAcceptingResponses()).toBe(false);
    expect(form.getCustomClosedFormMessage()).toBe(FULL_HOUSE_CLOSED_MESSAGE);
  });

  it('ignores removed/cancelled members when calculating capacity', () => {
    const sourceId = seedSourceSheet(ctx, [HEADERS]);
    const formId = 'form_removed_member_test';
    const form = ctx.form.createForm(formId);
    ctx.form.setLinkedForm(sourceId, `https://docs.google.com/forms/d/${formId}/edit`);

    form.addQuestion({
      id: 'q_classes',
      title: 'Classes',
      choices: ['Hip Hop'],
      helpText: ''
    });

    const event = seedEvent(ctx, {
      name: 'REMOVAL TEST EVENT',
      sourceSheetId: sourceId,
      styleIds: ['st_hiphop'],
      styleSlots: { st_hiphop: 1 }
    });

    // 1 member, but flagged as removed!
    const members: Member[] = [
      {
        memberId: 'm1',
        fullName: 'Alice',
        matricRaw: '2301',
        matricKey: '2301',
        nameKey: 'alice',
        styleIds: ['st_hiphop'],
        styleNames: ['Hip Hop'],
        flags: ['removed']
      }
    ];

    const result = syncGoogleFormSlotChoices(ctx, event, members);

    expect(result.synced).toBe(true);
    expect(result.formClosed).toBe(false);
    expect(result.availableStyleIds).toEqual(['st_hiphop']);
    expect(form.isAcceptingResponses()).toBe(true);
  });
});
