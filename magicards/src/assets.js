import { SRGBColorSpace, Texture, CanvasTexture, LinearFilter } from 'three';

const IMG_ROOT = new URL('../img/', import.meta.url);

export const imgUrl = (name) => new URL(`${name}.webp`, IMG_ROOT).href;

const pending = new Map();
const ready = new Map();

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

/** Loads an image from assets/img as an sRGB texture (cached by name). */
export function load(name) {
  if (!pending.has(name)) {
    pending.set(name, loadImage(imgUrl(name)).then((img) => {
      const t = new Texture(img);
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 4;
      t.needsUpdate = true;
      t.userData.name = name;
      ready.set(name, t);
      return t;
    }));
  }
  return pending.get(name);
}

/** Loads a batch, reporting fractional progress. Missing files are reported, not fatal. */
export async function loadAll(names, onProgress) {
  let done = 0;
  await Promise.all(names.map((n) => load(n)
    .catch((e) => console.warn(e.message))
    .finally(() => onProgress?.(++done / names.length))));
}

/** Synchronous access to a texture that loadAll() already resolved. */
export function tex(name) {
  const t = ready.get(name);
  if (!t) throw new Error(`Texture not loaded: ${name}`);
  return t;
}

export const has = (name) => ready.has(name);

/** Builds a texture from a 2D canvas drawing (used for glows, beams and runes). */
export function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearFilter;
  return t;
}

const samplers = new WeakMap();
const SAMPLE = 64;

/** Low-resolution alpha lookup so clicks on transparent sprite pixels fall through. */
export function alphaAt(texture, u, v) {
  let data = samplers.get(texture);
  if (!data) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SAMPLE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(texture.image, 0, 0, SAMPLE, SAMPLE);
    data = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
    samplers.set(texture, data);
  }
  const x = Math.min(SAMPLE - 1, Math.max(0, Math.floor(u * SAMPLE)));
  const y = Math.min(SAMPLE - 1, Math.max(0, Math.floor((1 - v) * SAMPLE)));
  return data[(y * SAMPLE + x) * 4 + 3] / 255;
}
