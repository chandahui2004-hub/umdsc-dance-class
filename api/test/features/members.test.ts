import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { FakeSheet, FakeSpreadsheet } from '../fakes/fakeSheets';
import { Hmac, signToken } from '../../src/security/tokens';
import { getMemberRoutes } from '../../src/features/members';
import { getEventRoutes } from '../../src/features/events';
import { getAttendanceRoutes } from '../../src/features/attendance';
import { readEventMembers, dancerStylesInEvent } from '../../src/features/eventMembers';
import { importEventMembers } from '../../src/features/eventImport';
import { FULL_HOUSE_CLOSED_MESSAGE } from '../../src/features/formGating';
import { seedEvent, seedSourceSheet } from '../fixtures/events';
import { EventItem } from '@umdsc/shared';

const nodeHmac: Hmac = (key: string, message: string) => {
  return new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
};

const secrets = {
  tokenSecret: 'test_secret_key_123456789012345678901234567890',
  hmac: nodeHmac
};

describe('Feature: Members (features/members)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let adminToken: string;
  let event: EventItem;

  function call(action: string, payload: any) {
    return handleRequest({ action, token: adminToken, payload }, ctx, secrets);
  }

  beforeEach(() => {
    ctx = makeCtx();
    registerRoutes(getMemberRoutes());
    adminToken = signToken(
      {
        sub: 'admin1', role: 'admin', name: 'Admin', exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1,
        perms: { 'members.view': '*', 'members.import': '*' }
      },
      secrets.tokenSecret,
      secrets.hmac
    );
    ctx.props.set('ATTENDANCE_MASTER_FOLDER_ID', 'fld_att_master');
    ctx.db.settings.insert({ key: 'defaultAttendanceFolderId', value: 'fld_att_master' }, 'seed', ctx.now());
    const sourceSheetId = seedSourceSheet(ctx, [
      ['Timestamp', 'Full Name', 'Matric', 'Phone', 'Class'],
      ['2026-10-01 10:00:00', 'Popper One', '22001111', '0123456789', 'Popping'],
      ['2026-10-01 10:05:00', 'Hopper Two', '22002222', '0123456788', 'Hip Hop']
    ]);
    event = seedEvent(ctx, {
      sourceSheetId,
      sourceTab: 'Form Responses 1',
      styleIds: ['st_popping', 'st_hiphop'],
      members: [
        { matricKey: '22001111', fullName: 'Popper One', contact: '0123456789', styleIds: ['st_popping'], sourceTimestamp: '2026-10-01 10:00:00' },
        { matricKey: '22002222', fullName: 'Hopper Two', styleIds: ['st_hiphop'] }
      ]
    });
    ctx.db.memberIndex.insert(
      { matricKey: '22001111', nameKey: 'popper one', fullName: 'Popper One', eventIds: [event.id], lastEventEnd: '2026-10-31' },
      'system',
      ctx.now()
    );
  });

  it('members.list returns the event members, optionally filtered by style', () => {
    const all = call('members.list', { eventId: event.id });
    expect(all.ok && (all.data as any[]).map(m => m.fullName)).toEqual(['Popper One', 'Hopper Two']);

    const popping = call('members.list', { eventId: event.id, styleId: 'st_popping' });
    expect(popping.ok && (popping.data as any[]).map(m => m.matricKey)).toEqual(['22001111']);
  });

  it('members.list keeps other events separate', () => {
    const other = seedEvent(ctx, { members: [{ matricKey: '22009999', fullName: 'Other Dancer' }] });
    const res = call('members.list', { eventId: other.id });
    expect(res.ok && (res.data as any[]).map(m => m.fullName)).toEqual(['Other Dancer']);
  });

  it('members.list for an unknown event → NOT_FOUND', () => {
    const res = call('members.list', { eventId: 'evt_missing' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND');
  });

  it('old import and edit actions no longer exist (edits go through the form sheet: members.edit)', () => {
    for (const action of ['members.previewImport', 'members.confirmImport', 'members.resync', 'members.autoSync', 'members.importedMonths', 'members.update']) {
      const res = call(action, { month: '2026-10' });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toContain('Unknown action');
    }
  });

  describe('members.selfEdit', () => {
    it('allows a dancer to update their own name and matric, updating form, index, and token', () => {
      const dancerToken = signToken(
        {
          sub: 'M-22001111', role: 'dancer', name: 'Popper One', exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1,
          perms: { 'calendar.view': '*' }
        },
        secrets.tokenSecret,
        secrets.hmac
      );

      const res = handleRequest(
        {
          action: 'members.selfEdit',
          token: dancerToken,
          payload: { fullName: 'Popper Master', matric: '22008888' }
        },
        ctx,
        secrets
      );

      expect(res.ok).toBe(true);
      if (res.ok) {
        const data = res.data as any;
        expect(data.token).toBeTruthy();
        expect(data.claims.sub).toBe('M-22008888');
        expect(data.claims.name).toBe('Popper Master');

        // Verify MemberIndex updated
        const updatedIndex = ctx.db.memberIndex.find(m => m.matricKey === '22008888')[0];
        expect(updatedIndex).toBeTruthy();
        expect(updatedIndex.fullName).toBe('Popper Master');

        // Verify old index entry no longer maps to this event or is moved
        const oldIndex = ctx.db.memberIndex.find(m => m.matricKey === '22001111')[0];
        expect(oldIndex?.eventIds.includes(event.id)).toBeFalsy();

        // Verify admin mode (members.list) sees the updated dancer name and matric
        const adminList = handleRequest(
          { action: 'members.list', token: adminToken, payload: { eventId: event.id } },
          ctx,
          secrets
        );
        expect(adminList.ok).toBe(true);
        if (adminList.ok) {
          const members = adminList.data as any[];
          const newMember = members.find(m => m.matricKey === '22008888');
          expect(newMember).toBeTruthy();
          expect(newMember.fullName).toBe('Popper Master');
          const oldMember = members.find(m => m.matricKey === '22001111');
          expect(oldMember).toBeFalsy();
        }
      }
    });

    it('rejects taking a matric number already belonging to another dancer', () => {
      ctx.db.memberIndex.insert(
        { matricKey: '22002222', nameKey: 'hopper two', fullName: 'Hopper Two', eventIds: [event.id], lastEventEnd: '2026-10-31' },
        'system',
        ctx.now()
      );

      const dancerToken = signToken(
        {
          sub: 'M-22001111', role: 'dancer', name: 'Popper One', exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1,
          perms: { 'calendar.view': '*' }
        },
        secrets.tokenSecret,
        secrets.hmac
      );

      const res = handleRequest(
        {
          action: 'members.selfEdit',
          token: dancerToken,
          payload: { matric: '22002222' }
        },
        ctx,
        secrets
      );

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('VALIDATION');
        expect(res.error.message).toContain('already belongs to');
      }
    });

    it('rejects empty name', () => {
      const dancerToken = signToken(
        {
          sub: 'M-22001111', role: 'dancer', name: 'Popper One', exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1,
          perms: { 'calendar.view': '*' }
        },
        secrets.tokenSecret,
        secrets.hmac
      );

      const res = handleRequest(
        {
          action: 'members.selfEdit',
          token: dancerToken,
          payload: { fullName: '   ' }
        },
        ctx,
        secrets
      );

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('VALIDATION');
        expect(res.error.message).toContain('Name cannot be empty');
      }
    });

    it('refuses with LINK_NO_ACCESS and changes nothing when the form sheet cannot be written', () => {
      const formSheet = ctx.drive.openSpreadsheet(event.sourceSheetId!).sheet('Form Responses 1')!;
      formSheet.setValues = () => {
        throw new Error('You do not have permission to edit this sheet');
      };

      const dancerToken = signToken(
        {
          sub: 'M-22001111', role: 'dancer', name: 'Popper One', exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1,
          perms: { 'calendar.view': '*' }
        },
        secrets.tokenSecret,
        secrets.hmac
      );

      const res = handleRequest(
        { action: 'members.selfEdit', token: dancerToken, payload: { fullName: 'Popper Master', matric: '22008888' } },
        ctx,
        secrets
      );

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('LINK_NO_ACCESS');
        expect(res.error.message).toContain(ctx.clubEmail);
      }
      // No second sign-in entry was created, and the original one is untouched
      expect(ctx.db.memberIndex.find(m => m.matricKey === '22008888' && m.active)).toHaveLength(0);
      const original = ctx.db.memberIndex.find(m => m.matricKey === '22001111' && m.active)[0];
      expect(original.fullName).toBe('Popper One');
      expect(original.eventIds).toContain(event.id);
    });
  });

  describe('admin dancer & class CRUD (members.add, members.edit with styleIds, members.remove)', () => {
    const HEADERS = ['Timestamp', 'Full Name', 'Matric Number', 'Contact Number', 'Email', 'Classes'];
    let multiEvent: EventItem;
    let multiSourceId: string;
    let popSessionId: string;
    let hhSessionId: string;

    function addStyle(id: string, name: string, aliases: string[]) {
      ctx.db.styles.insert(
        {
          id,
          name,
          aliases,
          colorKey: 'cyan',
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

    const sourceTab = (id: string) =>
      (ctx.drive.openSpreadsheet(id) as FakeSpreadsheet).sheet('Form Responses 1') as FakeSheet;

    const attendanceSheet = (ev: EventItem, styleId: string) => {
      const rec = ctx.db.attendanceSheets.find(a => a.eventId === ev.id && a.styleId === styleId && a.active)[0];
      return (ctx.drive.openSpreadsheet(rec.spreadsheetId) as FakeSpreadsheet).sheet('Attendance') as FakeSheet;
    };

    beforeEach(() => {
      ctx = makeCtx();
      ctx.props.set('SYSTEM_SPREADSHEET_ID', 'test_system_ss');
      registerRoutes(getMemberRoutes());
      registerRoutes(getEventRoutes());
      registerRoutes(getAttendanceRoutes());
      adminToken = signToken(
        {
          sub: 'admin1',
          role: 'admin',
          name: 'Admin',
          exp: Math.floor(ctx.now().getTime() / 1000) + 3600,
          pv: 1,
          perms: { 'members.view': '*', 'members.import': '*', 'attendance.view.all': '*' }
        },
        secrets.tokenSecret,
        secrets.hmac
      );
      const master = ctx.drive.createFolder('root', 'Attendance');
      ctx.db.settings.insert({ key: 'defaultAttendanceFolderId', value: master }, 'seed', ctx.now());
      addStyle('st_popping', 'Popping', ['popping']);
      addStyle('st_hiphop', 'Hip Hop', ['hip hop', 'hiphop']);
      addStyle('st_locking', 'Locking', ['locking']);

      multiSourceId = seedSourceSheet(ctx, [
        HEADERS,
        ['2026-10-01 10:00:00', 'Alice Tan', '22001111', '0123456789', 'alice@test.com', 'Popping']
      ]);
      const created = call('events.create', {
        name: 'OCT CRUD EVENT',
        type: 'monthly',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        sheetUrl: `https://docs.google.com/spreadsheets/d/${multiSourceId}/edit`,
        columnMap: { fullName: 1, matric: 2, contact: 3, email: 4, gender: null, nationality: null },
        classIndex: 5,
        styleIds: ['st_popping', 'st_hiphop'],
        styleFormLabels: { st_popping: 'Popping (RM60)', st_hiphop: 'Hip Hop (RM60)' },
        sessions: [
          { styleId: 'st_popping', seq: 1, date: '2026-10-06', start: '20:00', end: '22:00' },
          { styleId: 'st_hiphop', seq: 1, date: '2026-10-08', start: '20:00', end: '22:00' }
        ]
      });
      expect(created.ok, JSON.stringify(created)).toBe(true);
      multiEvent = (created.data as any).event;
      popSessionId = ctx.db.sessions.find(s => s.eventId === multiEvent.id && s.styleId === 'st_popping')[0].id;
      hhSessionId = ctx.db.sessions.find(s => s.eventId === multiEvent.id && s.styleId === 'st_hiphop')[0].id;
      ctx.mail.reset();
    });

    describe('members.add', () => {
      it('adds a new dancer to the response sheet, syncs Members/Attendance/MemberIndex, and sends confirmation email', () => {
        const res = call('members.add', {
          eventId: multiEvent.id,
          fullName: 'Bala Kumar',
          matricRaw: '22002222',
          contact: '0198765432',
          email: 'bala@test.com',
          gender: 'Male',
          nationality: 'Malaysian',
          styleIds: ['st_popping', 'st_hiphop']
        });

        expect(res.ok, JSON.stringify(res)).toBe(true);
        if (res.ok) {
          expect((res.data as any).memberId).toBe('M-22002222');
          expect((res.data as any).result.added).toBe(1);
        }

        // Response sheet got the new row with styleFormLabels formatted and Gender/Nationality headers appended
        const srcRows = sourceTab(multiSourceId).getDisplayValues();
        expect(srcRows[0]).toContain('Gender');
        expect(srcRows[0]).toContain('Nationality');
        const balaRow = srcRows[2];
        expect(balaRow[1]).toBe('Bala Kumar');
        expect(balaRow[2]).toBe('22002222');
        expect(balaRow[5]).toBe('Popping (RM60), Hip Hop (RM60)');

        // Synced to Members & both Attendance sheets
        const members = readEventMembers(ctx, ctx.db.events.get(multiEvent.id)!);
        const bala = members.find(m => m.matricKey === '22002222')!;
        expect(bala).toBeTruthy();
        expect(bala.styleIds.sort()).toEqual(['st_hiphop', 'st_popping']);
        expect(bala.gender).toBe('Male');
        expect(bala.nationality).toBe('Malaysian');

        expect(attendanceSheet(multiEvent, 'st_popping').getDisplayValues().slice(2).map(r => r[0])).toContain('M-22002222');
        expect(attendanceSheet(multiEvent, 'st_hiphop').getDisplayValues().slice(2).map(r => r[0])).toContain('M-22002222');

        // MemberIndex updated
        const mi = ctx.db.memberIndex.find(m => m.matricKey === '22002222' && m.active)[0];
        expect(mi.eventIds).toContain(multiEvent.id);
        expect(mi.eventStyles?.[multiEvent.id].sort()).toEqual(['st_hiphop', 'st_popping']);

        // Confirmation email sent
        const confirm = ctx.mail.sent.find(m => m.to === 'bala@test.com');
        expect(confirm).toBeTruthy();
        expect(confirm!.subject).toContain('[UMDSC] Registration Confirmed');
      });

      it('allows admin slot override when a single-style class is full and keeps the Google Form closed', () => {
        const singleSourceId = seedSourceSheet(ctx, [
          ['Timestamp', 'Full Name', 'Matric Number', 'Contact Number', 'Email'],
          ...Array.from({ length: 20 }, (_, idx) => [
            '2026-10-01 10:00:00',
            `Dancer ${idx + 1}`,
            `2300${String(idx + 1).padStart(4, '0')}`,
            '0123456789',
            `d${idx + 1}@test.com`
          ])
        ]);
        const formId = 'single_full_form';
        const form = ctx.form.createForm(formId);
        form.addQuestion({ id: 'q1', title: 'Full Name', choices: [], helpText: '' });
        ctx.form.setLinkedForm(singleSourceId, `https://docs.google.com/forms/d/${formId}/edit`);

        const evRes = call('events.create', {
          name: 'SINGLE FULL EVENT',
          type: 'monthly',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          sheetUrl: `https://docs.google.com/spreadsheets/d/${singleSourceId}/edit`,
          formUrl: `https://docs.google.com/forms/d/${formId}/edit`,
          columnMap: { fullName: 1, matric: 2, contact: 3, email: 4, gender: null, nationality: null },
          classIndex: -1,
          styleIds: ['st_popping'],
          styleSlots: { st_popping: 20 },
          sessions: []
        });
        expect(evRes.ok).toBe(true);
        const fullEv = (evRes.data as any).event as EventItem;

        // Trigger initial gating -> 20/20 closes form
        expect(ctx.db.events.get(fullEv.id)!.formClosed).toBe(true);
        expect(form.isAcceptingResponses()).toBe(false);

        // Admin overrides and adds 21st dancer
        ctx.mail.reset();
        const addRes = call('members.add', {
          eventId: fullEv.id,
          fullName: 'Twenty First',
          matricRaw: '23009999',
          contact: '0129998888',
          email: 'd21@test.com',
          styleIds: ['st_popping']
        });

        expect(addRes.ok, JSON.stringify(addRes)).toBe(true);
        const refreshed = ctx.db.events.get(fullEv.id)!;
        expect(refreshed.memberCount).toBe(21);
        expect(refreshed.formClosed).toBe(true);
        expect(refreshed.formClosedReason).toBe('capacity');
        expect(form.isAcceptingResponses()).toBe(false);
        expect(form.getCustomClosedFormMessage()).toBe(FULL_HOUSE_CLOSED_MESSAGE);
        expect(ctx.mail.sent.some(m => m.to === 'd21@test.com' && m.subject.includes('Registration Confirmed'))).toBe(true);
      });

      it('keeps full style choice closed on multi-style Google Form during admin override', () => {
        const formId = 'multi_override_form';
        const form = ctx.form.createForm(formId);
        form.addQuestion({
          id: 'q_cls',
          title: 'Dance Class',
          choices: ['Popping (RM60)', 'Hip Hop (RM60)'],
          helpText: ''
        });
        ctx.form.setLinkedForm(multiSourceId, `https://docs.google.com/forms/d/${formId}/edit`);

        // Cap Popping at 1 (Alice is already in Popping -> 1/1 full!)
        const ev = ctx.db.events.get(multiEvent.id)!;
        call('events.update', {
          id: ev.id,
          version: ev.version,
          formUrl: `https://docs.google.com/forms/d/${formId}/edit`,
          styleSlots: { st_popping: 1, st_hiphop: 10 }
        });
        expect(form.getStyleQuestion()!.choices).toEqual(['Hip Hop (RM60)']);

        // Admin overrides and adds a 2nd dancer into full Popping
        const addRes = call('members.add', {
          eventId: multiEvent.id,
          fullName: 'Override Dancer',
          matricRaw: '22007777',
          styleIds: ['st_popping']
        });

        expect(addRes.ok).toBe(true);
        expect(ctx.db.events.get(multiEvent.id)!.memberCount).toBe(2);
        // Popping stays removed from Google Form choices!
        expect(form.getStyleQuestion()!.choices).toEqual(['Hip Hop (RM60)']);
      });

      it('rejects duplicate matric in the same event or belonging to another dancer in MemberIndex', () => {
        const dupInEvent = call('members.add', {
          eventId: multiEvent.id,
          fullName: 'Alice Clone',
          matricRaw: '22001111',
          styleIds: ['st_hiphop']
        });
        expect(dupInEvent.ok).toBe(false);
        if (!dupInEvent.ok) {
          expect(dupInEvent.error.code).toBe('VALIDATION');
          expect(dupInEvent.error.message).toContain('already registered');
        }

        ctx.db.memberIndex.insert(
          {
            matricKey: '22008888',
            nameKey: 'someone else',
            fullName: 'Someone Else',
            eventIds: ['evt_other'],
            lastEventEnd: '2026-11-30'
          },
          'system',
          ctx.now()
        );
        const dupOtherPerson = call('members.add', {
          eventId: multiEvent.id,
          fullName: 'Impostor',
          matricRaw: '22008888',
          styleIds: ['st_hiphop']
        });
        expect(dupOtherPerson.ok).toBe(false);
        if (!dupOtherPerson.ok) {
          expect(dupOtherPerson.error.code).toBe('VALIDATION');
          expect(dupOtherPerson.error.message).toContain('already belongs to Someone Else');
        }
      });

      it('rejects invalid styleIds, empty name, or invalid matric', () => {
        const emptyName = call('members.add', { eventId: multiEvent.id, fullName: '  ', matricRaw: '22003333', styleIds: ['st_popping'] });
        expect(emptyName.ok).toBe(false);
        if (!emptyName.ok) expect(emptyName.error.message).toContain('Name cannot be empty');

        const badMatric = call('members.add', { eventId: multiEvent.id, fullName: 'Bob', matricRaw: '12', styleIds: ['st_popping'] });
        expect(badMatric.ok).toBe(false);
        if (!badMatric.ok) expect(badMatric.error.message).toContain('valid matric');

        const noStyle = call('members.add', { eventId: multiEvent.id, fullName: 'Bob', matricRaw: '22003333', styleIds: [] });
        expect(noStyle.ok).toBe(false);
        if (!noStyle.ok) expect(noStyle.error.message).toContain('Select at least one');

        const foreignStyle = call('members.add', { eventId: multiEvent.id, fullName: 'Bob', matricRaw: '22003333', styleIds: ['st_locking'] });
        expect(foreignStyle.ok).toBe(false);
        if (!foreignStyle.ok) expect(foreignStyle.error.message).toContain('not part of this event');
      });

      it('initializes default headers on an empty sheet and appends Dance Class column when classIndex < 0 for multi-style events', () => {
        const emptySrcId = seedSourceSheet(ctx, []);
        const ev = seedEvent(ctx, {
          name: 'EMPTY SOURCE MULTI',
          sourceSheetId: emptySrcId,
          sourceTab: 'Form Responses 1',
          classIndex: -1,
          styleIds: ['st_popping', 'st_hiphop']
        });

        const res = call('members.add', {
          eventId: ev.id,
          fullName: 'Fresh Dancer',
          matricRaw: '23001234',
          contact: '0123456789',
          email: 'fresh@test.com',
          styleIds: ['st_hiphop']
        });

        expect(res.ok, JSON.stringify(res)).toBe(true);
        const rows = sourceTab(emptySrcId).getDisplayValues();
        expect(rows[0]).toEqual(['Timestamp', 'Full Name', 'Matric Number', 'Contact Number', 'Email', 'Gender', 'Nationality', 'Dance Class']);
        expect(rows[1][1]).toBe('Fresh Dancer');
        expect(rows[1][7]).toBe('Hip Hop');
        expect(ctx.db.events.get(ev.id)!.classIndex).toBe(7);
        const members = readEventMembers(ctx, ctx.db.events.get(ev.id)!);
        expect(members.map(m => m.styleIds)).toEqual([['st_hiphop']]);
      });

      it('adds dancer to single-style event without a class column without creating a Dance Class column', () => {
        const singleSrcId = seedSourceSheet(ctx, [
          ['Timestamp', 'Full Name', 'Matric Number', 'Contact Number', 'Email'],
          ['2026-10-01 10:00:00', 'First', '23001111', '0123456789', 'first@test.com']
        ]);
        const ev = seedEvent(ctx, {
          name: 'SINGLE NO CLASS COL',
          sourceSheetId: singleSrcId,
          sourceTab: 'Form Responses 1',
          classIndex: -1,
          styleIds: ['st_popping']
        });

        const res = call('members.add', {
          eventId: ev.id,
          fullName: 'Second',
          matricRaw: '23002222',
          contact: '0123456788',
          email: 'second@test.com'
        });
        expect(res.ok, JSON.stringify(res)).toBe(true);
        expect(sourceTab(singleSrcId).getDisplayValues()[0]).toEqual(['Timestamp', 'Full Name', 'Matric Number', 'Contact Number', 'Email']);
        expect(ctx.db.events.get(ev.id)!.classIndex).toBe(-1);
        const members = readEventMembers(ctx, ctx.db.events.get(ev.id)!);
        expect(members.find(m => m.matricKey === '23002222')?.styleIds).toEqual(['st_popping']);
      });
    });

    describe('members.edit with styleIds', () => {
      it('switches a dancer from Popping to Hip Hop, clears Popping attendance (even with ticks), adds to Hip Hop, and updates MemberIndex', () => {
        // Tick Alice present in Popping
        const popSheet = attendanceSheet(multiEvent, 'st_popping');
        const popHeader = popSheet.getDisplayValues()[0];
        const sesCol = popHeader.indexOf(popSessionId);
        const aliceRow = popSheet.getDisplayValues().findIndex(r => r[0] === 'M-22001111');
        popSheet.setValues(aliceRow + 1, sesCol + 1, [['/']]);

        const res = call('members.edit', {
          eventId: multiEvent.id,
          memberId: 'M-22001111',
          styleIds: ['st_hiphop']
        });
        expect(res.ok, JSON.stringify(res)).toBe(true);

        // Response sheet updated using styleFormLabels
        expect(sourceTab(multiSourceId).getDisplayValues()[1][5]).toBe('Hip Hop (RM60)');

        // Popping Attendance sheet cleared of Alice (despite '/' tick)
        expect(popSheet.getDisplayValues().slice(2).filter(r => r[0])).toEqual([]);

        // Hip Hop Attendance sheet now has Alice
        const hhRows = attendanceSheet(multiEvent, 'st_hiphop').getDisplayValues().slice(2).filter(r => r[0]);
        expect(hhRows.map(r => r[0])).toEqual(['M-22001111']);

        // attendance.get reflects the change
        const popGrid = call('attendance.get', { eventId: multiEvent.id, styleId: 'st_popping' });
        expect(popGrid.ok && (popGrid.data as any).members).toEqual([]);
        const hhGrid = call('attendance.get', { eventId: multiEvent.id, styleId: 'st_hiphop' });
        expect(hhGrid.ok && (hhGrid.data as any).members.map((m: any) => m.memberId)).toEqual(['M-22001111']);

        // MemberIndex.eventStyles updated
        const mi = ctx.db.memberIndex.find(m => m.matricKey === '22001111' && m.active)[0];
        expect(mi.eventStyles?.[multiEvent.id]).toEqual(['st_hiphop']);
      });

      it('clears duplicate response rows when dropping a style so buildMembers does not re-union the dropped style', () => {
        // Alice submits a 2nd form response adding Hip Hop
        sourceTab(multiSourceId).appendRows([
          ['2026-10-05 12:00:00', 'Alice Tan', '22001111', '0123456789', 'alice@test.com', 'Hip Hop']
        ]);
        importEventMembers(ctx, ctx.db.events.get(multiEvent.id)!, { full: true });
        expect(readEventMembers(ctx, ctx.db.events.get(multiEvent.id)!)[0].styleIds.sort()).toEqual(['st_hiphop', 'st_popping']);

        // Admin drops Popping, keeping only Hip Hop
        const res = call('members.edit', {
          eventId: multiEvent.id,
          memberId: 'M-22001111',
          fullName: 'Alice Tan Updated',
          styleIds: ['st_hiphop']
        });
        expect(res.ok, JSON.stringify(res)).toBe(true);

        // Primary row updated and duplicate row cleared
        const rows = sourceTab(multiSourceId).getDisplayValues();
        const nonEmptyDataRows = rows.slice(1).filter(r => r.some(c => c.trim() !== ''));
        expect(nonEmptyDataRows).toHaveLength(1);
        expect(nonEmptyDataRows[0][1]).toBe('Alice Tan Updated');
        expect(nonEmptyDataRows[0][5]).toBe('Hip Hop (RM60)');

        const aliceAfter = readEventMembers(ctx, ctx.db.events.get(multiEvent.id)!)[0];
        expect(aliceAfter.styleIds).toEqual(['st_hiphop']);
        expect(aliceAfter.fullName).toBe('Alice Tan Updated');
      });

      it('removes the dancer completely when styleIds is passed as []', () => {
        const res = call('members.edit', {
          eventId: multiEvent.id,
          memberId: 'M-22001111',
          styleIds: []
        });
        expect(res.ok, JSON.stringify(res)).toBe(true);
        if (res.ok) {
          expect((res.data as any).removed).toBe(true);
        }
        expect(readEventMembers(ctx, ctx.db.events.get(multiEvent.id)!)).toEqual([]);
        expect(attendanceSheet(multiEvent, 'st_popping').getDisplayValues().slice(2).filter(r => r[0])).toEqual([]);
        const mi = ctx.db.memberIndex.find(m => m.matricKey === '22001111')[0];
        expect(mi.active).toBe(false);
        expect(mi.eventIds).toEqual([]);
      });
    });

    describe('members.remove', () => {
      it('removes all response rows, purges Members and Attendance (even with ticks), and deactivates MemberIndex when 0 events remain', () => {
        // Add duplicate row and an attendance tick
        sourceTab(multiSourceId).appendRows([
          ['2026-10-05 12:00:00', 'Alice Tan', '22001111', '0123456789', 'alice@test.com', 'Hip Hop']
        ]);
        importEventMembers(ctx, ctx.db.events.get(multiEvent.id)!, { full: true });
        const popSheet = attendanceSheet(multiEvent, 'st_popping');
        const sesCol = popSheet.getDisplayValues()[0].indexOf(popSessionId);
        popSheet.setValues(3, sesCol + 1, [['/']]);

        const miBefore = ctx.db.memberIndex.find(m => m.matricKey === '22001111' && m.active)[0];
        ctx.cache.put('mi:22001111', JSON.stringify(miBefore), 600);
        ctx.cache.put('mi:' + miBefore.id, JSON.stringify(miBefore), 600);

        const res = call('members.remove', { eventId: multiEvent.id, memberId: 'M-22001111' });
        expect(res.ok, JSON.stringify(res)).toBe(true);
        if (res.ok) {
          expect((res.data as any).removed).toBe(true);
        }

        // Source sheet rows cleared
        const nonEmptySource = sourceTab(multiSourceId).getDisplayValues().slice(1).filter(r => r.some(c => c.trim() !== ''));
        expect(nonEmptySource).toEqual([]);

        // Members & Attendance sheets empty
        expect(readEventMembers(ctx, ctx.db.events.get(multiEvent.id)!)).toEqual([]);
        expect(popSheet.getDisplayValues().slice(2).filter(r => r[0])).toEqual([]);
        expect(attendanceSheet(multiEvent, 'st_hiphop').getDisplayValues().slice(2).filter(r => r[0])).toEqual([]);

        // MemberIndex deactivated & caches cleared
        const miAfter = ctx.db.memberIndex.get(miBefore.id)!;
        expect(miAfter.active).toBe(false);
        expect(miAfter.eventIds).toEqual([]);
        expect(ctx.cache.get('mi:22001111')).toBeNull();
        expect(ctx.cache.get('mi:' + miBefore.id)).toBeNull();
      });

      it('preserves other events in MemberIndex when dancer is still enrolled elsewhere', () => {
        const otherSourceId = seedSourceSheet(ctx, [
          HEADERS,
          ['2026-10-02 10:00:00', 'Alice Tan', '22001111', '0123456789', 'alice@test.com', 'Hip Hop']
        ]);
        const otherRes = call('events.create', {
          name: 'OTHER EVENT',
          type: 'monthly',
          startDate: '2026-11-01',
          endDate: '2026-11-30',
          sheetUrl: `https://docs.google.com/spreadsheets/d/${otherSourceId}/edit`,
          columnMap: { fullName: 1, matric: 2, contact: 3, email: 4, gender: null, nationality: null },
          classIndex: 5,
          styleIds: ['st_hiphop'],
          sessions: []
        });
        expect(otherRes.ok).toBe(true);
        const otherEvent = (otherRes.data as any).event as EventItem;

        const res = call('members.remove', { eventId: multiEvent.id, memberId: 'M-22001111' });
        expect(res.ok).toBe(true);

        const mi = ctx.db.memberIndex.find(m => m.matricKey === '22001111' && m.active)[0];
        expect(mi).toBeTruthy();
        expect(mi.active).toBe(true);
        expect(mi.eventIds).toEqual([otherEvent.id]);
        expect(mi.eventStyles?.[multiEvent.id]).toBeUndefined();
        expect(mi.eventStyles?.[otherEvent.id]).toEqual(['st_hiphop']);
      });
    });

    describe('dancerStylesInEvent cleanup', () => {
      it('ignores members flagged as removed-from-form', () => {
        const ev = seedEvent(ctx, {
          styleIds: ['st_popping'],
          members: [
            { matricKey: '22009999', fullName: 'Removed Dancer', styleIds: ['st_popping'], styleNames: ['Popping'], flags: ['removed-from-form'] }
          ]
        });
        expect(dancerStylesInEvent(ctx, ev, '22009999')).toEqual([]);
      });
    });
  });
});

