import { Group, Mesh, PlaneGeometry, MeshBasicMaterial, AdditiveBlending, Vector3 } from 'three';
import { sprite } from './sprites.js';
import { tex } from './assets.js';
import { glowQuad, silhouetteGlow, Motes } from './fx.js';
import { ease } from './tween.js';
import doorMeta from './generated/door.json';

const OPEN_ANGLE = 1.95;

/**
 * Wooden door built from the game's door art: the stone frame stays on the
 * wall and the leaf, cut out by the asset pipeline, swings on its hinge.
 */
export class Door {
  constructor(size) {
    const { leaf } = doorMeta;
    this.group = new Group();
    this.size = size;
    this.leafW = leaf.w * size;
    this.leafH = leaf.h * size;
    this.leftX = (leaf.x - 0.5) * size;
    const leafBottom = leaf.y + leaf.h;

    this.frame = sprite('env/door-frame', { height: size, anchor: 'center', glow: 0.35 });
    this.frame.position.set(0, size / 2 - (1 - leafBottom) * size, 0.04);
    this.group.add(this.frame);

    this.pivot = new Group();
    this.pivot.position.set(this.leftX, 0, 0.03);
    this.group.add(this.pivot);

    this.leaf = sprite('env/door-leaf', { width: this.leafW, height: this.leafH, glow: 0.42, doubleSide: true });
    this.leaf.position.x = this.leafW / 2;
    this.pivot.add(this.leaf);

    const rimTexture = silhouetteGlow(tex('env/door-leaf'));
    const pad = rimTexture.userData.padRatio;
    this.rim = new Mesh(new PlaneGeometry(this.leafW * pad.x, this.leafH * pad.y), new MeshBasicMaterial({
      map: rimTexture, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.8,
    }));
    this.rim.position.set(this.leafW / 2, this.leafH / 2, 0.02);
    this.rim.renderOrder = 4;
    this.pivot.add(this.rim);

    this.spill = glowQuad(this.leafW * 2.6, 0xffc070, 0);
    this.spill.position.set(this.leftX + this.leafW / 2, this.leafH * 0.55, -0.4);
    this.group.add(this.spill);

    this.hole = { x0: this.leftX, x1: this.leftX + this.leafW, y0: 0, y1: this.leafH };
    this.pickables = [this.leaf, this.frame];
    this.calling = 0;
    this.opened = 0;
  }

  /** Raised puts the label above props that flank the door's lower half (portrait). */
  anchor(target = new Vector3(), raised = false) {
    return this.leaf.localToWorld(target.set(0, this.leafH * (raised ? 0.7 : 0.42), 0));
  }

  update(dt, t) {
    const pulse = 0.55 + 0.25 * Math.sin(t * 3.1) + this.calling * 0.25 * Math.sin(t * 6.2);
    this.rim.material.opacity = pulse * (1 - this.opened);
  }

  async open(seq) {
    await seq.tween(160, (k) => { this.pivot.rotation.y = Math.sin(k * Math.PI) * 0.06; }, ease.linear);
    await seq.tween(900, (k) => {
      this.opened = k;
      this.pivot.rotation.y = k * OPEN_ANGLE;
      this.spill.material.opacity = k * 0.9;
    }, ease.out);
  }

  reset() {
    this.opened = 0;
    this.pivot.rotation.y = 0;
    this.spill.material.opacity = 0;
  }
}

// Clockwise, calmer than the game's Home Portal VFX (120°/s).
const SWIRL_SPEED = (75 * Math.PI) / 180;
// The layer renders are circular: the swirl fills this share of the square frame and the
// game stretches the portal to 4:5.
const FRAME_FILL = 0.87;
const STRETCH_Y = 1.25;
const LIFT = 0.25;
// Gap between the top of the swirl and the centre of its "Enter the portal" button.
const LABEL_GAP = 0.4;

/** The last room's exit: the white Home map portal (smoke ring, swirl, centre glow); "opening" flares it. */
export class Portal {
  constructor(height) {
    this.group = new Group();
    const frame = height / (FRAME_FILL * STRETCH_Y);
    this.center = new Vector3(0, LIFT + height / 2, 0.2);

    this.halo = glowQuad(frame * 1.3, 0xc8d8ff, 0.3);
    this.halo.position.set(this.center.x, this.center.y, 0);
    this.group.add(this.halo);

    this.vortex = new Group();
    this.vortex.position.copy(this.center);
    this.vortex.scale.set(1, STRETCH_Y, 1);
    this.group.add(this.vortex);
    const layer = (name, opacity, z) => {
      const s = sprite(name, { width: frame, height: frame, anchor: 'center', unlit: true, opacity });
      s.position.z = z;
      s.renderOrder = 6;
      this.vortex.add(s);
      return s;
    };
    this.smoke = layer('env/home-portal-smoke', 0.75, 0);
    this.swirl = layer('env/home-portal-swirl', 1, 0.01);
    this.glow = layer('env/home-portal-glow', 0.9, 0.02);

    const halfW = (frame * FRAME_FILL) / 2;
    this.sparks = new Motes({
      count: 40,
      box: { min: new Vector3(-halfW, LIFT, 0.3), max: new Vector3(halfW, LIFT + height, 0.8) },
      color: 0xdde8ff, size: 0.07, rise: 0.4, sway: 0.25, twinkle: true,
    });
    this.group.add(this.sparks.points);
    this.hole = null;
    this.pickables = [this.swirl, this.glow];
    this.calling = 0;
    this.opened = 0;
    this.spin = 0;
    this.leafH = height;
  }

  /** Above the swirl, so the button never covers the portal. */
  anchor(target = new Vector3()) {
    return this.group.localToWorld(target.copy(this.center).setY(LIFT + this.leafH + LABEL_GAP));
  }

  update(dt, t) {
    this.spin += dt * SWIRL_SPEED * (1 + this.opened * 3);
    this.swirl.rotation.z = -this.spin;
    this.smoke.rotation.z = t * 0.12;
    this.smoke.material.opacity = 0.65 + 0.1 * Math.sin(t * 1.7);
    this.glow.material.opacity = 0.85 + 0.1 * Math.sin(t * 3.3) * (1 - this.opened) + this.opened * 0.15;
    this.glow.scale.setScalar(1 + 0.04 * Math.sin(t * 2.2) + this.opened * 0.9);
    const grow = 1 + this.opened * 0.45;
    this.vortex.scale.set(grow, STRETCH_Y * grow, 1);
    this.halo.material.opacity = 0.28 + 0.08 * Math.sin(t * 2.6) + this.calling * 0.1 + this.opened * 0.5;
    this.sparks.update(dt, t);
  }

  async open(seq) {
    await seq.tween(700, (k) => { this.opened = k; }, ease.in);
  }

  reset() { this.opened = 0; }
}
