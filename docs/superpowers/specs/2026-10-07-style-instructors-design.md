# Spec — One Dance Style, Many Instructors; Instructors Per Style in Each Event

**Date:** 2026-10-07
**Status:** Design approved in chat by the owner (sections 1–3); this file awaits the owner's review.
**Live site:** in use. Nothing in this change deletes data. Old columns stay in the sheets.

---

## 1. Goal

Today each dance style has one default instructor and each class has one instructor. The club works differently:

- A dance style exists **once** (one "Locking", never two).
- An instructor can teach **several** styles (Kelvin teaches Locking and Popping).
- In an event, a style can have **several** instructors. They **take turns**: each class still has exactly one instructor, chosen from that style's instructors for the event.

Success looks like this: an admin creating an event picks the styles, picks the instructors under each style (only people who teach that style), then gives each class one of those instructors. Dancers see the same one-instructor-per-class calendar as today.

### Decisions already made with the owner

| Question | Decision |
|---|---|
| Several instructors on one style | Take turns, one instructor per class |
| How a class gets its instructor in the wizard | Drop-down per class in the SCHEDULE step, listing only that style's chosen instructors |
| Duplicate styles on the live site today | None. Only prevent new ones; no merging |
| Where the data lives | Approach A: two new columns, no new sheets |

---

## 2. Data

### 2.1 New columns

The table layer appends missing header columns automatically (`api/src/db/table.ts`, `ensureLoaded`), so adding a column to `SCHEMA` is enough. Old rows read `''`.

| Sheet (`api/src/db/schema.ts`) | Column | Shape | Meaning |
|---|---|---|---|
| `Instructors` | `styleIds` | comma-separated style ids (same encoding as `Events.styleIds`) | Styles this instructor teaches |
| `Events` | `styleInstructorsJson` | JSON object `{ [styleId]: instructorId[] }` | For each style in the event, the instructors who teach it, in the admin's order |

Shared types (`shared/src/types.ts`):

- `Instructor` gains `styleIds: string[]`.
- `EventItem` gains `styleInstructors: Record<string, string[]>` (decoded from the JSON column; `{}` when empty).
- `DanceStyle.defaultInstructorId` stays in the type and in the sheet so today's website keeps working during deployment, but nothing new reads or writes it once the new website is live.

`ClassSessions.instructorId` does not change.

### 2.2 One-time fill-in (migration)

`ensureStyleInstructors(ctx)` in a new `api/src/features/styleInstructors.ts`:

- Runs at most once. It's gated by the Script Property `STYLE_INSTRUCTORS_V1 = 'done'`, with a 6-hour CacheService key `mig:si1` checked first so most requests skip the property read.
- Runs inside the script lock, and only writes. It never clears or deletes anything.
- The router calls it for every request made with an **admin** token, before the handler. Dancer requests never trigger it.

Steps, in order:

1. **Instructor styles:** for each active instructor, `styleIds` = union of
   - styles whose `defaultInstructorId` is this instructor, and
   - `styleId` of every active class whose `instructorId` is this instructor.

   Only instructors whose `styleIds` is empty are written.
2. **Event style instructors:** for each active event with an empty `styleInstructorsJson`, for each `styleId` in `event.styleIds`:
   - the distinct `instructorId`s of that event's active classes of that style, in class order;
   - if there are none, `[style.defaultInstructorId]` when set;
   - otherwise `[]`.
3. **Empty class instructors:** every active class with `instructorId === ''` whose style has a `defaultInstructorId` gets that id. These classes already *display* that instructor today through the photo fallback (`web/src/lib/instructorPhotos.ts`), so nothing on screen changes.
4. Set the property, put the cache key, and bump `DATA_VERSION` once so cached calendars refresh.

Run twice, it changes nothing the second time.

---

## 3. Server rules (API)

| Route | Rule | Error |
|---|---|---|
| `styles.create`, `styles.update` | Name and each alias, lower-cased and trimmed, must not equal another active style's name or alias | `VALIDATION`: `A style named "<name>" already exists.` |
| `instructors.create`, `instructors.update` | Accept `styleIds`. Every id must be an active style. At least one is required. | `VALIDATION`: `Choose at least one dance style this instructor teaches.` |
| `events.create`, `events.update` | Accept `styleInstructors`. Keys must be a subset of the event's `styleIds`. Every listed instructor must teach that style (`instructor.styleIds` includes it). Every style in `styleIds` needs at least one instructor. Styles removed from the event drop their key. | `VALIDATION`: `<Instructor> doesn't teach <Style>.` / `Choose at least one instructor for <Style>.` |
| `sessions.create`, `sessions.update`, `sessions.batchUpsert` | When an instructor is **set or changed**, it must be in `event.styleInstructors[styleId]`. A class that already has an instructor outside the list may be saved with the same value unchanged. `sessions.create` without an instructor uses the first instructor in the list (replacing today's `style.defaultInstructorId` fallback at `api/src/features/sessions.ts:119` and `api/src/features/events.ts:356`). | `VALIDATION`: `<Instructor> isn't an instructor for <Style> in this event.` |
| `instructors.delete` | Also removes the instructor id from every event's `styleInstructors`. Classes keep their `instructorId`. | — |

Dancer bootstrap (`api/src/features/bootstrap.ts`, `getDancerBootstrap`) still returns the instructors of the dancer's classes. The `defaultInstructorId` addition there stays until the old website is gone, then it's removed.

---

## 4. Screens (web)

### 4.1 Instructors page (`web/src/features/masterdata/InstructorsPage.tsx`)

- The form gets **DANCE STYLES TAUGHT**: one tick button per active style (multi-select, at least one). Save stays disabled until one is ticked.
- Each instructor card lists their style chips.
- When an edit unticks a style that an active event still lists for this instructor, the form shows a non-blocking note: `Still teaching Locking in OCT MONTHLY CLASS.` Saving is allowed; existing events keep them.

### 4.2 Dance Styles page (`web/src/features/masterdata/StylesPage.tsx`)

- Remove the "Default instructor" field from the form and the card.
- Each style card shows `Instructors: Kelvin, Carmen` (from `instructor.styleIds`), or `No instructors yet` with a link to the Instructors page.
- A duplicate name or alias shows the server's message in the form.

### 4.3 Event wizard

Draft (`web/src/features/events/eventDraft.ts`):

- `EventDraft` gains `styleInstructors: Record<string, string[]>`.
- `ScheduledClass` gains `instructorId?: string`.
- Editing an existing event loads both from the event and its classes.

**STYLES step (`steps/StylesStep.tsx`)**
- A ticked style expands to show tick boxes for the instructors who teach it (from `instructors.list`, filtered by `styleIds`).
- If exactly one instructor teaches the style, they're ticked automatically.
- NEXT is disabled until every ticked style has at least one instructor. The blocking style is named: `Choose an instructor for Locking.`
- If no instructor teaches a ticked style, it says `No instructor teaches Locking yet — add it on the Instructors page.` with a link that opens `/admin/instructors` in a new tab, plus a reload button for the instructor list.
- A style created inline from an unknown form answer has no instructors, so the same message shows.
- Unticking a style clears its instructor list in the draft.

**SCHEDULE step (`steps/ScheduleStep.tsx`)**
- Each class row gets an instructor drop-down with only `draft.styleInstructors[styleId]`, defaulting to the first one.
- With one instructor, the row shows their name as plain text.
- When an instructor is unticked in STYLES, their classes switch to the first remaining instructor.

**REVIEW step (`steps/ReviewStep.tsx`)**
- Lists the instructors under each style and the instructor next to each class.
- `events.create`/`events.update` send `styleInstructors`, and the class payloads (`sessions` / `sessions.batchUpsert`) send each class's `instructorId`.

### 4.4 Calendar class editor (`web/src/features/classes/SessionEditor.tsx`) and Calendar page

- The instructor drop-down lists only `event.styleInstructors[session.styleId]`.
- If the class's current instructor isn't in that list, they appear as an extra option labelled `<name> (not in this event's list)`, so nothing changes silently.
- The `defaultInstructorId` hint at `SessionEditor.tsx:263` is removed.
- "+ ADD CLASS" on the Calendar page (`ClassesPage.tsx`, `addClass`) sends no instructor, so the server picks the first instructor in the event's list for that style.

### 4.5 Unchanged

- Dancer Home, day sheet, Studio and Me show one instructor per class exactly as today.
- `web/src/lib/instructorPhotos.ts` keeps its `defaultInstructorId` fallback until the old data path is retired (harmless, because step 3 of the fill-in gives every class an instructor).

---

## 5. Edge cases

| Case | Behaviour |
|---|---|
| Instructor stops teaching a style that events still list for them | Existing events and classes keep them. New wizard and Calendar choices no longer offer them. The Instructors page shows the "Still teaching…" note. |
| Instructor deleted | Removed from every event's `styleInstructors`. Classes keep the id; the editor shows them as "(not in this event's list)". |
| Style removed from an event in the wizard | Its `styleInstructors` key is dropped. Existing class handling for removed styles is unchanged (`ReviewStep` already deletes removed classes). |
| Last instructor of a style in an event is deleted | That style's list becomes empty. The wizard asks for an instructor next time the event is edited; Calendar "+ ADD CLASS" creates the class with no instructor. |
| Two admins save the same event | Existing version check → `VERSION_CONFLICT` → reload message. |
| Old website during deployment | Works: new fields are only added, and `defaultInstructorId` is still present in responses. |

---

## 6. Deployment order

1. **Server** (Apps Script). Run all API tests, `clasp push`, create a version, and point the live deployment `AKfycbz3z…` at it. Record the version in `docs/SETUP-VALUES.md`. The fill-in runs on the first admin request.
2. **Website**: push to `main` (Cloudflare Workers Builds). Confirm the build check ran (see the deploy-check note: re-trigger with an empty commit if it didn't).

---

## 7. Testing

**API (Vitest, `api/test/features/`)**
- Fill-in:
  - instructor styles come from defaults plus their classes;
  - event lists come from classes, falling back to the style default;
  - empty class instructors are filled;
  - a second run writes nothing;
  - dancer requests don't trigger it.
- Duplicate style name and duplicate alias are rejected on create and update; renaming a style to its own name is allowed.
- Instructor without styles is rejected.
- `events.create`/`update` rejects an instructor who doesn't teach the style and a style with no instructors.
- `sessions.update` rejects a new instructor outside the list, and accepts an unchanged out-of-list instructor.
- `sessions.create` without an instructor uses the first in the list.
- `instructors.delete` removes the id from events.

**Browser (Playwright, `web/e2e/`, phone and desktop)**
- Instructors page: tick styles, save sends `styleIds`; cards show style chips.
- Dance Styles page: no default-instructor field; card lists instructors; duplicate name shows the error.
- Wizard:
  - tick a style → its instructors appear;
  - a single instructor is auto-ticked;
  - NEXT is blocked without an instructor;
  - SCHEDULE has a per-class drop-down;
  - REVIEW lists them;
  - CREATE sends `styleInstructors` and class `instructorId`s.
- Calendar editor: drop-down limited to the event's list; an out-of-list current instructor is labelled.
- Full suite (`npx vitest run`, `npx playwright test`) and `npm run build` pass.

---

## 8. Out of scope

- Several instructors teaching one class together.
- Merging duplicate styles (none exist).
- Removing the `defaultInstructorId` column from the sheet.
