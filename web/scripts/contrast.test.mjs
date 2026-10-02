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
