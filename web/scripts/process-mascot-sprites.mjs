import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ASSETS_RAW = path.resolve('src/assets/mascot-raw');
const OUTPUT_DIR = path.resolve('public/mascot');

const MAPPINGS = [
  { in: 'idle.jpg', out: 'mascot-idle.png' },
  { in: 'dance-1.jpg', out: 'mascot-dance-1.png' },
  { in: 'dance-2.jpg', out: 'mascot-dance-2.png' },
  { in: 'dance-3.jpg', out: 'mascot-dance-3.png' },
];

/**
 * Flood-fills from the image perimeter to turn outer black background pixels transparent.
 * Any dark pixel (max(r, g, b) <= threshold) connected to the perimeter is set to alpha = 0.
 * Characters' internal dark pixels (pupils, beanie stitch, jacket seams) are preserved.
 */
export async function processSpriteSheet(inputPath, outputPath, threshold = 20) {
  const { data, info } = await sharp(inputPath)
    .resize(1024, 682, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const totalPixels = width * height;

  const visited = new Uint8Array(totalPixels);
  // Queue for BFS flood fill
  const queue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;

  const isDark = (idx) => {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    return Math.max(r, g, b) <= threshold;
  };

  const enqueue = (x, y) => {
    const p = y * width + x;
    if (visited[p]) return;
    const idx = p * 4;
    if (isDark(idx)) {
      visited[p] = 1;
      queue[tail++] = p;
    }
  };

  // Seed borders
  for (let x = 0; x < width; x++) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  // BFS
  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    const y = Math.floor(p / width);

    // Set pixel to transparent
    const idx = p * 4;
    data[idx + 3] = 0;

    // Check 4-connected neighbors
    if (x > 0) enqueue(x - 1, y);
    if (x < width - 1) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y < height - 1) enqueue(x, y + 1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const baseOut = outputPath.replace(/\.png$/, '');

  // High quality PNG
  await sharp(data, {
    raw: { width, height, channels: 4 }
  })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);

  // High quality WebP (much smaller payload for web browsers)
  await sharp(data, {
    raw: { width, height, channels: 4 }
  })
    .webp({ quality: 90 })
    .toFile(`${baseOut}.webp`);

  return { width, height, transparentCount: tail };
}

export async function processAllMascotSprites() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const m of MAPPINGS) {
    const inPath = path.join(ASSETS_RAW, m.in);
    const outPath = path.join(OUTPUT_DIR, m.out);
    if (!fs.existsSync(inPath)) {
      throw new Error(`Raw asset not found: ${inPath}`);
    }
    const res = await processSpriteSheet(inPath, outPath);
    console.log(`Processed ${m.out} (${res.transparentCount} outer pixels cleared)`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('process-mascot-sprites.mjs')) {
  processAllMascotSprites().catch(err => {
    console.error('Error processing sprites:', err);
    process.exit(1);
  });
}
