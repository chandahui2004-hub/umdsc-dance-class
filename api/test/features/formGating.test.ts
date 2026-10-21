import { describe, it, expect, beforeEach } from 'vitest';
import { makeCtx } from '../fakes/makeCtx';
import { FakeDrive } from '../fakes/fakeDrive';
import { seedEvent, seedSourceSheet } from '../fixtures/events';
import { syncGoogleFormSlotChoices, FULL_HOUSE_CLOSED_MESSAGE } from '../../src/features/formGating';
import { EventItem, Member } from '@umdsc/shared';

const HEADERS = ['Timestamp', 'Full Name', 'Matric Number', 'Contact Number', 'Email', 'Classes'];

describe('Google Form Automated Slot Gating (syncGoogleFormSlotChoices)', () => {
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

  function makeEvent(rows: string[][], fields: Partial<EventItem> = {}): { event: EventItem; sourceId: string; formId: string } {
    const sourceId = seedSourceSheet(ctx, [HEADERS, ...rows]);
    const formId = 'test_form_789';
    const form = ctx.form.createForm(formId);
    ctx.form.setLinkedForm(sourceId, `https://docs.google.com/forms/d/${formId}/edit`);

    form.addQuestion({
      id: 'q_styles',
      title: 'Select your dance classes / styles',
      choices: ['Hip Hop', 'Popping', 'Locking'],
      helpText: 'Select one or more styles'
    });

    const event = seedEvent(ctx, {
      name: 'OCTOBER WORKSHOP',
      sourceSheetId: sourceId,
      sourceTab: 'Form Responses 1',
      classIndex: 5,
      styleIds: ['st_hiphop', 'st_popping', 'st_locking'],
      ...fields
    });
    return { event, sourceId, formId };
  }

  beforeEach(() => {
    drive = new FakeDrive();
    ctx = makeCtx({ drive });
    addStyle('st_hiphop', 'Hip Hop', ['hip hop', 'hiphop']);
    addStyle('st_popping', 'Popping', ['popping']);
    addStyle('st_locking', 'Locking', ['locking']);
  });

  it('removes full style choices and adds notice in multi-style event', () => {
    const { event, formId } = makeEvent([], {
      styleSlots: { st_hiphop: 2, st_popping: 5, st_locking: 5 }
    });

    const members: Member[] = [
      { memberId: 'm1', fullName: 'Alice', matricRaw: '2301', matricKey: '2301', nameKey: 'alice', styleIds: ['st_hiphop'], styleNames: ['Hip Hop'] },
      { memberId: 'm2', fullName: 'Bob', matricRaw: '2302', matricKey: '2302', nameKey: 'bob', styleIds: ['st_hiphop'], styleNames: ['Hip Hop'] }
    ];

    const result = syncGoogleFormSlotChoices(ctx, event, members);

    expect(result.synced).toBe(true);
    expect(result.formClosed).toBe(false);
    expect(result.fullStyleIds).toEqual(['st_hiphop']);
    expect(result.availableStyleIds).toEqual(['st_popping', 'st_locking']);

    const form = ctx.form.openForm(formId)!;
    expect(form.isAcceptingResponses()).toBe(true);

    const question = form.getStyleQuestion()!;
    // Hip Hop was removed, Popping and Locking remain
    expect(question.choices).toEqual(['Popping', 'Locking']);
    expect(question.helpText).toContain('⚠️ Note: [Hip Hop] has reached maximum capacity and is closed for registration.');
  });

  it('closes form completely with Full House message when single-style event fills up', () => {
    const sourceId = seedSourceSheet(ctx, [HEADERS]);
    const formId = 'single_style_form';
    const form = ctx.form.createForm(formId);
    ctx.form.setLinkedForm(sourceId, `https://docs.google.com/forms/d/${formId}/edit`);

    form.addQuestion({
      id: 'q_single',
      title: 'Class',
      choices: ['Hip Hop'],
      helpText: ''
    });

    const event = seedEvent(ctx, {
      name: 'HIP HOP INTENSIVE',
      sourceSheetId: sourceId,
      styleIds: ['st_hiphop'],
      styleSlots: { st_hiphop: 2 }
    });

    const members: Member[] = [
      { memberId: 'm1', fullName: 'Alice', matricRaw: '2301', matricKey: '2301', nameKey: 'alice', styleIds: ['st_hiphop'], styleNames: ['Hip Hop'] },
      { memberId: 'm2', fullName: 'Bob', matricRaw: '2302', matricKey: '2302', nameKey: 'bob', styleIds: ['st_hiphop'], styleNames: ['Hip Hop'] }
    ];

    const result = syncGoogleFormSlotChoices(ctx, event, members);

    expect(result.synced).toBe(true);
    expect(result.formClosed).toBe(true);
    expect(form.isAcceptingResponses()).toBe(false);
    expect(form.getCustomClosedFormMessage()).toBe(FULL_HOUSE_CLOSED_MESSAGE);
  });

  it('closes form completely when all styles in a multi-style event reach capacity', () => {
    const { event, formId } = makeEvent([], {
      styleSlots: { st_hiphop: 1, st_popping: 1, st_locking: 1 }
    });

    const members: Member[] = [
      { memberId: 'm1', fullName: 'Alice', matricRaw: '2301', matricKey: '2301', nameKey: 'alice', styleIds: ['st_hiphop'], styleNames: ['Hip Hop'] },
      { memberId: 'm2', fullName: 'Bob', matricRaw: '2302', matricKey: '2302', nameKey: 'bob', styleIds: ['st_popping'], styleNames: ['Popping'] },
      { memberId: 'm3', fullName: 'Charlie', matricRaw: '2303', matricKey: '2303', nameKey: 'charlie', styleIds: ['st_locking'], styleNames: ['Locking'] }
    ];

    const result = syncGoogleFormSlotChoices(ctx, event, members);

    expect(result.synced).toBe(true);
    expect(result.formClosed).toBe(true);

    const form = ctx.form.openForm(formId)!;
    expect(form.isAcceptingResponses()).toBe(false);
    expect(form.getCustomClosedFormMessage()).toBe(FULL_HOUSE_CLOSED_MESSAGE);
  });

  it('auto-reopens form and restores choices when capacity is freed or slots increased', () => {
    const { event, formId } = makeEvent([], {
      styleSlots: { st_hiphop: 1, st_popping: 1, st_locking: 1 }
    });

    const form = ctx.form.openForm(formId)!;
    // Simulate it was closed before
    form.setAcceptingResponses(false);
    form.setCustomClosedFormMessage(FULL_HOUSE_CLOSED_MESSAGE);

    // Now slot limit for Hip Hop is increased to 5
    const updatedEvent = {
      ...event,
      styleSlots: { st_hiphop: 5, st_popping: 1, st_locking: 1 }
    };

    const members: Member[] = [
      { memberId: 'm1', fullName: 'Alice', matricRaw: '2301', matricKey: '2301', nameKey: 'alice', styleIds: ['st_hiphop'], styleNames: ['Hip Hop'] },
      { memberId: 'm2', fullName: 'Bob', matricRaw: '2302', matricKey: '2302', nameKey: 'bob', styleIds: ['st_popping'], styleNames: ['Popping'] },
      { memberId: 'm3', fullName: 'Charlie', matricRaw: '2303', matricKey: '2303', nameKey: 'charlie', styleIds: ['st_locking'], styleNames: ['Locking'] }
    ];

    const result = syncGoogleFormSlotChoices(ctx, updatedEvent, members);

    expect(result.synced).toBe(true);
    expect(result.formClosed).toBe(false);
    expect(form.isAcceptingResponses()).toBe(true);

    // Hip Hop has 1/5 enrolled, so it is available! Popping (1/1) and Locking (1/1) are full.
    expect(result.availableStyleIds).toEqual(['st_hiphop']);
    expect(result.fullStyleIds).toEqual(['st_popping', 'st_locking']);

    const question = form.getStyleQuestion()!;
    expect(question.choices).toEqual(['Hip Hop']);
    expect(question.helpText).toContain('Popping, Locking');
  });

  it('respects admin manual form closure when form is closed directly in Google Forms', () => {
    const { event, formId } = makeEvent([], {
      styleSlots: { st_hiphop: 10 }
    });

    const form = ctx.form.openForm(formId)!;
    // Admin directly toggled "Accepting responses" to false in Google Forms (custom message is empty or custom)
    form.setAcceptingResponses(false);
    form.setCustomClosedFormMessage('Registrations temporarily paused by club admin');

    // Only 1 dancer enrolled out of 10
    const members: Member[] = [
      { memberId: 'm1', fullName: 'Alice', matricRaw: '2301', matricKey: '2301', nameKey: 'alice', styleIds: ['st_hiphop'], styleNames: ['Hip Hop'] }
    ];

    const result = syncGoogleFormSlotChoices(ctx, event, members);

    expect(result.synced).toBe(true);
    expect(result.formClosed).toBe(true);
    expect(result.formClosedManually).toBe(true);
    // Crucial: Must NOT force re-open the form!
    expect(form.isAcceptingResponses()).toBe(false);
  });

  it('auto-discovers new dance style choices added directly in Google Form and adds to event styles', () => {
    // Add Breaking to master data styles
    addStyle('st_breaking', 'Breaking', ['breaking', 'bboy']);

    const sourceId = seedSourceSheet(ctx, [HEADERS]);
    const formId = 'form_with_new_style';
    const form = ctx.form.createForm(formId);
    ctx.form.setLinkedForm(sourceId, `https://docs.google.com/forms/d/${formId}/edit`);

    // The Google Form has Hip Hop AND Breaking (added by admin directly in Google Forms)
    form.addQuestion({
      id: 'q_styles',
      title: 'Select dance class',
      choices: ['Hip Hop', 'Breaking'],
      helpText: ''
    });

    // But the event in our database currently only has Hip Hop
    const event = seedEvent(ctx, {
      name: 'STYLE AUTO SYNC EVENT',
      sourceSheetId: sourceId,
      styleIds: ['st_hiphop'],
      styleSlots: { st_hiphop: 10 }
    });

    const result = syncGoogleFormSlotChoices(ctx, event, []);

    expect(result.synced).toBe(true);
    expect(result.discoveredStyleIds).toContain('st_breaking');
    // Event in db now automatically includes st_breaking!
    const refreshed = ctx.db.events.get(event.id)!;
    expect(refreshed.styleIds).toContain('st_hiphop');
    expect(refreshed.styleIds).toContain('st_breaking');
  });

  it('gracefully handles events without a linked Google Form without throwing', () => {
    const sourceId = seedSourceSheet(ctx, [HEADERS]);
    // Do NOT link any form
    const event = seedEvent(ctx, {
      name: 'NO FORM EVENT',
      sourceSheetId: sourceId,
      styleIds: ['st_hiphop'],
      styleSlots: { st_hiphop: 2 }
    });

    const result = syncGoogleFormSlotChoices(ctx, event, []);
    expect(result.synced).toBe(false);
    expect(result.message).toContain('No Google Form');
  });
});
