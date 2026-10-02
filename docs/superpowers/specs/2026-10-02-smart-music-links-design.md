# Smart Music Links — Design

**Date:** 2026-10-02 · **Branch:** `feat/events` · **Builds on:** `docs/superpowers/specs/2026-10-02-media-playback-and-login-speed-design.md`. Its YouTube player fixes (plan Tasks 1–3) must land first.

## Purpose

Admins add class music mostly as **YouTube, Spotify or SoundCloud links**, and occasionally as MP3. Dancers use class music in two ways:
- **Practise in the Studio:** slow down, loop sections, voice cues, synced class video.
- **Open the song in their own app.**

Success: an admin pastes any supported link into one box, and dancers get a working practice track **plus** the right "open in app" buttons. Choreography depends on the exact recording, so a Spotify song is only practised on a YouTube version **the admin has confirmed**.

## Constraints (verified 2026-10-02)

- **Spotify can't be the practice player.**
  - Its embed plays a 30-second preview unless the viewer is logged into Spotify.
  - It has no playback-speed control and is unreliable on phones.
  - Its public track page does give, without login, even to non-browser requests: `og:title` (title), `music:musician_description` (artist), `music:duration` (seconds). `open.spotify.com/intl-xx/track/{id}` redirects (302) to `/track/{id}`.
- **SoundCloud** has an official Widget API (`https://w.soundcloud.com/player/api.js`): play, pause, `seekTo(ms)`, `getPosition`, `getDuration`, and events. It has **no playback rate**. `https://soundcloud.com/oembed?format=json&url=…` gives the title (`"<track> by <artist>"`).
- **YouTube Data API v3** (Apps Script advanced service `YouTube`) is **free with no billing**:
  - 10,000 units per day.
  - `search.list` = 100 units, so about 100 Spotify songs per day.
  - `videos.list` = 1 unit.
  - The quota resets at midnight Pacific (3–4 pm Malaysia time).
- **Out of scope:** playlists or albums, Apple Music, TikTok/Instagram.

## 1. Data model and link recognition

`MusicItem` (`shared/src/types.ts`) changes:
- `sourceType: 'mp3' | 'youtube' | 'soundcloud' | 'spotify'`. `'spotify'` means **listen-only**: there is no practice source.
- New fields `soundcloudUrl: string` (canonical `https://soundcloud.com/{user}/{track}`) and `spotifyUrl: string` (canonical `https://open.spotify.com/track/{id}`). Both default to `''`.
- `spotifyUrl` may be set alongside `sourceType` `youtube`/`soundcloud`/`mp3` when the song came from Spotify.
- The Music sheet gains the two columns. Existing rows read as `''`, and existing YouTube/MP3 songs keep working unchanged.

**Open-in-app buttons are derived, not stored:**
- YouTube → `https://www.youtube.com/watch?v={youtubeId}`
- SoundCloud → `soundcloudUrl`
- Spotify → `spotifyUrl`
- MP3 → the Drive download URL

`parseMusicLink(input: string)` lives in `shared/src/musicLinks.ts`, so the web form and the API use the same rules:

| Input | Result |
|---|---|
| `youtube.com/watch?v=`, `youtu.be/`, `music.youtube.com/watch?v=`, `/shorts/`, `/embed/`, bare 11-char id | `{ kind: 'youtube', id }` |
| `open.spotify.com/track/{id}`, `open.spotify.com/intl-xx/track/{id}`, `spotify:track:{id}` | `{ kind: 'spotify', trackId }` |
| `soundcloud.com/{user}/{track}` (query stripped; not `/sets/`) | `{ kind: 'soundcloud', url }` |
| `on.soundcloud.com/{code}` | `{ kind: 'soundcloud-short', url }` (server resolves) |
| `drive.google.com/file/d/{id}/…`, `drive.google.com/open?id={id}` | `{ kind: 'drive', fileId }` |
| Spotify album/playlist/artist, SoundCloud `/sets/` | `{ kind: 'rejected', reason: 'Paste a link to a single song' }` |
| anything else | `{ kind: 'rejected', reason: 'Use a YouTube, Spotify, SoundCloud or Google Drive MP3 link' }` |

## 2. Admin: paste and confirm

`MusicForm` has one **Music link** box (replacing the YouTube URL field), a **Track Title** field and the existing session field.

When the admin pastes (debounced 500 ms), the web calls the new API action `music.resolveLink` with `{ url }` (perm `music.edit`, read-only). It returns:

```ts
type ResolvedLink =
  | { kind: 'youtube'; youtubeId: string; title: string; embeddable: boolean }
  | { kind: 'soundcloud'; soundcloudUrl: string; title: string }
  | { kind: 'drive'; driveFileId: string; title: string }
  | { kind: 'spotify'; spotifyUrl: string; title: string; artist: string; durationSec: number; notice?: 'SEARCH_QUOTA';
      candidates: { youtubeId: string; title: string; channel: string; durationSec: number; thumbnailUrl: string; lengthMatch: boolean }[] };
```

All outside calls go through two new ports on `Ctx` (`api/src/ports.ts`), so tests can fake them, following the existing `drive`/`cache` pattern:
- `http.fetch(url, { followRedirects?: boolean }): { status: number; headers: Record<string, string>; body: string }` wraps `UrlFetchApp` with `muteHttpExceptions`.
- `youtube.search(q: string, max: number)` and `youtube.videos(ids: string[])` wrap the advanced service. A quota failure throws `AppError('QUOTA', …)`.

**YouTube links:**
- Title from YouTube oEmbed (`UrlFetchApp`, no quota).
- `embeddable = false` when oEmbed returns 401/403. The form then warns before saving: *"This video blocks playback outside YouTube, so dancers can't practise with it. Try the 'Official Audio' version."*

**SoundCloud links:**
- Short links are resolved with `followRedirects: false`, reading the `Location` header.
- Title from SoundCloud oEmbed. A 404 or 403 rejects with *"This SoundCloud track can't be played on other websites."*

**Drive links:**
- `ctx.drive.info`. A mimeType not starting with `audio/` is rejected: *"This Drive file isn't an audio file."*
- On save, the existing MP3 path runs `setAnyoneReader` as it does today.

**Spotify links:**
1. Fetch `https://open.spotify.com/track/{id}` and read the three meta tags.
2. Search with `YouTube.Search.list('snippet', { q: '{artist} {title}', type: 'video', videoEmbeddable: 'true', maxResults: 10 })`.
3. Get durations with `YouTube.Videos.list('contentDetails,snippet', { id })`.
4. Rank:
   1. `|duration − spotifyDuration| ≤ 3 s` first.
   2. Then channel ending in `" - Topic"`, or a title containing `Official Audio`/`Audio`.
   3. Push down titles containing `MV`, `Music Video`, `Official Video`, `Live`, `Remix`, `Cover`, unless the Spotify title contains the same word.
5. Return the top 3. `lengthMatch` marks the ±3 s ones.
6. Cache the whole result 6 hours under `spotify:{trackId}` via `safeCachePut`.

**Spotify confirmation panel (always shown; the admin must choose):**
- The Spotify song line: *title · artist · m:ss*.
- 3 candidate cards, each with: thumbnail, title, channel, length with *✓ same length* or *✗ different length — check the version*, a **▶ Listen** button (a small YouTube embed), and **Use this**.
- **Paste my own practice link:** a YouTube, SoundCloud or Drive MP3 link, resolved as above. `spotifyUrl` is kept.
- **Save as listen-only** saves `sourceType: 'spotify'`.

**Saving:** `music.create`/`music.update` accept `{ url, chosenYoutubeId?, practiceUrl?, listenOnly?, title, … }`. The server re-parses `url` and derives the stored fields, so it never trusts client-built ids. Editing a song uses the same box.

## 3. Dancers: class card and Studio

**Class card music row:**
- Title and source badge.
- **▶ PRACTISE IN STUDIO** unless `sourceType === 'spotify'`.
- App buttons for every link the song has: **Open in Spotify / Open in YouTube / Open in SoundCloud / Download MP3**.
- No embedded music video.

**Studio:**
- `useAudioPlayer` gains source `'soundcloud'`, backed by a new `SoundCloudPlayer` component (`web/src/features/music-studio/dancecue/components/SoundCloudPlayer.tsx`):
  - Small visible widget iframe `https://w.soundcloud.com/player/?url={soundcloudUrl}&auto_play=false&visual=false&show_comments=false`.
  - It reuses the tap-to-start rule from the media plan's Task 2.
  - Play, pause, seek, loops, sections and synced video work through the widget.
  - The speed control is disabled, with *"Speed isn't available for SoundCloud songs."*
- Personal-loop keys gain `{ type: 'sc', url }`.
- The dancer's **YouTube** tab becomes **Link** and accepts YouTube or SoundCloud. A Spotify link shows *"Spotify songs can't be played here. Paste the YouTube version, or open it in Spotify."* Dancers never trigger a search.

## 4. Errors and testing

| Condition | Behaviour |
|---|---|
| `search.list` throws a quota error | `music.resolveLink` returns the Spotify info with `candidates: []` and `notice: 'SEARCH_QUOTA'`. The form shows *"Search limit reached for today. Paste the YouTube link yourself or try after 4 pm."* Manual paste and listen-only still work. |
| Spotify page missing the meta tags / fetch fails | Error code `LINK_INVALID`, message *"Couldn't read this Spotify song. Paste the YouTube version instead."* |
| No candidate within ±3 s | The top 3 are still returned with `lengthMatch: false`. |
| A widget reports "not found" in the Studio (YouTube `onError`, SoundCloud `ERROR` event) | *"This song is no longer available"*; app buttons remain. |

**Tests:**
- `shared` unit tests for every row of the `parseMusicLink` table.
- API tests with fake fetch/YouTube ports and recorded responses: ranking order, quota error, unreadable Spotify page, cache hit (second resolve makes no search call), and the server re-deriving ids on save.
- Web tests: MusicForm Spotify flow (paste → 3 cards → Use this → correct `music.create` payload); ClassCard buttons per source type; SoundCloudPlayer with a mocked `SC.Widget` (play, seek, loop restart, speed disabled).
- One real-browser check with a public SoundCloud track (`https://soundcloud.com/forss/flickermood`).

**Owner setup (one time):**
1. In the Apps Script editor → Services → add **YouTube Data API v3**. This adds the `youtube.readonly` scope to `api/appsscript.json`.
2. Run `authorizeOnce` once as the club account to approve the new permission.
3. Deploy to `AKfycbz3z…` as usual.
