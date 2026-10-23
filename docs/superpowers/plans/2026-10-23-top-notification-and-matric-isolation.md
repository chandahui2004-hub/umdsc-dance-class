# Top Notification Center & Dancer Matric Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move notification floating bell to top-right, revert dancer identity strictly to 1 matric = 1 dancer, and reassign test dancers (`Testing1`, `Testing2`) to unique alphanumeric matrics (`TEST9001`, `TEST9002`) so `Chan Da Hui` (`23005147`) has exclusive matric ownership and can log in cleanly.

**Spec:** [docs/superpowers/specs/2026-10-23-top-notification-and-matric-isolation-design.md](file:///c:/Users/user/Downloads/UMDSC%20Design/UMDSC%20Dance%20Class%20System/docs/superpowers/specs/2026-10-23-top-notification-and-matric-isolation-design.md)

---

### Task 1: Move Notification Floating Button to Top-Right

**Files:**
- Modify: `web/src/components/ui/NotificationWidget.tsx`
- Test: `web/src/components/ui/NotificationWidget.test.tsx`

- [ ] **Step 1: Write failing test asserting top-right classes**
- [ ] **Step 2: Update `NotificationWidget.tsx` styling**
- [ ] **Step 3: Run test to verify it passes**
- [ ] **Step 4: Commit**

---

### Task 2: Revert Dancer Identity to 1 Matric = 1 Dancer in `buildMembers.ts`

**Files:**
- Modify: `api/src/logic/buildMembers.ts`
- Test: `api/test/logic/buildMembers.test.ts`

- [ ] **Step 1: Update unit tests in `buildMembers.test.ts`**
  - Verify two rows with same matric merge into single member `M-${matricKey}` with union of styles.
- [ ] **Step 2: Implement strict matricKey grouping in `buildMembers.ts`**
  - Group by `matricKey` only (`memberId: 'M-' + matricKey`).
  - Merge styles and flags. Preserve real dancer name if incoming row has test dummy name.
- [ ] **Step 3: Run tests to verify all `buildMembers` tests pass**
- [ ] **Step 4: Commit**

---

### Task 3: Auto-Remap `Testing1` & `Testing2` to Unique Alphanumeric Matrics in `eventImport.ts`

**Files:**
- Modify: `api/src/features/eventImport.ts`
- Test: `api/test/features/eventImport.test.ts`

- [ ] **Step 1: Write test in `eventImport.test.ts`**
  - Row with name `Testing1` on `23005147` remapped to `TEST9001`.
  - Row with name `Testing2` on `23005147` remapped to `TEST9002`.
- [ ] **Step 2: Implement remapping and sheet cell update in `eventImport.ts`**
  - Remap matric values and update sheet cells if matching `/^testing\s*1$/i` or `/^testing\s*2$/i` on matric `23005147`.
  - Purge stale split IDs `M-23005147-*` from `ctx.db.memberIndex`.
- [ ] **Step 3: Run tests to verify they pass**
- [ ] **Step 4: Commit**

---

### Task 4: Dancer Login by Unique Matric Number in `auth.ts`

**Files:**
- Modify: `api/src/features/auth.ts`
- Test: `api/test/features/auth.test.ts`

- [ ] **Step 1: Update tests in `auth.test.ts`**
  - Assert `Chan Da Hui` logs in with matric `23005147`.
  - Assert `Testing1` logs in with matric `TEST9001`.
- [ ] **Step 2: Update `auth.dancerLogin` in `api/src/features/auth.ts`**
  - Find dancer by `m.matricKey === matricKey && m.active`.
- [ ] **Step 3: Run tests to verify they pass**
- [ ] **Step 4: Commit**

---

### Task 5: Full Verification, Production Build & Deployment

**Files:**
- Modify: `docs/SETUP-VALUES.md`
- Verification across test suites and production build

- [ ] **Step 1: Run complete API Vitest suite**
- [ ] **Step 2: Run complete Web Vitest suite**
- [ ] **Step 3: Run `npm run build`**
- [ ] **Step 4: Deploy API to Google Apps Script (Version 89)**
- [ ] **Step 5: Merge into `main` and push to GitHub remote `origin`**
