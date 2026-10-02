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
