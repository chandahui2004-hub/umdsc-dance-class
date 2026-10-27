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
        yearFolderName: '2026',
        eventFolderInYear: false,
        eventFolderName: 'OCT MONTHLY CLASS',
        classFolderName: '2026-10-06 Popping Class 1',
        musicFolderName: 'Music'
      });
    }
  });

  it('targetFolder finds the event folder inside its year folder before an older one straight under the style folder', () => {
    const drive = ctx.drive as any;
    drive.items.set('fld_popping_drive', { id: 'fld_popping_drive', kind: 'folder', name: 'Popping', canEdit: true });
    drive.createFolder('fld_popping_drive', 'OCT MONTHLY CLASS');
    const yearFolder = drive.createFolder('fld_popping_drive', '2026');
    const inYear = drive.createFolder(yearFolder, 'OCT MONTHLY CLASS');

    const res = handleRequest({ action: 'videos.targetFolder', token: adminToken, payload: { sessionId: session1.id } }, ctx, secrets);

    expect(res.ok && res.data).toMatchObject({ eventFolderId: inYear, eventFolderInYear: true });
  });

  it('targetFolder flags an older event folder straight under the style folder so the website files it under its year', () => {
    const drive = ctx.drive as any;
    drive.items.set('fld_popping_drive', { id: 'fld_popping_drive', kind: 'folder', name: 'Popping', canEdit: true });
    const older = drive.createFolder('fld_popping_drive', 'OCT MONTHLY CLASS');

    const res = handleRequest({ action: 'videos.targetFolder', token: adminToken, payload: { sessionId: session1.id } }, ctx, secrets);

    expect(res.ok && res.data).toMatchObject({ eventFolderId: older, eventFolderInYear: false, yearFolderName: '2026' });
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

  it('registering a Drive file that is already listed returns the listed video instead of a second copy', () => {
    const fileId = 'file_dup_1234567890123456789';
    (ctx.drive as any).items.set(fileId, { id: fileId, kind: 'file', name: 'Recap.mp4', canEdit: true, mimeType: 'video/mp4', sizeBytes: 1000 });
    const register = () =>
      handleRequest({ action: 'videos.register', token: adminToken, payload: { driveFileId: fileId, sessionId: session1.id, title: 'Recap' } }, ctx, secrets);

    const first = register();
    const second = register();

    expect(second.ok && (second.data as any).id).toBe(first.ok && (first.data as any).id);
    expect(ctx.db.videos.find(v => v.driveFileId === fileId && v.active)).toHaveLength(1);
  });

  describe('recap video email notifications on videos.register', () => {
    it('notifies dancers enrolled in the class style by email with portal link', () => {
      // Re-seed event with dancers
      const poppingDancer = {
        memberId: 'm_pop',
        fullName: 'Ali Popping',
        email: 'ali@example.com',
        styleIds: ['st_popping'],
        styleNames: ['Popping']
      };
      const hipHopDancer = {
        memberId: 'm_hip',
        fullName: 'Bala HipHop',
        email: 'bala@example.com',
        styleIds: ['st_hiphop'],
        styleNames: ['Hip Hop']
      };
      const noEmailDancer = {
        memberId: 'm_no_email',
        fullName: 'Charlie NoEmail',
        email: '',
        styleIds: ['st_popping'],
        styleNames: ['Popping']
      };

      const customEvent = seedEvent(ctx, {
        name: 'OCT DANCE',
        styleIds: ['st_popping', 'st_hiphop'],
        members: [poppingDancer, hipHopDancer, noEmailDancer]
      });

      const popSession = ctx.db.sessions.insert(
        {
          eventId: customEvent.id,
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

      const fileId = 'file_recap_email_test_1';
      (ctx.drive as any).items.set(fileId, {
        id: fileId,
        kind: 'file',
        name: 'Popping Recap.mp4',
        canEdit: true,
        mimeType: 'video/mp4',
        sizeBytes: 2000
      });

      ctx.mail.reset();

      const res = handleRequest(
        {
          action: 'videos.register',
          token: adminToken,
          payload: { driveFileId: fileId, sessionId: popSession.id, title: 'Week 1 Popping Recap', notifyDancers: true }
        },
        ctx,
        secrets
      );

      expect(res.ok).toBe(true);
      expect(ctx.mail.sent.length).toBe(1);
      const email = ctx.mail.sent[0];
      expect(email.to).toBe('ali@example.com');
      expect(email.subject).toBe('[UMDSC] Class Recap Video Uploaded - Popping (Class #1 - 2026-10-06)');
      expect(email.body).toContain('Ali Popping');
      expect(email.body).toContain('https://umdsc-dance-class.umdancesportc.workers.dev');
    });

    it('does not send emails when notifyDancers is false', () => {
      const poppingDancer = {
        memberId: 'm_pop2',
        fullName: 'Ali Popping',
        email: 'ali2@example.com',
        styleIds: ['st_popping'],
        styleNames: ['Popping']
      };
      const customEvent = seedEvent(ctx, {
        name: 'OCT DANCE',
        styleIds: ['st_popping'],
        members: [poppingDancer]
      });
      const popSession = ctx.db.sessions.insert(
        {
          eventId: customEvent.id,
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

      const fileId = 'file_recap_email_test_2';
      (ctx.drive as any).items.set(fileId, {
        id: fileId,
        kind: 'file',
        name: 'Popping Recap 2.mp4',
        canEdit: true,
        mimeType: 'video/mp4',
        sizeBytes: 2000
      });

      ctx.mail.reset();

      const res = handleRequest(
        {
          action: 'videos.register',
          token: adminToken,
          payload: { driveFileId: fileId, sessionId: popSession.id, title: 'Week 2 Popping Recap', notifyDancers: false }
        },
        ctx,
        secrets
      );

      expect(res.ok).toBe(true);
      expect(ctx.mail.sent.length).toBe(0);
    });
  });

  describe('recap video batch email notifications on videos.notifyBatch', () => {
    it('sends a singular email when videoCount is 1', () => {
      const poppingDancer = {
        memberId: 'm_pop_batch_1',
        fullName: 'Ali Popping',
        email: 'ali_batch1@example.com',
        styleIds: ['st_popping'],
        styleNames: ['Popping']
      };
      const customEvent = seedEvent(ctx, {
        name: 'OCT DANCE BATCH',
        styleIds: ['st_popping'],
        members: [poppingDancer]
      });
      const popSession = ctx.db.sessions.insert(
        {
          eventId: customEvent.id,
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

      ctx.mail.reset();

      const res = handleRequest(
        {
          action: 'videos.notifyBatch',
          token: adminToken,
          payload: { sessionId: popSession.id, videoCount: 1 }
        },
        ctx,
        secrets
      );

      expect(res.ok).toBe(true);
      expect(ctx.mail.sent.length).toBe(1);
      const email = ctx.mail.sent[0];
      expect(email.to).toBe('ali_batch1@example.com');
      expect(email.subject).toBe('[UMDSC] Class Recap Video Uploaded - Popping (Class #1 - 2026-10-06)');
      expect(email.body).toContain('The class recap video for Popping Class #1 (2026-10-06) has been uploaded');
      expect(email.body).toContain('https://umdsc-dance-class.umdancesportc.workers.dev');
    });

    it('sends a plural email with video count when videoCount > 1', () => {
      const poppingDancer1 = {
        memberId: 'm_pop_batch_2',
        fullName: 'Ali Popping',
        email: 'ali_batch2@example.com',
        styleIds: ['st_popping'],
        styleNames: ['Popping']
      };
      const poppingDancer2DuplicateEmail = {
        memberId: 'm_pop_batch_3',
        fullName: 'Ali Alternate',
        email: 'ali_batch2@example.com', // Duplicate email address
        styleIds: ['st_popping'],
        styleNames: ['Popping']
      };
      const hipHopDancer = {
        memberId: 'm_hip_batch',
        fullName: 'Bala HipHop',
        email: 'bala_batch@example.com',
        styleIds: ['st_hiphop'],
        styleNames: ['Hip Hop']
      };

      const customEvent = seedEvent(ctx, {
        name: 'OCT DANCE BATCH 8',
        styleIds: ['st_popping', 'st_hiphop'],
        members: [poppingDancer1, poppingDancer2DuplicateEmail, hipHopDancer]
      });
      const popSession = ctx.db.sessions.insert(
        {
          eventId: customEvent.id,
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

      ctx.mail.reset();

      const res = handleRequest(
        {
          action: 'videos.notifyBatch',
          token: adminToken,
          payload: { sessionId: popSession.id, videoCount: 8 }
        },
        ctx,
        secrets
      );

      expect(res.ok).toBe(true);
      // Deduplicated: ali_batch2@example.com only receives 1 email, hipHopDancer is not enrolled
      expect(ctx.mail.sent.length).toBe(1);
      const email = ctx.mail.sent[0];
      expect(email.to).toBe('ali_batch2@example.com');
      expect(email.subject).toBe('[UMDSC] 8 Class Recap Videos Uploaded - Popping (Class #2 - 2026-10-13)');
      expect(email.body).toContain('8 new class recap videos for Popping Class #2 (2026-10-13) have been uploaded');
      expect(email.htmlBody).toContain('8 new class recap videos');
      expect(email.htmlBody).toContain('Popping Class #2 (2026-10-13)');
      expect(email.htmlBody).toContain('WATCH CLASS RECAP');
    });

    it('requires videos.upload permission for the session style', () => {
      const customEvent = seedEvent(ctx, { name: 'OCT EVENT', styleIds: ['st_popping'] });
      const popSession = ctx.db.sessions.insert(
        {
          eventId: customEvent.id,
          styleId: 'st_popping',
          seq: 3,
          date: '2026-10-20',
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

      // Create token with permission only for st_hiphop
      const unauthHipHopToken = signToken(
        {
          sub: 'usr_hip',
          role: 'admin',
          name: 'Hip Lead',
          exp: Math.floor(ctx.now().getTime() / 1000) + 3600,
          pv: 1,
          perms: {
            'videos.upload': ['st_hiphop']
          }
        },
        secrets.tokenSecret,
        secrets.hmac
      );

      const res = handleRequest(
        {
          action: 'videos.notifyBatch',
          token: unauthHipHopToken,
          payload: { sessionId: popSession.id, videoCount: 3 }
        },
        ctx,
        secrets
      );

      expect(res.ok).toBe(false);
      expect((res as any).error.code).toBe('FORBIDDEN');
    });
  });

  describe('videos.deactivate also removes the file from Google Drive', () => {
    const registerVideo = (fileId: string, extra: Record<string, unknown> = {}) => {
      (ctx.drive as any).items.set(fileId, {
        id: fileId, kind: 'file', name: 'Recap.mp4', canEdit: true, mimeType: 'video/mp4', sizeBytes: 1000, ...extra
      });
      const res = handleRequest(
        { action: 'videos.register', token: adminToken, payload: { driveFileId: fileId, sessionId: session1.id, title: 'Recap' } },
        ctx,
        secrets
      );
      expect(res.ok).toBe(true);
      return (res as any).data;
    };
    const deactivate = (video: any) =>
      handleRequest({ action: 'videos.deactivate', token: adminToken, payload: { id: video.id, version: video.version } }, ctx, secrets);

    it('moves the Drive file to the trash and reports driveTrashed: true', () => {
      const video = registerVideo('file_owned_by_club_123456789');

      const res = deactivate(video);

      expect(res.ok).toBe(true);
      expect((res as any).data).toEqual({ deactivated: true, driveTrashed: true });
      expect((ctx.drive as any).items.has('file_owned_by_club_123456789')).toBe(false);
      expect(ctx.db.videos.find(v => v.id === video.id && v.active)).toHaveLength(0);
    });

    it('keeps the video on the website when Drive refuses, and names the uploader account to sign in with', () => {
      const style = ctx.db.styles.find(s => s.id === 'st_popping')[0];
      ctx.db.styles.update(style.id, style.version, { videoUploaderEmail: 'lead@gmail.com' }, 'system', ctx.now());
      const video = registerVideo('file_owned_by_lead_123456789', { ownedByOther: true });

      const res = deactivate(video);

      expect(res.ok).toBe(true);
      expect((res as any).data).toEqual({ deactivated: false, driveTrashed: false, uploader: 'lead@gmail.com' });
      expect(ctx.db.videos.find(v => v.id === video.id && v.active)).toHaveLength(1);
    });

    it('removes the video once the uploader has trashed the file in Drive', () => {
      const video = registerVideo('file_owned_by_lead_987654321', { ownedByOther: true });
      (ctx.drive as any).items.get('file_owned_by_lead_987654321').trashed = true; // trashed with the uploader's own account

      const res = deactivate(video);

      expect(res.ok).toBe(true);
      expect((res as any).data).toEqual({ deactivated: true, driveTrashed: true });
      expect(ctx.db.videos.find(v => v.id === video.id && v.active)).toHaveLength(0);
    });

    it('removes the video when its Drive file is already gone', () => {
      const video = registerVideo('file_deleted_already_1234567');
      (ctx.drive as any).items.delete('file_deleted_already_1234567');

      const res = deactivate(video);

      expect((res as any).data).toEqual({ deactivated: true, driveTrashed: true });
    });
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
