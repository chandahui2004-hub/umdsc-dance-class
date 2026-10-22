# Google Form Slot Auto-Gating Fix, Event Deletion & Inline Instructor Creation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Supervision & Skills:** This plan is executed under supervisor governance. The following specialized agent skills are active and must be leveraged across tasks:
> - **`subagent-driven-development`**: For task delegation and independent reviewer gating between tasks.
> - **`test-driven-development`**: For all backend logic and route handling (red-green-refactor loop).
> - **`systematic-debugging`**: For investigating any Google Form API, Drive API, or state discrepancies.
> - **`verification-before-completion`**: For running full test suites and verifying evidence before marking any task complete.
> - **`ui-styling` & `design-system`**: For adhering to the retro neon pixel styling tokens (`--night-1`, `--night-2`, `--neon-cyan`, `--neon-gold`, `--neon-red`, `--outline`, `PixelButton`).
> - **`webapp-testing`**: For component and UI interaction verification.
> - **`code-simplifier`**: For streamlining implementations without compromising features.
> - **`code-review`**: For whole-plan verification before deployment.

**Goal:** Fix Google Form edit URL persistence and FormApp auto-gating for slot limits, restore the authentic UMDSC club logo, remove test suite artifacts and symbols, add inline instructor creation inside the event wizard, and implement permanent event deletion with double-confirmation protection.

**Architecture:**
1. **Google Form URL & ID Persistence:** Add `formUrl` and `formId` to `EventItem`, `SCHEMA.Events`, `defaultCodecs.events`, and handle in `events.create` and `events.update`. Update `gas/form.ts` to extract Form ID and prioritize `FormApp.openById(formId)` over `openByUrl`, preventing GAS edit URL failures.
2. **Club Logo & UI Cleanliness:** Copy genuine club logo `web/public/logo-original.png` back to `web/public/logo.png` and update `LogoBadge.tsx` so the official emblem is preserved while retro pixel icons continue powering labels and controls. Strip temporary test suite UI from `SettingsPage.tsx` and remove `⚡` emoji from `EventCard.tsx`.
3. **Inline Instructor Creation:** Embed a rapid "+ NEW INSTRUCTOR" creation panel inside `InstructorPicker` in `web/src/features/events/steps/StylesStep.tsx` taking Name, Contact Number, and Email, automatically linking the instructor to the current dance style and selecting them immediately.
4. **Permanent Event Deletion:** Implement `events.delete` endpoint that moves linked Google Drive folders/sheets to Trash, deactivates event and sessions, cleans up member index event links, and protects execution on `EventCard.tsx` with a retro neon double-confirmation warning modal.

**Tech Stack:** TypeScript, React, Tailwind CSS, Google Apps Script (FormApp, DriveApp, SpreadsheetApp), Vitest.

**Spec / Requirements:**
- Truncated prompt & user testing on event `testing1`: Form Edit Link `https://docs.google.com/forms/d/11ZZM4qFUc1jj9LSqUXSzbr0y2-e4xziO8w4YSc4ze0I/edit`, Sheet `https://docs.google.com/spreadsheets/d/1Kxx4-PUobMTlddKbvMiNTaGPmM2DrpPtkoF4HtneDMg/edit?resourcekey=&gid=313706257#gid=313706257`.
- Grill-Me locked decisions:
  1. Permanent deletion: Deletes database records + trashes linked Drive folders and sheets.
  2. Inline instructor creation: Full details (Name, Contact Number, Email) + auto-assigned to active style.

---

## Global Constraints

- Never ask for or store the club Gmail password.
- Club logo emblem must remain the official original UMDSC logo (`logo-original.png` -> `logo.png`). Pixel icons remain active for buttons, nav, and status icons.
- Google Form slot auto-gating must never throw fatal errors if form ID is inaccessible or permissions fail; log warning and allow sync to proceed gracefully.
- Permanent event deletion must require double confirmation from admin to prevent accidental data loss.
- Maintain full test coverage (Red-Green-Refactor) and zero linter warnings.

---

## Review Focus

1. **Google Form Edit Link Extraction:** Form URLs with `/edit`, `/viewform`, or bare IDs must all correctly parse to Form ID and open via `FormApp.openById(formId)`.
2. **Event Form URL Persistence:** When creating or updating an event with `formUrl`, reloading the event must retain `formUrl` and `formId`.
3. **Drive Trashing Permissions:** If moving a folder or spreadsheet to Drive trash fails (e.g. external ownership), `events.delete` logs a warning and proceeds with database cleanup rather than failing halfway.
4. **Instructor Auto-Assignment:** Creating a new instructor inline immediately associates them with `draft.styleInstructors[style.id]` without requiring a page refresh or wizard navigation.
5. **No Visual Regressions in Neon Design:** All new modal and form elements must strictly utilize the existing neon pixel design tokens and pixel buttons.

---

### Task 1: Form URL & ID Persistence & FormApp Edit Gating Fix

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `api/src/db/schema.ts`
- Modify: `api/src/db/db.ts`
- Modify: `api/src/features/events.ts`
- Modify: `api/src/features/formGating.ts`
- Modify: `api/src/gas/form.ts`
- Modify: `api/test/features/slotCapacityAlert.test.ts`
- Modify: `api/test/fakes/fakeForm.test.ts`

**Interfaces:**
- Produces: `formUrl?: string; formId?: string;` on `EventItem`
- Consumes: `FormPort.openForm(idOrUrl: string)` in `api/src/ports.ts`

- [ ] **Step 1: Write failing tests for formUrl/formId persistence & ID extraction in `api/test/features/slotCapacityAlert.test.ts`**
  Verify that `events.create` and `events.update` persist `formUrl` and extract `formId`, and that `syncGoogleFormSlotChoices` opens the form using `formId` extracted from `https://docs.google.com/forms/d/11ZZM4qFUc1jj9LSqUXSzbr0y2-e4xziO8w4YSc4ze0I/edit`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -- test/features/slotCapacityAlert.test.ts` in `api`
  Expected: FAIL (missing fields in event item / form not opened with edit URL)

- [ ] **Step 3: Update `shared/src/types.ts` to include `formUrl?: string; formId?: string;` in `EventItem`**

- [ ] **Step 4: Update `api/src/db/schema.ts` to add `'formUrl'`, `'formId'` to `SCHEMA.Events`**

- [ ] **Step 5: Update `api/src/db/db.ts` to serialize/deserialize `formUrl` and `formId` in `defaultCodecs.events`**

- [ ] **Step 6: Update `api/src/features/events.ts` to persist `formUrl` and `formId` in `events.create` and `events.update`**
  Extract Form ID via regex `/forms\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/` or accept raw alphanumeric ID.

- [ ] **Step 7: Update `api/src/gas/form.ts` and `api/src/features/formGating.ts`**
  In `gas/form.ts`, extract Form ID from any URL matching `/forms\/d\/([a-zA-Z0-9_-]+)/` and call `FormApp.openById(formId)` with fallback to `FormApp.openByUrl`.
  In `formGating.ts`, resolve `formId = event.formId || extractFormId(event.formUrl) || ...` and open with resolved ID.

- [ ] **Step 8: Run test to verify it passes**
  Run: `npm test -- test/features/slotCapacityAlert.test.ts` in `api`
  Expected: PASS

- [ ] **Step 9: Commit**
  ```bash
  git add shared/src/types.ts api/src/db/schema.ts api/src/db/db.ts api/src/features/events.ts api/src/features/formGating.ts api/src/gas/form.ts api/test/
  git commit -m "feat: persist google form edit url and robustly extract form id for auto-gating"
  ```

---

### Task 2: Restore Original Club Logo & Clean Up Test UI

**Files:**
- Modify: `web/public/logo.png` (copy from `web/public/logo-original.png`)
- Modify: `web/src/components/ui/LogoBadge.tsx`
- Modify: `web/src/features/settings/SettingsPage.tsx`
- Modify: `web/src/features/events/EventCard.tsx`

**Interfaces:**
- Produces: Official UMDSC emblem display in `LogoBadge.tsx`
- Consumes: Clean `SettingsPage` without test suite panel

- [ ] **Step 1: Restore official club logo file**
  Copy `web/public/logo-original.png` to `web/public/logo.png`.
  Verify `web/src/components/ui/LogoBadge.tsx` uses `/logo.png`.

- [ ] **Step 2: Remove Slot Capacity Alert Test Suite from `web/src/features/settings/SettingsPage.tsx`**
  Remove the `SLOT CAPACITY ALERT & TEST SUITE` container and associated test mutations (`setTestOverrideMutation`, `sendTestAlertMutation`, `testTargetEmail`, `slotAlertTestEmail`, `isTestOverrideActive`).

- [ ] **Step 3: Remove `⚡` emoji from `EventCard.tsx`**
  In `web/src/features/events/EventCard.tsx`, change `⚡ SYNC FORM` to `SYNC FORM`.

- [ ] **Step 4: Verify frontend builds without errors**
  Run: `npm run build` in `web`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add web/public/logo.png web/src/components/ui/LogoBadge.tsx web/src/features/settings/SettingsPage.tsx web/src/features/events/EventCard.tsx
  git commit -m "style: restore authentic club logo and remove slot capacity test suite"
  ```

---

### Task 3: Inline Add Instructor in Event Wizard

**Files:**
- Modify: `web/src/features/events/steps/StylesStep.tsx`
- Test: `web/test/` (or verify via unit/browser test)

**Interfaces:**
- Produces: Inline instructor creation component within `InstructorPicker`
- Consumes: `call('instructors.create', ...)`

- [ ] **Step 1: Add "+ NEW INSTRUCTOR" toggle and form state in `InstructorPicker`**
  In `web/src/features/events/steps/StylesStep.tsx`:
  - Add state for `showNewInstructor: boolean`, `instName: string`, `instContact: string`, `instEmail: string`, `instError: string | null`.
  - Add `useMutation` calling `instructors.create` with payload:
    ```ts
    {
      name: instName.trim(),
      contact: `${instContact.trim()}${instEmail.trim() ? ' | ' + instEmail.trim() : ''}`,
      styleIds: [style.id]
    }
    ```
  - On success:
    1. Invalidate `['instructors']` query.
    2. Auto-tick new instructor for `style.id`: call `onToggle(created.id)` if not already selected.
    3. Reset input states and close inline panel.

- [ ] **Step 2: Implement the inline creation UI in `InstructorPicker`**
  Render button `+ NEW INSTRUCTOR` (secondary pixel button).
  When open, render pixel inputs for Name, Contact Number, and Email, plus `[ CANCEL ]` and `[ ADD INSTRUCTOR ]` buttons.

- [ ] **Step 3: Run web tests and verify type check**
  Run: `npm run build` in `web` and run web tests
  Expected: PASS

- [ ] **Step 4: Commit**
  ```bash
  git add web/src/features/events/steps/StylesStep.tsx
  git commit -m "feat: add inline instructor creation inside event wizard styles step"
  ```

---

### Task 4: Permanent Event Deletion with Double-Confirmation Warning

**Files:**
- Modify: `api/src/ports.ts`
- Modify: `api/src/gas/adapters.ts`
- Modify: `api/test/fakes/fakeDrive.ts`
- Modify: `api/src/features/events.ts`
- Create: `api/test/features/eventDelete.test.ts`
- Modify: `web/src/features/events/EventCard.tsx`

**Interfaces:**
- Produces: `events.delete` route in backend (`api/src/features/events.ts`)
- Consumes: `ctx.drive.trashFolder`, `ctx.drive.deleteFile`, `ctx.db.events.deactivate`

- [ ] **Step 1: Write failing test in `api/test/features/eventDelete.test.ts`**
  Test calling `events.delete` with `{ id: eventId }`:
  - Verifies event is deactivated / deleted from `ctx.db.events`.
  - Verifies linked sessions and attendance sheets are cleaned up.
  - Verifies memberIndex references are cleared.
  - Verifies `ctx.drive.trashFolder` was called on `event.folderId` and `event.videoFolderId`.
  - Verifies `ctx.drive.deleteFile` was called on `event.membersSpreadsheetId`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -- test/features/eventDelete.test.ts` in `api`
  Expected: FAIL (`events.delete` not implemented)

- [ ] **Step 3: Add `trashFolder(folderId: string): boolean` to `DrivePort` in `api/src/ports.ts`**
  Implement in `api/src/gas/adapters.ts` (`DriveApp.getFolderById(folderId).setTrashed(true)`) and `api/test/fakes/fakeDrive.ts`.

- [ ] **Step 4: Implement `events.delete` handler in `api/src/features/events.ts`**
  - Trashes linked Google Drive folders and files with `try/catch` safety.
  - Deactivates or removes sessions and attendance sheets.
  - Updates member index entries to remove `eventId`.
  - Deactivates event in `ctx.db.events`.
  - Logs audit entry `'events.delete'`.

- [ ] **Step 5: Run backend tests to verify they pass**
  Run: `npm test -- test/features/eventDelete.test.ts` in `api`
  Expected: PASS

- [ ] **Step 6: Implement Double-Confirmation Warning Modal in `web/src/features/events/EventCard.tsx`**
  - Add `[ DELETE EVENT ]` button with red neon style.
  - Add state `showDeleteConfirm: boolean` and `deleteEventMutation`.
  - Render retro warning modal:
    - Title: `⚠️ PERMANENT DELETE WARNING`
    - Warning text explaining that all dancer records, attendance sheets, sessions, and linked Google Drive folders will be permanently deleted / trashed.
    - Buttons: `[ CANCEL ]` and `[ CONFIRM PERMANENT DELETE ]` (red danger variant).
  - On delete success: invalidate `['events']` and `['sessions']`.

- [ ] **Step 7: Run web tests and verify build**
  Run: `npm test` in `web` and `npm run build` in `web`
  Expected: PASS

- [ ] **Step 8: Commit**
  ```bash
  git add api/src/ports.ts api/src/gas/adapters.ts api/test/fakes/fakeDrive.ts api/src/features/events.ts api/test/features/eventDelete.test.ts web/src/features/events/EventCard.tsx
  git commit -m "feat: implement permanent event deletion with double-confirmation warning"
  ```

---

### Task 5: End-to-End Verification, Build & Deployment (GAS Version 75)

**Files:**
- Modify: `docs/SETUP-VALUES.md`

**Interfaces:**
- Produces: Google Apps Script Version 75 deployment & verified frontend build
- Consumes: All completed tasks 1-4

- [ ] **Step 1: Run full test suite across workspace**
  Run `npm test` in `api/` (all unit and integration tests).
  Run `npm test` in `web/` (all frontend tests).
  Verify 100% pass rate.

- [ ] **Step 2: Build API distribution bundle**
  Run `npm run build` in `api/`.
  Verify `api/dist/Code.js` and `api/dist/appsscript.json` are properly generated.

- [ ] **Step 3: Push and deploy to Google Apps Script (Version 75)**
  Run `npx clasp push` in `api/`.
  Run `npx clasp version "Version 75: Form edit URL persistence, full event deletion, inline instructor add, club logo restore"` in `api/`.
  Run `npx clasp deploy -i AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA -d "Version 75"`.

- [ ] **Step 4: Build web bundle**
  Run `npm run build` in `web/`.

- [ ] **Step 5: Verify live deployment & update `docs/SETUP-VALUES.md`**
  Perform health check on API endpoint.
  Update `docs/SETUP-VALUES.md` with Version 75 details.

- [ ] **Step 6: Commit and push git changes**
  ```bash
  git add docs/SETUP-VALUES.md
  git commit -m "chore: deploy Version 75 with form edit sync, full event delete, and inline instructor creation"
  git push origin main
  ```
