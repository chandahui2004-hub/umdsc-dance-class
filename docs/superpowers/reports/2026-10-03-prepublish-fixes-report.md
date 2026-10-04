# Pre-publish Fixes Report

## Task 0 — Finish the current Drive-player work and commit
- Commit: 0803d84 (`0803d84 feat(studio): Drive player fallback for unplayable videos and draggable video start flag`)
- Files changed:
  - `web/index.html`
  - `web/src/components/ui/PixelPortraitFrame.tsx`
  - `web/src/components/ui/neon.test.tsx`
  - `web/src/features/masterdata/InstructorsPage.tsx`
  - `web/src/features/media/MediaPage.tsx`
  - `web/src/features/music-studio/FullscreenStudio.test.tsx`
  - `web/src/features/music-studio/FullscreenStudio.tsx`
  - `web/src/features/music-studio/Studio.tsx`
  - `web/src/features/music-studio/sync/VideoPanel.test.tsx`
  - `web/src/features/music-studio/sync/VideoPanel.tsx`
  - `web/vite.config.ts`
  - `docs/superpowers/plans/2026-10-03-prepublish-fixes.md`
  - `docs/superpowers/specs/2026-10-03-prepublish-fixes-design.md`
  - `docs/superpowers/reports/2026-10-03-antigravity-current-task-report.md`
- Commands run and results:
  - `cd web && npx tsc -b` →
    ```
    src/features/auth/TitleScreen.tsx(103,22): error TS2322: Type '56' is not assignable to type '96 | 32 | 64 | undefined'.
    src/lib/instructorPhotos.test.ts(5,3): error TS6133: 'DEFAULT_INSTRUCTOR_PHOTOS' is declared but its value is never read.
    ```
  - `npm test -w web` → `Test Files  42 passed (42)`, `Tests  223 passed (223)`
- Differences from the plan, and why: In `MediaPage.tsx`, `streamUrl` was retained in the import list because it is used for audio preview on line 634; only the unused `const stream` on line 427 was removed.
- Anything unsure or not done: none.

## Task 1 — Build passes
- Commit: f54d23d (`f54d23d fix(build): valid Boombox size and unused import`)
- Files changed:
  - `web/src/features/auth/TitleScreen.tsx`
  - `web/src/lib/instructorPhotos.test.ts`
- Commands run and results:
  - `npm run build` →
    ```
    ✓ 512 modules transformed.
    ✓ built in 5.14s
    ```
- Differences from the plan, and why: none
- Anything unsure or not done: none

## Task 2 — fullNameMatches
- Commit: 6061fa6 (`6061fa6 feat(api): fullNameMatches — every registered name word required`)
- Files changed:
  - `api/src/logic/normalize.ts`
  - `api/test/logic/normalize.test.ts`
- Commands run and results:
  - `npm test -w api -- normalize` →
    ```
    ✓ test/logic/normalize.test.ts (24 tests) 12ms
    Test Files  1 passed (1)
    Tests  24 passed (24)
    ```
  - `npm test -w api` →
    ```
    Test Files  42 passed (42)
    Tests  303 passed (303)
    ```
- Differences from the plan, and why: none
- Anything unsure or not done: none

## Task 3 — Login uses full name, one shared error, no lockout
- Commit: 29c214e (`29c214e feat(auth): full-name dancer login, one shared error, remove lockout`)
- Files changed:
  - `api/src/features/auth.ts`
  - `api/src/security/throttle.ts` (deleted)
  - `api/test/features/auth.test.ts`
  - `api/test/security/security.test.ts`
  - `shared/src/types.ts`
  - `web/src/lib/api.ts`
  - `web/src/features/auth/TitleScreen.tsx`
  - `web/e2e/login.spec.ts`
- Commands run and results:
  - `npm test -w api -- auth` →
    ```
    ✓ test/features/auth.test.ts (10 tests) 387ms
    Test Files  1 passed (1)
    Tests  10 passed (10)
    ```
  - `npm test` (root, api + web) →
    ```
    API: Test Files  42 passed (42), Tests  304 passed (304)
    Web: Test Files  42 passed (42), Tests  223 passed (223)
    ```
  - `cd web && npx playwright test e2e/login.spec.ts --project=mobile` →
    ```
    ok 1 [mobile] › dancer logs in and lands on / with calendar visible (4.9s)
    ok 2 [mobile] › wrong name shows shared NOT_REGISTERED error message (3.3s)
    ok 3 [mobile] › unknown matric shows shared NOT_REGISTERED error message (753ms)
    ok 5 [mobile] › second visit opens instantly from cached bootstrap before network responds (1.3s)
    (Test 4 has known heading strict mode failure to be addressed in Task 12)
    ```
- Differences from the plan, and why: In `api/test/features/auth.test.ts`, updated `dancerLogin claims.perms` test payload to use the dancer's full name ("Ahmad Fiqri Mohd Zamri") as required by the new full-name login rule.
- Anything unsure or not done: none

## Task 4: sections.list works without a song ID

- Status: complete
- Commit: `1c44271` `feat(api): sections.list returns all visible sections when musicId is omitted`
- Tests run & exact output:
  - `npm test -w api -- music` (RED):
    ```
    Test Files  1 failed | 2 passed (3)
         Tests  2 failed | 45 passed (47)
    FAIL test/features/music.test.ts > Feature: Music & Sections (features/music) > sections.list without musicId returns all active sections for admin
    FAIL test/features/music.test.ts > Feature: Music & Sections (features/music) > sections.list without musicId gives a dancer only sections of music in their events
    ```
  - `npm test -w api` (GREEN):
    ```
    Test Files  42 passed (42)
         Tests  305 passed (305)
      Duration  5.60s
    ```
  - `npm run build`:
    ```
    Build complete: dist/Code.js and dist/appsscript.json
    ✓ built in 5.02s
    ```
- Differences from the plan, and why: Removed unused `ApiError` import in `web/src/features/auth/TitleScreen.tsx` to ensure root workspace build passes with zero warnings/errors.
- Anything unsure or not done: none

## Task 5: Studio ignores answers that aren't lists

- Status: complete
- Commit: `3f00b02` `fix(studio): ignore non-list live query answers`
- Tests run & exact output:
  - `npx vitest run src/features/music-studio/Studio.guard.test.tsx` (RED):
    ```
    FAIL src/features/music-studio/Studio.guard.test.tsx > Studio guard against non-array live queries > Studio falls back to bootstrap lists when live queries return non-arrays
    TypeError: musicList.find is not a function
    Test Files  1 failed (1)
         Tests  1 failed (1)
    ```
  - `npm test -w web` (GREEN):
    ```
    Test Files  43 passed (43)
         Tests  224 passed (224)
      Duration  32.40s
    ```
## Task 5b — fixes from Claude review

- Commit: `fb425cc` (`fb425cc fix: unused import and order-independent sections test`)
- Files changed:
  - `web/src/features/music-studio/Studio.guard.test.tsx`
  - `api/test/features/music.test.ts`
- Commands run and results:
  - `npx vitest run test/features/music.test.ts` (run 1 from api/):
    ```
     ✓ test/features/music.test.ts (8 tests) 50ms
     Test Files  1 passed (1)
          Tests  8 passed (8)
       Duration  1.82s
    ```
  - `npx vitest run test/features/music.test.ts` (run 2 from api/):
    ```
     ✓ test/features/music.test.ts (8 tests) 68ms
     Test Files  1 passed (1)
          Tests  8 passed (8)
       Duration  1.92s
    ```
  - `npx vitest run test/features/music.test.ts` (run 3 from api/):
    ```
     ✓ test/features/music.test.ts (8 tests) 67ms
     Test Files  1 passed (1)
          Tests  8 passed (8)
       Duration  1.85s
    ```
  - `npm run build`:
    ```
    ✓ built in 5.59s
    ```
- Differences from the plan, and why: none
- Anything unsure or not done: none

## Task 6 — Deploy the API changes (Tasks 3–4)

- Commit: `3dc4bdd` (`3dc4bdd chore: record API deployment version`)
- Files changed:
  - `docs/SETUP-VALUES.md`
- Commands run and results:
  - `npm run push` (in `api/`) → `Pushed 2 files (dist/appsscript.json, dist/Code.js)`
  - `npx clasp update-deployment AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA` (in `api/`) → `Redeployed AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA @22`
  - Health check endpoint → `{"ok":true,"data":{"version":"0.1.0"}}`
  - `npm run build`:
    ```
    ✓ built in 5.47s
    ```
- Differences from the plan, and why: none
- Anything unsure or not done: none (owner tested on real phone: single word shows NOT_REGISTERED error, full name logs in)

## Task 7 — Permanent phone-layout test (written first; it fails until Tasks 8–9)

- Commit: `f73d8f4` (`f73d8f4 test(e2e): permanent phone-layout check (red until layout fixes)`)
- Files changed:
  - `web/e2e/phone-layout.spec.ts`
  - `web/src/app/PhoneShell.tsx`
- Commands run and results:
  - `npx playwright test e2e/phone-layout.spec.ts --project=mobile` (RED - expected):
    ```
      4 failed
        [mobile] › e2e/phone-layout.spec.ts:245:5 › phone-layout @ 360px › phone-layout check across all pages 
        [mobile] › e2e/phone-layout.spec.ts:314:5 › phone-layout @ 360px › nav toggle hidden in overlays 
        [mobile] › e2e/phone-layout.spec.ts:245:5 › phone-layout @ 390px › phone-layout check across all pages 
        [mobile] › e2e/phone-layout.spec.ts:314:5 › phone-layout @ 390px › nav toggle hidden in overlays 

      Failures captured:
      [/] select "OCT MONTHLY CLASS" L=72 R=392 (past 0..360)
      [/] select "OCT MONTHLY CLASS" L=72 R=392 (clipped by main)
      [/ (day sheet)] select "OCT MONTHLY CLASS" L=72 R=392 (past 0..360)
      [/ (day sheet)] select "OCT MONTHLY CLASS" L=72 R=392 (clipped by main)
      [/studio?music=m-1] select "Select class video" L=116 R=391 (clipped by main)
      [/studio (fullscreen)] select "Select class video" L=116 R=391 (clipped by main)
      Nav toggle: expect(locator).toBeHidden() failed: locator resolved to visible
    ```
  - `npm run build`:
    ```
    ✓ built in 5.06s
    ```
- Differences from the plan, and why: none
- Anything unsure or not done: none (test fails as expected until Tasks 8-9)

## Task 8 — Nav toggle never covers content

- Commit: `d379ad7` (`d379ad7 fix(phone): hide nav toggle during overlays and pad content clear of it`)
- Files changed:
  - `web/src/app/useOverlayOpen.ts`
  - `web/src/app/useOverlayOpen.test.tsx`
  - `web/src/app/PhoneShell.tsx`
  - `web/src/theme/pixel.css`
  - `web/src/features/calendar/DaySheet.tsx`
  - `web/src/features/music-studio/FullscreenStudio.tsx`
- Commands run and results:
  - `npm test -w web -- useOverlayOpen` (RED then GREEN):
    ```
    ✓ src/app/useOverlayOpen.test.tsx (3 tests) 32ms
    Test Files  1 passed (1)
         Tests  3 passed (3)
    ```
  - `npm test -w web`:
    ```
    Test Files  44 passed (44)
         Tests  227 passed (227)
    ```
  - `npx playwright test e2e/phone-layout.spec.ts -g "nav toggle"`:
    ```
    4 passed (19.6s)
    ```
  - `npm run build`:
    ```
    ✓ built in 5.17s
    ```
- Differences from the plan, and why: none (rule placed in `web/src/theme/pixel.css` per NOTE 1 plan correction)
- Anything unsure or not done: none

## Task 9 — Studio and Home fit at 360–390px

- Commit: `3d9246c` (`3d9246c fix(phone): no cut-off controls in Studio and Home at 360-390px`)
- Files changed:
  - `web/src/features/music-studio/dancecue/components/AudioPlayer.tsx`
  - `web/src/features/music-studio/sources/SourcePicker.tsx`
  - `web/src/features/music-studio/sync/VideoPanel.tsx`
  - `web/src/features/calendar/DancerHome.tsx`
- Commands run and results:
  - `npx playwright test e2e/phone-layout.spec.ts`:
    ```
    8 passed (1.0m)
    ```
  - `npm run build`:
    ```
    ✓ built in 4.58s
    ```
- Differences from the plan, and why: none
- Anything unsure or not done: none

## Task 10 — Readable text and big fullscreen buttons

- Commit: `fcf6f48` (`fcf6f48 fix(phone): 10px text floor and 44px fullscreen buttons`)
- Files changed:
  - `web/scripts/text-floor.mjs`
  - 28 `.tsx` files in `web/src` (108 occurrences of `text-[8px]` / `text-[9px]` replaced with `text-[10px]`)
  - `web/src/features/music-studio/FullscreenStudio.tsx`
  - `web/src/components/ui/TabBar.tsx`
  - `web/e2e/phone-layout.spec.ts`
  - `docs/superpowers/reports/shots/home-390px.png`
  - `docs/superpowers/reports/shots/studio-390px.png`
  - `docs/superpowers/reports/shots/studio-fullscreen-390px.png`
  - `docs/superpowers/reports/shots/me-390px.png`
- Commands run and results:
  - `node web/scripts/text-floor.mjs`: Total 108
  - `grep -rE "text-\[(8|9)px\]" web/src`: no output
  - `npm test -w web`:
    ```
    Test Files  44 passed (44)
         Tests  227 passed (227)
    ```
  - `npx playwright test e2e/phone-layout.spec.ts`:
    ```
    8 passed (56.9s)
    ```
  - `npm run build`:
    ```
    ✓ built in 4.99s
    ```
- Screenshots captured (390px):
  - `docs/superpowers/reports/shots/home-390px.png`
  - `docs/superpowers/reports/shots/studio-390px.png`
  - `docs/superpowers/reports/shots/studio-fullscreen-390px.png`
  - `docs/superpowers/reports/shots/me-390px.png`
- Differences from the plan, and why: Added `min-w-0` to `TabBar.tsx` tabs so that the 5-tab admin dock fits without horizontal clipping on 360–390px viewports.
- Anything unsure or not done: none

