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
