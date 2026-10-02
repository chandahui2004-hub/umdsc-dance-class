# Neon Pixel City UI Redesign — Implementation Plan

> **For agentic workers (Antigravity / Gemini):** REQUIRED SUB-SKILL: use `executing-plans` (from `.agents/skills/`) to run this plan task by task, in order. Steps use checkbox (`- [ ]`) syntax; tick each box as you finish it. **Stop at every 🧑 OWNER ACTION** and wait for the owner.

**Goal:** Re-skin the whole UMDSC web app as a 2D pixel-art neon city at night, phone first, without changing any behaviour, data or API.

**Architecture:** Three layers of change, in this order:
1. **Tokens.** New semantic CSS tokens, plus a value remap of the old `--c-*` names, turn about 70% of the app dark at once.
2. **Codemod.** A tested Node codemod rewrites the about 480 colour-text classes that a remap cannot fix (dark text on dark panels), strips rounded corners and blur, and maps old hex colours to tokens.
3. **Art and polish.** Pixel art generated with Nano Banana is cleaned into true palette-locked pixel art by a script. Components and screens are then polished one at a time against the spec.

**Tech stack:** React 19, Tailwind CSS v4 (arbitrary-value classes such as `bg-[var(--c-panel)]`), Vite 6, Vitest 3, Playwright, Node 24 (`node:test` for the scripts), `sharp` 0.34.5 (new dev dependency, image clean-up only), `pixelarticons`, fonts Press Start 2P / Pixelify Sans / VT323 (already installed).

**Spec:** `docs/superpowers/specs/2026-10-02-neon-pixel-ui-redesign-design.md`. Read it in full before Task 1. Section numbers below (§3.2 and so on) refer to it. The visual references are `DESIGN ELEMENT.jpeg` and `DESIGN ELEMENT 2.jpeg` in the repo root. Open both before Task 5.

## Global Constraints

- **No behaviour changes.** Never change a prop name, `data-testid`, `aria-*` attribute, role, route, API call, visible wording or test assertion. This is a visual-only change.
- **Colours only from tokens.** Never write a raw hex colour in a `.tsx` file. Use `var(--night-*|--violet-*|--neon-*|--text-*|--on-neon|--outline)` or the remapped `var(--c-*)`.
- **60/30/10:** night 60%, violet 30%, neon 10% (never more than 15%) of any 390px screenshot. At most **two glowing (`.px-neon`) elements per screen**.
- **Text:** at least 8px everywhere. `input`, `select` and `textarea` at least **16px**. Press Start 2P only at 8, 12, 16, 24 or 32px.
- **Labels on any neon fill use `--on-neon` (#0B0618). White text on `--neon-pink` is forbidden** (3.2:1).
- **Pixel rules:** 4px grid, ≥8px gaps, `border-radius: 0` (except `rounded-full` on dots of 12px or less), no `blur`/`backdrop-blur`, hard offset shadows only, art scaled only ×2/×3/×4 with `image-rendering: pixelated`.
- **Tap targets** at least 44×44px. Layouts must work at **360px** wide with no horizontal page scroll.
- **Art budget:** every file in `web/public/art/` together is 300KB or less.
- **Motion:** only `transform`/`opacity`; `steps()` for pixel motion; everything stops under `prefers-reduced-motion: reduce`.
- **Commands run from the repo root:** `npm test -w web`, `npm run e2e -w web`, `npm run build -w web`.
- **Skills** (in `.agents/skills/`): use the ones named in each task. **Do not use** `minimalist-skill`, `soft-skill`, `taste-skill`, `gpt-tasteskill`, `brutalist-skill` or `stitch-skill`. `redesign-skill` is allowed **only** for its audit checklist in Task 11.

## Review Focus

The five things most likely to go wrong for a real user that no ordinary task test catches. Each has a test in the task named:

1. **Admin-chosen custom hex style colours** (ColorSwatchPicker stores any CSS colour, e.g. a dark `#123456`). They must never become a *text* or *text background* colour. Use them only for stripes, rims and dots. → `NeonSign` test in Task 7.
2. **Long names at 360px** (a 30-character instructor name, or a style called "Contemporary Lyrical Jazz") must truncate, not push the page sideways. → 360px no-horizontal-scroll test in Task 12.
3. **Art fails to load** (slow campus Wi-Fi, ad blocker, a wrong path). The login form must still be visible and readable on the CSS fallback colours. → e2e test that blocks `/art/**` in Task 12.
4. **Reduced motion.** Phones with "reduce motion" turned on must get no twinkle, drift or bounce. → e2e test with `reducedMotion: 'reduce'` in Task 12.
5. **Typing on iPhone.** Any input below 16px makes iOS zoom the whole page on focus. → e2e test asserting every visible input's computed font size is 16px or more, in Task 12.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `web/src/theme/tokens.css` | modify | semantic tokens (§3.2), legacy remap (§3.3), z-index, spacing and type tokens |
| `web/src/theme/pixel.css` | modify | surface recipes `.px-panel/.px-well/.px-pressed/.px-neon/.px-scanlines`, glow text, focus ring, scrollbar, radius guard, starfield, art animations |
| `web/index.html` | modify | `viewport-fit=cover`, `theme-color`, body classes |
| `web/scripts/neon-codemod.mjs` + `.test.mjs` | create | class/hex codemod (§3.4) |
| `web/scripts/pixelize.mjs` + `.test.mjs` | create | Nano Banana output → palette-locked pixel art |
| `web/scripts/contrast.test.mjs` | create | asserts the §3.5 contrast table against `tokens.css` |
| `web/art-src/` | create, **git-ignored** | raw Nano Banana outputs (large) |
| `web/public/art/*.webp` | create | final pixel art (A1–A5, A7–A10) |
| `web/src/components/art/CityBackdrop.tsx` | create | login L0–L3 layered city |
| `web/src/components/art/SkylineStrip.tsx` | create | 48px skyline under the top bar |
| `web/src/components/art/Boombox.tsx` | create | bouncing boombox sprite |
| `web/src/components/ui/NeonSign.tsx` | create | style-name sign (plate image + real text) |
| `web/src/components/ui/PixelPortraitFrame.tsx` | create | frame around the real instructor photo |
| `web/src/components/ui/LogoBadge.tsx` | create | logo on a lightbox inside the A7 neon frame |
| `web/src/components/ui/*.tsx` (existing) | modify | restyle per spec §8 |
| `web/src/app/PhoneShell.tsx`, `DesktopShell.tsx` | modify | top bar, strip, starfield, dock spacing |
| `web/src/features/**` | modify | per-screen polish (Tasks 9–11) |
| `web/e2e/visual-neon.spec.ts` | create | screenshots + Review Focus checks |
| `web/package.json` | modify | `sharp` dev dependency, `test:scripts` script |
| `.gitignore` | modify | ignore `web/art-src/` |

---

### Task 0: Pre-flight (collision safety)

**Skills:** `using-superpowers`, `executing-plans`.

**Files:** none changed except `GEMINI.md` (Step 5).

- [x] **Step 1: 🧑 OWNER ACTION — confirm the instructor-photo task is finished.** Ask the owner: "Is the instructor photo / 8px text / logo task finished and committed?" Wait for "yes".
- [x] **Step 2: Check the tree is clean.**
  Run: `git status --short`
  Expected: no lines except possibly the untracked reference images (`DESIGN ELEMENT*.jpeg`, `*.png` in the root). If any `web/` file is modified, **stop** and ask the owner.
- [x] **Step 3: Create the branch.**
  Run: `git checkout feat/events && git pull --ff-only 2>/dev/null; git checkout -b feat/neon-pixel-ui`
  Expected: `Switched to a new branch 'feat/neon-pixel-ui'`.
- [x] **Step 4: Record the baseline.**
  Run: `npm test -w web 2>&1 | tail -5`, `npm run build -w web 2>&1 | tail -5`, `npm run e2e -w web 2>&1 | tail -5`
  Write the pass/fail counts and any failing test names into a new section `## Baseline` at the end of **this plan file**. Failures that already exist here are not yours to fix. Later tasks must not add new failures.
- [x] **Step 5: Point GEMINI.md at this work.** In `GEMINI.md` under `## Current work — START HERE`, add as the first item:
  `0. Neon UI redesign: spec docs/superpowers/specs/2026-10-02-neon-pixel-ui-redesign-design.md, plan docs/superpowers/plans/2026-10-02-neon-pixel-ui-redesign.md (branch feat/neon-pixel-ui).`
- [x] **Step 6: Commit.**
  `git add GEMINI.md docs/superpowers && git commit -m "docs: neon pixel UI redesign spec and plan"`

---

### Task 1: Tokens, legacy remap and contrast test

**Skills:** `design-system`, `ui-ux-pro-max` (contrast + mobile checks), `test-driven-development`.

**Files:**
- Create: `web/scripts/contrast.test.mjs`
- Modify: `web/src/theme/tokens.css`, `web/package.json`

**Interfaces:**
- Produces (CSS custom properties on `:root`, used by every later task): `--night-0/1/2`, `--violet-1/2/3/4`, `--neon-pink/cyan/gold/green/red/orange/lilac`, `--text-1/2/3`, `--on-neon`, `--outline`; `--z-sky 0, --z-far 1, --z-mid 2, --z-near 3, --z-content 10, --z-chrome 30, --z-overlay 50, --z-toast 70`; `--sp-1 4px, --sp-2 8px, --sp-3 12px, --sp-4 16px, --sp-6 24px, --sp-8 32px`; `--dock-h 72px`; `--topbar-h 56px`.

- [x] **Step 1: Write the failing contrast test** `web/scripts/contrast.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/theme/tokens.css', import.meta.url), 'utf8');
const hex = name => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  assert.ok(m, `token --${name} must be a 6-digit hex in tokens.css`);
  return m[1];
};
const lum = h => {
  const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// [foreground, background, minimum] — spec §3.5
const PAIRS = [
  ['text-1', 'night-1', 4.5], ['text-1', 'violet-1', 4.5], ['text-1', 'violet-2', 4.5],
  ['text-2', 'violet-1', 4.5], ['text-2', 'night-1', 4.5],
  ['on-neon', 'neon-pink', 4.5], ['on-neon', 'neon-cyan', 4.5], ['on-neon', 'neon-gold', 4.5],
  ['on-neon', 'neon-green', 4.5], ['on-neon', 'neon-red', 4.5],
  ['neon-cyan', 'night-1', 4.5], ['neon-gold', 'violet-1', 4.5], ['neon-red', 'violet-1', 4.5],
  ['text-3', 'violet-1', 4.5],
];

for (const [fg, bg, min] of PAIRS) {
  test(`--${fg} on --${bg} >= ${min}:1`, () => {
    assert.ok(ratio(hex(fg), hex(bg)) >= min, `${fg} on ${bg} is ${ratio(hex(fg), hex(bg)).toFixed(2)}`);
  });
}
```

- [x] **Step 2: Add the script entry** to `web/package.json` `scripts`: `"test:scripts": "node --test \"scripts/*.test.mjs\""`.
- [x] **Step 3: Run it and watch it fail.**
  Run: `npm run test:scripts -w web`
  Expected: FAIL with `token --text-1 must be a 6-digit hex`.
- [x] **Step 4: Edit `web/src/theme/tokens.css`.**
  - Add every token in spec §3.2 to `:root`, with exactly those hex values. Write each as a literal `#RRGGBB`; the test parses them.
  - Add the z-index, spacing, `--dock-h` and `--topbar-h` tokens from the Interfaces block above.
  - Change every `--c-*` value to the remap target in spec §3.3 (e.g. `--c-bg: var(--night-1);`).
  - Keep `--border`, `--shadow*` and the font tokens; change `--border` and the shadows to use `var(--outline)`.
  - Set `--min-font-size: 8px;` and change `@theme { --text-micro: 8px; }` (5px → 8px).
  - In `@theme` add `--color-night-1: var(--night-1); --color-violet-1: var(--violet-1); --color-neon-pink: var(--neon-pink); --color-neon-cyan: var(--neon-cyan); --color-neon-gold: var(--neon-gold); --color-text-1: var(--text-1); --color-text-2: var(--text-2); --color-on-neon: var(--on-neon); --color-outline: var(--outline);` so `bg-violet-1` / `text-text-1` utilities exist for new code.
- [x] **Step 5: Run the test again.**
  Run: `npm run test:scripts -w web`
  Expected: `pass 14`, `fail 0`.
- [x] **Step 6: Look at the app.** Run `npm run dev -w web` and open `http://localhost:5173/login` in a 390×844 device view. Expected: the background and panels are now dark. Much text is unreadable (dark on dark); **that is expected** and Task 3 fixes it.
- [x] **Step 7: Commit.** `git add web/src/theme/tokens.css web/scripts/contrast.test.mjs web/package.json && git commit -m "feat(theme): night palette tokens, legacy remap, contrast test"`

---

### Task 2: Pixel surface recipes, global rules, index.html

**Skills:** `ui-styling`, `design-system`.

**Files:**
- Modify: `web/src/theme/pixel.css`, `web/index.html`

**Interfaces:**
- Produces CSS classes used by Tasks 6–11:
  - `.px-panel`, `.px-well`, `.px-pressed`
  - `.px-neon` (reads `--glow`, default `var(--neon-cyan)`)
  - `.px-scanlines`, `.px-glow-text`, `.px-starfield`, `.px-art`
  - `.px-twinkle`, `.px-drift-far`, `.px-drift-mid`, `.px-bounce`
  - the existing `.px-corners`, `.px-dither`, `.px-blink` and `.pixel-scrollbar`

- [x] **Step 1: Add the recipes.** Add to `pixel.css` the exact `.px-panel`, `.px-well` and `.px-pressed` blocks from spec §6.3, and `.px-neon` from §6.4, adding `--glow: var(--neon-cyan);` as the default inside `.px-neon`.
- [x] **Step 2: Add the remaining classes:**

```css
.px-scanlines { position: relative; }
.px-scanlines::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(to bottom, transparent 0 2px, rgb(0 0 0 / .18) 2px 3px);
}
.px-glow-text {
  text-shadow: 2px 2px 0 var(--outline), 0 0 6px color-mix(in srgb, currentColor 55%, transparent);
}
.px-art { image-rendering: pixelated; image-rendering: crisp-edges; }
/* A6 starfield: 64x64 tile, 1px stars, drawn ×2 */
.px-starfield {
  background-color: var(--night-1);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' shape-rendering='crispEdges'%3E%3Crect x='5' y='9' width='1' height='1' fill='%23F4ECFF'/%3E%3Crect x='41' y='4' width='1' height='1' fill='%23B9A8E6'/%3E%3Crect x='22' y='27' width='1' height='1' fill='%23B9A8E6'/%3E%3Crect x='57' y='33' width='1' height='1' fill='%23F4ECFF'/%3E%3Crect x='12' y='50' width='1' height='1' fill='%236B5BA8'/%3E%3Crect x='35' y='58' width='1' height='1' fill='%23B9A8E6'/%3E%3Crect x='48' y='17' width='1' height='1' fill='%233EE6FF' fill-opacity='.7'/%3E%3C/svg%3E");
  background-size: 128px 128px;
  image-rendering: pixelated;
}
@keyframes px-twinkle { 0%, 60% { opacity: 1 } 61%, 100% { opacity: .25 } }
.px-twinkle { animation: px-twinkle 2.4s steps(1, end) infinite; }
@keyframes px-drift-far { from { transform: translateX(0) } to { transform: translateX(-64px) } }
@keyframes px-drift-mid { from { transform: translateX(0) } to { transform: translateX(-128px) } }
.px-drift-far { animation: px-drift-far 40s steps(64) infinite alternate; }
.px-drift-mid { animation: px-drift-mid 40s steps(128) infinite alternate; }
@keyframes px-bounce { 0%, 100% { transform: translateY(0) } 25%, 75% { transform: translateY(-1px) } 50% { transform: translateY(-2px) } }
.px-bounce { animation: px-bounce .66s steps(1, end) infinite; }
.px-paused * { animation-play-state: paused !important; }
```

- [x] **Step 3: Update the global rules in `pixel.css`:**
  - **Focus ring:** replace the `:focus-visible` block with spec §8 "Focus ring": `outline: 2px solid var(--neon-cyan); outline-offset: 2px; box-shadow: 0 0 0 6px var(--outline);` (keep `!important`).
  - **Minimum text:** in the "Minimum Text Size" block, change every `5px` to `8px`. (`min-font-size` is not a real CSS property, so leave it, but the real guard is `max(8px, 1em)` in the `.text-min-*` rule.)
  - **Input zoom guard (iOS):** add `input, select, textarea { font-size: max(16px, 1em); }`.
  - **Radius guard:** add `*:not(.rounded-full) { border-radius: 0 !important; }`.
  - **Scrollbar:** recolour `.pixel-scrollbar` per spec §8: track `--night-1`, thumb `--violet-3` with a 2px `--outline` border, hover `--neon-cyan`; `scrollbar-color: var(--violet-3) var(--night-1)`.
  - **Dither:** recolour the `.px-dither` SVG fill from `%23000000`/`0.05` to `%234E3C99`/`0.08`.
  - **Reduced motion:** in the `prefers-reduced-motion` block, add `.px-twinkle, .px-drift-far, .px-drift-mid, .px-bounce { animation: none !important; }`.
- [x] **Step 4: Edit `web/index.html`:**
  - viewport meta → `content="width=device-width, initial-scale=1.0, viewport-fit=cover"`
  - add `<meta name="theme-color" content="#0E0A24" />`
  - body class → `bg-[var(--c-bg)] text-[var(--text-1)] font-body antialiased m-0 p-0 selection:bg-[var(--neon-gold)] selection:text-[var(--on-neon)]`
- [x] **Step 5: Verify.** Run `npm test -w web` (expected: same counts as the Baseline) and `npm run build -w web` (expected: same result as the Baseline).
- [x] **Step 6: Commit.** `git add web/src/theme/pixel.css web/index.html && git commit -m "feat(theme): pixel surface recipes, neon glow, starfield, global pixel rules"`

---

### Task 3: Codemod — fix text colours, corners, blur and hex

**Skills:** `test-driven-development`, `systematic-debugging` (if any test breaks after the run).

**Files:**
- Create: `web/scripts/neon-codemod.mjs`, `web/scripts/neon-codemod.test.mjs`
- Modify: the about 69 `web/src/**/*.tsx` files the script touches (test files are skipped)

**Interfaces:**
- Produces: `rewriteSegment(segment: string) → { text: string, lightened: number }`, `rewriteSource(src: string) → { src: string, flags: number[] }`, `HEX_MAP`. CLI: `node scripts/neon-codemod.mjs <dir> [--write]`.

This script was written and verified against a copy of `web/src` on 2026-10-02: 69 files and 638 lines changed, 0 `text-[var(--c-ink)]` left, 39 of 39 `data-testid` attributes unchanged, 16 lines flagged for review. **Copy it exactly.**

- [x] **Step 1: Write the test** `web/scripts/neon-codemod.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rewriteSegment, rewriteSource } from './neon-codemod.mjs';

const t = s => rewriteSegment(s).text;
const s = x => rewriteSource(x).src;

test('ink text on violet becomes light text', () => {
  assert.equal(t('bg-[var(--c-panel)] text-[var(--c-ink)]'), 'bg-[var(--c-panel)] text-[var(--text-1)]');
});
test('ink/panel text on a neon fill becomes on-neon', () => {
  assert.equal(t('bg-[var(--c-yellow)] text-[var(--c-ink)] font-bold'), 'bg-[var(--c-yellow)] text-[var(--on-neon)] font-bold');
  assert.equal(t('bg-[var(--c-red)] text-[var(--c-panel)]'), 'bg-[var(--c-red)] text-[var(--on-neon)]');
  assert.equal(t('!bg-[var(--c-green)] !text-[var(--c-ink)]'), '!bg-[var(--c-green)] !text-[var(--on-neon)]');
});
test('panel text on navy becomes light text', () => {
  assert.equal(t('bg-[var(--c-navy)] text-[var(--c-panel)]'), 'bg-[var(--c-navy)] text-[var(--text-1)]');
});
test('prefixed fills pair with the same prefix', () => {
  assert.equal(t('hover:bg-[var(--c-yellow)] text-[var(--c-ink)]'), 'hover:bg-[var(--c-yellow)] hover:text-[var(--on-neon)] text-[var(--text-1)]');
  assert.equal(t('selection:bg-[var(--c-yellow)] selection:text-[var(--c-ink)]'), 'selection:bg-[var(--c-yellow)] selection:text-[var(--on-neon)]');
});
test('always-rules', () => {
  assert.equal(t('text-[var(--c-darkgrey)] text-[var(--c-navy)] text-[var(--c-darkgreen)]'), 'text-[var(--text-2)] text-[var(--neon-cyan)] text-[var(--neon-green)]');
});
test('borders and non-text colours are untouched', () => {
  assert.equal(t('border-[var(--c-ink)] bg-[var(--c-ink)] text-[var(--c-yellow)]'), 'border-[var(--c-ink)] bg-[var(--c-ink)] text-[var(--c-yellow)]');
});
test('light text next to a neon fill in a sibling string is flagged', () => {
  assert.deepEqual(rewriteSource("const a = `x ${on ? 'bg-[var(--c-yellow)]' : ''} text-[var(--c-ink)]`;").flags, [1]);
});
test('rounded-* and blur-* removed, rounded-full kept, bare words untouched', () => {
  assert.equal(s('className="p-2 rounded-lg md:rounded-xl rounded-full backdrop-blur-sm"'), 'className="p-2 rounded-full"');
  assert.equal(s('className="a rounded-t-lg md:rounded-[6px] b"'), 'className="a b"');
  assert.equal(s("el.addEventListener('blur', f); x = 'rounded';"), "el.addEventListener('blur', f); x = 'rounded';");
});
test('old hex colours map to tokens, any case', () => {
  assert.equal(s("style={{ color: '#ffec27', background: '#101114' }}"), "style={{ color: 'var(--neon-gold)', background: 'var(--night-1)' }}");
  assert.equal(s('className="text-[#29ADFF]"'), 'className="text-[var(--neon-cyan)]"');
});
```

- [x] **Step 2: Run it.** Run `npm run test:scripts -w web`. Expected: FAIL, `Cannot find module ... neon-codemod.mjs`.
- [x] **Step 3: Create `web/scripts/neon-codemod.mjs`** with exactly this content:

```js
// Neon codemod: rewrites colour TEXT classes for the night theme (spec §3.4),
// strips rounded/blur classes and maps old hex colours to tokens.
// Usage: node scripts/neon-codemod.mjs <dir> [--write]   (without --write = dry run)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const NEON = '(?:yellow|green|orange|pink|blue|red|lavender)';
const ALWAYS = [
  [/text-\[var\(--c-(?:darkgrey|grey|peach)\)\]/g, 'text-[var(--text-2)]'],
  [/text-\[var\(--c-navy\)\]/g, 'text-[var(--neon-cyan)]'],
  [/text-\[var\(--c-darkgreen\)\]/g, 'text-[var(--neon-green)]'],
];
const SEGMENT_SPLIT = /(['"`]|\$\{|\})/;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** prefix like '' or 'hover:' or 'selection:'; true if the segment has a neon fill with that same prefix */
export function hasNeonFill(segment, prefix) {
  return new RegExp(`(?:^|[\\s])${esc(prefix)}bg-\\[var\\(--c-${NEON}\\)\\]`).test(segment);
}

/** Rewrite one string segment. Returns { text, lightened } where lightened = count of ink/panel -> text-1. */
export function rewriteSegment(segment) {
  let lightened = 0;
  let out = segment.replace(
    /(^|[\s])((?:[a-z-]+:)*!?)text-\[var\(--c-(?:ink|panel)\)\]/g,
    (_m, lead, prefix) => {
      if (hasNeonFill(segment, prefix)) return `${lead}${prefix}text-[var(--on-neon)]`;
      lightened++;
      return `${lead}${prefix}text-[var(--text-1)]`;
    }
  );
  for (const [re, to] of ALWAYS) out = out.replace(re, to);
  // hover:bg-<neon> without any hover:text-* -> add hover:text-[var(--on-neon)]
  if (!/hover:text-/.test(out)) {
    out = out.replace(
      new RegExp(`(hover:bg-\\[var\\(--c-${NEON}\\)\\])`),
      '$1 hover:text-[var(--on-neon)]'
    );
  }
  return { text: out, lightened };
}

/** Rewrite one line; flags it when light text sits next to a neon fill in a sibling segment. */
export function rewriteLine(line, neighbourhood) {
  const parts = line.split(SEGMENT_SPLIT);
  let lightened = 0;
  const rewritten = parts.map((p, i) => {
    if (i % 2 === 1) return p; // delimiter
    const r = rewriteSegment(p);
    lightened += r.lightened;
    return r.text;
  });
  const out = rewritten.join('');
  const neonNearby = new RegExp(`(?:^|[\\s'"\`])bg-\\[var\\(--c-${NEON}\\)\\]`).test(neighbourhood);
  return { line: out, flag: lightened > 0 && neonNearby };
}

// Old PICO-8 / dark-grey hex literals (mostly in music-studio) -> night tokens. No canvas code uses these.
export const HEX_MAP = {
  '#FFEC27': 'var(--neon-gold)', '#29ADFF': 'var(--neon-cyan)', '#00E436': 'var(--neon-green)',
  '#FF004D': 'var(--neon-red)', '#FFA300': 'var(--neon-orange)', '#FF77A8': 'var(--neon-pink)',
  '#83769C': 'var(--neon-lilac)', '#1D2B53': 'var(--night-2)', '#C2C3C7': 'var(--text-2)',
  '#5F574F': 'var(--violet-4)', '#FFF1E8': 'var(--text-1)', '#101114': 'var(--night-1)',
  '#17181C': 'var(--night-1)', '#1B1D24': 'var(--night-2)', '#111827': 'var(--night-1)',
  '#1F2937': 'var(--violet-1)',
};
const HEX_RE = new RegExp(`(${Object.keys(HEX_MAP).join('|')})(?![0-9A-Fa-f])`, 'gi');

// Pixel rule: no rounded corners (rounded-full kept for tiny dots) and no blur.
// Only suffixed forms are removed, so plain strings like 'blur' or 'rounded' are never touched;
// the bare `rounded` class is neutralised by the radius guard in pixel.css instead.
const ROUNDED_RE = /(^|[\s'"`])(?:[a-z-]+:)*rounded-(?!full\b)[a-z0-9[\].-]+(?=[\s'"`]|$)/g;
const BLUR_RE = /(^|[\s'"`])(?:[a-z-]+:)*(?:backdrop-blur(?:-[a-z0-9[\]]+)?|blur-[a-z0-9[\]]+)(?=[\s'"`]|$)/g;

export function rewriteSource(src) {
  const lines = src.split('\n');
  const flags = [];
  const out = lines.map((l, i) => {
    const hood = lines.slice(Math.max(0, i - 2), i + 3).join('\n');
    const r = rewriteLine(l, hood);
    if (r.flag) flags.push(i + 1);
    const dropToken = (_m, lead) => (/\s/.test(lead) ? '' : lead);
    return r.line
      .replace(HEX_RE, h => HEX_MAP[h.toUpperCase()])
      .replace(ROUNDED_RE, dropToken)
      .replace(BLUR_RE, dropToken);
  });
  return { src: out.join('\n'), flags };
}

function walk(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.tsx$/.test(n) && !/\.test\.tsx$/.test(n)) acc.push(p);
  }
  return acc;
}

if (process.argv[1] && process.argv[1].endsWith('neon-codemod.mjs')) {
  const dir = process.argv[2];
  const write = process.argv.includes('--write');
  let changedFiles = 0, changedLines = 0;
  for (const f of walk(dir)) {
    const src = readFileSync(f, 'utf8');
    const { src: next, flags } = rewriteSource(src);
    if (next !== src) {
      changedFiles++;
      const a = src.split('\n'), b = next.split('\n');
      changedLines += a.filter((l, i) => l !== b[i]).length;
      if (write) writeFileSync(f, next);
    }
    for (const n of flags) console.log(`REVIEW ${f}:${n}`);
  }
  console.log(`${write ? 'WROTE' : 'DRY RUN'}: ${changedFiles} files, ${changedLines} lines`);
}
```

- [x] **Step 4: Run the tests.** Run `npm run test:scripts -w web`. Expected: all codemod tests and contrast tests pass, `fail 0`.
- [x] **Step 5: Dry run.** From `web/`: `node scripts/neon-codemod.mjs src > ../codemod-report.txt; tail -1 ../codemod-report.txt`
  Expected: a last line like `DRY RUN: 6x files, 6xx lines` (the exact number depends on the instructor-photo task) and some `REVIEW` lines (16 on 2026-10-02).
- [x] **Step 6: Apply.** From `web/`: `node scripts/neon-codemod.mjs src --write | tail -1`. Expected: `WROTE: ...`.
- [x] **Step 7: Check the testids are untouched.**
  Run: `git diff -U0 -- web/src | grep -E "^[-+].*data-testid" | sort | uniq -c`
  Expected: no output, or only pairs where the `-` and `+` lines have the **same** `data-testid` value (the line changed for a colour reason).
- [x] **Step 8: Review each REVIEW line by hand.** For each `REVIEW file:line` in `codemod-report.txt`, open the file. If the element can render a neon fill (`--c-yellow/green/orange/pink/blue/red/lavender`) **while** its text class is `text-[var(--text-1)]`, move the text class into each branch: `text-[var(--on-neon)]` in the neon branch and `text-[var(--text-1)]` in the other. Most flags (e.g. `isActive ? 'bg-…yellow… text-on-neon' : 'bg-…bg… text-text-1'`) are already correct; leave those alone. Delete `codemod-report.txt` afterwards.
- [x] **Step 9: Verify.** Run `npm test -w web` and `npm run build -w web`. Expected: same results as the Baseline. If a test now fails, use `systematic-debugging`; the codemod must never change behaviour.
- [x] **Step 10: Look at the app.** Run `npm run dev -w web`, then check `/login`, `/`, `/admin/attendance` at 390×844. Expected: all text is readable. Gold, green and red pills have dark text.
- [x] **Step 11: Commit.** `git add web/scripts web/src && git commit -m "refactor(theme): codemod text colours, corners, blur and hex to night tokens"`

---

### Task 4: Pixel art pipeline (`pixelize`)

**Skills:** `test-driven-development`.

**Files:**
- Create: `web/scripts/pixelize.mjs`, `web/scripts/pixelize.test.mjs`
- Modify: `web/package.json` (dev dependency), `.gitignore`

**Interfaces:**
- Produces: `pixelize(input: string|Buffer, output: string, width: number, height: number, key = false, position = 'centre') → Promise<{ width, height, coloursUsed }>`, `nearest(r, g, b) → [r, g, b]`, `isKey(r, g, b) → boolean`, `PALETTE`.
- CLI: `node scripts/pixelize.mjs <in> <out.webp> <w> <h> [--key] [--pos=bottom|top|centre]`.

Verified on 2026-10-02: the reference `DESIGN ELEMENT.jpeg` → 180×390, 16 colours, 14KB WebP. 4 of 4 tests pass.

- [x] **Step 1: Install sharp.** Run `npm i -D sharp@0.34.5 -w web`. Expected: `added … packages`. Add the line `web/art-src/` to `.gitignore`.
- [x] **Step 2: Write the test** `web/scripts/pixelize.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { pixelize, nearest, isKey } from './pixelize.mjs';

const out = name => join(tmpdir(), name);

test('nearest snaps to the locked palette', () => {
  assert.deepEqual(nearest(250, 60, 160), [0xFF, 0x3E, 0xA5]);
  assert.deepEqual(nearest(16, 12, 40), [0x0E, 0x0A, 0x24]);
});

test('isKey keys pure green but keeps palette neon green', () => {
  assert.equal(isKey(0, 255, 0), true);
  assert.equal(isKey(0x4D, 0xFF, 0x9A), false);
});

test('pixelize downsizes, keys green and uses only palette colours', async () => {
  const src = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#00FF00' } })
    .composite([{ input: await sharp({ create: { width: 200, height: 100, channels: 3, background: '#FF40A0' } }).png().toBuffer(), left: 100, top: 50 }])
    .png().toBuffer();
  const r = await pixelize(src, out('px-key.png'), 40, 20, true);
  assert.equal(r.width, 40); assert.equal(r.height, 20);
  const { data } = await sharp(out('px-key.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[3], 0);
  const mid = (10 * 40 + 20) * 4;
  assert.deepEqual([...data.subarray(mid, mid + 4)], [0xFF, 0x3E, 0xA5, 255]);
});

test('pos=bottom keeps the bottom of a tall image', async () => {
  const src = await sharp({ create: { width: 100, height: 400, channels: 3, background: '#0E0A24' } })
    .composite([{ input: await sharp({ create: { width: 100, height: 100, channels: 3, background: '#FFD23E' } }).png().toBuffer(), left: 0, top: 300 }])
    .png().toBuffer();
  await pixelize(src, out('px-pos.png'), 100, 25, false, 'bottom');
  const { data } = await sharp(out('px-pos.png')).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([...data.subarray(0, 3)], [0xFF, 0xD2, 0x3E]);
});
```

- [x] **Step 3: Run it.** Run `npm run test:scripts -w web`. Expected: FAIL, `Cannot find module ... pixelize.mjs`.
- [x] **Step 4: Create `web/scripts/pixelize.mjs`** with exactly this content:

```js
// Turns a Nano Banana image into true pixel art (spec §7).
// Usage: node scripts/pixelize.mjs <in.png> <out.png|out.webp> <width> <height> [--key] [--pos=bottom|top|centre]
//  --pos: which part to keep when the aspect ratio differs (default centre)
//  --key: treat the pure-green (#00FF00) chroma background as transparent
//  1. nearest-neighbour downscale to the native size
//  2. snap every pixel to the locked 16-colour palette; with --key, green-screen pixels become transparent
//  3. write PNG (lossless) or WebP (lossless)
import sharp from 'sharp';

export const PALETTE = [
  '#07051A', '#0E0A24', '#1A1440', '#2A1F5C', '#3B2C7A', '#4E3C99', '#6B5BA8', '#B9A8E6',
  '#F4ECFF', '#FF3EA5', '#3EE6FF', '#FFD23E', '#4DFF9A', '#FF6B8B', '#FF9A3E', '#05030F',
].map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));

/** Nearest palette colour by weighted RGB distance (green counts most, like the eye). */
export function nearest(r, g, b) {
  let best = PALETTE[0], bestD = Infinity;
  for (const p of PALETTE) {
    const dr = r - p[0], dg = g - p[1], db = b - p[2];
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

/** Chroma-key test: strong pure green. #4DFF9A (palette neon green) is NOT keyed because its blue is 154. */
export const isKey = (r, g, b) => g > 180 && r < 120 && b < 120;

export async function pixelize(input, output, width, height, key = false, position = 'centre') {
  const { data, info } = await sharp(input)
    .resize(width, height, { kernel: 'nearest', fit: 'cover', position })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128 || (key && isKey(data[i], data[i + 1], data[i + 2]))) { data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0; continue; }
    const [r, g, b] = nearest(data[i], data[i + 1], data[i + 2]);
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    const k = `${r},${g},${b}`; counts.set(k, (counts.get(k) || 0) + 1);
  }
  let img = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  img = output.endsWith('.webp') ? img.webp({ lossless: true }) : img.png({ palette: true, colours: 16 });
  await img.toFile(output);
  return { width: info.width, height: info.height, coloursUsed: counts.size };
}

if (process.argv[1] && process.argv[1].endsWith('pixelize.mjs')) {
  const [, , inp, out, w, h] = process.argv;
  if (!inp || !out || !w || !h) {
    console.error('Usage: node scripts/pixelize.mjs <in> <out.png|out.webp> <width> <height> [--key] [--pos=bottom|top|centre]');
    process.exit(1);
  }
  const r = await pixelize(inp, out, Number(w), Number(h), process.argv.includes('--key'),
    (process.argv.find(a => a.startsWith('--pos=')) || '--pos=centre').slice(6));
  console.log(`OK ${out} ${r.width}x${r.height}, ${r.coloursUsed} palette colours`);
}
```

- [x] **Step 5: Run the tests.** Run `npm run test:scripts -w web`. Expected: `fail 0`.
- [x] **Step 6: Smoke test on the reference image.** From `web/`: `node scripts/pixelize.mjs "../DESIGN ELEMENT.jpeg" ../px-smoke.webp 180 390`. Expected: `OK ../px-smoke.webp 180x390, 16 palette colours`. Delete `px-smoke.webp`.
- [x] **Step 7: Commit.** `git add web/scripts/pixelize.* web/package.json package-lock.json .gitignore && git commit -m "feat(art): pixelize pipeline (nearest downscale, palette lock, chroma key)"`

---

### Task 5: Generate the art with Nano Banana

**Skills:** `imagegen-frontend-web` (use only its prompt-craft and "one consistent palette across all images" rules; **ignore** its one-image-per-landing-section rule, which does not apply here), `brand` (logo consistency).

**Files:**
- Create: `web/art-src/*.png` (raw, git-ignored), `web/public/art/a1-sky.webp`, `a2-far.webp`, `a3-mid.webp`, `a4-near.webp`, `a5-strip.webp`, `a7-frame.webp`, `a8-plate.webp`, `a9-rooftop.webp`, `a9-shutter.webp`, `a9-boombox.webp`, `a10-boombox.webp`

**Interfaces:**
- Produces: the files above at exactly the native sizes in the table below. Tasks 6–10 reference them as `/art/<name>.webp`.

**How to generate each asset:**
1. Open both reference images (`DESIGN ELEMENT.jpeg`, `DESIGN ELEMENT 2.jpeg`) and attach `DESIGN ELEMENT.jpeg` to every image request as the style reference.
2. Start every prompt with the **STYLE LOCK** text below, then add the asset's own prompt.
3. Save the raw result as `web/art-src/<id>.png`.
4. From `web/`, run that row's pixelize command.
5. Check the result against the acceptance list. If it fails, regenerate (at most 3 tries), then show the owner the best attempt.

**STYLE LOCK** (copy verbatim at the start of every prompt):

> 16-bit pixel art, SNES-era game background quality. Hard square pixels, no anti-aliasing, no blur, no soft gradients — shading is flat colour bands plus 2×2 checker dithering only. Use ONLY these 16 colours: #07051A #0E0A24 #1A1440 #2A1F5C #3B2C7A #4E3C99 #6B5BA8 #B9A8E6 #F4ECFF #FF3EA5 #3EE6FF #FFD23E #4DFF9A #FF6B8B #FF9A3E #05030F. Mood: a neon city at night, deep indigo sky, violet buildings, hot-pink and cyan neon, warm gold lit windows, like the attached reference. Lighting: the moon at the top-left lights the top and left edges of shapes with lighter violet; neon signs below cast pink and cyan light upward; right and bottom faces are darker. Outline important shapes with #05030F. Absolutely no text, letters, numbers, logos, watermarks, signatures, people or user-interface elements.

**KEY suffix** (add after the asset prompt for every row marked `--key`):

> Place the artwork on a perfectly flat, solid pure green #00FF00 background. Nothing in the artwork itself may be pure green. No shadow or glow on the green background.

| ID → output | Ratio to request | Asset prompt (after STYLE LOCK) | Pixelize (from `web/`) |
|---|---|---|---|
| A1 → `a1-sky.webp` | 9:16 portrait | Tall night sky for a phone game title screen. The top 70% is sky in 5 hard horizontal bands from #07051A at the top to #2A1F5C lower down, joined by 2×2 dithering. Scattered 1-pixel and small plus-shaped stars in #F4ECFF and #B9A8E6, densest at the top. A crescent moon at the top-left in #F4ECFF with a #B9A8E6 rim. Two or three thin drifting cloud wisps in #4E3C99, with a very faint #4DFF9A tint on one, as in the reference. The bottom 30% is plain #2A1F5C haze with no buildings. | `node scripts/pixelize.mjs art-src/a1.png public/art/a1-sky.webp 180 390 --pos=top` |
| A2 → `a2-far.webp` | 21:9 | Wide panoramic far-away city skyline silhouette inspired by Kuala Lumpur: twin towers and a tall broadcast tower among many skyscrapers. The buildings fill only the bottom 45% of the image and are flat #1A1440 and #2A1F5C silhouettes with no outlines (hazy distance). Tiny 1-pixel lit windows in #FFD23E and #3EE6FF, about 1 window in 12 lit. Roof heights vary across the whole width. `--key` | `node scripts/pixelize.mjs art-src/a2.png public/art/a2-far.webp 320 90 --key --pos=bottom` |
| A3 → `a3-mid.webp` | 21:9 | Wide panoramic mid-distance cyberpunk skyline: 10–14 towers with antenna spikes and stepped rooftops, vertical neon strips in #FF3EA5 and #3EE6FF, many lit windows in #FFD23E. Building fronts in #2A1F5C/#3B2C7A, left faces lighter (#4E3C99, moonlight), right faces darker (#1A1440). 1-pixel #05030F outlines. The buildings fill the bottom 60%. `--key` | `node scripts/pixelize.mjs art-src/a3.png public/art/a3-mid.webp 320 120 --key --pos=bottom` |
| A4 → `a4-near.webp` | 4:3 | Close foreground at the bottom of the image: a rooftop ledge and walkway railing across the full width, two **blank** vertical neon sign boards (no letters) in #FF3EA5 and #3EE6FF, each with 2 hard rings of glow, small AC units, hanging cables and a few warm #FFD23E windows. Pink and cyan light spills upward onto edges. Thick #05030F outlines. Fills the bottom 70%. `--key` | `node scripts/pixelize.mjs art-src/a4.png public/art/a4-near.webp 195 140 --key --pos=bottom` |
| A5 → `a5-strip.webp` | 21:9 | A very long, very thin strip of tiny city rooftops along the bottom edge only (the bottom 12% of the image; everything above is background). Both the far-left and far-right ends finish on a flat rooftop at the same height so copies placed side by side join. Silhouettes in #2A1F5C with a 1-pixel #4E3C99 top highlight, 1-pixel windows in #FFD23E and #3EE6FF, and one or two #FF3EA5 neon dots. `--key` | `node scripts/pixelize.mjs art-src/a5.png public/art/a5-strip.webp 480 24 --key --pos=bottom` |
| A7 → `a7-frame.webp` | 4:3 | One empty rectangular neon sign frame seen from the front, like a retro arcade marquee: an outer tube in #3EE6FF and an inner tube in #FF3EA5, each 2 pixels thick, small metal brackets at the four corners in #6B5BA8 with #05030F outlines, and a glow drawn as 2 hard pixel rings of #4E3C99 outside the frame. The frame fills about 90% of the image. The **inside of the frame is empty** (background shows through). `--key` | `node scripts/pixelize.mjs art-src/a7.png public/art/a7-frame.webp 128 96 --key` |
| A8 → `a8-plate.webp` | 5:1 (or 21:9) | One blank horizontal neon sign plate, front view: a dark #1A1440 board with a #05030F outline, a thin #B9A8E6 tube running around its edge, two small mounting bolts at the left and right ends, and a slight #3B2C7A top-left highlight. The plate is **completely blank, no letters**. It fills the image width. `--key` | `node scripts/pixelize.mjs art-src/a8.png public/art/a8-plate.webp 160 32 --key` |
| A9a → `a9-rooftop.webp` | 3:2 | A small quiet rooftop at night: a water tank, an antenna and one blinking #FF6B8B aircraft light, under a starry #0E0A24 sky. Calm and empty. | `node scripts/pixelize.mjs art-src/a9a.png public/art/a9-rooftop.webp 96 64` |
| A9b → `a9-shutter.webp` | 3:2 | A closed metal roller shutter of a small dance studio at night, a dim #FFD23E lamp above it, a blank unlit neon sign (no letters) and a wet pavement reflecting #FF3EA5. | `node scripts/pixelize.mjs art-src/a9b.png public/art/a9-shutter.webp 96 64` |
| A9c → `a9-boombox.webp` | 3:2 | A sleeping retro boombox (two round speakers, a cassette deck, a handle) on a rooftop ledge with small "z z" shaped pixel clouds (shapes only, not letters) floating above it, under a night sky. | `node scripts/pixelize.mjs art-src/a9c.png public/art/a9-boombox.webp 96 64` |
| A10 → `a10-boombox.webp` | 1:1 | One retro boombox sprite, front view, centred, filling 80% of the image: a black #05030F body with #6B5BA8 highlights, two round speakers with #3EE6FF rims, a cassette window in #B9A8E6, a #FF3EA5 power light and a top handle. Game sprite style. `--key` | `node scripts/pixelize.mjs art-src/a10.png public/art/a10-boombox.webp 32 32 --key` |

- [x] **Step 1: Generate and pixelize A1–A5, A7, A8, A9a–c and A10** as described above. Each pixelize command must print `OK … <w>x<h>`.
- [x] **Step 2: Check every output** (open it in an image viewer at 400% zoom, with nearest-neighbour or "pixelated" display):
  - [x] the size matches the table exactly;
  - [x] there are no letters or words anywhere (A7, A8 and A9b especially);
  - [x] the `--key` assets have a transparent background and no green fringe (if there is a fringe, regenerate with "thicker #05030F outline around everything");
  - [x] the lighting follows the STYLE LOCK (lighter top-left edges);
  - [x] it reads clearly at ×2 on a phone (A10 must read as a boombox at 64px).
- [x] **Step 3: Check the budget.** From `web/`: `node -e "const fs=require('fs');let t=0;for(const f of fs.readdirSync('public/art'))t+=fs.statSync('public/art/'+f).size;console.log(Math.round(t/1024)+' KB')"`. Expected: **300 KB or less** (achieved: 20 KB).
- [x] **Step 4: 🧑 OWNER ACTION — art review.** Show the owner every file in `web/public/art/` (at ×4 zoom). Ask: "Do these match the look you want? Any asset to redo?" Owner approved.
- [x] **Step 5: Commit** (only `public/art`; `art-src` is ignored): `git add web/public/art && git commit -m "feat(art): neon pixel city assets (Nano Banana, palette-locked)"`

---

### Task 6: Art components — CityBackdrop, SkylineStrip, Boombox, LogoBadge

**Skills:** `ui-styling`, `frontend-design`, `test-driven-development`.

**Files:**
- Create: `web/src/components/art/CityBackdrop.tsx`, `SkylineStrip.tsx`, `Boombox.tsx`, `web/src/components/ui/LogoBadge.tsx`, `web/src/components/art/art.test.tsx`

**Interfaces:**
- Consumes: classes from Task 2; images from Task 5; the logo at `/logo.png` (added by the instructor-photo task; confirm the path with `ls web/public`).
- Produces:
  - `CityBackdrop(): JSX.Element`. A full-viewport fixed layer stack at `z-index: var(--z-sky)`, with `aria-hidden="true"` and `data-testid="city-backdrop"`.
  - `SkylineStrip(): JSX.Element`. 48px tall, `aria-hidden="true"`, `data-testid="skyline-strip"`.
  - `Boombox({ size?: 32 | 64 | 96 }): JSX.Element`. Default 64; `aria-hidden="true"`.
  - `LogoBadge({ height?: number }): JSX.Element`. Default 96; renders `<img alt="UMDSC logo">`.

- [x] **Step 1: Write the failing tests** `web/src/components/art/art.test.tsx`:
  - `CityBackdrop`: `getByTestId('city-backdrop')` has `aria-hidden="true"`; it contains 4 layer elements, `[data-layer="sky"|"far"|"mid"|"near"]`; the backdrop's inline `style.backgroundColor` is `var(--night-1)` (the CSS fallback for when art fails).
  - `SkylineStrip`: `aria-hidden="true"`, and its `style.height` is `48px`.
  - `Boombox`: `size={32}` gives `style.width === '32px'`, and the element has the class `px-bounce`.
  - `LogoBadge`: `getByAltText('UMDSC logo')` exists.
- [x] **Step 2: Run the tests.** Run `npm test -w web -- art.test`. Expected: FAIL (modules not found).
- [x] **Step 3: Implement the four components:**
  - **CityBackdrop:** a fixed, `inset-0`, `overflow-hidden` wrapper with `backgroundColor: var(--night-1)` (inline style). Inside it, four absolutely positioned layers:
    - `sky`: `a1-sky.webp` as `background-image`, `background-size: cover`, class `px-art`.
    - `far`: an `<img src="/art/a2-far.webp" class="px-art px-drift-far">`, positioned bottom 30%, with `width: 640px` (×2), so wider than the phone.
    - `mid`: `a3-mid.webp`, positioned bottom 18%, `width: 640px`, class `px-drift-mid`.
    - `near`: `a4-near.webp`, bottom 0, `width: 390px` (×2 of 195), centred.
    - All `<img>` elements get `alt=""`, `draggable={false}`, `loading="eager"`.
    - **Desktop** (`min-width: 1024px`): the screen is wider than the art, so the `far` and `mid` layers switch from `<img>` to a div with `background: url(...) repeat-x bottom left / 960px auto` (×3), `width: calc(100% + 384px)`, with the same drift classes. A seam may show on very wide screens, which is acceptable for distant layers. `near` is 585px wide (×3), centred.
    - Also add a `useEffect` that adds the class `px-paused` to the wrapper while `document.hidden` (listen to `visibilitychange`).
  - **SkylineStrip:** a div with height 48px, `background: url(/art/a5-strip.webp) repeat-x bottom left / 960px 48px`, class `px-art`, and a 2px bottom border `var(--outline)`.
  - **Boombox:** `<img src="/art/a10-boombox.webp">` with `width` and `height` equal to `size`, classes `px-art px-bounce`, `alt=""`.
  - **LogoBadge** (the logo's text and silhouette are black, so it needs a light backing): a relative box with `height` as given and width = height × 4/3.
    - Background layer: a `--text-1` (#F4ECFF) "lightbox" rectangle inset 12.5% on every side.
    - The logo `<img src="/logo.png" alt="UMDSC logo">`, `object-fit: contain`, on top of the lightbox, with `image-rendering: auto` (the logo is not pixel art).
    - The frame `<img src="/art/a7-frame.webp" class="px-art" alt="">` covering the whole box, above the logo.
- [x] **Step 4: Run the tests.** Run `npm test -w web -- art.test`. Expected: PASS.
- [x] **Step 5: Commit.** `git add web/src/components/art web/src/components/ui/LogoBadge.tsx && git commit -m "feat(art): city backdrop, skyline strip, boombox and logo badge components"`

---

### Task 7: Core UI components restyle (spec §8)

**Skills:** `ui-styling`, `impeccable` (polish + micro-interaction pass), `test-driven-development` for the new components.

**Files:**
- Create: `web/src/components/ui/NeonSign.tsx`, `PixelPortraitFrame.tsx`, `web/src/components/ui/neon.test.tsx`
- Modify: `PixelButton.tsx`, `Panel.tsx`, `Field.tsx`, `Sheet.tsx`, `Toast.tsx`, `Spinner.tsx`, `EmptyState.tsx`, `HeartsBar.tsx`, `TimePicker.tsx`, `EventPicker.tsx`, `UserInfoBoard.tsx`, `ColorSwatchPicker.tsx`, `LiveClock.tsx` (all in `web/src/components/ui/`); `web/src/theme/tokens.css` (two bevel tokens); `web/src/theme/pixel.css` (well focus, sheet animation)

**Interfaces:**
- Produces:
  - `NeonSign({ text: string, color: string, size?: 'sm' | 'md' }): JSX.Element`. `color` is any CSS colour (a token or a custom hex). It renders `<span data-testid="neon-sign">`: the A8 plate as background (`/art/a8-plate.webp`, `background-size: 100% 100%`), the text in `--font-display` (12px for `sm`, 16px for `md`), uppercase, in `color: var(--text-1)`, with class `px-glow-text` and the inline style `--glow: <color>`, and a 2px underline in `<color>`.
  - `PixelPortraitFrame({ src: string, alt: string, name: string, glow: string, size?: 'sm' | 'lg' }): JSX.Element`. 4:5 box (`sm` 96×120, `lg` 216×270, `lg` becomes `width: 100%` below 360px).
    - Backdrop: banded night (`linear-gradient(to bottom, var(--night-0) 0 25%, var(--night-1) 25% 55%, var(--night-2) 55% 80%, var(--violet-1) 80%)`) plus `.px-starfield` stars, because the cut-out photos are transparent.
    - The photo: `<img>` with `object-fit: cover; image-rendering: auto`.
    - `.px-scanlines` over the photo, and `.px-neon` with `--glow: <glow>` on the frame.
    - The name plate below: `--night-2` background, display 12px `--text-1`, a 4px left stripe in `<glow>`, and `truncate`.
- Keep every existing export, prop and `data-testid` of the modified components.

- [x] **Step 1: Write the failing tests** `web/src/components/ui/neon.test.tsx`:
  - `NeonSign` with `text="Hip Hop"` and `color="#123456"`: the text "Hip Hop" is visible; the element's `style.getPropertyValue('--glow')` is `#123456`; the element's `style.color` is `var(--text-1)` (**Review Focus 1: a custom colour never becomes the text colour**).
  - `PixelPortraitFrame` with `alt="Carmen Loh"` and `name="Carmen Loh"`: `getByAltText('Carmen Loh')` exists; the name text is rendered; the frame element's `--glow` equals the `glow` prop.
- [x] **Step 2: Run the tests.** Run `npm test -w web -- neon.test`. Expected: FAIL.
- [x] **Step 3: Implement `NeonSign` and `PixelPortraitFrame`** per the Interfaces above. Run the test again. Expected: PASS.
- [x] **Step 4: Restyle the existing components** exactly per the spec §8 table. Concretely:
  - **PixelButton:** use the `primary` recipe from §8 (pink fill `--neon-pink`, label `--on-neon`, `box-shadow: inset 2px 2px 0 #FF8FCB, inset -2px -2px 0 #B8206F, 4px 4px 0 var(--outline)`). Hover and `focus-visible` add `px-neon` with `[--glow:var(--neon-pink)]`; active gives `translate-x-[4px] translate-y-[4px] shadow-none`. Also restyle `secondary`, `danger` and `ghost` per §8. Sizes: `sm` min-h 44px, text 8px; `md` min-h 48px, text 12px; `lg` min-h 56px, text 16px (Press Start sizes only).
    - Add the bevel colours to `tokens.css` as `--neon-pink-hi: #FF8FCB;` and `--neon-pink-lo: #B8206F;` and use `var(--neon-pink-hi)` / `var(--neon-pink-lo)` in the class. No hex in `.tsx`.
  - **Panel:** the root gets `px-panel px-corners`. Title bar: `bg-[var(--night-2)]`, `border-b-2 border-[var(--neon-cyan)]`, title `font-display text-[12px] text-[var(--text-1)] px-glow-text`. Padding `p-4`.
  - **Field** (inputs, selects, textareas): `px-well`, `text-[16px] font-body text-[var(--text-1)] placeholder:text-[var(--text-3)]`. For the focus glow, add this rule to `pixel.css` (a Tailwind variant cannot apply a custom class):
    ```css
    .px-well:focus-visible {
      border-color: var(--neon-cyan);
      box-shadow: 0 0 0 2px var(--outline),
        0 0 0 4px color-mix(in srgb, var(--neon-cyan) 45%, transparent),
        0 0 0 6px color-mix(in srgb, var(--neon-cyan) 18%, transparent) !important;
    }
    ```
    Label: `font-display text-[8px] text-[var(--text-2)] uppercase`. Error: border `--neon-red` and message `text-[14px] text-[var(--neon-red)]`.
  - **Sheet:**
    - Backdrop: `bg-[var(--night-0)]/80 px-dither` (replaces `opacity-60` ink).
    - Panel: `px-panel`, `max-h-[calc(100dvh-48px)] overflow-y-auto pixel-scrollbar`, with `border-t-2 border-[var(--neon-cyan)]`.
    - Grab bar: three 4×4 `--violet-4` squares with 4px gaps, centred on top.
    - Slide-up: add `@keyframes px-sheet-in { from { transform: translateY(100%) } to { transform: translateY(0) } }` to `pixel.css` and apply `animation: px-sheet-in 160ms ease-out` on phones only (`max-width: 639px`). z-index `var(--z-overlay)`.
  - **Toast:** `px-panel`, an 8px left stripe in the status colour, z-index `var(--z-toast)`, and an enter animation of `steps(4)` translateY 16px→0 in 200ms.
  - **Spinner:** render `<Boombox size={64} />` plus the existing text and test id. Keep the old spinner markup as a fallback via `onError` on the image (hide the image and show the old spinner).
  - **EmptyState:** add an optional prop `scene?: 'rooftop' | 'shutter' | 'boombox'` (default `'rooftop'`) that renders `/art/a9-<scene>.webp` at `width: 288px` (×3; `192px` ×2 below 360px wide), `px-art`, `alt=""`, `loading="lazy"`. Title display 12px, body 16px `--text-2`.
  - **HeartsBar:** full `--neon-pink`, empty `--violet-4`, 2px `--outline`.
  - **LiveClock:** `font-mono text-[24px] text-[var(--neon-gold)]` (compact: 20px).
  - **ColorSwatchPicker:** swatches are 32×32 (tap area 44×44 with padding); selected = `px-neon` with `--glow` = that swatch. Do **not** change the stored keys or the `DEFAULT_SWATCHES` keys.
  - **TimePicker, EventPicker, UserInfoBoard:** apply `px-panel`/`px-well` and token colours. No layout changes.
- [x] **Step 5: Verify.** Run `npm test -w web`. Expected: same as the Baseline plus the new tests passing. Then `npm run build -w web`: same as the Baseline.
- [x] **Step 6: Commit.** `git add web/src && git commit -m "feat(ui): neon pixel restyle of core components, NeonSign, PixelPortraitFrame"`

---

### Task 8: App shells — top bar, skyline strip, arcade dock, sidebar

**Skills:** `ui-styling`, `ui-ux-pro-max` (mobile layout and thumb-zone checklist), `impeccable`.

**Files:**
- Modify: `web/src/app/PhoneShell.tsx`, `web/src/app/DesktopShell.tsx`, `web/src/components/ui/TabBar.tsx`, `web/src/components/ui/Sidebar.tsx`

**Interfaces:**
- Consumes: `SkylineStrip`, `LogoBadge` (Task 6); `--dock-h`, `--topbar-h` and the z-tokens (Task 1).
- Keep: every `data-testid` (`phone-shell`, `mobile-role-badge`, `user-info-toggle-btn`, `mobile-user-info-dropdown`, `mobile-nav-toggle-btn`, `mobile-tab-more`, `tabbar-more-drawer`, `tabbar-more-backdrop`), the HIDE/SHOW NAV behaviour and all props.

- [x] **Step 1: PhoneShell:**
  - Root: replace `bg-[var(--c-bg)]` with `px-starfield` and use `min-h-[100dvh]`.
  - Sticky top bar: `bg-[var(--night-2)]`, `pt-[env(safe-area-inset-top)]`, inner row `h-[var(--topbar-h)]`, `z-[var(--z-chrome)]`, `border-b-2 border-[var(--outline)]`, `shadow-[0_4px_0_var(--outline)]`.
  - **Logo:** if the instructor-photo task put a plain logo `<img>` in the top bar, replace it with `<LogoBadge height={40} />`. If it is not there, add `<LogoBadge height={40} />` before the "UMDSC" word.
  - Render `<SkylineStrip />` directly under the top bar row, inside the sticky container, so it stays with the bar.
  - Main content bottom padding: `pb-[calc(var(--dock-h)+env(safe-area-inset-bottom)+24px)]` when the nav is shown, and `pb-8` when it is hidden.
  - The "HIDE NAV" button moves to `bottom-[calc(var(--dock-h)+env(safe-area-inset-bottom)+16px)]` and is styled as a `secondary` chip, at least 44px tall.
- [x] **Step 2: TabBar → Arcade Dock** (spec §8):
  - The `<nav>`: `fixed left-2 right-2 bottom-[calc(8px+env(safe-area-inset-bottom))] h-[var(--dock-h)] px-panel z-[var(--z-chrome)] md:max-w-[544px] md:mx-auto`.
  - Each tab: `min-h-[56px] flex-1`, icon 24px, label `font-display text-[8px] uppercase`.
  - Active tab: `bg-[var(--neon-gold)] text-[var(--on-neon)]`, plus a 4px gold bar above it (`before:` pseudo-element, `before:absolute before:-top-[6px] before:inset-x-2 before:h-1 before:bg-[var(--neon-gold)]`).
  - Inactive: `text-[var(--text-2)]`. Dividers: `border-r-2 border-[var(--outline)]`. Badge: a `bg-[var(--neon-red)] text-[var(--on-neon)]` 2px-outlined square, at least 16px, text 8px.
  - **More drawer:** render it with the existing `Sheet` (Task 7) instead of the custom fixed div, keeping both `data-testid`s on the matching elements. Items: grid of 2 columns, each item at least 48px tall, `px-panel`; active item gold.
- [x] **Step 3: Desktop (`DesktopShell`, `Sidebar`):**
  - Sidebar column `bg-[var(--night-2)] border-r-4 border-[var(--outline)]`.
  - `<LogoBadge height={72} />` at the top.
  - Items 48px tall; active item `bg-[var(--violet-2)] text-[var(--text-1)]` with a 4px `--neon-gold` left bar; hover `bg-[var(--violet-1)]`.
  - The main area uses `px-starfield`.
- [x] **Step 4: Verify on phone sizes.** Run `npm run dev -w web` and check `/admin/attendance` and `/` at 390×844 and 360×780. Expected:
  - the dock floats 8px above the bottom;
  - the last list item is fully visible above the dock;
  - the strip sits under the top bar;
  - nothing scrolls sideways.
- [x] **Step 5: Run the shell e2e.** Run `npm run e2e -w web -- shell.spec.ts a11y.spec.ts`. Expected: same results as the Baseline.
- [x] **Step 6: Commit.** `git add web/src && git commit -m "feat(shell): neon top bar with skyline strip, arcade dock, sidebar"`

---

### Task 9: Login, calendar, class cards, instructor portraits

**Skills:** `impeccable`, `ui-styling`, `frontend-design`.

**Files:**
- Modify: `web/src/features/auth/TitleScreen.tsx`, `web/src/features/auth/AdminLogin.tsx`, `web/src/components/ui/MonthCalendar.tsx`, `web/src/features/calendar/ClassCard.tsx`, `web/src/features/calendar/DaySheet.tsx`, `web/src/features/calendar/DancerHome.tsx`, `web/src/features/masterdata/InstructorsPage.tsx`, and whichever component the instructor-photo task created for the photo pop-up (find it with `grep -rln "instructors/\|photo" web/src --include=*.tsx`)

**Interfaces:**
- Consumes: `CityBackdrop`, `Boombox`, `LogoBadge` (Task 6); `NeonSign`, `PixelPortraitFrame`, `PixelButton`, `Panel`, `Sheet` (Task 7); `getStyleColor(colorKey)` from `web/src/theme/colors.ts` (unchanged).

- [ ] **Step 1: TitleScreen (dancer login) and AdminLogin:**
  - The root renders `<CityBackdrop />` first.
  - Content is in a `relative z-[var(--z-content)] min-h-[100dvh] flex flex-col items-center justify-end` column, so the card sits in the lower thumb zone with the city visible above.
  - `<LogoBadge height={120} />` in the upper third (at 360px wide: `height={96}`).
  - `<Boombox size={64} />` beside the "▼ PRESS START ▼" heading, which becomes `font-display text-[12px] text-[var(--neon-gold)] px-glow-text px-blink`.
  - The login card is a `Panel`; its inputs are `Field`s and its submit button is `PixelButton` `primary` `lg`, full width.
  - Keep all wording, labels and test ids.
  - Bottom margin: `mb-[calc(24px+env(safe-area-inset-bottom))]`.
- [ ] **Step 2: MonthCalendar** (spec §8):
  - Day cells: `px-well`, at least 44×44.
  - Today: `border-[var(--neon-cyan)]` + `px-neon`.
  - Selected: `bg-[var(--violet-2)] border-[var(--neon-gold)]`.
  - Class dots: 4×4 squares (not circles) in `getStyleColor(style.colorKey)`, up to 4 per cell, in a row at the bottom.
  - Weekday header: `font-display text-[8px] text-[var(--text-2)]`.
- [ ] **Step 3: ClassCard and DaySheet:**
  - The card is `px-panel` with a 4px left border in the style colour.
  - The style name renders as `<NeonSign text={style.name} color={getStyleColor(style.colorKey)} size="sm" />`.
  - Time: `font-mono text-[24px] text-[var(--neon-gold)]`.
  - Venue and instructor: 16px `--text-2`.
  - A class happening now gets `px-neon` with `--glow` = the style colour (this counts towards the two-glow limit).
- [ ] **Step 4: Instructor portraits.**
  - Wherever the instructor photo is shown, replace the bare `<img>` with `<PixelPortraitFrame src=… alt={instructor.name} name={instructor.name} glow={getStyleColor(style.colorKey)} size="lg" />`. The places are: the pop-up from the calendar, which per the owner has the photo on the left and info on the right on wide screens and the photo on top on phones, and the instructor list.
  - On `InstructorsPage` (no style context), use `size="sm"` and `glow="var(--neon-cyan)"`.
  - Keep the upload, active-picture and remove controls exactly as the instructor-photo task built them; only restyle them with `PixelButton` variants.
- [ ] **Step 5: Look at the screens.** Check `/login`, `/` (dancer home, then open a day) and `/admin/instructors` at 390×844 and 360×780. Expected:
  - the city fills the login screen behind the card;
  - the portrait frame glows in the style colour;
  - instructor names truncate with "…" and do not wrap the frame wider.
- [ ] **Step 6: Run the tests.** Run `npm test -w web` and `npm run e2e -w web -- login.spec.ts dancer-home.spec.ts admin-masterdata.spec.ts`. Expected: same as the Baseline.
- [ ] **Step 7: Commit.** `git add web/src && git commit -m "feat(ui): neon login city, calendar, class cards, instructor portrait frames"`

---

### Task 10: Admin screens sweep

**Skills:** `impeccable` (audit then polish each screen), `ui-ux-pro-max`.

**Files:**
- Modify (each one only for visuals):
  - `web/src/features/attendance/AttendanceGrid.tsx`, `AttendancePage.tsx`, `RosterList.tsx`
  - `web/src/features/members/MembersPage.tsx`
  - `web/src/features/events/**/*.tsx`
  - `web/src/features/media/*.tsx`
  - `web/src/features/classes/*.tsx`
  - `web/src/features/access/*.tsx`
  - `web/src/features/settings/*.tsx`
  - `web/src/features/setup/SetupPage.tsx`
  - `web/src/features/me/MePage.tsx`
  - `web/src/features/masterdata/StylesPage.tsx`

**Per-screen checklist.** Apply all of these to every file listed above:
1. Containers → `Panel` or `px-panel`; inputs → `Field` or `px-well`; buttons → `PixelButton` (pick the variant by meaning: the one main action per screen is `primary`, destructive actions are `danger`, everything else `secondary`/`ghost`).
2. **Only one `primary` button visible at a time** per screen or sheet (this keeps neon at about 10%).
3. Status colours by meaning only: present/success `--neon-green`, absent/error `--neon-red`, warning `--neon-orange`, info `--neon-cyan`, active/selected `--neon-gold`. Labels on these fills use `--on-neon`.
4. Tables and lists:
   - rows at least 48px, zebra `--violet-1` / `--night-2`;
   - sticky header `bg-[var(--night-2)] border-b-2 border-[var(--neon-cyan)]`;
   - horizontal scroll only inside a `pixel-scrollbar overflow-x-auto` wrapper, never the page.
5. Text sizes only 8/12/16/24/32px display, 14/16/18/20px body, 20/24/32px mono. Replace `text-[9px]` and `text-[10px]` with `text-[8px]` (labels) or `text-[12px]`. Replace `text-[11px]`/`text-xs` with `text-[12px]`.
6. Gaps and padding are multiples of 4px, at least 8px between separate elements.
7. Empty lists use `EmptyState` with a scene: attendance → `rooftop`, media → `boombox`, events/classes → `shutter`.
- **Attendance specifics** (`AttendanceGrid`/`RosterList`):
  - Present is a 32×32 `bg-[var(--neon-green)]` square with a 2px `--outline` and a pixelarticons `check` icon in `--on-neon`, inside a 48×48 tap area.
  - Absent is a hollow 32×32 square with a 2px `--violet-4` border.
  - The Edit/Submit mode bar sticks to the bottom above the dock: `bottom-[calc(var(--dock-h)+env(safe-area-inset-bottom)+16px)]`.

- [ ] **Step 1: Attendance** (AttendanceGrid, AttendancePage, RosterList): apply the checklist. Run `npm run e2e -w web -- admin-attendance.spec.ts`; expected same as the Baseline. Commit: `git commit -am "style(attendance): neon pixel attendance grid"`
- [ ] **Step 2: Events and Members:** apply the checklist. Run `npm run e2e -w web -- admin-events.spec.ts admin-event-wizard.spec.ts admin-members-list.spec.ts`; expected same as the Baseline. Commit: `style(events,members): neon pixel restyle`.
- [ ] **Step 3: Media and Classes:** apply the checklist. Run `npm run e2e -w web -- admin-media.spec.ts admin-classes.spec.ts admin-today.spec.ts`; expected same as the Baseline. Commit: `style(media,classes): neon pixel restyle`.
- [ ] **Step 4: Access, Settings, Setup, Me, Styles:** apply the checklist. Run `npm run e2e -w web -- admin-access.spec.ts admin-settings.spec.ts admin-masterdata.spec.ts`; expected same as the Baseline. Commit: `style(admin): neon pixel restyle of remaining screens`.

---

### Task 11: Music Studio / DanceCue

**Skills:** `impeccable`, `redesign-skill` (**audit checklist only**: list leftover generic glassmorphism patterns before fixing them).

**Files:**
- Modify:
  - `web/src/features/music-studio/Studio.tsx`, `StudioPage.tsx`, `FullscreenStudio.tsx`
  - `web/src/features/music-studio/sources/*.tsx`, `markers/ClassSectionsList.tsx`, `sync/VideoPanel.tsx`, `sync/VideoTimeline.tsx`
  - `web/src/features/music-studio/dancecue/DanceCueApp.tsx`, `dancecue/components/*.tsx`, `dancecue/dancecue.css`

The Studio uses Tailwind's default "dark glass" palette instead of tokens. Replace classes with this table:

| Find (any shade or opacity) | Replace with |
|---|---|
| `bg-white/[0.0x]`, `bg-white/5`, `bg-white/10` | `bg-[var(--violet-1)]` (panels) or `bg-[var(--violet-2)]` (hover/selected) |
| `bg-black/20`–`/40`, `bg-zinc-9xx` | `bg-[var(--night-1)]` (wells) |
| `border-white/10`, `border-white/15`, `border-black` | `border-2 border-[var(--outline)]` |
| `text-white`, `text-zinc-50`–`100` | `text-[var(--text-1)]` |
| `text-zinc-300`–`500`, `placeholder:text-zinc-*` | `text-[var(--text-2)]` / `placeholder:text-[var(--text-3)]` |
| `*-cyan-*` | the same utility with `[var(--neon-cyan)]` (focus/info/playhead) |
| `*-fuchsia-*`, `*-pink-*` | `[var(--neon-pink)]` |
| `*-yellow-*`, `*-amber-*` | `[var(--neon-gold)]` |
| `*-rose-*`, `*-red-*` | `[var(--neon-red)]` |
| `shadow-lg`, `shadow-black/*`, `shadow-[0_0_32px_…]`, `shadow-[inset_0_1px_0_rgba…]` | remove; add `px-panel` (panels) or `px-well` (inputs/tracks) |
| `focus:ring-*` | remove (the global focus ring covers it) |
| `bg-gradient-*`, `from-*`, `to-*` | remove, use a flat token colour |
| `transition`, `transition-*` | keep only on `opacity`/`transform`; otherwise remove |

**Studio specifics** (spec §8): playhead `--neon-cyan` 2px wide; A–B loop region `bg-[color-mix(in_srgb,var(--neon-pink)_30%,transparent)]` with 2px `--neon-pink` edges; markers are 8×8 `--neon-gold` squares with a 2px `--outline`; play/pause is `PixelButton primary lg` and is the only primary on the screen; the YouTube/SoundCloud/video player frame gets `px-scanlines` **only on the frame border area, never over the video picture** (put scanlines on a frame wrapper's `::before` behind the player, not over it).

- [ ] **Step 1: Audit.** Run `grep -rnoE "(bg|text|border|shadow|ring|from|to)-(white|black|zinc|cyan|fuchsia|yellow|amber|rose|red|pink)[^ \"'\`]*" web/src/features/music-studio | wc -l` and note the number.
- [ ] **Step 2: Replace.** Apply the table file by file.
- [ ] **Step 3: Check the audit is clean.** Run the Step 1 command again. Expected: `0`.
- [ ] **Step 4: Run the tests.** Run `npm test -w web -- music-studio` and `npm run e2e -w web -- studio.spec.ts studio-sync.spec.ts`. Expected: same as the Baseline. (Two component tests check `opacity-0` on the player boxes; keep those classes.)
- [ ] **Step 5: Look at the screen.** Check `/studio` at 390×844, both in normal and fullscreen mode. Expected: the loop region, markers and playhead are clearly visible, and the video picture is not darkened.
- [ ] **Step 6: Commit.** `git add web/src/features/music-studio && git commit -m "style(studio): neon pixel music studio"`

---

### Task 12: Visual and Review-Focus e2e, final verification

**Skills:** `webapp-testing`, `verification-before-completion`, `requesting-code-review`.

**Files:**
- Create: `web/e2e/visual-neon.spec.ts`

**Interfaces:**
- Consumes: `loginAsAdmin`, `mockApi` from `web/e2e/fixtures/mockApi.ts`. For the dancer home route, copy the setup used by the first test in `web/e2e/dancer-home.spec.ts`.

- [ ] **Step 1: Write `web/e2e/visual-neon.spec.ts`** with these tests (in the `mobile` project the viewport is already 390×844):
  1. **`screenshots @390`**: for each route in `['/login', '/', '/admin/calendar', '/admin/attendance', '/admin/media', '/admin/members', '/admin/events', '/admin/styles', '/admin/instructors', '/admin/settings', '/studio']` (with `loginAsAdmin` + `mockApi` for every route except `/login`): go to the route, wait for `networkidle`, then `page.screenshot({ path: \`test-results/neon/390${route.replace(/\//g, '_') || '_root'}.png\`, fullPage: true })`. No pixel assertions; the owner reviews the images.
  2. **`no sideways scroll @360`** (Review Focus 2): `page.setViewportSize({ width: 360, height: 780 })`. Build long-name data from the fixtures:
     ```ts
     const longStyles = adminBootstrap.styles.map((s, i) => i === 0 ? { ...s, name: 'Contemporary Lyrical Jazz' } : s);
     const longInstructors = [{ id: 'inst-long', name: 'Alexandra Catherine Tan-Rodriguez', contact: '0123456789', version: 1, updatedBy: 'admin', updatedAt: '2026-10-01T00:00:00.000Z', active: true }];
     await mockApi(page, {
       'admin.bootstrap': () => ({ ...adminBootstrap, styles: longStyles, instructors: longInstructors }),
       'styles.list': () => longStyles,
       'instructors.list': () => longInstructors,
     });
     ```
     (`adminBootstrap` is imported from `./fixtures/mockData`.) For each route above, assert `document.documentElement.scrollWidth <= window.innerWidth`, and save a screenshot to `test-results/neon/360…png`.
  3. **`login readable when art fails`** (Review Focus 3): `page.route('**/art/**', r => r.abort())`, go to `/login`, expect the Full Name input and the submit button to be visible, and expect `getComputedStyle(document.body).backgroundColor` to equal `rgb(14, 10, 36)`.
  4. **`reduced motion stops pixel animation`** (Review Focus 4): `test.use({ reducedMotion: 'reduce' })` in its own `describe`. Go to `/login` and assert that every element matching `.px-twinkle, .px-drift-far, .px-drift-mid, .px-bounce, .px-blink` has computed `animationName === 'none'`.
  5. **`inputs are at least 16px`** (Review Focus 5): on `/login` and `/admin/attendance`, every visible `input, select, textarea` has computed `parseFloat(fontSize) >= 16`.
  6. **`text floor 8px`**: on `/admin/attendance` and `/studio`, every visible element with direct text content has computed `parseFloat(fontSize) >= 8`.
- [ ] **Step 2: Run it.** Run `npm run e2e -w web -- visual-neon.spec.ts --project=mobile`. Expected: all pass. If one fails, fix the **styling** (never the test's thresholds) and rerun.
- [ ] **Step 3: Check 60/30/10 by eye.** Open the screenshots in `web/test-results/neon/`. On each one, neon should be a small accent (about 10%) and there should be no more than two glowing elements. Fix any screen that breaks this, by demoting extra neon to violet.
- [ ] **Step 4: Check performance.**
  1. Make a comparison copy of the old version: `git worktree add ../umdsc-base feat/events`, then `npm install` and `npm run build -w web` inside `../umdsc-base`, then `npx vite preview --port 4174` from `../umdsc-base/web`.
  2. On this branch: `npm run build -w web`, then `npx vite preview --port 4173` from `web/`.
  3. In Chrome DevTools, with Network throttling set to "Fast 4G", record a Performance trace of `/login` on each port and read "First Contentful Paint".
  4. Expected: port 4173 is no more than 300ms slower than port 4174. Record both numbers under `## Results`, then remove the copy: `git worktree remove ../umdsc-base`.
- [ ] **Step 5: Run the full suite.** Run `npm run test:scripts -w web`, `npm test -w web`, `npm run build -w web` and `npm run e2e -w web`. Expected: no new failures compared with the Baseline. Record the counts under `## Results`.
- [ ] **Step 6: Get a review.** Use `requesting-code-review` on the branch diff `feat/events...feat/neon-pixel-ui`, focusing on the Global Constraints and Review Focus. Fix what it confirms.
- [ ] **Step 7: 🧑 OWNER ACTION — final review.** Show the owner the screenshots in `web/test-results/neon/` and ask them to try `npm run dev -w web` on their phone (same Wi-Fi: open `http://<PC-IP>:5173` after starting Vite with `--host`). Wait for approval. Optionally, the owner can run `/code-review ultra` in Claude Code for an independent multi-agent review.
- [ ] **Step 8: Commit.** `git add web/e2e/visual-neon.spec.ts docs/superpowers/plans && git commit -m "test(ui): neon visual and review-focus e2e; record results"`. Do **not** merge; the owner decides when to merge `feat/neon-pixel-ui` into `feat/events`.

---

## Baseline

- `npm test -w web`: 38 test files passed (38), 196 tests passed (196), 0 failures.
- `npm run build -w web`: Exited with code 2 due to TS6133 unused declarations in `ClassesPage.tsx` and `TodayPage.tsx` (`getInstructor`).
- `npm run e2e -w web`: 128 passed, 7 skipped, 13 failed (existing baseline failures in admin-events, admin-today, login redirect, studio-sync, admin-classes).

## Results

(Filled in by Task 12 Steps 4–5.)
