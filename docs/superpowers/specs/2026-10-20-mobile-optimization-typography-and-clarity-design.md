# Mobile Optimization, Typography Enlargement & UI Clarity — Design Spec

**Date:** 2026-10-20  
**Status:** Approved via interactive design review  
**Scope:** Frontend (`web/`) performance, typography, and content streamlining

---

## 1. Problem Statement & Goals

1. **Tiny Pixel Fonts on Mobile:** Several components currently render text at `9px` or `10px` in `Press Start 2P` or condensed `VT323`. On mobile screens, these are difficult to decipher and cause strain.
2. **Visual Clutter & Verbose Text:** Certain pages (Settings, Event Cards, Mobile Shell header, Calendar DaySheet, Studio controls) contain redundant explanatory sentences, long instructions, or repetitive helper text that clutter the UI on small screens.
3. **Mobile Scrolling Lag:** Infinite CSS keyframe animations (`px-drift-far`, `px-twinkle`), scanline pseudo-element overlays, and nested inset box shadows cause composite and repaint lag during touch scrolling on low-power mobile devices.

### Goals
- **Enforce an 11px-12px minimum font floor** for pixel fonts (`Press Start 2P` and `Pixelify Sans`), and **14px-16px for condensed `VT323`**, ensuring all badges, tab labels, date numbers, and button texts are easily readable on phones.
- **Streamline UI copy:** Replace multi-line verbose paragraphs with crisp, informative badges and concise labels across Settings, Event Cards, Mobile Shell, Calendar DaySheet, and Studio controls.
- **Eliminate mobile lag:** Optimize heavy animations on mobile viewports (`@media (max-width: 768px)`), apply GPU transform acceleration, and simplify shadow repaints for smooth 60fps scrolling.
- **Maintain 100% retro 8-bit neon aesthetic** without violating `GEMINI.md` styling rules.
- **Preserve all 840 tests green** with updated test assertions where labels are streamlined.

---

## 2. Typography & Font Size Architecture

### 2.1 Token Updates (`web/src/theme/tokens.css`)
- Update `--min-font-size: 11px;` (was `8px`).
- Define `--text-micro: 11px;` (was `8px`).
- Standardize pixel type sizes:
  - `font-display` (`Press Start 2P`): minimum `11px` (micro badges/tabs), standard `12px` - `14px`, headers `16px` - `20px`.
  - `font-mono` (`VT323`): minimum `14px` (time/slots/status), standard `16px` - `18px`, large digits `20px` - `28px`.
  - `font-body` (`Pixelify Sans`): minimum `14px`, standard `16px`, large `18px` - `20px`.

### 2.2 Component Typography Fixes
- **Mobile TabBar (`TabBar.tsx`):**
  - Tab labels: `text-[10px]` → `text-[11px] font-display tracking-normal` (or `text-xs`).
  - More sheet navigation items: `text-[10px]` → `text-[12px]`.
- **Calendar (`MonthCalendar.tsx` & `DaySheet.tsx`):**
  - Weekday labels: `text-[10px]` → `text-[11px] font-display font-bold`.
  - Date tiles: `text-[10px]` → `text-[12px] font-display` for current month, with high-contrast text tokens.
  - Hover tooltip: Date title `text-[9px]` → `text-[11px] font-display`; class name `text-xs` (12px); time & instructor `text-[10px]` → `text-[13px] font-mono`.
  - DaySheet class cards: venue/instructor/time bumped to `14px-16px font-mono`.
- **Top Shell & User Status Bar (`PhoneShell.tsx`):**
  - Role badge (`ADMIN`/`DANCER`): `text-[10px]` → `text-[11px] font-bold`.
  - Username toggle button: `text-[10px]` → `text-[11px] font-display`.
  - Nav toggle (`HIDE NAV` / `SHOW NAV`): `text-[10px]` → `text-[11px] font-display`.
- **Admin Email Cards (`AdminEmailManager.tsx`):**
  - Email badges & action buttons: `text-[10px]` → `text-[11px] font-display`, email address `text-sm font-mono` (14px).
- **Music Studio (`FullscreenStudio.tsx` & `VideoPanel.tsx`):**
  - Loop marker tags and control button labels: `text-[10px]` → `text-[11px] font-display` / `text-[14px] font-mono`.

---

## 3. UI Clarity & Content Streamlining

### 3.1 Settings Page (`SettingsPage.tsx`)
- **Before:** Multi-paragraph explanations about Google Drive folder structures, token secrets, and retention rules.
- **After:**
  - Replace verbose intro text with concise status badges (e.g. `LIVE ALERTS ACTIVE`, `GMAIL CONNECTED`).
  - Shorten field helper hints from 2-3 lines to crisp 1-line guidance.
  - Remove redundant repetitive phrases.

### 3.2 Mobile Shell Header (`PhoneShell.tsx`)
- Compact the top bar: clean alignment between Brand (`UMDSC`), Role Badge, Live Clock, and Username button.
- Make the user profile dropdown clean, punchy, and quick to dismiss.

### 3.3 Event Cards (`EventCard.tsx`)
- Replace verbose `"Form: open response sheet ↗"` and `"Last sync: ..."` with compact inline badges:
  - `[SPREADSHEET ↗]` button.
  - `[SYNCED: 20 Oct 08:30]` compact mono chip.
  - Streamlined slot pill: `[POPPING · 15/20]` with green/red indicator.

### 3.4 Calendar & DaySheet (`ClassesPage.tsx`, `DaySheet.tsx`)
- Remove redundant subheadings like `"Selected Date Classes"` and repetitive instructional text.
- Header directly shows the formatted date (e.g. `TUE, 20 OCT 2026`) and class count chip (`2 CLASSES`).

### 3.5 Music Studio Player Controls (`FullscreenStudio.tsx`)
- Shorten button labels: e.g. `"DRAG ⚑ TO ALIGN VIDEO START"` → `"ALIGN VIDEO ⚑"`, concise status pills.

---

## 4. Mobile Performance & Lag Elimination

### 4.1 Background Animation Throttling (`pixel.css`)
- On mobile (`@media (max-width: 768px)`):
  - Disable continuous background translation animations `px-drift-far` and `px-twinkle` on `px-starfield`, locking it to a static clean starfield tile. This eliminates continuous compositing recalculations and GPU memory bandwidth consumption.
  - Remove `px-scanlines` pseudo-element overhead on phone screens or simplify to a lightweight static opacity.

### 4.2 Hardware Acceleration & Shadow Streamlining
- Add `transform: translateZ(0)` and `contain: content` to scrollable containers (`overflow-y-auto pixel-scrollbar`).
- Simplify multi-layered `box-shadow` on mobile elements inside repeated lists (e.g. attendance rows and member lists) so scroll repaints remain well within 16.6ms (60fps).

---

## 5. Verification & Testing Strategy

1. **Playwright E2E Mobile Suite (`phone-layout.spec.ts`):** Verify 360px and 390px viewports with zero horizontal overflow, visible text, and touch target sizes >= 44px.
2. **Unit Tests (`npm test`):** Update any test assertions matching modified text labels (e.g. in `EventCard.test.tsx` or `TabBar.test.tsx`).
3. **Production Build (`npm run build`):** Zero compilation or bundling warnings.
4. **Visual Review:** Inspect mobile rendering in browser subagent / responsive mode.
