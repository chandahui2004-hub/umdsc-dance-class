# Instructor Colors, Event Class Rule & Slot Capacity Alert Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Propagate instructor signature colors to calendar markers and class badges, enforce a minimum of 1 class per selected dance style in Event Setup, and add compulsory slot capacity per style with automated single-dispatch email alerts to admins and class leads when full.

**Architecture:** Update frontend color utilities to support hex values and resolve instructor signature colors across admin/dancer calendar views and class cards. Add validation in event draft and backend routes to require at least one session per ticked style. Extend event schema with `styleSlotsJson` and `notifiedFullStylesJson`, adding a compulsory slot input per style in the Event Wizard and triggering email alerts via `ctx.mail.sendEmail` upon capacity detection during sync.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, TanStack Query, Cloudflare Workers / Google Apps Script API, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-16-instructor-color-event-rules-and-slot-alerts-design.md`

## Global Constraints

- Never ask for or store the club Gmail password.
- UI must strictly adhere to the 8-bit retro neon pixel theme (`GEMINI.md`).
- Dancers only view events and classes for which they have registered.
- Slot capacity numbers remain internal for email alerts and review, not displayed on Event cards.
- Email alerts for slot capacity must only be sent ONCE per style per event when capacity is reached, preventing notification loops during 10-minute autoSync.

## Review Focus

1. **Custom Hex Colors**: Instructors with custom hex codes (e.g. `#FF5500`) must render directly in calendar dot markers and class badges instead of falling back to ink or breaking CSS vars.
2. **Missing Instructor on Class**: Classes without an explicit instructor must resolve their style's default instructor or active instructor to obtain their signature color.
3. **Empty Style Prevention**: If an admin selects 3 styles, all 3 styles must have at least 1 class before Next / Save is allowed.
4. **Duplicate Email Prevention**: Multiple consecutive 10-minute autoSync runs while an event is at or over capacity must NOT re-send duplicate alert emails.
5. **Cache Invalidation**: Updating an instructor's color in Master Data must immediately update the calendar and Today page without requiring manual localStorage clearance.

---

### Task 1: Instructor Signature Colors & Cache Invalidation

**Files:**
- Create: `web/src/theme/colors.test.ts`
- Modify: `web/src/theme/colors.ts`
- Modify: `web/src/features/classes/ClassesPage.tsx`
- Modify: `web/src/features/classes/TodayPage.tsx`
- Modify: `web/src/features/calendar/DancerHome.tsx`
- Modify: `web/src/features/calendar/ClassCard.tsx`
- Modify: `web/src/features/masterdata/InstructorsPage.tsx`
- Modify: `web/src/features/masterdata/StylesPage.tsx`

- [ ] **Step 1: Write failing unit test for `getStyleColor` and `getInstructorColor` with hex and named colors**
  Create `web/src/theme/colors.test.ts` asserting:
  - `getStyleColor('#FF5500')` returns `'#FF5500'`.
  - `getStyleColor('blue')` returns `'var(--c-blue)'`.
  - `getInstructorColor({ color: '#E91E63' })` returns `'#E91E63'`.
  - `getInstructorColor({ color: 'pink' })` returns `'var(--c-pink)'`.
  - `getInstructorColor(undefined)` returns fallback `'var(--neon-orange)'`.

- [ ] **Step 2: Run test to confirm failure**
  Run `npm test web/src/theme/colors.test.ts` in `web/` and verify failure.

- [ ] **Step 3: Update `web/src/theme/colors.ts`**
  Implement hex code check and `getInstructorColor`:
  ```typescript
  export function getStyleColor(colorKey?: string): string {
    if (!colorKey) return 'var(--c-ink)';
    if (colorKey.startsWith('#')) return colorKey;
    return STYLE_COLOR[colorKey.toLowerCase()] || `var(--c-${colorKey.toLowerCase()})` || 'var(--c-ink)';
  }

  export function getInstructorColor(instructor?: { color?: string } | null): string {
    if (!instructor?.color) return 'var(--neon-orange)';
    return getStyleColor(instructor.color);
  }
  ```

- [ ] **Step 4: Update `ClassesPage.tsx`, `TodayPage.tsx`, `DancerHome.tsx`, and `ClassCard.tsx`**
  - In `ClassesPage.tsx`:
    - `calendarMarks`: resolve instructor via `resolveInstructor(s, style, instructors)`, set `colorKey: inst?.color || 'orange'`.
    - `colorOf(s: ClassSession)`: resolve instructor and call `getInstructorColor(inst)`.
  - In `TodayPage.tsx`:
    - Set `colorVar = getInstructorColor(instructor)`.
  - In `DancerHome.tsx`:
    - `calendarMarks`: resolve instructor and set `colorKey: inst?.color || 'orange'`.
  - In `ClassCard.tsx`:
    - Use resolved instructor's color for `color` instead of `style.colorKey`.

- [ ] **Step 5: Fix query invalidations in `InstructorsPage.tsx` and `StylesPage.tsx`**
  Replace `queryKey: ['admin.bootstrap']` with `queryKey: ['bootstrap']` so all admin and dancer bootstrap queries are invalidated on update.

- [ ] **Step 6: Run tests and commit**
  Run `npm test web/` and ensure all tests pass.
  Commit: `git add web/src/theme web/src/features; git commit -m "feat: use instructor signature color for calendar markers and class cards"`

---

### Task 2: Enforce Minimum 1 Class per Selected Dance Style

**Files:**
- Modify: `web/src/features/events/eventDraft.ts`
- Modify: `web/src/features/events/eventDraft.test.ts`
- Modify: `web/src/features/events/steps/ScheduleStep.tsx`
- Modify: `web/src/features/events/steps/ReviewStep.tsx`
- Modify: `api/src/features/events.ts`
- Modify: `api/test/features/events.test.ts`

- [ ] **Step 1: Write failing test in `eventDraft.test.ts` for empty style detection**
  Add helper test in `web/src/features/events/eventDraft.test.ts`:
  - `stylesWithoutClasses(draft)` returns style IDs from `draft.styleIds` that have 0 scheduled classes in `draft.schedule`.

- [ ] **Step 2: Implement `stylesWithoutClasses` in `eventDraft.ts`**
  ```typescript
  export function stylesWithoutClasses(draft: EventDraft): string[] {
    return draft.styleIds.filter(id => (draft.schedule[id] || []).length === 0);
  }
  ```

- [ ] **Step 3: Update `ScheduleStep.tsx` & `ReviewStep.tsx`**
  - In `ScheduleStep.tsx`:
    - Call `stylesWithoutClasses(draft)`.
    - If `empty.length > 0`: disable `NEXT` button and display retro banner:
      `"Each dance style needs at least 1 class. Schedule classes for: {styleNames}"`
  - In `ReviewStep.tsx`:
    - Block `CREATE EVENT` / `SAVE CHANGES` button if `stylesWithoutClasses(draft).length > 0`.

- [ ] **Step 4: Update `api/src/features/events.ts` backend validation**
  - In `events.create`:
    ```typescript
    const sessionsByStyle = new Set(sessions.map(s => s.styleId));
    const missingStyles = styleIds.filter(id => !sessionsByStyle.has(id));
    if (missingStyles.length > 0) {
      const names = missingStyles.map(id => ctx.db.styles.find(s => s.id === id)[0]?.name || id);
      throw new AppError('VALIDATION', `Each selected dance style must have at least one scheduled class. Missing: ${names.join(', ')}`);
    }
    ```
  - In `events.update`:
    - Ensure remaining sessions cover all `styleIds`.

- [ ] **Step 5: Run tests and commit**
  Run `npm test` across `web/` and `api/`.
  Commit: `git add web/src/features/events api/src/features/events.ts; git commit -m "feat: enforce minimum 1 class per selected dance style"`

---

### Task 3: Compulsory Slot Capacity & Automated Alert Emails

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `api/src/db/schema.ts`
- Modify: `api/src/features/events.ts`
- Modify: `api/src/features/eventImport.ts`
- Modify: `web/src/features/events/eventDraft.ts`
- Modify: `web/src/features/events/steps/StylesStep.tsx`
- Modify: `web/src/features/events/steps/ReviewStep.tsx`
- Create / Modify: `api/test/features/slotAlerts.test.ts`

- [ ] **Step 1: Update `shared/src/types.ts` and `api/src/db/schema.ts`**
  - In `shared/src/types.ts`:
    Add `styleSlots?: Record<string, number>`, `styleSlotsJson?: string`, `notifiedFullStyles?: string[]` to `EventItem`.
  - In `api/src/db/schema.ts`:
    Add `'styleSlotsJson'` and `'notifiedFullStylesJson'` to `SCHEMA.Events`.

- [ ] **Step 2: Add slot capacity state in `eventDraft.ts`**
  - Add `styleSlots: Record<string, number>` to `EventDraft`.
  - Initialize with empty record, prefill on edit from `event.styleSlotsJson`.
  - Add validation helper: `missingStyleSlots(draft)` returning style IDs with missing or invalid `<= 0` capacity.

- [ ] **Step 3: Update `StylesStep.tsx` to require compulsory slot capacity**
  - For each ticked style, render a compulsory number input:
    - Label: `SLOT CAPACITY (COMPULSORY)`
    - Value: `draft.styleSlots[s.id] ?? ''`
    - Require `Number(value) > 0`.
  - Disable `NEXT` if `missingStyleSlots(draft).length > 0`.
  - In `ReviewStep.tsx`: include slot capacity per style in review details.

- [ ] **Step 4: Write failing backend test for slot alerts**
  Create `api/test/features/slotAlerts.test.ts`:
  - When `importEventMembers` detects enrollment for a style >= `styleSlots[styleId]`:
    - Verify `ctx.mail.sendEmail` is called with:
      - Admin recipients: `clubEmail` + admin email username.
      - Class lead recipient: `DanceStyle.videoUploaderEmail`.
      - Subject: `[UMDSC Alert] Slot Full - ...`.
    - Verify `event.notifiedFullStylesJson` records the style ID.
    - Subsequent sync does NOT re-send the email.

- [ ] **Step 5: Implement slot alert logic in `api/src/features/eventImport.ts`**
  - Calculate enrolled count per style.
  - Parse `styleSlots` from `event.styleSlotsJson`.
  - Parse `notifiedStyles` from `event.notifiedFullStylesJson`.
  - If `enrolled >= capacity` and not already in `notifiedStyles`:
    - Collect admin emails: settings `clubEmail` + active `db.admins` with email usernames.
    - Collect class lead email from `style.videoUploaderEmail`.
    - Send email with `ctx.mail.sendEmail`.
    - Add to `notifiedStyles`.
  - Save updated `notifiedFullStylesJson` on event.

- [ ] **Step 6: Run tests and commit**
  Run `npm test` across `shared/`, `api/`, and `web/`.
  Commit: `git add shared/ api/ web/; git commit -m "feat: add compulsory slot capacity and automated slot-full alert emails"`

---

### Task 4: End-to-End Verification with webapp-testing

**Files:**
- Test scripts / Playwright

- [ ] **Step 1: Run comprehensive Vitest test suite**
  Verify all tests pass with zero regressions.

- [ ] **Step 2: Run Playwright e2e verification via `webapp-testing`**
  - Start local dev server if needed.
  - Verify Admin Calendar: changing an instructor's signature color changes their calendar class markers.
  - Verify Event Wizard:
    - Attempting to proceed without entering slot capacity is blocked.
    - Attempting to proceed without scheduling at least 1 class for each selected style is blocked.
    - When 1 class per style and slot capacity are provided, event creation succeeds.
  - Verify Dancer Calendar: logged-in enrolled dancer sees classes with the instructor's signature color.

- [ ] **Step 3: Final commit and summary**
  Commit any test additions or adjustments and provide clear summary to user.
