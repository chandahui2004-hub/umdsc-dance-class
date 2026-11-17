import { describe, it, expect, beforeEach } from 'vitest';
import { makeCtx } from '../fakes/makeCtx';
import { FakeDrive } from '../fakes/fakeDrive';
import { seedEvent, seedSourceSheet } from '../fixtures/events';
import { getEventRoutes } from '../../src/features/events';

const HEADERS = ['Timestamp', 'Full Name', 'Matric Number', 'Contact Number', 'Email', 'Classes'];

describe('Permanent Event Deletion (events.delete)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let drive: FakeDrive;

  beforeEach(() => {
    drive = new FakeDrive();
    ctx = makeCtx({ drive });
  });

  it('permanently deletes an event, cleaning up sessions, sheets, drive folders and member index links', () => {
    const routes = getEventRoutes();
    const sourceId = seedSourceSheet(ctx, [HEADERS]);

    // Create a style
    const style = ctx.db.styles.insert({
      id: 'st_hiphop',
      name: 'Hip Hop',
      aliases: ['hiphop'],
      active: true
    } as any, 'system', ctx.now());

    // Create an event
    const folder = drive.createFolder('root', 'Test Event Folder');
    const videoFolder = drive.createFolder('root', 'Test Event Video Folder');
    const event = seedEvent(ctx, {
      name: 'EVENT TO DELETE',
      sourceSheetId: sourceId,
      styleIds: [style.id],
      folderId: folder,
      videoFolderId: videoFolder
    });

    // Create a session
    const session = ctx.db.sessions.insert({
      eventId: event.id,
      styleId: style.id,
      seq: 1,
      date: '2026-10-15',
      start: '20:00',
      end: '22:00',
      instructorId: 'inst_1',
      venue: 'Gym',
      status: 'scheduled',
      note: ''
    }, 'system', ctx.now());

    // Create an attendance sheet
    const attSheetFile = drive.createSpreadsheet('Attendance Sheet', folder);
    const attSheet = ctx.db.attendanceSheets.insert({
      eventId: event.id,
      styleId: style.id,
      spreadsheetId: attSheetFile.id
    }, 'system', ctx.now());

    // Create a member in memberIndex linked to this event
    const member = ctx.db.memberIndex.insert({
      matricKey: '23001001',
      nameKey: 'alice tan',
      fullName: 'Alice Tan',
      eventIds: [event.id, 'other_event_id'],
      lastEventEnd: '2026-10-31',
      eventStyles: {}
    }, 'system', ctx.now());

    // Call events.delete route
    const res = routes['events.delete'].handler(ctx, { claims: { sub: 'admin1' } }, {
      id: event.id
    });

    expect(res.success).toBe(true);

    // 1. Event should be deactivated
    const activeEvents = ctx.db.events.find(e => e.id === event.id && e.active);
    expect(activeEvents.length).toBe(0);

    // 2. Sessions should be deactivated
    const activeSessions = ctx.db.sessions.find(s => s.eventId === event.id && s.active);
    expect(activeSessions.length).toBe(0);

    // 3. Attendance sheets should be deactivated
    const activeSheets = ctx.db.attendanceSheets.find(a => a.eventId === event.id && a.active);
    expect(activeSheets.length).toBe(0);

    // 4. MemberIndex should have event.id removed
    const updatedMember = ctx.db.memberIndex.get(member.id)!;
    expect(updatedMember.eventIds).not.toContain(event.id);
    expect(updatedMember.eventIds).toContain('other_event_id');

    // 5. Linked Google Drive folders and files should be trashed / deleted
    expect(drive.info(folder).exists).toBe(false);
    expect(drive.info(videoFolder).exists).toBe(false);
    expect(drive.info(event.membersSpreadsheetId).exists).toBe(false);
    expect(drive.info(attSheetFile.id).exists).toBe(false);
  });

  it('fails with VALIDATION when id is missing', () => {
    const routes = getEventRoutes();
    expect(() => {
      routes['events.delete'].handler(ctx, { claims: { sub: 'admin1' } }, {});
    }).toThrow('id is required');
  });

  it('deactivates MemberIndex, clears eventStyles, and evicts cache when deleted event was the dancer only event', () => {
    const routes = getEventRoutes();
    const sourceId = seedSourceSheet(ctx, [HEADERS]);
    const event = seedEvent(ctx, {
      name: 'ONLY EVENT TO DELETE',
      sourceSheetId: sourceId,
      styleIds: ['st_hiphop']
    });
    const onlyMember = ctx.db.memberIndex.insert({
      matricKey: '23009999',
      nameKey: 'solo dancer',
      fullName: 'Solo Dancer',
      eventIds: [event.id],
      lastEventEnd: '2026-10-31',
      eventStyles: { [event.id]: ['st_hiphop'] }
    }, 'system', ctx.now());
    const multiMember = ctx.db.memberIndex.insert({
      matricKey: '23008888',
      nameKey: 'multi dancer',
      fullName: 'Multi Dancer',
      eventIds: [event.id, 'other_evt'],
      lastEventEnd: '2026-10-31',
      eventStyles: { [event.id]: ['st_hiphop'], other_evt: ['st_popping'] }
    }, 'system', ctx.now());

    ctx.cache.put('mi:23009999', 'cached', 600);
    ctx.cache.put('mi:' + onlyMember.id, 'cached', 600);
    ctx.cache.put('mi:23008888', 'cached', 600);

    const res = routes['events.delete'].handler(ctx, { claims: { sub: 'admin1' } }, { id: event.id });
    expect(res.success).toBe(true);

    const soloAfter = ctx.db.memberIndex.get(onlyMember.id)!;
    expect(soloAfter.active).toBe(false);
    expect(soloAfter.eventIds).toEqual([]);
    expect(soloAfter.eventStyles).toEqual({});
    expect(ctx.cache.get('mi:23009999')).toBeNull();
    expect(ctx.cache.get('mi:' + onlyMember.id)).toBeNull();

    const multiAfter = ctx.db.memberIndex.get(multiMember.id)!;
    expect(multiAfter.active).toBe(true);
    expect(multiAfter.eventIds).toEqual(['other_evt']);
    expect(multiAfter.eventStyles).toEqual({ other_evt: ['st_popping'] });
    expect(ctx.cache.get('mi:23008888')).toBeNull();
  });
});
