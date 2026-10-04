# Pre-publish Fixes Implementation Plan

> **For agentic workers (Antigravity / Gemini):** REQUIRED SUB-SKILL: use `executing-plans` (from `.agents/skills/`) to run this plan task by task, in order. Use `test-driven-development` for every task that has a "failing test" step, and `verification-before-completion` before ticking any task's last box. Steps use checkbox (`- [ ]`) syntax; tick each box as you finish it. **Stop at every 🧑 OWNER ACTION** and wait for the owner.

**Goal:** Make the UMDSC site safe and smooth for dancers on phones, so the owner can publish it.

**Architecture:**
- **Server-side changes** (full-name login check, one shared login error, no lockout, `sections.list` without a song ID) are deployed once to the existing Apps Script URL.
- **Web changes:**
  - Studio guards against bad answers.
  - A small overlay hook hides the floating nav button.
  - Layout fixes are proven by a new permanent phone-layout Playwright test.
  - All 8–9px text becomes 10px.
  - Antigravity's Drive-player work is finished.
- **Tests:** 12 out-of-date e2e tests are updated so the suite is green again.

**Tech Stack:** TypeScript, Google Apps Script API (`api/`, Vitest, clasp), React 19 + Vite 6 + Tailwind v4 (`web/`, Vitest, Playwright), shared types (`shared/`).

**Spec:** `docs/superpowers/specs/2026-10-03-prepublish-fixes-design.md`. Read it in full before Task 1. "Part B" and the like refer to it.

## Global Constraints

- **No lockout anywhere.** Nothing may count failed logins or block a user after failures.
- **Login error text, exactly:** `Matric number and name don't match a registered dancer. Type your full name as on the registration form.` Code: `NOT_REGISTERED`, for both unknown matric and wrong name.
- **Full-name rule:**
  - Every registered word must match a *different* typed word.
  - Exact match, or Levenshtein distance 1 when the registered word has 5+ letters.
  - Extra typed words are allowed; order doesn't matter.
  - `bin`, `binti`, `bt`, `a/l`, `a/p`, `al`, `ap` are ignored.
- **Tap targets:** every button in `FullscreenStudio.tsx` is at least 44px tall (`min-h-[44px]`).
- **Text:** no `text-[8px]` or `text-[9px]` anywhere in `web/src`; minimum `text-[10px]`.
  - This overrides the neon redesign rule "Press Start 2P only at 8, 12, 16, 24 or 32px", for 10px only.
  - Inputs, selects and textareas stay at 16px or more.
- **Phone widths:** 360px and 390px. No horizontal page scroll, and no button, select or link cut off.
- **Don't change** routes, `data-testid`s, or API action names, except where a task says so.
- **Commands:**
  - API tests: `npm test -w api`
  - Web unit tests: `npm test -w web`
  - Build: `npm run build` (repo root)
  - e2e: `cd web && npx playwright test --grep-invert @internet`
- **Report after every task.** Append to `docs/superpowers/reports/2026-10-03-prepublish-fixes-report.md`, using the template at the end of this plan. A task is not finished until its report section is written.

## Review Focus

Real-world inputs that would hurt a dancer and that ordinary tests miss. Each has a test in the named task:

1. **Malay/Indian name forms.** Registered `MUHAMMAD ALI BIN ABU BAKAR` must accept typed `Muhammad Ali Abu Bakar`. Registered `RAJ KUMAR A/L SELVAM` must accept `raj kumar selvam`. → Task 2.
2. **Punctuation and repeated words.** `NUR'AIN BINTI ZAKI` must accept `nurain zaki`. Registered `NUR NUR AISYAH` must be rejected for typed `nur aisyah`: each registered word needs its own typed word. → Task 2.
3. **Short Chinese name words.** Registered `TAN AH KOW` accepts `tan ah kow`, rejects `tan ah` (missing word) and `tan ah kaw` (typo in a 3-letter word). → Task 2.
4. **The server answers Studio with something that isn't a list** (an error object, or `{}` during a bad deploy). Studio must still show the bootstrap songs and loops, not a blank page. → Task 5.
5. **Two overlays at once, or leaving fullscreen by navigating away.** The nav button must stay hidden while any overlay is open, and come back once all are closed or unmounted. → Task 8.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `api/src/logic/normalize.ts` | modify | export `levenshtein`; add `fullNameMatches` |
| `api/src/features/auth.ts` | modify | full-name check, shared error, remove throttle |
| `api/src/security/throttle.ts` + `api/test/security/security.test.ts` (throttle part) | delete / modify | lockout removed |
| `shared/src/types.ts` | modify | drop `LOCKED_OUT` |
| `api/src/features/music.ts` | modify | `visibleMusic` helper; `sections.list` without `musicId` |
| `web/src/lib/api.ts`, `web/src/features/auth/TitleScreen.tsx` | modify | new login error text |
| `web/src/features/music-studio/Studio.tsx` | modify | `Array.isArray` guards |
| `web/src/app/useOverlayOpen.ts` (+ test) | create | overlay counter on `<body>` |
| `web/src/app/PhoneShell.tsx`, `web/src/theme/pixel.css` | modify | bottom padding; hide nav toggle during overlays |
| `web/src/features/calendar/DaySheet.tsx`, `FullscreenStudio.tsx` | modify | call `useOverlayOpen` |
| `web/src/features/music-studio/dancecue/components/AudioPlayer.tsx`, `sources/SourcePicker.tsx`, `sync/VideoPanel.tsx`, `features/calendar/DancerHome.tsx` | modify | phone cut-off fixes |
| `web/e2e/phone-layout.spec.ts` | create | permanent phone-layout test |
| `web/scripts/text-floor.mjs` | create | one-off 8/9px → 10px script |
| `web/e2e/admin-today.spec.ts`, `admin-classes.spec.ts`, `login.spec.ts`, `studio.spec.ts`, `studio-sync.spec.ts`, `visual-neon.spec.ts` | modify | out-of-date tests |

---

### Task 0: Finish the current Drive-player work and commit

**Files:** Antigravity's 11 uncommitted files; `web/src/components/ui/PixelPortraitFrame.tsx:1`; `web/src/features/media/MediaPage.tsx:427`; the spec and this plan.

- [ ] **Step 1:** Make sure `docs/superpowers/reports/2026-10-03-antigravity-current-task-report.md` exists, as the owner asked earlier. If it doesn't, write it now (task, changes per file, what's not done, commands and results, git state).
- [ ] **Step 2:** In `PixelPortraitFrame.tsx`, remove the unused default `React` import; keep any named imports in use. In `MediaPage.tsx` near line 427, delete the unused `stream` variable and its now-unused `streamUrl` import, if nothing else uses it.
- [ ] **Step 3:** Run `cd web && npx tsc -b`. Expected: the only errors left are `TitleScreen.tsx(103…)` and `instructorPhotos.test.ts(5…)`; Task 1 fixes those.
- [ ] **Step 4:** Run `npm test -w web`. Expected: all pass.
- [ ] **Step 5: Commit**

```bash
git add -A web docs/superpowers/specs/2026-10-03-prepublish-fixes-design.md docs/superpowers/plans/2026-10-03-prepublish-fixes.md docs/superpowers/reports
git commit -m "feat(studio): Drive player fallback for unplayable videos and draggable video start flag"
```

- [ ] **Step 6:** Write the Task 0 report section.

### Task 1: Build passes

**Files:** `web/src/features/auth/TitleScreen.tsx:103`, `web/src/lib/instructorPhotos.test.ts:5`

- [ ] **Step 1:** In `TitleScreen.tsx:103`, change `<Boombox size={56}` to `<Boombox size={64}`.
- [ ] **Step 2:** In `instructorPhotos.test.ts`, remove `DEFAULT_INSTRUCTOR_PHOTOS` from the import list.
- [ ] **Step 3:** Run `npm run build` from the repo root. Expected: exit code 0, and Vite prints `✓ built in`.
- [ ] **Step 4:** Look at `/login` at 390px wide in the browser (`npm run dev`). The speaker must not overlap the "DANCE CLASS SYSTEM" text.
- [ ] **Step 5:** Commit: `git commit -am "fix(build): valid Boombox size and unused import"`
- [ ] **Step 6:** Write the report section.

### Task 2: `fullNameMatches`

**Files:** Modify `api/src/logic/normalize.ts`. Test: `api/test/logic/normalize.test.ts`.

**Interfaces:**
- Produces: `export function fullNameMatches(typed: string, registered: string): boolean`.
- Produces: `export function levenshtein(a: string, b: string): number` (currently private at line 45; add `export`).
- Uses the existing private `extractTokens`.

- [ ] **Step 1: Write the failing tests.** Add `describe('fullNameMatches', ...)` to `normalize.test.ts` with these cases:

```ts
const R = 'SARAH BINTI AHMAD';
it.each([
  ['AHMAD', R, false], ['SARAH', R, false], ['SARAH BINTI', R, false],
  ['sarah ahmad', R, true], ['Ahmad Sarah', R, true], ['SARAH BINTI AHMAD', R, true],
  ['Sara Binti Ahmad', R, true], ['Sarah Ahmed', R, true], ['Sxrxh Ahmad', R, false],
  ['sarah ahmad nickname', R, true], ['', R, false], ['sarah', '', false],
  // Review Focus 1–3
  ['Muhammad Ali Abu Bakar', 'MUHAMMAD ALI BIN ABU BAKAR', true],
  ['raj kumar selvam', 'RAJ KUMAR A/L SELVAM', true],
  ['nurain zaki', "NUR'AIN BINTI ZAKI", true],
  ['nur aisyah', 'NUR NUR AISYAH', false],
  ['nur nur aisyah', 'NUR NUR AISYAH', true],
  ['tan ah kow', 'TAN AH KOW', true], ['tan ah', 'TAN AH KOW', false], ['tan ah kaw', 'TAN AH KOW', false],
])('fullNameMatches(%j, %j) = %s', (typed, registered, expected) => {
  expect(fullNameMatches(typed, registered)).toBe(expected);
});
```

- [ ] **Step 2:** Run `npm test -w api -- normalize`. Expected: FAIL, `fullNameMatches is not exported`.
- [ ] **Step 3:** Implement `fullNameMatches` in `normalize.ts`.
  - Tokenise both names with `extractTokens`. If either list is empty, return `false`.
  - For each registered word, find and use up one unused typed word that is equal, or (registered word length ≥ 5) has `levenshtein ≤ 1`.
  - Return `false` if any registered word finds nothing.
  - Try exact matches for all words first, then typo matches. That way a typo match can't steal a word another registered word needed exactly.
  - Check that `nurain` comes out of `extractTokens("NUR'AIN")` as one word. If it becomes `nur ain`, make `extractTokens` delete `'` and `’` instead of turning them into spaces, then re-run the whole `normalize.test.ts`.
- [ ] **Step 4:** Run `npm test -w api -- normalize`. Expected: PASS, all cases.
- [ ] **Step 5:** Commit: `git commit -am "feat(api): fullNameMatches — every registered name word required"`
- [ ] **Step 6:** Write the report section.

### Task 3: Login uses full name, one shared error, no lockout

**Files:**
- Modify: `api/src/features/auth.ts`, `shared/src/types.ts:6`, `web/src/lib/api.ts:44-49`, `web/src/features/auth/TitleScreen.tsx:60-66`
- Delete: `api/src/security/throttle.ts`
- Tests: `api/test/features/auth.test.ts`, `api/test/security/security.test.ts`

**Interfaces:**
- Consumes: `fullNameMatches` (Task 2).
- Produces: login failures for dancers are always `NOT_REGISTERED` with the exact text from Global Constraints. `LOCKED_OUT` no longer exists.

- [ ] **Step 1: Update and add the failing tests** in `auth.test.ts`:
  - Change test `'dancerLogin: right matric, different person name → NAME_MISMATCH'` to expect `NOT_REGISTERED`, with `res.error.message` equal to the exact text.
  - Change `'dancerLogin: unknown matric → NOT_REGISTERED'` to also assert that exact message.
  - Add `'dancerLogin: one word of the name is rejected'`. For the existing member `ahmad fiqri mohd zamri` / `22004591`, typed `ahmad` gives `NOT_REGISTERED`.
  - Add `'dancerLogin: 10 wrong names then the right one logs in'`.
  - Rename `'wrong password 5x → 6th LOCKED_OUT'` to `'wrong password 10x → correct password still logs in'`. Assert each wrong try is `UNAUTHORIZED`, and that the 11th try with `SecretAdminPass` is `ok`.
  - In `security.test.ts`, delete the throttle `describe` block and the `throttle` import.
- [ ] **Step 2:** Run `npm test -w api -- auth`. Expected: the new and changed tests FAIL.
- [ ] **Step 3:** Change `auth.ts`.
  - Remove the `throttle` import and every `checkThrottle` / `recordFailure` / `clearFailures` call, along with the `throttleKey` variables, in both `auth.adminLogin` and `auth.dancerLogin`.
  - In `dancerLogin`, replace the `nameSimilarity(...) < 0.8` check with `!fullNameMatches(fullName, dancer.fullName)`.
  - Both failure branches throw `new AppError('NOT_REGISTERED', <exact text>)`.
  - Delete `api/src/security/throttle.ts`.
  - Remove `|'LOCKED_OUT'` from `shared/src/types.ts`.
- [ ] **Step 4:** Change the web side.
  - In `api.ts`, the `NOT_REGISTERED` case returns the exact text, and the `LOCKED_OUT` case is deleted.
  - In `TitleScreen.tsx`, delete the `NAME_MISMATCH` and `NOT_REGISTERED` branches so both fall through to `setError(errorMessage(err))`.
- [ ] **Step 5:** Run `npm test` (repo root, all workspaces). Expected: all pass. Fix any test elsewhere that still mentions `LOCKED_OUT` or `NAME_MISMATCH` for login.
- [ ] **Step 6:** `cd web && npx playwright test e2e/login.spec.ts --project=mobile`. Fix any assertion on the old error texts by changing it to the new exact text. (The "Calendar & Classes" heading failure is Task 12; ignore it here.)
- [ ] **Step 7:** Commit: `git commit -am "feat(auth): full-name dancer login, one shared error, remove lockout"`
- [ ] **Step 8:** Write the report section.

### Task 4: `sections.list` works without a song ID

**Files:** Modify `api/src/features/music.ts` (lines 10–42 and 216–231). Test: `api/test/features/music.test.ts`.

**Interfaces:**
- Produces: `function visibleMusic(ctx: Ctx, auth: AuthInfo | null, filters: { eventId?: string; styleId?: string; sessionId?: string }): Music[]`, in `music.ts`. It holds today's `music.list` body unchanged. Use the same types `music.list`'s handler already receives.
- Produces: `sections.list` payload `{ musicId?: string }`.

- [ ] **Step 1: Write the failing tests** in `music.test.ts`:
  - `'sections.list without musicId returns all active sections for admin'`
  - `'sections.list without musicId gives a dancer only sections of music in their events'`: create two music rows in different events, and a dancer enrolled in one; expect only that event's sections.
  - Keep the existing `musicId` tests unchanged.
- [ ] **Step 2:** Run `npm test -w api -- music`. Expected: the new tests FAIL with `VALIDATION: musicId is required`.
- [ ] **Step 3:** Move `music.list`'s body into `visibleMusic`; `music.list` returns `visibleMusic(ctx, auth, payload || {})`. In `sections.list`:
  - With `musicId`: behaviour is unchanged.
  - Without it: build `ids = new Set(visibleMusic(ctx, auth, {}).map(m => m.id))` and return the active sections whose `musicId` is in `ids`, sorted by `musicId` then `startSec`.
- [ ] **Step 4:** Run `npm test -w api`. Expected: all pass.
- [ ] **Step 5:** Commit: `git commit -am "feat(api): sections.list returns all visible sections when musicId is omitted"`
- [ ] **Step 6:** Write the report section.

### Task 5: Studio ignores answers that aren't lists

**Files:** Modify `web/src/features/music-studio/Studio.tsx:39-68`. Test: the Studio unit test file next to it (create `Studio.guard.test.tsx` if none mocks `api.post`).

- [ ] **Step 1: Write the failing test** `'Studio falls back to bootstrap lists when live queries return non-arrays'`:
  - Mock `api.post` to resolve `{ data: {} }` for `videos.list`, `music.list` and `sections.list`.
  - Use dancer bootstrap data with one song titled `Hip Hop Routine Song`.
  - Render `/studio`. Expect `Hip Hop Routine Song` on screen and no thrown error.
- [ ] **Step 2:** Run `npm test -w web -- Studio`. Expected: FAIL with `...filter is not a function`.
- [ ] **Step 3:** In `Studio.tsx`, each list becomes `Array.isArray(liveX) ? liveX : (bootstrap list || [])`, for `musicList`, `sectionsList` and `videosList`.
- [ ] **Step 4:** Run `npm test -w web`. Expected: all pass.
- [ ] **Step 5:** Commit: `git commit -am "fix(studio): ignore non-list live query answers"`
- [ ] **Step 6:** Write the report section.

### Task 6: Deploy the API changes (Tasks 3–4)

- [ ] **Step 1:** 🧑 **OWNER ACTION.** Ask the owner: "Ready to deploy the login and Studio API changes to the live Apps Script? Dancers will need their full name from now on." Wait for "yes".
- [ ] **Step 2:** Run `cd api && npm run push`, then the redeploy command in `docs/SETUP-VALUES.md` (`npx clasp update-deployment <deployment ID>`). Expected: clasp prints the deployment with a new version number.
- [ ] **Step 3:** Open `<VITE_API_URL from web/.env.local>?action=health` in a browser. Expected: `{"ok":true,"data":{"version":...}}`.
- [ ] **Step 4:** 🧑 **OWNER ACTION.** Ask the owner to log in on a phone as a real dancer:
  - with only one word of the name → the new error text appears
  - with the full name → logs in
- [ ] **Step 5:** Update the version line in `docs/SETUP-VALUES.md`, commit (`git commit -am "chore: record API deployment version"`), and write the report section.

### Task 7: Permanent phone-layout test (written first; it fails until Tasks 8–9)

**Files:** Create `web/e2e/phone-layout.spec.ts`.

**Interfaces:**
- Consumes: `mockApi`, `loginAsAdmin` from `e2e/fixtures/mockApi.ts`; `dancerBootstrap` from `e2e/fixtures/mockData.ts`.
- Produces: the test ids used in later tasks' runs: `phone-layout`, `nav toggle hidden in overlays`.

- [ ] **Step 1: Write the spec.**

  **Setup:**
  - `test.use({ viewport })` in a loop over widths `[360, 390]`, height 800.
  - Dancer session: copy `loginAsDancer` from `e2e/studio.spec.ts`.
  - Dancer bootstrap: `dancerBootstrap`, plus one music item `m-1` titled `Hip Hop Routine Song With A Fairly Long Title (Official Audio)` and one section.
  - Use `mockApi` with handlers for `dancer.bootstrap`, `dancer.attendance`, `videos.list`, `music.list` and `sections.list`. The `*.list` handlers return the bootstrap arrays.

  **Pages:**
  - `/`
  - `/` with the day sheet open (click `button[data-date]` of the first session date)
  - `/studio?music=m-1`
  - Studio fullscreen (click the button with name `/full ?screen/i`)
  - `/me`
  - `/login`
  - `/admin/login`
  - `/admin/calendar` and `/admin/media`, as admin

  **On each page, after `networkidle`, evaluate in the page and collect failures:**
  - `document.documentElement.scrollWidth > innerWidth`
  - any visible `button, select, a[href], [role=tab]` whose rect goes past `0..innerWidth`
  - any such element whose rect goes past the rect of an ancestor whose computed `overflow-x` is `hidden` or `clip`. Ancestors with `auto` / `scroll` are allowed scrollers.
  - any visible `button` with `scrollWidth > clientWidth + 1` (a cut-off label), unless it or an ancestor has `data-truncate-ok`

  **Assertion:** `expect(failures).toEqual([])`, with a message listing each failure as `tag "label" L=.. R=..`.

  **Separate test `nav toggle hidden in overlays`:**
  - With the day sheet open, and again in Studio fullscreen, `getByTestId('mobile-nav-toggle-btn')` is hidden.
  - After closing each, it is visible again.
- [ ] **Step 2:** Add `data-truncate-ok` to the top-bar user button (`aria-label="Open user info board"`). It shortens names on purpose.
- [ ] **Step 3:** Run `cd web && npx playwright test e2e/phone-layout.spec.ts --project=mobile`. Expected: FAIL, listing at least the Studio `1x` button, the `Link` tab, the `Select class video` dropdown and the home `dancer-event-select`, plus the nav-toggle test. Paste the failure list into the report.
- [ ] **Step 4:** Commit: `git add web/e2e/phone-layout.spec.ts && git commit -am "test(e2e): permanent phone-layout check (red until layout fixes)"`
- [ ] **Step 5:** Write the report section.

### Task 8: Nav toggle never covers content

**Files:**
- Create: `web/src/app/useOverlayOpen.ts`, `web/src/app/useOverlayOpen.test.tsx`
- Modify: `web/src/app/PhoneShell.tsx:116,121-160`, `web/src/theme/pixel.css`, `web/src/features/calendar/DaySheet.tsx`, `web/src/features/music-studio/FullscreenStudio.tsx`

**Interfaces:**
- Produces: `export function useOverlayOpen(active: boolean): void`.
- While at least one caller is active, `document.body.dataset.overlays` holds the count as a string. When the count is 0, the attribute is removed.

- [ ] **Step 1: Write the failing tests** in `useOverlayOpen.test.tsx`, using `renderHook`:
  - `'sets data-overlays while active and removes it on unmount'`
  - `'two overlays: closing one keeps the attribute, closing both removes it'` (Review Focus 5)
  - `'switching active from true to false removes it'`
- [ ] **Step 2:** Run `npm test -w web -- useOverlayOpen`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement the hook with a module-level counter, using a `useEffect` keyed on `active` whose cleanup subtracts.
- [ ] **Step 4:** Call `useOverlayOpen(isOpen)` in `DaySheet` and `useOverlayOpen(true)` in `FullscreenStudio`.
- [ ] **Step 5:** Add the CSS rule to `web/src/theme/pixel.css`:

  ```css
  body[data-overlays] [data-testid="mobile-nav-toggle-btn"] { display: none; }
  ```

  In `PhoneShell.tsx`, give `<main>` bottom padding:
  - nav shown: `pb-[calc(var(--dock-h)+env(safe-area-inset-bottom)+72px)]`
  - nav collapsed: `pb-[calc(env(safe-area-inset-bottom)+72px)]`
- [ ] **Step 6:** Run `npm test -w web`, then `cd web && npx playwright test e2e/phone-layout.spec.ts -g "nav toggle"`. Expected: both PASS.
- [ ] **Step 7:** Commit: `git commit -am "fix(phone): hide nav toggle during overlays and pad content clear of it"`
- [ ] **Step 8:** Write the report section.

### Task 9: Studio and Home fit at 360–390px

**Files:**
- Modify: `web/src/features/music-studio/dancecue/components/AudioPlayer.tsx` (the Loop/−5s/Play/+5s/1x row)
- Modify: `web/src/features/music-studio/sources/SourcePicker.tsx` (tab row around line 65–115)
- Modify: `web/src/features/music-studio/sync/VideoPanel.tsx:331-337`
- Modify: `web/src/features/calendar/DancerHome.tsx:184-200`

- [ ] **Step 1:** `AudioPlayer`: give the control row `flex-wrap` with `gap-2`, so buttons move to a second line instead of being clipped. Do not shrink buttons below 44px tall.
- [ ] **Step 2:** `SourcePicker` tabs: each tab is `flex-1 min-w-0`, and the label may wrap (`whitespace-normal break-words leading-tight`). Remove `truncate` / `whitespace-nowrap` from tab labels.
- [ ] **Step 3:** `VideoPanel` select row: the row is `flex items-center gap-2 min-w-0`. The select drops `max-w-[280px]` and becomes `w-full min-w-0 flex-1`.
- [ ] **Step 4:** `DancerHome` event row: the wrapper is `flex items-center gap-2 min-w-0`, and `#dancer-event-select` gets `min-w-0 flex-1 w-full truncate`.
- [ ] **Step 5:** Run `cd web && npx playwright test e2e/phone-layout.spec.ts`. Expected: PASS for both widths and both projects. Fix any other failure it lists the same way (wrap or `min-w-0` + `truncate`; never shrink text or tap size).
- [ ] **Step 6:** Commit: `git commit -am "fix(phone): no cut-off controls in Studio and Home at 360-390px"`
- [ ] **Step 7:** Write the report section.

### Task 10: Readable text and big fullscreen buttons

**Files:** Create `web/scripts/text-floor.mjs`. Modify every `web/src/**/*.tsx` containing `text-[8px]` or `text-[9px]`, and `FullscreenStudio.tsx`.

- [ ] **Step 1:** Write `web/scripts/text-floor.mjs`.
  - It walks `web/src`, and in every `.tsx` file replaces the regex `/\btext-\[(8|9)px\]/g` with `text-[10px]`.
  - It prints `<file>: <count>` and a total.
- [ ] **Step 2:** Run `node web/scripts/text-floor.mjs`. Expected: total `108` (or close to it, if Tasks 0–9 changed some). Then run `grep -rE "text-\[(8|9)px\]" web/src`. Expected: no output.
- [ ] **Step 3:** In `FullscreenStudio.tsx`, add `min-h-[44px]` to every `<button>` that lacks a min height of 44px or more. That includes Play, Loop, Set In, Set Out, Loops, Save Loop, Exit, the speed control, Set Start Here, −0.5s, +0.5s, Reset, Save to Loop, and the Drive Player toggle. Where a row then overflows, add `flex-wrap`.
- [ ] **Step 4:** Add to `phone-layout.spec.ts`: on the Studio fullscreen page, every visible `button` has `getBoundingClientRect().height >= 44`.
- [ ] **Step 5:** Run `npm test -w web`, then `cd web && npx playwright test e2e/phone-layout.spec.ts`. Expected: all PASS. Fix layout breakage by wrapping, never by shrinking.
- [ ] **Step 6:** Take 390px screenshots of `/`, `/studio`, Studio fullscreen and `/me` into `docs/superpowers/reports/shots/`. List their paths in the report so Claude can review them.
- [ ] **Step 7:** Commit: `git add -A web docs/superpowers/reports && git commit -m "fix(phone): 10px text floor and 44px fullscreen buttons"`
- [ ] **Step 8:** Write the report section.

### Task 11: Finish the Drive-player feature

**Files:** Modify `web/src/features/music-studio/FullscreenStudio.tsx` (video bar and flag, about lines 357–420 and 1270–1300; the Drive toggle around 866–885). Test: `FullscreenStudio.test.tsx`.

- [ ] **Step 1: Write the failing tests:**
  - `'video bar is not a slider; the start flag is the only slider with aria values'`. Exactly one `getAllByRole('slider', { name: /video start/i })`; it has `aria-valuemin="0"` and an `aria-valuenow` equal to `videoStart`; there's no slider named `Video timeline`.
  - `'arrow keys nudge the start flag by 0.5s'`. Focus the flag, press `ArrowRight`, expect `onSetVideoStart(videoStart + 0.5)`; press `ArrowLeft`, expect `-0.5`, clamped at 0.
  - `'pointercancel ends a drag'`. pointerdown on the flag, `pointercancel`, then pointermove: `onSetVideoStart` is not called after the cancel.
  - `'drive player mode shows the no-sync note'`. With `useDrivePreview` and a `driveFileId`, the text `Drive player doesn't follow the music. Switch to Direct Sync to practise in time.` is visible, and the toggle reads `🎬 DRIVE PLAYER (NO SYNC)`.
- [ ] **Step 2:** Run `npm test -w web -- FullscreenStudio`. Expected: the 4 new tests FAIL.
- [ ] **Step 3:** Implement.
  - Remove `role="slider"`, `aria-label="Video timeline"` and `tabIndex` from the outer bar.
  - On the flag: add `aria-valuemin={0}`, `aria-valuemax={safeVideoDuration}`, `aria-valuenow={videoStart}`, `aria-valuetext={\`Video start ${formatTimeWithTenths(videoStart)}\`}`, `onKeyDown` for the arrow keys (`handleNudgeVideoStart(±0.5)`), and `style={{ touchAction: 'none', ... }}`.
  - Rewrite `handleVideoStartFlagPointerDown` to call `e.currentTarget.setPointerCapture(e.pointerId)` and attach `pointermove` / `pointerup` / `pointercancel` to that element, not `window`. Up and cancel remove all three listeners.
  - Add the note `<p>` under the iframe while in Drive mode, and change the toggle text.
- [ ] **Step 4:** Run `npm test -w web`. Expected: all pass.
- [ ] **Step 5:** Commit: `git commit -am "fix(studio): touch-safe accessible start flag and honest Drive player label"`
- [ ] **Step 6:** Write the report section.

### Task 12: Update the out-of-date e2e tests

**Files:** `web/e2e/admin-today.spec.ts`, `admin-classes.spec.ts:101`, `login.spec.ts:175`, `studio.spec.ts`, `studio-sync.spec.ts:120-122`, `visual-neon.spec.ts`.

- [ ] **Step 1:** `admin-today.spec.ts`: replace both tests with one, `'/admin/today redirects to the calendar'`. Go to `/admin/today` as admin, then `expect(page).toHaveURL(/\/admin\/calendar$/)`.
- [ ] **Step 2:** `admin-classes.spec.ts:101`: `page.getByRole('combobox')` becomes `page.getByLabel('Current event')`.
- [ ] **Step 3:** `login.spec.ts:175`: use `getByRole('heading', { name: 'Calendar & Classes' })`.
- [ ] **Step 4:** In `studio.spec.ts` and `studio-sync.spec.ts`, every `mockApi(page, {...})` also gets handlers `'videos.list'`, `'music.list'` and `'sections.list'`, returning that file's `BOOTSTRAP_DATA.videos/.music/.sections`.
- [ ] **Step 5:** Add the `@internet` tag to the two tests that need real YouTube or SoundCloud (describe titles contain "needs internet"), by appending ` @internet` to their test titles.
- [ ] **Step 6:** Run `cd web && npx playwright test e2e/visual-neon.spec.ts`. Open the diff images in `web/test-results/*neon*`.
  - If the differences are only the intended changes from Tasks 8–11 (text size, button size, wrapping), run `npx playwright test e2e/visual-neon.spec.ts --update-snapshots`.
  - Otherwise fix the regression.
  - Either way, say which in the report.
- [ ] **Step 7:** Run `cd web && npx playwright test --grep-invert @internet`. Expected: `0 failed`. Paste the summary line into the report.
- [ ] **Step 8:** Commit: `git commit -am "test(e2e): update out-of-date specs and tag internet-only tests"`
- [ ] **Step 9:** Write the report section.

### Task 13: Final gate

- [ ] **Step 1:** From the repo root, run `npm test` and paste every `Tests ... passed` line.
- [ ] **Step 2:** Run `npm run build`. Expected: exit 0.
- [ ] **Step 3:** Run `cd web && npx playwright test --grep-invert @internet`. Expected: `0 failed`.
- [ ] **Step 4:** Run `git status --short`. Expected: clean.
- [ ] **Step 5:** 🧑 **OWNER ACTION.** Ask the owner to run `npm run dev -w web -- --host`, open `http://<PC IP>:5173` on their phone, and do this 5-minute check:
  1. dancer login with full name
  2. calendar
  3. open a class day
  4. Studio
  5. fullscreen practice
  6. drag the video start flag with a finger
  7. Me
  8. log out

  Record the owner's result in the report.
- [ ] **Step 6:** Write the final report section, ending with `READY FOR CLAUDE REVIEW`.

---

## Report template (append one per task)

```markdown
## Task N — <name>
- Commit: <hash> (`git log --oneline -1`)
- Files changed: <list>
- Commands run and results:
  - `<command>` → <copy the pass/fail summary line>
- Differences from the plan, and why: <"none" or details>
- Anything unsure or not done: <"none" or details>
```
