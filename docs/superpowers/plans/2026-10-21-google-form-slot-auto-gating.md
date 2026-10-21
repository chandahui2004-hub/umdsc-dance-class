# Automated Google Form Slot Gating & Dynamic Choice Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically modify the live Google Form checkbox options (removing full dance style choices) when slot capacities are reached, and close the form completely with a polite "Full House" message when all styles or a single-style event fill up.

**Architecture:** A port-based Form abstraction (`FormPort`) enables fast, isolated unit testing of form manipulation logic while `GasFormAdapter` connects to native Google Apps Script `FormApp` in production. Whenever slot capacity is checked during form sync or event updates, `syncGoogleFormSlotChoices` calculates available vs. full styles, updates checkbox choices and descriptions, or closes the form.

**Tech Stack:** TypeScript, Vitest, Google Apps Script FormApp API, React, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-10-21-google-form-slot-auto-gating-design.md`

## Global Constraints

- Never ask for or store the club Gmail password.
- Graceful degradation: If a form cannot be opened or is not linked, log a warning and continue without breaking dancer registration or attendance workflows.
- Single-style events or events with all styles full must set custom closed message: `"Sorry, we have reached FULL HOUSE for this event! Registration is now closed to prevent over-registration. Thank you for your interest and support! Keep dancing! — Universiti Malaya Dance Sport Club (UMDSC)"`.
- Multi-style events with some styles full must update question help text: `"⚠️ Note: [StyleName] has reached maximum capacity and is closed for registration. Please select from the remaining available styles."`
- Maintain TDD: write failing test, implement, verify pass, commit.

## Review Focus

1. **Non-linked form:** Event without a Google Form attached does not crash background sync or slot notifications.
2. **Re-opening on slot increase:** Raising slot limits or cancelling dancers restores choices and re-opens a previously closed form.
3. **Multi-style question matching:** Correctly identifies the styles checkbox item even if question title is "Classes", "Dance Styles", or "Style".
4. **FormApp permissions:** Graceful catch block around `FormApp` calls so external permission errors do not crash database reload.
5. **Dancer confirmation integrity:** Ensure confirmation emails and member sheet writes remain 100% intact.

---

### Task 1: FormPort Abstraction & Fake Implementation

**Files:**
- Modify: `api/src/ports.ts`
- Create: `api/test/fakes/fakeForm.ts`
- Create: `api/test/fakes/fakeForm.test.ts`

**Interfaces:**
- Produces: `FormPort`, `FormItemPort`, `FormChoiceItem`
- Consumes: `Ctx` in `api/src/ports.ts`

- [ ] **Step 1: Define `FormPort` interfaces in `api/src/ports.ts`**
  Add `FormPort` and `FormInstancePort` defining:
  - `getFormUrl(sheetId: string): string | null`
  - `openForm(idOrUrl: string): FormInstancePort | null`
  - `FormInstancePort`: `isAcceptingResponses(): boolean`, `setAcceptingResponses(val: boolean): void`, `setCustomClosedFormMessage(msg: string): void`, `getStyleQuestion(): FormQuestionPort | null`, `setChoices(questionId: string, choices: string[], helpText?: string): void`

- [ ] **Step 2: Create `FakeForm` and `FakeFormPort` in `api/test/fakes/fakeForm.ts`**
  Implements `FormPort` in-memory for testing, storing questions, choices, accepting state, and closed message.

- [ ] **Step 3: Write tests for `FakeForm` in `api/test/fakes/fakeForm.test.ts`**
  Verify setting choices, closing form, and toggling accepting state works in fake.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npm test -- test/fakes/fakeForm.test.ts` in `api`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add api/src/ports.ts api/test/fakes/fakeForm.ts api/test/fakes/fakeForm.test.ts
  git commit -m "feat(api): define FormPort and implement FakeForm for unit testing"
  ```

---

### Task 2: Core Form Gating Logic (`formGating.ts`)

**Files:**
- Create: `api/src/features/formGating.ts`
- Create: `api/test/features/formGating.test.ts`

**Interfaces:**
- Produces: `syncGoogleFormSlotChoices(ctx: Ctx, event: EventItem, members?: Member[]): FormGatingResult`
- Consumes: `FormPort`, `EventItem`, `Ctx`

- [ ] **Step 1: Write failing tests in `api/test/features/formGating.test.ts`**
  - Test 1: Single-style event reaches capacity → closes form with "FULL HOUSE" message.
  - Test 2: Multi-style event with 1 style full → removes full style from choices and sets warning in question description.
  - Test 3: Multi-style event with all styles full → closes form with "FULL HOUSE" message.
  - Test 4: Re-arming: when capacity drops below limit, restores removed choice and re-opens form.
  - Test 5: Missing form URL or invalid form ID degrades gracefully without error.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -- test/features/formGating.test.ts` in `api`
  Expected: FAIL (module not found)

- [ ] **Step 3: Implement `syncGoogleFormSlotChoices` in `api/src/features/formGating.ts`**
  Implements slot tallying per style, compares with `styleSlots`, determines available choices, modifies form via `ctx.form` (with try/catch fallback), and updates question help text.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npm test -- test/features/formGating.test.ts` in `api`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add api/src/features/formGating.ts api/test/features/formGating.test.ts
  git commit -m "feat(api): implement syncGoogleFormSlotChoices for dynamic choice removal and full house closure"
  ```

---

### Task 3: Hook Form Gating into Member Sync & Event Updates

**Files:**
- Modify: `api/src/features/eventImport.ts`
- Modify: `api/src/features/events.ts`
- Modify: `api/test/features/slotCapacityAlert.test.ts`

**Interfaces:**
- Produces: automated form gating trigger during `importEventMembers`, `events.sync`, and `events.update`
- Consumes: `syncGoogleFormSlotChoices`

- [ ] **Step 1: Write integration tests in `api/test/features/slotCapacityAlert.test.ts`**
  Verify that when `importEventMembers` or `events.update` detects slot capacity, `syncGoogleFormSlotChoices` is called alongside email alerts.

- [ ] **Step 2: Call `syncGoogleFormSlotChoices` in `checkAndNotifySlotCapacities` (`eventImport.ts`)**
  After sending emails (or safe test mode email), call `syncGoogleFormSlotChoices(ctx, event, members)`.

- [ ] **Step 3: Call `syncGoogleFormSlotChoices` in `events.update` (`events.ts`)**
  When an admin updates `styleSlots`, immediately sync the form options.

- [ ] **Step 4: Add `events.syncFormSlots` route in `events.ts`**
  Enables manual 1-click slot sync from the admin interface.

- [ ] **Step 5: Run tests to verify all pass**
  Run: `npm test -- test/features/slotCapacityAlert.test.ts` in `api`
  Expected: PASS

- [ ] **Step 6: Commit**
  ```bash
  git add api/src/features/eventImport.ts api/src/features/events.ts api/test/features/slotCapacityAlert.test.ts
  git commit -m "feat(api): hook Google Form slot gating into event import and updates"
  ```

---

### Task 4: Real Google Apps Script Form Adapter (`GasFormAdapter`)

**Files:**
- Create: `api/src/gas/form.ts`
- Modify: `api/src/gas/adapters.ts`
- Modify: `api/src/main.ts`

**Interfaces:**
- Produces: `GasFormAdapter` implementing `FormPort` using Google's `FormApp` and `SpreadsheetApp`
- Consumes: `GoogleAppsScript.Forms.FormApp`

- [ ] **Step 1: Implement `GasFormAdapter` in `api/src/gas/form.ts`**
  - Uses `SpreadsheetApp.openById(sheetId).getFormUrl()` to resolve linked form URL.
  - Uses `FormApp.openByUrl(url)` / `FormApp.openById(id)`.
  - Discovers style checkbox item, reads/writes choices, sets accepting responses and closed message.
  - Safe error handling: wraps all calls in try/catch.

- [ ] **Step 2: Export from `api/src/gas/adapters.ts` and instantiate in `buildCtx()` in `api/src/main.ts`**
  Provide `form: new GasFormAdapter()` on `ctx`.

- [ ] **Step 3: Run full api test suite and build**
  Run: `npm test` and `npm run build` in `api`
  Expected: PASS

- [ ] **Step 4: Commit**
  ```bash
  git add api/src/gas/form.ts api/src/gas/adapters.ts api/src/main.ts
  git commit -m "feat(gas): implement GasFormAdapter wrapping FormApp for live form editing"
  ```

---

### Task 5: Admin UI Controls & Manual Sync Button

**Files:**
- Modify: `web/src/features/events/EventModal.tsx`
- Modify: `web/src/features/settings/SettingsPage.tsx`
- Modify: `web/src/features/settings/AdminEmailManager.test.tsx`

**Interfaces:**
- Produces: Form URL field in EventModal, "Sync Form Slots" button, and status badges
- Consumes: `events.syncFormSlots` API route

- [ ] **Step 1: Add optional Form URL / ID in `EventModal.tsx`**
  Allows admins to explicitly specify or override the Google Form URL if desired.

- [ ] **Step 2: Add "Sync Google Form Slots" button in Event details and Settings**
  Allows admins to immediately push current slot limits to the live Google Form with 1 tap.

- [ ] **Step 3: Run web tests and build**
  Run: `npm test` and `npm run build` in `web`
  Expected: PASS

- [ ] **Step 4: Commit**
  ```bash
  git add web/src/features/events/EventModal.tsx web/src/features/settings/SettingsPage.tsx
  git commit -m "feat(web): add Google Form URL field and manual slot sync trigger"
  ```

---

### Task 6: Deploy to Google Apps Script & Live Verification

**Files:**
- GAS Deployment: `@72`

- [ ] **Step 1: Deploy to Google Apps Script**
  Run `clasp push -f`, create version 72 (`clasp version "v72: Automated Google Form slot gating and dynamic choice removal"`), and deploy to deployment `AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA`.

- [ ] **Step 2: Live Verification with test payload**
  Trigger live test endpoint to verify `FormApp` resolves the form, removes full choices, and closes on full house.

- [ ] **Step 3: Commit and push to `main`**
  ```bash
  git push origin main
  ```
