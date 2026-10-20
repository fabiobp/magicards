export const ease = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  sine: (t) => 0.5 - Math.cos(Math.PI * t) / 2,
};

const running = new Set();
let rafId = 0;

function frame(now) {
  for (const tween of [...running]) tween.step(now);
  rafId = running.size ? requestAnimationFrame(frame) : 0;
}

class Tween {
  constructor(duration, onUpdate, easing, resolve) {
    this.duration = Math.max(1, duration);
    this.onUpdate = onUpdate;
    this.easing = easing;
    this.resolve = resolve;
    this.start = -1;
  }

  step(now) {
    if (this.start < 0) this.start = now;
    const p = Math.min(1, (now - this.start) / this.duration);
    this.onUpdate(this.easing(p), p);
    if (p >= 1) this.finish(false);
  }

  finish(jumpToEnd = true) {
    if (!running.delete(this)) return;
    if (jumpToEnd) this.onUpdate(this.easing(1), 1);
    this.resolve();
  }
}

function run(duration, onUpdate, easing) {
  let tween;
  const promise = new Promise((resolve) => { tween = new Tween(duration, onUpdate, easing, resolve); });
  running.add(tween);
  if (!rafId) rafId = requestAnimationFrame(frame);
  return { tween, promise };
}

/** Free-standing tween (not skippable). onUpdate receives the eased value 0..1. */
export function tween(duration, onUpdate, easing = ease.inOut) {
  return run(duration, onUpdate, easing).promise;
}

/**
 * A skippable chain of tweens and waits. After skip(), everything pending and
 * every later call resolves immediately at its end state, so an async script
 * written against a Sequence always runs to its final frame.
 */
export class Sequence {
  constructor() {
    this.skipped = false;
    this.tweens = new Set();
    this.waits = new Set();
  }

  tween(duration, onUpdate, easing = ease.inOut) {
    if (this.skipped) {
      onUpdate(easing(1), 1);
      return Promise.resolve();
    }
    const { tween: t, promise } = run(duration, onUpdate, easing);
    this.tweens.add(t);
    return promise.then(() => { this.tweens.delete(t); });
  }

  wait(ms) {
    if (this.skipped) return Promise.resolve();
    return new Promise((resolve) => {
      const entry = { resolve, id: setTimeout(() => { this.waits.delete(entry); resolve(); }, ms) };
      this.waits.add(entry);
    });
  }

  skip() {
    if (this.skipped) return;
    this.skipped = true;
    for (const t of [...this.tweens]) t.finish();
    for (const w of [...this.waits]) { clearTimeout(w.id); w.resolve(); }
    this.waits.clear();
  }
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/*
 * Timed key splines (non-uniform Catmull-Rom, Hermite form): the curve passes every key at its
 * time and the velocity is continuous across keys, so motion never stops between them.
 * startBoost / endBoost scale the velocity at the first / last key.
 */
function keyHermite(get, times, t, startBoost, endBoost) {
  const last = times.length - 1;
  let i = 0;
  while (i < last - 1 && t > times[i + 1]) i++;
  const tangent = (j) => {
    if (j === 0) return ((get(1) - get(0)) / (times[1] - times[0])) * startBoost;
    if (j === last) return ((get(last) - get(last - 1)) / (times[last] - times[last - 1])) * endBoost;
    return (get(j + 1) - get(j - 1)) / (times[j + 1] - times[j - 1]);
  };
  const d = times[i + 1] - times[i];
  const s = clamp((t - times[i]) / d, 0, 1);
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * get(i) + (s3 - 2 * s2 + s) * d * tangent(i)
    + (-2 * s3 + 3 * s2) * get(i + 1) + (s3 - s2) * d * tangent(i + 1);
}

export const keyValue = (values, times, t, startBoost = 1, endBoost = 1) =>
  keyHermite((j) => values[j], times, t, startBoost, endBoost);

export function keyPoint(points, times, t, out, startBoost = 1, endBoost = 1) {
  return out.set(
    keyHermite((j) => points[j].x, times, t, startBoost, endBoost),
    keyHermite((j) => points[j].y, times, t, startBoost, endBoost),
    keyHermite((j) => points[j].z, times, t, startBoost, endBoost),
  );
}
