# Event-Based Registration Implementation Plan

> **For agentic workers (Claude Code or Gemini in Antigravity):** REQUIRED SUB-SKILL: use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax: tick each one when done. **Read the spec before starting any task.**

**Goal:** Replace "month" with **event** (monthly class, trial class, workshop) as the key for registration, classes, attendance, media and dancer data. Add event setup and management, 10-minute cheap auto-sync, master-folder moves, 3-year retention and a one-time test-data reset.

**Architecture:**
- A new `Events` table in `UMDSC_System`. Every `month` column becomes `eventId`.
- Each event owns a Drive folder under the attendance master folder: a Members sheet plus one attendance sheet per style.
- Registration import becomes an incremental service (`importEventMembers`) used by event creation, Sync now and a throttled auto-sync that does no writes when nothing changed.
- The web adds an Events page, a 5-step event wizard split out of today's `ImportWizard.tsx`, and a global event picker that replaces every month switcher.

**Tech Stack:** unchanged.
- API: Apps Script V8 in TypeScript, esbuild, clasp 3, Vitest with the fakes in `api/test/fakes`.
- Web: React 19, TypeScript, Vite 6, Tailwind 4, TanStack Query 5, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-event-based-registration-design.md` (source of truth for this plan). The original `docs/superpowers/specs/2026-09-28-umdsc-dance-class-system-design.md` still applies wherever the new spec does not override it. When the plan and the spec disagree, the spec wins: stop and tell the owner.

---

## Global Constraints

- Repo root: `C:\Users\user\Downloads\UMDSC Design\UMDSC Dance Class System`. Workspaces: `shared`, `api`, `web`.
- Dates are `YYYY-MM-DD` strings. "Today" is computed in `Asia/Kuala_Lumpur`. Date/time/matric/phone columns are written as plain text (`@`).
- Every table row has `id, version, updatedBy, updatedAt, active`. Rows are only soft-deleted. **The one exception** is `admin.resetTestData` (spec §9).
- Every write handler runs inside the script lock. **The one exception** is `events.autoSync`, which is registered with `write: false` and takes the lock itself only when a change is found (spec §6.1).
- Event names are unique by `eventNameKey` (trim, lower-case, collapse inner whitespace).
- Auto-sync interval: **10 minutes** (`600_000` ms in the browser; CacheService key `sync:check:<eventId>`, TTL `600` s). Sync now limit: **60 s** per event (`sync:force:<eventId>`, TTL `60`).
- Retention: **3 years** after `MemberIndex.lastEventEnd`. Wiped names become `Removed dancer`; wiped member ids become `X-` + 10 random characters.
- Reset confirmation phrase: exactly `DELETE TEST DATA`. Backup name: `UMDSC_System backup YYYY-MM-DD`.
- Drive names:
  - event folder = the event name;
  - Members sheet = `<event name> Members` (tab `Members`);
  - attendance sheet = `<style name> Attendance` (tab `Attendance`);
  - video class folder = `<date> <style name> Class <seq>`.
- Settings keys stay `defaultAttendanceFolderId` (attendance master) and `defaultVideoFolderId` (video master).
- Club Gmail in fix-it messages comes from `ctx.clubEmail` (`umdancesportc@gmail.com`).
- UI follows the 8-bit rules of the original spec §13.1: colours and fonts only from `web/src/theme/tokens.css`, `border-radius: 0`, hard shadows, tap targets ≥ 44 px.
- `npx tsc --noEmit -p api` has pre-existing errors. **Do not add new ones.** `npm run build -w web` (which runs `tsc -b`) must pass.

## Review Focus

These five inputs are implied by the spec but no feature test naturally covers them. Each is pinned by a test in the task named.

1. **Event names that differ only in spaces or case**, e.g. `" Oct  Monthly Class "` vs `OCT MONTHLY CLASS`, must be rejected as duplicates. Test in **Task 2**.
2. **A registrant edits an older form response** (fixes their name). The cheap check misses it by design; **Sync now** must update the name in the Members sheet, the attendance sheets' fixed columns and MemberIndex, without touching ticks. Test in **Task 5**.
3. **Just after midnight in Malaysia** (`2026-10-08T16:30:00Z` = 00:30 on 9 Oct in KL), the Today page must list 9 Oct classes, not 8 Oct. Test in **Task 4**.
4. **A new form answer names a class that isn't in the event**, e.g. "Waacking" added to the form after the event was created. Sync must not crash or silently drop the dancer's other styles. It reports the token in `unknownClasses` and the event's `lastSyncError`. Test in **Task 5**.
5. **The admin points the master folder back to a folder that already contains a folder with the event's name.** The existing folder is reused and no duplicate `OCT MONTHLY CLASS` folder is created. Test in **Task 10**.

---

## How to run this plan (read once)

1. **🧑 OWNER ACTION** steps: stop, tell the owner exactly what to do, and wait. Never ask for the club Gmail password.
2. **Before Task 1 (🧑 OWNER ACTION):** the working tree has uncommitted fixes from 2026-09-30. Ask the owner to approve committing them. Then create branch `feat/events` from `main`. All plan commits go on that branch.
3. **Test commands:** `npm test -w api`, `npm test -w web`, `npx playwright test --workers=1` (from `web/`), `npm run build -w web`, `npm run build -w api`.
4. **TDD:** write the test, run it and see it fail, implement, run it and see it pass (`test-driven-development`). Unexplained failure: `systematic-debugging`. Before ticking a task: `verification-before-completion`.
5. **Output:** complete files, no `// ...unchanged` placeholders (`output-skill` for long files).
6. **Do not deploy** until Task 20. The live site keeps using the current backend until then.
7. **Skills:** as the original plan's skills map. UI tasks use `ui-ux-pro-max` / `impeccable` / `ui-styling`, and never `taste-skill`, `soft-skill`, `minimalist-skill`, `brutalist-skill`, `gpt-tasteskill`, `stitch-skill` or `redesign-skill`.

## File structure

```
shared/src/types.ts                 EventItem, EventSummary, EventType, EventStatus, TodayClass, SourcePreview;
                                    month → eventId on ClassSession, VideoItem, MusicItem, AttendanceGrid; bootstrap shapes
api/src/db/schema.ts, db.ts, table.ts   Events tab; Table.upsertMany; MemberMonths removed (Task 4)
api/src/logic/events.ts             eventNameKey, validateEventFields, classesOutsideRange, hashRow, todayKL
api/src/logic/retention.ts          RETENTION_YEARS, addYearsClamped, isDue, anonymizedMemberId
api/src/logic/filenameDate.ts       parseDateFromName(name, range)
api/src/features/eventSource.ts     readSourceSheet, previewSource
api/src/features/eventSheets.ts     ensureEventFolder, ensureMembersSheet, ensureEventSheets, moveEventFolders
api/src/features/eventImport.ts     importEventMembers
api/src/features/events.ts          events.* routes
api/src/features/retention.ts       retention.* routes
api/src/features/reset.ts           admin.resetStatus, admin.resetTestData, assertSchemaReady
api/test/fixtures/events.ts         seedEvent, seedSourceSheet test helpers

web/src/features/events/            EventsPage.tsx, EventCard.tsx, FolderLinksHeader.tsx, EventWizard.tsx,
                                    eventDraft.ts, useCurrentEvent.ts,
                                    steps/{FormLinkStep,EventDetailsStep,StylesStep,ScheduleStep,ReviewStep}.tsx
web/src/components/ui/EventPicker.tsx
web/src/lib/useEventAutoSync.ts     (replaces useRegistrationAutoSync.ts)
web/src/features/settings/RetentionPanel.tsx, ResetTestDataPanel.tsx
deleted: web/src/features/members/ImportWizard.tsx, web/src/lib/useRegistrationAutoSync.ts,
         api/src/logic/sessionGen.ts (+ its test)
```

---

# Milestone B1 — Backend

### Task 1: Event types, Events table, `Table.upsertMany`

**Files:**
- Modify: `shared/src/types.ts`, `api/src/db/schema.ts`, `api/src/db/db.ts`, `api/src/db/table.ts`, `api/test/fakes/fakeSheets.ts`
- Test: `api/test/db/table.test.ts`, `api/test/db/events.test.ts` (new)

**Interfaces:**
- Produces, in `shared/src/types.ts` (only **add** in this task; the month → eventId swaps happen in Task 4):
  ```ts
  export type EventType = 'monthly' | 'trial' | 'workshop' | 'other';
  export type EventStatus = 'active' | 'archived';
  export interface EventItem extends RowMeta {
    name: string; nameKey: string; type: EventType; startDate: ISODate; endDate: ISODate;
    sourceSheetId: string; sourceTab: string; columnMapJson: string; classIndex: number;
    styleIds: string[]; folderId: string; videoFolderId: string; membersSpreadsheetId: string;
    status: EventStatus; sourceRowCount: number; sourceLastRowHash: string;
    lastSyncAt: string; lastSyncError: string; memberCount: number;
  }
  export type EventSummary = Pick<EventItem, 'id' | 'name' | 'type' | 'startDate' | 'endDate' | 'status' | 'styleIds'>;
  export type TodayClass = ClassSession & { eventName: string };
  export interface SourcePreview {
    headers: string[]; sourceTab: string; columnMap: Record<string, number | null>;
    scores: Record<string, number>; classIndex: number; rowCount: number; sampleNames: string[];
    detectedStyleIds: string[]; unknownClasses: { token: string; count: number }[];
    warnings: { kind: string; row: number; detail: string }[];
  }
  ```
- Produces: `SCHEMA.Events` with exactly the columns of spec §3.1 plus common columns. `ctx.db.events: Table<EventItem>` (id prefix `evt`); the codec stores `styleIds` as a comma list and numbers as numbers.
- Produces: `Table.upsertMany(key: keyof T, rows: Omit<T, keyof RowMeta>[], actor: string, now: Date): T[]`.
  - Matches rows on `key` against existing rows (including inactive ones).
  - Unchanged rows keep their version. Changed rows get `version + 1`. New rows get new ids.
  - Writes the whole table body with **one** `setValues(2, 1, body)` call.
- Produces: `FakeSheet.writeCalls: number`, incremented by every `setValues` and `appendRows` call.

- [ ] **Step 1: Write failing tests.**
  - `table.test.ts` › `upsertMany writes 10 updates + 20 inserts with one sheet write`: seed 10 rows, then call `upsertMany` with those 10 (3 changed) plus 20 new. Expect:
    - `sheet.writeCalls` increased by exactly `1`;
    - `table.all().length === 30`;
    - the 7 unchanged rows keep `version 1`, and the 3 changed rows have `version 2`.
  - `events.test.ts` › `events table round-trips styleIds and numbers`: insert an event with `styleIds: ['sty_a','sty_b']`, `classIndex: 5`, `memberCount: 0`. Read it back through a fresh `openDb` over the same fake drive: arrays and numbers are equal.
- [ ] **Step 2:** `npm test -w api -- table events`. Expected: FAIL (`upsertMany is not a function`, `events` undefined).
- [ ] **Step 3:** Implement the types, schema, codec, `upsertMany` and `writeCalls`.
- [ ] **Step 4:** `npm test -w api`. Expected: all pass.
- [ ] **Step 5:** Commit `feat(api): events table and batched upsert`.

### Task 2: Pure event and retention logic

**Files:**
- Create: `api/src/logic/events.ts`, `api/src/logic/retention.ts`
- Test: `api/test/logic/events.test.ts`, `api/test/logic/retention.test.ts`

**Interfaces:**
- Produces (`logic/events.ts`):
  - `eventNameKey(name: string): string`
  - `validateEventFields(input: { name: string; type: string; startDate: string; endDate: string; styleIds: string[] }, existing: { id: string; nameKey: string }[], selfId?: string): void`. Throws `AppError('VALIDATION', …)` with exactly these messages:
    - `Event name is required`
    - `An event called "<trimmed name>" already exists.`
    - `Event type must be monthly, trial, workshop or other`
    - `End date must be on or after the start date`
    - `Choose at least one dance style`
  - `classesOutsideRange(sessions: ClassSession[], startDate: ISODate, endDate: ISODate): ClassSession[]` (active sessions whose `date` is outside the range)
  - `hashRow(values: string[]): string` (djb2 over `values.join('\u001f')`, returned as lower-case hex)
  - `todayKL(now: Date): ISODate` (`Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' })`)
- Produces (`logic/retention.ts`):
  - `RETENTION_YEARS = 3`
  - `addYearsClamped(date: ISODate, years: number): ISODate` (29 Feb clamps to 28 Feb)
  - `isDue(lastEventEnd: ISODate, today: ISODate): boolean`, true when `today > addYearsClamped(lastEventEnd, 3)`. A blank `lastEventEnd` is never due.
  - `anonymizedMemberId(): string` (`'X-'` + 10 characters from `newId('')`)

- [ ] **Step 1: Write failing tests.**
  - `eventNameKey(' Oct  Monthly Class ') === 'oct monthly class'`.
  - `validateEventFields` with `existing=[{id:'evt_1', nameKey:'oct monthly class'}]`:
    - `name: ' Oct  Monthly Class '` → throws `An event called "Oct  Monthly Class" already exists.` **(Review Focus 1)**;
    - the same with `selfId: 'evt_1'` → no throw;
    - `endDate < startDate` → end-date message;
    - `styleIds: []` → style message.
  - `hashRow(['a','b']) !== hashRow(['ab',''])`; the same input gives the same hash.
  - `todayKL(new Date('2026-10-08T16:30:00Z')) === '2026-10-09'` and `todayKL(new Date('2026-10-08T15:59:00Z')) === '2026-10-08'` **(Review Focus 3)**.
  - `isDue('2023-09-29','2026-09-30') === true`; `isDue('2023-09-30','2026-09-30') === false`; `addYearsClamped('2024-02-29',3) === '2027-02-28'`; `isDue('','2030-01-01') === false`.
  - `anonymizedMemberId()` matches `/^X-[A-Za-z0-9]{10}$/`.
- [ ] **Step 2:** Run the tests. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement both modules.
- [ ] **Step 4:** `npm test -w api`. Expected: all pass.
- [ ] **Step 5:** Commit `feat(api): event and retention logic`.

### Task 3: Port additions (sheets and Drive)

**Files:**
- Modify: `api/src/ports.ts`, `api/src/gas/adapters.ts`, `api/test/fakes/fakeSheets.ts`, `api/test/fakes/fakeDrive.ts`
- Test: `api/test/fakes/fakePorts.test.ts` (new)

**Interfaces:**
- Produces on `SheetPort`:
  - `lastRowValues(): { lastRow: number; values: string[] }` (`lastRow` 0 and `values` `[]` when empty; GAS: `getLastRow()` then one `getRange(lastRow, 1, 1, lastColumn).getDisplayValues()[0]`);
  - `clearBody(): void` (removes rows 2..last);
  - `setHeaderRow(headers: string[]): void` (replaces row 1 and clears any header cells to the right).
- Produces on `SpreadsheetPort`: `removeSheet(name: string): void` (no-op if missing).
- Produces on `DrivePort`:
  - `renameFolder(folderId: string, name: string): void`
  - `copySpreadsheet(id: string, name: string, folderId: string): string` (returns the new id; GAS: `DriveApp.getFileById(id).makeCopy(name, DriveApp.getFolderById(folderId)).getId()`)
  - existing: `moveToFolder`, `findChildFolder`, `createFolder`
- Fakes implement all of them. `FakeDrive.nameOf(id): string | undefined` is added for assertions.

- [ ] **Step 1: Write failing tests** in `fakePorts.test.ts`:
  - `lastRowValues` on a 3-row sheet returns `lastRow 3` and the row-3 values; `clearBody` leaves only the header;
  - `setHeaderRow(['a','b'])` on a 4-column header leaves `['a','b','','']`;
  - `removeSheet` removes the tab;
  - `renameFolder` changes `nameOf`;
  - `copySpreadsheet` returns a new id whose sheets have equal values and whose parent is the target folder.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the fakes and the GAS adapters.
- [ ] **Step 4:** `npm test -w api` passes. `npm run build -w api` succeeds.
- [ ] **Step 5:** Commit `feat(api): sheet and drive port additions`.

### Task 4: Re-key everything from month to eventId

A mechanical but wide change. After this task no API code reads or writes `month`.

**Files:**
- Modify:
  - `shared/src/types.ts`
  - `api/src/db/schema.ts`, `api/src/db/db.ts`
  - `api/src/features/sessions.ts`, `attendance.ts`, `members.ts`, `videos.ts`, `music.ts`, `bootstrap.ts`, `auth.ts`
  - `api/src/logic/filenameDate.ts`
- Delete: `api/src/logic/sessionGen.ts`, `api/test/logic/sessionGen.test.ts`
- Create: `api/test/fixtures/events.ts`
- Test: update `api/test/features/{sessions,attendance,members,videos,music,bootstrap,auth}.test.ts`, `api/test/logic/filenameDate.test.ts`

**Interfaces:**
- Consumes: `EventItem`, `TodayClass` (Task 1); `todayKL` (Task 2).
- Produces (types):
  - `ClassSession.month`, `VideoItem.month`, `MusicItem.month`, `AttendanceGrid.month` → `eventId: string`.
  - `MemberIndexRow.months/lastMonth` → `eventIds: string[]`, `lastEventEnd: ISODate`.
  - `AttendanceSheetRow.month` → `eventId`.
  - `AdminBootstrap.months` → `events: EventItem[]`.
  - `DancerBootstrap.profile.months` → `eventIds: string[]`, plus `DancerBootstrap.events: EventSummary[]`.
- Produces (schema): `ClassSessions`, `AttendanceSheets`, `Videos`, `Music` have `eventId` in place of `month`. `MemberIndex` has `eventIds, lastEventEnd` in place of `months, lastMonth`. `MemberMonths` is removed from `SCHEMA` and `Db`.
- Produces (routes):
  - `sessions.list {eventId, styleId?}`.
  - `sessions.today {}` → `TodayClass[]`: active sessions whose `date === todayKL(ctx.now())` in **active** events, sorted by `start`.
  - `sessions.create/update/batchUpsert` take `eventId`. They throw `VALIDATION` `Class date must be inside the event (<startDate> to <endDate>)` for a date outside the event range, and `NOT_FOUND` for an unknown event.
  - `sessions.generateMonth` is removed.
  - `attendance.get/mark/export {eventId, styleId}`, with cache keys `attv:<eventId>:<styleId>` and `att:<eventId>:<styleId>:<ver>`. `attendance.mark` validates members against the event's Members sheet. `attendance.ensureSheets` and `attendanceEnsureSheets` are **removed** (they return in Task 5).
  - `members.list {eventId, styleId?}` and `members.update {eventId, memberId, fullName?, matricRaw?}` read `event.membersSpreadsheetId`. Removed: `members.previewImport`, `confirmImport`, `resync`, `autoSync`, `sync`, `importedMonths`.
  - `videos.list {eventId?, styleId?, sessionId?}`.
  - `videos.targetFolder {sessionId}` → `{ videoMasterFolderId, eventFolderId, eventFolderName, classFolderName, musicFolderName: 'Music' }` (`eventFolderId` is `event.videoFolderId`, possibly `''`).
  - `videos.register {driveFileId, sessionId, title, eventFolderId?}` sets `eventId` from the session and saves `eventFolderId` to `event.videoFolderId` when that is blank.
  - `videos.scan {eventId, styleId}`.
  - `music.list {eventId?, styleId?, sessionId?}`, `music.create {eventId, …}`.
  - `admin.bootstrap` returns `events` (all rows, sorted by `startDate` descending).
  - `dancer.bootstrap`: the dancer's styles per event come from that event's Members sheet. Chunk cache key `boot:chunk:<eventId>:<styleId>:<dataVersion>`. Returns `events: EventSummary[]` for the dancer's events, including archived ones.
- Produces (logic): `parseDateFromName(name: string, range: { startDate: ISODate; endDate: ISODate }): ISODate | null`. For formats without a year (`DD/MM`, `7 Oct`), try the start year and then the end year, and return the first date inside the range. Returns `null` when no date falls in the range.
- Produces (test helper, `api/test/fixtures/events.ts`):
  - `seedEvent(ctx, overrides?: Partial<EventItem> & { members?: Partial<Member>[] }): EventItem`. Inserts an active event (default name `TEST EVENT`, range `2026-10-01`..`2026-10-31`, no styles) and creates its Members sheet with `MEMBERS_COLUMNS` and the given members.
  - `seedSourceSheet(ctx, rows: string[][]): string`. Creates a fake response sheet with tab `Form Responses 1`; the first row is headers. Returns its id.

- [ ] **Step 1: Update tests first**, replacing month fixtures with `seedEvent`. New tests:
  - `sessions.test.ts` › `sessions.today lists only today's classes in active events, in KL time`: `ctx.now = 2026-10-08T16:30:00Z`; active event E1 with a class on `2026-10-09` and one on `2026-10-08`; archived event E2 with a class on `2026-10-09`. Expect exactly one result, dated `2026-10-09`, with `eventName` = E1's name **(Review Focus 3)**.
  - `sessions.test.ts` › `create rejects a date outside the event`: E1 range 1–31 Oct; creating a class on `2026-11-02` fails with the exact message above.
  - `sessions.test.ts` › `two overlapping events keep separate classes`: E1 and E2 both 1–31 Oct with the same style; `sessions.list {eventId: E1}` returns only E1's classes.
  - `bootstrap.test.ts` › `dancer sees archived events they registered for`.
  - `filenameDate.test.ts`: `'08/10 popping.mp4'` with range `2026-10-01..2026-10-31` → `'2026-10-08'`; the same file with range `2026-12-15..2027-01-15` → `null`; `'5 Jan class.mp4'` with range `2026-12-15..2027-01-15` → `'2027-01-05'`.
- [ ] **Step 2:** `npm test -w api`. Expected: the new and updated tests FAIL.
- [ ] **Step 3:** Make the changes listed under Interfaces. Remove `sessionGen.ts` and the month-based import code paths.
- [ ] **Step 4:** `npm test -w api` passes. `grep -rn "\bmonth\b" api/src` shows no hits outside comments.
- [ ] **Step 5:** Commit `refactor(api)!: key classes, attendance, media and members by event`.

### Task 5: Event folders, sheets and member import

**Files:**
- Create: `api/src/features/eventSource.ts`, `api/src/features/eventSheets.ts`, `api/src/features/eventImport.ts`
- Modify: `api/src/features/attendance.ts` (re-add `attendance.ensureSheets`)
- Test: `api/test/features/eventImport.test.ts`, `api/test/features/eventSheets.test.ts`

**Interfaces:**
- Consumes: `Table.upsertMany`, `hashRow`, port additions, `seedEvent` and `seedSourceSheet`.
- Produces (`eventSource.ts`):
  - `readSourceSheet(ctx, sheetId: string, preferredTab?: string): { tab: string; data: string[][] }`. Tab preference: `preferredTab`, `Form Responses 1`, `Form responses 1`, `Sheet1`, then the first sheet. Throws `LINK_NO_ACCESS` with the club Gmail fix-it text when it can't open the sheet.
  - `previewSource(ctx, sheetUrl: string): SourcePreview`. Contains the logic of the old `members.previewImport`, plus `detectedStyleIds` (active styles with ≥ 1 row), `unknownClasses` and `sourceTab`.
- Produces (`eventSheets.ts`):
  - `ensureEventFolder(ctx, event: EventItem): string`. Throws `VALIDATION` `Set the attendance master folder on the Events page first` if `defaultAttendanceFolderId` is unset. Otherwise returns the child folder of the master named `event.name`, creating it if needed.
  - `ensureMembersSheet(ctx, event: EventItem, folderId: string): string`
  - `ensureEventSheets(ctx, event: EventItem): { styleId: string; spreadsheetId: string }[]`. For each id in `event.styleIds`:
    - existing sheet: move it into the event folder, append missing class columns and missing member rows (`planSync`);
    - otherwise: create `<style> Attendance` in the event folder.

    Classes are the event's active sessions for that style, sorted by `date`, then `seq`.
- Produces (`eventImport.ts`):
  ```ts
  export interface ImportResult {
    changed: boolean; added: number; updated: number; flaggedRemoved: number;
    memberCount: number; unknownClasses: { token: string; count: number }[];
  }
  export function importEventMembers(ctx: Ctx, event: EventItem, opts: { full: boolean }): ImportResult;
  ```
  Called with the script lock held. Behaviour:
  1. Read the source and compute `{ rowCount, hash }` of the last row.
  2. `!full` and both equal the saved values → return `changed: false`. **No writes.**
  3. Build members with `buildMembers`, limited to the event's styles.
     - If `classIndex === -1` and `event.styleIds.length === 1`, every member gets that style.
     - Class tokens matching no event style go to `unknownClasses`. The member keeps their other styles.
  4. Append new members to the Members sheet.
     - With `full`, also rewrite changed fields (`fullName, nameKey, contact, email, gender, nationality, styleIds, styleNames`) of existing rows **in one `setValues`**.
     - Members no longer in the form get flag `removed-from-form`.
  5. Run `ensureEventSheets`. With `full`, also rewrite the fixed columns (`fullName, matric, contact, gender, nationality`) of existing attendance rows. Tick columns are never touched.
  6. Call `ctx.db.memberIndex.upsertMany('matricKey', …)` once. `eventIds` gains `event.id`; `lastEventEnd` = the latest `endDate` among the member's events; `fullName` and `nameKey` come from this import.
  7. Update the event row: `sourceRowCount`, `sourceLastRowHash`, `memberCount`, `lastSyncAt`. Set `lastSyncError` to `''`, or to `Unknown class in form: <tokens>` when `unknownClasses` is non-empty.
- Produces (route): `attendance.ensureSheets {eventId}` (perm `members.import`, write) → `{ sheets }`.

- [ ] **Step 1: Write failing tests** (`eventImport.test.ts`), each using `seedEvent` + `seedSourceSheet` with the attendance master folder set:
  - `first import creates members sheet rows, attendance rows and MemberIndex in batched writes`: 3 registrants, 2 styles. Expect 3 Members rows, the right rows in each style sheet, 3 MemberIndex rows with `eventIds=[event.id]`, and `memberIndex` sheet `writeCalls` +1.
  - `cheap check with no change does nothing`: run twice with `full: false`. The second result has `changed: false`, and no fake sheet's `writeCalls` changed.
  - `new response appends one member and keeps existing ticks`: tick member 1 in the Popping sheet, add a 4th row to the source, import. Member 4 is appended and member 1's tick is still `/`.
  - `sync now picks up an edited older response` **(Review Focus 2)**: change row 1's name `Ali` → `Ali Bin Abu` in the source (the row count doesn't change). `full: false` → `changed: false`. `full: true` → the Members sheet, the attendance fixed column and MemberIndex `fullName` all say `Ali Bin Abu`, and ticks are unchanged.
  - `unknown class in form is reported, other styles kept` **(Review Focus 4)**: an answer `Popping, Waacking` in a Popping + Hip Hop event → the member has `styleIds=[popping]`, `unknownClasses=[{token:'Waacking',count:1}]`, and the event's `lastSyncError` contains `Waacking`.
  - `single-style event with no class column puts everyone in that style`.
  - `same dancer in two overlapping events`: after importing both, MemberIndex `eventIds` has both ids and `lastEventEnd` is the later `endDate`.
  - `eventSheets.test.ts` › `no master folder → VALIDATION message`, and `existing sheet outside the event folder is moved in`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the three modules and the route.
- [ ] **Step 4:** `npm test -w api` passes.
- [ ] **Step 5:** Commit `feat(api): event sheets and incremental member import`.

### Task 6: Reset test data and schema guard

**Files:**
- Create: `api/src/features/reset.ts`
- Modify: `api/src/router.ts` (register routes)
- Test: `api/test/features/reset.test.ts`

**Interfaces:**
- Produces:
  - `schemaReady(ctx): boolean`. True when the headers of `ClassSessions`, `AttendanceSheets`, `Videos` and `Music` contain `eventId`, the `MemberIndex` header contains `eventIds`, and no `MemberMonths` tab exists.
  - `assertSchemaReady(ctx): void`. Throws `VALIDATION` `Run Settings › Reset test data first`.
  - `admin.resetStatus {}` (perm `settings.edit`, read) → `{ needed: boolean }`.
  - `admin.resetTestData {confirm}` (perm `settings.edit`, write, bumpsData):
    - wrong phrase → `VALIDATION` `Type DELETE TEST DATA to confirm`;
    - `!needed` → `VALIDATION` `Test data has already been reset`;
    - otherwise runs spec §9 steps 1–6 and returns `{ backupSpreadsheetId }`. The backup goes in the `dbFolderId` folder.

- [ ] **Step 1: Write failing tests.** Build an "old" database: tabs with the old headers (`month`, `months`, `lastMonth`) plus a `MemberMonths` tab with rows.
  - `status says needed on old schema`.
  - `wrong phrase is refused`, and nothing changes.
  - `reset backs up, clears old rows, rewrites headers, keeps admins roles styles`: a backup exists with the same row counts; `ClassSessions`, `MemberIndex`, `AttendanceSheets`, `Videos`, `Music` and `Sections` have header only; `MemberMonths` is gone; `Admins`, `Roles`, `DanceStyles` and `Instructors` row counts are unchanged; `schemaReady` is true.
  - `second reset is refused`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test -w api` passes.
- [ ] **Step 5:** Commit `feat(api): one-time reset of test data`.

### Task 7: Event list, preview and create

**Files:**
- Create: `api/src/features/events.ts`
- Modify: `api/src/router.ts`
- Test: `api/test/features/events.test.ts`

**Interfaces:**
- Consumes: `validateEventFields`, `eventNameKey`, `previewSource`, `ensureEventFolder`, `ensureMembersSheet`, `ensureEventSheets`, `importEventMembers`, `assertSchemaReady`, `validateLink`.
- Produces:
  - `events.list {includeArchived?: boolean}` (perm `members.view`) → `EventItem[]` sorted by `startDate` descending. Archived events are included only when `includeArchived` is set.
  - `events.previewSource {sheetUrl}` (perm `members.import`) → `SourcePreview`.
  - `events.create {name, type, startDate, endDate, sheetUrl, columnMap, classIndex, styleIds, sessions: {styleId, seq, date, start, end, venue?}[]}` (perm `members.import`, write, bumpsData) → `{ event: EventItem; import: ImportResult; sheets: {styleId, spreadsheetId}[] }`. Order of work:
    1. `assertSchemaReady`;
    2. `validateEventFields`;
    3. `validateLink(sheetUrl, 'spreadsheet')`;
    4. every session's date is in range and its `styleId` is in `styleIds`;
    5. insert the event (`status: 'active'`, `sourceTab` from `readSourceSheet`);
    6. `ensureEventFolder` → save `folderId`;
    7. `ensureMembersSheet` → save `membersSpreadsheetId`;
    8. insert sessions;
    9. `importEventMembers(full: true)`;
    10. audit `events.create`.

- [ ] **Step 1: Write failing tests:**
  - `create builds folder, members sheet, classes and attendance sheets`: the event folder named after the event is under the master; the Members sheet has the registrants; there is one attendance sheet per style with class columns in date order.
  - `create rejects duplicate name ignoring case and spaces` → exact message.
  - `create refuses on old schema` → `Run Settings › Reset test data first`.
  - `create rejects a class outside the range or for a style not in the event`.
  - `list hides archived unless asked`.
  - `preview reports detected styles and unknown classes`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test -w api` passes.
- [ ] **Step 5:** Commit `feat(api): create and list events`.

### Task 8: Edit, archive, unarchive, recreate folder

**Files:**
- Modify: `api/src/features/events.ts`
- Test: `api/test/features/events.test.ts`

**Interfaces:**
- Produces (all perm `members.import`, write, bumpsData):
  - `events.update {id, version, name?, type?, startDate?, endDate?, sheetUrl?, columnMap?, classIndex?, styleIds?}` → `EventItem`.
    - Name change: `validateEventFields` with `selfId`, then `renameFolder` on `folderId` and on `videoFolderId` (when set).
    - Date change: if `classesOutsideRange` is non-empty, throw `VALIDATION` `These classes are outside the new dates: <date style #seq, …>`. A new `endDate` recalculates `lastEventEnd` for the event's members in one `upsertMany`.
    - Styles added: `ensureEventSheets`. Styles removed: only dropped from `styleIds`; their sheets and rows are untouched.
    - `sheetUrl` change: validate the link, store it, and reset `sourceRowCount` to `0` so the next sync re-reads.
  - `events.archive {id, version}` / `events.unarchive {id, version}` set `status`.
  - `events.recreateFolder {id}` creates a fresh folder when `ctx.drive.info(folderId).exists` is false, and moves the Members sheet and attendance sheets into it.

- [ ] **Step 1: Write failing tests:**
  - `rename renames the drive folder`.
  - `date change blocked by classes outside range, lists them`.
  - `end date change updates lastEventEnd`.
  - `removing a style keeps its sheet`.
  - `archive then unarchive`.
  - `recreate folder moves sheets into a new folder`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test -w api` passes.
- [ ] **Step 5:** Commit `feat(api): edit and archive events`.

### Task 9: Auto-sync and Sync now

**Files:**
- Modify: `api/src/features/events.ts`, `api/src/router.ts`
- Test: `api/test/features/eventSync.test.ts`

**Interfaces:**
- Produces:
  - `events.autoSync {}` (perm `members.import`, **`write: false`**) → `{ checked: string[]; changed: string[]; skipped: string[]; errors: {eventId, message}[] }`. For each **active** event:
    1. If cache `sync:check:<id>` is present → `skipped`.
    2. Otherwise put `sync:check:<id>` (TTL 600) and run the cheap check (read `lastRowValues` only).
    3. Unchanged → `checked`.
    4. Changed → `withScriptLock(ctx.lock, …)`: `importEventMembers(full: false)`, bump `DATA_VERSION` once for the whole call → `changed`. A `BUSY` lock → `skipped`, and the cache key is removed so the next round retries.
    5. A read error → `errors`, with `lastSyncError` saved in its own locked write. Other events continue.
  - `events.sync {id}` (perm `members.import`, write, bumpsData only when changed).
    - Within 60 s of the last forced sync (`sync:force:<id>`), returns the cached last `ImportResult` plus `message: 'Synced less than a minute ago'`.
    - Otherwise `importEventMembers(full: true)`. Archived event → `VALIDATION` `Archived events do not sync`.

- [ ] **Step 1: Write failing tests:**
  - `quiet round: no lock, no writes`: `FakeLock` records `tryLock` calls → 0; total `writeCalls` delta 0; `DATA_VERSION` unchanged.
  - `second call within 10 minutes skips`.
  - `change found: one DATA_VERSION bump`.
  - `archived events are not checked`.
  - `one broken form link does not stop others`: E1's source is deleted and E2 has a change → `errors` has E1, `changed` has E2.
  - `sync now twice within a minute returns cached result`.
  - `busy lock skips and clears the throttle key`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Add `FakeLock.tryLockCalls` if it isn't already there.
- [ ] **Step 4:** `npm test -w api` passes.
- [ ] **Step 5:** Commit `feat(api): throttled event auto-sync and sync now`.

### Task 10: Master folder change moves event folders

**Files:**
- Modify: `api/src/features/eventSheets.ts` (add `moveEventFolders`), `api/src/features/settings.ts`
- Test: `api/test/features/eventSheets.test.ts`

**Interfaces:**
- Produces: `moveEventFolders(ctx, kind: 'attendance' | 'video', newMasterId: string): { moved: number; created: number; reused: number }`. For **every** event (active and archived), using `folderId` for `attendance` and `videoFolderId` for `video`, and skipping video when `videoFolderId` is blank:
  1. A child folder named `event.name` exists in the new master → reuse it: point the event at it and move the Members sheet and attendance sheets into it (attendance only).
  2. Otherwise, if the current folder exists → `moveToFolder(folder, newMaster)`.
  3. Otherwise → create the folder, then move the sheets in (attendance only).
- `settings.setLink` with `key` `defaultAttendanceFolderId` or `defaultVideoFolderId` calls `moveEventFolders` after saving, and returns `{ key, value, moved, created, reused }`.

- [ ] **Step 1: Write failing tests:**
  - `new empty master: event folders are moved, not duplicated`.
  - `master re-pointed to a folder already holding the event folder reuses it` **(Review Focus 5)**: `findChildFolder(newMaster, name)` returns the same id and there is exactly one child with that name.
  - `deleted event folder is recreated with its sheets`.
  - `video kind skips events without a video folder`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test -w api` passes.
- [ ] **Step 5:** Commit `feat(api): move event folders when a master folder changes`.

### Task 11: Data retention

**Files:**
- Create: `api/src/features/retention.ts`
- Modify: `api/src/router.ts`
- Test: `api/test/features/retention.test.ts`

**Interfaces:**
- Consumes: `isDue`, `anonymizedMemberId`, `todayKL`.
- Produces:
  - `retention.preview {}` (perm `settings.edit`) → `{ due: { matricKey, fullName, lastEventName, lastEventEnd }[]; formsToClean: { eventName, sourceSheetId }[] }`. `formsToClean` lists events whose members are **all** due.
  - `retention.apply {matricKeys: string[]}` (perm `settings.edit`, write, bumpsData) → `{ wiped: number }`. Matric keys that are not due are ignored. For each dancer, across every event's Members sheet and attendance sheets:
    - `memberId` → one `anonymizedMemberId()` per dancer, reused in all their sheets;
    - `fullName` → `Removed dancer`;
    - `matric/matricRaw/matricKey/nameKey/contact/email/gender/nationality` → `''`;
    - ticks are kept.

    Also: MemberIndex personal fields blanked and `active=false`; that matric's MemberRoles deactivated; AuditLog `target`/`detail` containing the matric blanked. One audit row: `retention.apply`, detail `wiped <n> dancers`.

- [ ] **Step 1: Write failing tests** with `ctx.now = 2026-10-01`:
  - a dancer whose only event ended `2023-09-29` is due; one whose event ended `2023-10-01` is not;
  - `apply` wipes the due dancer: the Members row name is `Removed dancer` with empty matric; the attendance row keeps its `/` ticks and has an `X-` memberId; the MemberIndex row is inactive with empty `fullName`; `auth.dancerLogin` with the old matric → `NOT_REGISTERED`;
  - `apply` with a not-due matric wipes nothing;
  - `formsToClean` lists an event only when all its members are due.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test -w api` passes.
- [ ] **Step 5:** Commit `feat(api): three-year data retention`.

---

# Milestone B2 — Web

### Task 12: Event state, picker and auto-sync hook

**Files:**
- Create: `web/src/features/events/useCurrentEvent.ts`, `web/src/components/ui/EventPicker.tsx`, `web/src/lib/useEventAutoSync.ts`
- Modify: `web/src/app/DesktopShell.tsx`, `web/src/app/PhoneShell.tsx`, `web/src/app/routes.tsx`
- Delete: `web/src/lib/useRegistrationAutoSync.ts`
- Test: `web/src/features/events/useCurrentEvent.test.tsx`, `web/src/lib/useEventAutoSync.test.tsx`

**Interfaces:**
- Produces:
  - `useCurrentEvent(): { events: EventItem[]; current: EventItem | null; setCurrentId(id: string): void; isLoading: boolean }`.
    - Query key `['events']`, action `events.list {includeArchived: true}`.
    - The choice is stored in `localStorage` key `umdsc:currentEvent`. A missing or unknown stored id falls back to the active event with the latest `startDate`, then to any event, then to `null`.
  - `<EventPicker />`: a native `<select>` (≥ 44 px) listing active events, then an `── Archived ──` optgroup. It shows `NO EVENTS YET` linking to `/admin/events/new` when empty.
  - `useEventAutoSync(): void`. Calls `events.autoSync` 4 s after mount and then every `600_000` ms while `document.visibilityState === 'visible'`. When `changed.length > 0`, it invalidates `['events']`, `['members']`, `['attendance']`, `['sessions']`, `['bootstrap']`.
  - `DesktopShell` and `PhoneShell` gain a prop `topBar?: React.ReactNode`, rendered above the page content. The admin `ShellLayout` passes `<EventPicker />` and mounts `useEventAutoSync()` once. Dancer shells pass nothing.

- [ ] **Step 1: Write failing tests** (Vitest + Testing Library, API mocked):
  - `falls back to latest active event when nothing stored`;
  - `keeps stored choice across remount`;
  - `unknown stored id falls back`;
  - auto-sync: fake timers; `events.autoSync` is called at 4 s and at 604 s; it is not called while `visibilityState === 'hidden'`; `invalidateQueries` is called only when `changed` is non-empty.
- [ ] **Step 2:** `npm test -w web`. Expected: FAIL.
- [ ] **Step 3:** Implement. Remove the old hook and its use in `AttendancePage`.
- [ ] **Step 4:** `npm test -w web` passes. `npm run build -w web` succeeds.
- [ ] **Step 5:** Commit `feat(web): event picker and 10-minute auto-sync`.

### Task 13: Events page

**Files:**
- Create: `web/src/features/events/EventsPage.tsx`, `EventCard.tsx`, `FolderLinksHeader.tsx`
- Modify: `web/src/app/routes.tsx`
- Test: `web/e2e/admin-events.spec.ts`

**Interfaces:**
- Consumes: `useCurrentEvent` (Task 12).
- Produces: route `/admin/events`.
  - Admin tabs become **Today · Events · Attendance · Media · More**. Calendar moves into the More grid, next to Registered Dancers and Styles.
  - `FolderLinksHeader` shows both master folder links with **Change** buttons that call `settings.setLink`. After saving it shows `Moved <moved>, created <created>, reused <reused> event folders`.
  - `EventCard` props: `{ event: EventItem; styles: DanceStyle[] }`.
    - Shows name, type, dates, style chips, `memberCount`, the form link (opens the sheet), and `lastSyncAt` in KL time.
    - `lastSyncError` shows as a red line.
    - "Folder missing" (when `events.list` marks it) shows a **Recreate** button.
    - Buttons: **Open** (sets the current event, goes to `/admin/attendance`), **Edit** (`/admin/events/:id/edit`), **Sync now** (`events.sync`), **Archive** / **Unarchive**.
    - Archived cards hide Edit and Sync now.
  - Sections: `ACTIVE EVENTS`, `ARCHIVED EVENTS` (collapsed by default), and **+ NEW EVENT** → `/admin/events/new`.
- Consumes one API addition: `events.list` rows include `folderMissing: boolean`. Add `export type EventListItem = EventItem & { folderMissing: boolean }` to `shared/src/types.ts`; `events.list` returns `EventListItem[]` and `useCurrentEvent().events` becomes `EventListItem[]`. Add it in `api/src/features/events.ts` (`!ctx.drive.info(folderId).exists`, only for active events) with a test in `events.test.ts` › `list flags a missing folder`.

- [ ] **Step 1: Write the failing e2e test** `admin-events.spec.ts`, mocked:
  - two active events and one archived: two cards under Active, one under Archived after expanding;
  - **Sync now** posts `events.sync` with the event id;
  - **Archive** posts `events.archive`;
  - a card with `lastSyncError` shows the error text;
  - plus the API test `list flags a missing folder`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx playwright test e2e/admin-events.spec.ts --workers=1` and `npm test -w api` pass.
- [ ] **Step 5:** Commit `feat(web): events page`.

### Task 14: Event wizard, steps 1–3

**Files:**
- Create:
  - `web/src/features/events/eventDraft.ts`
  - `web/src/features/events/EventWizard.tsx`
  - `web/src/features/events/steps/FormLinkStep.tsx`, `EventDetailsStep.tsx`, `StylesStep.tsx`
- Modify: `web/src/app/routes.tsx`
- Test: `web/src/features/events/eventDraft.test.ts`

**Interfaces:**
- Produces (`eventDraft.ts`):
  ```ts
  export interface ScheduledClass { seq: number; date: ISODate; start: string; end: string; venue?: string }
  export interface EventDraft {
    sheetUrl: string; preview: SourcePreview | null; columnMap: Record<string, number | null>; classIndex: number;
    name: string; type: EventType; startDate: ISODate; endDate: ISODate;
    styleIds: string[]; schedule: Record<string, ScheduledClass[]>;
  }
  export function emptyDraft(today: ISODate): EventDraft;              // range = today..today, type 'monthly'
  export function draftFromEvent(e: EventItem, sessions: ClassSession[]): EventDraft;
  export function pruneSchedule(d: EventDraft): EventDraft;           // drops classes outside range or for unselected styles, renumbers seq by date
  export function localNameClash(name: string, events: EventItem[], selfId?: string): boolean;  // same rule as eventNameKey
  ```
- Produces (`EventWizard.tsx`): routes `/admin/events/new` and `/admin/events/:id/edit`. A step bar (1 Form link · 2 Details · 3 Styles · 4 Schedule · 5 Review). Each step gets `{ draft, onChange(patch: Partial<EventDraft>), onNext(), onBack() }`.
  - **Step 1** calls `events.previewSource`. It shows the registration count, sample names and a dropdown per field for `columnMap`, reusing today's mapping preview UI from `ImportWizard.tsx`.
  - **Step 2**: name input, type select, and the day-level range calendar moved from `ImportWizard.tsx`. **Next** is blocked with `An event called "<name>" already exists.` when `localNameClash` is true.
  - **Step 3**:
    - a style checklist, pre-ticked from `preview.detectedStyleIds` (new event only);
    - `unknownClasses` rows with **Add as new style**, which calls `styles.create` with the token as name and alias, then ticks it;
    - **+ New style** with name, colour (palette keys only) and other spellings;
    - **Next** is disabled with no styles ticked.
  - Every change runs `pruneSchedule`.

- [ ] **Step 1: Write failing unit tests** (`eventDraft.test.ts`):
  - `pruneSchedule drops out-of-range classes and renumbers`;
  - `pruneSchedule drops classes of unticked styles`;
  - `localNameClash ignores case and spaces and self`;
  - `draftFromEvent groups sessions by style sorted by date`.
- [ ] **Step 2:** `npm test -w web`. Expected: FAIL.
- [ ] **Step 3:** Implement the draft helpers and steps 1–3. Move code out of `ImportWizard.tsx`; don't copy it.
- [ ] **Step 4:** `npm test -w web` passes. `npm run build -w web` succeeds.
- [ ] **Step 5:** Commit `feat(web): event wizard form, details and styles steps`.

### Task 15: Event wizard, steps 4–5, create and edit

**Files:**
- Create: `web/src/features/events/steps/ScheduleStep.tsx`, `ReviewStep.tsx`
- Modify: `web/src/features/events/EventWizard.tsx`, `web/src/app/routes.tsx`
- Delete: `web/src/features/members/ImportWizard.tsx`, the route `/admin/members/import`, and the More-grid link to it
- Test: `web/e2e/admin-members.spec.ts` → rename to `web/e2e/admin-event-wizard.spec.ts`

**Interfaces:**
- **ScheduleStep**: the calendar schedule screen moved from `ImportWizard.tsx` (style list on the left, range-only calendar, auto-fill, per-class times, **Clear all**), limited to `draft.styleIds`. Every style starts empty.
- **ReviewStep**: a summary of name, type, dates, styles with class counts, dancer count and form link.
  - When `settings.get` has no `defaultAttendanceFolderId`, **Create** is disabled and the step shows `Set the attendance master folder on the Events page first` with a link to `/admin/events` (spec §10).
  - **Create**: `events.create` with `draft` fields and `sessions` flattened from `schedule`. On success, set the current event and navigate to `/admin/events`.
  - **Edit**, in order:
    1. `events.update` with changed fields;
    2. `sessions.delete` for sessions no longer in the draft;
    3. `sessions.batchUpsert` with `eventId` for the rest;
    4. `attendance.ensureSheets {eventId}`.
  - Errors show inline on the step. A `VALIDATION` about classes outside the dates lists them.

- [ ] **Step 1: Write the failing e2e test**, mocked:
  - Paste a link, the preview shows 3 registrants → set the name `TRIAL CLASS 2027` and a range of 5–7 Jan 2027 → tick Popping → click 6 Jan → Create.
  - Assert the `events.create` payload has `name`, `styleIds: ['style-popping']` and `sessions: [{ styleId: 'style-popping', seq: 1, date: '2027-01-06', … }]`.
  - Second test: typing a name that exists (different case) blocks step 2 with the exact message.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Delete `ImportWizard.tsx` and its route.
- [ ] **Step 4:** The e2e test passes. `npm run build -w web` succeeds.
- [ ] **Step 5:** Commit `feat(web): event wizard schedule, review, create and edit`.

### Task 16: Attendance by event

**Files:**
- Modify: `web/src/features/attendance/AttendancePage.tsx`, `web/src/lib/tickQueue.ts`
- Test: `web/src/lib/tickQueue.test.ts`, `web/e2e/admin-attendance.spec.ts`

**Interfaces:**
- Consumes: `useCurrentEvent`.
- Produces:
  - `Tick.month` → `Tick.eventId`; `send(eventId, styleId, marks)`; IndexedDB key `umdsc:ticks:v2`, so old month-based ticks are ignored.
  - AttendancePage:
    - no month arrows; style chips show only `current.styleIds`;
    - `attendance.get/mark/export` send `eventId`;
    - the master-folder panel is removed (it moved to the Events page);
    - Edit / Submit / Cancel stays;
    - no current event → an empty state linking to `/admin/events/new`.

- [ ] **Step 1:** Update the tests to be failing:
  - the tickQueue tests use `eventId`;
  - the e2e mock returns one event with styles Hip Hop + Popping; assert only those chips show and that `attendance.mark` carries `eventId`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test -w web` and `npx playwright test e2e/admin-attendance.spec.ts --workers=1` pass.
- [ ] **Step 5:** Commit `feat(web): attendance by event`.

### Task 17: Media by event

**Files:**
- Modify: `web/src/features/media/MediaPage.tsx`, `UploadDialog.tsx`, `ScanPanel.tsx`, `MusicForm.tsx`, `web/src/lib/google/driveFolders.ts`
- Test: `web/src/lib/google/driveFolders.test.ts`, `web/e2e/admin-media.spec.ts`

**Interfaces:**
- Consumes: `videos.targetFolder` → `{ videoMasterFolderId, eventFolderId, eventFolderName, classFolderName, musicFolderName }` (Task 4).
- Produces:
  - `driveFolders.ensureClassFolder(token, target) → { eventFolderId: string; classFolderId: string; musicFolderId?: string }`. Reuses `eventFolderId` when given; otherwise finds or creates `eventFolderName` under `videoMasterFolderId`. Then finds or creates `classFolderName`, and `Music` for audio.
  - UploadDialog passes `eventFolderId` to `videos.register`.
  - MediaPage:
    - the month stepper is removed; style chips come from `current.styleIds`;
    - the class cards list the event's sessions for the style, by date;
    - the "auto-generate 4 classes" button is removed; instead, an empty state says **Add classes in Events › Edit** with a link.

- [ ] **Step 1: Write failing tests:**
  - `driveFolders.test.ts` › `reuses eventFolderId and creates only the class folder`;
  - `driveFolders.test.ts` › `creates event folder under video master when eventFolderId is blank`;
  - the e2e media spec mock uses an event; assert the upload flow posts `videos.register` with `eventFolderId`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests pass. `npm run build -w web` succeeds.
- [ ] **Step 5:** Commit `feat(web): media by event`.

### Task 18: Calendar, Today and Registered Dancers by event

**Files:**
- Modify: `web/src/features/classes/ClassesPage.tsx`, `SessionEditor.tsx`, `TodayPage.tsx`, `web/src/features/members/MembersPage.tsx`, `web/src/features/auth/TitleScreen.tsx` (only if it reads `profile.months`)
- Test: `web/e2e/admin-classes.spec.ts`, `web/e2e/admin-members-list.spec.ts` (new)

**Interfaces:**
- ClassesPage:
  - shows `current`'s classes across its range; the month grid starts at `startDate`'s month and can step only within the range;
  - "generate month" is removed;
  - new classes are created with `eventId`; dates outside the range are disabled in the picker;
  - SessionEditor keeps Delete.
- TodayPage: `sessions.today`; each card title is `<style> Class <seq> · <eventName>`; empty → `NO CLASSES TODAY`.
- MembersPage: the month select is removed; `members.list {eventId: current.id}`; CSV name `dancers_<event name with spaces as _>.csv`.

- [ ] **Step 1: Write failing tests:**
  - the Today e2e mocks `sessions.today` with two events' classes; both cards show their event names;
  - the members e2e: with the event picker on `OCT MONTHLY CLASS`, `members.list` is posted with that `eventId`, and switching the picker re-posts with the other id;
  - the classes e2e: a date outside the event range can't be picked.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests pass. `npm run build -w web` succeeds.
- [ ] **Step 5:** Commit `feat(web): calendar, today and dancers by event`.

### Task 19: Settings — retention and reset panels

**Files:**
- Create: `web/src/features/settings/RetentionPanel.tsx`, `ResetTestDataPanel.tsx`
- Modify: `web/src/features/settings/SettingsPage.tsx`
- Test: `web/e2e/admin-settings.spec.ts` (new)

**Interfaces:**
- RetentionPanel:
  - **CHECK** → `retention.preview`. Shows a table of due dancers (checkbox, name, matric, last event, end date), all ticked, and a list of `formsToClean` with links.
  - **WIPE SELECTED** → `window.confirm('Permanently remove personal details of <n> dancers? Attendance counts are kept.')` → `retention.apply` → shows `Removed <wiped> dancers`.
  - Nothing due → `No dancer data is due for removal.`
- ResetTestDataPanel:
  - shown only when `admin.resetStatus` returns `needed: true`;
  - a text input; the **RESET TEST DATA** button is enabled only when the input equals `DELETE TEST DATA`;
  - on success shows `Done. Backup: <link to backup sheet>` and invalidates all queries.

- [ ] **Step 1: Write the failing e2e test**:
  - the reset button stays disabled for `delete test data` and is enabled for the exact phrase;
  - retention CHECK lists the mocked due dancer;
  - WIPE posts `retention.apply` with that matric after confirm.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Test passes. `npm run build -w web` succeeds.
- [ ] **Step 5:** Commit `feat(web): retention and reset panels`.

---

# Milestone B3 — Launch

### Task 20: Full test pass, deploy, reset and first real event

**Files:**
- Modify: `docs/SETUP-VALUES.md` (deployment version); `docs/superpowers/plans/2026-09-28-umdsc-dance-class-system.md` (a note at Tasks 27–31: "dancer calendar uses an event switcher instead of a month switcher — see the 2026-09-30 event spec")
- Test: whole suite

- [x] **Step 1:** `npm test -w api`, `npm test -w web`, `npm run build -w web`, and `npx playwright test --workers=1` (from `web/`). Expected: all pass. Paste the summaries.
- [x] **Step 2:** Run `requesting-code-review` on branch `feat/events` against `main`. Fix confirmed findings (`receiving-code-review`).
- [x] **Step 3: 🧑 OWNER ACTION:** approve deploying. Then, from `api/`:
  - `npm run build`
  - `npx clasp push -f`
  - `npx clasp create-version "events"`
  - `npx clasp update-deployment AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA -V <new version>`

  **Only this deployment ID.** Never create a new deployment. Check `npx clasp list-deployments` shows that ID at the new version.
- [ ] **Step 4: 🧑 OWNER ACTION:** refresh the site → Settings → Reset test data → type the phrase → confirm. Record the backup sheet link in `docs/SETUP-VALUES.md`.
- [ ] **Step 5: 🧑 OWNER ACTION:** Events page → set the attendance master folder and the video master folder → **+ NEW EVENT** with the live form link → create the event.
- [ ] **Step 6: Live check (🧑 OWNER ACTION):**
  - In Drive, `Attendance master › <event name>` contains `<event name> Members` and one `<style> Attendance` per style.
  - Submit one test form response. Within 10 minutes (or right after **Sync now**) the dancer appears in Registered Dancers and in the attendance sheet.
  - Change the attendance master folder to a new empty folder; the event folder moves there.
- [ ] **Step 7:** Commit `docs: events deployed` and tell the owner the branch is ready to merge (`finishing-a-development-branch`).
