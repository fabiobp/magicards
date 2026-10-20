import {
  BufferGeometry, BufferAttribute, Float32BufferAttribute, Points, PointsMaterial, AdditiveBlending, Group, Mesh,
  PlaneGeometry, MeshBasicMaterial, Color, DoubleSide,
} from 'three';
import { canvasTexture } from './assets.js';
import { clamp, smooth } from './tween.js';

let dotTexture;
let beamTexture;
let flareTexture;

export function dot() {
  dotTexture ??= canvasTexture(64, 64, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
  return dotTexture;
}

export function flare() {
  flareTexture ??= canvasTexture(256, 256, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.15, 'rgba(255,255,255,0.65)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.15)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
  return flareTexture;
}

function beam() {
  beamTexture ??= canvasTexture(64, 256, (ctx, w, h) => {
    const v = ctx.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(255,255,255,0)');
    v.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    v.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    const hz = ctx.createLinearGradient(0, 0, w, 0);
    hz.addColorStop(0, 'rgba(0,0,0,0)');
    hz.addColorStop(0.5, 'rgba(0,0,0,1)');
    hz.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, 0, w, h);
  });
  return beamTexture;
}

/** Additive camera-facing-ish glow quad. */
export function glowQuad(size, color, opacity = 1) {
  const m = new Mesh(new PlaneGeometry(size, size), new MeshBasicMaterial({
    map: flare(), color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false,
  }));
  m.renderOrder = 5;
  return m;
}

/** A vertical loot beam: two crossed additive planes. */
export function lootBeam(color, height = 3, width = 0.7) {
  const group = new Group();
  const material = new MeshBasicMaterial({
    map: beam(), color: new Color(color), transparent: true, opacity: 0, blending: AdditiveBlending,
    depthWrite: false, side: DoubleSide,
  });
  for (let i = 0; i < 2; i++) {
    const plane = new Mesh(new PlaneGeometry(width, height), material);
    plane.position.y = height / 2;
    plane.rotation.y = i * Math.PI / 2 + Math.PI / 4;
    plane.renderOrder = 6;
    group.add(plane);
  }
  group.userData.material = material;
  return group;
}

/**
 * Pooled additive particles with velocity, gravity and colour fade.
 * Used for sparks, bursts and magic trails.
 */
export class Burst {
  constructor(capacity = 200, size = 0.12) {
    this.capacity = capacity;
    this.items = [];
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new BufferAttribute(this.colors, 3));
    this.points = new Points(geometry, new PointsMaterial({
      size, map: dot(), vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
  }

  /** origin: Vector3-like, opts: { count, color, speed, spread, up, gravity, life } */
  emit(origin, { count = 24, color = 0xffd27a, speed = 2.5, spread = 1, up = 1.5, gravity = -4, life = 0.9 } = {}) {
    const c = new Color(color);
    for (let i = 0; i < count; i++) {
      if (this.items.length >= this.capacity) this.items.shift();
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.items.push({
        x: origin.x, y: origin.y, z: origin.z,
        vx: Math.cos(a) * s * spread, vy: up + Math.random() * s, vz: Math.sin(a) * s * spread * 0.5,
        g: gravity, life: life * (0.6 + Math.random() * 0.4), age: 0, r: c.r, gr: c.g, b: c.b,
      });
    }
  }

  update(dt) {
    const { positions, colors } = this;
    let n = 0;
    this.items = this.items.filter((p) => (p.age += dt) < p.life);
    for (const p of this.items) {
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = 1 - p.age / p.life;
      positions[n * 3] = p.x; positions[n * 3 + 1] = p.y; positions[n * 3 + 2] = p.z;
      colors[n * 3] = p.r * k; colors[n * 3 + 1] = p.gr * k; colors[n * 3 + 2] = p.b * k;
      n++;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
}

/** Ambient floating motes (embers, dust, fireflies) that loop inside a box. */
export class Motes {
  constructor({ count = 80, box, color = 0xffb060, size = 0.08, rise = 0.25, sway = 0.3, twinkle = false }) {
    this.box = box;
    this.rise = rise;
    this.sway = sway;
    this.twinkle = twinkle;
    this.base = new Color(color);
    this.seeds = Array.from({ length: count }, (_, i) => ({
      x: box.min.x + Math.random() * (box.max.x - box.min.x),
      y: box.min.y + Math.random() * (box.max.y - box.min.y),
      z: box.min.z + Math.random() * (box.max.z - box.min.z),
      p: Math.random() * Math.PI * 2,
      s: 0.5 + Math.random(),
      i,
    }));
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    this.points = new Points(geometry, new PointsMaterial({
      size, map: dot(), vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 7;
  }

  update(dt, t) {
    const { box, positions, colors, base } = this;
    const h = box.max.y - box.min.y;
    this.seeds.forEach((m, n) => {
      m.y += this.rise * m.s * dt;
      if (m.y > box.max.y) m.y -= h;
      const k = Math.sin((m.y - box.min.y) / h * Math.PI);
      const tw = this.twinkle ? 0.5 + 0.5 * Math.sin(t * 2.4 * m.s + m.p) : 1;
      positions[n * 3] = m.x + Math.sin(t * 0.6 * m.s + m.p) * this.sway;
      positions[n * 3 + 1] = m.y;
      positions[n * 3 + 2] = m.z + Math.cos(t * 0.5 * m.s + m.p) * this.sway * 0.5;
      colors[n * 3] = base.r * k * tw; colors[n * 3 + 1] = base.g * k * tw; colors[n * 3 + 2] = base.b * k * tw;
    });
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
}

// Share of the progress over which the break sweeps across the sprite; the rest is each piece's flight.
const SHATTER_SWEEP = 0.5;
// Cells whose art covers less than this alpha (0..255) are empty and get no piece.
const SHATTER_MIN_ALPHA = 24;

/**
 * Breaks a sprite into a grid of pieces that share its material, so they match it exactly
 * until they come apart. progress(k) sweeps the break from the top-right (k = 0, whole) to the
 * bottom-left (k = 1, gone); each piece drifts up and away as ash, spinning and shrinking.
 */
export class Shatter {
  constructor(source, { rows = 18 } = {}) {
    source.geometry.computeBoundingBox();
    const { min, max } = source.geometry.boundingBox;
    const w = max.x - min.x;
    const h = max.y - min.y;
    const cols = Math.max(1, Math.round((rows * w) / h));
    const coverage = cellAlpha(source.userData.texture.image, cols, rows);

    this.pieces = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (coverage[(rows - 1 - r) * cols + c] < SHATTER_MIN_ALPHA) continue;
        const nx = (c + 0.5) / cols;
        const ny = (r + 0.5) / rows;
        this.pieces.push({
          c, r, x: min.x + nx * w, y: min.y + ny * h, cx: 0, cy: 0,
          order: (1 - ny) * 0.6 + (1 - nx) * 0.4 + Math.random() * 0.12,
          vx: (nx - 0.5) * w * 0.5 - 0.2 - Math.random() * 0.5,
          vy: 0.3 + Math.random() * 0.8,
          vz: (Math.random() - 0.3) * 0.8,
          lift: 0.5 + Math.random() * 0.6,
          spin: (Math.random() - 0.5) * 9,
        });
      }
    }
    const lo = Math.min(...this.pieces.map((p) => p.order));
    const hi = Math.max(...this.pieces.map((p) => p.order));
    for (const p of this.pieces) p.order = (p.order - lo) / (hi - lo || 1);

    const n = this.pieces.length;
    this.half = { x: w / cols / 2, y: h / rows / 2 };
    this.positions = new Float32Array(n * 12);
    const uv = new Float32Array(n * 8);
    const normal = new Float32Array(n * 12);
    const index = [];
    this.pieces.forEach((p, i) => {
      const u0 = p.c / cols;
      const u1 = (p.c + 1) / cols;
      const v0 = p.r / rows;
      const v1 = (p.r + 1) / rows;
      uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
      for (let k = 0; k < 4; k++) normal[i * 12 + k * 3 + 2] = 1;
      const q = i * 4;
      index.push(q, q + 1, q + 2, q, q + 2, q + 3);
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    geometry.setAttribute('normal', new Float32BufferAttribute(normal, 3));
    geometry.setIndex(index);
    this.mesh = new Mesh(geometry, source.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = source.renderOrder;
    this.mesh.visible = false;
    source.parent.add(this.mesh);
    this.source = source;
    this.progress(0);
  }

  progress(k) {
    const { positions, half } = this;
    this.mesh.position.copy(this.source.position);
    this.mesh.rotation.copy(this.source.rotation);
    this.mesh.scale.copy(this.source.scale);
    this.pieces.forEach((p, i) => {
      const t = clamp((k - p.order * SHATTER_SWEEP) / (1 - SHATTER_SWEEP), 0, 1);
      const size = 1 - smooth(0.1, 1, t);
      const a = p.spin * t * t;
      const cos = Math.cos(a) * size;
      const sin = Math.sin(a) * size;
      p.cx = p.x + p.vx * t;
      p.cy = p.y + p.vy * t + p.lift * t * t;
      const z = p.vz * t;
      const o = i * 12;
      const corner = (j, sx, sy) => {
        const lx = sx * half.x;
        const ly = sy * half.y;
        positions[o + j * 3] = p.cx + lx * cos - ly * sin;
        positions[o + j * 3 + 1] = p.cy + lx * sin + ly * cos;
        positions[o + j * 3 + 2] = z;
      };
      corner(0, -1, -1);
      corner(1, 1, -1);
      corner(2, 1, 1);
      corner(3, -1, 1);
    });
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }

  /** World position of a random piece on the break front at progress k (for embers). */
  front(k, out) {
    const at = k / SHATTER_SWEEP;
    let best = this.pieces[0];
    for (let i = 0; i < 6; i++) {
      const p = this.pieces[Math.floor(Math.random() * this.pieces.length)];
      if (Math.abs(p.order - at) < Math.abs(best.order - at)) best = p;
    }
    return this.mesh.localToWorld(out.set(best.cx, best.cy, 0));
  }
}

/** Average alpha (0..255) of each cell of an image split into cols × rows, top row first. */
function cellAlpha(image, cols, rows) {
  const canvas = document.createElement('canvas');
  canvas.width = cols * 4;
  canvas.height = rows * 4;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const out = new Float32Array(cols * rows);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      out[Math.floor(y / 4) * cols + Math.floor(x / 4)] += data[(y * canvas.width + x) * 4 + 3] / 16;
    }
  }
  return out;
}

/** Gold glow that follows a sprite's silhouette (used to outline the door leaf). */
export function silhouetteGlow(texture, color = '#ffd27a', blur = 22) {
  const img = texture.image;
  const scale = 256 / Math.max(img.width, img.height);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const pad = blur * 2;
  const t = canvasTexture(w + pad * 2, h + pad * 2, (ctx) => {
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tc = tmp.getContext('2d');
    tc.drawImage(img, 0, 0, w, h);
    tc.globalCompositeOperation = 'source-in';
    tc.fillStyle = color;
    tc.fillRect(0, 0, w, h);
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    for (let i = 0; i < 3; i++) ctx.drawImage(tmp, pad, pad);
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(img, pad, pad, w, h);
  });
  t.userData.padRatio = { x: (w + pad * 2) / w, y: (h + pad * 2) / h };
  return t;
}

/** Floor rune circle for the summoning altar. */
export function runeCircle(color = '#9fd8ff') {
  return canvasTexture(512, 512, (ctx, s) => {
    const c = s / 2;
    ctx.translate(c, c);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    const ring = (r, wd) => { ctx.lineWidth = wd; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); };
    ring(240, 6); ring(214, 3); ring(150, 4); ring(70, 3);
    for (let i = 0; i < 24; i++) {
      ctx.save();
      ctx.rotate(i / 24 * Math.PI * 2);
      ctx.fillRect(-2, -236, 4, i % 3 === 0 ? 26 : 14);
      ctx.restore();
    }
    ctx.lineWidth = 3;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      for (let i = 0; i <= 3; i++) {
        const a = (i / 3) * Math.PI * 2 + k * Math.PI / 3 - Math.PI / 2;
        const x = Math.cos(a) * 150; const y = Math.sin(a) * 150;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.font = 'bold 26px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊ';
    for (let i = 0; i < glyphs.length; i++) {
      ctx.save();
      ctx.rotate(i / glyphs.length * Math.PI * 2);
      ctx.fillText(glyphs[i], 0, -184);
      ctx.restore();
    }
  });
}
