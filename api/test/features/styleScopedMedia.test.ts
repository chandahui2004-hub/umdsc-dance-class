import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { Hmac, signToken } from '../../src/security/tokens';
import { getVideoRoutes } from '../../src/features/videos';
import { getMusicRoutes } from '../../src/features/music';
import { seedEvent } from '../fixtures/events';

const nodeHmac: Hmac = (key: string, message: string) => new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
const secrets = { tokenSecret: 'test_secret_key_123456789012345678901234567890', hmac: nodeHmac };

/** A class lead whose upload and music rights cover Popping only (a member role scoped to one style). */
describe('Style-limited media rights', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let leadToken: string;
  let popping: any;
  let locking: any;

  const call = (action: string, payload: any) => handleRequest({ action, token: leadToken, payload }, ctx, secrets);
  const style = (id: string, name: string, videoFolderId: string) =>
    ctx.db.styles.insert(
      { id, name, aliases: [], colorKey: 'blue', defaultWeekday: null, defaultStart: '20:00', defaultEnd: '22:00',
        defaultInstructorId: '', defaultVenue: '', attendanceFolderId: '', videoFolderId } as any,
      'system',
      ctx.now()
    );
  const session = (eventId: string, styleId: string) =>
    ctx.db.sessions.insert(
      { eventId, styleId, seq: 1, date: '2026-10-06', start: '20:00', end: '22:00', instructorId: '', venue: '', status: 'scheduled', note: '' },
      'system',
      ctx.now()
    );
  const music = (eventId: string, styleId: string) =>
    ctx.db.music.insert(
      { styleId, eventId, sessionId: '', title: 'Song', sourceType: 'youtube', driveFileId: '', youtubeId: 'dQw4w9WgXcQ' } as any,
      'system',
      ctx.now()
    );

  beforeEach(() => {
    ctx = makeCtx();
    registerRoutes(getVideoRoutes());
    registerRoutes(getMusicRoutes());
    const scope = ['st_popping'];
    leadToken = signToken(
      { sub: 'M-22001111', role: 'dancer', name: 'Lead', exp: Math.floor(ctx.now().getTime() / 1000) + 3600, pv: 1,
        perms: { 'videos.upload': scope, 'videos.edit': scope, 'music.edit': scope, 'sections.edit': scope } },
      secrets.tokenSecret,
      secrets.hmac
    );
    style('st_popping', 'Popping', 'fld_popping_drive');
    style('st_locking', 'Locking', 'fld_locking_drive');
    const event = seedEvent(ctx, { name: 'OCT MONTHLY CLASS', styleIds: ['st_popping', 'st_locking'] });
    popping = { event, session: session(event.id, 'st_popping'), music: music(event.id, 'st_popping') };
    locking = { event, session: session(event.id, 'st_locking'), music: music(event.id, 'st_locking') };
  });

  const code = (res: any) => (res.ok ? 'ok' : res.error.code);

  it('upload target: allowed for their style, refused for another', () => {
    expect(code(call('videos.targetFolder', { sessionId: popping.session.id }))).toBe('ok');
    expect(code(call('videos.targetFolder', { sessionId: locking.session.id }))).toBe('FORBIDDEN');
  });

  it('scan: allowed for their style, refused for another', () => {
    expect(code(call('videos.scan', { styleId: 'st_popping', eventId: popping.event.id }))).toBe('ok');
    expect(code(call('videos.scan', { styleId: 'st_locking', eventId: locking.event.id }))).toBe('FORBIDDEN');
  });

  it('music: add, edit and remove for their style only', () => {
    const add = (styleId: string) =>
      call('music.create', { styleId, eventId: popping.event.id, title: 'New', sourceType: 'youtube', youtubeUrl: 'dQw4w9WgXcQ' });
    expect(code(add('st_popping'))).toBe('ok');
    expect(code(add('st_locking'))).toBe('FORBIDDEN');

    expect(code(call('music.update', { id: popping.music.id, version: popping.music.version, title: 'Renamed' }))).toBe('ok');
    expect(code(call('music.update', { id: locking.music.id, version: locking.music.version, title: 'Renamed' }))).toBe('FORBIDDEN');
    expect(code(call('music.deactivate', { id: locking.music.id, version: locking.music.version }))).toBe('FORBIDDEN');
  });

  it('sections: only on music of their style', () => {
    const add = (musicId: string) => call('sections.create', { musicId, name: 'Chorus', startSec: 10, endSec: 20 });
    const mine = add(popping.music.id);
    expect(code(mine)).toBe('ok');
    expect(code(add(locking.music.id))).toBe('FORBIDDEN');

    const section = (mine as any).data;
    expect(code(call('sections.update', { id: section.id, version: section.version, name: 'Verse' }))).toBe('ok');
  });

  it('an unknown id is still refused, not let through', () => {
    expect(code(call('music.update', { id: 'mus_missing', version: 1, title: 'x' }))).toBe('FORBIDDEN');
  });
});
