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
