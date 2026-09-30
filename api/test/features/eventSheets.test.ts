import { describe, it, expect, beforeEach } from 'vitest';
import { makeCtx } from '../fakes/makeCtx';
import { FakeDrive } from '../fakes/fakeDrive';
import { seedEvent, seedSourceSheet } from '../fixtures/events';
import { ensureEventSheets } from '../../src/features/eventSheets';
import { previewSource } from '../../src/features/eventSource';

describe('event sheets and source', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let drive: FakeDrive;

  beforeEach(() => {
    drive = new FakeDrive();
    ctx = makeCtx({ drive });
    ctx.db.styles.insert(
      { id: 'st_popping', name: 'Popping', aliases: ['popping'], colorKey: 'blue', defaultWeekday: null, defaultStart: '20:00',
        defaultEnd: '22:00', defaultInstructorId: '', defaultVenue: '', attendanceFolderId: '', videoFolderId: '' } as any,
      'system',
      ctx.now()
    );
  });

  it('no master folder → VALIDATION message', () => {
    const event = seedEvent(ctx, { styleIds: ['st_popping'] });
    expect(() => ensureEventSheets(ctx, event)).toThrow('Set the attendance master folder on the Events page first');
  });

  it('existing sheet outside the event folder is moved in', () => {
    const master = drive.createFolder('root', 'Attendance');
    ctx.db.settings.insert({ key: 'defaultAttendanceFolderId', value: master }, 'system', ctx.now());
    const event = seedEvent(ctx, { name: 'OCT MONTHLY CLASS', styleIds: ['st_popping'] });
    const stray = drive.createSpreadsheet('Popping Attendance', 'root');
    stray.addSheet('Attendance', ['memberId', 'fullName', 'matric', 'contact', 'gender', 'nationality']);
    stray.sheet('Attendance')!.appendRows([['Full Name', '', '', '', '', '']]);
    ctx.db.attendanceSheets.insert({ eventId: event.id, styleId: 'st_popping', spreadsheetId: stray.id }, 'system', ctx.now());

    const sheets = ensureEventSheets(ctx, event);

    const folder = drive.findChildFolder(master, 'OCT MONTHLY CLASS');
    expect(folder).toBeTruthy();
    expect(sheets).toEqual([{ styleId: 'st_popping', spreadsheetId: stray.id }]);
    expect(drive.parentOf(stray.id)).toBe(folder);
  });

  it('preview reads display values: matric shows 22003949 not 2.2003949E7', () => {
    const sourceId = seedSourceSheet(ctx, [
      ['Timestamp', 'Full Name', 'Matric Number\n17XXXXXX OR U20XXXXX', 'Classes'],
      ['2026-10-01', 'Ali', '22003949', 'Popping (RM60/month), Waacking']
    ]);

    const preview = previewSource(ctx, `https://docs.google.com/spreadsheets/d/${sourceId}/edit`);

    expect(preview.sampleNames).toEqual(['Ali']);
    expect(preview.rowCount).toBe(1);
    expect(preview.sourceTab).toBe('Form Responses 1');
    expect(preview.detectedStyleIds).toEqual(['st_popping']);
    expect(preview.unknownClasses).toEqual([{ token: 'Waacking', count: 1 }]);
  });

  it('preview of an unshared sheet → LINK_NO_ACCESS naming the club Gmail', () => {
    expect(() => previewSource(ctx, 'https://docs.google.com/spreadsheets/d/1unsharedSheetId1234567890abc/edit'))
      .toThrow(/umdancesportc@gmail.com/);
  });
});
