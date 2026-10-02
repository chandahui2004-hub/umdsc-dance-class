# Media Playback & Dancer Login Speed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Antigravity: `.agents/skills/executing-plans`) to implement this plan task-by-task. Use `test-driven-development` for every code task, `webapp-testing` for browser checks, and `verification-before-completion` before ticking a task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make class videos visible to dancers, make YouTube music play in the Studio, and cut dancer login from 11–18 s to at most 5 s to token.

**Architecture:**
- **Web-only fixes:**
  - YouTube player construction bug.
  - Visible tap-to-start YouTube player.
  - No music-video embed on class cards.
  - HEVC detection that warns but doesn't block.
  - Video fallbacks.
- **API changes:**
  - Per-step timings.
  - Dancer styles precomputed into `MemberIndex`.
  - Token-only login, with attendance split into its own action.
  - Size-guarded caches and a cache warm-up trigger.
  - Then deploy and re-measure.

**Tech Stack:** React 19 + Vite + Vitest + Playwright (`web/`), Google Apps Script via esbuild + clasp (`api/`), shared types in `shared/src/types.ts`.

**Spec:** `docs/superpowers/specs/2026-10-02-media-playback-and-login-speed-design.md` (Tasks 1–10). Read its Evidence sections first; every task fixes a cause proven there. Tasks 11–18 (Part B) implement `docs/superpowers/specs/2026-10-02-smart-music-links-design.md`.

## Global Constraints

- Branch `feat/events`. Do not start a new branch.
- Retro 8-bit theme; minimum text size 5px (`min-text-5px` class in Studio).
- Never block a video upload because of its format. Warn only.
- Music stays audio-only. Keep `SourcePicker`'s existing MP4 rejection from commit `2a061c7`.
- Never call `ctx.cache.put` directly in new code. Use `safeCachePut` (Task 9).
- **Deploy** only to deployment `AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA`:
  1. `cd api && npm run push`
  2. `npx clasp create-version "<msg>"`
  3. `npx clasp update-deployment AKfycbz3z… -V <n>`
- **Never** create a new deployment.
- `npm test` must pass in `api/` and `web/`. Run `cd web && npx tsc -b` before each web commit.

## Review Focus

1. **Owner's exact path:** open `/studio` with no track, click a YouTube Class Music item, then switch to MP3, then back to YouTube. Audio must play each time with the same player instance. Test: Task 1, step 1, tests b and c.
2. **YouTube that refuses embedding** (onError 101/150): show "This YouTube link cannot be played here", never an endless "Loading…". Test: Task 1, step 1, test d.
3. **Dancer whose MemberIndex row predates `eventStyles`** (empty column): login must still show their styles via the old Members-sheet path. Test: Task 7, step 1, test b.
4. **Past classes while attendance is still loading** must not flash "✕ ABSENT". Test: Task 8, step 5.
5. **A 2 GB video** must not be read whole by codec detection; at most 8 MB is sliced. Test: Task 4, step 1, test d.

---

### Task 1: Fix the broken YouTube player (root cause of "Still loading…")

**Files:**
- Modify: `web/src/features/music-studio/dancecue/components/YouTubePlayer.tsx`
- Test: `web/src/features/music-studio/dancecue/components/YouTubePlayer.test.tsx`

**Interfaces:**
- Produces: the same `YouTubePlayer` props. `playerRef.current` is non-null **only after `onReady`**.

- [ ] **Step 1: Write failing tests.** In the existing file's mock, make `window.YT.Player` throw `new Error('Invalid video id')` when `'videoId' in options && !options.videoId`. This mirrors the real API, proven in the spec.
  - a. `does not pass a videoId key when videoId is null`: render with `videoId={null}` and assert `'videoId' in options === false`.
  - b. `cues a track chosen after mount`: render with `null`, fire `playerEvents.onReady({target: mockPlayerInstance})`, rerender with `'4_KN-gA6uXY'`, then assert `mockPlayerInstance.cueVideoById` was called with `'4_KN-gA6uXY'`.
  - c. `reuses one player across track changes`: rerender `'aaaaaaaaaaa'` → `'bbbbbbbbbbb'` and assert `window.YT.Player` was called once.
  - d. `shows cannot-play message on onError`: fire `playerEvents.onError({data:150})` and expect the text `This YouTube link cannot be played here.`
  - e. `never calls player methods before onReady`: render with an id, advance fake timers 2000 ms before `onReady`, and expect no throw and `getDuration` not called.
- [ ] **Step 2:** `cd web && npx vitest run src/features/music-studio/dancecue/components/YouTubePlayer.test.tsx`. Expected: a, b and e FAIL.
- [ ] **Step 3: Implement.**
  - Build `options` without a `videoId` key when `videoId` is null.
  - Hold the constructed object in a local variable and assign `playerRef.current` inside `onReady`.
  - In the duration-polling interval and the retry timeout, skip unless `typeof playerRef.current?.getDuration === 'function'` (likewise `cueVideoById`).
  - The `[videoId]` effect keeps cueing through `playerRef.current` when it is ready. Otherwise `latestVideoIdRef` delivers the id in `onReady`, as today.
- [ ] **Step 4:** Run the same command. Expected: all PASS.
- [ ] **Step 5: Browser check** (`webapp-testing`). With `npm run dev` running, use Playwright in Chrome **and** Edge (`channel: 'msedge'`):
  1. Mock `dancer.bootstrap` with one YouTube music item `youtubeId: '4_KN-gA6uXY'`.
  2. Open `/studio` (no query).
  3. Click the item, then click Play.
  4. Expected: within 5 s the `<video>` inside the YouTube iframe has `paused === false` and `currentTime > 0`.

  Add this as `test('class music picked after opening studio plays YouTube')` in `web/e2e/studio.spec.ts`, and add the Edge project only locally.
- [ ] **Step 6: Commit.** `git commit -m "fix(studio): build youtube player without empty videoId so class music plays"`

### Task 2: Visible tap-to-start YouTube player (spec decision A)

**Files:**
- Modify: `web/src/features/music-studio/dancecue/components/YouTubePlayer.tsx`
- Modify: `web/src/features/music-studio/dancecue/hooks/useAudioPlayer.ts`
- Test: `YouTubePlayer.test.tsx`, `web/src/features/music-studio/dancecue/hooks/useAudioPlayer.test.ts` (create if missing)

**Interfaces:**
- Produces:
  - `useAudioPlayer` returns `needsTap: boolean`. It becomes true when `play()` was called on source `youtube` and state `playing` (1) has not arrived within 3000 ms. It resets to false on the next `playing` state or on a source change.
  - `YouTubePlayer` gets a new prop `needsTap: boolean`.

- [ ] **Step 1: Failing tests.**
  - Hook: `sets needsTap when youtube does not start within 3s`. Fake timers; `play()`; advance 3000; expect `true`. Then `handleYouTubeStateChange(1)` and expect `false`.
  - Component: `renders visible player and tap hint when needsTap`. Expect the text `Tap the YouTube player once to start`, and the player wrapper not to have class `opacity-0`.
- [ ] **Step 2:** Run both test files. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - When `isVisible`, move the player container out of the hidden `fixed opacity-0 pointer-events-none` wrapper into the status card as a visible 160×90 box (`border-2 border-black`).
  - Keep it hidden when `!isVisible`.
  - Show the hint line when `needsTap`.
  - Pass `needsTap={player.needsTap}` from `web/src/features/music-studio/Studio.tsx`.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(studio): visible tap-to-start youtube player for phones`

### Task 3: Class card shows no music video; MP3 recommended (spec decision B)

**Files:**
- Modify: `web/src/features/calendar/ClassCard.tsx` (music section, the `m.sourceType === 'youtube'` iframe)
- Modify: `web/src/features/media/MusicForm.tsx`
- Test: `web/src/features/calendar/ClassCard.test.tsx` (create if missing), `web/src/features/media/MusicForm.test.tsx` (create if missing)

- [ ] **Step 1: Failing tests.**
  - `youtube music shows no iframe`: render `ClassCard` with one music item `{sourceType:'youtube', youtubeId:'4_KN-gA6uXY'}`. Expect `container.querySelector('iframe[src*="youtube"]')` to be null, and the button `▶ PRACTISE IN STUDIO` to be present.
  - MusicForm: `recommends mp3` expects the text `Tip: upload an MP3 for the most reliable practice playback (works offline, on every phone).`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Delete the YouTube `<iframe>` block in the ClassCard music section. Add the tip line in MusicForm under the source choice.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(calendar): audio-only youtube music on class card; recommend mp3`

### Task 4: Detect HEVC on upload and warn (don't block)

**Files:**
- Create: `web/src/lib/google/videoCodec.ts`
- Modify: `web/src/lib/google/resumableUpload.ts` (`videoFormatWarning`)
- Modify: `web/src/features/media/UploadDialog.tsx:80-86`
- Modify: `web/src/features/media/uploadManager.tsx`, only if it calls `videoFormatWarning`
- Test: `web/src/lib/google/videoCodec.test.ts`, `web/src/lib/google/resumableUpload.test.ts`

**Interfaces:**
- Produces:
  - `detectVideoCodec(file: Blob): Promise<'hevc' | 'h264' | 'unknown'>` reads `file.slice(0, 4MB)` and `file.slice(size-4MB)`. Within those bytes it finds the ASCII box type `hvc1` or `hev1` → `'hevc'`, else `avc1` → `'h264'`, else `'unknown'`.
  - `videoFormatWarning(file: File): Promise<string | null>` becomes **async**.

- [ ] **Step 1: Failing tests** (build Blobs from byte arrays):
  - a. `finds hvc1 in tail`: 6 MB of zeros with `hvc1` at offset size−100 → `'hevc'`.
  - b. `finds avc1 in head` → `'h264'`.
  - c. `unknown when neither` → `'unknown'`.
  - d. `reads at most 8MB`: spy on `Blob.prototype.slice` with a 2 GB-sized fake. Assert the total sliced bytes ≤ 8 × 1024 × 1024.
  - e. `videoFormatWarning` for an `.mp4` containing `hvc1` resolves to a string containing `H.265` and `Most Compatible`. For `avc1` it resolves to `null`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the existing `.mov`/HEVC-name check. Warning text, exact:

  > `This video is H.265/HEVC. Many phones and Edge/Firefox show a black screen for it. For every dancer to see it, re-export as H.264 MP4 (iPhone: Settings → Camera → Formats → Most Compatible; CapCut: export 1080p H.264). You can still upload it.`

  In UploadDialog, `await Promise.all(selected.map(videoFormatWarning))`. The existing warning UI must allow continuing (no block).
- [ ] **Step 4:** Run. Expected: PASS. Run `cd web && npx tsc -b`. Expected: no errors.
- [ ] **Step 5: Commit.** `feat(media): warn when an uploaded video is HEVC`

### Task 5: Video playback fallbacks (class card + Studio)

**Files:**
- Keep and commit the uncommitted changes in `web/src/features/calendar/ClassCard.tsx`, `web/src/lib/google/driveUrls.ts` and `driveUrls.test.ts`: the Drive `/preview` iframe and the `folderUrl` links.
- Modify: `web/src/features/music-studio/sync/VideoPanel.tsx`
- Test: `web/src/features/music-studio/sync/VideoPanel.test.tsx` (create if missing)

- [ ] **Step 1: Failing test.** `explains when the video has no picture`:
  1. Render VideoPanel with one video and select it.
  2. Stub the `<video>` `videoWidth` to 0.
  3. Dispatch `loadeddata`.
  4. Expect the text `This device can't show this video's format (H.265). Ask an admin to re-upload it as H.264 MP4.`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.** On `loadeddata`, if `videoWidth === 0 && videoHeight === 0`, overlay that message on the screen frame.
- [ ] **Step 4:** Run `cd web && npm test`. Expected: PASS, including `driveUrls.test.ts`.
- [ ] **Step 5: Manual check by the owner, in Edge.**
  1. Sign in as a dancer.
  2. Open 15 Oct, Locking Class 1.
  3. The two recap videos must show a picture in the Drive player.

  If Drive shows "processing" or black, record it in the plan's notes. The fix is then re-exporting those two files (Task 4's advice), not more code.
- [ ] **Step 6: Commit.** `feat(media): drive preview player on class card; no-picture notice in studio`

### Task 6: Server timings for dancer login (measure before optimising)

**Files:**
- Create: `api/src/logic/timing.ts`
- Modify: `api/src/features/auth.ts` (`auth.dancerLogin`), `api/src/features/bootstrap.ts` (`getDancerBootstrap`)
- Test: `api/test/logic/timing.test.ts`, `api/test/features/auth.test.ts`

**Interfaces:**
- Produces:
  - `createTimer(now: () => number = Date.now): { mark(label: string): void; result(): Record<string, number> }`. `result()` maps each label to the ms since the previous mark.
  - `auth.dancerLogin` returns `timings` in its data **only** when `payload.debugTimings === true`. Labels: `memberIndex`, `roles`, `memberRoles`, `rolePermissions`, `sign`, `bootstrap.events`, `bootstrap.styles`, `bootstrap.chunks`, `bootstrap.attendance`.
  - Every login also does `console.log(JSON.stringify({ action: 'auth.dancerLogin', timings }))`.

- [ ] **Step 1: Failing tests.**
  - `timer reports per-step ms` uses a fake clock 0, 5, 12 → `{a:5, b:7}`.
  - `dancerLogin returns timings only when debugTimings`.
- [ ] **Step 2:** `cd api && npx vitest run test/logic/timing.test.ts test/features/auth.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Add the marks at the labelled points.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit, deploy, measure.**
  1. Commit with `perf(auth): per-step login timings`.
  2. Deploy per the Global Constraints.
  3. Run twice:

     ```bash
     curl -s -L -H "Content-Type: text/plain" --data '{"action":"auth.dancerLogin","payload":{"fullName":"CHAN DA HUI","matric":"23005147","debugTimings":true}}' "$VITE_API_URL"
     ```

  4. Paste both `timings` objects into this plan under **Measurements** at the end.
  5. If any single step exceeds 2000 ms and Tasks 7–9 don't remove it, stop and report to the owner before continuing.

### Task 7: Precompute each dancer's styles per event

**Files:**
- Modify: `api/src/db/schema.ts` (`MemberIndex` adds column `eventStyles` before `...COMMON_COLUMNS`)
- Modify: `api/src/db/db.ts`:
  - `MemberIndexRow.eventStyles: Record<string, string[]>`
  - codec: JSON string ↔ object; empty or invalid → `{}`
- Modify: `api/src/features/eventImport.ts:180-194`, setting `eventStyles: { ...prev?.eventStyles, [event.id]: m.styleIds }`
- Modify: `api/src/features/bootstrap.ts` (style resolution loop)
- Test: `api/test/features/eventImport.test.ts`, `api/test/features/bootstrap.test.ts`

- [ ] **Step 1: Failing tests.**
  - a. `sync writes eventStyles`: after importing POPPER, the MemberIndex row has `eventStyles[event.id]` equal to `['st_popping']`.
  - b. `bootstrap falls back when eventStyles missing`: clear `eventStyles` and expect the same styles as before.
  - c. `bootstrap does not open Members sheet when eventStyles present`: spy on `ctx.drive.openSpreadsheet` and assert it was not called with `event.membersSpreadsheetId`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.** In `getDancerBootstrap`, use `dancer.eventStyles?.[event.id]` when the key exists. Otherwise fall back to `dancerStylesInEvent`. The existing `Table` adds the missing header on first write; if it doesn't, add `eventStyles` in `setup` the same way other columns are ensured.
- [ ] **Step 4:** Run `cd api && npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `perf(auth): store dancer styles per event in MemberIndex`

### Task 8: Token-only login; attendance loads after the calendar

**Files:**
- Modify: `shared/src/types.ts` (`LoginResult.bootstrap?: B`, optional)
- Modify: `api/src/features/auth.ts`: `auth.dancerLogin` no longer calls `getDancerBootstrap`.
- Modify: `api/src/features/bootstrap.ts`:
  - `getDancerBootstrap` returns `attendance: []`.
  - Move the attendance block into a new exported `getDancerAttendance(ctx, matricKey, perms): { sessionId: string; present: boolean }[]`.
  - Register route `'dancer.attendance'`: `perm: 'signedIn'`, dancer only, `write: false`.
- Create: `web/src/features/auth/useDancerAttendance.ts`, a react-query hook with key `['dancerAttendance', sub]` that returns `{ attendance, isLoading }`.
- Modify: `web/src/features/calendar/DancerHome.tsx:21`, `web/src/features/me/MePage.tsx:17`, `web/src/features/calendar/ClassCard.tsx` (new prop `attendanceLoading?: boolean`), `web/src/features/calendar/DaySheet.tsx` (pass it through)
- Test: `api/test/features/auth.test.ts`, `api/test/features/bootstrap.test.ts`, `web/src/features/calendar/ClassCard.test.tsx`

- [ ] **Step 1: Failing API tests.**
  - `dancerLogin returns token and claims without bootstrap`.
  - `dancer.attendance returns present flags`: port the existing attendance assertions from `bootstrap.test.ts`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the API part. Run `cd api && npm test`. Expected: PASS.
- [ ] **Step 4:** Web: `TitleScreen.tsx` already skips storing a missing bootstrap. Keep the navigate. `DancerHome` keeps its existing loading state for the bootstrap.
- [ ] **Step 5: Failing web test.** `past class shows checking while attendance loads`: `attendanceLoading` true on a past session → text `…` and no `ABSENT`. Implement it and run. Expected: PASS.
- [ ] **Step 6:** Run `cd web && npx tsc -b && npm test`. Expected: PASS.
- [ ] **Step 7: Commit.** `perf(auth): token-only dancer login; attendance fetched after calendar`

### Task 9: Size-guarded cache + warm-up trigger

**Files:**
- Create: `api/src/logic/cache.ts`
- Modify: every `ctx.cache.put(` in `api/src/features/bootstrap.ts` and `api/src/features/eventMembers.ts`
- Modify: `api/src/main.ts` (export `warmDancerCaches`, `installWarmTrigger`), `api/build.mjs` footer
- Test: `api/test/logic/cache.test.ts`, `api/test/features/bootstrap.test.ts`

**Interfaces:**
- Produces:
  - `safeCachePut(cache: CachePort, key: string, value: string, ttlSec: number): boolean`. It returns false (and does not put) when `value.length > 90_000` or when `put` throws.
  - `warmDancerCaches(ctx: Ctx): void` fills `evt:members:*` and `boot:chunk:*` for every active event × style at the current `DATA_VERSION`.
  - GAS globals `warmDancerCaches()` and `installWarmTrigger()`. The latter creates exactly one time-driven trigger every 5 minutes calling `warmDancerCaches`, deleting any existing one first.

- [ ] **Step 1: Failing tests.**
  - `skips values over 90k`.
  - `swallows put errors`.
  - `login works when Members JSON exceeds cache limit`: 1500 fake members, with the fake cache throwing on values over 100 KB. Login succeeds.
  - `warmDancerCaches fills chunk keys`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Add `function warmDancerCaches(){return UMDSC.warmDancerCaches()}` and `function installWarmTrigger(){return UMDSC.installWarmTrigger()}` to the footer in `api/build.mjs`.
- [ ] **Step 4:** Run `cd api && npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `perf(api): size-guarded cache and 5-minute dancer cache warm-up`

### Task 10: Deploy, re-measure, prepare phone testing

- [ ] **Step 1:** Deploy per the Global Constraints. In the Apps Script editor, run `installWarmTrigger` once and approve the prompt.
- [ ] **Step 2:** Run the Task 6 curl twice. Expected: second call `time_total` ≤ 5 s. Paste the results under Measurements. If it is over 5 s, report the slowest timing labels to the owner; don't guess further.
- [ ] **Step 3:** Run the whole web suite: `cd web && npm test && npx playwright test`. Expected: PASS.
- [ ] **Step 4: Phone testing prerequisites.** These are owner steps; list them in the handover message:
  1. Publish the site (main plan Task 34, Cloudflare Pages).
  2. In Google Cloud Console → Credentials → the browser API key → **Website restrictions**, add `https://<pages-domain>/*`. Otherwise Drive MP3 and video streaming return 403 on phones.
  3. On an iPhone and an Android phone, check: video picture on the class card, Studio YouTube (tap-to-start), and login time.
- [ ] **Step 5: Commit** any doc updates: `docs: media and login measurements`.

---

## Part B — Smart music links (Tasks 11–18)

**Spec:** `docs/superpowers/specs/2026-10-02-smart-music-links-design.md`. Needs Tasks 1–2 done first (the SoundCloud player reuses the tap-to-start rule).

### Task 11: Shared link parser, `MusicItem` fields and app-link helper

**Files:**
- Create: `shared/src/musicLinks.ts`, `shared/src/musicLinks.test.ts`
- Modify: `shared/src/types.ts` (`MusicItem`), `shared/src/index.ts` (export)
- Modify: `api/src/db/schema.ts` (Music columns `soundcloudUrl`, `spotifyUrl`), `api/src/db/db.ts` (Music row type and codec; missing cell → `''`)
- Test: `api/test/db/*` (existing codec tests, extend)

**Interfaces:**
- Produces:
  - `parseMusicLink(input: string): ParsedMusicLink` where `ParsedMusicLink` is `{kind:'youtube'; id:string} | {kind:'spotify'; trackId:string} | {kind:'soundcloud'; url:string} | {kind:'soundcloud-short'; url:string} | {kind:'drive'; fileId:string} | {kind:'rejected'; reason:string}`.
  - `MusicItem.sourceType: 'mp3'|'youtube'|'soundcloud'|'spotify'`; new `soundcloudUrl: string`, `spotifyUrl: string`.
  - `musicAppLinks(m: MusicItem): { label: 'Spotify'|'YouTube'|'SoundCloud'|'Download MP3'; url: string }[]`. Order: Spotify, then YouTube, SoundCloud, MP3. For MP3 the url is `https://drive.google.com/uc?export=download&id={driveFileId}`.
  - `canPractise(m: MusicItem): boolean` is false only for `sourceType === 'spotify'`.

- [ ] **Step 1: Failing tests** in `shared/src/musicLinks.test.ts`, one `it` per row of the spec's §1 table:
  - `youtube.com/watch?v=4_KN-gA6uXY`, `youtu.be/4_KN-gA6uXY?t=5`, `music.youtube.com/watch?v=4_KN-gA6uXY`, `youtube.com/shorts/4_KN-gA6uXY`, `youtube.com/embed/4_KN-gA6uXY`, bare `4_KN-gA6uXY` → `{kind:'youtube', id:'4_KN-gA6uXY'}`.
  - `https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=x`, `https://open.spotify.com/intl-ms/track/4cOdK2wGLETKBW3PvgPWqT`, `spotify:track:4cOdK2wGLETKBW3PvgPWqT` → `{kind:'spotify', trackId:'4cOdK2wGLETKBW3PvgPWqT'}`.
  - `https://soundcloud.com/forss/flickermood?si=abc` → `{kind:'soundcloud', url:'https://soundcloud.com/forss/flickermood'}`; `https://on.soundcloud.com/AbC123` → `soundcloud-short`.
  - `https://drive.google.com/file/d/1TjtHZFlOXrPuUGBXfT1egskZystytc2f/view`, `https://drive.google.com/open?id=1TjtHZFlOXrPuUGBXfT1egskZystytc2f` → `{kind:'drive', fileId:'1TjtHZFlOXrPuUGBXfT1egskZystytc2f'}`.
  - Rejected with reason `Paste a link to a single song`: Spotify `/album/…`, `/playlist/…`, `/artist/…`; SoundCloud `/sets/`.
  - Rejected with reason `Use a YouTube, Spotify, SoundCloud or Google Drive MP3 link`: `https://tiktok.com/x`, `hello`, empty string.
  - `musicAppLinks` for a spotify-origin YouTube song returns Spotify then YouTube. `canPractise` false for `sourceType:'spotify'`.
  - API: a Music row without the new cells reads `soundcloudUrl === ''` and `spotifyUrl === ''`.
- [ ] **Step 2:** `cd shared && npx vitest run src/musicLinks.test.ts` (if `shared` has no vitest, add the same config `api` uses). Expected: FAIL.
- [ ] **Step 3: Implement** the signatures above. `parseMusicLink` trims the input and uses `new URL` with a regex fallback for `spotify:track:`. Keep `getYouTubeVideoId` (already in shared) as the YouTube branch.
- [ ] **Step 4:** Run the shared tests, then `cd api && npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(shared): music link parser, soundcloud/spotify fields`

### Task 12: HTTP and YouTube ports (+ GAS adapters, fakes, manifest)

**Files:**
- Modify: `api/src/ports.ts` (add `HttpPort`, `YouTubePort`; add `http`, `youtube` to `Ctx`; add optional `mimeType?: string` to `DriveItemInfo`)
- Modify: `api/src/gas/adapters.ts` (`GasHttpAdapter`, `GasYouTubeAdapter`; set `mimeType` in the Drive `info`), `api/src/main.ts` (put both on `ctx`)
- Modify: `api/appsscript.json` (add the YouTube advanced service `{ "userSymbol": "YouTube", "serviceId": "youtube", "version": "v3" }` and scope `https://www.googleapis.com/auth/youtube.readonly`)
- Modify: `api/test/fakes/makeCtx.ts` (scriptable fakes)
- Test: `api/test/fakes/makeCtx.test.ts` (create) 

**Interfaces:**
- Produces:
  - `HttpPort.fetch(url: string, opts?: { followRedirects?: boolean }): { status: number; headers: Record<string,string>; body: string }`. Never throws on HTTP errors; throws only on network failure.
  - `YouTubePort.search(q: string, max: number): { youtubeId: string; title: string; channel: string; thumbnailUrl: string }[]`.
  - `YouTubePort.videos(ids: string[]): { youtubeId: string; durationSec: number; embeddable: boolean }[]`.
  - Both throw `AppError('QUOTA', …)` on a quota failure. Add `'QUOTA'` handling only if `ErrorCode` lacks it (it has it already).
  - Fakes: `makeCtx().http.respond(urlPrefix, response)`, `makeCtx().youtube.setSearch(results)`, `.setVideos(map)`, `.failWith(err)`, and call logs `http.calls`, `youtube.searchCalls`.

- [ ] **Step 1: Failing test** `fakes respond by url prefix, log calls, and can throw QUOTA`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.** The GAS adapter wraps `UrlFetchApp.fetch(url, {muteHttpExceptions:true, followRedirects})`. ISO-8601 durations (`PT3M34S`) are parsed to seconds in the adapter. A quota failure is any error message containing `quota` (case-insensitive).
- [ ] **Step 4:** `cd api && npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(api): http and youtube ports with gas adapters`

### Task 13: `music.resolveLink`

**Files:**
- Create: `api/src/features/musicLinks.ts`, `api/test/features/musicLinks.test.ts`
- Modify: `api/src/features/music.ts` (register the route), `api/src/router.ts` registration if routes are listed there

**Interfaces:**
- Consumes: Task 11 `parseMusicLink`; Task 12 ports; `safeCachePut` from Task 9.
- Produces: action `music.resolveLink`, `{ perm: 'music.edit', write: false }`, payload `{ url: string }`, returning the spec's `ResolvedLink` type. Export `resolveMusicLink(ctx: Ctx, url: string): ResolvedLink` and `rankCandidates(spotify: {title:string; durationSec:number}, found: Candidate[]): Candidate[]`.

- [ ] **Step 1: Failing tests** with recorded fake responses:
  - a. YouTube: oEmbed 200 → `{kind:'youtube', title, embeddable:true}`; oEmbed 401 → `embeddable:false`.
  - b. SoundCloud: oEmbed title is `Flickermood by Forss`; 404 → `AppError('LINK_INVALID', "This SoundCloud track can't be played on other websites.")`.
  - c. `on.soundcloud.com` short link: the fake returns 302 with `location`; resolved to the canonical url.
  - d. Drive: `info.mimeType` `audio/mpeg` → ok; `video/mp4` → `AppError('LINK_WRONG_KIND', "This Drive file isn't an audio file.")`.
  - e. Spotify meta page → `{title:'Never Gonna Give You Up', artist:'Rick Astley', durationSec:214}`; candidates ranked: `lengthMatch` (±3 s) first, then `- Topic` / `Official Audio`; `Music Video` / `Live` / `Remix` pushed down unless the Spotify title has the word; max 3 returned.
  - f. Spotify page without meta tags → `AppError('LINK_INVALID', "Couldn't read this Spotify song. Paste the YouTube version instead.")`.
  - g. `youtube.search` throws QUOTA → result has `candidates: []` and `notice: 'SEARCH_QUOTA'`.
  - h. second resolve of the same Spotify link → `youtube.searchCalls` stays 1 (cache hit).
  - i. rejected link → `AppError('VALIDATION', <reason>)`.
- [ ] **Step 2:** `cd api && npx vitest run test/features/musicLinks.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** per the spec §2. Spotify scrape: regex the three meta tags, HTML-decode entities. Search query `"{artist} {title}"`. Cache key `spotify:{trackId}`, TTL 6 h.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(api): music.resolveLink for youtube, soundcloud, drive and spotify`

### Task 14: `music.create` / `music.update` from a link

**Files:**
- Modify: `api/src/features/music.ts` (create at ~line 55, update at ~line 128)
- Test: `api/test/features/music.test.ts`

**Interfaces:**
- Consumes: `parseMusicLink`, `resolveMusicLink` (Task 13).
- Produces: payload `{ styleId, eventId, sessionId?, title, url, chosenYoutubeId?, practiceUrl?, listenOnly? }`. The legacy `{ sourceType, youtubeUrl, driveFileId }` payload keeps working.

- [ ] **Step 1: Failing tests:**
  - a. YouTube url → stored `sourceType:'youtube'`, `youtubeId`.
  - b. SoundCloud url → `sourceType:'soundcloud'`, canonical `soundcloudUrl`.
  - c. Drive url → `sourceType:'mp3'`, `driveFileId`, and `setAnyoneReader` called.
  - d. Spotify url + `chosenYoutubeId` → `sourceType:'youtube'`, `youtubeId`, `spotifyUrl` kept.
  - e. Spotify url + `practiceUrl` of a SoundCloud link → `sourceType:'soundcloud'`, `spotifyUrl` kept.
  - f. Spotify url + `listenOnly:true` → `sourceType:'spotify'`, `spotifyUrl`.
  - g. Spotify url with none of the three → `VALIDATION` "Pick a practice version or choose listen-only".
  - h. Client-sent `youtubeId` for a different video than `url` is ignored (server derives).
  - i. legacy `{sourceType:'youtube', youtubeUrl}` still works.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.** Do not call the network in create when a `url` is YouTube/SoundCloud (parsing is enough); title comes from the payload.
- [ ] **Step 4:** `cd api && npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(api): create and update music from a pasted link`

### Task 15: Admin MusicForm — one box and Spotify confirmation

**Files:**
- Modify: `web/src/features/media/MusicForm.tsx`
- Create: `web/src/features/media/SpotifyPicker.tsx`
- Test: `web/src/features/media/MusicForm.test.tsx`, `web/src/features/media/SpotifyPicker.test.tsx`

**Interfaces:**
- Consumes: `music.resolveLink`, `music.create` (Tasks 13–14), `ResolvedLink` from `shared`.
- Produces: `SpotifyPicker({ resolved, onUseCandidate(youtubeId), onUsePracticeLink(url), onListenOnly })`.

- [ ] **Step 1: Failing tests** (mock `api.post`):
  - a. pasting a YouTube link fills the title and calls `music.create` with `{url}` only.
  - b. `embeddable:false` shows *"This video blocks playback outside YouTube, so dancers can't practise with it. Try the 'Official Audio' version."*
  - c. a Spotify link shows the song line and 3 cards with `✓ same length` / `✗ different length — check the version`; the **Save** button stays disabled until one is chosen.
  - d. **Use this** on card 2 posts `{url, chosenYoutubeId: <card 2 id>}`.
  - e. **Save as listen-only** posts `{url, listenOnly:true}`.
  - f. `notice:'SEARCH_QUOTA'` shows *"Search limit reached for today. Paste the YouTube link yourself or try after 4 pm."* and the paste-own box works.
  - g. a rejected link shows its reason and the form can't be saved.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.** Debounce 500 ms. **▶ Listen** swaps the thumbnail for a `youtube-nocookie.com/embed/{id}` iframe. The admin keeps the title editable.
- [ ] **Step 4:** `cd web && npx tsc -b && npx vitest run src/features/media`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(media): smart music link box with spotify confirmation`

### Task 16: Class card music row

**Files:**
- Modify: `web/src/features/calendar/ClassCard.tsx` (music section)
- Test: `web/src/features/calendar/ClassCard.test.tsx`

- [ ] **Step 1: Failing tests:**
  - a. a YouTube song shows **▶ PRACTISE IN STUDIO** and an **Open in YouTube** link (`target="_blank"`, `rel="noopener noreferrer"`).
  - b. a Spotify-origin YouTube song shows Spotify and YouTube links.
  - c. `sourceType:'spotify'` shows **no** PRACTISE button and shows **Open in Spotify**.
  - d. SoundCloud shows **Open in SoundCloud**; MP3 shows **Download MP3**.
  - e. no `<audio>` element for a SoundCloud/YouTube/Spotify song.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement** using `musicAppLinks` and `canPractise` from `@umdsc/shared`. Keep the existing `<audio controls>` only for `mp3`.
- [ ] **Step 4:** Run `cd web && npx vitest run src/features/calendar`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(calendar): open-in-app buttons for class music`

### Task 17: SoundCloud in the Studio, and the dancer "Link" tab

**Files:**
- Create: `web/src/features/music-studio/dancecue/components/SoundCloudPlayer.tsx` and `.test.tsx`
- Modify: `web/src/features/music-studio/dancecue/hooks/useAudioPlayer.ts` (source `'soundcloud'`; `loadSoundCloud(url: string)`; `attachSoundCloudPlayer(handle)`), `Studio.tsx`, `web/src/features/music-studio/sources/SourcePicker.tsx` (tab `YouTube` → `Link`), `web/src/features/music-studio/markers/useMarkers.ts` (`sourceKey` gains `{type:'sc', url}`), `AudioPlayer.tsx` (disable the speed button when `speedDisabled`)
- Test: `useAudioPlayer.test.ts`, `SourcePicker.test.tsx`, `AudioPlayer.test.tsx`

**Interfaces:**
- Produces:
  - `SoundCloudHandle`: `{ play(): void; pause(): void; seekTo(ms: number): void; getPosition(cb: (ms:number)=>void): void; getDuration(cb: (ms:number)=>void): void }`.
  - `SoundCloudPlayer({ url: string | null; isVisible: boolean; onReady(h: SoundCloudHandle): void; onPlayState(playing: boolean): void; onError(): void })`. It loads `https://w.soundcloud.com/player/api.js` once and builds the widget iframe `https://w.soundcloud.com/player/?url={url}&auto_play=false&visual=false&show_comments=false`.
  - `useAudioPlayer` returns `speedDisabled: boolean`, true when source is `soundcloud`.

- [ ] **Step 1: Failing tests** with a mocked `window.SC.Widget`:
  - a. `plays, pauses and seeks through the widget`.
  - b. `loop restart seeks back to the section start` (the rAF loop reads `getPosition`).
  - c. `speed is disabled for soundcloud` (the speed button has `disabled` and the text *"Speed isn't available for SoundCloud songs."*).
  - d. `widget ERROR shows "This song is no longer available"`.
  - e. SourcePicker: the **Link** tab accepts a SoundCloud link and a YouTube link; a Spotify link shows *"Spotify songs can't be played here. Paste the YouTube version, or open it in Spotify."* and loads nothing.
  - f. `sourceKey({type:'sc', url})` is stable and distinct from the YouTube key.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.** Studio `handleSelectClassMusic` branches on `sourceType`: `mp3`, `youtube`, `soundcloud`. For `spotify`, class cards don't offer Practise, so Studio ignores it. The SoundCloud widget shows the tap-to-start hint using the same `needsTap` rule as Task 2.
- [ ] **Step 4:** `cd web && npx tsc -b && npm test`. Expected: PASS.
- [ ] **Step 5: Real-browser check** (`webapp-testing`, Chrome and Edge): mock a dancer bootstrap with a SoundCloud song `https://soundcloud.com/forss/flickermood`. Open `/studio?music=<id>`, click the SoundCloud widget's play control, and expect the widget's `isPaused` to become false within 8 s.
- [ ] **Step 6: Commit.** `feat(studio): soundcloud practice player and dancer link tab`

### Task 18: Deploy and verify smart links

- [ ] **Step 1:** `cd api && npm run build`; commit any manifest change. Deploy per the Global Constraints.
- [ ] **Step 2: Owner setup (the only manual step).** The advanced service and its scope are in `appsscript.json`, so `clasp push` adds the service. The owner then runs `authorizeOnce` once in the Apps Script editor as `umdancesportc@gmail.com` and approves the new YouTube permission. If the owner's Google Cloud project doesn't have *YouTube Data API v3* enabled, enable it at console.cloud.google.com → APIs & Services.
- [ ] **Step 3: Live checks** with curl against `$VITE_API_URL` (needs an admin token): `music.resolveLink` for a YouTube link, a SoundCloud link and the Spotify track `https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT`. Expected: the Spotify result lists 3 candidates with the first having `lengthMatch: true`. Paste results under Measurements.
- [ ] **Step 4:** Whole suites: `npm test` at the repo root, then `cd web && npx playwright test`. Expected: PASS.
- [ ] **Step 5: Commit** docs. `docs: smart music links verification`

## Measurements

_(Task 18 notes are at the end of this section.)_

**Task 10 — live, deployment v12 then v13 (2026-10-02, about 10 pm MYT), same account, curl from the dev PC:**

| What | Before (v10/v11) | After |
|---|---|---|
| Login, calendar not cached | 10.85 s (one call, did everything) | 4.2 s (token only; v12) |
| Login, calendar cached | 3.2–4.4 s | 3.2–4.9 s with the calendar included (v13, 4 runs) |
| `dancer.bootstrap`, cold | inside the login | 7.2 s (v12, before eventStyles was backfilled) |
| `dancer.bootstrap`, cached | inside the login | 1.6–2.2 s |
| `dancer.attendance`, cold / cached | inside the login (2.6 s step) | 7.2 s / 3.5 s |

Reading:
- The login never waits on sheets for the calendar now. A cold login is a token in about 4 s, and the calendar then loads behind the loading screen.
- The cold 7.2 s is the Members-sheet fallback: live MemberIndex rows have no `eventStyles` yet. It disappears once the 5-minute warm-up trigger has run once (backfill) or each event is synced; **the owner must run `installWarmTrigger` once in the Apps Script editor** (`clasp run` is not set up for this project, so it could not be done remotely). Re-measure after that.
- About 2 s of every number is Apps Script's fixed per-request cost, which no change here can remove.
- Not done, and the next biggest cost: every request still re-reads each table (events, styles, member roles) from its sheet at 200–500 ms each.

**Task 6 — live login of the owner's account, deployment v11 (2026-10-02, 9:33 pm MYT), ms per step:**

| Run | Total | throttle | memberIndex | roles | memberRoles | rolePermissions | sign | bootstrap.events | bootstrap.styles | bootstrap.chunks | bootstrap.attendance |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 (cold bootstrap) | 10.85 s | 29 | 821 | 196 | 180 | 175 | 61 | 326 | **1277** | **1360** | **2643** |
| 2 (bootstrap cached) | 3.16 s | 6 | 521 | 253 | 262 | 268 | 11 | – | – | – | – |
| 3 (bootstrap cached) | 4.40 s | 57 | 443 | 1252 | 181 | 208 | 44 | – | – | – | – |

Reading: a cache hit costs 3–4.4 s (about 2 s is Apps Script's fixed overhead, and each table read is 180–500 ms). A miss adds about 7 s, and the cache lives only 5 minutes and is wiped by any admin edit. The three large steps are exactly what Tasks 7 (styles) and 8 (chunks, attendance leave the login path) remove.

**Task 18 — smart music links, deployed as version 15 (2026-10-02):**
- Live checks that were possible without an admin login all passed: the new `music.resolveLink` action exists (answers UNAUTHORIZED, where an unknown action answers VALIDATION), dancer login is 3.2–3.7 s, and the existing song now carries the `soundcloudUrl` and `spotifyUrl` fields (so the Music sheet got its two new columns).
- Not verified live: the admin-only `music.resolveLink` and link-based `music.create` (no admin credentials were used). Both are covered by 41 API test files using real downloaded Spotify, YouTube and SoundCloud responses, and the admin form by Playwright.
- The YouTube permission is **not** in version 15 on purpose; see `docs/ENABLE-YOUTUBE-SEARCH.md`. Version 14 (with the permission) exists but was never put live.
