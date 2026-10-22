import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { makeCtx } from '../fakes/makeCtx';
import { FakeDrive } from '../fakes/fakeDrive';
import { FakeFormInstance } from '../fakes/fakeForm';
import { seedEvent, seedSourceSheet } from '../fixtures/events';
import { syncGoogleFormSlotChoices } from '../../src/features/formGating';
import { extractGoogleFormId } from '../../src/features/events';
import { EventItem, Member } from '@umdsc/shared';

// Mirrors the real "Testing 1" form: priced labels, "Hiphop" spelling, promo text in the description.
const HEADERS = ['Timestamp', 'Full Name', 'Matric Number', 'Contact Number', 'Email', 'Classes'];
const CHOICES = ['Popping (RM60/month)', 'Latin (RM60/month)', 'Locking (RM60/month)', 'Hiphop (RM60/month)'];
const PROMO = 'SPECIAL PROMOTION! Any 2 classes: RM100/month';

const member = (id: string, styleIds: string[]): Member =>
  ({ memberId: id, fullName: id, matricRaw: id, matricKey: id, nameKey: id, styleIds, styleNames: [] } as unknown as Member);

describe('Google Form gating against the real club form layout', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let form: FakeFormInstance;
  let event: EventItem;
  const FORM_ID = '11ZZM4qFUc1jj9LSqUXSzbr0y2-e4xziO8w4YSc4ze0I';

  function addStyle(id: string, name: string, aliases: string[]) {
    ctx.db.styles.insert(
      { id, name, aliases, colorKey: 'blue', defaultWeekday: null, defaultStart: '20:00', defaultEnd: '22:00',
        defaultInstructorId: '', defaultVenue: '', attendanceFolderId: '', videoFolderId: '' } as any,
      'system',
      ctx.now()
    );
  }

  beforeEach(() => {
    ctx = makeCtx({ drive: new FakeDrive() });
    addStyle('st_locking', 'Locking', ['locking']);
    addStyle('st_popping', 'Popping', ['popping']);
    addStyle('st_hiphop', 'Hip Hop', ['hip hop', 'hiphop', 'hip-hop']);
    addStyle('st_latin', 'Latin', ['latin']);

    form = ctx.form.createForm(FORM_ID);
    form.addQuestion({
      id: 'q_classes',
      title: 'Please select the classes that you want to join/continue',
      choices: [...CHOICES],
      helpText: PROMO
    });

    const sourceId = seedSourceSheet(ctx, [HEADERS]);
    event = seedEvent(ctx, {
      name: 'TESTING 1',
      sourceSheetId: sourceId,
      styleIds: ['st_popping', 'st_latin', 'st_locking', 'st_hiphop'],
      styleSlots: { st_locking: 1, st_popping: 10, st_latin: 10, st_hiphop: 10 },
      formUrl: `https://docs.google.com/forms/d/${FORM_ID}/edit`,
      formId: FORM_ID
    });
  });

  const stylesBefore = () => ctx.db.styles.find(s => s.active).length;

  it('removes the full priced choice and keeps the other labels exactly as written', () => {
    const count = stylesBefore();
    const res = syncGoogleFormSlotChoices(ctx, event, [member('a', ['st_locking'])]);

    expect(res.synced).toBe(true);
    expect(res.fullStyleIds).toEqual(['st_locking']);
    expect(form.getStyleQuestion()!.choices).toEqual([
      'Popping (RM60/month)', 'Latin (RM60/month)', 'Hiphop (RM60/month)'
    ]);
    // No junk styles created from priced labels, and the event keeps its styles
    expect(ctx.db.styles.find(s => s.active).length).toBe(count);
    expect(ctx.db.events.get(event.id)!.styleIds).toEqual(['st_popping', 'st_latin', 'st_locking', 'st_hiphop']);
  });

  it('keeps the admin description and adds the full notice only once', () => {
    syncGoogleFormSlotChoices(ctx, event, [member('a', ['st_locking'])]);
    syncGoogleFormSlotChoices(ctx, event, [member('a', ['st_locking'])]);

    const help = form.getStyleQuestion()!.helpText;
    expect(help).toContain(PROMO);
    expect(help).toContain('[Locking]');
    expect(help.match(/maximum capacity/g)!.length).toBe(1);
  });

  it('restores the original priced label in its place and the plain description when a slot frees up', () => {
    syncGoogleFormSlotChoices(ctx, event, [member('a', ['st_locking'])]);
    const raised = { ...event, styleSlots: { ...event.styleSlots, st_locking: 5 } };
    syncGoogleFormSlotChoices(ctx, raised, [member('a', ['st_locking'])]);

    const q = form.getStyleQuestion()!;
    expect(q.choices).toEqual(CHOICES);
    expect(q.helpText).toBe(PROMO);
  });

  it('does not treat a responder (/d/e/) link as a form id', () => {
    expect(extractGoogleFormId('https://docs.google.com/forms/d/e/1FAIpQLScygWDWJ6WJgyLdRS62Pq8ONn10b7AXkRBUntuQTt9gZxOw/viewform')).toBe('');
    expect(extractGoogleFormId(`https://docs.google.com/forms/d/${FORM_ID}/edit`)).toBe(FORM_ID);
  });

  it('explains that the edit link is needed when only a responder link is saved', () => {
    const responderOnly = {
      ...event,
      formId: '',
      formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLScygWDWJ6WJgyLdRS62Pq8ONn10b7AXkRBUntuQTt9gZxOw/viewform'
    };
    const res = syncGoogleFormSlotChoices(ctx, responderOnly, [member('a', ['st_locking'])]);
    expect(res.synced).toBe(false);
    expect(res.message).toMatch(/edit link/i);
  });
});

describe('Apps Script manifest', () => {
  it('grants the Google Forms scope so FormApp can edit the form', () => {
    const manifest = JSON.parse(readFileSync(resolve(__dirname, '../../appsscript.json'), 'utf8'));
    expect(manifest.oauthScopes).toContain('https://www.googleapis.com/auth/forms');
  });
});
