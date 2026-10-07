/**
 * Cuts the person out of an instructor photo on this device with Google's MediaPipe image
 * segmenter (Apache-2.0). The engine (13 MB) and the hair-aware portrait model (16 MB) download
 * from a CDN the first time and are then cached by the browser; the photo itself never leaves the
 * device. Returns a PNG with a transparent background.
 */
const TASKS_VISION_VERSION = '1.1.0';
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';

/** Longest side processed; bigger photos are scaled down first (the saved photo is 360 × 450). */
const MAX_SIDE = 1600;

// Mask confidence below EDGE_LOW is background, above EDGE_HIGH is person; in between fades.
const EDGE_LOW = 0.3;
const EDGE_HIGH = 0.7;

/** Person confidence per pixel: a one-mask model gives it directly; a multi-class model's mask 0 is background. */
export function personConfidence(masks: Float32Array[]): Float32Array {
  if (masks.length === 1) return masks[0];
  return masks[0].map(v => 1 - v);
}

/** Sets each pixel's alpha from the person mask (stretched to the photo size); colours stay as they are. */
export function applyPersonMask(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Float32Array,
  maskWidth: number,
  maskHeight: number
): void {
  for (let y = 0; y < height; y++) {
    const my = Math.min(maskHeight - 1, Math.floor((y * maskHeight) / height));
    for (let x = 0; x < width; x++) {
      const mx = Math.min(maskWidth - 1, Math.floor((x * maskWidth) / width));
      const confidence = mask[my * maskWidth + mx];
      const alpha = Math.min(1, Math.max(0, (confidence - EDGE_LOW) / (EDGE_HIGH - EDGE_LOW)));
      pixels[(y * width + x) * 4 + 3] = Math.round(alpha * 255);
    }
  }
}

let segmenterPromise: Promise<import('@mediapipe/tasks-vision').ImageSegmenter> | null = null;

function loadSegmenter() {
  segmenterPromise ||= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    return ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL },
      runningMode: 'IMAGE',
      outputCategoryMask: false,
      outputConfidenceMasks: true
    });
  })().catch(err => {
    segmenterPromise = null; // let a later try download again
    throw err;
  });
  return segmenterPromise;
}

export async function cutOutPerson(photo: Blob): Promise<Blob> {
  const segmenter = await loadSegmenter();
  const bitmap = await createImageBitmap(photo);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot edit images');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const result = segmenter.segment(canvas);
  try {
    const masks = result.confidenceMasks || [];
    if (masks.length === 0) throw new Error('No person found in the photo');
    const image = ctx.getImageData(0, 0, width, height);
    applyPersonMask(
      image.data,
      width,
      height,
      personConfidence(masks.map(m => m.getAsFloat32Array())),
      masks[0].width,
      masks[0].height
    );
    ctx.putImageData(image, 0, 0);
  } finally {
    result.close();
  }

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not save the cut-out'))), 'image/png')
  );
}
