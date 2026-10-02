import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { FakeDrive } from '../fakes/fakeDrive';
import { Hmac, signToken } from '../../src/security/tokens';
import { seedEvent } from '../fixtures/events';
import { getMusicRoutes } from '../../src/features/music';

const nodeHmac: Hmac = (key: string, message: string) =>
  new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());

const secrets = { tokenSecret: 'test_secret_key_123456789012345678901234567890', hmac: nodeHmac };

const YT = '4_KN-gA6uXY';
const SPOTIFY_URL = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
const SOUNDCLOUD_URL = 'https://soundcloud.com/forss/flickermood';
const DRIVE_ID = '1TjtHZFlOXrPuUGBXfT1egskZystytc2f';

describe('music.create and music.update from a pasted link', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let drive: FakeDrive;
  let adminToken: string;

  const call = (action: string, payload: Record<string, unknown>) =>
    handleRequest({ action, token: adminToken, payload }, ctx, secrets);

  const create = (extra: Record<string, unknown>) =>
    call('music.create', { styleId: 'st_popping', eventId: 'evt_test', title: 'Practice track', ...extra });

  const created = (res: ReturnType<typeof handleRequest>) => {
    expect(res.ok).toBe(true);
    return (res as any).data;
  };

  beforeEach(() => {
    drive = new FakeDrive();
    ctx = makeCtx({ drive });
    registerRoutes(getMusicRoutes());
    seedEvent(ctx, { id: 'evt_test', styleIds: ['st_popping'] } as any);
    adminToken = signToken(
      {
        sub: 'admin1',
        role: 'admin',
        name: 'Admin One',
        exp: Math.floor(ctx.now().getTime() / 1000) + 3600,
        pv: 1,
        perms: { 'music.view': '*', 'music.edit': '*' }
      },
      secrets.tokenSecret,
      secrets.hmac
    );
  });

  it('saves a YouTube link as a youtube song', () => {
    const song = created(create({ url: `https://youtu.be/${YT}?t=5` }));

    expect(song).toMatchObject({ sourceType: 'youtube', youtubeId: YT, soundcloudUrl: '', spotifyUrl: '' });
  });

  it('saves a SoundCloud link with its canonical url', () => {
    const song = created(create({ url: `${SOUNDCLOUD_URL}?si=abc` }));

    expect(song).toMatchObject({ sourceType: 'soundcloud', soundcloudUrl: SOUNDCLOUD_URL, youtubeId: '' });
  });

  it('saves a Google Drive audio link as an mp3 and makes the file readable by anyone', () => {
    drive.items.set(DRIVE_ID, { id: DRIVE_ID, kind: 'file', name: 'practice.mp3', canEdit: true } as any);
    drive.setMimeType(DRIVE_ID, 'audio/mpeg');
    const share = vi.spyOn(ctx.drive, 'setAnyoneReader');

    const song = created(create({ url: `https://drive.google.com/file/d/${DRIVE_ID}/view` }));

    expect(song).toMatchObject({ sourceType: 'mp3', driveFileId: DRIVE_ID });
    expect(share).toHaveBeenCalledWith(DRIVE_ID);
  });

  it('refuses a Drive file that is not audio', () => {
    drive.items.set(DRIVE_ID, { id: DRIVE_ID, kind: 'file', name: 'class.mp4', canEdit: true } as any);
    drive.setMimeType(DRIVE_ID, 'video/mp4');

    const res = create({ url: `https://drive.google.com/file/d/${DRIVE_ID}/view` });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('LINK_WRONG_KIND');
  });

  it('saves a Spotify song with the YouTube version the admin chose, keeping the Spotify link', () => {
    const song = created(create({ url: `${SPOTIFY_URL}?si=x`, chosenYoutubeId: YT }));

    expect(song).toMatchObject({ sourceType: 'youtube', youtubeId: YT, spotifyUrl: SPOTIFY_URL });
  });

  it('saves a Spotify song with a SoundCloud practice link the admin pasted', () => {
    const song = created(create({ url: SPOTIFY_URL, practiceUrl: SOUNDCLOUD_URL }));

    expect(song).toMatchObject({ sourceType: 'soundcloud', soundcloudUrl: SOUNDCLOUD_URL, spotifyUrl: SPOTIFY_URL });
  });

  it('saves a Spotify song as listen-only when the admin chooses that', () => {
    const song = created(create({ url: SPOTIFY_URL, listenOnly: true }));

    expect(song).toMatchObject({ sourceType: 'spotify', spotifyUrl: SPOTIFY_URL, youtubeId: '', soundcloudUrl: '' });
  });

  it('refuses a Spotify song with no practice version chosen and not listen-only', () => {
    const res = create({ url: SPOTIFY_URL });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/practice version or choose listen-only/);
  });

  it('refuses a Spotify song whose practice link is another Spotify link', () => {
    const res = create({ url: SPOTIFY_URL, practiceUrl: SPOTIFY_URL });

    expect(res.ok).toBe(false);
  });

  it('refuses a chosen YouTube id that is not a real video id', () => {
    const res = create({ url: SPOTIFY_URL, chosenYoutubeId: 'not an id' });

    expect(res.ok).toBe(false);
  });

  it('ignores a youtubeId sent by the client and derives it from the link', () => {
    const song = created(create({ url: `https://youtu.be/${YT}`, youtubeId: 'zzzzzzzzzzz', sourceType: 'mp3' }));

    expect(song).toMatchObject({ sourceType: 'youtube', youtubeId: YT });
  });

  it('refuses an unsupported link with the reason', () => {
    const res = create({ url: 'https://tiktok.com/@x/video/1' });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/Use a YouTube, Spotify, SoundCloud or Google Drive MP3 link/);
  });

  it('still saves the old payload shape (sourceType + youtubeUrl)', () => {
    const song = created(create({ sourceType: 'youtube', youtubeUrl: `https://youtu.be/${YT}` }));

    expect(song).toMatchObject({ sourceType: 'youtube', youtubeId: YT });
  });

  it('update with a new link switches the source and clears the old one', () => {
    const song = created(create({ url: `https://youtu.be/${YT}` }));

    const res = call('music.update', { id: song.id, version: song.version, url: SOUNDCLOUD_URL });

    expect(res.ok).toBe(true);
    expect((res as any).data).toMatchObject({
      sourceType: 'soundcloud',
      soundcloudUrl: SOUNDCLOUD_URL,
      youtubeId: '',
      spotifyUrl: ''
    });
  });

  it('update can attach a YouTube version to a listen-only Spotify song', () => {
    const song = created(create({ url: SPOTIFY_URL, listenOnly: true }));

    const res = call('music.update', { id: song.id, version: song.version, url: SPOTIFY_URL, chosenYoutubeId: YT });

    expect((res as any).data).toMatchObject({ sourceType: 'youtube', youtubeId: YT, spotifyUrl: SPOTIFY_URL });
  });

  it('update without a link only changes the title', () => {
    const song = created(create({ url: `https://youtu.be/${YT}` }));

    const res = call('music.update', { id: song.id, version: song.version, title: 'Renamed' });

    expect((res as any).data).toMatchObject({ title: 'Renamed', sourceType: 'youtube', youtubeId: YT });
  });
});
