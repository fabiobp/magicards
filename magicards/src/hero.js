import { tween, ease, clamp, smooth } from './tween.js';
import { reducedMotion } from './ui.js';

// Where the dungeon sits in the splash art, as fractions of the image (measured on splash.webp).
const DOOR = { x: 0.535, y: 0.47 }; // middle of the arch opening: the point the art is centred on
const DOOR_BASE_Y = 0.665; // where the arch pillars meet the ground: the Enter button hangs below it
const DEPTH = { x: 0.556, y: 0.57 }; // bright end of the tunnel: where the camera flies
// The art is drawn a little larger than the screen so the dungeon can be centred.
const OVERSCAN = 1.06;
const DIVE_MS = 1600;
const DIVE_ZOOM = 10;

// Tunnel sparks: points around the camera axis that stream past as it flies in.
const SPARKS = 150;
const SPARK_FAR = 7;
const SPARK_NEAR = 0.18;
const SPARK_COLORS = ['255,96,220', '255,210,122', '255,240,250'];

/**
 * The landing art and its "walk into the dungeon" camera move. Lays the splash art out so the
 * arch is centred, publishes the arch position as CSS variables (--door-x / --door-base), and on
 * dive() zooms into the tunnel while sparks stream past and the far light swallows the screen.
 */
export class HeroArt {
  constructor(hero) {
    this.hero = hero;
    this.img = hero.querySelector('.hero__art img');
    this.canvas = hero.querySelector('.hero__dive');
    this.glow = hero.querySelector('.hero__glow');
    this.ctx = this.canvas.getContext('2d');
    this.box = { left: 0, top: 0, w: 0, h: 0 };
    this.depth = { x: 0, y: 0 };
    this.sparks = Array.from({ length: SPARKS }, (_, i) => ({
      a: Math.random() * Math.PI * 2,
      r: 0.35 + Math.random() * 1.4,
      z: SPARK_NEAR + Math.random() * (SPARK_FAR - SPARK_NEAR),
      c: SPARK_COLORS[i % SPARK_COLORS.length],
    }));
    addEventListener('resize', () => this.layout());
    this.img.addEventListener('load', () => this.layout());
    this.layout();
  }

  layout() {
    const W = this.hero.clientWidth;
    const H = this.hero.clientHeight;
    const img = this.img;
    const ratio = (img.naturalWidth || img.width) / (img.naturalHeight || img.height);
    const h = Math.max(W / ratio, H) * OVERSCAN;
    const w = h * ratio;
    const left = clamp(W / 2 - DOOR.x * w, W - w, 0);
    const top = clamp(H / 2 - DOOR.y * h, H - h, 0);
    Object.assign(img.style, { width: `${w}px`, height: `${h}px`, left: `${left}px`, top: `${top}px` });
    this.box = { left, top, w, h };
    this.depth = { x: left + DEPTH.x * w, y: top + DEPTH.y * h };
    this.hero.style.setProperty('--door-x', `${(left + DOOR.x * w).toFixed(1)}px`);
    this.hero.style.setProperty('--door-base', `${(top + DOOR_BASE_Y * h).toFixed(1)}px`);
    this.hero.style.setProperty('--depth-x', `${this.depth.x.toFixed(1)}px`);
    this.hero.style.setProperty('--depth-y', `${this.depth.y.toFixed(1)}px`);
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Flies the camera into the tunnel; resolves when its light fills the screen. */
  dive() {
    if (reducedMotion.matches) return Promise.resolve();
    const { img, box, depth } = this;
    img.style.transformOrigin = `${depth.x - box.left}px ${depth.y - box.top}px`;
    let last = performance.now();
    return tween(DIVE_MS, (k) => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      img.style.transform = `scale(${Math.pow(DIVE_ZOOM, k * k).toFixed(4)})`;
      this.glow.style.opacity = smooth(0.25, 0.95, k).toFixed(3);
      this.glow.style.transform = `translate(-50%, -50%) scale(${(0.4 + 14 * smooth(0.45, 1, k)).toFixed(3)})`;
      this.drawSparks(dt, k);
    }, ease.linear);
  }

  drawSparks(dt, k) {
    const { ctx, depth } = this;
    const W = this.hero.clientWidth;
    const H = this.hero.clientHeight;
    const focal = Math.min(W, H) * 0.32;
    const speed = 0.6 + 11 * k * k;
    const fadeIn = smooth(0, 0.25, k);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const s of this.sparks) {
      s.z -= speed * dt;
      const from = s.z + speed * 0.06;
      if (s.z < SPARK_NEAR) {
        s.z += SPARK_FAR - SPARK_NEAR;
        continue;
      }
      const dx = Math.cos(s.a) * s.r * focal;
      const dy = Math.sin(s.a) * s.r * focal * 0.8;
      const near = 1 - s.z / SPARK_FAR;
      ctx.strokeStyle = `rgba(${s.c},${(fadeIn * near).toFixed(3)})`;
      ctx.lineWidth = Math.min(5, 0.6 + 1.2 / s.z);
      ctx.beginPath();
      ctx.moveTo(depth.x + dx / from, depth.y + dy / from);
      ctx.lineTo(depth.x + dx / s.z, depth.y + dy / s.z);
      ctx.stroke();
    }
  }
}
