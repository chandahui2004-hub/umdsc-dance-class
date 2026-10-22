import { describe, it, expect, beforeEach } from 'vitest';
import { makeCtx } from '../fakes/makeCtx';
import { FakeDrive } from '../fakes/fakeDrive';
import { FakeSpreadsheet, FakeSheet } from '../fakes/fakeSheets';
import { seedEvent, seedSourceSheet } from '../fixtures/events';
import { importEventMembers, checkAndNotifySlotCapacities } from '../../src/features/eventImport';
import { getSetupRoutes } from '../../src/features/setup';
import { getEventRoutes } from '../../src/features/events';
import { syncGoogleFormSlotChoices } from '../../src/features/formGating';
import { EventItem } from '@umdsc/shared';

const HEADERS = ['Timestamp', 'Full Name', 'Matric Number', 'Contact Number', 'Email', 'Classes'];
const row = (name: string, matric: string, classes: string) =>
  ['2026-10-01 10:00:00', name, matric, '0123456789', `${matric}@test.com`, classes];

describe('Slot Capacity & Alert System (Bug Audit & Verification)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let drive: FakeDrive;

  function addStyle(id: string, name: string, aliases: string[], uploaderEmail?: string) {
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
        videoFolderId: '',
        videoUploaderEmail: uploaderEmail || ''
      } as any,
      'system',
      ctx.now()
    );
  }

  function makeEvent(rows: string[][], fields: Partial<EventItem> = {}): { event: EventItem; sourceId: string } {
    const sourceId = seedSourceSheet(ctx, [HEADERS, ...rows]);
    const event = seedEvent(ctx, {
      name: 'OCT MONTHLY CLASS',
      sourceSheetId: sourceId,
      sourceTab: 'Form Responses 1',
      classIndex: 5,
      styleIds: ['st_popping', 'st_hiphop'],
      ...fields
    });
    return { event, sourceId };
  }

  const fresh = (e: EventItem) => ctx.db.events.get(e.id)!;
  const source = (id: string) => (drive.openSpreadsheet(id) as FakeSpreadsheet).sheet('Form Responses 1') as FakeSheet;

  beforeEach(() => {
    drive = new FakeDrive();
    ctx = makeCtx({ drive });
    addStyle('st_popping', 'Popping', ['popping'], 'lead.popping@umdsc.com');
    addStyle('st_hiphop', 'Hip Hop', ['hip hop', 'hiphop'], 'lead.hiphop@umdsc.com');
    const master = drive.createFolder('root', 'Attendance');
    ctx.db.settings.insert({ key: 'defaultAttendanceFolderId', value: master }, 'system', ctx.now());
  });

  it('sends slot alert to all admins in live mode when enrollment reaches capacity', () => {
    // Live admin emails configured
    ctx.db.settings.insert({ key: 'adminNotificationEmails', value: 'admin1@umdsc.com, admin2@umdsc.com' } as any, 'system', ctx.now());
    ctx.db.admins.insert({ username: 'superadmin@umdsc.com', displayName: 'Super Admin', roleId: 'admin' } as any, 'system', ctx.now());

    const { event } = makeEvent(
      [
        row('Alice', '22001', 'Popping'),
        row('Bob', '22002', 'Popping')
      ],
      {
        styleSlots: { st_popping: 2 },
        styleSlotsJson: JSON.stringify({ st_popping: 2 })
      }
    );

    ctx.mail.reset();
    importEventMembers(ctx, event, { full: true });

    // Verify alert email was sent
    const alerts = ctx.mail.sent.filter(m => m.subject.includes('Slot Full: Popping'));
    expect(alerts.length).toBeGreaterThanOrEqual(1);

    const recipients = alerts.map(m => m.to);
    // Should include club email, configured adminNotificationEmails, admin user accounts, and style lead
    expect(recipients).toContain('umdancesportc@gmail.com');
    expect(recipients).toContain('admin1@umdsc.com');
    expect(recipients).toContain('admin2@umdsc.com');
    expect(recipients).toContain('superadmin@umdsc.com');
    expect(recipients).toContain('lead.popping@umdsc.com');

    // Event marked as notified for Popping
    expect(fresh(event).notifiedFullStyles).toContain('st_popping');
  });

  it('routes alert ONLY to chandahui2004@gmail.com when test override setting is active (protects other admins)', () => {
    // Live admins in system
    ctx.db.settings.insert({ key: 'adminNotificationEmails', value: 'president@umdsc.com, secretary@umdsc.com' } as any, 'system', ctx.now());
    ctx.db.admins.insert({ username: 'treasurer@umdsc.com', displayName: 'Treasurer', roleId: 'admin' } as any, 'system', ctx.now());

    // TEST OVERRIDE SETTING SET TO chandahui2004@gmail.com
    ctx.db.settings.insert({ key: 'slotAlertTestEmail', value: 'chandahui2004@gmail.com' } as any, 'system', ctx.now());

    const { event } = makeEvent(
      [
        row('Alice', '22001', 'Popping'),
        row('Bob', '22002', 'Popping')
      ],
      {
        styleSlots: { st_popping: 2 },
        styleSlotsJson: JSON.stringify({ st_popping: 2 })
      }
    );

    ctx.mail.reset();
    importEventMembers(ctx, event, { full: true });

    const alerts = ctx.mail.sent.filter(m => m.subject.includes('Slot Full: Popping'));
    expect(alerts.length).toBe(1);

    // ONLY chandahui2004@gmail.com must have received the email!
    expect(alerts[0].to).toBe('chandahui2004@gmail.com');
    expect(alerts[0].subject).toContain('[TEST MODE]');

    // Other admins, clubEmail, and classLead MUST NOT have received anything!
    const allRecipients = ctx.mail.sent.map(m => m.to);
    expect(allRecipients).not.toContain('umdancesportc@gmail.com');
    expect(allRecipients).not.toContain('president@umdsc.com');
    expect(allRecipients).not.toContain('secretary@umdsc.com');
    expect(allRecipients).not.toContain('treasurer@umdsc.com');
    expect(allRecipients).not.toContain('lead.popping@umdsc.com');

    // Notice inside body confirms test mode and lists suppressed recipients
    expect(alerts[0].body).toContain('TEST MODE NOTICE');
    expect(alerts[0].htmlBody).toContain('TEST MODE ACTIVE');
  });

  it('does not send duplicate alert emails on subsequent syncs when capacity was already reached', () => {
    ctx.db.settings.insert({ key: 'slotAlertTestEmail', value: 'chandahui2004@gmail.com' } as any, 'system', ctx.now());

    const { event, sourceId } = makeEvent(
      [
        row('Alice', '22001', 'Popping'),
        row('Bob', '22002', 'Popping')
      ],
      {
        styleSlots: { st_popping: 2 },
        styleSlotsJson: JSON.stringify({ st_popping: 2 })
      }
    );

    ctx.mail.reset();
    importEventMembers(ctx, event, { full: true });
    const alerts = ctx.mail.sent.filter(m => m.subject.includes('Slot Full: Popping'));
    expect(alerts.length).toBe(1);

    // Another sync occurs with an additional dancer (3rd dancer)
    ctx.mail.reset();
    source(sourceId).appendRows([['2026-10-01 11:00:00', 'Charlie', '22003', '0123456789', 'c@test.com', 'Popping']]);
    importEventMembers(ctx, fresh(event), { full: false });

    // Must NOT send duplicate alert email
    expect(ctx.mail.sent.filter(m => m.subject.includes('Slot Full: Popping')).length).toBe(0);
  });

  it('re-arms notification when capacity is raised, and alerts again when new limit is reached', () => {
    ctx.db.settings.insert({ key: 'slotAlertTestEmail', value: 'chandahui2004@gmail.com' } as any, 'system', ctx.now());

    const { event, sourceId } = makeEvent(
      [
        row('Alice', '22001', 'Popping'),
        row('Bob', '22002', 'Popping')
      ],
      {
        styleSlots: { st_popping: 2 },
        styleSlotsJson: JSON.stringify({ st_popping: 2 })
      }
    );

    importEventMembers(ctx, event, { full: true });
    expect(fresh(event).notifiedFullStyles).toContain('st_popping');

    // Admin raises capacity to 4
    const ev = fresh(event);
    ctx.db.events.update(ev.id, ev.version, {
      styleSlots: { st_popping: 4 },
      styleSlotsJson: JSON.stringify({ st_popping: 4 })
    } as any, 'system', ctx.now());

    // Sync runs: capacity is now 4 but enrolled is 2 -> re-arms
    importEventMembers(ctx, fresh(event), { full: true });
    expect(fresh(event).notifiedFullStyles).not.toContain('st_popping');

    // 2 more dancers register to reach 4
    source(sourceId).appendRows([
      ['2026-10-01 12:00:00', 'Charlie', '22003', '0123456789', 'c@test.com', 'Popping'],
      ['2026-10-01 13:00:00', 'David', '22004', '0123456789', 'd@test.com', 'Popping']
    ]);

    ctx.mail.reset();
    importEventMembers(ctx, fresh(event), { full: true });

    // Should alert again!
    const rearmedAlerts = ctx.mail.sent.filter(m => m.subject.includes('Slot Full: Popping'));
    expect(rearmedAlerts.length).toBe(1);
    expect(rearmedAlerts[0].to).toBe('chandahui2004@gmail.com');
    expect(fresh(event).notifiedFullStyles).toContain('st_popping');
  });

  it('handles multi-style events: style A reaching capacity alerts only for style A while style B remains unalerted', () => {
    ctx.db.settings.insert({ key: 'slotAlertTestEmail', value: 'chandahui2004@gmail.com' } as any, 'system', ctx.now());

    const { event } = makeEvent(
      [
        row('Alice', '22001', 'Popping'),
        row('Bob', '22002', 'Popping'),
        row('Charlie', '22003', 'Hip Hop')
      ],
      {
        styleSlots: { st_popping: 2, st_hiphop: 5 },
        styleSlotsJson: JSON.stringify({ st_popping: 2, st_hiphop: 5 })
      }
    );

    ctx.mail.reset();
    importEventMembers(ctx, event, { full: true });

    // Popping reached 2/2 -> alerted
    expect(ctx.mail.sent.filter(m => m.subject.includes('Slot Full: Popping')).length).toBe(1);
    // Hip Hop is only 1/5 -> NOT alerted
    expect(ctx.mail.sent.filter(m => m.subject.includes('Slot Full: Hip Hop')).length).toBe(0);

    const updated = fresh(event);
    expect(updated.notifiedFullStyles).toContain('st_popping');
    expect(updated.notifiedFullStyles).not.toContain('st_hiphop');
  });

  it('deduplicates duplicate form submissions so repeated submissions do not trigger false slot full alerts', () => {
    ctx.db.settings.insert({ key: 'slotAlertTestEmail', value: 'chandahui2004@gmail.com' } as any, 'system', ctx.now());

    // Alice submitted the form 3 times with the same matric number
    const { event } = makeEvent(
      [
        ['2026-10-01 10:00:00', 'Alice', '22001', '0123456789', 'alice@test.com', 'Popping'],
        ['2026-10-01 10:05:00', 'Alice', '22001', '0123456789', 'alice@test.com', 'Popping'],
        ['2026-10-01 10:10:00', 'Alice', '22001', '0123456789', 'alice@test.com', 'Popping']
      ],
      {
        styleSlots: { st_popping: 2 },
        styleSlotsJson: JSON.stringify({ st_popping: 2 })
      }
    );

    ctx.mail.reset();
    importEventMembers(ctx, event, { full: true });

    // Only 1 unique member, capacity is 2 -> NOT full yet!
    expect(fresh(event).memberCount).toBe(1);
    expect(ctx.mail.sent.filter(m => m.subject.includes('Slot Full: Popping')).length).toBe(0);
    expect(fresh(event).notifiedFullStyles).not.toContain('st_popping');
  });

  it('debug.testSlotCapacityAlert route dispatches test alert to chandahui2004@gmail.com and returns live recipients list', () => {
    ctx.db.settings.insert({ key: 'adminNotificationEmails', value: 'admin1@umdsc.com, admin2@umdsc.com' } as any, 'system', ctx.now());
    ctx.db.admins.insert({ username: 'adminuser@umdsc.com', displayName: 'Admin User', roleId: 'admin' } as any, 'system', ctx.now());

    const routes = getSetupRoutes();
    const handler = routes['debug.testSlotCapacityAlert'].handler;

    ctx.mail.reset();
    const result = handler(ctx as any, null, {
      to: 'chandahui2004@gmail.com',
      styleName: 'Popping',
      eventName: 'OCT MONTHLY CLASS',
      slots: 25,
      enrolled: 25
    });

    expect(result.sent).toBe(true);
    expect(result.to).toBe('chandahui2004@gmail.com');
    expect(result.subject).toContain('[TEST MODE]');
    expect(result.subject).toContain('Popping');
    expect(result.subject).toContain('25/25');

    // Confirms live recipients list was gathered accurately
    expect(result.liveRecipients).toContain('umdancesportc@gmail.com');
    expect(result.liveRecipients).toContain('admin1@umdsc.com');
    expect(result.liveRecipients).toContain('admin2@umdsc.com');
    expect(result.liveRecipients).toContain('adminuser@umdsc.com');

    // Sent email verified in mail port
    expect(ctx.mail.sent.length).toBe(1);
    expect(ctx.mail.sent[0].to).toBe('chandahui2004@gmail.com');
    expect(ctx.mail.sent[0].name).toBe('UMDSC Dance Class System');
  });

  it('sanitizes invisible / zero-width characters (e.g. U+2060, U+200B) from admin emails and usernames', () => {
    // Inject invisible U+2060 word joiner into settings and admin accounts (as observed from real pasted data)
    ctx.db.settings.insert(
      { key: 'adminNotificationEmails', value: '\u2060pastemail@umdsc.com,  \u200Btest2@umdsc.com  ' } as any,
      'system',
      ctx.now()
    );
    ctx.db.admins.insert(
      { username: '\u2060hiddenzero@umdsc.com', displayName: 'Hidden Admin', roleId: 'admin' } as any,
      'system',
      ctx.now()
    );

    const { event } = makeEvent(
      [
        row('Alice', '23001001', 'Popping'),
        row('Bob', '23001002', 'Popping')
      ],
      { styleSlots: { st_popping: 2 } }
    );

    ctx.mail.reset();
    importEventMembers(ctx, event, { full: true });

    const sentAlerts = ctx.mail.sent.filter(m => m.subject.includes('Slot Full'));
    const recipients = sentAlerts.map(m => m.to);

    // Verify all recipients are completely cleaned of invisible characters
    expect(recipients).toContain('pastemail@umdsc.com');
    expect(recipients).toContain('test2@umdsc.com');
    expect(recipients).toContain('hiddenzero@umdsc.com');

    recipients.forEach(r => {
      expect(r).not.toContain('\u2060');
      expect(r).not.toContain('\u200B');
      expect(r).not.toContain('\uFEFF');
      expect(r).not.toContain(' ');
    });
  });

  it('automatically modifies linked Google Form choices when importEventMembers reaches slot capacity', () => {
    const formId = 'live_test_form_1';
    const form = ctx.form.createForm(formId);
    form.addQuestion({
      id: 'q1',
      title: 'Which classes are you attending?',
      choices: ['Popping', 'Hip Hop'],
      helpText: ''
    });

    const { event, sourceId } = makeEvent(
      [
        row('Alice', '23001001', 'Popping'),
        row('Bob', '23001002', 'Popping')
      ],
      { styleSlots: { st_popping: 2, st_hiphop: 10 } }
    );
    ctx.form.setLinkedForm(sourceId, `https://docs.google.com/forms/d/${formId}/edit`);

    importEventMembers(ctx, event, { full: true });

    // Verify form was modified: Popping was removed, Hip Hop remains
    const updatedForm = ctx.form.openForm(formId)!;
    const q = updatedForm.getStyleQuestion()!;
    expect(q.choices).toEqual(['Hip Hop']);
    expect(q.helpText).toContain('Popping');
  });

  it('persists formUrl and extracts formId in events.create and events.update', () => {
    ctx.props.set('SYSTEM_SPREADSHEET_ID', 'sys_ss_id');
    ctx.db.settings.insert({ key: 'defaultAttendanceFolderId', value: 'att_folder_1' } as any, 'system', ctx.now());
    const inst = ctx.db.instructors.insert({ name: 'Bob Popping', styleIds: ['st_popping'] } as any, 'system', ctx.now());
    const routes = getEventRoutes();
    const sourceId = seedSourceSheet(ctx, [HEADERS]);

    const res = routes['events.create'].handler(ctx, { claims: { sub: 'admin1' } }, {
      name: 'Event With Form',
      type: 'monthly',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      sheetUrl: `https://docs.google.com/spreadsheets/d/${sourceId}/edit`,
      formUrl: 'https://docs.google.com/forms/d/11ZZM4qFUc1jj9LSqUXSzbr0y2-e4xziO8w4YSc4ze0I/edit',
      styleIds: ['st_popping'],
      styleInstructors: { st_popping: [inst.id] },
      styleSlots: { st_popping: 20 },
      sessions: [{ seq: 1, styleId: 'st_popping', date: '2026-10-10', start: '20:00', end: '22:00', instructorId: inst.id }]
    });
    const created = res.event;

    expect(created.formUrl).toBe('https://docs.google.com/forms/d/11ZZM4qFUc1jj9LSqUXSzbr0y2-e4xziO8w4YSc4ze0I/edit');
    expect(created.formId).toBe('11ZZM4qFUc1jj9LSqUXSzbr0y2-e4xziO8w4YSc4ze0I');

    // Update with /d/e/ form URL format
    const updatedWithE = routes['events.update'].handler(ctx, { claims: { sub: 'admin1' } }, {
      id: created.id,
      version: created.version,
      formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLScgLQGnlHQguiSa6NU7vHuzhrOCxF148-WkXMP2VxYCS86F8w/viewform'
    });

    expect(updatedWithE.formUrl).toBe('https://docs.google.com/forms/d/e/1FAIpQLScgLQGnlHQguiSa6NU7vHuzhrOCxF148-WkXMP2VxYCS86F8w/viewform');
    expect(updatedWithE.formId).toBe('1FAIpQLScgLQGnlHQguiSa6NU7vHuzhrOCxF148-WkXMP2VxYCS86F8w');

    // Update with another form URL
    const updated = routes['events.update'].handler(ctx, { claims: { sub: 'admin1' } }, {
      id: created.id,
      version: updatedWithE.version,
      formUrl: 'https://docs.google.com/forms/d/another_form_id_999/viewform'
    });

    expect(updated.formUrl).toBe('https://docs.google.com/forms/d/another_form_id_999/viewform');
    expect(updated.formId).toBe('another_form_id_999');

    // Reload from database table to ensure serialization/deserialization works
    const reloaded = ctx.db.events.get(created.id)!;
    expect(reloaded.formUrl).toBe('https://docs.google.com/forms/d/another_form_id_999/viewform');
    expect(reloaded.formId).toBe('another_form_id_999');

    // Test previewSource auto-detecting formUrl from spreadsheet
    const fakeSpreadsheet = drive.openSpreadsheet(sourceId) as FakeSpreadsheet;
    fakeSpreadsheet.formUrl = 'https://docs.google.com/forms/d/detected_form_id_from_sheet/viewform';
    const preview = routes['events.previewSource'].handler(ctx, { claims: { sub: 'admin1' } }, {
      sheetUrl: `https://docs.google.com/spreadsheets/d/${sourceId}/edit`
    });
    expect(preview.formUrl).toBe('https://docs.google.com/forms/d/detected_form_id_from_sheet/viewform');
  });

  it('syncGoogleFormSlotChoices succeeds with edit link and closes form on full capacity', () => {
    const realEditId = '11ZZM4qFUc1jj9LSqUXSzbr0y2-e4xziO8w4YSc4ze0I';
    const form = ctx.form.createForm(realEditId);
    form.addQuestion({
      id: 'q_dance',
      title: 'Choose Dance Style',
      choices: ['Popping', 'Hip Hop'],
      helpText: ''
    });

    const { event } = makeEvent(
      [
        row('Alice', '23001001', 'Popping'),
        row('Bob', '23001002', 'Popping')
      ],
      {
        formUrl: `https://docs.google.com/forms/d/${realEditId}/edit`,
        formId: realEditId,
        styleSlots: { st_popping: 2, st_hiphop: 15 }
      }
    );

    importEventMembers(ctx, event, { full: true });

    const res = syncGoogleFormSlotChoices(ctx, fresh(event));

    expect(res.synced).toBe(true);
    expect(res.fullStyleIds).toContain('st_popping');
    expect(res.availableStyleIds).toContain('st_hiphop');

    const updated = ctx.form.openForm(realEditId)!;
    const q = updated.getStyleQuestion()!;
    expect(q.choices).toEqual(['Hip Hop']);
  });
});

