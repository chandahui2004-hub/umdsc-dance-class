# Animated Dancing Mascot Notification Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static floating notification button with an interactive 8-bit animated chibi dancer mascot that plays an idle loop during user interaction and starts dancing when inactive for 15 seconds.

**Architecture:** A lightweight React architecture composed of an inactivity timer hook (`useInactivityTimer`), a dedicated CSS sprite animator component (`MascotAvatar`), and an automated image processing pipeline (`sharp` script) to produce transparent sprite sheets from user-provided source images. The mascot is wired into `NotificationWidget` preserving all floating drag, click, unread badge counter, and notification drawer behaviors.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4 (with custom CSS variables for 8-bit styling), Vitest, Sharp, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-animated-mascot-notification-widget-design.md`

## Global Constraints

- **8-Bit Cyberpunk Aesthetic:** Maintain strict retro styling: zero `border-radius`, hard box-shadows `shadow-[4px_4px_0_var(--outline)]`, pixel fonts (`font-display: 'Press Start 2P'`, `font-mono: 'VT323'`).
- **No Godot / Zero Heavy Dependencies:** Pure web-native solution using CSS sprites and React; no canvas engines or WASM runtimes. Combined asset payload strictly < 250 KB.
- **Asset Preservation:** Sprite processing must use perimeter flood-fill alpha transparency so internal black features (pupils, beanie stitch, jacket seams) remain crisp and non-transparent.
- **Inactivity Period:** Inactivity threshold is exactly 15,000ms (15s); activity events: `pointermove`, `pointerdown`, `keydown`, `touchstart`, `scroll`.
- **Responsive Dimensions:** Mobile (< 640px): 52px width × 70px height; Desktop (>= 640px): 64px width × 86px height.
- **Animation Timing:** 8 frames per animation loop at 8 frames per second (125ms per frame = 1000ms cycle).

## Review Focus

1. **Internal Black Pixel Erasure:** Sprite background removal must only strip outer `#000000` background; internal dark pixels of character outline/eyes must stay fully opaque.
2. **Timer Event Thrashing:** Window event listeners on `pointermove` or `scroll` must not trigger React state re-renders while active; only state transitions (active <-> inactive) trigger re-renders.
3. **Drag vs Click Discrimination:** Moving the mascot $> 4\text{px}$ is a drag reposition; click $\le 4\text{px}$ opens/closes the drawer. Dragging must never inadvertently open the drawer upon pointer release.
4. **Z-Index and Viewport Clamping:** Mascot must clamp within viewport bounds `[8px, innerWidth - mascotWidth - 8px]` and stay at `z-40` beneath drawer backdrop (`z-50`).
5. **Drawer Open Animation Suppression:** While notification drawer is open (`isOpen = true`), mascot must remain in `idle` animation even if user is inactive.

---

### Task 1: Sprite Sheet Processing Pipeline Script

**Sub-agent Recommended Skills:**
- `test-driven-development` (TDD verification of asset generation script)
- `verification-before-completion` (verifying generated image dimensions, formats, transparency)

**Files:**
- Create: `web/scripts/process-mascot-sprites.mjs`
- Test: `web/scripts/process-mascot-sprites.test.mjs`
- Output Assets:
  - `web/public/mascot/mascot-idle.png`
  - `web/public/mascot/mascot-dance-1.png`
  - `web/public/mascot/mascot-dance-2.png`
  - `web/public/mascot/mascot-dance-3.png`

**Interfaces:**
- Consumes: User-provided sprite sheet JPEG artifacts (`media_1792820449665.jpg` [idle], `media_1792820449561.jpg` [dance-1], `media_1792820449738.jpg` [dance-2], `media_1792820449787.jpg` [dance-3]) located in `C:/Users/user/.gemini/antigravity-ide/brain/29e9a24e-f957-4f99-af87-bd243703b07c/.user_uploaded/` or repo asset staging.
- Produces: Transparent PNG sprite sheets (1024 × 682 px) in `web/public/mascot/` with outer perimeter black background converted to transparent alpha `rgba(0,0,0,0)`.

- [ ] **Step 1: Write the failing test for sprite sheet processing**

In `web/scripts/process-mascot-sprites.test.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUTPUT_DIR = path.resolve('public/mascot');
const EXPECTED_FILES = [
  'mascot-idle.png',
  'mascot-dance-1.png',
  'mascot-dance-2.png',
  'mascot-dance-3.png'
];

test('all processed mascot sprite sheets exist and have transparent perimeter', async () => {
  for (const fileName of EXPECTED_FILES) {
    const filePath = path.join(OUTPUT_DIR, fileName);
    assert.ok(fs.existsSync(filePath), `Expected file ${fileName} to exist`);

    const image = sharp(filePath);
    const metadata = await image.metadata();
    assert.equal(metadata.width, 1024, `${fileName} width must be 1024`);
    assert.equal(metadata.height, 682, `${fileName} height must be 682`);
    assert.equal(metadata.channels, 4, `${fileName} must have alpha channel (4 channels)`);

    // Verify top-left corner (0,0) is fully transparent alpha === 0
    const raw = await image.raw().toBuffer();
    const alphaAtOrigin = raw[3]; // RGBA first pixel
    assert.equal(alphaAtOrigin, 0, `${fileName} origin pixel (0,0) must be transparent`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test web/scripts/process-mascot-sprites.test.mjs`
Expected: FAIL because `public/mascot/mascot-idle.png` does not exist yet.

- [ ] **Step 3: Implement `web/scripts/process-mascot-sprites.mjs`**

Implement flood-fill perimeter background removal:
1. Read the 4 source images using `sharp`.
2. Extract raw buffer (RGBA).
3. Perform breadth-first flood fill starting from all 4 perimeter borders (x=0, x=W-1, y=0, y=H-1) for pixels where `r <= 12 && g <= 12 && b <= 12`. Set alpha to 0 for connected outer pixels.
4. Save resulting PNG to `web/public/mascot/mascot-[idle|dance-1|dance-2|dance-3].png`.
5. Execute script to generate assets: `node web/scripts/process-mascot-sprites.mjs`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test web/scripts/process-mascot-sprites.test.mjs`
Expected: PASS (4 files verified with 1024x682 dimensions and transparent perimeter).

- [ ] **Step 5: Commit**

```bash
git add web/scripts/process-mascot-sprites.mjs web/scripts/process-mascot-sprites.test.mjs web/public/mascot/
git commit -m "feat(mascot): process and generate transparent sprite sheets"
```

---

### Task 2: Inactivity Detection Hook (`useInactivityTimer`)

**Sub-agent Recommended Skills:**
- `test-driven-development` (TDD unit testing with Vitest fake timers)
- `code-simplifier` (keep hook lean, unburdened by unnecessary state renders)

**Files:**
- Create: `web/src/hooks/useInactivityTimer.ts`
- Test: `web/src/hooks/useInactivityTimer.test.ts`

**Interfaces:**
- Consumes: Window event listeners (`pointermove`, `pointerdown`, `keydown`, `touchstart`, `scroll`).
- Produces:
  ```typescript
  export interface InactivityState {
    isInactive: boolean;
    activeDanceIndex: 0 | 1 | 2;
    resetTimer: () => void;
  }
  export function useInactivityTimer(timeoutMs?: number): InactivityState;
  ```

- [ ] **Step 1: Write the failing test for `useInactivityTimer`**

In `web/src/hooks/useInactivityTimer.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInactivityTimer } from './useInactivityTimer';

describe('useInactivityTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes in active state (isInactive: false)', () => {
    const { result } = renderHook(() => useInactivityTimer(15000));
    expect(result.current.isInactive).toBe(false);
  });

  it('triggers inactivity and picks random dance after timeout', () => {
    const { result } = renderHook(() => useInactivityTimer(15000));

    act(() => {
      vi.advanceTimersByTime(14999);
    });
    expect(result.current.isInactive).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isInactive).toBe(true);
    expect([0, 1, 2]).toContain(result.current.activeDanceIndex);
  });

  it('resets to active when pointermove or keydown occurs', () => {
    const { result } = renderHook(() => useInactivityTimer(15000));

    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(result.current.isInactive).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('pointermove'));
    });
    expect(result.current.isInactive).toBe(false);
  });

  it('cleans up event listeners on unmount', () => {
    const removeListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useInactivityTimer(15000));
    unmount();
    expect(removeListenerSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/hooks/useInactivityTimer.test.ts`
Expected: FAIL with "useInactivityTimer not defined"

- [ ] **Step 3: Implement `useInactivityTimer.ts`**

Implement `web/src/hooks/useInactivityTimer.ts`:
- Accepts optional `timeoutMs = 15000`.
- Manages `isInactive` (boolean) and `activeDanceIndex` (0 | 1 | 2).
- Uses `useRef` for timer handle and internal state flag to avoid unnecessary re-renders during repeated active events.
- Listens to `['pointermove', 'pointerdown', 'keydown', 'touchstart', 'scroll']`.
- On user activity: if `isInactive` is true, sets it to false; restarts timeout.
- Cleanly removes listeners on unmount.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/src/hooks/useInactivityTimer.test.ts`
Expected: PASS (4/4 tests pass)

- [ ] **Step 5: Commit**

```bash
git add web/src/hooks/useInactivityTimer.ts web/src/hooks/useInactivityTimer.test.ts
git commit -m "feat(mascot): implement useInactivityTimer hook with random dance selection"
```

---

### Task 3: Mascot Avatar Component (`MascotAvatar`)

**Sub-agent Recommended Skills:**
- `ui-styling` / `impeccable` (pixel styling, CSS sprite animation, crisp rendering)
- `test-driven-development` (React Testing Library tests)

**Files:**
- Create: `web/src/components/ui/MascotAvatar.tsx`
- Create: `web/src/components/ui/MascotAvatar.css`
- Test: `web/src/components/ui/MascotAvatar.test.tsx`

**Interfaces:**
- Consumes: Sprite sheets from `/mascot/mascot-[idle|dance-1|dance-2|dance-3].png`.
- Produces:
  ```typescript
  export type MascotAnimation = 'idle' | 'dance_1' | 'dance_2' | 'dance_3';

  export interface MascotAvatarProps {
    animation?: MascotAnimation;
    alertCount?: number;
    hasErrors?: boolean;
    isDragging?: boolean;
    className?: string;
  }
  export const MascotAvatar: React.FC<MascotAvatarProps>;
  ```

- [ ] **Step 1: Write the failing test for `MascotAvatar`**

In `web/src/components/ui/MascotAvatar.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MascotAvatar } from './MascotAvatar';

describe('MascotAvatar', () => {
  it('renders with idle animation by default', () => {
    render(<MascotAvatar />);
    const avatar = screen.getByTestId('mascot-avatar');
    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveAttribute('data-animation', 'idle');
  });

  it('switches animation to dance routine when prop changes', () => {
    const { rerender } = render(<MascotAvatar animation="dance_1" />);
    expect(screen.getByTestId('mascot-avatar')).toHaveAttribute('data-animation', 'dance_1');

    rerender(<MascotAvatar animation="dance_2" />);
    expect(screen.getByTestId('mascot-avatar')).toHaveAttribute('data-animation', 'dance_2');
  });

  it('renders unread count badge when alertCount > 0', () => {
    render(<MascotAvatar alertCount={5} />);
    const badge = screen.getByTestId('mascot-badge');
    expect(badge).toHaveTextContent('5');
  });

  it('caps unread badge count at 99+', () => {
    render(<MascotAvatar alertCount={120} />);
    expect(screen.getByTestId('mascot-badge')).toHaveTextContent('99+');
  });

  it('applies error pulse style when hasErrors is true', () => {
    render(<MascotAvatar alertCount={2} hasErrors />);
    const badge = screen.getByTestId('mascot-badge');
    expect(badge.className).toContain('bg-[var(--neon-red)]');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/components/ui/MascotAvatar.test.tsx`
Expected: FAIL with "MascotAvatar not defined"

- [ ] **Step 3: Implement `MascotAvatar.tsx` and `MascotAvatar.css`**

Implement:
1. `MascotAvatar.css`:
   - Define CSS keyframes for 8-frame loop (4 cols × 2 rows = 8 frames):
     ```css
     @keyframes mascot-sprite-loop {
       0% { background-position: 0% 0%; }
       12.5% { background-position: 33.333% 0%; }
       25% { background-position: 66.666% 0%; }
       37.5% { background-position: 100% 0%; }
       50% { background-position: 0% 100%; }
       62.5% { background-position: 33.333% 100%; }
       75% { background-position: 66.666% 100%; }
       87.5% { background-position: 100% 100%; }
       100% { background-position: 0% 0%; }
     }
     .mascot-sprite {
       background-size: 400% 200%;
       image-rendering: pixelated;
       animation: mascot-sprite-loop 1s steps(1) infinite;
     }
     ```
   - Sprite image classes for `idle`, `dance_1`, `dance_2`, `dance_3`.
2. `MascotAvatar.tsx`:
   - Mobile: 52px × 70px (`w-[52px] h-[70px] sm:w-[64px] sm:h-[86px]`).
   - Ground shadow: subtle pixel oval underneath character feet (`w-8 h-2 sm:w-10 sm:h-2.5 bg-[var(--night-0)] border border-[var(--neon-cyan)]/50`).
   - Top-right alert counter pill.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/src/components/ui/MascotAvatar.test.tsx`
Expected: PASS (5/5 tests pass)

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ui/MascotAvatar.tsx web/src/components/ui/MascotAvatar.css web/src/components/ui/MascotAvatar.test.tsx
git commit -m "feat(mascot): implement MascotAvatar animated sprite component"
```

---

### Task 4: NotificationWidget Integration & Movable Mascot Floating Button

**Sub-agent Recommended Skills:**
- `test-driven-development` (updating existing NotificationWidget tests)
- `code-simplifier` (preserving all existing drawer tabs and drag handlers cleanly)

**Files:**
- Modify: `web/src/components/ui/NotificationWidget.tsx`
- Modify: `web/src/components/ui/NotificationWidget.test.tsx`

**Interfaces:**
- Consumes: `<MascotAvatar />`, `useInactivityTimer()`.
- Replaces: Old static bell button `<span className="text-xl">🔔</span>` and square yellow box.
- Preserves: `isOpen` drawer toggle, `position` coordinates, `startDrag` mouse/touch events, `alertCount`, `hasErrors`.

- [ ] **Step 1: Write the failing integration test**

In `web/src/components/ui/NotificationWidget.test.tsx`:
Add tests to verify:
1. Floating button renders the `<MascotAvatar />` element (`getByTestId('mascot-avatar')`).
2. Mascot defaults to `'idle'` animation.
3. Clicking on the mascot opens the notification drawer.
4. Dragging the mascot $> 4\text{px}$ updates coordinates and does not open the drawer.
5. Inactivity flips mascot to `'dance_1'`, `'dance_2'`, or `'dance_3'`.
6. When the drawer is opened, animation is locked to `'idle'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/components/ui/NotificationWidget.test.tsx`
Expected: FAIL (missing `mascot-avatar` test ID).

- [ ] **Step 3: Update `NotificationWidget.tsx`**

1. Import `MascotAvatar` and `useInactivityTimer`.
2. Connect `const { isInactive, activeDanceIndex } = useInactivityTimer(15000);`
3. Determine active mascot animation:
   ```typescript
   const danceKey = (['dance_1', 'dance_2', 'dance_3'] as const)[activeDanceIndex] || 'dance_1';
   const mascotAnimation = isOpen ? 'idle' : (isInactive ? danceKey : 'idle');
   ```
4. Replace the old square button with a borderless, transparent button wrapping `<MascotAvatar />`.
5. Adjust bounding box clamping in `startDrag` for the mascot dimensions (width: 64px, height: 86px, margin: 8px).
6. Ensure `data-testid="notification-bell-btn"` remains on the interactive trigger so existing tests and ARIA labels stay backwards-compatible.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/src/components/ui/NotificationWidget.test.tsx`
Expected: PASS (all tests pass)

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ui/NotificationWidget.tsx web/src/components/ui/NotificationWidget.test.tsx
git commit -m "feat(mascot): integrate animated mascot into NotificationWidget"
```

---

### Task 5: End-to-End Verification & Production Build

**Sub-agent Recommended Skills:**
- `verification-before-completion` (strict evidence before claiming complete)
- `webapp-testing` (browser verification, screenshot confirmation)

**Files:**
- Verification only across workspace.

- [ ] **Step 1: Run complete unit and script test suites**

Run: `npm test -w web`
Expected: All tests pass.

Run: `node --test web/scripts/process-mascot-sprites.test.mjs`
Expected: PASS.

- [ ] **Step 2: Run full production TypeScript & Vite build**

Run: `npm run build`
Expected: `tsc -b` and `vite build` succeed with 0 errors.

- [ ] **Step 3: Visual inspection in browser**

Using `browser_subagent` or local preview dev server:
- Verify mascot displays without black box artifact on dark nocturnal background.
- Verify 8-bit aesthetic, ground shadow, and alert badge counter.
- Verify dragging repositioning works smoothly.
- Verify clicking mascot opens notification drawer.

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "chore: verify animated mascot notification widget"
```
