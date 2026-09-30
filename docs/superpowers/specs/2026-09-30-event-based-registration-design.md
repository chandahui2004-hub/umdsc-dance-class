# UMDSC — Event-Based Registration Design

- **Date:** 2026-09-30
- **Status:** Draft, awaiting owner review
- **Supersedes** these parts of `2026-09-28-umdsc-dance-class-system-design.md`: the `MemberMonths` table and every "month" key in §5, the monthly import flow in §9.3, month-based session generation in §10, and the month switcher in §13. Everything else in that spec still applies.

---

## 1. Purpose

Registration is no longer "one form per month". The club runs **events** (a monthly class, a trial class, a workshop), each with its own Google Form. Every admin page and every dancer view is organised by **event**, not by calendar month.

**Success criteria**
1. An admin sets up a new event from a form link in a few minutes, without opening Google Sheets.
2. Two events whose dates overlap, even with the same dance style, never mix dancers, classes, attendance or media.
3. When nobody registers, the 10-minute auto-sync costs about one small read per active event. It never holds the write lock.
4. Old personal data can be wiped after 3 years without breaking old attendance head-counts.

## 2. Decisions (agreed with the owner, 2026-09-30)

| # | Decision |
|---|---|
| E1 | An **event** = one Google Form response sheet + a name + a type + a date range + a set of dance styles + a class schedule per style. |
| E2 | Event names are **unique, ignoring case**. Every page picks events by name. |
| E3 | Event date ranges **may overlap**. |
| E4 | Existing month-based data is **test data**: back it up, clear it, start fresh. No migration. |
| E5 | Drive layout: **one folder per event** under the attendance master folder, holding the event's Members sheet and one attendance sheet per style. |
| E6 | Events are **editable** (rename, dates, styles, form link) and **archived manually**. Archived events stop syncing and are read-only, but stay viewable. |
| E7 | Auto-sync runs every **10 minutes**, plus a **Sync now** button. |
| E8 | The **Today** page shows today's classes from **all active events**. Other admin pages follow an **event picker**. |
| E9 | An event with **one style** and a form with no class-choice question puts every registrant in that style. |
| E10 | Dancers log in as before (name + matric). They see only their own events and styles, including archived events. |
| E11 | Class Lead roles stay **style-scoped**, and apply in every event. |
| E12 | **Retention:** 3 years after the end date of the last event a dancer registered for, their personal details are wiped. Attendance ticks stay under "Removed dancer". The admin runs the check and confirms. Nothing is automatic. |
| E13 | When the attendance or video **master folder link changes**, each event's existing folder is **moved** into the new master folder. Missing folders are created. |

## 3. Data model

All tabs are in `UMDSC_System`. The existing rules still apply: columns found by header name; common columns `id, version, updatedBy, updatedAt, active`; dates as `YYYY-MM-DD` plain text.

### 3.1 New tab `Events`

| Column | Meaning |
|---|---|
| `name` | Display name, e.g. `OCT MONTHLY CLASS` |
| `nameKey` | `name` lower-cased with spaces collapsed. Used for the uniqueness check |
| `type` | `monthly` / `trial` / `workshop` / `other` |
| `startDate`, `endDate` | Event range, inclusive |
| `sourceSheetId`, `sourceTab` | The form response sheet and the tab that was read |
| `columnMapJson`, `classIndex` | Confirmed column mapping (same shape as today's import) |
| `styleIds` | Comma list of the styles in this event |
| `folderId` | Event folder under the attendance master folder |
| `videoFolderId` | Event folder under the video master folder (blank until first upload) |
| `membersSpreadsheetId` | The event's Members sheet |
| `status` | `active` / `archived` |
| `sourceRowCount`, `sourceLastRowHash` | Used by the cheap change check (§6.1) |
| `lastSyncAt`, `lastSyncError`, `memberCount` | Shown on the event card |

### 3.2 Changed tabs

| Tab | Change |
|---|---|
| `ClassSessions` | `month` → `eventId`. A class is keyed by `eventId + styleId + seq`. `date` must be inside the event range. |
| `AttendanceSheets` | `month` → `eventId` |
| `Videos`, `Music` | `month` → `eventId` |
| `MemberIndex` | `months`, `lastMonth` → `eventIds` (comma list), `lastEventEnd` (latest `endDate` among their events; drives retention) |

### 3.3 Removed / unused

- The `MemberMonths` tab is removed. `Events` replaces it.
- `DanceStyles.attendanceFolderId` and `DanceStyles.videoFolderId` are no longer used. Folders come from the master folders and the event. The columns may stay but are ignored.

### 3.4 Settings keys

- `defaultAttendanceFolderId`: the **attendance master folder** (unchanged key).
- `defaultVideoFolderId`: the **video master folder** (unchanged key).

## 4. Drive layout

```
Attendance master folder
└─ OCT MONTHLY CLASS/            (Events.folderId)
   ├─ OCT MONTHLY CLASS Members  (Events.membersSpreadsheetId)
   ├─ Hip Hop Attendance
   └─ Popping Attendance

Video master folder
└─ OCT MONTHLY CLASS/            (Events.videoFolderId)
   └─ 2026-10-08 Popping Class 1/
      └─ Music/
```

- The attendance sheet layout inside a file is unchanged. Row 1 holds hidden machine keys, row 2 holds labels, then one row per member with `/` for present.
- **Master folder change (E13)**, for every event, active and archived:
  - If the new master already has a folder with the event's name, use it.
  - Otherwise, if the event's current folder exists, move it into the new master.
  - Otherwise, create a new folder and move the event's Members sheet and attendance sheets into it.
  - Update `Events.folderId` / `videoFolderId`.
- **Renaming an event** renames its Drive folders. The sheet files keep their names.

## 5. Admin screens

### 5.1 Events page (replaces "Import Registrations")

- **Header:** the attendance master folder and video master folder links, each with a change button (moved here from the Attendance page).
- **Active events:** a card per event showing name, type, dates, styles, dancer count, form link, last sync time and any sync error, with the buttons **Open · Edit · Sync now · Archive**.
- **Archived events:** the same cards, read-only, with **Unarchive**.
- **+ NEW EVENT** opens the setup (§5.2).

### 5.2 New event setup (5 steps)

1. **Form link:**
   - The admin pastes the response sheet link.
   - The server reads it and shows the registration count and the matched columns. Each field can be changed with a dropdown.
   - The link checks are the same as today: invalid link, no access, wrong kind, read-only.
2. **Event details:**
   - Name, type, and the date range on the existing day-level range calendar.
   - A name clash (ignoring case) is rejected here.
3. **Dance styles:**
   - A checklist of all active styles. Styles found in the form's class answers are pre-ticked.
   - Unmatched class answers are listed with **Add as new style**.
   - **+ New style** (name, colour, other spellings) creates a style without leaving the setup.
   - At least one style is required.
4. **Class schedule:**
   - The current calendar screen, limited to the chosen styles and to days inside the range.
   - Click days to add or remove classes, auto-fill by weekday, edit times.
   - No limit on the number of classes. Every style starts empty.
   - A style with zero classes is allowed; its attendance sheet has no class columns until classes are added.
5. **Review and create:**
   - A summary, then **CREATE EVENT**.
   - Blocked if no attendance master folder is set, with a link to set it.
   - Runs `events.create` (§7).

### 5.3 Editing an event

The same steps, pre-filled:
- **Rename:** renames the Drive folders.
- **Change dates:** classes outside the new range are listed, and the save is blocked until they are deleted or moved. A new `endDate` recalculates `MemberIndex.lastEventEnd` for that event's members in the same single write.
- **Add a style:** creates its attendance sheet.
- **Remove a style:** hides it in this event. Its sheet and ticks are kept, and it is not deleted.
- **Replace the form link:** members already imported stay. The next sync adds anyone new from the new sheet.

### 5.4 Event picker

- A picker at the top of the admin shell, on phone and desktop. The choice is remembered in the browser (`localStorage` key `umdsc:currentEvent`).
- It defaults to the active event with the latest `startDate`.
- It lists active events first, then archived ones.
- Used by: Registered Dancers, Attendance, Media, Calendar.

### 5.5 Page changes

| Page | Change |
|---|---|
| Today | Classes on today's date from all active events. Each card is labelled with the event name. Shows "No classes today" when empty. |
| Calendar | The picked event's classes across its range. Add, edit, move and delete work as today. The old "generate month" action is removed. |
| Attendance | The month arrows are replaced by the event picker. Style tabs show only the event's styles. The Edit / Submit / Cancel flow is unchanged. The master-folder panel moves to the Events page. |
| Media | Class cards for the picked event and style. Uploads go to `Video master › Event › <date> <Style> Class N`. |
| Registered Dancers | The picked event's members. Style filter, search and CSV export as today. The CSV file name uses the event name. |
| Settings | Adds **Data retention** (§8) and **Reset test data** (§9). |

## 6. Registration sync

### 6.1 Auto-sync (every 10 minutes)

- While any admin page is open and visible, the browser calls `events.autoSync` every 10 minutes and once on page load.
- **Shared throttle:**
  - The server keeps a per-event "last checked" time in CacheService (`sync:check:<eventId>`, TTL 10 min).
  - Events checked less than 10 minutes ago are skipped, so any number of open tabs cost one check per event per 10 minutes.
- **Cheap check** per active event, with no lock and no writes:
  - Read the source sheet's last row number and the display values of its last row.
  - If `lastRow == sourceRowCount` and the hash of the last row equals `sourceLastRowHash`, stop.
- **On change**, under the script lock:
  - Re-read the whole form and build members (the existing `buildMembers` logic, merging duplicate matrics).
  - **Append** members not yet in the Members sheet.
  - **Append** their rows to each style attendance sheet they chose.
  - **Upsert MemberIndex in one write**, using a new `Table.upsertMany` that rewrites the tab body with a single `setValues`.
  - Update the event's sync columns and bump `DATA_VERSION` **once**.
- **Never removes.** A member missing from the form is flagged `removed-from-form` in the Members sheet.
- A read error on one event is saved to `lastSyncError`, and the other events continue.
- Lock busy: skip quietly, and the next round retries.

### 6.2 Sync now

- `events.sync {id}` always does a full re-read, which also catches edits to older rows.
- Limited to once per minute per event (`sync:force:<eventId>`, TTL 60 s). A second press inside a minute returns the last result with a message.

### 6.3 Archived events

Never auto-synced. **Sync now** is hidden.

## 7. API changes

All actions keep the existing envelope, token and lock rules.

| Action | Permission | Notes |
|---|---|---|
| `events.list {includeArchived}` | `members.view` | All event rows |
| `events.previewSource {sheetUrl}` | `members.import` | Replaces `members.previewImport`: headers, column map, scores, class column, style counts, unknown class tokens, warnings |
| `events.create {name, type, startDate, endDate, sheetUrl, columnMap, classIndex, styleIds, sessions[]}` | `members.import` | Validates, creates the folder, Members sheet, sessions, attendance sheets and first import, in one locked call |
| `events.update {id, version, …}` | `members.import` | §5.3 rules |
| `events.archive` / `events.unarchive {id, version}` | `members.import` | |
| `events.autoSync {}` | `members.import` | §6.1. Not a router "write" route; takes the lock itself only when there is a change |
| `events.sync {id}` | `members.import` | §6.2 |
| `events.recreateFolder {id}` | `members.import` | For a folder deleted by hand |
| `sessions.list {eventId, styleId?}` | `calendar.view` | Replaces the month parameter |
| `sessions.today {}` | `calendar.view` | Today's classes across active events |
| `sessions.create/update/cancel/delete/batchUpsert` | `sessions.edit` | `month` → `eventId`; the date must be inside the event range |
| `members.list {eventId, styleId?}`, `members.update {eventId, …}` | as today | |
| `attendance.get/mark/export {eventId, styleId}`, `attendance.ensureSheets {eventId}` | as today | |
| `videos.*`, `music.*` | as today | `month` → `eventId`; `videos.targetFolder` returns the video master id + event folder name + class folder name |
| `settings.setLink` for either master folder | `settings.edit` | Also runs the folder move in §4 |
| `retention.preview {}` / `retention.apply {matricKeys[]}` | `settings.edit` | §8 |
| `admin.resetTestData {confirm: 'DELETE TEST DATA'}` | `settings.edit` | §9 |

**Removed:** `members.previewImport`, `members.confirmImport`, `members.resync`, `members.autoSync`, `members.sync`, `members.importedMonths`, `sessions.generateMonth`.

**Bootstrap:**
- `admin.bootstrap` returns `events` instead of `months`.
- `dancer.bootstrap` returns the dancer's `events` (id, name, type, dates, status) and builds chunks per `(eventId, styleId)`, cached as today.

## 8. Data retention (3 years)

- **Due:** a dancer whose `MemberIndex.lastEventEnd` is more than 3 years before today.
- **Settings › Data retention:**
  - **Check** calls `retention.preview`, which lists due dancers: name, matric, last event and its end date. It also lists the **form response sheets** of events whose dancers are all due.
  - The system never edits the club's forms. The admin deletes old form responses themselves.
- **Wipe** (`retention.apply`, under the lock, after the admin confirms), for each chosen dancer:
  - In every Members sheet and attendance sheet: `memberId` → `X-<random>`, name → `Removed dancer`, and matric, contact, email, gender and nationality blanked. **Ticks stay.**
  - MemberIndex: personal fields blanked, row deactivated. The person can log in again only by registering again.
  - MemberRoles: deactivated.
  - AuditLog: `target` / `detail` that contain their matric are blanked.
  - Each wipe is logged as `retention.apply` with a count only, never names.
- The backup spreadsheet from §9 contains test data only, so it is not covered.

## 9. Reset test data (one time)

- **Settings › Reset test data**, admin only. The admin must type `DELETE TEST DATA`.
- **Steps:**
  1. Copy `UMDSC_System` to `UMDSC_System backup YYYY-MM-DD` in the DB folder.
  2. Clear the bodies of `ClassSessions`, `MemberIndex`, `AttendanceSheets`, `Videos`, `Music`, `Sections`.
  3. Delete the `MemberMonths` tab.
  4. Rewrite the headers of the changed tabs to the new columns (§3.2) and create `Events`.
  5. Bump `DATA_VERSION`.
  6. Clear the cached bootstrap and attendance entries by bumping versions.
- **Kept:** `Settings`, `LinkHistory`, `DanceStyles`, `Instructors`, `Admins`, `Roles`, `RolePermissions`, `MemberRoles`, `AuditLog`.
- **Drive files are not touched.** The owner deletes old test sheets by hand.
- This is the only place the system physically clears rows. Everything else still soft-deletes.
- The button disables itself once `Events` exists and no old-format tabs remain.

## 10. Errors

| Situation | Behaviour |
|---|---|
| Form link lost access / deleted | The event card shows `lastSyncError` with fix-it text naming the club Gmail. Other events keep syncing. |
| Duplicate event name | Step 2 shows "An event called X already exists." |
| No attendance master folder | Step 5 is blocked with a link to set it on the Events page. |
| Event folder deleted by hand | The card shows "Folder missing" with a **Recreate** button. |
| Date change leaves classes outside the range | The save is blocked; the classes are listed. |
| Server busy during auto-sync | Skipped silently; retried next round. |

## 11. Frontend structure

- `web/src/features/events/`:
  - `EventsPage.tsx`, `EventCard.tsx`
  - `EventWizard.tsx` (step shell)
  - `steps/FormLinkStep.tsx`, `steps/EventDetailsStep.tsx`, `steps/StylesStep.tsx`, `steps/ScheduleStep.tsx`, `steps/ReviewStep.tsx`

  The range calendar and schedule calendar are moved out of today's 1,500-line `ImportWizard.tsx` into these step files. `ImportWizard.tsx` is then deleted.
- `web/src/features/events/useCurrentEvent.ts`: the picker state (`localStorage`) + the events query.
- `web/src/components/ui/EventPicker.tsx`: used by `DesktopShell` and `PhoneShell`.
- `web/src/lib/useEventAutoSync.ts` replaces `useRegistrationAutoSync.ts`. It runs on every admin page, not just Attendance.
- `web/src/features/settings/RetentionPanel.tsx`, `ResetTestDataPanel.tsx`.

## 12. Testing

**API unit / handler tests (Vitest, fakes):**
- The cheap check with no change: zero writes, no lock taken.
- One new registration: exactly one MemberIndex write, one `DATA_VERSION` bump, rows appended to the right attendance sheets.
- The 10-minute shared throttle; the Sync now 60-second limit.
- Two overlapping events with the same style: separate sessions, members, attendance sheets and media.
- Dancer scoping: only their events and styles, including archived events.
- `events.create` / `events.update` validation: unique name, dates vs classes, at least one style, removing a style keeps its sheet.
- Archive stops auto-sync.
- Master folder change moves event folders; a missing folder is created.
- Retention: due list; the wipe keeps ticks, blanks personal fields, replaces `memberId`, deactivates MemberIndex and MemberRoles.
- Reset: backup made, old tabs cleared, kept tabs untouched, refuses without the exact phrase.
- A single-style event whose form has no class column puts everyone in that style.

**E2E (Playwright, mocked API):**
- The 5-step new event setup.
- The event picker switching Registered Dancers, Attendance and Media.
- Archive and unarchive.
- The Today page listing classes from two events.
- Retention confirm dialog.

**Live check:** create one real event from the live form, then confirm the event folder, Members sheet and attendance sheets appear under the master folder and a new form response shows up within 10 minutes.

## 13. Out of scope

- Dancer Home calendar, class details sheet and Music Studio. These stay plan tasks 27–31, updated to use an **event switcher** instead of a month switcher.
- Automatic (timer-driven) retention or sync.
- Editing or deleting Google Form responses.
- Migrating the current test data.
- Per-event Class Lead scoping.
