# Dancer Autocomplete, Self Profile Edit, and Walk-In Class Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement login autocomplete with masked matrics, dancer self-service profile editing across all active Google Sheets, and permanent walk-in class passes with attendance sheet logging.

**Architecture:**
- Backend: Lightweight public suggestion endpoint matching `MemberIndex` with masked matrics; authenticated `members.selfEdit` endpoint propagating name/matric edits across registration Google Form response sheets, Members sheets, Attendance sheets, and `MemberIndex`; walk-in authentication issuing scoped permanent JWT tokens while appending walk-in attendee records to a `Walk-ins` tab on the attendance spreadsheet.
- Frontend: Debounced retro pixel autocomplete dropdown on `TitleScreen`; retro profile edit dialog on `MePage` updating local session seamlessly; walk-in mode toggle on `TitleScreen` and walk-in pass view for admitted single-class dancers; walk-in code display and regeneration on admin calendar views.

**Tech Stack:** TypeScript, React, Tailwind CSS / Vanilla CSS tokens, Google Apps Script API backend, Vitest, Playwright.

**Spec:** [`docs/superpowers/specs/2026-10-14-dancer-autocomplete-profile-edit-and-walkin-design.md`](file:///c:/Users/user/Downloads/UMDSC%20Design/UMDSC%20Dance%20Class%20System/docs/superpowers/specs/2026-10-14-dancer-autocomplete-profile-edit-and-walkin-design.md)

## Global Constraints
- Preserve retro 8-bit aesthetic tokens per spec §13.1; do not use standard generic UI frameworks or off-brand styles.
- Security & PDPA: Full matric numbers are never exposed in autocomplete responses.
- Idempotency & Concurrency: All Google Sheets writes run under `withScriptLock`.
- Data Consistency: Editing dancer details must synchronize the registration Form response sheet, Members sheet, Attendance sheets (preserving and shifting tick columns), and `MemberIndex`.

## Review Focus
1. Autocomplete query with special regex characters or spaces must not throw an error or crash the server.
2. Self-editing a matric number to one already belonging to another dancer must be cleanly rejected with a validation error.
3. Self-editing a dancer enrolled in multiple events must update all non-archived event response sheets and keep tick counts intact.
4. Walk-in class codes must be robust against case sensitivity and trailing spaces.
5. Walk-in dancers must only see their specific class session and media, without leaking other classes in that event or style.

---

### Task 1: Shared Types & Schema Updates

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `api/src/db/schema.ts`
- Test: `shared/vitest.config.ts` (typecheck & existing tests)

**Interfaces:**
- Produces: `ClassSession.walkInCode?: string`, `SuggestDancersPayload`, `SuggestDancersResponse`, `SelfEditPayload`, `WalkInLoginPayload`.

- [ ] **Step 1: Write types test / verify shared definitions**
Add tests in `shared/src/index.test.ts` or verify that `ClassSession` and new payloads compile cleanly.

- [ ] **Step 2: Update `shared/src/types.ts` and `api/src/db/schema.ts`**
Add `walkInCode` to `SCHEMA.ClassSessions` in `api/src/db/schema.ts` and `ClassSession` in `shared/src/types.ts`.
Add interfaces for `auth.suggestDancers`, `members.selfEdit`, and `auth.walkInLogin`.

- [ ] **Step 3: Run shared tests to verify compilation**
Run: `npm run test -w shared`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add shared/src/types.ts api/src/db/schema.ts
git commit -m "feat(schema): add walkInCode to ClassSession and API types"
```

---

### Task 2: Backend Autocomplete Endpoint (`auth.suggestDancers`)

**Files:**
- Modify: `api/src/features/auth.ts`
- Create / Modify: `api/test/features/auth.test.ts`
- Modify: `api/src/logic/normalize.ts` (masking utility)

**Interfaces:**
- Produces: `auth.suggestDancers` route in `getAuthRoutes()`.
- Logic: Takes `{ query, type }`. If `type === 'name'`, checks `fullName` (min 2 chars). If `type === 'matric'`, checks `matricKey` (min 3 chars). Masks matric as e.g. `17••••34`. Returns top 3 (or min 1 closest).

- [ ] **Step 1: Write failing tests in `api/test/features/auth.test.ts`**
Add tests for:
- Query by name returns matching dancers with masked matrics.
- Query with no exact match returns top 1 nearest dancer.
- Query by matric returns matching dancers.
- Very short query (< 2 chars for name, < 3 for matric) returns empty suggestions.
- Raw matric is never returned in response.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run api/test/features/auth.test.ts -t "suggestDancers"`
Expected: FAIL (route or action not found)

- [ ] **Step 3: Implement `maskMatric` in `normalize.ts` and `auth.suggestDancers` in `api/src/features/auth.ts`**
Implement the masking algorithm and ranking logic.

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run api/test/features/auth.test.ts -t "suggestDancers"`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add api/src/logic/normalize.ts api/src/features/auth.ts api/test/features/auth.test.ts
git commit -m "feat(auth): implement auth.suggestDancers with masked matric"
```

---

### Task 3: Frontend Autocomplete on Login Screen

**Files:**
- Modify: `web/src/features/auth/TitleScreen.tsx`
- Test: `web/src/features/auth/TitleScreen.test.tsx`

**Interfaces:**
- Consumes: `auth.suggestDancers` from `lib/api.ts`.
- Produces: Dropdown suggestion cards under Full Name and Matric Number inputs.

- [ ] **Step 1: Write test for `TitleScreen` autocomplete behavior**
Test that typing into Full Name triggers `call('auth.suggestDancers', ...)` and renders suggestions, and clicking a suggestion updates the input and focuses the matric field.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run web/src/features/auth/TitleScreen.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement suggestion dropdown in `TitleScreen.tsx`**
Add debounced API call, retro styled dropdown popup, keyboard navigation (Escape to close, arrows/click to select), and name autofill.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run web/src/features/auth/TitleScreen.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add web/src/features/auth/TitleScreen.tsx web/src/features/auth/TitleScreen.test.tsx
git commit -m "feat(ui): add retro dancer autocomplete on login screen"
```

---

### Task 4: Backend Self Profile Edit (`members.selfEdit`)

**Files:**
- Modify: `api/src/features/members.ts`
- Test: `api/test/features/members.test.ts`

**Interfaces:**
- Produces: `members.selfEdit` route in `getMemberRoutes()`.
- Updates Form response sheets for all active registered events, syncs members, updates attendance sheets and `MemberIndex`, logs to `AuditLog`, and returns new token + bootstrap.

- [ ] **Step 1: Write tests in `api/test/features/members.test.ts`**
Test:
- Dancer updates name and matric number.
- Verified that event Form sheet, Members sheet, and Attendance ticks are preserved and updated.
- Duplicate matric rejected with `VALIDATION`.
- Signs new JWT token with updated matric and returns fresh bootstrap.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run api/test/features/members.test.ts -t "selfEdit"`
Expected: FAIL

- [ ] **Step 3: Implement `members.selfEdit` handler in `api/src/features/members.ts`**
Reuse form write and sync mechanism, update across all active events, issue updated token, and record in `AuditLog`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run api/test/features/members.test.ts -t "selfEdit"`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add api/src/features/members.ts api/test/features/members.test.ts
git commit -m "feat(members): implement members.selfEdit across all active event sheets"
```

---

### Task 5: Frontend Self Profile Edit on Me Page

**Files:**
- Modify: `web/src/features/me/MePage.tsx`
- Create: `web/src/features/me/EditProfileDialog.tsx`
- Test: `web/src/features/me/MePage.test.tsx`

**Interfaces:**
- Consumes: `members.selfEdit` API.
- Produces: Retro modal dialog allowing dancer to change Full Name and Matric Number, updating local session on save.

- [ ] **Step 1: Write test in `MePage.test.tsx`**
Verify that clicking `EDIT INFO` opens the dialog, submitting calls `members.selfEdit`, and updates the session and displayed profile name/matric.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run web/src/features/me/MePage.test.tsx -t "Edit"`
Expected: FAIL

- [ ] **Step 3: Implement `EditProfileDialog.tsx` and integrate into `MePage.tsx`**
Add retro styled dialog with validation, loading states, and session update upon success.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run web/src/features/me/MePage.test.tsx -t "Edit"`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add web/src/features/me/MePage.tsx web/src/features/me/EditProfileDialog.tsx web/src/features/me/MePage.test.tsx
git commit -m "feat(ui): add self profile edit dialog on Me page"
```

---

### Task 6: Backend Walk-In Pass & Code Management

**Files:**
- Modify: `api/src/features/sessions.ts` (code generation & regeneration route)
- Modify: `api/src/features/auth.ts` (`auth.walkInLogin`)
- Test: `api/test/features/sessions.test.ts`
- Test: `api/test/features/auth.test.ts`

**Interfaces:**
- Produces:
  - Auto-generated `walkInCode` on session creation and lazy backfill.
  - Route: `sessions.regenerateWalkInCode`.
  - Route: `auth.walkInLogin`: appends attendee to `Walk-ins` tab on the attendance spreadsheet, returns 10-year scoped token and single-session bootstrap.

- [ ] **Step 1: Write tests for walk-in code generation and `auth.walkInLogin`**
Test:
- Creating a session generates a unique `walkInCode`.
- Admin can regenerate `walkInCode`.
- `auth.walkInLogin` with code and name succeeds, appends row to `Walk-ins` sheet, and returns token with single-class bootstrap.
- Invalid code throws `NOT_FOUND`.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run api/test/features/auth.test.ts -t "walkInLogin"`
Expected: FAIL

- [ ] **Step 3: Implement walk-in code logic and `auth.walkInLogin`**
Add helper to generate readable codes (e.g. `LCK-7X9`), write `Walk-ins` sheet appending logic, and construct walk-in bootstrap.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run api/test/features/auth.test.ts -t "walkInLogin"`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add api/src/features/sessions.ts api/src/features/auth.ts api/test/features/auth.test.ts api/test/features/sessions.test.ts
git commit -m "feat(walkin): implement walk-in code generation and auth.walkInLogin"
```

---

### Task 7: Frontend Walk-In Login, Pass View & Admin Code Display

**Files:**
- Modify: `web/src/features/auth/TitleScreen.tsx` (Walk-In login mode)
- Modify: `web/src/features/calendar/DancerHome.tsx` (Walk-In badge & banner)
- Modify: `web/src/features/classes/ClassesPage.tsx` / `DaySheet.tsx` (Admin walk-in code display)
- Test: `web/src/features/auth/TitleScreen.test.tsx`
- Test: `web/src/features/calendar/DancerHome.test.tsx`

**Interfaces:**
- Consumes: `auth.walkInLogin`, `walkInCode` from `ClassSession`.
- Produces:
  - Toggle between Member Login and Walk-In Pass on `TitleScreen`.
  - Clear walk-in badge on calendar and Studio.
  - Admin view for class walk-in codes with copy button.

- [ ] **Step 1: Write tests for walk-in login UI and calendar display**
Verify walk-in login form switch, successful walk-in login flow, and walk-in banner appearance on Dancer Home.

- [ ] **Step 2: Run tests to verify they fail**
Run: `npx vitest run web/src/features/auth/TitleScreen.test.tsx -t "Walk-In"`
Expected: FAIL

- [ ] **Step 3: Implement walk-in UI components**
Update `TitleScreen.tsx`, `DancerHome.tsx`, and admin calendar views.

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run web/src/features/auth/TitleScreen.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add web/src/features/auth/TitleScreen.tsx web/src/features/calendar/DancerHome.tsx web/src/features/classes/ClassesPage.tsx
git commit -m "feat(ui): add walk-in login mode and admin walk-in code display"
```

---

### Task 8: Full Verification, Production Build & Direct Publish

**Files:**
- All touched files across `shared`, `api`, `web`.

- [ ] **Step 1: Run complete test suite**
Run: `npm test` across all packages (`shared`, `api`, `web`).
Expected: All tests PASS.

- [ ] **Step 2: Build frontend bundle**
Run: `npm run build -w web`
Expected: Successful build output in `web/dist`.

- [ ] **Step 3: Push Google Apps Script Backend**
Run: `npm run push -w api`
Run: `npx clasp update-deployment AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA -w api`
Expected: Deployment updated.

- [ ] **Step 4: Push to Git Main for Cloudflare Pages Deployment**
Push commits to `origin main` to trigger automatic production deployment.
Expected: Pushed successfully.
