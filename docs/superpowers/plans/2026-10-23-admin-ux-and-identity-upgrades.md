# Admin UX & Dancer Identity Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver 7 requested upgrades: neon clock icon visibility, single-style Google Form auto-closure on full house (House Foundation), Events page accordions with year-based archive sorting, unified 'SYNC NOW' button, matric disambiguation for dancers sharing matric numbers, Step I 'CHOOSE EVENT' archived year accordion, and a floating 3-tab notification center.

**Architecture:**
- Frontend styling updates in CSS tokens for native inputs.
- Backend form gating refinement in `api/src/features/formGating.ts` for single-style events.
- Backend member building and authentication logic in `api/src/logic/buildMembers.ts` and `api/src/features/auth.ts` to disambiguate dancers with identical matrics while preserving authentic public matric display.
- Frontend React component enhancements in `EventCard.tsx`, `EventsPage.tsx`, `EventStyleSteps.tsx`, and a new `NotificationWidget.tsx` integrated in `DesktopShell.tsx`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vitest, Playwright, Google Apps Script backend.

**Spec:** [docs/superpowers/specs/2026-10-23-admin-ux-and-identity-upgrades-design.md](file:///c:/Users/user/Downloads/UMDSC%20Design/UMDSC%20Dance%20Class%20System/docs/superpowers/specs/2026-10-23-admin-ux-and-identity-upgrades-design.md)

## Global Constraints
- Preserve 8-bit retro cyberpunk aesthetic per spec §13.1 (no generic modern boilerplate styles).
- Never modify or append suffixes to the public `matricRaw` or `matricKey` displayed to users.
- Never delete or corrupt existing member attendance rows or roles during name disambiguation.
- All interactive buttons must have a minimum touch target of 44px on mobile/desktop.
- All new routes and functions must have corresponding Vitest automated tests before implementation (TDD).

## Review Focus
1. **Dancer Login with Shared Matric**: When `Testing1` and `Chan Da Hui` share the same matric number, verify both can independently log in with their respective names and access their own profile.
2. **Single-Style Form Closure**: When a single-style event reaches its slot capacity, verify `setAcceptingResponses(false)` is invoked with `FULL_HOUSE_CLOSED_MESSAGE` even if no question on the form mentions dance styles.
3. **Form Re-Opening**: Verify that if a full single-style event has its capacity increased or a dancer is removed, `setAcceptingResponses(true)` is invoked automatically.
4. **Events Page Year Sorting**: Verify archived events are correctly partitioned by their start date's calendar year (descending) and can be expanded individually.
5. **Combined Sync Mutation**: Verify clicking 'SYNC NOW' executes both sheet sync and form slot sync without race conditions or swallowed error alerts.

---

### Task 1: Global Clock Icon Visibility Styling

**Files:**
- Modify: `web/src/theme/pixel.css`
- Test: `web/src/components/ui/neon.test.tsx`

**Interfaces:**
- Consumes: CSS custom properties (`--night-1`, `--neon-cyan`)
- Produces: Global input styling for `input[type="time"]` and `input[type="date"]`

- [ ] **Step 1: Write failing test in `web/src/components/ui/neon.test.tsx`**
Add a test asserting that pixel.css contains `color-scheme: dark` and indicator filter styling for `input[type="time"]`.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -w web -- web/src/components/ui/neon.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement CSS rules in `web/src/theme/pixel.css`**
Add:
```css
input[type="time"],
input[type="date"] {
  color-scheme: dark;
}
input[type="time"]::-webkit-calendar-picker-indicator,
input[type="date"]::-webkit-calendar-picker-indicator {
  filter: invert(0.85) sepia(100%) hue-rotate(130deg) saturate(300%) brightness(1.2);
  cursor: pointer;
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test -w web -- web/src/components/ui/neon.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add web/src/theme/pixel.css web/src/components/ui/neon.test.tsx
git commit -m "style: enhance native time and date picker indicator visibility"
```

---

### Task 2: Single-Style Event Google Form Full-House Auto-Gating

**Files:**
- Modify: `api/src/features/formGating.ts`
- Modify: `api/src/features/eventImport.ts`
- Test: `api/test/features/formGating.test.ts`

**Interfaces:**
- Consumes: `event.styleIds`, `event.styleSlots`, `activeMembers`
- Produces: `syncGoogleFormSlotChoices` closing form without requiring style question when `styleIds.length === 1` and `activeMembers.length >= cap`.

- [ ] **Step 1: Write failing test in `api/test/features/formGating.test.ts`**
Add test case: `'closes single-style event form when slot capacity reached even without any style question on form'`.
Create a form with NO dance style questions, an event with `styleIds: ['st_house']`, `styleSlots: { st_house: 2 }`, and 2 active members. Verify `form.isAcceptingResponses()` becomes `false` and custom closed message is set.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -w api -- api/test/features/formGating.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement single-style gating bypass in `api/src/features/formGating.ts`**
In `syncGoogleFormSlotChoices`:
If `event.styleIds.length === 1`:
- Skip inspecting question choices / auto-discovery.
- Evaluate `activeMembers.length >= cap`.
- If full house, call `form.setAcceptingResponses(false)` and `form.setCustomClosedFormMessage(FULL_HOUSE_CLOSED_MESSAGE)`.
- If not full house and previously closed for full house, call `form.setAcceptingResponses(true)`.
- Return early with gating result.

- [ ] **Step 4: Run tests to verify all form gating tests pass**
Run: `npm test -w api -- api/test/features/formGating.test.ts api/test/features/formGatingEdgeCases.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add api/src/features/formGating.ts api/test/features/formGating.test.ts
git commit -m "feat(formGating): auto-close single style forms on full house without requiring choice question"
```

---

### Task 3: Dancer Identity Disambiguation & Login by Matric + Name

**Files:**
- Modify: `api/src/logic/buildMembers.ts`
- Modify: `api/src/features/auth.ts`
- Modify: `api/src/logic/audit.ts`
- Test: `api/test/logic/buildMembers.test.ts`
- Test: `api/test/features/auth.test.ts`

**Interfaces:**
- Consumes: `row[fullNameCol]`, `row[matricCol]`, `ctx.db.memberIndex`
- Produces: Distinct `Member` entities when same matric has distinct name; `auth.dancerLogin` resolving exact dancer by name match.

- [ ] **Step 1: Write failing tests in `api/test/logic/buildMembers.test.ts` and `api/test/features/auth.test.ts`**
- In `buildMembers.test.ts`: test that row with matric `23005147` named `Testing1` and another row with matric `23005147` named `Chan Da Hui` produce TWO separate members with different `memberId`s (`M-23005147` and `M-23005147_TESTING1`), but both have `matricKey: '23005147'`, and emits a `matricConflict` warning. Test that `Chan Da Hui` and `CHAN DAHUI` (typo/spacing) merge into one member and emit a `nameVariation` warning.
- In `auth.test.ts`: test `auth.dancerLogin` where two dancers share matric `23005147`: logging in with `Testing1` returns token for `Testing1`, logging in with `Chan Da Hui` returns token for `Chan Da Hui`.

- [ ] **Step 2: Run tests to verify they fail**
Run: `npm test -w api -- api/test/logic/buildMembers.test.ts api/test/features/auth.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement fuzzy name check and member splitting in `api/src/logic/buildMembers.ts` and login in `api/src/features/auth.ts`**
- In `buildMembers.ts`:
  - When encountering an existing `matricKey`:
    - Calculate name similarity using `nameSimilarity` / `levenshtein`.
    - If similarity >= 0.82 (or minor whitespace/casing difference): merge into same member, add warning `nameVariation`.
    - If similarity < 0.82: treat as distinct dancer! Key as `matricKey + '__' + nk`. Assign `memberId: 'M-' + matricKey + '-' + nk` (first one remains `M-` + matricKey). Add warning `matricConflict`.
- In `auth.ts` (`auth.dancerLogin`):
  - Find all dancers with `m.matricKey === matricKey && m.active`.
  - Pick the one where `fullNameMatches(fullName, m.fullName)`.

- [ ] **Step 4: Run tests to verify they pass**
Run: `npm test -w api -- api/test/logic/buildMembers.test.ts api/test/features/auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add api/src/logic/buildMembers.ts api/src/features/auth.ts api/test/logic/buildMembers.test.ts api/test/features/auth.test.ts
git commit -m "feat(members): disambiguate distinct dancers sharing same matric number"
```

---

### Task 4: Unified 'SYNC NOW' Button on EventCard

**Files:**
- Modify: `web/src/features/events/EventCard.tsx`
- Test: `web/src/features/events/EventCard.test.tsx`

**Interfaces:**
- Consumes: `events.sync` and `events.syncFormSlots` API endpoints
- Produces: Single unified 'SYNC NOW' button performing both operations and presenting consolidated feedback.

- [ ] **Step 1: Write test in `web/src/features/events/EventCard.test.tsx`**
Verify only one 'SYNC NOW' button is rendered (no 'SYNC FORM' button), and clicking it triggers both sync calls and sets note.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -w web -- web/src/features/events/EventCard.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement unified sync in `web/src/features/events/EventCard.tsx`**
- Combine `sync` and `syncFormSlots` into a single mutation:
  ```ts
  const syncAll = useMutation({
    mutationFn: async () => {
      const sheetResult = (await call<SyncResult>('events.sync', { id: event.id, purgeRemoved: true, force: true })).data;
      let formResult: any = null;
      try {
        formResult = (await call<any>('events.syncFormSlots', { id: event.id })).data;
      } catch (err) {
        console.warn('Form sync failed during sync now:', err);
      }
      return { sheetResult, formResult };
    },
    onSuccess: async ({ sheetResult, formResult }) => {
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ['members'] })]);
      const parts = [`Synced: +${sheetResult.added} new, ${sheetResult.updated} updated`];
      if (formResult?.formClosed) {
        parts.push('Google Form closed (FULL HOUSE)');
      } else if (formResult?.fullStyleIds?.length) {
        parts.push(`Google Form: ${formResult.fullStyleIds.length} style(s) full`);
      } else if (formResult?.synced) {
        parts.push('Google Form updated');
      }
      setNote(parts.join(' · '));
    }
  });
  ```
- Replace the two buttons with single `SYNC NOW` button using `syncAll`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test -w web -- web/src/features/events/EventCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add web/src/features/events/EventCard.tsx web/src/features/events/EventCard.test.tsx
git commit -m "feat(events): combine sheet and form sync into single SYNC NOW button"
```

---

### Task 5: Events Page Collapsible Accordions & Year-Based Archive Grouping

**Files:**
- Modify: `web/src/features/events/EventsPage.tsx`
- Test: `web/src/features/events/EventsPage.test.tsx`

**Interfaces:**
- Consumes: `events.list` query
- Produces: Active events collapsible bars with `[ ▲ / ▼ ]` toggle, archived events grouped by year with expandable event name bars.

- [ ] **Step 1: Write failing test in `web/src/features/events/EventsPage.test.tsx`**
Test that active events render collapsed headers showing event names, clicking toggles card expansion, toggle-all button toggles all, and archived events are partitioned under year headers (e.g. `2026`).

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -w web -- web/src/features/events/EventsPage.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement collapsible accordions and year grouping in `web/src/features/events/EventsPage.tsx`**
- Group archived events: `const byYear = groupBy(archived, e => e.startDate?.slice(0, 4) || 'Unknown')`.
- For active events, provide compact bar component showing:
  - Event name, dancer count pill, slot pill, and `[ ▼ ]` / `[ ▲ ]` toggle icon button.
  - When expanded, render `<EventCard event={e} styles={styles} />`.
- Provide header icon button for Expand All / Collapse All.
- For archived events, render collapsible year accordion headers (`📁 2026 ARCHIVED EVENTS (N)`), inside of which each event is a collapsible bar that expands to its `EventCard`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test -w web -- web/src/features/events/EventsPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add web/src/features/events/EventsPage.tsx web/src/features/events/EventsPage.test.tsx
git commit -m "feat(events): add collapsible event bars and year-grouped archive accordion"
```

---

### Task 6: Step I 'CHOOSE EVENT' Panel Archived Event Accordion

**Files:**
- Modify: `web/src/components/ui/EventStyleSteps.tsx`
- Test: `web/src/components/ui/EventStyleSteps.test.tsx`

**Interfaces:**
- Consumes: `useCurrentEvent` hook
- Produces: `EventStep` containing active events dropdown and collapsible `📁 ARCHIVED EVENTS` year accordion.

- [ ] **Step 1: Write failing test in `web/src/components/ui/EventStyleSteps.test.tsx`**
Assert that archived events are not listed directly in the primary dropdown; instead, clicking the archived toggle shows year tabs, and selecting a year reveals the archived events.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -w web -- web/src/components/ui/EventStyleSteps.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement year-grouped archive accordion in `web/src/components/ui/EventStyleSteps.tsx`**
- In `EventStep`:
  - Active events populate the main `PixelDropdown`.
  - Below the dropdown, add collapsible accordion:
    ```tsx
    <button type="button" onClick={() => setShowArchived(!showArchived)} className="...">
      <span>{showArchived ? '▼' : '▶'}</span>
      <span>📁 ARCHIVED EVENTS ({archived.length})</span>
    </button>
    ```
  - When expanded, render year tabs: `[ 2026 ]`, `[ 2025 ]`...
  - Selecting a year shows pill buttons for events archived in that year; clicking sets `setCurrentId(event.id)`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test -w web -- web/src/components/ui/EventStyleSteps.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add web/src/components/ui/EventStyleSteps.tsx web/src/components/ui/EventStyleSteps.test.tsx
git commit -m "feat(ui): group archived events by year in Step I Choose Event panel"
```

---

### Task 7: Floating Notification Center with 3-Tab Cyberpunk Drawer

**Files:**
- Create: `web/src/components/ui/NotificationWidget.tsx`
- Create: `web/src/components/ui/NotificationWidget.test.tsx`
- Modify: `web/src/app/DesktopShell.tsx`

**Interfaces:**
- Consumes: `useEvents`, `useQuery(['members'])`, `useQuery(['auditLog'])`
- Produces: Fixed bottom-right retro button with unread badge and slide-out 3-tab drawer (`NEW DANCERS`, `SLOT PROGRESS`, `SYSTEM & AUDIT`).

- [ ] **Step 1: Write failing test in `web/src/components/ui/NotificationWidget.test.tsx`**
Test rendering of floating bell button, click opens drawer, and verifies tab switching between 'NEW DANCERS', 'SLOT PROGRESS', and 'SYSTEM & AUDIT'.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -w web -- web/src/components/ui/NotificationWidget.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `NotificationWidget.tsx` and attach in `DesktopShell.tsx`**
- Floating button: `fixed bottom-6 right-6 z-40` with retro bell icon `🔔` and unread badge.
- Slide-out retro side drawer with tab header:
  - `NEW DANCERS`: Dancers registered within last 14 days, with search and style pills.
  - `SLOT PROGRESS`: Visual retro progress bars for all active events & styles (`[████████░░] 80%`), with slot capacity and full badges.
  - `SYSTEM & AUDIT`: Matric conflicts, name variations, sync errors, and profile edits from `auditLog`.
- Embed `<NotificationWidget />` in `DesktopShell.tsx`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test -w web -- web/src/components/ui/NotificationWidget.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add web/src/components/ui/NotificationWidget.tsx web/src/components/ui/NotificationWidget.test.tsx web/src/app/DesktopShell.tsx
git commit -m "feat(ui): add floating retro notification widget with 3-tab admin drawer"
```

---

### Task 8: Full Verification & E2E Validation

**Files:**
- Test: All unit, component, and E2E tests

- [ ] **Step 1: Run complete API Vitest suite**
Run: `npm test -w api`
Expected: All tests pass.

- [ ] **Step 2: Run complete Web Vitest suite**
Run: `npm test -w web`
Expected: All tests pass.

- [ ] **Step 3: Run Playwright E2E tests**
Run: `npx playwright test`
Expected: All tests pass.

- [ ] **Step 4: Final commit and verify clean git status**
```bash
git status
```
