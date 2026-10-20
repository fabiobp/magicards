import { Vector3, CatmullRomCurve3 } from 'three';
import { Room, CORRIDOR } from './room.js';
import { ROOMS } from './content.js';
import { loadAll } from './assets.js';
import { Burst } from './fx.js';
import { Sequence, tween, ease, smooth, clamp } from './tween.js';
import { reducedMotion } from './ui.js';
import doorMeta from './generated/door.json';

const tmpA = new Vector3();
const tmpB = new Vector3();
const AHEAD = new Vector3(0, -0.05, -2.5);
const FLICKER = new Set(['keyL', 'keyR']);
// Room title clearance (CSS px) below the prop it is placed under.
const TITLE_GAP = 14;

function shown(object) {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/** Opening a door leaves in the next room's front wall. */
function entryHole(size) {
  const { leaf } = doorMeta;
  const x0 = (leaf.x - 0.5) * size;
  return { x0, x1: x0 + leaf.w * size, y0: 0, y1: leaf.h * size + 0.1 };
}

/**
 * Drives the scripted walk through the dungeon: building rooms, framing the
 * camera, hotspots and panels, door transits and the exit portal finale.
 */
export class World {
  constructor(stage, ui) {
    this.stage = stage;
    this.ui = ui;
    this.rooms = [];
    let z = 0;
    let y = 0;
    ROOMS.forEach((def, i) => {
      if (i > 0) {
        z -= CORRIDOR + def.size.D;
        y += ROOMS[i - 1].rise ?? 0;
      }
      this.rooms.push(new Room(def, i, new Vector3(0, y, z)));
    });
    this.prepared = [];
    this.burst = new Burst(360, 0.11);
    stage.scene.add(this.burst.points);
    this.current = -1;
    this.busy = false;
    this.seq = null;
    this.hovered = null;
    this.focused = null;
    this.catching = null;
    this.visited = new Set();
    this.pet = false;
    this.coached = false;
    this.panelsClosed = 0;
    this.base = { pos: new Vector3(), look: new Vector3() };
    this.light = { targets: {}, level: 0 };

    this.ctx = {
      stage,
      burst: this.burst,
      floaters: ui.floaters,
      caption: ui.caption,
      shake: (a) => { if (!reducedMotion.matches) stage.shake(a); },
      run: (fn) => this.run(fn),
      openSpot: (id, prop, el) => this.openSpot(id, prop, el),
      clearView: () => this.clearView(),
      catchMode: (on, onSkip) => this.catchMode(on, onSkip),
      catchProgress: (n, total) => this.catchCaption(`${n} / ${total}`),
      petJoined: (prop) => { this.pet = true; this.markVisited(prop); },
      /** Screen area (CSS px from the top-left) not covered by the info panel. */
      viewArea: () => {
        const occ = ui.panel.isOpen ? ui.panel.occlusion() : { x: 0, y: 0 };
        return { w: stage.width - occ.x, h: stage.height - occ.y };
      },
    };

    stage.updaters.add((dt, t) => this.update(dt, t));
    stage.onResize.add(() => this.relayout());
    this.bindPointer(stage.renderer.domElement);
  }

  get room() { return this.rooms[this.current]; }

  /** Loads a room's art and builds it once; resolves when it can be entered. */
  prepare(i, onProgress) {
    if (!this.prepared[i]) {
      const room = this.rooms[i];
      this.prepared[i] = loadAll(room.def.assets, onProgress).then(() => {
        const prev = ROOMS[i - 1];
        room.build(room.def.rise ?? 0, prev && prev.door === 'door' ? entryHole(prev.doorSize) : null);
        for (const p of room.def.props(room)) {
          p.hover = 0;
          p.flash = 0;
          room.addProp(p);
        }
        room.group.visible = false;
        this.stage.scene.add(room.group);
        room.group.updateMatrixWorld(true);
        room.layout(this.stage, room.cameraPose(this.stage));
      });
    }
    return this.prepared[i];
  }

  /** First entrance from the hero portal: a short dolly into Room 1. */
  async start() {
    this.enter(0);
    const to = this.base.pos.clone();
    const from = to.clone().add(new Vector3(0, 0.6, 3.6));
    if (reducedMotion.matches) return;
    this.busy = true;
    await tween(1500, (k) => { this.stage.pose.pos.lerpVectors(from, to, k); }, ease.out);
    this.busy = false;
  }

  enter(i) {
    this.current = i;
    const room = this.room;
    this.rooms.forEach((r, j) => { if (r.built) r.group.visible = j === i || j === i + 1; });
    room.cameraPose(this.stage, this.base);
    room.layout(this.stage, this.base);
    this.stage.pose.pos.copy(this.base.pos);
    this.stage.pose.look.copy(this.base.look);
    this.stage.offset.x = 0;
    this.stage.offset.y = 0;
    this.lightsFor(room, false);
    this.panelsClosed = 0;
    this.buildHotspots();
    const section = document.getElementById(room.def.id);
    const title = section.querySelector('h2').textContent;
    this.ui.hud.setRoom(i, title);
    this.ui.caption.hide();
    this.ui.title.show(title, section.querySelector('.room__tagline').textContent, this.titleTop(room));
    this.updateFound();
    if (room.def.coach && !this.coached) this.ui.hotspots.coach(room.def.coach);
    this.ui.hotspots.flashLabels(3400);
  }

  /** Screen top for the room title when a prop (`def.titleBelow`) would sit under it; '' keeps the stylesheet position. */
  titleTop(room) {
    const prop = room.def.titleBelow && room.props.find((p) => p.id === room.def.titleBelow);
    if (!prop?.base) return '';
    room.group.updateMatrixWorld(true);
    this.stage.applyCamera(0);
    this.stage.camera.updateMatrixWorld();
    const { y } = this.stage.project(prop.base(tmpA));
    return `${Math.round(y + TITLE_GAP)}px`;
  }

  interactive(room = this.room) { return room.props.filter((p) => p.spot); }

  buildHotspots() {
    const room = this.room;
    const items = this.interactive().map((p) => ({
      id: p.id, kind: 'prop', label: p.label, anchor: (out) => p.anchor(out), onClick: (el) => this.activate(p, el),
    }));
    items.push({
      id: 'door', kind: 'door', label: room.def.doorLabel, anchor: (out) => room.door.anchor(out, this.stage.portrait), onClick: () => this.advance(),
    });
    const h = this.ui.hotspots;
    h.set(items);
    for (const p of this.interactive()) if (this.visited.has(p.id)) h.visited(p.id);
    h.calling(this.panelsClosed > 0);
    if (this.catching) h.setEnabled(false, this.catching.id);
  }

  foundText() {
    const props = this.interactive();
    const n = props.filter((p) => this.visited.has(p.id)).length;
    return `${n} of ${props.length} discovered`;
  }

  updateFound() {
    const text = this.foundText();
    this.ui.hud.setFound(text);
    return text;
  }

  run(fn) {
    const seq = new Sequence();
    this.seq = seq;
    return Promise.resolve(fn(seq)).finally(() => { if (this.seq === seq) this.seq = null; });
  }

  activate(prop, el = null) {
    if (this.busy || (this.catching && this.catching !== prop)) return;
    this.seq?.skip();
    if (!prop.deferVisit) this.markVisited(prop);
    this.ui.hotspots.clearCoach();
    this.coached = true;
    if (prop.click) { prop.click(this.ctx, el); return; }
    this.openSpot(prop.spot, prop, el);
    this.run((seq) => prop.play(seq, this.ctx));
  }

  markVisited(prop) {
    this.visited.add(prop.id);
    this.ui.hotspots.visited(prop.id);
    this.updateFound();
  }

  openSpot(spotId, prop, el) {
    this.ui.title.hide();
    this.ui.panel.open(document.getElementById(spotId), {
      found: this.updateFound(),
      returnFocus: el,
      onClose: () => this.panelClosed(),
    });
    this.focusOn(prop);
    this.focusChanged(prop);
  }

  panelClosed() {
    this.seq?.skip();
    this.focused = null;
    this.moveCamera(this.base.pos, this.base.look, 0, 0, 600);
    this.focusChanged(null);
    this.panelsClosed += 1;
    this.ui.hotspots.calling(true);
  }

  /** Closing the open panel (if any) returns the camera to the room's main view. */
  clearView() {
    this.ui.panel.close();
  }

  focusChanged(prop) {
    for (const p of this.room.props) p.focusChanged?.(prop);
  }

  /** Leans the camera toward an object and re-centres the view beside the panel. */
  focusOn(prop) {
    this.focused = prop;
    const occ = this.ui.panel.occlusion();
    if (prop.lean === false) {
      this.moveCamera(this.base.pos, this.base.look, occ.x / 2, occ.y / 2, 650);
      return;
    }
    const target = prop.anchor(new Vector3());
    target.y -= 0.5;
    const pos = this.base.pos.clone().lerp(target, 0.18);
    const look = this.base.look.clone().lerp(target, 0.6);
    this.moveCamera(pos, look, occ.x / 2, occ.y / 2, 650);
  }

  moveCamera(pos, look, ox, oy, ms) {
    const p = this.stage.pose;
    const from = { pos: p.pos.clone(), look: p.look.clone(), x: this.stage.offset.x, y: this.stage.offset.y };
    const to = { pos: pos.clone(), look: look.clone() };
    const token = {};
    this.camToken = token;
    tween(reducedMotion.matches ? 1 : ms, (k) => {
      if (this.camToken !== token) return;
      p.pos.lerpVectors(from.pos, to.pos, k);
      p.look.lerpVectors(from.look, to.look, k);
      this.stage.offset.x = from.x + (ox - from.x) * k;
      this.stage.offset.y = from.y + (oy - from.y) * k;
    }, ease.inOut);
  }

  relayout() {
    if (this.current < 0 || this.busy) return;
    const room = this.room;
    room.cameraPose(this.stage, this.base);
    room.layout(this.stage, this.base);
    this.camToken = null;
    if (this.focused && this.ui.panel.isOpen) {
      this.stage.pose.pos.copy(this.base.pos);
      this.stage.pose.look.copy(this.base.look);
      this.focusOn(this.focused);
    } else {
      this.stage.pose.pos.copy(this.base.pos);
      this.stage.pose.look.copy(this.base.look);
      this.stage.offset.x = 0;
      this.stage.offset.y = 0;
    }
  }

  lightsFor(room, fade) {
    room.group.updateMatrixWorld(true);
    for (const [key, [x, y, z, color, intensity]] of Object.entries(room.def.lights)) {
      const light = this.stage.lights[key];
      light.position.copy(room.group.localToWorld(tmpA.set(x, y, z)));
      light.color.setHex(color);
      this.light.targets[key] = intensity;
    }
    if (!fade || reducedMotion.matches) { this.light.level = 1; return; }
    this.light.level = 0;
    tween(800, (k) => { this.light.level = k; }, ease.out);
  }

  /* ---------- pointer ---------- */

  bindPointer(canvas) {
    let down = null;
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12;
      down = null;
      if (!moved) this.tap(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') this.hoverAt(e.clientX, e.clientY); });
    canvas.addEventListener('pointerleave', () => this.setHover(null));
  }

  pickables() {
    const list = [];
    for (const p of this.interactive()) for (const m of p.pickables) if (shown(m)) list.push(m);
    for (const m of this.room.door.pickables) { m.userData.door = true; list.push(m); }
    return list;
  }

  tap(x, y) {
    if (this.current < 0 || this.busy) return;
    if (this.seq && !this.seq.skipped) { this.seq.skip(); return; }
    const mesh = this.stage.pick(x, y, this.pickables());
    if (!mesh) { this.ui.panel.close(); return; }
    if (mesh.userData.door) { this.advance(); return; }
    const prop = mesh.userData.prop;
    const el = this.ui.hotspots.find(prop.id)?.el ?? null;
    this.activate(prop, el);
  }

  hoverAt(x, y) {
    if (this.current < 0 || this.busy) { this.setHover(null); return; }
    const mesh = this.stage.pick(x, y, this.pickables());
    this.setHover(mesh ? (mesh.userData.door ? 'door' : mesh.userData.prop) : null);
  }

  setHover(target) {
    if (this.catching && target && target !== this.catching) target = null;
    this.hovered = target;
    this.stage.renderer.domElement.style.cursor = target ? 'pointer' : '';
    this.ui.hotspots.hover(target === 'door' ? 'door' : target?.id ?? null);
  }

  /* ---------- pet catch ---------- */

  catchCaption(progress = '') {
    this.ui.caption.show(`Tap Ruffin to catch him!${progress ? ` ${progress}` : ''}`, {
      action: { label: 'Skip', onClick: () => this.catchSkip?.() },
    });
  }

  catchMode(on, onSkip) {
    if (on) {
      this.clearView();
      this.catching = this.room.props.find((p) => p.id === 'egg');
      this.catchSkip = onSkip;
      this.buildHotspots();
      this.ui.hotspots.coach('egg');
      this.catchCaption();
    } else {
      this.catching = null;
      this.catchSkip = null;
      this.ui.caption.hide();
      this.buildHotspots();
    }
  }

  /* ---------- doors ---------- */

  async advance() {
    if (this.busy || this.catching || this.current < 0) return;
    this.seq?.skip();
    this.ui.panel.close();
    this.busy = true;
    this.setHover(null);
    this.ui.hotspots.setEnabled(false);
    this.ui.hotspots.clearCoach();
    const room = this.room;
    if (room.def.door === 'portal') { await this.finale(); return; }

    const nextIndex = this.current + 1;
    const next = this.rooms[nextIndex];
    await this.prepare(nextIndex);
    next.group.visible = true;
    await room.door.open(new Sequence());
    const nextPose = next.cameraPose(this.stage);
    next.layout(this.stage, nextPose);
    if (room.passage) this.ui.caption.show(room.passage.caption, { ms: 4600 });

    if (reducedMotion.matches) {
      await this.ui.fade.run(true, 260, true);
      room.passage?.update(1);
      this.enter(nextIndex);
      await this.ui.fade.run(false, 360, true);
    } else {
      await this.walk(room, next, nextPose);
      this.enter(nextIndex);
    }
    room.group.visible = false;
    this.busy = false;
  }

  /** Camera path through the open door, along the corridor and into the next room. */
  walk(room, next, nextPose) {
    this.camToken = null;
    const o = room.group.position;
    const hole = room.door.hole;
    const cx = (hole.x0 + hole.x1) / 2;
    const eye = 1.45;
    const curve = new CatmullRomCurve3([
      this.stage.pose.pos.clone(),
      new Vector3(cx * 0.6, o.y + eye + 0.1, o.z + 1.8),
      new Vector3(cx, o.y + eye, o.z - 0.25),
      new Vector3(cx, next.group.position.y + eye, o.z - CORRIDOR + 0.05),
      nextPose.pos.clone(),
    ], false, 'centripetal');
    const startLook = this.stage.pose.look.clone();
    const startOffset = { x: this.stage.offset.x, y: this.stage.offset.y };
    const carry = this.stage.lights.carry;
    let switched = false;
    return tween(room.passage ? 3000 : 2400, (k) => {
      const pos = curve.getPointAt(k);
      this.stage.pose.pos.copy(pos);
      const ahead = curve.getPointAt(Math.min(1, k + 0.08), tmpB).add(AHEAD);
      const look = tmpA.lerpVectors(startLook, ahead, smooth(0, 0.25, k));
      this.stage.pose.look.lerpVectors(look, nextPose.look, smooth(0.72, 1, k));
      this.stage.offset.x = startOffset.x * (1 - smooth(0, 0.2, k));
      this.stage.offset.y = startOffset.y * (1 - smooth(0, 0.2, k));
      room.passage?.update(clamp((k - 0.2) / 0.5, 0, 1));
      carry.intensity = 9 * Math.sin(k * Math.PI);
      if (!switched && k > 0.45) { switched = true; this.lightsFor(next, true); }
    }, ease.sine);
  }

  async finale() {
    this.camToken = null;
    const room = this.room;
    const portal = room.door;
    const center = portal.group.localToWorld(portal.center.clone());
    const from = { pos: this.stage.pose.pos.clone(), look: this.stage.pose.look.clone() };
    const to = center.clone().add(new Vector3(0, 0, 0.9));
    this.ui.caption.hide();
    await Promise.all([
      portal.open(new Sequence()),
      tween(reducedMotion.matches ? 1 : 1200, (k) => {
        this.stage.pose.pos.lerpVectors(from.pos, to, k);
        this.stage.pose.look.lerpVectors(from.look, center, Math.min(1, k * 1.6));
        this.stage.offset.x *= 0.9;
        this.stage.offset.y *= 0.9;
      }, ease.in),
    ]);
    await this.ui.fade.run(true, 220);
    this.ui.hotspots.set([]);
    const done = this.ui.challenge.run({ pet: this.pet });
    this.ui.fade.run(false, 500);
    await done;
    this.stage.stop();
    this.ui.exit.show();
    this.busy = false;
  }

  async restart() {
    await this.ui.fade.run(true, 300, true);
    this.ui.exit.hide();
    this.visited.clear();
    this.pet = false;
    this.coached = false;
    for (const r of this.rooms) if (r.built) { r.reset(); r.passage?.reset(); }
    this.stage.start();
    this.enter(0);
    await this.ui.fade.run(false, 500, true);
  }

  /* ---------- frame ---------- */

  update(dt, t) {
    if (this.current < 0) return;
    const room = this.room;
    if (!this.busy) room.follow(this.stage);
    room.update(dt, t);
    const next = this.rooms[this.current + 1];
    if (next?.built && next.group.visible) next.update(dt, t);

    for (const p of this.interactive()) {
      p.hover += ((this.hovered === p ? 1 : 0) - p.hover) * Math.min(1, dt * 10);
      const idle = this.visited.has(p.id) ? 0 : 0.07 + 0.07 * Math.sin(t * 2.6);
      for (const m of p.pickables) {
        if (m.material.emissiveMap) {
          m.material.emissiveIntensity = (m.userData.baseGlow ?? 0.5) + p.hover * 0.45 + p.flash + (m.userData.flash ?? 0) + idle;
        }
      }
    }
    const door = room.door;
    door.calling = this.panelsClosed > 0 ? 1 : 0;
    const doorHover = this.hovered === 'door' ? 0.35 : 0;
    for (const m of door.pickables) if (m.material.emissiveMap) m.material.emissiveIntensity = m.userData.baseGlow + doorHover;

    const { targets, level } = this.light;
    for (const [key, target] of Object.entries(targets)) {
      const f = FLICKER.has(key) ? 0.9 + 0.06 * Math.sin(t * 11.3 + key.length) + 0.04 * Math.sin(t * 23.7) : 1;
      this.stage.lights[key].intensity = target * level * f;
    }
    if (!this.busy) this.stage.lights.carry.intensity *= 0.9;

    this.burst.update(dt);
    this.ui.hotspots.update();
  }
}
