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
