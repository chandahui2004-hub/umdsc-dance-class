import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { Hmac, signToken } from '../../src/security/tokens';
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
          month: '2026-10',
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
          month: '2026-10',
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
        month: '2026-10',
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
        month: '2026-10',
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
        month: '2026-10',
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
});
