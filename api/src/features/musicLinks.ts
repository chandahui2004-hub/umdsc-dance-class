import { parseMusicLink, type MusicItem, type ResolvedLink, type SpotifyCandidate } from '@umdsc/shared';
import { Ctx } from '../ports';
import { AppError } from '../errors';
import { safeCachePut } from '../logic/cache';

const SPOTIFY_UNREADABLE = "Couldn't read this Spotify song. Paste the YouTube version instead.";
const SOUNDCLOUD_BLOCKED = "This SoundCloud track can't be played on other websites.";
const SPOTIFY_CACHE_SECONDS = 6 * 3600;
const LENGTH_TOLERANCE_SEC = 3;
const MAX_CANDIDATES = 3;
const SEARCH_RESULTS = 10;

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function metaContent(html: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keyFirst = new RegExp(`<meta[^>]*?(?:property|name)=["']${escaped}["'][^>]*?content=["']([^"']*)["']`, 'i').exec(html);
  if (keyFirst) return decodeEntities(keyFirst[1]);
  const contentFirst = new RegExp(`<meta[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["']${escaped}["']`, 'i').exec(html);
  return contentFirst ? decodeEntities(contentFirst[1]) : '';
}

// Words that mark a different version of a song than the studio recording.
const VERSION_WORDS = ['music video', 'official video', 'mv', 'live', 'remix', 'cover'];

function versionWords(title: string): string[] {
  const lower = title.toLowerCase();
  return VERSION_WORDS.filter(word => new RegExp(`\\b${word}\\b`).test(lower));
}

/**
 * Orders YouTube matches for a Spotify song, best first (equal scores keep the search order):
 * same length first, then "- Topic" channels and "Official Audio" titles. Music video, live, remix and
 * cover uploads are pushed down unless the Spotify title is itself that version, in which case a
 * matching upload is preferred.
 */
export function rankCandidates(
  spotify: { title: string; durationSec: number },
  found: SpotifyCandidate[]
): SpotifyCandidate[] {
  const spotifyWords = new Set(versionWords(spotify.title));
  const score = (c: SpotifyCandidate) => {
    let points = 0;
    if (c.lengthMatch) points += 100;
    if (/ - topic$/i.test(c.channel)) points += 30;
    if (/\b(official audio|audio)\b/i.test(c.title)) points += 20;
    for (const word of versionWords(c.title)) points += spotifyWords.has(word) ? 30 : -40;
    return points;
  };
  return found
    .map((c, index) => ({ c, index, points: score(c) }))
    .sort((a, b) => b.points - a.points || a.index - b.index)
    .map(x => x.c);
}

function resolveYouTube(ctx: Ctx, youtubeId: string): ResolvedLink {
  const watchUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
  const res = ctx.http.fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`);
  if (res.status === 404) {
    throw new AppError('LINK_INVALID', 'That YouTube video was not found.');
  }
  if (res.status === 401 || res.status === 403) {
    // The owner has switched off playback on other websites.
    return { kind: 'youtube', youtubeId, title: '', embeddable: false };
  }
  if (res.status !== 200) {
    throw new AppError('LINK_INVALID', 'Could not check that YouTube video. Try again in a moment.');
  }
  return { kind: 'youtube', youtubeId, title: JSON.parse(res.body).title || '', embeddable: true };
}

function resolveSoundCloud(ctx: Ctx, soundcloudUrl: string): ResolvedLink {
  const res = ctx.http.fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(soundcloudUrl)}`);
  if (res.status !== 200) {
    throw new AppError('LINK_INVALID', SOUNDCLOUD_BLOCKED);
  }
  return { kind: 'soundcloud', soundcloudUrl, title: JSON.parse(res.body).title || '' };
}

function resolveSoundCloudShort(ctx: Ctx, shortUrl: string): ResolvedLink {
  const res = ctx.http.fetch(shortUrl, { followRedirects: false });
  const target = parseMusicLink(res.headers.location || '');
  if (target.kind !== 'soundcloud') {
    throw new AppError('LINK_INVALID', "Couldn't open that SoundCloud link. Paste the full track link instead.");
  }
  return resolveSoundCloud(ctx, target.url);
}

function resolveDrive(ctx: Ctx, fileId: string): ResolvedLink {
  const info = ctx.drive.info(fileId);
  if (!info.exists) {
    throw new AppError('LINK_NO_ACCESS', `Share this file with ${ctx.clubEmail} as Editor, then try again.`);
  }
  if (!(info.mimeType || '').startsWith('audio/')) {
    throw new AppError('LINK_WRONG_KIND', "This Drive file isn't an audio file.");
  }
  return { kind: 'drive', driveFileId: fileId, title: info.name.replace(/\.[A-Za-z0-9]{2,5}$/, '') };
}

function resolveSpotify(ctx: Ctx, trackId: string): ResolvedLink {
  const cacheKey = `spotify:${trackId}`;
  const cached = ctx.cache.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // look it up again
    }
  }

  const spotifyUrl = `https://open.spotify.com/track/${trackId}`;
  const page = ctx.http.fetch(spotifyUrl);
  const title = page.status === 200 ? metaContent(page.body, 'og:title') : '';
  if (!title) {
    throw new AppError('LINK_INVALID', SPOTIFY_UNREADABLE);
  }
  const artist =
    metaContent(page.body, 'music:musician_description') ||
    metaContent(page.body, 'og:description').split(' · ')[0];
  const durationSec = Number(metaContent(page.body, 'music:duration')) || 0;

  let candidates: SpotifyCandidate[] = [];
  let notice: 'SEARCH_QUOTA' | 'SEARCH_UNAVAILABLE' | undefined;
  try {
    const found = ctx.youtube.search(`${artist} ${title}`.trim(), SEARCH_RESULTS);
    const details = new Map(ctx.youtube.videos(found.map(f => f.youtubeId)).map(v => [v.youtubeId, v]));
    const playable = found
      .filter(f => details.get(f.youtubeId)?.embeddable)
      .map(f => {
        const length = details.get(f.youtubeId)!.durationSec;
        return {
          youtubeId: f.youtubeId,
          title: f.title,
          channel: f.channel,
          durationSec: length,
          thumbnailUrl: f.thumbnailUrl,
          lengthMatch: durationSec > 0 && Math.abs(length - durationSec) <= LENGTH_TOLERANCE_SEC
        };
      });
    candidates = rankCandidates({ title, durationSec }, playable).slice(0, MAX_CANDIDATES);
  } catch (err) {
    // Whatever stops the search (daily limit, service not switched on or not approved yet), the admin still
    // gets the Spotify song and can paste a practice link or save it listen-only, so this never fails the lookup.
    notice = err instanceof AppError && err.code === 'QUOTA' ? 'SEARCH_QUOTA' : 'SEARCH_UNAVAILABLE';
  }

  const result: ResolvedLink = {
    kind: 'spotify',
    spotifyUrl,
    title,
    artist,
    durationSec,
    candidates,
    ...(notice ? { notice } : {})
  };
  if (!notice) safeCachePut(ctx.cache, cacheKey, JSON.stringify(result), SPOTIFY_CACHE_SECONDS);
  return result;
}

/** Works out what a pasted link is and fetches what the admin needs to save it (title, playability, Spotify matches). */
export function resolveMusicLink(ctx: Ctx, url: string): ResolvedLink {
  const parsed = parseMusicLink(url);
  switch (parsed.kind) {
    case 'rejected':
      throw new AppError('VALIDATION', parsed.reason);
    case 'youtube':
      return resolveYouTube(ctx, parsed.id);
    case 'soundcloud':
      return resolveSoundCloud(ctx, parsed.url);
    case 'soundcloud-short':
      return resolveSoundCloudShort(ctx, parsed.url);
    case 'drive':
      return resolveDrive(ctx, parsed.fileId);
    case 'spotify':
      return resolveSpotify(ctx, parsed.trackId);
  }
}

export type { ResolvedLink, SpotifyCandidate };

export interface DerivedSource {
  sourceType: MusicItem['sourceType'];
  youtubeId: string;
  driveFileId: string;
  soundcloudUrl: string;
  spotifyUrl: string;
}

export interface MusicLinkInput {
  url: string;
  /** For a Spotify link: the YouTube version the admin picked from the matches. */
  chosenYoutubeId?: string;
  /** For a Spotify link: a YouTube, SoundCloud or Drive link the admin pasted as the practice version. */
  practiceUrl?: string;
  /** For a Spotify link: keep it listen-only (no practice version). */
  listenOnly?: boolean;
}

const NO_SOURCE = { youtubeId: '', driveFileId: '', soundcloudUrl: '', spotifyUrl: '' };

function derivePracticeSource(ctx: Ctx, url: string): Omit<DerivedSource, 'spotifyUrl'> {
  const parsed = parseMusicLink(url);
  switch (parsed.kind) {
    case 'rejected':
      throw new AppError('VALIDATION', parsed.reason);
    case 'spotify':
      throw new AppError('VALIDATION', 'A Spotify link cannot be the practice version. Use a YouTube, SoundCloud or MP3 link.');
    case 'youtube':
      return { ...NO_SOURCE, sourceType: 'youtube', youtubeId: parsed.id };
    case 'soundcloud':
      return { ...NO_SOURCE, sourceType: 'soundcloud', soundcloudUrl: parsed.url };
    case 'soundcloud-short': {
      const resolved = resolveSoundCloudShort(ctx, parsed.url);
      return { ...NO_SOURCE, sourceType: 'soundcloud', soundcloudUrl: (resolved as { soundcloudUrl: string }).soundcloudUrl };
    }
    case 'drive': {
      const resolved = resolveDrive(ctx, parsed.fileId); // checks it exists and is audio
      return { ...NO_SOURCE, sourceType: 'mp3', driveFileId: (resolved as { driveFileId: string }).driveFileId };
    }
  }
}

/**
 * The fields to store for a pasted link. Everything is worked out here from the link itself, never
 * from ids the browser sends, so a client cannot store a different video than the link names.
 */
export function deriveMusicSource(ctx: Ctx, input: MusicLinkInput): DerivedSource {
  const parsed = parseMusicLink(input.url);
  if (parsed.kind !== 'spotify') {
    return { ...derivePracticeSource(ctx, input.url), spotifyUrl: '' };
  }

  const spotifyUrl = `https://open.spotify.com/track/${parsed.trackId}`;
  if (input.listenOnly) {
    return { ...NO_SOURCE, sourceType: 'spotify', spotifyUrl };
  }
  if (input.chosenYoutubeId) {
    const chosen = parseMusicLink(input.chosenYoutubeId);
    if (chosen.kind !== 'youtube') {
      throw new AppError('VALIDATION', 'The chosen YouTube version is not a valid video.');
    }
    return { ...NO_SOURCE, sourceType: 'youtube', youtubeId: chosen.id, spotifyUrl };
  }
  if (input.practiceUrl) {
    return { ...derivePracticeSource(ctx, input.practiceUrl), spotifyUrl };
  }
  throw new AppError('VALIDATION', 'Pick a practice version or choose listen-only for this Spotify song.');
}
