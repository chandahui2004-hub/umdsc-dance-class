# Pre-publish fixes — design

**Date:** 2026-10-03 · **Branch:** `feat/neon-pixel-ui` · **Builder:** Antigravity, after it commits its current Drive-player work · **Reviewer:** Claude

## Why

A test pass on 2026-10-03 (534 unit tests, 204 e2e tests, a page-by-page sweep on 360px Android, Pixel 7 and iPhone 14 emulation, and a security read of the API) found that the site is not ready for dancers:

- `npm run build` fails, so it cannot be published.
- A dancer account opens with a matric number plus **one word** of the name.
- Studio never receives the latest loops.
- On phones, a floating button covers content and some Studio controls are cut off.
- 12 e2e tests are out of date, so the suite can't catch real regressions.

Dancers use phones; only the admin uses a laptop. "Done" means the site builds, every test passes, a new automatic phone-layout test passes, and the owner has spent 5 minutes on a real phone.

## Owner decisions (2026-10-03)

1. **Dancer login requires the full name.** Every registered word must be typed; order doesn't matter; small typos are allowed.
2. **No lockout anywhere.** Remove the 5-tries/10-minutes lock for both dancer and admin login.
   - Risk accepted: the admin account is then protected only by its password. The owner should use a password of 12+ characters.
3. **One shared login error.** "Matric not found" and "name doesn't match" look identical to the user, so nobody can find out which matric numbers are registered.
4. **The HIDE NAV / SHOW NAV button stays,** but must never cover content.
5. **Antigravity builds; Claude reviews.** Antigravity writes a report after every task so Claude can check the work.

## Part 0 — Finish the work in progress

Antigravity's uncommitted Drive-player work (11 files) is finished and committed first. That includes fixing its two build errors:

- `PixelPortraitFrame.tsx:1` — unused `React` import
- `MediaPage.tsx:427` — unused `stream` variable

No later part starts before this commit exists.

## Part A — Build passes

- `TitleScreen.tsx:103`: change `<Boombox size={56}>` to `size={64}`. `Boombox` only accepts 32, 64 or 96.
- `instructorPhotos.test.ts:5`: remove the unused `DEFAULT_INSTRUCTOR_PHOTOS` import.
- Acceptance: `npm run build` exits 0.

## Part B — Login

### Full-name check

Add `fullNameMatches(typed: string, registered: string): boolean` to `api/src/logic/normalize.ts`. Rules:

- **Splitting into words.** Both names go through the existing `extractTokens` function: lower-case, punctuation removed, and `bin`, `binti`, `bt`, `a/l`, `a/p`, `al`, `ap` dropped.
- **Every registered word must match a different typed word.** A match is either exact, or one edit away (Levenshtein distance 1) when the registered word is 5 or more letters long.
- **Extra typed words are allowed.** They don't help someone who doesn't know the full name.
- **Blank input never matches.** If either name has no words left, the result is `false`.

`auth.dancerLogin` uses `fullNameMatches` in place of `nameSimilarity(...) < 0.8`. `nameSimilarity` stays, because other code may use it later; it is just no longer used for login.

Examples against the registered name "SARAH BINTI AHMAD":

| Typed | Result |
|---|---|
| `AHMAD` | fail |
| `SARAH` | fail |
| `SARAH BINTI` | fail |
| `sarah ahmad` | pass |
| `Ahmad Sarah` | pass |
| `SARAH BINTI AHMAD` | pass |
| `Sara Binti Ahmad` | pass (`sara` is 1 edit from `sarah`) |
| `Sarah Ahmed` | pass (`ahmed` is 1 edit from `ahmad`) |
| `Sxrxh Ahmad` | fail (2 edits) |

### One shared error

- Unknown matric and wrong name both throw `AppError('NOT_REGISTERED', ...)` with the message: **"Matric number and name don't match a registered dancer. Type your full name as on the registration form."**
- `NAME_MISMATCH` is no longer thrown by login.
- `web/src/features/auth/TitleScreen.tsx` and `web/src/lib/api.ts` show that same text for `NOT_REGISTERED`.

### No lockout

- Delete every `checkThrottle` / `recordFailure` / `clearFailures` call in `api/src/features/auth.ts`, for both admin and dancer login.
- Delete `api/src/security/throttle.ts` and its tests.
- Remove `LOCKED_OUT` from `shared/src/types.ts` and from `web/src/lib/api.ts`.
- Update the admin test "wrong password 5x → 6th LOCKED_OUT" to expect `UNAUTHORIZED` on the 6th try.

### Tests

API unit tests must cover:

- every row of the examples table above
- an unknown matric number gives the same code and message as a wrong name
- 10 wrong dancer attempts, then a correct one, logs in
- 10 wrong admin passwords, then the correct one, logs in

## Part C — Studio loads the latest loops

- **API change.** `sections.list` in `api/src/features/music.ts` makes `musicId` optional.
  - Without `musicId`, it returns all active sections whose `musicId` is in the list of songs that caller may see. That list is computed with the same rules as `music.list`, including dancer event/style scoping. Move that logic into a shared helper `visibleMusic(ctx, auth, filters)` and use it from both endpoints.
  - With `musicId`, behaviour is unchanged.
- **Studio change.** In `web/src/features/music-studio/Studio.tsx`, the three live queries (videos, music, sections) use a server answer only if `Array.isArray(...)` is true. Otherwise they fall back to the bootstrap data.
- **Deploy.** The API change must be pushed and deployed: `cd api && npm run push`, then the redeploy command in `docs/SETUP-VALUES.md`. The URL does not change.
- **Tests.**
  - API unit tests: `sections.list` without `musicId`, for admin (gets all) and for a dancer (gets only their events' sections).
  - Studio unit test: a non-list answer doesn't crash the page.

## Part D — Phone layout

### HIDE NAV button

- **New hook `web/src/app/useOverlayOpen.ts`.** `useOverlayOpen(active: boolean)` adds 1 to `document.body.dataset.overlays` while `active` is true and subtracts 1 when it becomes false or the component unmounts. The attribute is removed when the count reaches 0.
- **Who calls it.** The day-sheet popup and `FullscreenStudio` call `useOverlayOpen(true)`.
- **Hiding the button.** In `web/src/index.css`: `body[data-overlays] [data-testid="mobile-nav-toggle-btn"] { display: none; }`.
- **Bottom padding.** In `PhoneShell.tsx`, `<main>` gets bottom padding equal to the dock height + 72px when the nav is shown, and 72px when it is hidden, so the last content can scroll above the button.

### Studio at 360–390px

- The audio control row (Loop, −5s, Play, +5s, 1x) wraps to a second line instead of overflowing.
- The Track Source tabs (Class Music / My MP3 / Link) shrink to fit, and their labels may wrap. No tab may be cut off.
- The synced-video `Select` dropdown is `w-full min-w-0` inside its row.

### Home page

- The event-name box shortens long names with an ellipsis (`truncate min-w-0`) instead of running off the right edge.

### New permanent test `web/e2e/phone-layout.spec.ts`

- **Setup:** dancer and admin sessions, mocked like the existing specs, at widths 360 and 390.
- **Pages visited:** `/`, `/studio`, Studio fullscreen, `/me`, `/login`, `/admin/login`, `/admin/calendar`, `/admin/media`.
- **Fails if:**
  - `document.documentElement.scrollWidth` is greater than the viewport width
  - any visible `button`, `select` or `a` extends past the right edge of the viewport
  - the nav toggle is visible while fullscreen or the day sheet is open

## Part E — Readability and tap size

- **Tap size.** In `FullscreenStudio.tsx`, every button (Play, Loop, Set In, Set Out, Loops, Save, Exit, speed, Set Start Here, −0.5s, +0.5s, Reset, Save to Loop, Drive Player toggle) is at least 44px tall (`min-h-[44px]`).
- **Text size.** Every `text-[8px]` and `text-[9px]` in `web/src/**/*.tsx` becomes `text-[10px]`: 108 occurrences in 29 files, done with one script.
  - Afterwards, the phone-layout test and a look at the screenshots confirm nothing overflows.
  - Where something does overflow, fix the layout (wrap or ellipsis); don't shrink the text back.

## Part F — Finish the Drive-player feature

All in `FullscreenStudio.tsx`.

- **Start flag dragging.**
  - The flag gets `touch-action: none` so the page doesn't scroll while dragging.
  - On pointer down it calls `setPointerCapture(e.pointerId)` and listens to `pointermove`, `pointerup` and `pointercancel` on the flag itself, not on `window`.
  - `pointercancel` ends the drag the same way `pointerup` does.
- **Accessibility.**
  - The outer video bar is no longer `role="slider"`: remove the role, `aria-label` and `tabIndex`. It stays a click-to-seek area.
  - The flag is the only slider: `role="slider"`, `aria-valuemin={0}`, `aria-valuemax={duration}`, `aria-valuenow={videoStart}`, `aria-valuetext` like "Video start 0:12.5".
  - Left/Right arrow keys nudge the flag by ±0.5s.
- **Honest Drive Player label.**
  - While Drive Player mode is on, a one-line note shows under the video: **"Drive player doesn't follow the music. Switch to Direct Sync to practise in time."**
  - The toggle reads `🎬 DRIVE PLAYER (NO SYNC)`.

## Part G — Out-of-date tests and the final check

Fix the 12 failing e2e tests. Each failed on both the mobile and desktop project, which is the 24 failures.

| Test file | Why it fails | Fix |
|---|---|---|
| `admin-today.spec.ts` (2 tests) | `/admin/today` now redirects to Calendar | Replace with one test asserting the redirect to `/admin/calendar` |
| `admin-classes.spec.ts` "ALL EVENTS…" | `getByRole('combobox')` now matches 3 selects | Select the event picker by its label |
| `login.spec.ts` "admin login goes to /admin/calendar…" | Heading regex matches 2 headings | Use `getByRole('heading', { name: 'Calendar & Classes' })` |
| `studio.spec.ts` (3 tests) and `studio-sync.spec.ts` (3 tests) | Studio crashed on the mock's non-list answers | Fixed by Part C. Also have these specs' mocks answer `videos.list`, `music.list` and `sections.list` from their bootstrap data |
| `studio.spec.ts` YouTube and SoundCloud (2 tests) | Need real internet | Keep, but tag `@internet` so `npx playwright test --grep-invert @internet` runs offline |
| `visual-neon.spec.ts` | Screenshot differs | Open the diff images. If they only show intended design changes, update with `--update-snapshots`; otherwise fix the regression |

### Final gate — all must pass before publishing

1. `npm test` (all workspaces)
2. `npm run build`
3. `cd web && npx playwright test --grep-invert @internet`, including the new phone-layout spec
4. The API is deployed (Part C)
5. The owner's 5-minute real-phone check: dancer login with full name → calendar → day sheet → Studio → fullscreen practice → drag the start flag → Me → log out

## Reporting (for Claude's review)

After every part, Antigravity appends a section to `docs/superpowers/reports/2026-10-03-prepublish-fixes-report.md` containing:

- the part's name
- the commit hash
- the files changed
- the exact test/build commands it ran, with their pass/fail counts
- anything it skipped or did differently from this spec, and why

Out of scope: publishing to Netlify/hosting (main plan Task 34), PIN login, and new features.
