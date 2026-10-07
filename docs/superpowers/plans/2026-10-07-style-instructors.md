# One Dance Style, Many Instructors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instructors list the styles they teach, each event lists instructors per style, and every class takes one of those instructors. Duplicate style names are refused.

**Architecture:**
- Two new sheet columns (`Instructors.styleIds`, `Events.styleInstructorsJson`), decoded into `Instructor.styleIds` and `EventItem.styleInstructors`.
- A one-time, write-only fill-in runs on the first admin request.
- Server routes enforce the rules.
- The event wizard, Instructors page, Dance Styles page and Calendar class editor use the new data.
- Dancer pages are untouched.

**Tech Stack:** Google Apps Script API in TypeScript (esbuild, clasp), Vitest with fake ports (`api/test/fakes/makeCtx.ts`), React 19 + TanStack Query web app, Playwright e2e with a mocked API (`web/e2e/fixtures/mockApi.ts`).

**Spec:** `docs/superpowers/specs/2026-10-07-style-instructors-design.md`

## Global Constraints

- The live site is in use. Never delete rows or columns. `DanceStyles.defaultInstructorId` stays in the sheet and in the `DanceStyle` type.
- Each class keeps exactly one `instructorId`.
- Style uniqueness: name and every alias, `trim().toLowerCase()` with inner whitespace collapsed to one space, must not equal any other active style's name or alias.
- Fill-in gate: Script Property `STYLE_INSTRUCTORS_V1 = 'done'`; CacheService key `mig:si1`, 6 hours (21600 s). It runs only for admin tokens and only writes.
- Error copy (exact):
  - `A style named "<name>" already exists.`
  - `Choose at least one dance style this instructor teaches.`
  - `<Instructor> doesn't teach <Style>.`
  - `Choose at least one instructor for <Style>.`
  - `<Instructor> isn't an instructor for <Style> in this event.`
- UI copy (exact):
  - `DANCE STYLES TAUGHT`
  - `Still teaching <Style> in <EVENT NAME>.`
  - `Instructors: <a>, <b>`
  - `No instructors yet`
  - `No instructor teaches <Style> yet — add it on the Instructors page.`
  - `Choose an instructor for <Style>.`
  - `<name> (not in this event's list)`
- Deployment order: API first (clasp push → version → `clasp update-deployment AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA -V <n>`, record it in `docs/SETUP-VALUES.md`), then web (push `main`, confirm the "Workers Builds" check run; re-trigger with an empty commit if missing).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Deactivated instructors.** An inactive instructor who still has a style must never appear as a choice in the wizard, the Calendar editor or the Dance Styles card list. *Tests:* Task 7 (`instructorsForStyle` skips inactive) and Task 9.
2. **Saving an old event whose classes have an instructor outside the event list.** Possible after the fill-in or after an instructor drops a style. `sessions.batchUpsert` re-sends the unchanged `instructorId`, and the save must succeed. *Test:* Task 5.
3. **Style names that differ only in case or spacing** ("Hip Hop" vs "hip  hop ") count as duplicates. Renaming a style to its own name, or keeping its own aliases, must still save. *Test:* Task 3.
4. **A broken `styleInstructorsJson` cell** (empty, `{}`, or not JSON) reads as `{}` and never crashes a list, the bootstrap or the wizard. *Test:* Task 1.
5. **Editing an event before the fill-in has run, or one whose list is empty.** The wizard seeds each style's instructors from that event's classes, so the admin isn't blocked by an empty list they never chose. *Test:* Task 7.

---

## File Structure

| File | Responsibility |
|---|---|
| `shared/src/types.ts` (modify) | `Instructor.styleIds`, `EventItem.styleInstructors` |
| `api/src/db/schema.ts`, `api/src/db/db.ts` (modify) | New columns and codecs |
| `api/src/features/styleInstructors.ts` (create) | Fill-in (`ensureStyleInstructors`), the rule helpers shared by routes |
| `api/src/router.ts` (modify) | Call the fill-in for admin tokens |
| `api/src/features/masterData.ts` (modify) | Style uniqueness; instructor `styleIds`; delete cleanup |
| `api/src/features/events.ts` (modify) | `styleInstructors` on create/update; class instructors on create |
| `api/src/features/sessions.ts` (modify) | Class instructor rule and default |
| `web/src/features/events/eventDraft.ts` (modify) | Draft fields and pure helpers for instructors |
| `web/src/features/events/steps/{StylesStep,ScheduleStep,ReviewStep}.tsx` (modify) | Wizard UI and payloads |
| `web/src/features/events/EventWizard.tsx` (modify) | Load instructors and pass them to steps |
| `web/src/features/masterdata/{InstructorsPage,StylesPage}.tsx` (modify) | Styles taught; instructors per style |
| `web/src/features/classes/{SessionEditor,ClassesPage}.tsx` (modify) | Drop-down limited to the event's list |

---

### Task 1: Types, columns and codecs

**Files:**
- Modify: `shared/src/types.ts:54` (`Instructor`), `shared/src/types.ts:91` (`EventItem`)
- Modify: `api/src/db/schema.ts:5` (Events), `api/src/db/schema.ts:8` (Instructors)
- Modify: `api/src/db/db.ts` events codec (~line 135) and instructors codec (~line 211)
- Test: `api/test/db/styleInstructorsCodec.test.ts`

**Interfaces:**
- Produces:
  - `Instructor.styleIds: string[]`
  - `EventItem.styleInstructors: Record<string, string[]>`
  - Sheet columns `Instructors.styleIds` (comma-joined, like `Events.styleIds`) and `Events.styleInstructorsJson` (JSON text).

- [ ] **Step 1: Write the failing tests**

```ts
it('round-trips instructor styleIds', () => {
  const i = ctx.db.instructors.insert({ name: 'Kelvin', contact: '', styleIds: ['sty_a', 'sty_b'] } as any, 'a', ctx.now());
  expect(ctx.db.instructors.get(i.id)!.styleIds).toEqual(['sty_a', 'sty_b']);
});
it('round-trips event styleInstructors', () => {
  const e = seedEvent(ctx, { styleIds: ['sty_a'], styleInstructors: { sty_a: ['ins_1', 'ins_2'] } } as any);
  expect(ctx.db.events.get(e.id)!.styleInstructors).toEqual({ sty_a: ['ins_1', 'ins_2'] });
});
it.each(['', '{}', 'not json', '[1,2]'])('reads styleInstructorsJson %j as {}', raw => {
  const e = seedEvent(ctx, { styleIds: ['sty_a'] });
  // Write the raw cell through the fake system spreadsheet: find the Events sheet
  // (ctx.drive.openSpreadsheet('test_system_ss').sheet('Events'), the id makeCtx uses by default),
  // locate the row by id and the column by header, then FakeSheet.setValues(row, col, [[raw]]).
  ctx.db.reload();
  expect(ctx.db.events.get(e.id)!.styleInstructors).toEqual({});
});
it('old instructor rows without the column read styleIds as []', ...);
```

- [ ] **Step 2: Run** `cd api && npx vitest run test/db/styleInstructorsCodec.test.ts`. Expected: FAIL (`styleIds` / `styleInstructors` undefined).
- [ ] **Step 3: Implement.**
  - Add the columns to `SCHEMA` before `...COMMON_COLUMNS`.
  - Instructors codec: `toCells` joins `styleIds`; `fromCells` uses `parseList(c.styleIds)`.
  - Events codec: `toCells` writes `styleInstructorsJson: JSON.stringify(r.styleInstructors || {})` and does not write `styleInstructors`.
  - Events `fromCells` decodes with `parseStyleInstructors(raw: string): Record<string, string[]>`, a local helper that returns `{}` unless the value is a plain object whose values are string arrays.
- [ ] **Step 4: Run** the same command, then `npx vitest run`. Expected: PASS, and no other test changes result.
- [ ] **Step 5: Commit** `feat(data): instructor styles and event style instructors columns`.

---

### Task 2: One-time fill-in

**Files:**
- Create: `api/src/features/styleInstructors.ts`
- Modify: `api/src/router.ts` (after `auth = { claims };`, before the handler runs)
- Test: `api/test/features/styleInstructors.test.ts`

**Interfaces:**
- Consumes: Task 1 fields.
- Produces: `ensureStyleInstructors(ctx: Ctx): boolean`. It returns `true` when it wrote anything, and runs inside `withScriptLock(ctx.lock, …)`.

- [ ] **Step 1: Write the failing tests.** Seed:
  - styles A (default instructor K) and B (default C);
  - instructors K, C and L;
  - event E with styles [A, B] and classes A#1 (instructor L), A#2 (instructor ''), B#1 (instructor '');
  - event F with style [A] and no classes.

```ts
it('fills instructor styles from style defaults and their classes', () => {
  ensureStyleInstructors(ctx);
  expect(styleIdsOf('K')).toEqual(['A']); expect(styleIdsOf('C')).toEqual(['B']); expect(styleIdsOf('L')).toEqual(['A']);
});
it('fills event lists from classes, else the style default', () => {
  ensureStyleInstructors(ctx);
  expect(ctx.db.events.get(E)!.styleInstructors).toEqual({ A: ['L', 'K'], B: ['C'] }); // A#2 got K in step 3, so order is class order after fill
  expect(ctx.db.events.get(F)!.styleInstructors).toEqual({ A: ['K'] });
});
it('gives empty classes the style default instructor', () => { /* A#2 → K, B#1 → C */ });
it('never overwrites existing values', () => { /* pre-set K.styleIds=['B'] and E.styleInstructors={A:['K']}; both unchanged after */ });
it('second run writes nothing and DATA_VERSION bumps once', () => { /* call twice; spy on table.update count 0 on 2nd; DATA_VERSION +1 total */ });
it('dancer requests do not trigger it; admin requests do', () => { /* handleRequest dancer.bootstrap → property unset; admin events.list → 'done' */ });
```

Order rule for the event list: run step 3 (fill empty classes) **before** step 2, so the list is the distinct instructors of the event's classes in `date, seq` order.

- [ ] **Step 2: Run** `npx vitest run test/features/styleInstructors.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `ensureStyleInstructors`.**
  1. Return `false` fast when `ctx.cache.get('mig:si1')` is set, or when `ctx.props.get('STYLE_INSTRUCTORS_V1') === 'done'` (in that case also put the cache key).
  2. Fill empty class instructors from the style default.
  3. Fill instructor `styleIds` only where they're empty.
  4. Fill event lists only where they're empty.
  5. Set the property, put `mig:si1` for 21600 s, and bump `DATA_VERSION` by 1 if anything was written.

  In `router.ts`, call it when `claims.role === 'admin'`.
- [ ] **Step 4: Run** the file, then `npx vitest run`. Expected: PASS everywhere. Existing admin tests now run the fill-in harmlessly.
- [ ] **Step 5: Commit** `feat(api): one-time fill-in of instructor styles and event style instructors`.

---

### Task 3: Style uniqueness, instructor styles, instructor delete cleanup

**Files:**
- Modify: `api/src/features/masterData.ts` (styles `processPayload` ~line 148, instructors `processPayload` ~line 381, and a cleanup in the instructors `delete` route)
- Modify: `api/src/features/styleInstructors.ts` (add helpers)
- Test: `api/test/features/masterData.test.ts`

**Interfaces:**
- Produces, in `styleInstructors.ts`:
  - `styleKey(s: string): string` (trim, lower-case, collapse whitespace)
  - `assertUniqueStyle(ctx: Ctx, name: string, aliases: string[], selfId?: string): void`
  - `assertInstructorStyles(ctx: Ctx, styleIds: unknown): string[]`, which returns the cleaned ids
  - `removeInstructorFromEvents(ctx: Ctx, instructorId: string, actor: string): void`

- [ ] **Step 1: Write the failing tests**

```ts
it('refuses a second style with the same name ignoring case and spaces', () => {
  expect(createStyle({ name: 'hip  hop ' })).toFailWith('VALIDATION', 'A style named "hip  hop" already exists.');
});
it('refuses a name that matches another style alias', ...);
it('refuses an alias that matches another style name', ...);
it('allows saving a style with its own name and aliases', ...);
it('requires at least one style for an instructor', () => {
  expect(createInstructor({ name: 'X', styleIds: [] })).toFailWith('VALIDATION', 'Choose at least one dance style this instructor teaches.');
});
it('rejects unknown or inactive style ids for an instructor', ...);
it('instructors.delete removes the instructor from every event list but keeps classes', ...);
```

The quoted name in the duplicate message is the submitted name trimmed (`"hip  hop"`).

- [ ] **Step 2: Run** `npx vitest run test/features/masterData.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.**
  - Styles `processPayload` calls `assertUniqueStyle` with the incoming name and aliases. On update, fields that aren't sent fall back to `existing`.
  - Instructors `processPayload` sets `payload.styleIds = assertInstructorStyles(ctx, payload.styleIds)`. On update, only do this when `styleIds` is sent.
  - The instructors `delete` route (generic `crudRoutes`) calls `removeInstructorFromEvents` after the deactivate. Do this by wrapping the generated `instructors.delete` handler in `getMasterDataRoutes`, not by changing `crudRoutes`.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS. Update any existing master-data test that creates an instructor without `styleIds`: give it a style.
- [ ] **Step 5: Commit** `feat(api): unique dance styles and the styles each instructor teaches`.

---

### Task 4: Event style instructors on create and update

**Files:**
- Modify: `api/src/features/events.ts` (`SessionInput` line 68 gains `instructorId?: string`; `events.update` ~line 115; `events.create` ~line 294 and the class insert ~line 356)
- Modify: `api/src/features/styleInstructors.ts`
- Test: `api/test/features/events.test.ts`

**Interfaces:**
- Produces:
  - `cleanStyleInstructors(ctx: Ctx, styleIds: string[], raw: unknown): Record<string, string[]>`. It validates against `instructor.styleIds`, keeps only keys present in `styleIds`, de-duplicates while keeping order, and requires every style to have at least one instructor.
  - `firstInstructor(event: EventItem, styleId: string): string` returns the first id, or `''`.
  - `assertClassInstructor(ctx: Ctx, event: EventItem, styleId: string, instructorId: string, previous?: string): void`. It passes when `instructorId === ''`, when `instructorId === previous`, or when it's in `event.styleInstructors[styleId]`. Otherwise it throws `<Instructor> isn't an instructor for <Style> in this event.`
- Payload: `events.create` and `events.update` accept `styleInstructors: Record<styleId, instructorId[]>`.

- [ ] **Step 1: Write the failing tests**

```ts
it('create saves styleInstructors and gives classes their chosen instructor', ...); // sessions[0].instructorId = 'L' → class has L
it('create gives a class with no instructor the first in the list', ...);
it("create refuses an instructor who doesn't teach the style", () => /* "Lam doesn't teach Locking." */);
it('create refuses a style with no instructors', () => /* "Choose at least one instructor for Locking." */);
it('update replaces the lists and drops styles removed from the event', ...);
it('update without styleInstructors keeps the stored lists (old website)', ...);
it('create refuses a class instructor outside its style list', () => /* "Kelvin isn't an instructor for Latin in this event." */);
```

- [ ] **Step 2: Run** `npx vitest run test/features/events.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.**
  - `create`: always runs `cleanStyleInstructors`. The old website sends none, so fall back to filling each style from instructors who teach it only when `styleInstructors` is absent. That way the current website keeps creating events during deployment.
  - `update`: runs it only when `styleInstructors` is sent. Otherwise it keeps the existing value filtered to the new `styleIds`.
  - The class insert uses `s.instructorId || firstInstructor(event, s.styleId)`. Validate it with `assertClassInstructor`.
  - Remove the `style?.defaultInstructorId` fallback at line 356.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS. `npx tsc --noEmit -p .` no longer reports the `events.ts(356)` `instructorId` error.
- [ ] **Step 5: Commit** `feat(api): events choose instructors per dance style`.

---

### Task 5: Class instructor rule in the sessions routes

**Files:**
- Modify: `api/src/features/sessions.ts` (`sessions.create` ~line 119, `sessions.update` ~line 161, `sessions.batchUpsert` ~line 254)
- Test: `api/test/features/sessions.test.ts`

**Interfaces:**
- Consumes: `assertClassInstructor` and `firstInstructor` from Task 4.

- [ ] **Step 1: Write the failing tests**

```ts
it('create without an instructor uses the first instructor of the event list', ...);
it('update refuses a new instructor outside the list', ...);
it('update keeps an unchanged out-of-list instructor', ...);           // Review Focus 2
it('batchUpsert accepts the unchanged out-of-list instructor of an existing class', ...); // Review Focus 2
it('batchUpsert refuses a new class with an out-of-list instructor', ...);
```

- [ ] **Step 2: Run** `npx vitest run test/features/sessions.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.**
  - `create`: `finalInstructorId = instructorId || firstInstructor(event, styleId)`, then `assertClassInstructor`. This replaces the `defaultInstructorId` fallback at line 119.
  - `update` and `batchUpsert`: when `instructorId` is sent, call `assertClassInstructor(..., existing?.instructorId)`. New batch rows without an instructor get `firstInstructor`.
- [ ] **Step 4: Run** `npx vitest run`. Expected: all API tests PASS.
- [ ] **Step 5: Commit** `feat(api): each class's instructor comes from its event's list`.

---

### Task 6: Deploy the API

**Files:** `docs/SETUP-VALUES.md`

- [ ] **Step 1:** `cd api && npx vitest run`. Expected: all PASS.
- [ ] **Step 2:** `npm run push`, then `npx clasp create-version "style instructors"`. Expected: `Created version <n>`.
- [ ] **Step 3:** `npx clasp update-deployment AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA -V <n> -d "v<n> style instructors"`. Expected: `Redeployed … @<n>`.
- [ ] **Step 4:** Smoke test: a `setup.status` POST to the URL in `web/.env.local` returns `ok: true`, and the current live website still loads Calendar and Media for an admin (old website + new API).
- [ ] **Step 5:** Record version `<n>` in `docs/SETUP-VALUES.md`, commit `chore: record API deployment version <n>`, and push.

---

### Task 7: Wizard draft model

**Files:**
- Modify: `web/src/features/events/eventDraft.ts`
- Test: `web/src/features/events/eventDraft.test.ts`

**Interfaces:**
- Consumes: `Instructor.styleIds`, `EventItem.styleInstructors` (Task 1).
- Produces:
  - `EventDraft.styleInstructors: Record<string, string[]>`
  - `ScheduledClass.instructorId?: string`
  - `instructorsForStyle(instructors: Instructor[], styleId: string): Instructor[]`: active instructors teaching the style, sorted by name.
  - `setStyleInstructors(d: EventDraft, styleId: string, ids: string[]): EventDraft`: sets the list and moves classes whose instructor was removed onto `ids[0] ?? ''`.
  - `missingInstructorStyle(d: EventDraft): string | null`: the first ticked style id with an empty list.
  - `draftFromEvent` seeds `styleInstructors` from `e.styleInstructors`. For any style left empty, it uses the distinct `instructorId`s of that style's classes (Review Focus 5), and it copies each class's `instructorId`.
  - `pruneSchedule` drops `styleInstructors` keys for unticked styles.
  - `emptyDraft` has `styleInstructors: {}`.

- [ ] **Step 1: Write the failing tests**

```ts
it('instructorsForStyle lists only active instructors who teach the style', ...);   // Review Focus 1
it('setStyleInstructors moves classes of a removed instructor to the first remaining', ...);
it('missingInstructorStyle names the first ticked style with no instructor', ...);
it('draftFromEvent seeds empty style lists from the event classes', ...);          // Review Focus 5
it('pruneSchedule drops instructor lists of unticked styles', ...);
```

- [ ] **Step 2: Run** `cd web && npx vitest run src/features/events/eventDraft.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the functions above in `eventDraft.ts`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): wizard draft tracks instructors per style and per class`.

---

### Task 8: Wizard screens (STYLES, SCHEDULE, REVIEW)

**Files:**
- Modify: `web/src/features/events/EventWizard.tsx`
  - load `instructors.list` with query key `['instructors']`;
  - add `instructors: Instructor[]` to `StepProps`.
- Modify: `web/src/features/events/steps/StylesStep.tsx`, `steps/ScheduleStep.tsx`, `steps/ReviewStep.tsx`
- Test: `web/e2e/admin-event-wizard.spec.ts`

**Interfaces:**
- Consumes: Task 7 helpers and Task 4 payloads.

- [ ] **Step 1: Write the failing e2e tests** (mock `instructors.list` with Kelvin [Locking, Popping], Carmen [Locking], Lam [Latin] and an inactive Zed [Locking])

```ts
test('ticking a style shows only its active instructors; single instructor is auto-ticked', ...); // Latin → Lam ticked; Locking → Kelvin, Carmen, no Zed
test('NEXT is blocked until every ticked style has an instructor', ...);  // shows "Choose an instructor for Locking."
test('a style nobody teaches says so and links to Instructors', ...);     // "No instructor teaches Hip Hop yet — add it on the Instructors page."
test('SCHEDULE has a per-class instructor drop-down only when a style has several', ...);
test('CREATE sends styleInstructors and each class instructorId', ...);  // payload.styleInstructors = { locking: ['kelvin','carmen'] }, sessions[1].instructorId = 'carmen'
test('editing an event opens with its saved instructors ticked', ...);
```

- [ ] **Step 2: Run** `npx playwright test e2e/admin-event-wizard.spec.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.**
  - **StylesStep:** under each ticked style, a tick box per `instructorsForStyle` result. Auto-tick when exactly one. NEXT is `disabled={draft.styleIds.length === 0 || missingInstructorStyle(draft) !== null}`, with the blocking style named. The "no instructor" message links to `/admin/instructors` (`target="_blank"`), next to a `↻ RELOAD INSTRUCTORS` button that invalidates `['instructors']`.
  - **ScheduleStep:** each class row gets a `<select aria-label="Instructor for class <seq>">` when the list has more than one instructor; otherwise it shows the name as plain text.
  - **ReviewStep:** shows the names; adds `styleInstructors: draft.styleInstructors` to `events.create`/`events.update`, and `instructorId` to each class in both the `sessions` and `sessions.batchUpsert` payloads.
- [ ] **Step 4: Run** the spec file on both projects. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): event wizard picks instructors per style and per class`.

---

### Task 9: Instructors page and Dance Styles page

**Files:**
- Modify: `web/src/features/masterdata/InstructorsPage.tsx`, `web/src/features/masterdata/StylesPage.tsx`
- Test: `web/e2e/admin-masterdata.spec.ts`

- [ ] **Step 1: Write the failing e2e tests**

```ts
test('instructor form requires a style and saves styleIds', ...);          // SAVE disabled with none; payload.styleIds = ['locking','popping']
test('instructor cards show their style chips', ...);
test('unticking a style still used by an event shows the note', ...);      // "Still teaching Locking in OCT MONTHLY CLASS."
test('style form has no default instructor field', ...);
test('style cards list active instructors or "No instructors yet"', ...);  // "Instructors: Carmen, Kelvin"; inactive Zed not listed
test('saving a duplicate style name shows the server message', ...);       // mock styles.create → VALIDATION 'A style named "Locking" already exists.'
```

- [ ] **Step 2: Run** `npx playwright test e2e/admin-masterdata.spec.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.**
  - **InstructorsPage:** a `DANCE STYLES TAUGHT` tick-button group using the `['styles']` query. Save is disabled until at least one is ticked, and `styleIds` goes into the save payload. The "Still teaching…" note uses `events.list` (`['events']`): active events whose `styleInstructors[unticked]` contains this instructor.
  - **StylesPage:** remove the default-instructor state, field and payload key (the server keeps the stored value). Cards list `instructors.filter(i => i.active && i.styleIds.includes(style.id))`.
- [ ] **Step 4: Run** the spec file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): instructors choose their dance styles; styles list their instructors`.

---

### Task 10: Calendar class editor

**Files:**
- Modify: `web/src/features/classes/SessionEditor.tsx`:
  - new prop `allowedInstructorIds: string[]`;
  - drop-down options = allowed instructors plus the current one if it's outside the list, labelled `<name> (not in this event's list)`;
  - remove the `defaultInstructorId` hint (~line 263) and the default at line 53.
- Modify: `web/src/features/classes/ClassesPage.tsx`: pass `events.find(e => e.id === editingSession.eventId)?.styleInstructors[editingSession.styleId] ?? []`.
- Test: `web/e2e/admin-classes.spec.ts`, `web/src/features/classes/ClassesPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
test('class editor lists only the event instructors for the style', ...);
test("a current instructor outside the list is shown as \"(not in this event's list)\"", ...);
```

- [ ] **Step 2: Run** `npx playwright test e2e/admin-classes.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as described under Files.
- [ ] **Step 4: Run** `npx vitest run && npx playwright test e2e/admin-classes.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): class editor offers only the event's instructors for the style`.

---

### Task 11: Full verification and website deploy

- [ ] **Step 1:** `cd api && npx vitest run`, then `cd ../web && npx vitest run && npx playwright test && npm run build`. Expected: all pass; the build prints `✓ built`.
- [ ] **Step 2:** `git checkout -- docs/superpowers/reports/shots/`. The visual tests rewrite these screenshots; don't commit them.
- [ ] **Step 3:** `git push origin main`, then `gh api repos/chandahui2004-hub/umdsc-dance-class/commits/<sha>/check-runs`. Expected: `Workers Builds: umdsc-dance-class: completed success`. If there's no check run after about 3 minutes, push an empty commit.
- [ ] **Step 4:** Confirm the live bundle at `https://umdsc-dance-class.umdancesportc.workers.dev/` contains `DANCE STYLES TAUGHT`.
