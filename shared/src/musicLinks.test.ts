import { describe, it, expect } from 'vitest';
import { parseMusicLink, musicAppLinks, canPractise } from './musicLinks';
import type { MusicItem } from './types';

const YT = '4_KN-gA6uXY';
const SPOTIFY = '4cOdK2wGLETKBW3PvgPWqT';
const DRIVE = '1TjtHZFlOXrPuUGBXfT1egskZystytc2f';
const SINGLE = 'Paste a link to a single song';
const UNKNOWN = 'Use a YouTube, Spotify, SoundCloud or Google Drive MP3 link';

describe('parseMusicLink', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${YT}`],
    [`https://youtu.be/${YT}?t=5`],
    [`https://music.youtube.com/watch?v=${YT}`],
    [`https://www.youtube.com/shorts/${YT}`],
    [`https://www.youtube.com/embed/${YT}`],
    [YT]
  ])('reads YouTube link %s', input => {
    expect(parseMusicLink(input)).toEqual({ kind: 'youtube', id: YT });
  });

  it.each([
    [`https://open.spotify.com/track/${SPOTIFY}?si=abc`],
    [`https://open.spotify.com/intl-ms/track/${SPOTIFY}`],
    [`spotify:track:${SPOTIFY}`]
  ])('reads Spotify track %s', input => {
    expect(parseMusicLink(input)).toEqual({ kind: 'spotify', trackId: SPOTIFY });
  });

  it('reads a SoundCloud track and drops the query string', () => {
    expect(parseMusicLink('https://soundcloud.com/forss/flickermood?si=abc')).toEqual({
      kind: 'soundcloud',
      url: 'https://soundcloud.com/forss/flickermood'
    });
  });

  it('marks an on.soundcloud.com short link for the server to resolve', () => {
    expect(parseMusicLink('https://on.soundcloud.com/AbC123')).toEqual({
      kind: 'soundcloud-short',
      url: 'https://on.soundcloud.com/AbC123'
    });
  });

  it.each([
    [`https://drive.google.com/file/d/${DRIVE}/view`],
    [`https://drive.google.com/open?id=${DRIVE}`]
  ])('reads Google Drive file %s', input => {
    expect(parseMusicLink(input)).toEqual({ kind: 'drive', fileId: DRIVE });
  });

  it.each([
    [`https://open.spotify.com/album/${SPOTIFY}`],
    [`https://open.spotify.com/playlist/${SPOTIFY}`],
    [`https://open.spotify.com/artist/${SPOTIFY}`],
    ['https://soundcloud.com/forss/sets/soulhack']
  ])('rejects a non-song link %s', input => {
    expect(parseMusicLink(input)).toEqual({ kind: 'rejected', reason: SINGLE });
  });

  it.each([['https://tiktok.com/@x/video/1'], ['hello'], ['']])('rejects an unsupported link %j', input => {
    expect(parseMusicLink(input)).toEqual({ kind: 'rejected', reason: UNKNOWN });
  });

  it.each([
    ['a path that is not an id', 'https://open.spotify.com/track/..%2F..%2Fsecret'],
    ['an id that is far too long', `https://open.spotify.com/track/${'a'.repeat(300)}`],
    ['a URI with a too-short id', 'spotify:track:abc'],
    ['an id with odd characters', 'https://open.spotify.com/track/abc-def_ghi!jkl']
  ])('rejects a Spotify track link with %s', (_label, input) => {
    expect(parseMusicLink(input).kind).toBe('rejected');
  });

  it('rejects a Google Drive folder link', () => {
    const result = parseMusicLink(`https://drive.google.com/drive/folders/${DRIVE}`);
    expect(result.kind).toBe('rejected');
  });
});

const meta = { id: 'm1', version: 1, updatedBy: 'a', updatedAt: '', active: true };
const song = (over: Partial<MusicItem>): MusicItem => ({
  ...meta, styleId: 's', eventId: 'e', sessionId: '', title: 'T',
  sourceType: 'youtube', driveFileId: '', youtubeId: '', ...over
});

describe('musicAppLinks and canPractise', () => {
  it('lists Spotify first, then the practice source, for a Spotify song with a YouTube twin', () => {
    const links = musicAppLinks(song({ youtubeId: YT, spotifyUrl: `https://open.spotify.com/track/${SPOTIFY}` }));
    expect(links).toEqual([
      { label: 'Spotify', url: `https://open.spotify.com/track/${SPOTIFY}` },
      { label: 'YouTube', url: `https://www.youtube.com/watch?v=${YT}` }
    ]);
  });

  it('offers a download for an MP3 and Open in SoundCloud for SoundCloud', () => {
    expect(musicAppLinks(song({ sourceType: 'mp3', driveFileId: DRIVE }))).toEqual([
      { label: 'Download MP3', url: `https://drive.google.com/uc?export=download&id=${DRIVE}` }
    ]);
    expect(
      musicAppLinks(song({ sourceType: 'soundcloud', soundcloudUrl: 'https://soundcloud.com/forss/flickermood' }))
    ).toEqual([{ label: 'SoundCloud', url: 'https://soundcloud.com/forss/flickermood' }]);
  });

  it('cannot be practised only when the song is listen-only Spotify', () => {
    expect(canPractise(song({ sourceType: 'spotify', spotifyUrl: 'https://open.spotify.com/track/x' }))).toBe(false);
    expect(canPractise(song({ sourceType: 'youtube', youtubeId: YT }))).toBe(true);
    expect(canPractise(song({ sourceType: 'soundcloud', soundcloudUrl: 'https://soundcloud.com/a/b' }))).toBe(true);
    expect(canPractise(song({ sourceType: 'mp3', driveFileId: DRIVE }))).toBe(true);
  });
});
