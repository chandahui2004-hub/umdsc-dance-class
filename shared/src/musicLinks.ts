import { getYouTubeVideoId } from './youtube';
import { extractDriveId } from './driveIds';
import type { MusicItem } from './types';

export type ParsedMusicLink =
  | { kind: 'youtube'; id: string }
  | { kind: 'spotify'; trackId: string }
  | { kind: 'soundcloud'; url: string }
  | { kind: 'soundcloud-short'; url: string }
  | { kind: 'drive'; fileId: string }
  | { kind: 'rejected'; reason: string };

const SINGLE_SONG = 'Paste a link to a single song';
const UNSUPPORTED = 'Use a YouTube, Spotify, SoundCloud or Google Drive MP3 link';
const DRIVE_FOLDER = 'That is a Drive folder. Paste the link of the audio file itself.';

const rejected = (reason: string): ParsedMusicLink => ({ kind: 'rejected', reason });

// A Spotify track id is 22 letters and digits. Anything else is not one, and the id is used in a cache key.
const SPOTIFY_ID = /^[A-Za-z0-9]{16,32}$/;

/** Recognises what an admin or dancer pasted. Shared so the form and the server apply the same rules. */
export function parseMusicLink(input: string): ParsedMusicLink {
  const text = (input || '').trim();
  if (!text) return rejected(UNSUPPORTED);

  const uri = text.match(/^spotify:([a-z]+):([A-Za-z0-9]+)$/);
  if (uri) {
    if (uri[1] !== 'track') return rejected(SINGLE_SONG);
    return SPOTIFY_ID.test(uri[2]) ? { kind: 'spotify', trackId: uri[2] } : rejected(UNSUPPORTED);
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return { kind: 'youtube', id: text }; // a bare video id

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return rejected(UNSUPPORTED);
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) {
    const id = getYouTubeVideoId(text);
    return id ? { kind: 'youtube', id } : rejected(SINGLE_SONG);
  }

  if (host === 'open.spotify.com') {
    if (parts[0]?.startsWith('intl-')) parts.shift(); // regional links: /intl-ms/track/<id>
    if (parts[0] === 'track') {
      return parts[1] && SPOTIFY_ID.test(parts[1]) ? { kind: 'spotify', trackId: parts[1] } : rejected(UNSUPPORTED);
    }
    return rejected(['album', 'playlist', 'artist', 'show', 'episode'].includes(parts[0]) ? SINGLE_SONG : UNSUPPORTED);
  }

  if (host === 'on.soundcloud.com') {
    return parts[0] ? { kind: 'soundcloud-short', url: `https://on.soundcloud.com/${parts[0]}` } : rejected(UNSUPPORTED);
  }

  if (host === 'soundcloud.com' || host === 'm.soundcloud.com') {
    if (parts.length < 2 || parts.includes('sets')) return rejected(SINGLE_SONG);
    return { kind: 'soundcloud', url: `https://soundcloud.com/${parts[0]}/${parts[1]}` };
  }

  if (host === 'drive.google.com' || host === 'docs.google.com') {
    const drive = extractDriveId(text);
    if (!drive) return rejected(UNSUPPORTED);
    if (drive.kind === 'folder') return rejected(DRIVE_FOLDER);
    if (drive.kind === 'spreadsheet') return rejected(UNSUPPORTED);
    return { kind: 'drive', fileId: drive.id };
  }

  return rejected(UNSUPPORTED);
}

export interface MusicAppLink {
  label: 'Spotify' | 'YouTube' | 'SoundCloud' | 'Download MP3';
  url: string;
}

/** The "open in my own app" buttons for a song, derived from what it stores. Spotify comes first. */
export function musicAppLinks(m: MusicItem): MusicAppLink[] {
  const links: MusicAppLink[] = [];
  if (m.spotifyUrl) links.push({ label: 'Spotify', url: m.spotifyUrl });
  if (m.youtubeId) links.push({ label: 'YouTube', url: `https://www.youtube.com/watch?v=${m.youtubeId}` });
  if (m.soundcloudUrl) links.push({ label: 'SoundCloud', url: m.soundcloudUrl });
  if (m.sourceType === 'mp3' && m.driveFileId) {
    links.push({ label: 'Download MP3', url: `https://drive.google.com/uc?export=download&id=${m.driveFileId}` });
  }
  return links;
}

/** A Spotify-only song has nothing the Studio can play. */
export function canPractise(m: MusicItem): boolean {
  return m.sourceType !== 'spotify';
}

/** What `music.resolveLink` returns: what an admin needs to see before saving a pasted link. */
export interface SpotifyCandidate {
  youtubeId: string;
  title: string;
  channel: string;
  durationSec: number;
  thumbnailUrl: string;
  /** Within 3 s of the Spotify song's length. */
  lengthMatch: boolean;
}

export type ResolvedLink =
  | { kind: 'youtube'; youtubeId: string; title: string; embeddable: boolean }
  | { kind: 'soundcloud'; soundcloudUrl: string; title: string }
  | { kind: 'drive'; driveFileId: string; title: string }
  | {
      kind: 'spotify';
      spotifyUrl: string;
      title: string;
      artist: string;
      durationSec: number;
      candidates: SpotifyCandidate[];
      notice?: 'SEARCH_QUOTA' | 'SEARCH_UNAVAILABLE';
    };
