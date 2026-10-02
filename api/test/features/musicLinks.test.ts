import { describe, it, expect, beforeEach } from 'vitest';
import { makeCtx } from '../fakes/makeCtx';
import { FakeDrive } from '../fakes/fakeDrive';
import { AppError } from '../../src/errors';
import { resolveMusicLink, rankCandidates } from '../../src/features/musicLinks';

const YT = '4_KN-gA6uXY';
const SPOTIFY_ID = '4cOdK2wGLETKBW3PvgPWqT';
const SPOTIFY_URL = `https://open.spotify.com/track/${SPOTIFY_ID}`;
const DRIVE_ID = '1TjtHZFlOXrPuUGBXfT1egskZystytc2f';

const spotifyPage = (title: string, artist: string, seconds: string) =>
  `<html><head><meta property="og:title" content="${title}" />` +
  `<meta property="og:description" content="${artist} · Whenever You Need Somebody · Song · 1987" />` +
  `<meta name="music:duration" content="${seconds}" />` +
  `<meta name="music:musician_description" content="${artist}" /></head></html>`;

const hit = (youtubeId: string, title: string, channel: string) => ({
  youtubeId,
  title,
  channel,
  thumbnailUrl: `t-${youtubeId}`
});

describe('resolveMusicLink', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let drive: FakeDrive;

  beforeEach(() => {
    drive = new FakeDrive();
    ctx = makeCtx({ drive });
  });

  describe('YouTube', () => {
    it('reads the title and reports the video as embeddable', () => {
      ctx.http.respond('https://www.youtube.com/oembed', {
        status: 200,
        body: JSON.stringify({ title: 'Never Gonna Give You Up' })
      });

      expect(resolveMusicLink(ctx, `https://youtu.be/${YT}`)).toEqual({
        kind: 'youtube',
        youtubeId: YT,
        title: 'Never Gonna Give You Up',
        embeddable: true
      });
    });

    it('reports a video that blocks embedding (oEmbed 401) as not embeddable', () => {
      ctx.http.respond('https://www.youtube.com/oembed', { status: 401 });

      expect(resolveMusicLink(ctx, `https://youtu.be/${YT}`)).toMatchObject({ kind: 'youtube', embeddable: false });
    });

    it('rejects a video that does not exist (oEmbed 404)', () => {
      ctx.http.respond('https://www.youtube.com/oembed', { status: 404 });

      expect(() => resolveMusicLink(ctx, `https://youtu.be/${YT}`)).toThrow(/was not found/);
    });
  });

  describe('SoundCloud', () => {
    it('reads the track title', () => {
      ctx.http.respond('https://soundcloud.com/oembed', {
        status: 200,
        body: JSON.stringify({ title: 'Flickermood by Forss' })
      });

      expect(resolveMusicLink(ctx, 'https://soundcloud.com/forss/flickermood?si=abc')).toEqual({
        kind: 'soundcloud',
        soundcloudUrl: 'https://soundcloud.com/forss/flickermood',
        title: 'Flickermood by Forss'
      });
    });

    it('rejects a private or removed track with a clear message', () => {
      ctx.http.respond('https://soundcloud.com/oembed', { status: 404 });

      expect(() => resolveMusicLink(ctx, 'https://soundcloud.com/forss/gone')).toThrow(
        /can't be played on other websites/
      );
    });

    it('follows an on.soundcloud.com short link to the real track', () => {
      ctx.http.respond('https://on.soundcloud.com/AbC123', {
        status: 302,
        headers: { location: 'https://soundcloud.com/forss/flickermood?utm=x' }
      });
      ctx.http.respond('https://soundcloud.com/oembed', {
        status: 200,
        body: JSON.stringify({ title: 'Flickermood by Forss' })
      });

      expect(resolveMusicLink(ctx, 'https://on.soundcloud.com/AbC123')).toMatchObject({
        kind: 'soundcloud',
        soundcloudUrl: 'https://soundcloud.com/forss/flickermood'
      });
    });
  });

  describe('Google Drive audio', () => {
    const addFile = (mime: string, name = 'practice.mp3') => {
      drive.items.set(DRIVE_ID, { id: DRIVE_ID, kind: 'file', name, canEdit: true } as any);
      drive.setMimeType(DRIVE_ID, mime);
    };

    it('accepts an audio file and uses its name without the extension as the title', () => {
      addFile('audio/mpeg');

      expect(resolveMusicLink(ctx, `https://drive.google.com/file/d/${DRIVE_ID}/view`)).toEqual({
        kind: 'drive',
        driveFileId: DRIVE_ID,
        title: 'practice'
      });
    });

    it('rejects a Drive file that is not audio', () => {
      addFile('video/mp4', 'class.mp4');

      expect(() => resolveMusicLink(ctx, `https://drive.google.com/file/d/${DRIVE_ID}/view`)).toThrow(
        /isn't an audio file/
      );
    });

    it('asks to share a file the club cannot see', () => {
      expect(() => resolveMusicLink(ctx, `https://drive.google.com/file/d/${DRIVE_ID}/view`)).toThrow(
        /Share this file/
      );
    });
  });

  describe('Spotify', () => {
    beforeEach(() => {
      ctx.http.respond(SPOTIFY_URL, { status: 200, body: spotifyPage('Never Gonna Give You Up', 'Rick Astley', '214') });
    });

    const setCandidates = (
      rows: ReturnType<typeof hit>[],
      info: Record<string, { durationSec: number; embeddable: boolean }>
    ) => {
      ctx.youtube.setSearch(rows);
      ctx.youtube.setVideos(info);
    };

    it('reads title, artist and length from the public page and searches for the same recording', () => {
      setCandidates([hit('aaaaaaaaaaa', 'Never Gonna Give You Up', 'Rick Astley - Topic')], {
        aaaaaaaaaaa: { durationSec: 214, embeddable: true }
      });

      const result = resolveMusicLink(ctx, `${SPOTIFY_URL}?si=x`);

      expect(result).toMatchObject({
        kind: 'spotify',
        spotifyUrl: SPOTIFY_URL,
        title: 'Never Gonna Give You Up',
        artist: 'Rick Astley',
        durationSec: 214
      });
      expect(ctx.youtube.searchCalls).toEqual([{ q: 'Rick Astley Never Gonna Give You Up', max: 10 }]);
    });

    it('ranks same-length versions first, then Topic and Official Audio, and keeps only 3', () => {
      setCandidates(
        [
          hit('liveliveliv', 'Never Gonna Give You Up (Live)', 'Someone'),
          hit('videovideovi', 'Never Gonna Give You Up (Official Music Video)', 'Rick Astley'),
          hit('topictopict', 'Never Gonna Give You Up', 'Rick Astley - Topic'),
          hit('lyricslyric', 'Never Gonna Give You Up lyrics', 'Lyrics Channel'),
          hit('remixremixr', 'Never Gonna Give You Up - Remix', 'DJ'),
          hit('audioaudioa', 'Rick Astley - Never Gonna Give You Up (Official Audio)', 'Rick Astley')
        ],
        {
          liveliveliv: { durationSec: 230, embeddable: true },
          videovideovi: { durationSec: 213, embeddable: true },
          topictopict: { durationSec: 214, embeddable: true },
          lyricslyric: { durationSec: 300, embeddable: true },
          remixremixr: { durationSec: 214, embeddable: true },
          audioaudioa: { durationSec: 215, embeddable: true }
        }
      );

      const result = resolveMusicLink(ctx, SPOTIFY_URL) as any;

      expect(result.candidates.map((c: any) => c.youtubeId)).toEqual(['topictopict', 'audioaudioa', 'videovideovi']);
      expect(result.candidates.every((c: any) => c.lengthMatch)).toBe(true);
    });

    it('drops candidates that cannot be embedded', () => {
      setCandidates(
        [hit('blockedblock', 'Never Gonna Give You Up', 'Label'), hit('okokokokoko', 'Never Gonna Give You Up', 'Rick Astley - Topic')],
        {
          blockedblock: { durationSec: 214, embeddable: false },
          okokokokoko: { durationSec: 214, embeddable: true }
        }
      );

      const result = resolveMusicLink(ctx, SPOTIFY_URL) as any;

      expect(result.candidates.map((c: any) => c.youtubeId)).toEqual(['okokokokoko']);
    });

    it('still returns the closest ones, marked as a different length, when nothing is within 3 s', () => {
      setCandidates([hit('aaaaaaaaaaa', 'Never Gonna Give You Up', 'A'), hit('bbbbbbbbbbb', 'Never Gonna Give You Up', 'B')], {
        aaaaaaaaaaa: { durationSec: 250, embeddable: true },
        bbbbbbbbbbb: { durationSec: 260, embeddable: true }
      });

      const result = resolveMusicLink(ctx, SPOTIFY_URL) as any;

      expect(result.candidates).toHaveLength(2);
      expect(result.candidates.every((c: any) => c.lengthMatch === false)).toBe(true);
    });

    it('returns the Spotify song with no candidates when the YouTube search limit is used up', () => {
      ctx.youtube.failWith(new AppError('QUOTA', 'limit'));

      const result = resolveMusicLink(ctx, SPOTIFY_URL) as any;

      expect(result).toMatchObject({
        kind: 'spotify',
        title: 'Never Gonna Give You Up',
        candidates: [],
        notice: 'SEARCH_QUOTA'
      });
    });

    it('does not cache an answer that came from an exhausted quota', () => {
      ctx.youtube.failWith(new AppError('QUOTA', 'limit'));
      resolveMusicLink(ctx, SPOTIFY_URL);

      expect(ctx.cache.get(`spotify:${SPOTIFY_ID}`)).toBeNull();
    });

    it('rejects a page that has no song details', () => {
      ctx.http.respond(SPOTIFY_URL, { status: 200, body: '<html>nothing here</html>' });

      expect(() => resolveMusicLink(ctx, SPOTIFY_URL)).toThrow(/Couldn't read this Spotify song/);
    });

    it('rejects when Spotify cannot be reached', () => {
      ctx.http.respond(SPOTIFY_URL, { status: 500 });

      expect(() => resolveMusicLink(ctx, SPOTIFY_URL)).toThrow(/Couldn't read this Spotify song/);
    });

    it('decodes HTML entities in the title and artist', () => {
      ctx.http.respond(SPOTIFY_URL, { status: 200, body: spotifyPage('Rock &amp; Roll', 'Guns N&#x27; Roses', '200') });
      setCandidates([], {});

      expect(resolveMusicLink(ctx, SPOTIFY_URL)).toMatchObject({ title: 'Rock & Roll', artist: "Guns N' Roses" });
    });

    it('searches only once when the same song is pasted again', () => {
      setCandidates([hit('aaaaaaaaaaa', 'Never Gonna Give You Up', 'Rick Astley - Topic')], {
        aaaaaaaaaaa: { durationSec: 214, embeddable: true }
      });

      const first = resolveMusicLink(ctx, SPOTIFY_URL);
      const second = resolveMusicLink(ctx, `${SPOTIFY_URL}?si=other`);

      expect(second).toEqual(first);
      expect(ctx.youtube.searchCalls).toHaveLength(1);
    });
  });

  it('rejects a link it does not support with the reason from the shared parser', () => {
    expect(() => resolveMusicLink(ctx, 'https://tiktok.com/@x/video/1')).toThrow(
      /Use a YouTube, Spotify, SoundCloud or Google Drive MP3 link/
    );
    expect(() => resolveMusicLink(ctx, `https://open.spotify.com/album/${SPOTIFY_ID}`)).toThrow(/single song/);
  });
});

describe('rankCandidates', () => {
  const cand = (youtubeId: string, title: string, channel: string, lengthMatch: boolean) => ({
    youtubeId,
    title,
    channel,
    durationSec: 0,
    thumbnailUrl: '',
    lengthMatch
  });

  it('does not push down Live or Remix when the Spotify title itself says so', () => {
    const ranked = rankCandidates({ title: 'Hotel California (Live)', durationSec: 400 }, [
      cand('studio', 'Hotel California', 'Eagles', false),
      cand('live', 'Hotel California (Live)', 'Eagles', false)
    ]);

    expect(ranked.map(c => c.youtubeId)).toEqual(['live', 'studio']);
  });

  it('keeps the search order between equal scores', () => {
    const ranked = rankCandidates({ title: 'Song', durationSec: 200 }, [
      cand('first', 'Song', 'A', false),
      cand('second', 'Song', 'B', false)
    ]);

    expect(ranked.map(c => c.youtubeId)).toEqual(['first', 'second']);
  });
});
