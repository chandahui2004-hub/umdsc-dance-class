import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// When running via `npm run test:scripts -w web`, cwd is `web/`
const MASCOT_DIR = path.resolve('public/mascot');
const EXPECTED_FILES = [
  'mascot-idle.png',
  'mascot-dance-1.png',
  'mascot-dance-2.png',
  'mascot-dance-3.png'
];

test('mascot sprite sheets exist, have correct dimensions and transparent background', async () => {
  for (const file of EXPECTED_FILES) {
    const fullPath = path.join(MASCOT_DIR, file);
    assert.ok(fs.existsSync(fullPath), `Expected sprite file ${file} to exist in ${MASCOT_DIR}`);

    const img = sharp(fullPath);
    const meta = await img.metadata();
    assert.equal(meta.width, 1024, `${file} width should be 1024`);
    assert.equal(meta.height, 682, `${file} height should be 682`);
    assert.equal(meta.channels, 4, `${file} should have 4 channels (RGBA)`);

    const { data } = await img.raw().toBuffer({ resolveWithObject: true });
    // (0,0) is top-left corner background: must be transparent alpha = 0
    const alphaOrigin = data[3];
    assert.equal(alphaOrigin, 0, `${file} origin pixel (0,0) alpha must be 0 (transparent)`);

    // Frame 0 center is approximately x=128, y=170: character body, must be opaque
    const idx = (170 * 1024 + 128) * 4;
    const alphaBody = data[idx + 3];
    assert.ok(alphaBody > 200, `${file} character center pixel alpha should be > 200 (opaque)`);
  }
});
