import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { Hmac, signToken } from '../../src/security/tokens';
import { getVideoRoutes } from '../../src/features/videos';
import { seedEvent } from '../fixtures/events';
import { EventItem } from '@umdsc/shared';
import { getSessionRoutes } from '../../src/features/sessions';

const nodeHmac: Hmac = (key: string, message: string) => {
  return new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
};

const secrets = {
  tokenSecret: 'test_secret_key_123456789012345678901234567890',
  hmac: nodeHmac
};

describe('Feature: Videos (features/videos)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let adminToken: string;
  let dancerToken: string;
  let session1: any;
  let session2: any;
  let event: EventItem;

  beforeEach(() => {
    ctx = makeCtx();
    registerRoutes(getVideoRoutes());
    registerRoutes(getSessionRoutes());

    adminToken = signToken(
      {
        sub: 'admin1',
        role: 'admin',
        name: 'Admin One',
        exp: Math.floor(ctx.now().getTime() / 1000) + 3600,
        pv: 1,
        perms: {
          'videos.view': '*',
          'videos.upload': '*',
          'videos.edit': '*',
          'sessions.edit': '*'
        }
      },
      secrets.tokenSecret,
      secrets.hmac
    );

    dancerToken = signToken(
      {
        sub: 'M-22001111',
        role: 'dancer',
        name: 'Popper Ali',
        exp: Math.floor(ctx.now().getTime() / 1000) + 3600,
        pv: 1,
        perms: {
          'videos.view': ['st_popping']
        }
      },
      secrets.tokenSecret,
      secrets.hmac
    );

    // Seed style
    ctx.db.styles.insert(
      {
        id: 'st_popping',
        name: 'Popping',
        aliases: ['popping'],
        colorKey: 'blue',
        defaultWeekday: 2,
        defaultStart: '20:00',
        defaultEnd: '22:00',
        defaultInstructorId: '',
        defaultVenue: 'Studio A',
        attendanceFolderId: 'fld_att_12345678901234567890',
        videoFolderId: 'fld_popping_drive'
      },
      'system',
      ctx.now()
    );

    ctx.db.settings.insert({ key: 'defaultVideoFolderId', value: 'fld_video_master' }, 'system', ctx.now());
    event = seedEvent(ctx, { name: 'OCT MONTHLY CLASS', styleIds: ['st_popping'], videoFolderId: 'fld_vid_12345678901234567890' });

    // Create session 1: 2026-10-06 (seq 1)
    session1 = ctx.db.sessions.insert(
      {
        eventId: event.id,
        styleId: 'st_popping',
        seq: 1,
        date: '2026-10-06',
        start: '20:00',
        end: '22:00',
        instructorId: '',
        venue: 'Studio A',
        status: 'scheduled',
        note: ''
      },
      'system',
      ctx.now()
    );

    // Create session 2: 2026-10-13 (seq 2)
    session2 = ctx.db.sessions.insert(
      {
        eventId: event.id,
        styleId: 'st_popping',
        seq: 2,
        date: '2026-10-13',
        start: '20:00',
        end: '22:00',
        instructorId: '',
        venue: 'Studio A',
        status: 'scheduled',
        note: ''
      },
      'system',
      ctx.now()
    );
  });

  it('videos.targetFolder returns folder path info for upload', () => {
    const res = handleRequest(
      {
        action: 'videos.targetFolder',
        token: adminToken,
        payload: { sessionId: session1.id }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({
        videoMasterFolderId: 'fld_popping_drive',
        eventFolderId: '',
        eventFolderName: 'OCT MONTHLY CLASS',
        classFolderName: '2026-10-06 Popping Class 1',
        musicFolderName: 'Music'
      });
    }
  });

  it('targetFolder throws VALIDATION when style.videoFolderId is missing', () => {
    const poppingStyle = ctx.db.styles.find(s => s.id === 'st_popping' && s.active)[0];
    ctx.db.styles.update(poppingStyle.id, poppingStyle.version, { videoFolderId: '' }, 'admin', ctx.now());

    const res = handleRequest(
      {
        action: 'videos.targetFolder',
        token: adminToken,
        payload: { sessionId: session1.id }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('VALIDATION');
      expect(res.error.message).toContain('Class lead video folder link not inserted for Popping. Insert it on the Media page first.');
    }
  });

  it('targetFolder isolates uploads of two styles in the same event into their own style folders', () => {
    // Style 1 (Popping): fld_popping_drive with child event folder fld_popping_oct
    (ctx.drive as any).items.set('fld_popping_oct', {
      id: 'fld_popping_oct',
      kind: 'folder',
      name: 'OCT MONTHLY CLASS',
      parentId: 'fld_popping_drive',
      canEdit: true
    });

    // Style 2 (Locking): fld_locking_drive with child event folder fld_locking_oct
    ctx.db.styles.insert(
      {
        id: 'st_locking',
        name: 'Locking',
        aliases: ['locking'],
        colorKey: 'yellow',
        defaultWeekday: 4,
        defaultStart: '20:00',
        defaultEnd: '22:00',
        defaultInstructorId: '',
        defaultVenue: 'Studio B',
        attendanceFolderId: 'fld_att_locking',
        videoFolderId: 'fld_locking_drive'
      },
      'system',
      ctx.now()
    );
    (ctx.drive as any).items.set('fld_locking_oct', {
      id: 'fld_locking_oct',
      kind: 'folder',
      name: 'OCT MONTHLY CLASS',
      parentId: 'fld_locking_drive',
      canEdit: true
    });

    const lockingSession = ctx.db.sessions.insert(
      {
        eventId: event.id,
        styleId: 'st_locking',
        seq: 1,
        date: '2026-10-08',
        start: '20:00',
        end: '22:00',
        instructorId: '',
        venue: 'Studio B',
        status: 'scheduled',
        note: ''
      },
      'system',
      ctx.now()
    );

    const resPopping = handleRequest(
      {
        action: 'videos.targetFolder',
        token: adminToken,
        payload: { sessionId: session1.id }
      },
      ctx,
      secrets
    );
    const resLocking = handleRequest(
      {
        action: 'videos.targetFolder',
        token: adminToken,
        payload: { sessionId: lockingSession.id }
      },
      ctx,
      secrets
    );

    expect(resPopping.ok).toBe(true);
    expect(resLocking.ok).toBe(true);
    if (resPopping.ok && resLocking.ok) {
      expect((resPopping.data as any).videoMasterFolderId).toBe('fld_popping_drive');
      expect((resPopping.data as any).eventFolderId).toBe('fld_popping_oct');

      expect((resLocking.data as any).videoMasterFolderId).toBe('fld_locking_drive');
      expect((resLocking.data as any).eventFolderId).toBe('fld_locking_oct');

      // Neither uses event.videoFolderId
      expect((resPopping.data as any).eventFolderId).not.toBe(event.videoFolderId);
      expect((resLocking.data as any).eventFolderId).not.toBe(event.videoFolderId);
    }
  });

  it('register on a file the club cannot read → LINK_NO_ACCESS', () => {
    const res = handleRequest(
      {
        action: 'videos.register',
        token: adminToken,
        payload: {
          driveFileId: 'unshared_file_id_1234567890123456',
          sessionId: session1.id,
          title: 'Class 1 Routine'
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('LINK_NO_ACCESS');
      expect(res.error.message).toContain(ctx.clubEmail);
    }
  });

  it('register success saves video row and makes it viewable in list', () => {
    // Add file to fake drive
    (ctx.drive as any).items.set('file_vid_1234567890123456', {
      id: 'file_vid_1234567890123456',
      kind: 'file',
      name: 'Class 1 Routine.mp4',
      canEdit: true,
      mimeType: 'video/mp4',
      sizeBytes: 10485760
    });

    const regRes = handleRequest(
      {
        action: 'videos.register',
        token: adminToken,
        payload: {
          driveFileId: 'file_vid_1234567890123456',
          sessionId: session1.id,
          title: 'Class 1 Routine'
        }
      },
      ctx,
      secrets
    );

    expect(regRes.ok).toBe(true);

    const listRes = handleRequest(
      {
        action: 'videos.list',
        token: adminToken,
        payload: { eventId: event.id, styleId: 'st_popping' }
      },
      ctx,
      secrets
    );

    expect(listRes.ok).toBe(true);
    if (listRes.ok) {
      const list = listRes.data as any[];
      expect(list.length).toBe(1);
      expect(list[0].title).toBe('Class 1 Routine');
      expect(list[0].sessionId).toBe(session1.id);
    }
  });

  it('register does not overwrite event.videoFolderId', () => {
    const e2 = seedEvent(ctx, { name: 'TRIAL', styleIds: ['st_popping'] });
    const s2 = ctx.db.sessions.insert(
      { eventId: e2.id, styleId: 'st_popping', seq: 1, date: '2026-10-07', start: '20:00', end: '22:00', instructorId: '', venue: '', status: 'scheduled', note: '' },
      'system',
      ctx.now()
    );
    (ctx.drive as any).items.set('file_new_1234567890123456', {
      id: 'file_new_1234567890123456', kind: 'file', name: 'a.mp4', canEdit: true, mimeType: 'video/mp4', sizeBytes: 1
    });

    const res = handleRequest(
      {
        action: 'videos.register',
        token: adminToken,
        payload: { driveFileId: 'file_new_1234567890123456', sessionId: s2.id, title: 'A', eventFolderId: 'fld_trial_video' }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) expect((res.data as any).eventId).toBe(e2.id);
    expect(ctx.db.events.get(e2.id)!.videoFolderId).toBe('');
  });

  it('scan suggests session by filename date, else by parent class-folder name, else by createdTime date', () => {
    const rootFolderId = 'fld_scan_event_folder';
    (ctx.drive as any).items.set(rootFolderId, {
      id: rootFolderId,
      kind: 'folder',
      name: 'OCT MONTHLY CLASS',
      parentId: 'fld_popping_drive',
      canEdit: true
    });
    const subFolderId = 'fld_sub_12345678901234567890';

    // Folder for session 2
    (ctx.drive as any).items.set(subFolderId, {
      id: subFolderId,
      kind: 'folder',
      name: '2026-10-13 Popping Class 2',
      parentId: rootFolderId,
      canEdit: true
    });

    // File 1: filename matches session 1 date (2026-10-06)
    (ctx.drive as any).items.set('file_f1_1234567890123456', {
      id: 'file_f1_1234567890123456',
      kind: 'file',
      name: '2026-10-06 Popping.mp4',
      parentId: rootFolderId,
      canEdit: true,
      mimeType: 'video/mp4',
      sizeBytes: 5000000,
      createdTime: '2026-10-20T10:00:00Z'
    });

    // File 2: no date in filename, but parent folder has session 2 date (2026-10-13)
    (ctx.drive as any).items.set('file_f2_1234567890123456', {
      id: 'file_f2_1234567890123456',
      kind: 'file',
      name: 'routine_take2.mp4',
      parentId: subFolderId,
      canEdit: true,
      mimeType: 'video/mp4',
      sizeBytes: 6000000,
      createdTime: '2026-10-20T10:00:00Z'
    });

    // File 3: no date in filename or parent, but createdTime is 2026-10-06
    (ctx.drive as any).items.set('file_f3_1234567890123456', {
      id: 'file_f3_1234567890123456',
      kind: 'file',
      name: 'random_video.mp4',
      parentId: rootFolderId,
      canEdit: true,
      mimeType: 'video/mp4',
      sizeBytes: 7000000,
      createdTime: '2026-10-06T21:30:00Z'
    });

    const res = handleRequest(
      {
        action: 'videos.scan',
        token: adminToken,
        payload: { styleId: 'st_popping', eventId: event.id }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const items = res.data as any[];
      const f1 = items.find(i => i.fileId === 'file_f1_1234567890123456');
      const f2 = items.find(i => i.fileId === 'file_f2_1234567890123456');
      const f3 = items.find(i => i.fileId === 'file_f3_1234567890123456');

      expect(f1?.suggestedSessionId).toBe(session1.id);
      expect(f1?.reason).toBe('filename date');

      expect(f2?.suggestedSessionId).toBe(session2.id);
      expect(f2?.reason).toBe('parent folder date');

      expect(f3?.suggestedSessionId).toBe(session1.id);
      expect(f3?.reason).toBe('created date');
    }
  });

  it('scan returns empty if style.videoFolderId is not set or event folder is missing', () => {
    const poppingStyle = ctx.db.styles.find(s => s.id === 'st_popping' && s.active)[0];
    ctx.db.styles.update(poppingStyle.id, poppingStyle.version, { videoFolderId: '' }, 'admin', ctx.now());

    const res = handleRequest(
      {
        action: 'videos.scan',
        token: adminToken,
        payload: { styleId: 'st_popping', eventId: event.id }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual([]);
    }
  });

  it('scan excludes files already in Videos', () => {
    const rootFolderId = 'fld_scan_event_folder_2';
    (ctx.drive as any).items.set(rootFolderId, {
      id: rootFolderId,
      kind: 'folder',
      name: 'OCT MONTHLY CLASS',
      parentId: 'fld_popping_drive',
      canEdit: true
    });
    (ctx.drive as any).items.set('file_reg_1234567890123456', {
      id: 'file_reg_1234567890123456',
      kind: 'file',
      name: 'already_registered.mp4',
      parentId: rootFolderId,
      canEdit: true,
      mimeType: 'video/mp4',
      sizeBytes: 5000000,
      createdTime: '2026-10-06T10:00:00Z'
    });

    // Register it
    ctx.db.videos.insert(
      {
        styleId: 'st_popping',
        eventId: event.id,
        sessionId: session1.id,
        title: 'Already Registered',
        driveFileId: 'file_reg_1234567890123456',
        mimeType: 'video/mp4',
        sizeBytes: 5000000,
        folderId: rootFolderId,
        uploadedBy: 'admin1',
        source: 'upload'
      },
      'admin1',
      ctx.now()
    );

    const res = handleRequest(
      {
        action: 'videos.scan',
        token: adminToken,
        payload: { styleId: 'st_popping', eventId: event.id }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const items = res.data as any[];
      expect(items.find(i => i.fileId === 'file_reg_1234567890123456')).toBeUndefined();
    }
  });
});
