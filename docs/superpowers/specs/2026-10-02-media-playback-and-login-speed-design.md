# Media Playback & Dancer Login Speed — Design

**Date:** 2026-10-02 · **Branch:** `feat/events` · **Supersedes:** `docs/superpowers/plans/2026-10-01-audio-perf-and-fast-login.md` Tasks 2–4. That plan's Task 1 (no MP4 as music) is done and stays.

The owner reported three problems: (1) dancers can't see videos uploaded by an admin, (2) YouTube music doesn't play in the Studio, and (3) dancer login is too slow. Each section below gives the **verified** root cause with its evidence, then the decided fix.

---

## 1. Dancers can't see class videos

### Evidence (2026-10-01)
- The two real videos in Drive `OCT MONTHLY CLASS / 2026-10-15 Locking Class 1` (`1TjtHZFl…`, `1OBY7Pc3…`) are **registered** and reach the dancer bootstrap (2 videos for `ses_O7i3imOUr0`).
- Both are **HEVC/H.265 (`hvc1`), 4018×2160** MP4s. The `moov` atom sits at the end of the file (not fast-start).
- Both are public. `streamUrl()` returns HTTP 206 when the request carries a `localhost:5173` Referer.
- Playback depends on the browser:
  - Chrome on the owner's PC (hardware HEVC): plays.
  - A browser without HEVC: plays **audio only, with a 0×0 black picture**.
  - Edge on Windows decodes HEVC only with the paid Microsoft Store add-on, and the owner tests on Edge.
- `videoFormatWarning()` only looks at `.mov`/`.hevc` names and MIME types, so an `.mp4` containing HEVC passes silently.
- Antigravity's "Drive API 403" evidence came from a made-up file ID sent without a Referer. The API key is **referrer-restricted** (`API_KEY_HTTP_REFERRER_BLOCKED` on an empty referer), so that 403 says nothing about real files.

### Decisions
- **Upload: warn, don't block.** Detect the real codec from the file bytes. For HEVC, show a warning that explains how to re-export (iPhone: Settings → Camera → Formats → *Most Compatible*; CapCut/phone editor: export H.264 1080p). The admin can continue anyway.
- **Class card:** play through Drive's own preview player (`/file/d/{id}/preview`, Antigravity's uncommitted change), because Drive serves its own transcode. **Unverified:** it renders blank in headless browsers, so the owner must check it on Edge and on a phone. The "open folder in Drive" links from the same change stay.
- **Studio synced video:** keeps `<video src=streamUrl>`, because sync needs frame control. When the picture decodes as 0×0, it shows a clear message instead of black.

## 2. YouTube music doesn't play

### Evidence (2026-10-01/02)
- The owner's track "HI" is `4_KN-gA6uXY`. It is embeddable (oEmbed returns 200).
- Repro in **both Chrome and Edge**:
  - Opening `/studio?music=<id>` (track chosen before the API loads) → plays.
  - Opening `/studio`, then clicking a Class Music item (the owner's path) → stuck on "Loading YouTube audio…", then "Still loading…", at 0:00/0:00.
- **Root cause:** `YouTubePlayer` builds `new YT.Player(el, { videoId: undefined, … })` when no track is selected yet. The current YouTube widget API **throws `Invalid video id`** for that. The player is left broken: no methods, and an iframe with an empty `src`. Later calls throw `cueVideoById is not a function`, and the player is never rebuilt.
- Verified in isolation (Edge): leaving the `videoId` key out, or building only once a real id exists, gives a ready player that cues "HI" (state 5, duration 256 s).
- DanceCue has the same latent bug. Its "reload the page 2 s after the first YouTube link" hack hides it, and our port dropped the hack.
- There is no MP3 conversion in DanceCue; it plays YouTube through a hidden IFrame, as we do.

### Decisions
- Fix the construction bug.
- **Option A:** on phones, `playVideo()` on an untouched cross-origin iframe is blocked (YouTube IFrame API docs, "Mobile considerations"; not yet tested on a device). So the YouTube player becomes a **small visible, tappable player**. If Play doesn't reach "playing" within 3 s, show "Tap the YouTube player once to start".
- **Option B:** encourage MP3. The admin music dialog recommends MP3 for practice tracks. The dancer class card **no longer shows the YouTube music video** (owner: "I don't need to show mp4 for the YouTube link"); it shows the track row and **▶ PRACTISE IN STUDIO** only.
- **Rejected:** server-side YouTube→MP3 conversion (against YouTube's terms, not possible in Apps Script, fragile).

## 3. Dancer login is slow

### Evidence (live deployment `AKfycbz3z…`, 2026-10-02)
| Request | Time |
|---|---|
| Unknown action (pure Apps Script overhead) | 1.7–2.4 s |
| `auth.dancerLogin` with unknown matric (MemberIndex read) | 2.6–3.1 s |
| Real login, CHAN DA HUI / 23005147, cold | **17.8 s** |
| Same, repeated (dancer boot cache should be warm) | **11.3 s** |

- The bootstrap is only 6.3 KB (2 events, 2 styles, 10 sessions).
- Antigravity's member-cache commit `2585781` was **never deployed** (no `clasp push` after it).
- Its `cache.put` has no guard for CacheService's 100 KB-per-value limit. A large Members JSON would throw and fail the login.
- The 11 s repeat is **not explained** by reading the code (about 5 sheet reads plus 2 s overhead). It must be measured per step before optimising.
- The client is fine: one request, and the returned bootstrap is reused.

### Decisions (all four)
1. **Measure first:** per-step server timings returned on request.
2. **Precompute** each dancer's styles per event into `MemberIndex.eventStyles` at sync time. Login then never opens an event Members spreadsheet.
3. **Fast login UX:**
   - `auth.dancerLogin` returns token + claims only.
   - The client navigates immediately and the calendar loads via `dancer.bootstrap` behind the existing loading state.
   - Attendance moves out of the bootstrap into a separate `dancer.attendance` call, fetched after the calendar renders.
4. **Cache safety + warm-up:**
   - Size-guarded cache puts.
   - A time-driven trigger every 5 min pre-builds member/chunk caches.
   - Then **deploy** to `AKfycbz3z…` and re-measure with the same curl calls.
   - Target for a repeat login: ≤ 5 s to token.

## Out of scope / known limits
- The ~2 s Apps Script overhead per request remains while the API is on Apps Script.
- Dancer sessions last 30 days, so the login cost is paid about once a month.
- **Phone testing needs publishing:** the site only runs on `localhost:5173`; Cloudflare go-live is main-plan Task 34. The published domain must be added to the Google API key's HTTP-referrer allowlist, or Drive MP3/video streaming will return 403 on phones.
