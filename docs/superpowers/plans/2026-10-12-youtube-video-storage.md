# Class Videos on YouTube — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New class videos live on the UMDSC YouTube channel (unlisted) and are matched to their class by a tag in the title; old Drive videos are copied over; music becomes links only; dancers see no other change.

**Architecture:** A video row keeps its id and gains `youtubeId`. The class lead uploads inside YouTube with a title the website gives them (`… · #TAG`, tag derived from the row id). The Apps Script API (running as the club account) reads the channel's uploads, finds tags and writes `youtubeId` once YouTube can play the video. The web plays `youtubeId` videos in YouTube's player; the Studio keeps the video in step with the music through a small `FollowerVideo` interface that both `<video>` and a YouTube player wrapper implement.

**Tech Stack:** TypeScript monorepo (`shared/`, `api/` Google Apps Script via clasp, `web/` React + Vite + TanStack Query, Cloudflare Workers static hosting). Tests: vitest in each workspace, Playwright e2e in `web/e2e`.

**Spec:** `docs/superpowers/specs/2026-10-12-youtube-video-storage-design.md` — read it before starting any task.

## Global Constraints

- Work in a git worktree on branch `feat/youtube-videos` (superpowers:using-git-worktrees). Do not push the branch before Task 17: Cloudflare builds what is pushed.
- Never change the live deployment `AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA` before Task 17, and only after the owner says yes.
- Never move any deployment (trial or live) to a version whose manifest adds a scope before the owner has run `authorizeOnce` for it.
- Nothing deletes, renames or moves a Drive file, except `videos.deactivate` trashing the Drive copy of the video being deleted.
- Tag alphabet: `ABCDEFGHJKMNPQRSTUVWXYZ23456789`; tag = `#` + 6 characters; never stored in the sheet.
- `youtubeId` is written only when the video's status is `ready`.
- `videos.checkYouTube` bumps the data version only when it wrote at least one `youtubeId`.
- Dancers never receive a waiting row (no `youtubeId` and no `driveFileId`).
- No Download button for any video anywhere; dancers get **OPEN IN YOUTUBE ↗** for YouTube videos.
- New or changed music may not reference a Drive file. Refusal text: `MP3 files are no longer added. Paste a YouTube, SoundCloud or Spotify link instead.`
- User-facing copy for statuses is exactly the table in Task 10.
- Run from the repo root unless a step says otherwise: `npm test` (all workspaces), `npm run build` (all workspaces).

## Review Focus

1. **The live site edits a row the trial already matched** (shared spreadsheet; the live codec blanks `youtubeId`). Expected: the next check writes it again. Pinned by `checkYouTube re-attaches a row whose youtubeId was blanked` (Task 6).
2. **The same tag appears on two YouTube uploads** (class lead uploaded twice). Expected: the newest playable one wins, no error. Pinned by `checkYouTube picks the newest ready upload when a tag is on two uploads` (Task 6).
3. **A YouTube id already attached to another row is pasted or found again.** Expected: refused with the other row's title; never two rows on one YouTube video. Pinned by `linkYouTube refuses a video already linked to another row` and `checkYouTube never attaches one youtubeId to two rows` (Tasks 6–7).
4. **A class lead with rights for one style triggers a check.** Expected: the statuses returned are only for their styles. Pinned by `checkYouTube returns statuses only for the caller's styles` (Task 6).
5. **The YouTube player keeps getting the same speed request every animation frame.** Expected: `setPlaybackRate` is called only when the snapped rate changes. Pinned by `youTubeFollower calls setPlaybackRate only when the snapped rate changes` (Task 8).

---

## Task 0: Owner setup and the sync spike (STOP POINT)

**Files:**
- Create: `spikes/youtube-sync/index.html`, `spikes/youtube-sync/main.js`
- Modify: this plan's "Spike results" section at the bottom

🧑 **OWNER ACTION (before the spike), on `umdancesportc@gmail.com`:**
1. Create a YouTube channel on this account itself (youtube.com → profile → Create a channel). Not a separate brand channel.
2. Verify it by phone at https://www.youtube.com/verify (lifts the 15-minute upload limit).
3. YouTube Studio → Settings → Upload defaults: Visibility **Unlisted**; Advanced → audience **No, it's not made for kids**; **Allow embedding** ticked.
4. Turn on 2-step verification for the account.
5. Upload one real class video (any length over 1 minute) as Unlisted and send its link plus the music file it was danced to.

- [ ] **Step 1: Build the spike page**

A plain HTML + JS page (no React, throwaway), served with `npx vite spikes/youtube-sync --host --port 5174`:
- A file input for the music (an `<audio>` element is the master) and a text box for the YouTube link (load `https://www.youtube.com/iframe_api`, create a muted `YT.Player` with `playerVars: { controls: 0, playsinline: 1, rel: 0 }` on `https://www.youtube-nocookie.com`).
- Buttons: speed 0.75 / 1 / 1.25 (sets `audio.playbackRate`, and the player to the nearest value of `getAvailablePlaybackRates()`), seek threshold 0.2 / 0.3 / 0.4 s, Loop 10 s (jump the audio back every 10 s and seek the video to the same point).
- Each animation frame: `drift = player.getCurrentTime() - audio.currentTime`; if `|drift| > threshold` then `player.seekTo(audio.currentTime, true)` and count a seek. Ignore frames while the player state is BUFFERING.
- Show live: median |drift|, 90th percentile |drift|, seeks per minute, current snapped rate, `getAvailablePlaybackRates()` output.

- [ ] **Step 2: Measure**

Run 2 minutes at each speed, with each threshold, plus one loop run, on the owner's phone (same Wi-Fi, `http://<PC IP>:5174`) and on a desktop browser.
Pass when, at every speed on both devices, for the best threshold: median |drift| ≤ 0.15 s, 90th percentile ≤ 0.35 s, ≤ 6 seeks per minute, and the owner says the video looks in step with the music.

- [ ] **Step 3: Record results and decide**

Write the numbers and the chosen threshold into "Spike results" below. If it passes, set `YOUTUBE_FOLLOWER_SEEK_S` (Task 8) to the chosen threshold. **If it fails, STOP the plan**, and report the numbers to the owner with what failed. Do not start Task 1.

- [ ] **Step 4: Commit**

```bash
git add spikes/youtube-sync docs/superpowers/plans/2026-10-12-youtube-video-storage.md
git commit -m "spike: YouTube player follows the music (throwaway)"
```

---

## Task 1: Shared tag, title and playability helpers

**Files:**
- Create: `shared/src/videoTag.ts`, `shared/src/videoTag.test.ts`
- Modify: `shared/src/index.ts` (export), `shared/src/types.ts:67-68` (`VideoItem`), and add the status types below to `shared/src/types.ts`

**Interfaces:**
- Produces:
  - `TAG_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'`
  - `videoTag(id: string): string` — `#` + 6 chars
  - `findTags(text: string): string[]` — uppercase tags found, without duplicates, in order
  - `classDateLabel(isoDate: string): string` — `'2026-10-14'` → `'14 Oct 2026'`
  - `youtubeTitleFor(isoDate: string, styleName: string, seq: number, tag: string): string` — `'14 Oct 2026 · Locking Class 3 · #HBEKKG'`
  - `videoIsPlayable(v: Pick<VideoItem, 'youtubeId' | 'driveFileId'>): boolean`
  - `VideoItem` gains `youtubeId: string`; `source: 'upload' | 'scan' | 'youtube'`
  - `type YouTubeVideoStatus = 'waiting' | 'processing' | 'private' | 'not-embeddable' | 'blocked' | 'ready'`
  - `interface VideoCheckResult { id: string; status: YouTubeVideoStatus; youtubeId: string; isPublic: boolean }`
  - `interface MoveListItem { id: string; title: string; eventId: string; styleId: string; sessionId: string; driveFileId: string; sizeBytes: number; mimeType: string; tag: string; fileName: string; moved: boolean }`

- [ ] **Step 1: Write the failing tests** in `shared/src/videoTag.test.ts`

```ts
it('videoTag is fixed per id', () => {
  expect(videoTag('vid_abc123XYZ')).toBe('#HBEKKG');
  expect(videoTag('vid_0')).toBe('#W3H7PQ');
});
it('videoTag gives 5000 different tags for vid_0..vid_4999', () => {
  const tags = new Set(Array.from({ length: 5000 }, (_, i) => videoTag('vid_' + i)));
  expect(tags.size).toBe(5000);
});
it('findTags reads tags in any case and ignores longer words', () => {
  expect(findTags('14 Oct 2026 · Locking Class 3 · #hbekkg')).toEqual(['#HBEKKG']);
  expect(findTags('#HBEKKG and #HBEKKG #W3H7PQ')).toEqual(['#HBEKKG', '#W3H7PQ']);
  expect(findTags('#HBEKKGX #HBEK #10OIL1')).toEqual([]);
});
it('youtubeTitleFor builds the title', () => {
  expect(youtubeTitleFor('2026-10-14', 'Locking', 3, '#HBEKKG')).toBe('14 Oct 2026 · Locking Class 3 · #HBEKKG');
});
it('videoIsPlayable needs a YouTube or Drive id', () => {
  expect(videoIsPlayable({ youtubeId: '', driveFileId: '' })).toBe(false);
  expect(videoIsPlayable({ youtubeId: 'abcdefghijk', driveFileId: '' })).toBe(true);
  expect(videoIsPlayable({ youtubeId: '', driveFileId: 'd1' })).toBe(true);
});
```

- [ ] **Step 2: Run** `npm test -w shared` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `shared/src/videoTag.ts`. `videoTag`: FNV-1a 32-bit over the id's UTF-16 code units (`h = 0x811c9dc5`; per unit `h ^= code; h = Math.imul(h, 0x01000193) >>> 0`), then `h % 31**6` written as 6 base-31 digits in `TAG_ALPHABET`, most significant first. `findTags`: regex `/#([ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6})(?![A-Za-z0-9])/gi`. `classDateLabel` uses fixed English month abbreviations (no locale APIs). Update `VideoItem` and add the types.

- [ ] **Step 4: Run** `npm test -w shared` — Expected: PASS. Then `npm run build -w shared`.

- [ ] **Step 5: Commit** — `git commit -m "feat(shared): video tag, YouTube title and playability helpers"`

---

## Task 2: Store `youtubeId`, and allow a route to bump the data version conditionally

**Files:**
- Modify: `api/src/db/schema.ts:16` (add `'youtubeId'` after `'source'`), `api/src/db/db.ts:365-385` (videos codec reads/writes `youtubeId`, default `''`), `api/src/router.ts:33-40,145-148`
- Test: `api/test/db/table.test.ts`, `api/test/router.test.ts`

**Interfaces:**
- Produces: `Route.bumpsData?: boolean | ((result: R) => boolean)` — the router bumps when it is `true`, or when the function returns `true` for the handler's result.

- [ ] **Step 1: Failing tests**
  - `videos codec keeps youtubeId` — insert a video with `youtubeId: 'abcdefghijk'`, read it back, expect the same value; a row from a sheet without the column reads `''`.
  - `a bumpsData function bumps only when it returns true` — register two write routes returning `{ n: 0 }` and `{ n: 1 }` with `bumpsData: r => r.n > 0`; expect `DATA_VERSION` unchanged after the first, +1 after the second.
- [ ] **Step 2: Run** `npm test -w api` — Expected: FAIL on both.
- [ ] **Step 3: Implement** the schema column, the codec field, and the router check `typeof route.bumpsData === 'function' ? route.bumpsData(res) : route.bumpsData`.
- [ ] **Step 4: Run** `npm test -w api` — Expected: PASS (whole API suite).
- [ ] **Step 5: Commit** — `git commit -m "feat(api): youtubeId column and conditional data-version bump"`

---

## Task 3: YouTube port for the channel, status and delete; new scope

**Files:**
- Modify: `api/src/ports.ts:102-119`, `api/src/gas/adapters.ts:400-445`, `api/test/fakes/fakeYouTube.ts`, `api/appsscript.json`
- Test: `api/test/fakes/fakePorts.test.ts`

**Interfaces:**
- Produces (added to `YouTubePort`; `search` and `videos` unchanged):
  - `myChannelId(): string` — `Channels.list('id', { mine: true })`
  - `channelUploads(): YouTubeUpload[]` — `{ youtubeId, title, description, publishedAt }`; reads the uploads playlist id from `Channels.list('contentDetails', { mine: true })`, then every page of `PlaylistItems.list('snippet', { playlistId, maxResults: 50, pageToken })`
  - `videoStatus(ids: string[]): YouTubeStatusInfo[]` — `{ youtubeId, channelId, privacy: 'public'|'unlisted'|'private', uploadStatus: string, embeddable: boolean, rejectionReason: string }` via `Videos.list('status,snippet', { id })`, 50 ids per call; unknown ids are left out
  - `remove(id: string): boolean` — `Videos.remove(id)`; true when deleted or the API answers 404/notFound; false on any other error
  - All errors go through the existing `youTubeError` (QUOTA vs INTERNAL), except `remove`, which returns false.
- `FakeYouTube` gains `setChannel(id)`, `setUploads(list)`, `setStatus(map)`, `removeCalls: string[]`, `failRemove(ids)`.

- [ ] **Step 1: Failing test** `FakeYouTube serves channel, uploads, status and remove` in `fakePorts.test.ts`: it covers each new method, including `remove` returning false for an id passed to `failRemove`.
- [ ] **Step 2: Run** `npm test -w api` — Expected: FAIL.
- [ ] **Step 3: Implement** the port types, the fake and the GAS adapter. In `api/appsscript.json`, replace `https://www.googleapis.com/auth/youtube.readonly` with `https://www.googleapis.com/auth/youtube`.
- [ ] **Step 4: Run** `npm test -w api && npm run build -w api` — Expected: PASS, and the build writes `api/dist`.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): YouTube channel uploads, status and delete port"`

---

## Task 4: `videos.startYouTube` and hiding waiting rows from dancers

**Files:**
- Modify: `api/src/features/videos.ts`, `api/src/features/bootstrap.ts:285-300` (`getDancerChunk`)
- Test: `api/test/features/videos.test.ts`, `api/test/features/bootstrap.test.ts`

**Interfaces:**
- Consumes: `videoTag`, `youtubeTitleFor`, `videoIsPlayable` (Task 1).
- Produces: route `videos.startYouTube` — perm `videos.upload`, `write: true`, `styleOf: sessionStyle`, `bumpsData: false`. Payload `{ sessionId: string }`; returns `{ video: VideoItem, tag: string, title: string }`.

- [ ] **Step 1: Failing tests**
  - `startYouTube creates a waiting row with a unique tag`: the row has `source: 'youtube'`, `driveFileId: ''`, `youtubeId: ''`, `title` = `'<d MMM yyyy> <Style> Class <seq>'`; the returned `title` equals `youtubeTitleFor(session.date, style.name, session.seq, tag)`; the returned `tag` equals `videoTag(video.id)`.
  - `startYouTube retries the id when its tag is taken`: stub the id generator so the first id's tag equals an existing row's tag; expect a different final id.
  - `startYouTube refuses an unknown class` → `NOT_FOUND`; a style-limited user on another style → `FORBIDDEN`.
  - `dancers never get waiting rows`: insert a waiting row on a class the dancer registered for; it is absent from the dancer's `videos.list` and from `getDancerChunk(...).videos`, while admin `videos.list` includes it.
- [ ] **Step 2: Run** `npm test -w api` — Expected: FAIL.
- [ ] **Step 3: Implement.** (For the retry test, `vi.mock('../../src/db/ids')`.) Generate the id with `newId('vid')` and pass it to `insert` as `id`. Retry while `videoTag(id)` matches any video row's tag (active or not), at most 20 times; after that throw `INTERNAL`. Apply `videoIsPlayable` in the dancer branch of `videos.list` and in `getDancerChunk`.
- [ ] **Step 4: Run** `npm test -w api` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): start a YouTube video for a class; dancers skip waiting rows"`

---

## Task 5: Status rules

**Files:**
- Create: `api/src/logic/youtubeStatus.ts`, `api/test/logic/youtubeStatus.test.ts`

**Interfaces:**
- Produces: `youtubeStatusOf(info: YouTubeStatusInfo | undefined): { status: YouTubeVideoStatus; isPublic: boolean }`

- [ ] **Step 1: Failing test** `youtubeStatusOf maps YouTube state` (table-driven):

| info | status | isPublic |
|---|---|---|
| `undefined` | `waiting` | false |
| uploadStatus `failed` or `rejected`, or `rejectionReason` non-empty | `blocked` | false |
| uploadStatus `uploaded` | `processing` | false |
| uploadStatus `processed`, privacy `private` | `private` | false |
| processed, unlisted, embeddable false | `not-embeddable` | false |
| processed, unlisted, embeddable | `ready` | false |
| processed, public, embeddable | `ready` | true |

Check the conditions in the table's order.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `npm test -w api` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): YouTube video status rules"`

---

## Task 6: `videos.checkYouTube`

**Files:**
- Modify: `api/src/features/videos.ts`
- Test: `api/test/features/videosYouTube.test.ts` (new; set up the context the same way `videos.test.ts` does)

**Interfaces:**
- Consumes: `channelUploads`, `videoStatus` (Task 3); `youtubeStatusOf` (Task 5); `findTags`, `videoTag` (Task 1); `bumpsData` as a function (Task 2).
- Produces: route `videos.checkYouTube` — perm `videos.upload`, `write: true`, `bumpsData: r => r.attached > 0`. Payload `{ ids?: string[] }`; returns `{ results: VideoCheckResult[]; attached: number }`.

Behaviour:
1. Candidates = active rows with an empty `youtubeId`. If there are no candidates and no `ids`, return `{ results: [], attached: 0 }` without calling YouTube.
2. Tag map: from `ctx.cache` key `yt:tags:v1` (60 s), else build it from `channelUploads()`. Each upload's title and description go through `findTags`; the map is `tag → [{ youtubeId, publishedAt }]`. Cache it with `safeCachePut`.
3. One `videoStatus` call (in batches of 50) covers every candidate match plus every requested row that already has a `youtubeId`.
4. For each candidate, take its tag's uploads, newest first, and use the first one whose status is `ready` and whose id no other active row holds. Write `youtubeId` with `ctx.db.videos.update(id, row.version, { youtubeId })` and count it in `attached`. Log `videos.attachYouTube` to the audit log.
5. `results` holds one entry per requested id (or, without `ids`, per candidate), but only for rows of styles where the caller has `videos.upload` (`can(perms, 'videos.upload', row.styleId)`). The status is that of the newest upload for its tag, `waiting` when there is none, and the attached video's own status after attaching.

- [ ] **Step 1: Failing tests**
  - `checkYouTube attaches a ready upload by its tag` (bumps DATA_VERSION by 1)
  - `checkYouTube reports processing and does not attach` (no bump)
  - `checkYouTube does not attach a private or not-embeddable upload`
  - `checkYouTube attaches an old Drive row and keeps driveFileId`
  - `checkYouTube re-attaches a row whose youtubeId was blanked`
  - `checkYouTube picks the newest ready upload when a tag is on two uploads`
  - `checkYouTube never attaches one youtubeId to two rows`
  - `checkYouTube returns statuses only for the caller's styles` (style-limited token)
  - `checkYouTube makes no YouTube call when nothing waits`
  - `checkYouTube reads the channel once per minute` (two calls within 60 s → `channelUploads` called once)
  - `checkYouTube flags a public video` (`isPublic: true`, still attached)
- [ ] **Step 2: Run** `npm test -w api` — FAIL.
- [ ] **Step 3: Implement** as described.
- [ ] **Step 4: Run** `npm test -w api` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): match channel uploads to classes by tag"`

---

## Task 7: `videos.linkYouTube`, `videos.moveList`, delete, music refusal, old routes removed

**Files:**
- Modify: `api/src/features/videos.ts`, `api/src/features/music.ts:60-200`
- Test: `api/test/features/videosYouTube.test.ts`, `api/test/features/music.test.ts`, `api/test/features/musicFromLink.test.ts`, `api/test/features/videos.test.ts`, `api/test/features/styleScopedMedia.test.ts`

**Interfaces:**
- Produces:
  - `videos.linkYouTube` — perm `videos.upload`, `write: true`, `styleOf: videoStyle`, `bumpsData: r => r.attached`. Payload `{ id, url }`; returns `{ status: YouTubeVideoStatus; attached: boolean }`.
  - `videos.moveList` — perm `settings.edit`, `write: false`. Returns `MoveListItem[]` for active rows with a `driveFileId`, sorted by event, then class date.
  - `videos.deactivate` (changed) returns `{ deactivated: boolean; youtubeDeleted: boolean; driveTrashed: boolean }`.

Rules:
- `linkYouTube`: get the id with `getYouTubeVideoId` (shared), else `VALIDATION` "That is not a YouTube link." If `videoStatus` is empty or its `channelId !== myChannelId()`, return `VALIDATION` "This video isn't on the UMDSC channel." If another active row holds the id, return `VALIDATION` `This YouTube video is already linked to "<title>".` If not `ready`, return `{ status, attached: false }` and do not write. Otherwise write it and return `{ status: 'ready', attached: true }`.
- `moveList`: `tag = videoTag(id)`; `fileName = <title without a trailing .ext, with / \ : * ? " < > | removed> + ' ' + tag + ext`; `ext` comes from the title's own extension if it had one, else from mimeType (`video/quicktime` → `.mov`, `video/webm` → `.webm`, anything else → `.mp4`); `moved = youtubeId !== ''`. If two listed rows share a tag, throw `VALIDATION` `Two videos share the tag <tag>: "<a>" and "<b>".`
- `deactivate`: if `youtubeId` is set, call `remove()`. If that fails, do not deactivate; return `{ deactivated: false, youtubeDeleted: false, driveTrashed: false }`. Next, if `driveFileId` is set, call `ctx.drive.deleteFile` as a best-effort step: a failure no longer blocks the delete. Then deactivate and return the flags. A waiting row (neither id) is simply deactivated. **Decision:** Drive trash is now best-effort, because the Google sign-in retry on the website is removed (Task 11).
- Remove the routes `videos.targetFolder`, `videos.register`, `videos.scan` and their tests.
- Music: in `music.create` and `music.update`, refuse with the Global Constraints text when the legacy `sourceType` is `'mp3'`, a `driveFileId` is sent, or the derived source from a link has a non-empty `driveFileId`. Updating only the title or class of an existing MP3 item still works.

- [ ] **Step 1: Failing tests**
  - `linkYouTube attaches a ready video from the club channel`
  - `linkYouTube refuses another channel's video`
  - `linkYouTube refuses a video already linked to another row`
  - `linkYouTube returns processing without writing`
  - `moveList lists Drive rows with tag and file name` (title `IMG_0042.MOV`, mimeType `video/quicktime` → `IMG_0042 #<tag>.MOV`; title `Class 3`, `video/mp4` → `Class 3 #<tag>.mp4`)
  - `moveList is refused without settings.edit`
  - `deactivate deletes on YouTube then trashes Drive`
  - `deactivate keeps the row when YouTube delete fails`
  - `deactivate still deactivates when the Drive trash fails`
  - `music.create refuses a Drive MP3 link`; `music.update refuses a new Drive MP3 link but keeps a title edit on an old MP3 item`
- [ ] **Step 2: Run** `npm test -w api` — FAIL.
- [ ] **Step 3: Implement**, deleting the three old routes and every test that only covers them.
- [ ] **Step 4: Run** `npm test -w api && npm run build -w api` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): manual YouTube link, move list, YouTube delete; music links only"`

---

## Task 8: Studio sync with a YouTube follower

**Files:**
- Create: `web/src/features/music-studio/sync/followerVideo.ts`, `web/src/lib/youtube/youTubeFollower.ts`, `web/src/lib/youtube/youTubeFollower.test.ts`, `web/src/lib/youtube/youtubeUrls.ts`
- Modify: `web/src/features/music-studio/sync/syncMath.ts`, `syncMath.test.ts`, `useSyncedVideo.ts`, `useSyncedVideo.test.ts`, `web/src/features/music-studio/dancecue/components/YouTubePlayer.tsx:75` (export `loadYouTubeApi`)

**Interfaces:**
- Produces:
  - `interface FollowerVideo { currentTime: number; playbackRate: number; muted: boolean; readonly paused: boolean; play(): Promise<void> | void; pause(): void; addEventListener(type: 'waiting' | 'canplay' | 'playing', fn: () => void): void; removeEventListener(type: 'waiting' | 'canplay' | 'playing', fn: () => void): void }`. `HTMLVideoElement` must satisfy it, which `tsc -b` checks.
  - `createYouTubeFollower(player: YT.Player): FollowerVideo` — `currentTime` get → `getCurrentTime()`, set → `seekTo(t, true)`; `playbackRate` set → nearest value of `getAvailablePlaybackRates()`, calling `setPlaybackRate` only when that nearest value changes; `muted` → `mute()`/`unMute()`/`isMuted()`; `paused` → state is not PLAYING (1); events come from `onStateChange` (BUFFERING 3 → `waiting`; PLAYING 1 → `playing` and `canplay`). The wrapper needs the player's state-change callback: export `attachStateListener(player, fn)`, or take an `onStateChange` registrar as a second parameter, whichever fits `YT.Player` typing.
  - `YOUTUBE_FOLLOWER_SEEK_S` = the spike's chosen threshold (Task 0).
  - `decideCorrection(expected, actual, baseRate, master, follower: 'video' | 'youtube' = 'video')` — for `'youtube'`: seek when `|drift| > YOUTUBE_FOLLOWER_SEEK_S`, otherwise `none`; it never nudges.
  - `useSyncedVideo({ ..., videoRef: RefObject<FollowerVideo | null>, follower?: 'video' | 'youtube' })`.
  - `youtubeEmbedUrl(id) = 'https://www.youtube-nocookie.com/embed/<id>?rel=0&playsinline=1'`, `youtubeWatchUrl(id) = 'https://youtu.be/<id>'`.

- [ ] **Step 1: Failing tests**
  - `decideCorrection never nudges a YouTube follower` (drift 0.1 → none; drift above the threshold → seek)
  - `youTubeFollower snaps the rate to an available value` (available `[0.25,0.5,0.75,1,1.25,1.5,2]`, set 0.95 → `setPlaybackRate(1)`)
  - `youTubeFollower calls setPlaybackRate only when the snapped rate changes` (set 1.0 three times → one call)
  - `youTubeFollower maps buffering and playing to events`
  - `useSyncedVideo seeks a YouTube follower but never changes its rate for drift` (fake follower)
- [ ] **Step 2: Run** `npm test -w web` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w web && npm run build -w web` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(studio): YouTube video follows the music"`

---

## Task 9: Playback on class cards, Media rows and the Studio

**Files:**
- Create: `web/src/features/music-studio/sync/YouTubeFollowerPlayer.tsx` (+ `.test.tsx`)
- Modify: `web/src/features/calendar/ClassCard.tsx:195-340`, `ClassCard.test.tsx`, `web/src/features/music-studio/Studio.tsx:237-290`, `FullscreenStudio.tsx:690-740,890-910`, `FullscreenStudio.test.tsx`, `sync/VideoPanel.tsx:140-460`, `VideoPanel.test.tsx`

**Interfaces:**
- Consumes: `FollowerVideo`, `createYouTubeFollower`, `loadYouTubeApi`, `youtubeEmbedUrl`, `youtubeWatchUrl` (Task 8).
- Produces: `<YouTubeFollowerPlayer youtubeId title onFollower={(f: FollowerVideo | null) => void} />`. It creates a muted `YT.Player` with `host: 'https://www.youtube-nocookie.com'` and `playerVars: { controls: 0, playsinline: 1, rel: 0 }`, calls `onFollower(follower)` when the player is ready and `onFollower(null)` on unmount, and shows "This video can't be played on YouTube" on the player's `onError`.

Rules:
- ClassCard: a video with `youtubeId` is an `<iframe src={youtubeEmbedUrl(id)}>` with one action, **OPEN IN YOUTUBE ↗** (`youtubeWatchUrl`). A Drive-only video keeps the Drive preview iframe. Remove every Download, `Drive ↗`, **OPEN IN DRIVE ↗** and class-lead folder link (lines ~201 and ~329). Hide the size label when `sizeBytes` is 0.
- Studio / VideoPanel / FullscreenStudio: when the chosen video has `youtubeId`, render `YouTubeFollowerPlayer` instead of `<video>`. Point the sync ref at the follower and pass `follower: 'youtube'` to `useSyncedVideo`. Hide the Drive-preview toggle and the "Open in Drive" link for these videos. Drive-only and local videos behave exactly as today.

- [ ] **Step 1: Failing tests**
  - `ClassCard shows a YouTube player and Open in YouTube, no download` (`queryByText('DOWNLOAD')` is null; the iframe src starts with `https://www.youtube-nocookie.com/embed/`)
  - `ClassCard shows no download or Drive link for a Drive-only video`
  - `VideoPanel uses the YouTube follower for a youtubeId video` (mock `YouTubeFollowerPlayer`)
  - `FullscreenStudio uses the YouTube follower for a youtubeId video`
  - `YouTubeFollowerPlayer reports a follower and shows the error text` (mock `window.YT`)
- [ ] **Step 2: Run** `npm test -w web` — FAIL. **Step 3: Implement.** **Step 4: Run** `npm test -w web && npm run build -w web` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): play YouTube class videos; no video downloads"`

---

## Task 10: Add-video dialog, status and checking on the Media page

**Files:**
- Create: `web/src/features/media/AddYouTubeVideoDialog.tsx` (+ test), `web/src/features/media/useYouTubeCheck.ts` (+ test), `web/src/features/media/VideoStatusBadge.tsx`
- Modify: `web/src/features/media/MediaPage.tsx` (video panel lines ~426-624, delete mutation ~139-161)

**Interfaces:**
- Consumes: routes `videos.startYouTube`, `videos.checkYouTube`, `videos.linkYouTube`, `videos.deactivate` (Tasks 4, 6, 7); `youtubeEmbedUrl`, `youtubeWatchUrl`.
- Produces:
  - `<AddYouTubeVideoDialog session style onClose onStarted={(v: VideoItem) => void} />`
  - `useYouTubeCheck(ids: string[]): { results: Record<string, VideoCheckResult>; checkNow(): Promise<void>; checking: boolean }`. It uses a TanStack Query with key `['youtube-check', ...ids]`, `refetchInterval: 60_000` when `ids.length > 0`, and `refetchIntervalInBackground: false`. When `attached > 0` it invalidates `['videos']`.

Dialog: on open it calls `videos.startYouTube` once and shows:
1. The title in a read-only box with **COPY**.
2. **OPEN YOUTUBE UPLOAD** — copies the title, then `window.open('https://www.youtube.com/upload', '_blank')`.
3. Steps: "1. Sign in to YouTube as UMDSC. 2. Upload the class video. 3. Paste the title. 4. Choose Unlisted and publish. The video appears here by itself once YouTube has finished processing it." Phone note: "On a phone: YouTube app → + → Video."
4. **DONE** closes the dialog.

Status copy (exact):

| status | class lead / admin sees |
|---|---|
| waiting | `Waiting for YouTube — make sure the title contains <tag>` |
| processing | `YouTube is still processing this video.` |
| private | `This video is Private on YouTube. In YouTube Studio set it to Unlisted.` |
| not-embeddable | `Turn on "Allow embedding" for this video in YouTube Studio.` |
| blocked | `YouTube blocked this video.` |
| ready + isPublic | `This video is Public on YouTube. In YouTube Studio set it to Unlisted.` |

Media page rules:
- **+ ADD RECAP** opens the dialog for the selected class. It is disabled with the title `Choose a class first` when no class is selected. The new waiting row appears at once.
- Video rows:
  - With `youtubeId`: a YouTube iframe, **OPEN IN YOUTUBE ↗** and **DELETE**.
  - Drive-only: the Drive preview and **DELETE**.
  - Waiting: `VideoStatusBadge` with **CHECK NOW**, **LINK IT MANUALLY** (a `window.prompt` for the link, then `videos.linkYouTube`; on `attached: false` show the status text) and **CANCEL** (`videos.deactivate`).
- `useYouTubeCheck` gets the ids of the waiting rows on screen plus every row with a `youtubeId`, so the public and blocked warnings show.
- Delete confirm: `Delete "<title>"? It will be deleted from YouTube, and its Drive copy (if any) moved to the Drive trash.` On `deactivated: false`, alert `YouTube did not delete "<title>". Try again, or delete it in YouTube Studio.`; on `driveTrashed: false` with a `driveFileId`, alert `"<title>" was removed. Its Drive copy could not be moved to the trash; delete it in Drive if you want.`

- When `videos.checkYouTube` fails with error code `QUOTA`, the waiting rows show `YouTube checking is paused until tomorrow.` and polling stops until the page is reloaded.

- [ ] **Step 1: Failing tests**
  - `AddYouTubeVideoDialog starts the video once and copies the title` (mock `navigator.clipboard.writeText`, `window.open`)
  - `useYouTubeCheck stops polling and reports the pause on a QUOTA error`
  - `useYouTubeCheck polls every minute while something waits and stops when nothing waits` (fake timers)
  - `useYouTubeCheck invalidates videos after an attach`
  - `VideoStatusBadge shows the exact copy for each status`
- [ ] **Step 2: Run** `npm test -w web` — FAIL. **Step 3: Implement.** **Step 4: Run** `npm test -w web && npm run build -w web` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(media): add class videos through YouTube with live status"`

---

## Task 11: Remove the Drive upload path, folder links and MP3 upload

**Files:**
- Delete (with their tests): `web/src/features/media/UploadDialog.tsx`, `uploadManager.tsx`, `ScanPanel.tsx`, `ClassLeadVideoFoldersPanel.tsx`, `GoogleAccountBar.tsx`, `web/src/lib/media/videoCompressor.ts`; and each of `web/src/lib/google/{gis,picker,googleAccount,driveFolders,resumableUpload,videoCodec,driveTrash}.ts` **only if** `git grep -n "<name>'" web/src` shows no remaining importer outside the files being deleted
- Modify: `web/src/app/App.tsx:5` (remove `UploadManagerProvider`), `MediaPage.tsx` (folder panel, folder notes, SCAN button, both `UploadDialog`s ~779-830, the `STYLE` step folder warning ~235-241), `web/src/features/masterdata/StylesPage.tsx` (video folder field and uploader email), `web/src/features/media/MusicForm.tsx:138-182` (link-only hint and placeholder; remove the MP3 tip), `web/package.json` (remove `mediabunny` if nothing imports it)

- [ ] **Step 1: Update tests first.** `MusicForm.test.tsx`: `hint no longer mentions Drive MP3` — the hint reads `YouTube, Spotify or SoundCloud. Spotify songs are matched to a YouTube version for practice.` and the placeholder reads `Paste a YouTube, Spotify or SoundCloud link`. In `MediaPage` tests (if any) and `routes.test.tsx`, nothing may reference removed components.
- [ ] **Step 2: Run** `npm test -w web` — FAIL on the MusicForm copy.
- [ ] **Step 3: Remove and edit** as listed. On the Media page, the music "add" path keeps only `MusicForm`.
- [ ] **Step 4: Run** `npm test -w web && npm run build -w web` — PASS, and `git grep -n "videoFolderId\|videoUploaderEmail" web/src` shows only `StylesStep.tsx` (its `videoFolderId: ''` default stays).
- [ ] **Step 5: Commit** — `git commit -m "refactor(web): remove Drive video upload, folder links and MP3 upload"`

---

## Task 12: Move to YouTube panel (admin)

**Files:**
- Create: `web/src/features/media/MoveToYouTubePanel.tsx` (+ test), `web/src/lib/google/saveDriveFile.ts` (+ test)
- Modify: `MediaPage.tsx` (render the panel at the bottom when `can(perms, 'settings.edit')`)

**Interfaces:**
- Consumes: `videos.moveList`, `videos.checkYouTube` (Tasks 6–7); `streamUrl` (`lib/google/driveUrls.ts`).
- Produces: `saveDriveFileAs(fileId: string, fileName: string): Promise<'saved' | 'fallback' | 'cancelled'>`. When `window.showSaveFilePicker` exists, it opens the picker with `suggestedName: fileName`, then `fetch(streamUrl(fileId))` and `response.body.pipeTo(await handle.createWritable())`. An AbortError from the picker means `'cancelled'`. Otherwise it opens `streamUrl(fileId)` in a new tab and returns `'fallback'`.

Panel: title `MOVE TO YOUTUBE (<moved> / <total> moved)`. Intro text: `Download a batch, drag up to 15 files at a time into YouTube Studio (signed in as UMDSC) and keep their file names as titles. Drive copies are kept.` It has one row per item: class (`Class #<seq> (<date>)`), title, size in MB, status (`Moved ✓` or `Not moved`), and **DOWNLOAD** for rows not yet moved. On `'fallback'`, show `Rename the downloaded file to: <fileName>` under that row. **CHECK NOW** calls `videos.checkYouTube` with no ids, then refetches `videos.moveList`. A list filter has the options **All** and **Not moved** (default).

- [ ] **Step 1: Failing tests**
  - `saveDriveFileAs streams to the picked file` (mock picker + fetch body)
  - `saveDriveFileAs falls back without the picker`
  - `saveDriveFileAs returns cancelled when the picker is closed`
  - `MoveToYouTubePanel lists not-moved videos and shows the rename hint on fallback`
- [ ] **Step 2: Run** `npm test -w web` — FAIL. **Step 3: Implement.** **Step 4: Run** `npm test -w web && npm run build -w web` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(media): Move to YouTube panel with tagged downloads"`

---

## Task 13: Privacy page and audit checklist

**Files:**
- Create: `web/src/features/legal/PrivacyPage.tsx` (+ test), `docs/YOUTUBE-AUDIT.md`
- Modify: `web/src/app/routes.tsx` (public route `/privacy`, no sign-in), the dancer and admin login pages (a `Privacy policy` link to `/privacy`)

The privacy page covers, in plain sentences:
- what the website stores: name, matric number, contact and email from the registration form, attendance, and class videos and music links;
- that class videos are on the UMDSC YouTube channel as Unlisted and are shown only to registered dancers inside the website;
- that YouTube's own terms and Google's privacy policy apply to playback (link both);
- that the club does not sell or share data;
- that data is kept for 3 years (the event retention rule);
- how to ask for a video or data to be removed: email `umdancesportc@gmail.com`.

`docs/YOUTUBE-AUDIT.md` is the owner's step-by-step for the form at https://support.google.com/youtube/contact/yt_api_form. It gives:
- the Google Cloud project `umdsc-class` (project number `764158079871`);
- the website URL and the privacy URL (`<site>/privacy`);
- the API services used: Data API v3 (`channels.list`, `playlistItems.list`, `videos.list`, `videos.delete`, `search.list`) and the IFrame Player API;
- a ready-to-paste use-case paragraph: a university dance club shows its own class recap videos, unlisted on its own channel, only to registered members inside its class website; no third-party channel data is stored;
- "attach the screen recording made in Task 16";
- what to answer if Google asks about `videos.insert`: it is wanted later, for uploading the club's own class videos from the website.
- [ ] **Step 1: Failing test** `PrivacyPage opens without sign-in and names the contact email`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `npm test -w web && npm run build -w web` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): privacy policy page; YouTube audit checklist"`

---

## Task 14: End-to-end tests

**Files:**
- Modify: `web/e2e/admin-media.spec.ts` (replace the `videos.register`/`videos.scan` tests), `web/e2e/dancer-home.spec.ts`, `web/e2e/studio-sync.spec.ts`, `web/e2e/fixtures/mockData.ts` (videos gain `youtubeId`)

- [ ] **Step 1: Write the tests**
  - `admin adds a class video through YouTube`: the mock `videos.startYouTube` returns a row and a title. The dialog shows the title; DONE closes it; the row shows the waiting copy. The mock `videos.checkYouTube` then returns `ready` with `attached: 1`; CHECK NOW shows the YouTube iframe.
  - `dancer class card plays YouTube and has no download`.
  - `studio uses the YouTube player for a YouTube class video` (stub `window.YT` with `page.addInitScript`).
  - `move to YouTube lists Drive videos for an admin`.
- [ ] **Step 2: Run** `npm run e2e -w web` — Expected: all pass. Also run the whole suite: `npm test && npm run build`.
- [ ] **Step 3: Commit** — `git commit -m "test(e2e): YouTube class videos"`

---

## Task 15: Guides

**Files:**
- Modify: `docs/guides/en/*` and `docs/guides/zh/*` (class lead, admin, dancer), `docs/guides/images/*`, `docs/guides/word/*`, `web/e2e-scratch/guides.shots.ts`

- [ ] **Step 1:** Class lead guide:
  - replace the Drive upload, AUTHORIZE, folder link and account-switch sections with the YouTube steps (the dialog text from Task 10, the phone app path, the status table);
  - add the shared-login safeguards: use UMDSC as an extra account in the YouTube app; never change the password or 2-step settings; the owner changes the password when a class lead leaves.
- [ ] **Step 2:** Admin guide: add Move to YouTube and the one-time owner steps (Task 0 list), and remove the test-user and folder-link steps. Dancer guide: videos play on the class card; there is no download.
- [ ] **Step 3:** Update `guides.shots.ts` for the new screens and run it. Then regenerate the Word copies with python-docx. If the earlier converter script is gone, write a small one in the scratchpad that maps headings, paragraphs, lists and images.
- [ ] **Step 4: Commit** — `git commit -m "docs(guides): class videos through YouTube"`

---

## Task 16: Trial (live site untouched)

🧑 **OWNER ACTIONs are marked; everything else is run by the implementer.**

- [ ] **Step 1: Push the code (not a deployment).** `cd api && npm run push` (build + `clasp push -f`). The live deployment stays on version 40.
- [ ] **Step 2: 🧑 Approve the scope.** In the Apps Script editor (script id in `docs/SETUP-VALUES.md`), signed in as the club account, run `authorizeOnce` and accept. The screen lists "Manage your YouTube account".
- [ ] **Step 3: Trial deployment.** `npx clasp create-version "youtube trial"` and note version N. Then `npx clasp create-deployment -V N -d "youtube trial"` and note the trial deployment id. Its URL is `https://script.google.com/macros/s/<id>/exec`.
- [ ] **Step 4: Preview website.** `VITE_API_URL=<trial url> npm run build -w web` (a process env value overrides `.env.production`), then `npx wrangler versions upload --preview-alias youtube-trial` from the repo root. This uploads a version without deploying it. If `--preview-alias` is not supported, use the version preview URL it prints. If wrangler is not signed in: 🧑 `npx wrangler login`.
- [ ] **Step 5: 🧑 Allow the preview domain.** In Google Cloud → `umdsc-class` → Credentials → API key "API UMDSC" → Website restrictions, add `https://*-umdsc-dance-class.umdancesportc.workers.dev/*`. This is needed for Drive playback of not-yet-moved videos on the preview.
- [ ] **Step 6: 🧑 Trial event.** On the preview site, create an event "YouTube Trial" with one style and one class, and register the owner's own test dancer for it, so real dancers never see trial rows on the live site.
- [ ] **Step 7: 🧑 Try it.**
  - Add a class video the new way, from a phone, in the YouTube app.
  - Watch it attach.
  - Open the class card and the Studio as the test dancer on a phone, and check loops and speed.
  - Delete one trial video and confirm it is gone from YouTube.
  - Move 3 old videos with Move to YouTube and check that they play.
  - Screen-record the add-video flow and the dancer playback, for the audit.
- [ ] **Step 8:** Fix anything found (new tasks via the normal TDD loop). Then `npm run push`, create a new version, and `npx clasp update-deployment <trial id> -V <new N>`. Repeat Steps 7–8 until the owner is satisfied.
- [ ] **Step 9: 🧑 Submit the audit** following `docs/YOUTUBE-AUDIT.md`, with the recording.

## Task 17: Move the old videos, then switch live (only on the owner's yes)

- [ ] **Step 1: 🧑 Move the remaining old videos** with the Move to YouTube page on the preview site. The live site ignores `youtubeId`, so dancers notice nothing. Continue when the panel shows every video moved.
- [ ] **Step 2: 🧑 Owner says "go live".** Do not continue without it.
- [ ] **Step 3: Switch the API.** `npx clasp update-deployment AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA -V <final N>`.
- [ ] **Step 4: Switch the website right after.** Merge `feat/youtube-videos` into `main` and push. Confirm that Cloudflare's check-run for the new commit succeeded; if it was skipped, push an empty commit.
- [ ] **Step 5: Smoke test on the live site** as a dancer on a phone: a class card plays from YouTube, the Studio follows the music, and there is no download button.
- [ ] **Step 6: Tidy up.** `npx clasp undeploy <trial id>`. Update `docs/SETUP-VALUES.md` (live version number, scope change, YouTube channel facts) and `docs/HANDOVER.md` (videos live on YouTube; rollback below).
- [ ] **Rollback (if needed):** `npx clasp update-deployment AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA -V 40`, revert the merge commit on `main` and push. The Drive copies are all still in place. Videos added the new way after the switch will not play on the old site.

---

## Spike results

_(Filled in by Task 0.)_
