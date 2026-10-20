# Mobile Optimization, Typography Enlargement & UI Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate mobile scrolling lag by throttling heavy CSS animations on phones, enlarge all tiny pixel text below 11px to an accessible 11px-16px scale, and streamline verbose UI copy across Settings, Event Cards, Calendar, and Studio for maximum visual clarity.

**Architecture:**
- CSS tokens & performance: Update `tokens.css` with an 11px minimum font floor, and adapt `pixel.css` with `@media (max-width: 768px)` rules to pause continuous background starfield translations and add GPU transform acceleration (`transform: translateZ(0)`).
- Component typography: Enlarge tiny `9px-10px` Press Start 2P & VT323 labels to `11px-12px` in TabBar, PhoneShell, MonthCalendar, DaySheet, and FullscreenStudio.
- Content clarity: Convert lengthy explanatory paragraphs into crisp retro status badges and concise 1-line hints in `SettingsPage`, `EventCard`, `PhoneShell`, and `DaySheet`.

**Tech Stack:** TypeScript, React, Tailwind CSS, TanStack Query, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-20-mobile-optimization-typography-and-clarity-design.md`

## Global Constraints
- Retro 8-bit neon pixel aesthetic (font-display, font-mono, font-body, pixel borders, glowing accents, no rounded pill designs) strictly preserved.
- All existing 840 tests must remain green.
- Touch target sizes must remain >= 44px on mobile viewports.

---

### Task 1: Mobile Performance & CSS Animation Throttling

**Skills:** `ui-styling`, `ui-ux-pro-max`

**Files:**
- Modify: `web/src/theme/pixel.css`
- Modify: `web/src/theme/tokens.css`

**Interfaces:**
- Produces: Smooth 60fps scrolling on mobile devices without continuous CPU/GPU composition lag from repeating starfield drift or scanline gradients.

- [x] **Step 1: Inspect and update `pixel.css` for mobile responsiveness**
  - Add `@media (max-width: 768px)` rule for `.px-starfield`:
    - Disable `animation: px-drift-far` and `animation: px-twinkle` on mobile; keep the crisp static pixel starfield pattern.
    - Set `.px-scanlines::after` opacity to `0` or disable on mobile touch viewports to eliminate screen-wide repaints during touch scroll.
  - In `.pixel-scrollbar`: add `transform: translateZ(0)` and `will-change: scroll-position` for hardware-accelerated inertia scrolling.

- [x] **Step 2: Verify `tokens.css` minimum font and text micro scale**
  - Change `--min-font-size: 8px;` to `--min-font-size: 11px;`.
  - Update `--text-micro: 8px;` in `@theme` to `--text-micro: 11px;`.

- [x] **Step 3: Run build and tests to verify syntax and theme consistency**
  - Run: `npm --workspace=@umdsc/web run build`
  - Expected: PASS.

- [x] **Step 4: Commit**
  ```bash
  git add web/src/theme/pixel.css web/src/theme/tokens.css
  git commit -m "perf(web): throttle mobile starfield animations and update font floor token"
  ```

---

### Task 2: Typography Scale & Minimum Font Floor in Navigation & Shell

**Skills:** `ui-ux-pro-max`, `impeccable`

**Files:**
- Modify: `web/src/components/ui/TabBar.tsx`
- Modify: `web/src/app/PhoneShell.tsx`
- Modify: `web/src/components/ui/UserInfoBoard.tsx`
- Test: `web/src/components/ui/TabBar.test.tsx` (or e2e)

**Interfaces:**
- Produces: Mobile bottom tabs, role badges, header username button, and more sheet items enlarged to `text-[11px]` and `text-[12px]`, dramatically improving readability on small phone displays.

- [x] **Step 1: Enlarge fonts in `TabBar.tsx`**
  - Bottom dock tab labels: `text-[10px]` → `text-[11px] font-display tracking-tight`.
  - More sheet navigation items: `text-[10px]` → `text-[12px] font-display`.

- [x] **Step 2: Enlarge fonts and clean up top bar in `PhoneShell.tsx`**
  - Role badge (`ADMIN` / `DANCER`): `text-[10px]` → `text-[11px] font-display font-bold`.
  - Username toggle button: `text-[10px]` → `text-[11px] font-display`.
  - Nav toggle button (`HIDE NAV` / `SHOW NAV`): `text-[10px]` → `text-[11px] font-display`.
  - Skyline strip: clean padding and alignment.

- [x] **Step 3: Enlarge fonts and simplify `UserInfoBoard.tsx`**
  - Header label: `text-[10px]` → `text-[12px] font-display`.
  - User role badge: `text-[10px]` → `text-[12px] font-display`.
  - Matriks number & username: `text-sm font-mono` → `text-base font-mono` (16px).

- [x] **Step 4: Run unit tests to verify no regressions**
  - Run: `npm --workspace=@umdsc/web test TabBar UserInfoBoard`
  - Expected: PASS.

- [x] **Step 5: Commit**
  ```bash
  git add web/src/components/ui/TabBar.tsx web/src/app/PhoneShell.tsx web/src/components/ui/UserInfoBoard.tsx
  git commit -m "style(ui): enlarge mobile nav tabs and shell typography to 11px-12px minimum"
  ```

---

### Task 3: Calendar Date Numbers & Tooltip Font Enlargement

**Skills:** `ui-ux-pro-max`, `impeccable`

**Files:**
- Modify: `web/src/components/ui/MonthCalendar.tsx`
- Modify: `web/src/features/calendar/DaySheet.tsx`
- Test: `web/src/components/ui/MonthCalendar.test.tsx`

**Interfaces:**
- Produces: Highly visible weekday labels, date digits, hover tooltip text, and DaySheet class cards.

- [x] **Step 1: Enlarge fonts in `MonthCalendar.tsx`**
  - Weekday labels: `text-[10px]` → `text-[11px] md:text-[12px] font-display font-bold`.
  - Calendar day digits: `text-[10px] md:text-[12px]` → `text-[12px] md:text-[14px] font-display font-bold`.
  - Hover tooltip date title: `text-[9px]` → `text-[11px] font-display font-bold text-[var(--neon-gold)]`.
  - Hover tooltip time and instructor: `text-[10px]` → `text-[13px] font-mono`.

- [x] **Step 2: Enlarge fonts and streamline headers in `DaySheet.tsx`**
  - Class title: `text-base` (16px) `font-display`.
  - Venue, instructor, and time: `text-[12px]` → `text-[14px] font-mono` with clear icons.
  - Streamline subtitle from generic text to formatted date & class count badge.

- [x] **Step 3: Run tests to verify MonthCalendar**
  - Run: `npm --workspace=@umdsc/web test MonthCalendar`
  - Expected: PASS.

- [x] **Step 4: Commit**
  ```bash
  git add web/src/components/ui/MonthCalendar.tsx web/src/features/calendar/DaySheet.tsx
  git commit -m "style(calendar): enlarge date digits, weekday labels, and tooltip typography"
  ```

---

### Task 4: Content Streamlining & Typography in Settings Page

**Skills:** `ui-ux-pro-max`, `code-simplifier`

**Files:**
- Modify: `web/src/features/settings/SettingsPage.tsx`
- Modify: `web/src/features/settings/AdminEmailManager.tsx`
- Test: `web/src/features/settings/AdminEmailManager.test.tsx`

**Interfaces:**
- Produces: Clean, uncluttered Settings page with concise 1-line guidance, retro status chips instead of long paragraphs, and enlarged button labels.

- [x] **Step 1: Streamline copy in `SettingsPage.tsx`**
  - Replace verbose intro paragraphs with compact status badges (`LIVE ALERTS ACTIVE`, `GMAIL CONNECTED`).
  - Shorten field descriptions from 2-3 sentences to crisp single-line instructions.
  - Enlarge history status badges and retention notes to `text-[11px]` minimum.

- [x] **Step 2: Enlarge button & badge text in `AdminEmailManager.tsx`**
  - `ADD NOTIFICATION EMAIL` label: `text-[10px]` → `text-[11px] font-display font-bold`.
  - Card action buttons (`EDIT`, `DELETE`): `text-[10px]` → `text-[11px] font-display`.
  - Email address: `text-sm font-mono` → `text-base font-mono` (16px).

- [x] **Step 3: Run tests to verify AdminEmailManager**
  - Run: `npm --workspace=@umdsc/web test AdminEmailManager`
  - Expected: PASS.

- [x] **Step 4: Commit**
  ```bash
  git add web/src/features/settings/SettingsPage.tsx web/src/features/settings/AdminEmailManager.tsx
  git commit -m "style(settings): streamline verbose copy and enlarge email management typography"
  ```

---

### Task 5: Content Streamlining on Event Cards & Master Data

**Skills:** `code-simplifier`, `ui-ux-pro-max`

**Files:**
- Modify: `web/src/features/events/EventCard.tsx`
- Modify: `web/src/features/events/FolderLinksHeader.tsx`

**Interfaces:**
- Produces: Concise Event Cards with compact badges instead of verbose text strings (`[SPREADSHEET ↗]`, `[SYNCED: 20 Oct 08:30]`).

- [x] **Step 1: Streamline text and badges in `EventCard.tsx`**
  - Change `"Form: open response sheet ↗"` to a compact pixel button/badge `[SPREADSHEET ↗]`.
  - Format last sync as a concise chip `SYNCED: {date}`.
  - Streamline slot badges: ensure slots and availability use `text-[12px] font-mono`.

- [x] **Step 2: Streamline `FolderLinksHeader.tsx`**
  - Remove redundant instructional text; provide concise action links with clear retro folder icons.

- [x] **Step 3: Run web tests**
  - Run: `npm --workspace=@umdsc/web test`
  - Expected: PASS.

- [x] **Step 4: Commit**
  ```bash
  git add web/src/features/events/EventCard.tsx web/src/features/events/FolderLinksHeader.tsx
  git commit -m "style(events): streamline event card text with compact retro badges"
  ```

---

### Task 6: Controls Cleanup & Typography in Music Studio

**Skills:** `ui-ux-pro-max`, `code-simplifier`

**Files:**
- Modify: `web/src/features/music-studio/FullscreenStudio.tsx`
- Modify: `web/src/features/music-studio/sync/VideoPanel.tsx`
- Modify: `web/src/features/music-studio/sync/VideoTimeline.tsx`

**Interfaces:**
- Produces: Concise Studio controls with clear, enlarged labels (`text-[11px]` font-display and `text-[13px]` font-mono), removing cramped or cut-off text.

- [x] **Step 1: Enlarge and shorten timeline controls in `VideoTimeline.tsx`**
  - Shorten `"DRAG ⚑ TO ALIGN VIDEO START"` → `"ALIGN VIDEO ⚑"` with `text-[11px] font-display font-bold`.
  - Enlarge flag time badge from `text-[10px]` to `text-[12px] font-mono`.

- [x] **Step 2: Enlarge loop marker tags and control labels in `FullscreenStudio.tsx`**
  - Enlarge buttons and status indicators from `text-[10px]` to `text-[11px] font-display`.
  - Ensure all loop time markers use `text-[13px] font-mono`.

- [x] **Step 3: Run studio tests**
  - Run: `npm --workspace=@umdsc/web test FullscreenStudio VideoTimeline`
  - Expected: PASS.

- [x] **Step 4: Commit**
  ```bash
  git add web/src/features/music-studio/FullscreenStudio.tsx web/src/features/music-studio/sync/VideoPanel.tsx web/src/features/music-studio/sync/VideoTimeline.tsx
  git commit -m "style(studio): enlarge control typography and streamline video timeline labels"
  ```

---

### Task 7: Full Monorepo Verification, E2E Mobile Testing & Publish

**Skills:** `verification-before-completion`, `finishing-a-development-branch`

**Files:**
- Full repository test suite (`npm test`)
- Playwright mobile layout suite (`phone-layout.spec.ts`)
- Production build (`npm run build`)
- Git push to `origin/main`

- [x] **Step 1: Run full test suite**
  - Run: `npm test`
  - Expected: PASS (840+ tests pass).

- [x] **Step 2: Run Playwright mobile layout tests**
  - Run: `npm --workspace=@umdsc/web run e2e -- phone-layout.spec.ts`
  - Expected: PASS (all 12 mobile checks pass at 360px and 390px).

- [x] **Step 3: Run production build**
  - Run: `npm run build`
  - Expected: PASS.

- [x] **Step 4: Push to origin/main**
  - Run: `git push origin main`
  - Expected: Published cleanly to Cloudflare.
