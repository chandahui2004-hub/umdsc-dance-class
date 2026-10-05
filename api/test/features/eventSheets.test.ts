import { describe, it, expect, beforeEach } from 'vitest';
import { makeCtx } from '../fakes/makeCtx';
import { FakeDrive } from '../fakes/fakeDrive';
import { seedEvent, seedSourceSheet } from '../fixtures/events';
import { ensureEventSheets, moveEventFolders } from '../../src/features/eventSheets';
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
    expect(() => ensureEventSheets(ctx, event)).toThrow('Set the attendance master folder on the Attendance page first');
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

  describe('moveEventFolders', () => {
    let masterA: string;
    const children = (parent: string, name: string) =>
      [...(drive as any).items.values()].filter((i: any) => i.parentId === parent && i.name === name);

    beforeEach(() => {
      masterA = drive.createFolder('root', 'Attendance A');
      ctx.db.settings.insert({ key: 'defaultAttendanceFolderId', value: masterA }, 'system', ctx.now());
    });

    function eventWithSheets(name: string) {
      const event = seedEvent(ctx, { name, styleIds: ['st_popping'] });
      ensureEventSheets(ctx, event);
      return ctx.db.events.get(event.id)!;
    }

    it('new empty master: event folders are moved, not duplicated', () => {
      const e1 = eventWithSheets('OCT MONTHLY CLASS');
      const e2 = eventWithSheets('TRIAL CLASS');
      const masterB = drive.createFolder('root', 'Attendance B');

      const result = moveEventFolders(ctx, 'attendance', masterB);

      expect(result).toEqual({ moved: 2, created: 0, reused: 0, failed: [] });
      expect(drive.parentOf(e1.folderId)).toBe(masterB);
      expect(drive.parentOf(e2.folderId)).toBe(masterB);
      expect(children(masterB, 'OCT MONTHLY CLASS').length).toBe(1);
      expect(ctx.db.events.get(e1.id)!.folderId).toBe(e1.folderId);
    });

    it('master re-pointed to a folder already holding the event folder reuses it (Review Focus 5)', () => {
      const e1 = eventWithSheets('OCT MONTHLY CLASS');
      const masterB = drive.createFolder('root', 'Attendance B');
      const already = drive.createFolder(masterB, 'OCT MONTHLY CLASS');

      const result = moveEventFolders(ctx, 'attendance', masterB);

      expect(result).toEqual({ moved: 0, created: 0, reused: 1, failed: [] });
      expect(drive.findChildFolder(masterB, 'OCT MONTHLY CLASS')).toBe(already);
      expect(children(masterB, 'OCT MONTHLY CLASS').length).toBe(1);
      const updated = ctx.db.events.get(e1.id)!;
      expect(updated.folderId).toBe(already);
      expect(drive.parentOf(updated.membersSpreadsheetId)).toBe(already);
      for (const a of ctx.db.attendanceSheets.find(x => x.eventId === e1.id)) {
        expect(drive.parentOf(a.spreadsheetId)).toBe(already);
      }
    });

    it('deleted event folder is recreated with its sheets', () => {
      const e1 = eventWithSheets('OCT MONTHLY CLASS');
      (drive as any).items.delete(e1.folderId);
      const masterB = drive.createFolder('root', 'Attendance B');

      const result = moveEventFolders(ctx, 'attendance', masterB);

      expect(result).toEqual({ moved: 0, created: 1, reused: 0, failed: [] });
      const updated = ctx.db.events.get(e1.id)!;
      expect(drive.parentOf(updated.folderId)).toBe(masterB);
      expect(drive.parentOf(updated.membersSpreadsheetId)).toBe(updated.folderId);
    });

    it('an event folder moved to the Drive bin counts as missing and is not reused (review #6)', () => {
      const e1 = eventWithSheets('OCT MONTHLY CLASS');
      drive.trash(e1.folderId);

      expect(drive.info(e1.folderId).exists).toBe(false);
      expect(drive.findChildFolder(masterA, 'OCT MONTHLY CLASS')).toBeNull();

      ensureEventSheets(ctx, ctx.db.events.get(e1.id)!);
      const updated = ctx.db.events.get(e1.id)!;
      expect(updated.folderId).not.toBe(e1.folderId);
      expect(drive.parentOf(updated.folderId)).toBe(masterA);
      for (const a of ctx.db.attendanceSheets.find(x => x.eventId === e1.id)) {
        expect(drive.parentOf(a.spreadsheetId)).toBe(updated.folderId);
      }
    });

    it('video kind skips events without a video folder', () => {
      eventWithSheets('OCT MONTHLY CLASS');
      const withVideo = seedEvent(ctx, { name: 'TRIAL', videoFolderId: drive.createFolder('root', 'TRIAL') });
      const videoB = drive.createFolder('root', 'Videos B');

      const result = moveEventFolders(ctx, 'video', videoB);

      expect(result).toEqual({ moved: 1, created: 0, reused: 0, failed: [] });
      expect(drive.parentOf(withVideo.videoFolderId)).toBe(videoB);
    });
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
