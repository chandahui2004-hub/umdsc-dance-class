# Animated Dancing Mascot Notification Widget — Design Spec

**Date:** 2026-10-23  
**Status:** Approved via Brainstorming & Grill-Me Interview  
**Branch:** `feat/animated-mascot-widget`

---

## 1. Overview & Goals

Replace the static retro `🔔` floating notification button with an animated chibi dancer mascot.
The mascot serves as the persistent interactive companion for both admins and dancers, preserving all existing notification center functionality while introducing dynamic idle dance animations:

1. **Idle State (Default)**: Plays the 8-frame idle loop (blinking, breathing, gentle head tilt) when the user is actively interacting with the website.
2. **Inactivity / Dance Trigger (15 Seconds)**: When no user activity (mouse movement, clicks, scrolls, or key presses) occurs for **15 seconds**, the mascot automatically begins dancing, randomly picking one of three distinct street dance routines (**Dance 1**, **Dance 2**, or **Dance 3**).
3. **Instant Return to Idle**: Any user interaction (moving cursor, tapping, typing, scrolling) immediately returns the mascot to the idle stance.
4. **Preserved Interactivity**:
   - **Click / Tap**: Opens and closes the existing Notification Center side drawer (`adminTab` or `dancerTab`).
   - **Touch & Mouse Drag**: The mascot can be dragged to any location on the viewport without opening the drawer on drag release.
   - **Alert Badge**: Unread alert count pill remains anchored on the top-right of the mascot's beanie cap.
   - **Error Pulse**: When system errors or matric conflicts are present, a subtle neon red pulse glows around the mascot's ground-shadow and silhouette.

---

## 2. Asset Pipeline & Sprite Specifications

### 2.1 Source Sprite Sheets
The user provided 4 source sprite sheets (1024 × 682 px, 2 rows × 4 columns, 8 frames each):
- **Idle (`media_1792820449665.jpg`)**: Standing posture, blinking eye frames, gentle head tilt.
- **Dance 1 (`media_1792820449561.jpg`)**: High-energy dance, pointing gesture, winking, foot-bounce.
- **Dance 2 (`media_1792820449738.jpg`)**: Popping / arm-wave groove, side steps, body isolations.
- **Dance 3 (`media_1792820449787.jpg`)**: Hip-hop bounce, hand gestures, rhythm footwork.

### 2.2 Background Transparency Processing
- **Problem**: The raw source images have an opaque `#000000` background. On the application's nocturnal purple background (`--night-1: #0E0A24`), an unedited image would display an unsightly black rectangular box.
- **Automated Processing Script (`scripts/process-mascot-sprites.mjs`)**:
  - Uses `sharp` to process each image.
  - Implements flood-fill perimeter transparency from the image borders: converts external black pixels to transparent alpha (`rgba(0,0,0,0)`), while preserving authentic black outlines and dark tones inside the character (jacket creases, pupils, beanie stitches).
  - Trims and scales to an optimized WebP / PNG sprite sheet.
  - Generates:
    - `web/public/mascot/mascot-idle.png`
    - `web/public/mascot/mascot-dance-1.png`
    - `web/public/mascot/mascot-dance-2.png`
    - `web/public/mascot/mascot-dance-3.png`
  - Total combined asset size strictly < 250 KB.

### 2.3 Frame Dimensions & Aspect Ratio
- Sheet Grid: 4 columns × 2 rows = 8 frames.
- Frame Width: $1024 / 4 = 256\text{px}$.
- Frame Height: $682 / 2 = 341\text{px}$.
- Aspect Ratio: $256 : 341 \approx 3 : 4$ (0.75).

---

## 3. Component Architecture & Data Flow

```
[Window / Document Event Listeners]
  (pointermove, touchstart, keydown, scroll)
                │
                ▼
      useInactivityTimer (15s)
                │
       isInactive: boolean
       activeDanceIndex: 0 | 1 | 2
                │
                ▼
       [MascotAvatar Component]
          ├── Canvas / CSS Frame Engine (8 fps)
          ├── Ground Neon Shadow Ellipse
          └── Alert Counter Pill
                │
                ▼
    [NotificationWidget Drag Wrapper]
          ├── startDrag / onPointerDown
          └── onClick -> toggle isOpen drawer
```

### 3.1 `useInactivityTimer(inactivityMs = 15000)`
- Tracks user interaction events: `['pointermove', 'pointerdown', 'keydown', 'touchstart', 'scroll']`.
- Employs a debounced / throttled reset to avoid main-thread jank.
- When timer reaches 15 seconds of inactivity:
  - Sets `isInactive = true`.
  - Selects a random dance index `activeDanceIndex = Math.floor(Math.random() * 3)`.
- When any event fires:
  - If `isInactive` was true, immediately sets `isInactive = false`.
  - Resets elapsed time to 0.

### 3.2 `MascotAvatar.tsx`
A dedicated, isolated React component:
- **Props**:
  - `animation`: `'idle' | 'dance_1' | 'dance_2' | 'dance_3'`
  - `fps`: number (default: 8 fps, matching authentic 8-bit retro animation pacing)
  - `alertCount`: number
  - `hasErrors`: boolean
  - `className`: string
- **Rendering Mechanism**:
  - Uses CSS background position with `steps()` timing or HTML5 `<canvas>` rendering.
  - Native CSS sprite implementation:
    ```css
    width: var(--mascot-w);
    height: var(--mascot-h);
    background-image: url('/mascot/mascot-idle.png');
    background-size: 400% 200%;
    image-rendering: pixelated;
    ```
    Frames cycle through column 0→3 on row 0, then column 0→3 on row 1, seamlessly looping every 1000ms (125ms per frame = 8 fps).
- **Ground Shadow**:
  - A small, styled pixel ellipse beneath the mascot's sneakers (`bg-[var(--night-0)]` with a subtle `2px` border in `var(--neon-cyan)` or `var(--neon-gold)`).
  - Anchors the mascot visually so he looks like a living arcade pet on the page.

### 3.3 Sizing & Responsive Layout
- **Mobile (`< 640px`)**:
  - Width: 52px
  - Height: 70px
- **Desktop (`>= 640px`)**:
  - Width: 64px
  - Height: 86px
- **Alert Badge Positioning**:
  - Absolute top-right (`top: -4px`, `right: -4px`).
  - Styled with retro pixel border `border-2 border-[var(--outline)]`, `font-display`, and hard shadow.

---

## 4. Interaction & Drag Mechanics

- **Preserve Existing Behavior**:
  - Drag handlers (`onPointerDown`, `onTouchStart`, `onMouseDown`) attached to container.
  - Drag threshold: movements $\le 4\text{px}$ count as a click (`setIsOpen(v => !v)`).
  - Drag movements $> 4\text{px}$ update floating coordinates `position = { x, y }`.
  - No localStorage persistence required (per user selection).
  - `cursor-grab` on hover, `cursor-grabbing` while held.

---

## 5. Testing & Verification Plan

1. **Sprite Processing Script Test (`scripts/process-mascot-sprites.test.mjs`)**:
   - Verifies all 4 output images exist in `web/public/mascot/`.
   - Confirms dimensions are intact (1024 × 682 px) and top-left corners are transparent (`alpha === 0`).
2. **Timer Hook Unit Tests (`useInactivityTimer.test.ts`)**:
   - Verifies initial state is `isInactive = false`.
   - Verifies `isInactive` flips to `true` after 15,000ms with no events.
   - Verifies dispatching a `pointermove` event resets `isInactive` back to `false`.
3. **Mascot Component Tests (`MascotAvatar.test.tsx`)**:
   - Renders with `idle` sprite sheet by default.
   - Switches to dance sprite sheet when `animation` prop changes.
   - Displays alert badge count when `alertCount > 0`.
   - Shows neon red error styling when `hasErrors = true`.
4. **Integration Tests (`NotificationWidget.test.tsx`)**:
   - Floating mascot button renders and toggles drawer on click.
   - Dragging moves mascot across screen without opening drawer.
   - Inactivity triggers dance routine switch.
5. **Production Build & Visual Check**:
   - `npm run build` passes with zero errors.
   - Mobile and desktop responsive layout verification.
