# UMDSC Neon Pixel City UI Redesign — Design Spec

- **Date:** 2026-10-02
- **Status:** Approved by the owner in chat on 2026-10-02 (colour base, art density, portraits, Approach 1).
- **Implementer:** Gemini in Antigravity, following `docs/superpowers/plans/2026-10-02-neon-pixel-ui-redesign.md`.
- **Visual references (repo root):** `DESIGN ELEMENT.jpeg` (a tall cyberpunk pixel city at night) and `DESIGN ELEMENT 2.jpeg` (a grid of neon pixel skylines). The club logo is `web/public/logo.png`: cyan-gradient graffiti letters on black.
- **Replaces:** the light PICO-8 palette in the main spec §13.1. Everything else in §13.1 still applies: pixel fonts, hard edges, retro feel.

---

## 1. Goal

Re-skin the whole web app as a **2D pixel-art neon city at night**, phone first. Dancers should feel they have opened a retro game set in a night city. Admins should still be able to read a 40-row attendance list in a bright dance studio.

**Success criteria**
1. Every screen shown at 390×844 (iPhone 12–15) and 360×780 (small Android) matches §3–§9. There is no light-cream background or white panel left anywhere.
2. Every text/background pair meets WCAG AA: 4.5:1 for body text, 3:1 for text 24px or larger and for UI outlines. The table in §3.5 is the source of truth.
3. No visible text is smaller than 8px. All `input`, `select` and `textarea` text is at least 16px, which stops iOS from zooming in on focus.
4. Every tap target is at least 44×44px.
5. The login screen's first paint, measured with the production build and a throttled "Fast 4G" connection in Chrome DevTools, is no more than 300ms slower than before the redesign. All art together weighs 300KB or less.
6. All existing unit tests (`npm test -w web`) and e2e tests (`npm run e2e -w web`) still pass. **Nothing changes in behaviour, data or API.**

**Non-goals**
- No new features, routes, API calls or data fields.
- No light/dark theme toggle. There is one theme: night.
- Instructors keep their real photos. They are not converted into pixel avatars.

---

## 2. Collision safety (Antigravity is busy)

When this spec was written, Antigravity was in the middle of an owner request: instructor photos at 1080×1350, an **8px** minimum text size, a minimum spacing of 8px, the logo on the login screen and navigation, and a wider class-editor modal. The redesign must build **on top of** that work:

1. Start only when `git status` shows a clean tree **and** the owner confirms the instructor-photo task is finished and committed.
2. Work on a new branch `feat/neon-pixel-ui` cut from the latest `feat/events`.
3. Re-read every file immediately before editing it. Never edit from memory of an older version.
4. Keep everything the instructor-photo task delivered: the logo placements, `public/instructors/*`, the 8px text floor and the ≥8px spacing. This redesign restyles them and never removes them.

---

## 3. Colour system — 60 / 30 / 10

### 3.1 The rule

| Share | Role | Where it appears |
|---|---|---|
| **60%** | **Night** (dominant) | Page background, sky, starfield, the area behind every panel. |
| **30%** | **Violet** (secondary) | Panels, cards, sheets, top bar, tab bar, inputs, table rows. |
| **10%** | **Neon** (accent) | Primary buttons, the active tab, focus rings, links, status badges, glows, sign text. Never used for large areas. |

How to check it: take a 390px screenshot of a typical page (Dancer Home, Attendance). Neon should cover about 10% of the pixels and never more than 15%. If one screen has more than three neon colours in view, demote some of them to violet.

### 3.2 Palette tokens (new, semantic)

Defined in `web/src/theme/tokens.css` under `:root`:

```
/* 60% — Night */
--night-0:   #07051A;  /* deepest: behind skyline, sheet backdrop tint */
--night-1:   #0E0A24;  /* page background (the 60%) */
--night-2:   #1A1440;  /* sky band / top bar / table header */

/* 30% — Violet */
--violet-1:  #2A1F5C;  /* panel surface (the 30%) */
--violet-2:  #3B2C7A;  /* raised surface, hover, selected row */
--violet-3:  #4E3C99;  /* bevel highlight edge, dividers */
--violet-4:  #6B5BA8;  /* disabled fill, muted outline, grid lines */

/* 10% — Neon */
--neon-pink: #FF3EA5;  /* PRIMARY action (CTA), brand energy */
--neon-cyan: #3EE6FF;  /* focus, links, info, logo colour */
--neon-gold: #FFD23E;  /* active tab, highlight, "lit window" */
--neon-green:#4DFF9A;  /* present / success */
--neon-red:  #FF6B8B;  /* danger / absent / error */
--neon-orange:#FF9A3E; /* warning */
--neon-lilac:#B58CFF;  /* tertiary tag colour */

/* Text */
--text-1:    #F4ECFF;  /* primary text on night/violet */
--text-2:    #B9A8E6;  /* secondary text, labels, captions */
--text-3:    #9C8BD1;  /* placeholder, disabled text (large text only) */
--on-neon:   #0B0618;  /* text/icons placed ON any neon fill */

/* Lines */
--outline:   #05030F;  /* the pixel-art outline: borders + hard shadows */
```

### 3.3 Legacy token remap (makes about 70% of the app turn dark immediately)

The 55 component files use `var(--c-*)` names. Keep those names and **change their values** so that existing classes pick up the night palette:

| Legacy var | New value | Why |
|---|---|---|
| `--c-bg` | `var(--night-1)` | page background |
| `--c-panel` | `var(--violet-1)` | panels |
| `--c-ink` | `var(--outline)` | borders and hard shadows stay dark outlines (the codemod fixes ink-as-text, §3.4) |
| `--c-navy` | `var(--night-2)` | header bars |
| `--c-peach` | `var(--violet-2)` | hover/selected fill |
| `--c-yellow` | `var(--neon-gold)` | active states |
| `--c-orange` | `var(--neon-orange)` | warnings and legacy accents |
| `--c-red` | `var(--neon-red)` | danger |
| `--c-green` | `var(--neon-green)` | success |
| `--c-darkgreen` | `#22C77A` | success outline/text on violet |
| `--c-blue` | `var(--neon-cyan)` | info |
| `--c-pink` | `var(--neon-pink)` | primary |
| `--c-lavender` | `var(--neon-lilac)` | tags |
| `--c-grey` | `var(--violet-4)` | muted lines |
| `--c-darkgrey` | `var(--violet-4)` | muted fill (the codemod moves darkgrey *text* to `--text-2`) |
| `--c-brown` | `#C9733A` | style swatch only |
| `--c-darkpurple` | `#7A2BB8` | style swatch only |

Dance-style colours (`theme/colors.ts`, `ColorSwatchPicker.tsx`) keep their **keys**, so stored data does not change. They pick up the neon values automatically through the remap. Custom hex colours chosen by admins stay as they are.

### 3.4 Why a codemod is still needed

`--c-ink` does two jobs today: outline **and** text colour. On a dark panel, dark text is unreadable. A scripted codemod (in the plan, Task 3) rewrites colour **text** classes only:

| Found | Becomes | Condition |
|---|---|---|
| `text-[var(--c-ink)]` | `text-[var(--on-neon)]` | the same class string has an unprefixed neon fill: `bg-[var(--c-yellow\|green\|orange\|pink\|blue\|red\|lavender)]` |
| `text-[var(--c-ink)]` | `text-[var(--text-1)]` | everywhere else |
| `text-[var(--c-panel)]` | same two rules as above | (white text used to sit on red/navy) |
| `text-[var(--c-darkgrey)]`, `text-[var(--c-grey)]`, `text-[var(--c-peach)]` | `text-[var(--text-2)]` | always |
| `text-[var(--c-navy)]` | `text-[var(--neon-cyan)]` | always (navy headings become cyan) |
| `text-[var(--c-darkgreen)]` | `text-[var(--neon-green)]` | always |
| `hover:bg-[var(--c-<neon>)]` with no `hover:text-*` | append `hover:text-[var(--on-neon)]` | always |

The codemod must **report** any line where a class string has light text but a sibling string on the same or neighbouring line adds a neon fill. A person fixes those by hand.

### 3.5 Contrast table (computed, WCAG 2.x)

| Foreground on background | Ratio | Use |
|---|---|---|
| `--text-1` on `--night-1` | 16.8 | body text on page |
| `--text-1` on `--violet-1` | 12.6 | body text in panels |
| `--text-1` on `--violet-2` | 10.0 | selected rows |
| `--text-2` on `--violet-1` | 6.8 | labels, captions |
| `--text-2` on `--night-1` | 9.0 | page captions |
| `--on-neon` on `--neon-pink` | 6.2 | primary button label |
| `--on-neon` on `--neon-cyan` | 13.3 | info chips |
| `--on-neon` on `--neon-gold` | 13.8 | active tab |
| `--on-neon` on `--neon-green` | 15.3 | Present badge |
| `--on-neon` on `--neon-red` | 7.3 | danger button |
| `--neon-cyan` on `--night-1` | 12.8 | links |
| `--neon-gold` on `--violet-1` | 10.0 | highlighted numbers |
| `--neon-red` on `--violet-1` | 5.3 | error text |
| `--text-3` on `--violet-1` | 4.85 | placeholder (allowed) |

**Forbidden:** white text on `--neon-pink` (3.2:1, fails). Labels on any neon fill always use `--on-neon`.

---

## 4. Typography

| Token | Font | Sizes allowed | Use |
|---|---|---|---|
| `--font-display` | Press Start 2P | **8, 12, 16, 24, 32px only** | titles, tab labels, buttons, badges |
| `--font-body` | Pixelify Sans | 14, 16, 18, 20px | paragraphs, form text, lists |
| `--font-mono` | VT323 | 20, 24, 32px | clock, counters, times, scores |

- Press Start 2P is drawn on an 8px grid and only stays crisp at multiples of its design size. That is why the sizes are 8, 16, 24 and 32, plus 12 for dense labels.
- The global minimum is **8px** (agreed with the owner, and Antigravity's current task sets the same floor). Display text at 8px is allowed only for tab labels and badges, always in uppercase.
- Form controls are at least 16px (`--font-body`), so iOS does not zoom in on focus.
- Line height: display text 1.5, body text 1.4. Letter spacing: display text `0.05em`.
- **Neon text glow** (headings on night only), a stepped glow with no blur:
  `text-shadow: 0 0 0 var(--outline), 2px 2px 0 var(--outline), 0 0 6px color-mix(in srgb, currentColor 55%, transparent);`
  The last layer is the **only** blur allowed in the system (see §6), and only on text 16px or larger.

---

## 5. Pixel rules (apply everywhere)

1. **Grid:** every size, gap, padding and offset is a multiple of **4px**. Spacing between separate elements is at least **8px**. Spacing tokens are `--sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-6: 24px; --sp-8: 32px`.
2. **No rounded corners.** `border-radius` is 0 everywhere. Corners are **stepped** with the `.px-corners` clip-path (4px steps on large panels, 2px on chips).
3. **Borders:** 4px for panels and buttons, 2px for chips, inputs and table cells. Always `--outline` unless the element is "lit" (§6.4).
4. **Shadows:** hard offset only, never blurred: `4px 4px 0 var(--outline)`. The one exception is the text glow in §4.
5. **Images:** all art uses `image-rendering: pixelated` and is scaled only by **whole numbers** (×2, ×3, ×4) from its native pixel size. Never scale art by a fraction. Use `background-size` in exact multiples or render at native size × N.
6. **Motion:** `steps()` timing for anything "pixel" (twinkle, blink, cursor). Linear or ease-out only for sheet slide-in, 160ms. No bouncy springs.
7. **Icons:** keep `pixelarticons` (already installed), at 24px (native) or 48px (×2). Never 20px or 30px.

---

## 6. Layers, light and shadow

### 6.1 Layer stack (z-index tokens)

| Layer | Token | z | Contents | Depth treatment |
|---|---|---|---|---|
| L0 Sky | `--z-sky` | 0 | gradient `--night-0`→`--night-2`, stars, moon | none, furthest away |
| L1 Far city | `--z-far` | 1 | far skyline silhouette | colour-only (`--night-2` + 20% `--violet-3`), no outline, tiny lit windows |
| L2 Mid city | `--z-mid` | 2 | mid towers with lit windows and small signs | 2px `--outline`, windows `--neon-gold`/`--neon-cyan` |
| L3 Near city | `--z-near` | 3 | big neon signs, near rooftops | 4px outline, signs with stepped glow |
| L4 Content | `--z-content` | 10 | panels, cards, lists, tables | bevel + hard shadow (§6.3) |
| L5 Chrome | `--z-chrome` | 30 | sticky top bar, skyline strip, tab bar dock | bevel + 4px shadow pointing *away* from the screen edge |
| L6 Overlay | `--z-overlay` | 50 | sheets, modals, the More drawer, backdrop | backdrop `--night-0` at 80% + dither; the sheet gets a lit top edge |
| L7 Toast | `--z-toast` | 70 | toasts, upload progress | neon border + glow |

Existing classes are mapped like this: `z-10`→L4, `z-20/z-30`→L5, `z-40/z-50`→L6. Toasts move to L7.

### 6.2 The light source (one rule for every element)

The scene is lit by **the moon at top-left** (cool, soft) and **neon signs below** (warm, coloured). In practice:
- **Top-left edges are light.** Every raised surface gets a 2px highlight on its top and left inner edges.
- **Bottom-right edges are dark.** Every raised surface gets a 2px dark inner edge on its bottom and right, plus a hard 4px outline shadow offset down and to the right.
- **Neon spills up.** Elements near the tab bar (the bottom of the screen) may show a faint 1–2px tinted line along their bottom edge in the neon colour of whatever sits below.

### 6.3 Surface recipes (copy exactly)

```css
/* Raised panel (30% violet) */
.px-panel {
  background: var(--violet-1);
  border: 4px solid var(--outline);
  box-shadow:
    inset 2px 2px 0 var(--violet-3),     /* moonlit top-left bevel */
    inset -2px -2px 0 var(--night-0),    /* shaded bottom-right bevel */
    4px 4px 0 var(--outline);            /* hard drop shadow */
}

/* Sunken well (inputs, table body, progress track) */
.px-well {
  background: var(--night-1);
  border: 2px solid var(--outline);
  box-shadow:
    inset 2px 2px 0 var(--night-0),      /* shadow falls INTO the well top-left */
    inset -2px -2px 0 var(--violet-2);   /* lit lip bottom-right */
}

/* Pressed (button :active, toggled tile) — the surface moves down into its shadow */
.px-pressed {
  transform: translate(4px, 4px);
  box-shadow: inset 2px 2px 0 var(--night-0);
}
```

### 6.4 Neon glow recipe (stepped, keeps the pixel look)

A real neon tube in pixel art is a bright core, a 1–2px coloured ring and a darker halo, drawn as **hard rings**:

```css
.px-neon {                 /* --glow is set per element, e.g. var(--neon-pink) */
  border: 2px solid var(--glow);
  box-shadow:
    0 0 0 2px var(--outline),                                    /* separate from background */
    0 0 0 4px color-mix(in srgb, var(--glow) 45%, transparent),  /* ring 1 */
    0 0 0 6px color-mix(in srgb, var(--glow) 18%, transparent);  /* ring 2 (halo) */
}
```

Use it for: the focused input, the primary button on hover/focus, the active tab icon, the instructor portrait rim and a live "NOW" class card. **At most two glowing elements per screen.**

### 6.5 Dither and texture

- `.px-dither` (exists) is re-tinted to 2×2 checker `--violet-3` at 8% over panels. It is a texture, not a pattern you should notice.
- `.px-scanlines`: `repeating-linear-gradient(to bottom, transparent 0 2px, rgb(0 0 0 / .18) 2px 3px)`. Only for media frames (portraits, video panel). Never on text panels.
- Sheet backdrop: `--night-0` at 80% plus a 2×2 dither. No `backdrop-filter: blur` (it isn't pixel-like and it is slow on phones).

---

## 7. Art direction (Nano Banana assets)

All art is generated with Nano Banana (Gemini image generation), then **cleaned into true pixel art** with `scripts/pixelize.mjs` (plan Task 6): nearest-neighbour downscale to the native size, snap every pixel to the locked palette, export as PNG or WebP. Native sizes are small on purpose. The browser scales them up with `image-rendering: pixelated`.

**Locked art palette (16 colours, all assets):** `#07051A #0E0A24 #1A1440 #2A1F5C #3B2C7A #4E3C99 #6B5BA8 #B9A8E6 #F4ECFF #FF3EA5 #3EE6FF #FFD23E #4DFF9A #FF6B8B #FF9A3E #05030F`

| ID | Asset | Native px | Displayed | Where |
|---|---|---|---|---|
| A1 | Sky + clouds + moon (L0) | 180×390 | ×2 (cover) | login |
| A2 | Far skyline (L1), transparent | 320×90 | ×2 | login |
| A3 | Mid skyline with lit windows (L2), transparent | 320×120 | ×2 | login |
| A4 | Near neon street + blank signs (L3), transparent | 195×140 | ×2 | login bottom |
| A5 | Skyline strip for the in-app chrome, transparent, flat rooftops at both ends so it repeats | 480×24 | ×2 (48px tall) | under the top bar on every page |
| A6 | Starfield tile: **not generated**, an inline SVG data-URI (plan Task 2) | 64×64 | ×2 | in-app page background |
| A7 | Logo badge frame: an empty pixel neon-sign box; the real `logo.png` sits inside it | 128×96 | ×2 | login and the top bar |
| A8 | Blank neon sign **plate** (no letters); the style name is drawn on top in Press Start 2P by CSS, because AI image tools misspell text | 160×32 | ×2 | DaySheet and class card headers |
| A9 | Empty-state scenes: quiet rooftop, closed shutter, sleeping boombox | 96×64 each | ×3 | EmptyState |
| A10 | Boombox mascot (from the logo), **one** frame; the idle bounce is a CSS `steps(4)` animation (one sprite stays consistent where a generated 4-frame sheet would not) | 32×32 | ×2 | Spinner/loading, login |

Budget: everything together is 300KB or less (the A1–A4 login layers are about 200KB at most). The exact prompts, negative prompts and acceptance checks for each asset are in the plan.

**Motion on art:**
- Window twinkle: 2–3 window overlays toggle opacity with `steps(1)` every 1.6–3.2s (different delays).
- Login parallax: each layer image is wider than the phone, and drifts left and back (`alternate`), so no seam ever shows. L1 moves 64px over 40s and L2 moves 128px over 40s, both with `steps()` equal to the pixel distance so the move is in whole pixels. L3 stays still.
- Boombox: bounces 2px up and down and back in 4 steps at about 6fps (`steps(4)`, 0.66s loop).
- `prefers-reduced-motion: reduce` turns off all of the above (the rule already exists in `pixel.css`).
- Scrolling content never moves the art. Do not add scroll-linked parallax inside the app (it janks on cheap phones).

---

## 8. Components (target look)

All components keep their props, test ids and behaviour. Only the visuals change.

| Component | New look |
|---|---|
| **PixelButton** `primary` | `--neon-pink` fill, `--on-neon` label, 4px outline, bevel (top-left `#FF8FCB`, bottom-right `#B8206F`), 4px hard shadow; hover/focus adds `.px-neon` with `--glow: var(--neon-pink)`; active = `.px-pressed`. |
| `secondary` | `.px-panel` surface, `--text-1` label, hover `--violet-2`. |
| `danger` | `--neon-red` fill, `--on-neon` label. |
| `ghost` | transparent, 2px dashed `--violet-4`, `--text-2` label; hover turns the label and dashes `--neon-cyan`. |
| **Panel** | `.px-panel` + `.px-corners`. Title bar `--night-2` with a 2px `--neon-cyan` underline, title in display 12px `--text-1` with neon glow. |
| **Field / inputs** | `.px-well`, 16px body text, label display 8px `--text-2` above; focus = `.px-neon` with `--glow: var(--neon-cyan)`; error = `--neon-red` border plus a message in 14px `--neon-red`. |
| **Sheet / modal** | slides up from the bottom on phones (160ms ease-out, translateY 100%→0), lit top edge (2px `--neon-cyan` line + 2px `--violet-3`), grab bar of 3 stacked 4×4 pixel squares, backdrop per §6.5, max height `calc(100dvh - 48px)`, scrolls inside. |
| **Top bar** (PhoneShell) | `--night-2`, height 56px + `env(safe-area-inset-top)`, logo badge (A7) at 32px tall on the left, clock in VT323 24px `--neon-gold`, user chip on the right. Directly below it sits the **skyline strip** A5 (48px, not interactive). |
| **TabBar → "Arcade Dock"** | Floats 8px above the bottom edge (+ safe area), full width minus 16px, `.px-panel`. Each tab is ≥56px tall, icon 24px, label display 8px. **Active tab:** `--neon-gold` fill, `--on-neon` icon and label, and a 4px gold "light bar" above it. Inactive: `--text-2`. Badges: `--neon-red` square with `--on-neon` number. The More drawer is a Sheet. |
| **Sidebar** (desktop) | Same as the dock but vertical: `--night-2` column, active item gold bar on the left edge. |
| **MonthCalendar** | Day cells are `.px-well` squares; today has a cyan outline plus `.px-neon`; days with classes show a 4×4 pixel dot in each style's colour (up to 4 dots); the selected day is a `--violet-2` fill with a gold border. |
| **ClassCard / DaySheet** | `.px-panel`; a 4px left stripe in the style colour; the style name as a neon sign: the A8 plate image behind display 12px text in the style colour with glow (the text is real HTML, so it is always spelled right and screen readers read it); time in VT323 24px `--neon-gold`. |
| **Attendance grid / RosterList** | Rows alternate `--violet-1`/`--night-2` (zebra), row height ≥48px. Present = `--neon-green` square chip with a ✓ pixel icon and `--on-neon`; Absent = hollow `--violet-4` square. The sticky header row is `--night-2` with a cyan underline. Scrollbar per §8 below. |
| **Badges / chips** | 2px outline, `.px-corners` 2px, display 8px uppercase; colour = meaning (gold = active, cyan = info, green = present, red = error, lilac = role). |
| **Toast** | L7, `.px-panel` + left 8px stripe in the status colour, enters with `steps(4)` from below. |
| **Spinner** | The A10 boombox sprite (falls back to the existing spinner if the image fails to load). |
| **EmptyState** | A9 scene ×3, title display 12px, body 16px `--text-2`. |
| **HeartsBar** | Hearts recoloured: full `--neon-pink`, empty `--violet-4`, 2px outline. |
| **Pixel scrollbar** | track `--night-1`, thumb `--violet-3` with 2px `--outline`, hover `--neon-cyan`. |
| **Focus ring** (global) | `outline: 2px solid var(--neon-cyan); outline-offset: 2px; box-shadow: 0 0 0 6px var(--outline)`. |
| **Instructor portrait** | The real photo (4:5, from Antigravity's task) inside a stepped frame: 4px outline, 2px inner `--violet-3`, `.px-neon` rim with `--glow` = the instructor's style colour, `.px-scanlines` overlay at 18%, and a name plate below (display 12px `--text-1` on `--night-2`, with a 4px stripe in the style colour). Photos use **normal** smooth rendering (`image-rendering: auto`). Only the frame is pixelated. |
| **Login (TitleScreen)** | Full-screen L0–L3 parallax city; the logo badge A7 centred in the top third; under it a `.px-panel` login card; the existing "▼ PRESS START ▼" heading becomes neon-gold blinking text (`.px-blink`); all existing wording, labels and test ids stay unchanged; the boombox sprite next to the title; a blinking `▶` cursor before the active field. |
| **Music Studio / DanceCue** | Same tokens. The waveform/timeline uses `--neon-cyan` for the playhead, `--neon-pink` for the A–B loop region at 30% fill, `--neon-gold` for markers. Replace the hard-coded hex colours in the `music-studio/**` files with tokens (the plan lists them). |

---

## 9. Phone-first layout rules

- Design at **390×844**; test at **360×780** too (narrowest). There must be no horizontal page scroll at 360. Tables scroll inside their own `.pixel-scrollbar` container.
- Safe areas: the top bar adds `env(safe-area-inset-top)` and the dock adds `env(safe-area-inset-bottom)`. Add `viewport-fit=cover` to the viewport meta.
- Use `100dvh`, not `100vh`, for full-height screens (fixes the mobile address-bar jump).
- **Thumb zone:** primary actions sit in the bottom 40% of the screen when possible (sheets have their main button at the bottom, sticky).
- Content padding is 16px on the sides; gaps between panels are 16px; gaps inside panels are at least 8px.
- Add `<meta name="theme-color" content="#0E0A24">` so the phone status bar matches the night sky.
- Performance:
  - Art is lazy-loaded except A1 and A7 on the login screen.
  - Use only `transform` and `opacity` animations.
  - Pause all art animation when `document.hidden`.
- Desktop (≥1024px) uses the same tokens and components with the current desktop layout. The sidebar follows §8. Login art is centred at ×3 instead of ×2.

---

## 10. Testing and acceptance

1. `npm test -w web` and `npm run e2e -w web` pass. The codemod must not change any `data-testid`, `aria-*`, role or text content.
2. `npm run build -w web` passes (`tsc -b` included).
3. A new Playwright spec `web/e2e/visual-neon.spec.ts` captures every main route at 390×844 and 360×780 and saves them to `test-results/neon/`. The owner reviews the screenshots. These are not pixel-diff assertions.
4. A new script test `web/scripts/contrast.test.mjs` (run with `node --test`) reads the token values and asserts every pair in §3.5 meets its ratio, so future palette edits cannot quietly break contrast.
5. A codemod unit test proves the rules in §3.4 on fixture strings.
6. Manual checks on a real phone, once the site is published (main plan Task 34): login, mark attendance, open a DaySheet, open the Studio.

---

## 11. Agent skills (Antigravity, in `.agents/skills/`)

| Phase | Use | Why |
|---|---|---|
| Start, every session | `using-superpowers`, `executing-plans` | load the plan; follow tasks in order |
| Tokens and contrast | `design-system`, `ui-ux-pro-max` | token layering, contrast and mobile checks |
| Codemod and tests | `test-driven-development`, `systematic-debugging` | test the codemod before running it on 55 files |
| Art | `imagegen-frontend-web` (prompt craft and single-palette rule only), `brand` (logo consistency) | Nano Banana prompts |
| Components and screens | `ui-styling`, `impeccable`, `frontend-design` | build and polish the components |
| Verification | `webapp-testing`, `verification-before-completion`, `requesting-code-review` | screenshots, tests, review |

**Do not use** `minimalist-skill`, `soft-skill`, `taste-skill`, `gpt-tasteskill`, `brutalist-skill` or `stitch-skill`: their built-in aesthetics (rounded cards, blur shadows, muted palettes) contradict §5–§6. This matches the existing rule in `GEMINI.md`. `redesign-skill` may be used **only** for its "audit first" checklist (finding leftover generic patterns), never for its styling defaults.
