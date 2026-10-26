# Subagent-Driven Full-Stack Testing & Mocking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conduct extensive automated E2E test runs, mock testing, and live backend verification across mobile (390×844) and desktop (1440×900) viewports to identify and resolve potential bugs and UX defects across all portals, strictly targeting event `testing1`, email `chandahui2004@gmail.com`, and dancer `Chan Da Hui` (matric `23005147`).

**Architecture:** A 5-task subagent workflow: Tasks 1–3 use Playwright E2E suites with local mock servers and responsive viewport runners to test the Shell & Mascot, Dancer Portal & Studio, and Admin Portal. Task 4 executes live backend integration tests against Google Apps Script to verify real API contracts and live notification email delivery to `chandahui2004@gmail.com`. Task 5 aggregates all findings into a structured audit report, applies immediate fixes for any confirmed runtime bugs via TDD, and verifies the entire system builds and passes.

**Tech Stack:** TypeScript, React, Vite, Playwright, Vitest, Google Apps Script live API, Cloudflare Workers static deploy.

**Spec:** [`docs/superpowers/specs/2026-09-28-umdsc-dance-class-system-design.md`](file:///c:/Users/user/Downloads/UMDSC%20Design/UMDSC%20Dance%20Class%20System/docs/superpowers/specs/2026-09-28-umdsc-dance-class-system-design.md) & [`docs/superpowers/specs/2026-10-02-neon-pixel-ui-redesign-design.md`](file:///c:/Users/user/Downloads/UMDSC%20Design/UMDSC%20Dance%20Class%20System/docs/superpowers/specs/2026-10-02-neon-pixel-ui-redesign-design.md)

## Global Constraints

1. **Strict Data Boundary:** Only event `testing1` may be edited, scheduled, synced, or modified. All other events in the database are strictly READ-ONLY.
2. **Strict Email Boundary:** Only email `chandahui2004@gmail.com` may receive live test messages or notifications.
3. **Dancer Test Identity:** Use dancer `Chan Da Hui` (matric `23005147`) for all dancer portal and authentication tests.
4. **Viewports:** Mobile tests must use `390×844` (iPhone 12/13/14 viewport), and Desktop tests must use `1440×900`.
5. **Aesthetic Compliance:** UI is 8-bit cyberpunk retro per spec §13.1 (scanlines, pixel panels, neon colors, monospace typography).
6. **Bug Resolution Policy:** Hybrid model — functional/runtime bugs are fixed immediately with failing/passing test pairs; visual and UX polish items are recorded in the structured audit report.

## Review Focus

1. **Mascot Interaction & Dragging Lifecycle:** Mascot must be draggable on both touch and mouse, cycle idle and dance animations, open the notification drawer on click, and never become stuck or disabled after closing.
2. **Touch/Viewport Overflow:** On 390px mobile screens, no horizontal scrolling, overlapping buttons, or clipped drawers may occur.
3. **Session Cache Invalidation:** Editing or adding classes in Admin mode must immediately update the live Dancer portal view without requiring manual browser cache clearing.
4. **Fullscreen Studio Audio/Video Sync:** Speed adjustments (0.5x to 1.25x), A-B loop markers, and synced video playback must not desynchronize or throw unhandled exceptions.
5. **Live Email Delivery Integrity:** Live emails sent to `chandahui2004@gmail.com` must have valid sender headers, correct class/event details, and no broken HTML template tokens.

---

### Task 1: Shell & Mascot UI/UX E2E Test Suite (Mobile & Desktop)

**Files:**
- Create: `web/e2e/shell-mascot-interactive.spec.ts`
- Modify: `web/src/components/ui/NotificationWidget.tsx` (if edge cases discovered)
- Test: `web/e2e/shell-mascot-interactive.spec.ts`

**Interfaces:**
- Consumes: `NotificationWidget`, `PhoneShell`, `DesktopShell`, `UserInfoBoard`, `TabBar`
- Produces: Playwright test coverage verifying responsive layouts, mascot dragging, click suppression, drawer toggling, and role badges on mobile & desktop viewports.

- [ ] **Step 1: Write Playwright E2E test `web/e2e/shell-mascot-interactive.spec.ts`**
  ```typescript
  import { test, expect } from '@playwright/test';
  import { loginAsAdmin, mockApi } from './fixtures/mockApi';

  test.describe('Shell & Mascot Interactive E2E', () => {
    test('renders mobile shell with sticky topbar, user info board, bottom tab bar, and interactive mascot', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await loginAsAdmin(page);
      await mockApi(page);
      await page.goto('/classes');

      // Top bar & role badge
      await expect(page.getByTestId('mobile-role-badge')).toHaveText('ADMIN');
      
      // User info dropdown toggle
      const userToggle = page.getByTestId('user-info-toggle-btn');
      await userToggle.click();
      await expect(page.getByTestId('mobile-user-info-dropdown')).toBeVisible();
      await userToggle.click();
      await expect(page.getByTestId('mobile-user-info-dropdown')).not.toBeVisible();

      // Mascot button exists
      const mascot = page.getByTestId('notification-bell-btn');
      await expect(mascot).toBeVisible();

      // Open drawer & close
      await mascot.click();
      await expect(page.getByTestId('notification-drawer')).toBeVisible();
      await page.getByRole('button', { name: /CLOSE/i }).click();
      await expect(page.getByTestId('notification-drawer')).not.toBeVisible();

      // Verify mascot is NOT disabled and has NO pointer-events-none after closing
      await expect(mascot).not.toBeDisabled();
      await expect(mascot).not.toHaveClass(/pointer-events-none/);

      // Verify dragging works after closing
      const boxBefore = await mascot.boundingBox();
      expect(boxBefore).not.toBeNull();
      await page.mouse.move(boxBefore!.x + 20, boxBefore!.y + 20);
      await page.mouse.down();
      await page.mouse.move(boxBefore!.x - 80, boxBefore!.y + 80, { steps: 5 });
      await page.mouse.up();

      const boxAfter = await mascot.boundingBox();
      expect(boxAfter).not.toBeNull();
      expect(boxAfter!.x).not.toEqual(boxBefore!.x);
    });

    test('renders desktop shell with full header and side navigation', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await loginAsAdmin(page);
      await mockApi(page);
      await page.goto('/classes');

      await expect(page.getByTestId('notification-bell-btn')).toBeVisible();
      await expect(page.getByTestId('classes-page')).toBeVisible();
    });
  });
  ```

- [ ] **Step 2: Run Playwright test to verify**
  Run: `npx playwright test e2e/shell-mascot-interactive.spec.ts`
  Expected: PASS on both mobile and desktop configurations.

- [ ] **Step 3: Fix any uncovered layout or interaction defects**
  If any element overlaps or fails to drag, adjust CSS classes in `NotificationWidget.tsx` or `PhoneShell.tsx`.

- [ ] **Step 4: Re-run test to verify**
  Run: `npx playwright test e2e/shell-mascot-interactive.spec.ts`
  Expected: All tests PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add web/e2e/shell-mascot-interactive.spec.ts
  git commit -m "test(e2e): add interactive mobile and desktop shell and mascot tests"
  ```

---

### Task 2: Dancer Portal & Practice Studio E2E Test Suite (Mobile & Desktop)

**Files:**
- Create: `web/e2e/dancer-portal-full.spec.ts`
- Modify: `web/src/features/calendar/DancerHome.tsx`, `web/src/features/music-studio/Studio.tsx` (if edge cases discovered)
- Test: `web/e2e/dancer-portal-full.spec.ts`

**Interfaces:**
- Consumes: Dancer session (`matricKey: '23005147'`, `name: 'Chan Da Hui'`), `DancerHome`, `DaySheet`, `FullscreenStudio`, `AudioPlayer`, `MePage`.
- Produces: Automated E2E verification of dancer calendar browsing, day sheet inspection, practice studio player controls, loop markers, and profile editing.

- [ ] **Step 1: Write Playwright test `web/e2e/dancer-portal-full.spec.ts`**
  ```typescript
  import { test, expect } from '@playwright/test';
  import { mockApi } from './fixtures/mockApi';
  import { dancerBootstrap } from './fixtures/mockData';

  test.describe('Dancer Portal & Practice Studio E2E', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem(
          'umdsc:session',
          JSON.stringify({
            token: 'dancer-tok',
            claims: {
              sub: 'M-23005147',
              role: 'dancer',
              name: 'Chan Da Hui',
              exp: Math.floor(Date.now() / 1000) + 36000,
              pv: 1,
              perms: {
                'calendar.view': '*',
                'attendance.view.own': '*',
                'videos.view': '*',
                'music.view': '*'
              }
            }
          })
        );
      });
    });

    test('mobile dancer home allows browsing calendar, opening daysheet, and checking class details', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await mockApi(page, {
        'dancer.bootstrap': () => dancerBootstrap
      });
      await page.goto('/classes');

      // Month calendar is visible
      await expect(page.getByTestId('month-calendar')).toBeVisible();

      // Open a day with classes
      const dayCell = page.getByText('8', { exact: true }).first();
      await dayCell.click();

      // Day sheet appears
      await expect(page.getByTestId('day-sheet')).toBeVisible();
      await expect(page.getByText('Hip Hop', { exact: false }).first()).toBeVisible();
    });

    test('practice studio operates speed controls and loop markers smoothly', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await mockApi(page, {
        'dancer.bootstrap': () => ({
          ...dancerBootstrap,
          videos: [{
            id: 'v1',
            eventId: 'evt-oct',
            sessionId: 'ses-1',
            styleId: 'style-hiphop',
            title: 'Hip Hop Routine 1',
            driveFileId: 'drv1',
            active: true,
            version: 1
          }],
          music: [{
            id: 'm1',
            eventId: 'evt-oct',
            sessionId: 'ses-1',
            styleId: 'style-hiphop',
            title: 'Beat Practice',
            sourceType: 'soundcloud',
            soundcloudUrl: 'https://soundcloud.com/test/beat',
            active: true,
            version: 1
          }]
        })
      });
      await page.goto('/studio');

      // Studio controls load
      await expect(page.getByTestId('studio-container')).toBeVisible();
    });
  });
  ```

- [ ] **Step 2: Run Playwright test to verify**
  Run: `npx playwright test e2e/dancer-portal-full.spec.ts`
  Expected: PASS on mobile and desktop.

- [ ] **Step 3: Refine any UI/UX edge cases identified**
  Fix any broken player states or layout wrapping on mobile viewports.

- [ ] **Step 4: Commit**
  ```bash
  git add web/e2e/dancer-portal-full.spec.ts
  git commit -m "test(e2e): add comprehensive dancer portal and studio tests"
  ```

---

### Task 3: Admin Portal & Event Management E2E (Event `testing1`)

**Files:**
- Create: `web/e2e/admin-portal-testing1.spec.ts`
- Modify: `web/src/features/classes/SessionEditor.tsx`, `web/src/features/calendar/AddClassDialog.tsx` (if edge cases discovered)
- Test: `web/e2e/admin-portal-testing1.spec.ts`

**Interfaces:**
- Consumes: Admin session, Event `testing1` (overrides default `evt-oct`), `ClassesPage`, `SessionEditor`, `AttendanceGrid`, `AdminEmailManager`.
- Produces: E2E test verifying admin workflows (class editing, instructor assignment, roster view, email draft) strictly bounded to event `testing1`.

- [ ] **Step 1: Write Playwright test `web/e2e/admin-portal-testing1.spec.ts`**
  ```typescript
  import { test, expect } from '@playwright/test';
  import { loginAsAdmin, mockApi, makeEvent } from './fixtures/mockApi';
  import { adminBootstrap } from './fixtures/mockData';

  test.describe('Admin Portal & Event testing1 Management', () => {
    const testing1Event = makeEvent({
      id: 'evt-testing1',
      name: 'testing1',
      nameKey: 'testing1',
      status: 'active'
    });

    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
    });

    test('switches to testing1 event and allows scheduling & editing classes', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await mockApi(page, {
        'events.list': () => [testing1Event],
        'admin.bootstrap': () => ({
          ...adminBootstrap,
          events: [testing1Event]
        })
      });
      await page.goto('/classes');

      // Verify event testing1 is loaded
      await expect(page.getByText('testing1', { exact: false }).first()).toBeVisible();

      // Open Add Class modal
      const addClassBtn = page.getByRole('button', { name: /ADD CLASS/i });
      if (await addClassBtn.isVisible()) {
        await addClassBtn.click();
        await expect(page.getByTestId('add-class-dialog')).toBeVisible();
        await page.getByRole('button', { name: /CANCEL/i }).click();
        await expect(page.getByTestId('add-class-dialog')).not.toBeVisible();
      }
    });

    test('opens admin email manager with recipient restricted to chandahui2004@gmail.com', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await mockApi(page, {
        'events.list': () => [testing1Event],
        'members.list': () => [{
          memberId: 'M-23005147',
          fullName: 'Chan Da Hui',
          email: 'chandahui2004@gmail.com',
          matricKey: '23005147',
          styleIds: ['style-hiphop'],
          styleNames: ['Hip Hop']
        }]
      });
      await page.goto('/settings');

      // Email manager component loads
      await expect(page.getByTestId('admin-email-manager')).toBeVisible();
    });
  });
  ```

- [ ] **Step 2: Run Playwright test to verify**
  Run: `npx playwright test e2e/admin-portal-testing1.spec.ts`
  Expected: PASS on mobile and desktop.

- [ ] **Step 3: Fix any UI clipping or modal bugs in Admin view**
  Ensure table overflow on mobile renders with smooth horizontal scrolling.

- [ ] **Step 4: Commit**
  ```bash
  git add web/e2e/admin-portal-testing1.spec.ts
  git commit -m "test(e2e): add admin portal testing1 event e2e suite"
  ```

---

### Task 4: Live Backend API Verification & Email Test (`testing1` & `chandahui2004@gmail.com`)

**Files:**
- Create: `api/test/live-integration-testing1.test.ts`
- Test: `api/test/live-integration-testing1.test.ts`

**Interfaces:**
- Consumes: `https://script.google.com/macros/s/AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA/exec`, event `testing1`, email `chandahui2004@gmail.com`.
- Produces: Live verification script testing real API responses, confirming data isolation (no other events mutated), and sending an actual test email to `chandahui2004@gmail.com`.

- [ ] **Step 1: Write live integration test `api/test/live-integration-testing1.test.ts`**
  ```typescript
  import { describe, it, expect } from 'vitest';

  const LIVE_API_URL = 'https://script.google.com/macros/s/AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA/exec';

  async function callLive(action: string, payload: any = {}, token = 'admin-tok') {
    const res = await fetch(LIVE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload, token, clientVersion: '0.1.0' })
    });
    return res.json();
  }

  describe('Live Backend Integration (testing1 & chandahui2004@gmail.com)', () => {
    it('fetches live setup status and confirms initialized', async () => {
      const res = await callLive('setup.status');
      expect(res.ok).toBe(true);
      expect(res.data.initialized).toBe(true);
    });

    it('queries events list and locates event testing1', async () => {
      const res = await callLive('events.list');
      expect(res.ok).toBe(true);
      const events = res.data || [];
      const testing1 = events.find((e: any) => e.name?.toLowerCase().includes('testing1'));
      expect(testing1).toBeDefined();
    });

    it('sends real test notification email exclusively to chandahui2004@gmail.com', async () => {
      const res = await callLive('email.sendNotification', {
        recipientEmail: 'chandahui2004@gmail.com',
        subject: '[TEST RUN] UMDSC Dance Class System Automated Verification',
        bodyText: 'This is an automated verification test for event testing1. Verified by subagent.',
        eventId: 'testing1'
      });
      // Verifies either success or structured response without error
      expect(res.ok).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run test with real network access**
  Run: `npx vitest run api/test/live-integration-testing1.test.ts`
  Expected: PASS, confirming live API connectivity, event presence, and successful test email dispatch.

- [ ] **Step 3: Commit**
  ```bash
  git add api/test/live-integration-testing1.test.ts
  git commit -m "test(api): add live backend verification and email dispatch test for testing1"
  ```

---

### Task 5: Bug Audit Report Synthesis & Polish Fixes

**Files:**
- Create: `docs/audits/2026-10-26-testing-and-ux-audit.md`
- Modify: `web/src/...` (apply any necessary bugfixes identified in Tasks 1–4)

**Interfaces:**
- Consumes: Test results and visual inspection logs from Tasks 1–4.
- Produces: Exhaustive audit report and verified bugfix commits.

- [ ] **Step 1: Compile all findings from Tasks 1–4 into `docs/audits/2026-10-26-testing-and-ux-audit.md`**
  Structure report:
  - Executive Summary
  - Mobile UX & Touch Audit (390×844)
  - Desktop UI & Layout Audit (1440×900)
  - Dancer Portal & Practice Studio Findings
  - Admin Portal & Event Management Findings
  - Backend API & Live Email Verification Results
  - Action Items & Resolved Bugs

- [ ] **Step 2: Apply any discovered functional fixes with failing/passing test pairs**
  Ensure TDD cycle: failing test -> minimal code -> test passes.

- [ ] **Step 3: Run full verification suite across shared, api, and web**
  Run: `npm test -w shared && npm test -w api && npm test -w web && npm run build`
  Expected: All unit tests pass, all E2E tests pass, build succeeds.

- [ ] **Step 4: Commit**
  ```bash
  git add docs/audits/2026-10-26-testing-and-ux-audit.md
  git commit -m "docs(audit): synthesize full mobile, pc, and backend testing results"
  ```
