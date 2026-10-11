import { describe, it, expect, beforeEach } from 'vitest';
import { makeCtx } from '../fakes/makeCtx';
import { FakeDrive } from '../fakes/fakeDrive';
import { seedEvent, seedSourceSheet } from '../fixtures/events';
import { ensureEventSheets, moveEventFolders, moveStyleVideoFoldersIntoYears } from '../../src/features/eventSheets';
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

    const year = drive.findChildFolder(master, '2026')!;
    expect(year).toBeTruthy();
    const folder = drive.findChildFolder(year, 'OCT MONTHLY CLASS');
    expect(folder).toBeTruthy();
    expect(sheets).toEqual([{ styleId: 'st_popping', spreadsheetId: stray.id }]);
    expect(drive.parentOf(stray.id)).toBe(folder);
  });

  describe('moveEventFolders', () => {
    let masterA: string;
    const children = (parent: string, name: string) =>
      [...(drive as any).items.values()].filter((i: any) => i.parentId === parent && i.name === name);
    const year2026 = (master: string) => drive.findChildFolder(master, '2026');

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
      expect(drive.parentOf(e1.folderId)).toBe(year2026(masterB));
      expect(drive.parentOf(e2.folderId)).toBe(year2026(masterB));
      expect(children(year2026(masterB)!, 'OCT MONTHLY CLASS').length).toBe(1);
      expect(ctx.db.events.get(e1.id)!.folderId).toBe(e1.folderId);
    });

    it('master re-pointed to a folder already holding the event folder reuses it (Review Focus 5)', () => {
      const e1 = eventWithSheets('OCT MONTHLY CLASS');
      const masterB = drive.createFolder('root', 'Attendance B');
      const already = drive.createFolder(drive.createFolder(masterB, '2026'), 'OCT MONTHLY CLASS');

      const result = moveEventFolders(ctx, 'attendance', masterB);

      expect(result).toEqual({ moved: 0, created: 0, reused: 1, failed: [] });
      expect(drive.findChildFolder(year2026(masterB)!, 'OCT MONTHLY CLASS')).toBe(already);
      expect(children(year2026(masterB)!, 'OCT MONTHLY CLASS').length).toBe(1);
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
      expect(drive.parentOf(updated.folderId)).toBe(year2026(masterB));
      expect(drive.parentOf(updated.membersSpreadsheetId)).toBe(updated.folderId);
    });

    it('an event folder moved to the Drive bin counts as missing and is not reused (review #6)', () => {
      const e1 = eventWithSheets('OCT MONTHLY CLASS');
      drive.trash(e1.folderId);

      expect(drive.info(e1.folderId).exists).toBe(false);
      expect(drive.findChildFolder(year2026(masterA)!, 'OCT MONTHLY CLASS')).toBeNull();

      ensureEventSheets(ctx, ctx.db.events.get(e1.id)!);
      const updated = ctx.db.events.get(e1.id)!;
      expect(updated.folderId).not.toBe(e1.folderId);
      expect(drive.parentOf(updated.folderId)).toBe(year2026(masterA));
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
      expect(drive.parentOf(withVideo.videoFolderId)).toBe(year2026(videoB));
    });

    it('an older event folder straight under the master is filed into its year folder', () => {
      const e1 = eventWithSheets('OCT MONTHLY CLASS');
      drive.moveFolder(e1.folderId, masterA);

      const result = moveEventFolders(ctx, 'attendance', masterA);

      expect(result).toEqual({ moved: 1, created: 0, reused: 0, failed: [] });
      expect(drive.parentOf(e1.folderId)).toBe(year2026(masterA));
      expect(drive.findChildFolder(masterA, 'OCT MONTHLY CLASS')).toBeNull();
    });

    it('an un-yeared folder of the same name in the new master is reused and filed into its year', () => {
      const e1 = eventWithSheets('OCT MONTHLY CLASS');
      const masterB = drive.createFolder('root', 'Attendance B');
      const older = drive.createFolder(masterB, 'OCT MONTHLY CLASS');

      const result = moveEventFolders(ctx, 'attendance', masterB);

      expect(result).toEqual({ moved: 0, created: 0, reused: 1, failed: [] });
      expect(drive.parentOf(older)).toBe(year2026(masterB));
      expect(ctx.db.events.get(e1.id)!.folderId).toBe(older);
    });

    it('events are filed by the year they start in', () => {
      const e1 = seedEvent(ctx, { name: 'DEC WORKSHOP', startDate: '2026-12-20', endDate: '2027-01-10', styleIds: ['st_popping'] });
      const e2 = seedEvent(ctx, { name: 'FEB MONTHLY CLASS', startDate: '2027-02-01', endDate: '2027-02-28', styleIds: ['st_popping'] });
      ensureEventSheets(ctx, e1);
      ensureEventSheets(ctx, e2);

      expect(drive.parentOf(ctx.db.events.get(e1.id)!.folderId)).toBe(drive.findChildFolder(masterA, '2026'));
      expect(drive.parentOf(ctx.db.events.get(e2.id)!.folderId)).toBe(drive.findChildFolder(masterA, '2027'));
      expect(children(masterA, '2027').length).toBe(1);
    });
  });

  describe('moveStyleVideoFoldersIntoYears', () => {
    let styleFolder: string;
    beforeEach(() => {
      styleFolder = drive.createFolder('root', 'Popping videos');
      const style = ctx.db.styles.find(s => s.id === 'st_popping')[0];
      ctx.db.styles.update(style.id, style.version, { videoFolderId: styleFolder }, 'system', ctx.now());
    });

    it('moves each style event folder into its existing year folder and reports folders it cannot move', () => {
      const year = drive.createFolder(styleFolder, '2026');
      seedEvent(ctx, { name: 'OCT MONTHLY CLASS' });
      seedEvent(ctx, { name: 'TRIAL CLASS' });
      const oct = drive.createFolder(styleFolder, 'OCT MONTHLY CLASS');
      const trial = drive.createFolder(styleFolder, 'TRIAL CLASS');
      drive.failMovesFor.add(trial);

      const result = moveStyleVideoFoldersIntoYears(ctx);

      expect(result.moved).toBe(1);
      expect(result.failed).toEqual([
        { styleName: 'Popping', eventName: 'TRIAL CLASS', message: 'Access denied: cannot move this folder' }
      ]);
      expect(drive.parentOf(oct)).toBe(year);
      expect(drive.parentOf(trial)).toBe(styleFolder);

      drive.failMovesFor.delete(trial);
      expect(moveStyleVideoFoldersIntoYears(ctx)).toEqual({ moved: 1, waiting: 0, failed: [] });
      expect(drive.parentOf(trial)).toBe(year);
    });

    it('never creates a year folder in a class lead folder: the website must, or its uploads cannot see it', () => {
      seedEvent(ctx, { name: 'OCT MONTHLY CLASS' });
      const oct = drive.createFolder(styleFolder, 'OCT MONTHLY CLASS');

      expect(moveStyleVideoFoldersIntoYears(ctx)).toEqual({ moved: 0, waiting: 1, failed: [] });
      expect(drive.findChildFolder(styleFolder, '2026')).toBeNull();
      expect(drive.parentOf(oct)).toBe(styleFolder);
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
