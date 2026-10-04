import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { Hmac, signToken } from '../../src/security/tokens';
import { seedEvent } from '../fixtures/events';
import { getMusicRoutes } from '../../src/features/music';

const nodeHmac: Hmac = (key: string, message: string) => {
  return new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
};

const secrets = {
  tokenSecret: 'test_secret_key_123456789012345678901234567890',
  hmac: nodeHmac
};

describe('Feature: Music & Sections (features/music)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let adminToken: string;
  let dancerToken: string;

  beforeEach(() => {
    ctx = makeCtx();
    registerRoutes(getMusicRoutes());
    seedEvent(ctx, { id: 'evt_test', styleIds: ['st_popping'] } as any);

    adminToken = signToken(
      {
        sub: 'admin1',
        role: 'admin',
        name: 'Admin One',
        exp: Math.floor(ctx.now().getTime() / 1000) + 3600,
        pv: 1,
        perms: {
          'music.view': '*',
          'music.edit': '*',
          'sections.edit': '*'
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
          'music.view': ['st_popping']
        }
      },
      secrets.tokenSecret,
      secrets.hmac
    );

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
        attendanceFolderId: '',
        videoFolderId: ''
      },
      'system',
      ctx.now()
    );

    ctx.db.styles.insert(
      {
        id: 'st_hiphop',
        name: 'Hip Hop',
        aliases: ['hiphop'],
        colorKey: 'orange',
        defaultWeekday: 4,
        defaultStart: '20:00',
        defaultEnd: '22:00',
        defaultInstructorId: '',
        defaultVenue: 'Studio B',
        attendanceFolderId: '',
        videoFolderId: ''
      },
      'system',
      ctx.now()
    );
  });

  it('music.create with bad YouTube URL → VALIDATION', () => {
    const res = handleRequest(
      {
        action: 'music.create',
        token: adminToken,
        payload: {
          styleId: 'st_popping',
          eventId: 'evt_test',
          title: 'Battle Track',
          sourceType: 'youtube',
          youtubeUrl: 'not_a_valid_youtube_url'
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('VALIDATION');
    }
  });

  it('music.create with https://youtu.be/dQw4w9WgXcQ?t=5 → youtubeId dQw4w9WgXcQ', () => {
    const res = handleRequest(
      {
        action: 'music.create',
        token: adminToken,
        payload: {
          styleId: 'st_popping',
          eventId: 'evt_test',
          title: 'Never Gonna Give You Up',
          sourceType: 'youtube',
          youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ?t=5'
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const music = res.data as any;
      expect(music.youtubeId).toBe('dQw4w9WgXcQ');
      expect(music.sourceType).toBe('youtube');
    }
  });

  it('sections.create with endSec <= startSec → VALIDATION', () => {
    const music = ctx.db.music.insert(
      {
        styleId: 'st_popping',
        eventId: 'evt_test',
        sessionId: '',
        title: 'Song',
        sourceType: 'youtube',
        driveFileId: '',
        youtubeId: 'dQw4w9WgXcQ'
      },
      'admin1',
      ctx.now()
    );

    const res = handleRequest(
      {
        action: 'sections.create',
        token: adminToken,
        payload: {
          musicId: music.id,
          name: 'Chorus',
          startSec: 30,
          endSec: 20
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('VALIDATION');
    }
  });

  it('sections.create valid section, list, update, deactivate', () => {
    const music = ctx.db.music.insert(
      {
        styleId: 'st_popping',
        eventId: 'evt_test',
        sessionId: '',
        title: 'Song',
        sourceType: 'youtube',
        driveFileId: '',
        youtubeId: 'dQw4w9WgXcQ'
      },
      'admin1',
      ctx.now()
    );

    const createRes = handleRequest(
      {
        action: 'sections.create',
        token: adminToken,
        payload: {
          musicId: music.id,
          name: 'Intro',
          startSec: 0,
          endSec: 15
        }
      },
      ctx,
      secrets
    );
    expect(createRes.ok).toBe(true);
    const sec = (createRes as any).data;

    const listRes = handleRequest(
      {
        action: 'sections.list',
        token: adminToken,
        payload: { musicId: music.id }
      },
      ctx,
      secrets
    );
    expect(listRes.ok).toBe(true);
    if (listRes.ok) {
      expect((listRes.data as any[]).length).toBe(1);
    }

    const updateRes = handleRequest(
      {
        action: 'sections.update',
        token: adminToken,
        payload: {
          id: sec.id,
          version: sec.version,
          name: 'Extended Intro',
          endSec: 20
        }
      },
      ctx,
      secrets
    );
    expect(updateRes.ok).toBe(true);

    const deactRes = handleRequest(
      {
        action: 'sections.deactivate',
        token: adminToken,
        payload: {
          id: sec.id,
          version: (updateRes as any).data.version
        }
      },
      ctx,
      secrets
    );
    expect(deactRes.ok).toBe(true);
  });

  it('dancer listing music of a style they are not in → empty', () => {
    // Add hip hop track
    ctx.db.music.insert(
      {
        styleId: 'st_hiphop',
        eventId: 'evt_test',
        sessionId: '',
        title: 'Hip Hop Beat',
        sourceType: 'youtube',
        driveFileId: '',
        youtubeId: 'dQw4w9WgXcQ'
      },
      'admin1',
      ctx.now()
    );

    // Dancer only has permission for st_popping
    const res = handleRequest(
      {
        action: 'music.list',
        token: dancerToken,
        payload: { styleId: 'st_hiphop' }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual([]);
    }
  });

  it('a song saved before the SoundCloud and Spotify columns existed reads them as empty', () => {
    ctx.db.music.insert(
      { styleId: 'st_popping', eventId: 'evt_test', sessionId: '', title: 'Old song', sourceType: 'youtube', driveFileId: '', youtubeId: 'dQw4w9WgXcQ' },
      'system',
      ctx.now()
    );

    const song = ctx.db.music.find(m => m.title === 'Old song')[0];

    expect(song.soundcloudUrl).toBe('');
    expect(song.spotifyUrl).toBe('');
  });

  it('sections.list without musicId returns all active sections for admin', () => {
    const m1 = ctx.db.music.insert(
      { styleId: 'st_popping', eventId: 'evt_test', sessionId: '', title: 'Song 1', sourceType: 'youtube', driveFileId: '', youtubeId: 'vid1' },
      'admin1',
      ctx.now()
    );
    const m2 = ctx.db.music.insert(
      { styleId: 'st_hiphop', eventId: 'evt_test', sessionId: '', title: 'Song 2', sourceType: 'youtube', driveFileId: '', youtubeId: 'vid2' },
      'admin1',
      ctx.now()
    );

    const s1 = ctx.db.sections.insert(
      { musicId: m1.id, name: 'S1', startSec: 10, endSec: 20, videoId: '', videoStartSec: null },
      'admin1',
      ctx.now()
    );
    const s2 = ctx.db.sections.insert(
      { musicId: m2.id, name: 'S2', startSec: 0, endSec: 15, videoId: '', videoStartSec: null },
      'admin1',
      ctx.now()
    );
    const s3Inactive = ctx.db.sections.insert(
      { musicId: m1.id, name: 'S3 Inactive', startSec: 0, endSec: 5, videoId: '', videoStartSec: null },
      'admin1',
      ctx.now()
    );
    ctx.db.sections.deactivate(s3Inactive.id, s3Inactive.version, 'admin1', ctx.now());

    const res = handleRequest(
      {
        action: 'sections.list',
        token: adminToken,
        payload: {}
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const list = res.data as any[];
      expect(list.map(s => s.id)).toEqual([s1.id, s2.id].sort());
      expect(list.find(s => s.id === s3Inactive.id)).toBeUndefined();
    }
  });

  it('sections.list without musicId gives a dancer only sections of music in their events', () => {
    seedEvent(ctx, { id: 'evt_other', styleIds: ['st_popping'] } as any);

    const m1 = ctx.db.music.insert(
      { styleId: 'st_popping', eventId: 'evt_test', sessionId: '', title: 'My Event Song', sourceType: 'youtube', driveFileId: '', youtubeId: 'vid1' },
      'admin1',
      ctx.now()
    );
    const m2 = ctx.db.music.insert(
      { styleId: 'st_popping', eventId: 'evt_other', sessionId: '', title: 'Other Event Song', sourceType: 'youtube', driveFileId: '', youtubeId: 'vid2' },
      'admin1',
      ctx.now()
    );

    const s1 = ctx.db.sections.insert(
      { musicId: m1.id, name: 'S1 My Event', startSec: 0, endSec: 10, videoId: '', videoStartSec: null },
      'admin1',
      ctx.now()
    );
    const s2 = ctx.db.sections.insert(
      { musicId: m2.id, name: 'S2 Other Event', startSec: 0, endSec: 10, videoId: '', videoStartSec: null },
      'admin1',
      ctx.now()
    );

    ctx.db.memberIndex.insert(
      { matricKey: '22001111', nameKey: 'popper ali', fullName: 'Popper Ali', eventIds: ['evt_test'], lastEventEnd: '2026-10-31' },
      'system',
      ctx.now()
    );

    const res = handleRequest(
      {
        action: 'sections.list',
        token: dancerToken,
        payload: {}
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const list = res.data as any[];
      expect(list.map(s => s.id)).toEqual([s1.id]);
    }
  });
});

