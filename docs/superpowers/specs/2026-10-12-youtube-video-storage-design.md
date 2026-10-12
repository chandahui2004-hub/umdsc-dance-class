# Class videos on the UMDSC YouTube channel — design

**Date:** 2026-10-12
**Status:** approved in conversation, waiting for the owner's review of this document
**Owner decisions:** recorded in §2; each one was chosen by the owner, not assumed.

## 1. Why

The club Google Drive is nearly full, mostly because of class videos and MP3s. Class videos will move to one
YouTube channel owned by the club account (`umdancesportc@gmail.com`), uploaded as **Unlisted** (anyone with the
link can watch, nobody can find it by search). Class leads no longer insert their own Drive folder link. Dancers
keep the same class cards, the same Studio and the same "only the classes I registered for" rule.

Unlisted is the same privacy level the videos have today (Drive files are shared "anyone with the link").

## 2. Owner decisions

| Question | Decision |
|---|---|
| How do class leads reach the channel? | They all sign in to YouTube with the shared UMDSC login. (Risk explained and accepted; safeguards in §9.) |
| How does a video reach the right class? | The website already knows the class: it gives the class lead a title with a short tag, the server finds that tag on the channel and attaches the video to that class automatically. |
| Old Drive videos | Copy all of them to YouTube now. **Keep the Drive copies; delete nothing.** |
| Music | Links only (YouTube / SoundCloud / Spotify). No new MP3 uploads. Old MP3s keep playing. |
| Video download for dancers | Removed for every video. Dancers get **Open in YouTube** instead. |
| Deleting a video on the website | Also deletes it on YouTube, and trashes the Drive copy if there is one (recoverable for 30 days). |
| Going live | Everything runs as a separate trial first. The live site switches only when the owner says yes. |

## 3. Facts this design is built around

- **YouTube locks API uploads to private.** Videos uploaded through `videos.insert` from an unaudited Google
  Cloud project are locked to private, whichever account uploads them, until Google audits the project. Dancers
  cannot watch private videos. So the website does **not** upload to YouTube; the class lead uploads in YouTube
  itself and the website matches the upload. Reading the channel and deleting videos are not affected.
- **YouTube only takes video files.** MP3s cannot go to YouTube, hence links-only music.
- **YouTube converts every upload** into formats every phone plays, which removes the HEVC/4K black-video problem
  and the need to compress in the browser.
- **The live site and the trial share one database (the spreadsheet).** The current live code reads rows by an
  explicit field list (`api/src/db/db.ts` codecs), so when it edits a video row it blanks any column it does not
  know. A stored tag could be wiped; that is why the tag is **derived from the row id** (§4.1) and never stored.
- **The YouTube player cannot nudge speed finely.** The Studio keeps the video in step with the music by tiny
  speed changes and seeks (`web/src/features/music-studio/sync/useSyncedVideo.ts`). YouTube's player is expected
  to allow only a fixed list of speeds. Whether seek-only correction is good enough is measured first (§8, step 1).
- **Unverified YouTube accounts can only upload videos up to 15 minutes.** The channel must be phone-verified (§9).
- The server already has the YouTube service and `youtube.readonly` in `api/appsscript.json`
  (used for Spotify-to-YouTube search). Deleting needs the broader `https://www.googleapis.com/auth/youtube` scope.

## 4. Data

### 4.1 Video rows (`Videos` sheet)

One row per class video, as today. Sections (`Sections.videoId`) and dancer visibility keep pointing at the same
row, so nothing that refers to a video changes.

- **New column `youtubeId`** (string, empty until matched). Shared type `Video` gains `youtubeId?: string`.
- `source` gains the value `'youtube'` for rows created by the new flow. Such rows have an empty `driveFileId`.
- **Tag:** `#` + 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L), computed from the row id with
  a fixed hash (e.g. FNV-1a 32-bit, then base-31 digits). It lives in `shared/` so the API and web compute the
  same tag. It is never written to the sheet.
  - New rows: when `videos.startYouTube` creates a row, it generates ids until the tag is unique among all
    video rows (active or not).
  - Existing rows: `videos.moveList` checks all tags for duplicates and reports any as an error (expected never
    to happen at this row count; a test proves the check works).
- **Playable source:** a row is playable when it has `youtubeId` (preferred) or `driveFileId`. A row with neither
  is a **waiting** row.

### 4.2 Unused but kept

`DanceStyles.videoFolderId`, `videoFoldersJson` and `videoUploaderEmail` stay in the sheet, untouched, so the
live site keeps working during the trial and a rollback stays possible. The new website no longer reads or shows
them for videos.

## 5. Server (Apps Script API)

### 5.1 `YouTubePort` additions (`api/src/ports.ts`, `GasYouTubeAdapter` in `api/src/gas/adapters.ts`)

- `myChannel(): { channelId, uploadsPlaylistId }` — `Channels.list('contentDetails', { mine: true })`.
- `channelUploads(): { youtubeId, title, description, publishedAt }[]` — every page of the uploads playlist
  (`PlaylistItems.list`, 50 per page, 1 unit per page). Includes unlisted and private videos because the script
  runs as the channel owner.
- `videoStatus(ids): { youtubeId, channelId, privacy, uploadStatus, embeddable, rejectionReason }[]` —
  `Videos.list('status,snippet')`, 50 ids per call.
- `remove(id): boolean` — `Videos.delete`; returns true when deleted or already gone (404), false otherwise.

The test fake implements the same port. The channel listing is cached for 60 seconds (CacheService) so many open
cards cost one lookup.

### 5.2 Routes (`api/src/features/videos.ts`)

| Route | Perm | What it does |
|---|---|---|
| `videos.startYouTube` `{ sessionId, title? }` | `videos.upload` (style-scoped) | Creates a waiting row for that class (`source: 'youtube'`, no Drive or YouTube id). Returns the row, its tag and the suggested title `"<d MMM yyyy> · <Style> Class <seq> · #TAG"`. |
| `videos.checkYouTube` `{ ids? }` | `videos.upload` | Lists the channel uploads and finds tags in titles/descriptions for every active row with no `youtubeId` yet (waiting rows and not-yet-moved Drive rows). It writes `youtubeId` **only when the found video is playable** (§5.3 `ready`); until then it only reports the status. Returns a status per requested row, filtered to the caller's styles. Bumps the data version **only when it wrote something** (an unconditional bump would empty dancer caches every minute). |
| `videos.linkYouTube` `{ id, url }` | `videos.upload` | Manual backup for a mistyped tag. Parses the link and checks with `videoStatus` that the video belongs to the club channel and is playable, then writes `youtubeId`. Refuses videos from other channels and ids already used by another row; a video that is not playable yet returns its status and is not stored. |
| `videos.moveList` `{}` | admin | Every active row with `driveFileId`: class, title, size, tag, suggested file name `"<title> #TAG.<ext>"`, moved or not. Reports duplicate tags as an error. |
| `videos.deactivate` | `videos.edit` (as now) | If `youtubeId`: `remove()` first; if it fails, the row stays listed and the error says so. Then the existing Drive trash logic if `driveFileId`. A waiting row (neither id) is simply deactivated, which is the **Cancel** action. |

**Removed routes:** `videos.targetFolder`, `videos.register`, `videos.scan` (they only serve the Drive upload flow).
`videos.list`, `videos.update` stay.

**Dancer visibility:** wherever videos are sent to a dancer (`videos.list` and the bootstrap/calendar payload),
waiting rows are left out. Admins and class leads see them with their status.

**Music:** `music.create` / `music.update` refuse `sourceType: 'mp3'` and MP3 links for new items. Existing MP3
items still list and play; editing their title or class keeps the MP3.

### 5.3 Video status values

`waiting` (tag not found yet) · `processing` (uploadStatus `uploaded`) · `private` · `not-embeddable` ·
`blocked` (`rejectionReason` set, or uploadStatus `failed`/`rejected`) · `ready` (processed, Unlisted or Public,
embeddable). A Public video counts as `ready` but the card shows a warning to switch it to Unlisted.

Because `youtubeId` is written only at `ready`:
- a new video stays hidden from dancers until it can play;
- an old video keeps playing from Drive until its YouTube copy is ready.

Dancers never see a status, only a playable video or nothing. If YouTube blocks a video after it was attached
(e.g. a later copyright claim), the dancer's player shows "This video can't be played on YouTube".

### 5.4 Manifest

`oauthScopes`: replace `youtube.readonly` with `https://www.googleapis.com/auth/youtube` (covers reading, search
and delete). **The owner must run `authorizeOnce` in the Apps Script editor after this is pushed and before any
deployment (trial or live) points at that version** — a version with an unapproved scope can make the site refuse
requests.

## 6. Website

### 6.1 Playback

- **Class card** (`web/src/features/calendar/ClassCard.tsx`): a video with `youtubeId` plays in a YouTube embed
  (`youtube-nocookie.com`). Buttons: **Open in YouTube**. No Download, no Open in Drive. A Drive-only video
  (not moved yet) keeps today's Drive preview, also without Download / Open in Drive.
- **Studio** (`Studio.tsx`, `FullscreenStudio.tsx`, `sync/VideoPanel.tsx`): a `youtubeId` video plays in the
  YouTube IFrame player. `useSyncedVideo` is changed to drive a small `FollowerVideo` interface
  (current time, seek, play, pause, set speed, mute, waiting/playing events) with two implementations:
  the existing `<video>` element and a YouTube player wrapper. For YouTube, speed is set to the nearest value in
  `getAvailablePlaybackRates()` and drift is corrected by seeking only, with thresholds chosen in the spike (§8.1).
  Sections' `videoStartSec` is unchanged (YouTube keeps the same timeline).
- The Drive "unplayable video" fallback in `FullscreenStudio` stays for Drive-only videos.

### 6.2 Adding a video (class lead / admin)

**Add video** on a class (on the Media page, where uploads happen today) opens a new dialog in place of `UploadDialog`:

1. Calls `videos.startYouTube`, shows the suggested title with **Copy**.
2. **Open YouTube upload** (`https://www.youtube.com/upload`), plus short steps: sign in as UMDSC, upload, paste
   the title, choose **Unlisted**, come back. On a phone the steps say: YouTube app → **+** → Video.
3. The class card / Media row then shows the status (§5.3). While any waiting row is on screen and the tab is
   visible, the page calls `videos.checkYouTube` every 60 seconds; **Check now** calls it at once.
4. Waiting rows offer **Cancel** and **Link it manually** (paste a YouTube link → `videos.linkYouTube`).

### 6.3 Move to YouTube (admin only)

A **Move to YouTube** section on the Media page, fed by `videos.moveList`:

- One row per Drive video: class, title, size, status (Not moved · Moved ✓), **Download**.
- **Download** saves the Drive file with the tag in its name. On Chrome/Edge desktop it streams to disk with
  `showSaveFilePicker` (no memory limit); elsewhere it falls back to a normal download and shows the file name to
  rename it to.
- A note: YouTube Studio uploads up to 15 files at once and uses the file name as the title, so a batch of tagged
  downloads dragged into YouTube Studio needs no typing. **Check now** ticks them off.
- Nothing is deleted or renamed in Drive.

### 6.4 Music form

`MusicForm.tsx`: the MP3 upload option is removed; the form takes links only (as the link path already works).

### 6.5 Removed from the website

`ClassLeadVideoFoldersPanel`, `GoogleAccountBar`, `UploadDialog`, `uploadManager`, `ScanPanel`, the video folder
and uploader-email fields on the Styles page, and `lib/media/videoCompressor.ts`. Each `lib/google/*` helper is
removed only if nothing else (attendance folders, instructor photos) still uses it; the plan checks each with a
search. `driveUrls.ts` stays (Drive playback of not-yet-moved videos, old MP3s).

## 7. Errors

| Situation | What the user sees |
|---|---|
| Tag not found yet | Card: "Waiting for YouTube — make sure the title contains #TAG". Check now / Link it manually / Cancel. |
| YouTube still processing | "YouTube is still processing this video." Dancers do not see it yet. |
| Uploaded as Private | Not attached; the card explains how to change it to Unlisted in YouTube. |
| Uploaded as Public | Attached and playable; the card warns to change it to Unlisted. |
| Embedding off | Warning: turn on "Allow embedding" in YouTube Studio. |
| Copyright block / rejected | Class lead card: "YouTube blocked this video". Dancer player: "This video can't be played on YouTube". |
| Pasted link from another channel | "This video isn't on the UMDSC channel." |
| YouTube daily quota used up | "YouTube checking is paused until tomorrow" (expected never at 1 unit per 50 videos). |
| Delete on YouTube fails | Video stays listed; message says to retry or delete it in YouTube Studio. |
| Duplicate tag among old rows | Move to YouTube page shows an error naming both rows; nothing is matched for them. |

## 8. Testing and switching over

1. **Sync spike first (stop point).** A throwaway page plays a real unlisted class video in the YouTube player
   against music in the Studio, with loops and speed changes, on the owner's phone and a desktop. Measure drift
   and how often a seek happens. If the video cannot stay close enough to the music, stop and report to the owner
   before any other work. The chosen thresholds go into `syncMath`.
2. **Automatic tests (TDD):** tag derivation and uniqueness; tag matching in titles/descriptions; `checkYouTube`
   writes and data-version bump only on change; `linkYouTube` channel check; `deactivate` order (YouTube, then
   Drive, stays listed on failure); dancer visibility of waiting rows; MP3 refusal; playback source choice
   (YouTube over Drive); `useSyncedVideo` with a fake YouTube follower; the dialog and Move page; e2e with the
   YouTube player mocked.
3. **Trial.**
   - Push the API, owner runs `authorizeOnce`, then create a **separate trial deployment** of that version. The
     live deployment `AKfycbz3z…` stays on its current version.
   - A preview web build pointing at the trial deployment (Cloudflare preview URL for the branch; its domain is
     added to the Google API key's referrer allowlist so Drive playback works there).
   - Use a **trial event** with one class and the owner's own test dancer, so real dancers never see trial rows
     on the live site.
   - The owner uploads one class video the new way, moves a few old videos, and checks class card + Studio on a
     phone as a dancer.
4. **Move the remaining old videos** with the Move to YouTube page, still during the trial. This only fills
   `youtubeId`, which the live site ignores. If the live site edits a moved row and blanks `youtubeId`, the next
   check fills it again because the tag comes from the row id.
5. **Switch live only on the owner's yes:** `clasp update-deployment` the live deployment to the new version and
   push the web to `main`. **Rollback:** point the live deployment back to the previous version and revert the web
   commit; Drive copies are all still there. Videos added the new way after the switch would show as broken on the
   old site after a rollback — acceptable, and the reason the trial comes first.
6. **Guides:** update `docs/guides` (en + zh: class lead, admin, dancer) for the new upload steps, Move to YouTube
   and the safeguards in §9, then regenerate the Word copies and screenshots.

## 9. One-time owner steps

On `umdancesportc@gmail.com`:

1. Create the YouTube channel on this account itself (not a separate brand channel), so `mine: true` finds it.
2. Verify the channel by phone (youtube.com/verify) — otherwise uploads are capped at 15 minutes.
3. YouTube Studio → Settings → **Upload defaults**: Visibility **Unlisted**, audience **Not made for kids**,
   **Allow embedding** on.
4. Shared-login safeguards: turn on 2-step verification; class leads add UMDSC as an **extra account** in the
   YouTube app instead of replacing their own; change the password whenever a class lead leaves.
5. Run `authorizeOnce` after the new manifest is pushed (§5.4).

## 10. Applying for Google's audit (so uploads can later happen on the website)

The owner chose to apply for the YouTube API audit in parallel. Approval is not guaranteed and can take weeks, so
nothing in §4–§9 waits for it.

**In this plan:**
- A public **Privacy policy** page on the website (what the app stores, that videos go to the club's YouTube
  channel, who can see them, how to ask for removal), linked from the login page. Google requires one.
- A ready-to-submit **audit checklist** in `docs/` for the owner: the YouTube API Services audit form
  (https://support.google.com/youtube/contact/yt_api_form), the Google Cloud project id, the website URL and
  privacy policy URL, a short description of how the app uses YouTube (club class videos, unlisted, viewed only by
  registered dancers inside the website), and a short screen recording of the upload and playback flow made during
  the trial.
- 🧑 OWNER ACTION: submit the form from the club account and answer Google's follow-up emails.

**Only after approval (a separate small spec and plan, not this one):** §6.2 step 2 becomes "pick the file here".
The website uploads straight to the club channel with the `youtube.upload` scope while signed in as UMDSC, sets the
tagged title and Unlisted itself, and the matching in §5 stays exactly as it is.

## 11. Out of scope

- Building the in-website upload before Google approves the audit (§10).
- Deleting or renaming the old Drive videos (the owner keeps them).
- Moving old MP3s anywhere (they keep playing from Drive).
- Attendance and instructor-photo folders (unchanged).
