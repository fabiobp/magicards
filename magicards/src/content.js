import {
  Group, Mesh, Vector3, CylinderGeometry, MeshLambertMaterial, PlaneGeometry, MeshBasicMaterial, AdditiveBlending,
} from 'three';
import { sprite, setSpriteTexture } from './sprites.js';
import { tex, canvasTexture } from './assets.js';
import { lootBeam, glowQuad, runeCircle, Shatter } from './fx.js';
import { ease, keyPoint, keyValue } from './tween.js';

const v = new Vector3();
const w1 = new Vector3();

// Game rarity colours; beams are additive, so the dark ones are lifted to stay visible.
const BEAM = { common: 0xffffff, rare: 0x3a9cff, epic: 0xb84dff, legendary: 0xffa500 };

const DOOR_SIZE = 3.4;

/** Sets position/scale from a landscape or portrait [x, y, z, scale] entry. */
function place(object, portrait, L, P) {
  const [x, y, z, s = 1] = portrait ? P : L;
  object.position.set(x, y, z);
  object.scale.setScalar(s);
}

const worldOf = (object, x, y, z, out = new Vector3()) => object.localToWorld(out.set(x, y, z));

function addSprite(room, name, opts, [x, y, z], rotY = 0) {
  const s = sprite(name, opts);
  s.position.set(x, y, z);
  s.rotation.y = rotY;
  room.group.add(s);
  return s;
}

function lightShaft(room, name, [x, y, z], height, color, opacity) {
  const s = addSprite(room, name, { height, anchor: 'center', additive: true, color, opacity }, [x, y, z]);
  s.renderOrder = 3;
  const base = opacity;
  room.updaters.push((dt, t) => { s.material.opacity = base * (0.8 + 0.2 * Math.sin(t * 0.7 + x)); });
  return s;
}

function pedestal(height = 0.85) {
  const m = new Mesh(new CylinderGeometry(0.42, 0.56, height, 24), new MeshLambertMaterial({
    map: tex('env/forest-wallfloor'), color: 0x9a90a8,
  }));
  m.position.y = height / 2;
  return m;
}

function slotTexture() {
  return canvasTexture(128, 128, (ctx, s) => {
    const r = 18;
    ctx.beginPath();
    ctx.roundRect(6, 6, s - 12, s - 12, r);
    const g = ctx.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(60,44,72,0.95)');
    g.addColorStop(1, 'rgba(14,10,20,0.95)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#e9c46a';
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(14, 14, s - 28, s - 28, r - 6);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(168,121,43,0.9)';
    ctx.stroke();
  });
}

function bannerTexture(icon, cloth) {
  return canvasTexture(256, 400, (ctx, w, h) => {
    ctx.fillStyle = '#8a5a1c';
    ctx.fillRect(6, 8, w - 12, 16);
    ctx.fillStyle = '#e9c46a';
    ctx.fillRect(6, 8, w - 12, 5);
    ctx.beginPath();
    ctx.moveTo(26, 22);
    ctx.lineTo(w - 26, 22);
    ctx.lineTo(w - 26, h - 52);
    ctx.lineTo(w / 2, h - 8);
    ctx.lineTo(26, h - 52);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, cloth);
    g.addColorStop(1, '#1d0610');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#e9c46a';
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(248,226,166,0.6)';
    ctx.strokeRect(40, 36, w - 80, h - 110);
    const img = icon.image;
    const iw = 168;
    const ih = iw * img.height / img.width;
    ctx.shadowColor = 'rgba(255,210,122,0.8)';
    ctx.shadowBlur = 18;
    ctx.drawImage(img, (w - iw) / 2, 70 + (168 - ih) / 2, iw, ih);
  });
}

/* ------------------------------------------------------------------ */
/* Room 1 — Fight. Loot. Repeat.                                       */
/* ------------------------------------------------------------------ */

function grimboarDecor() {
  const body = sprite('monsters/grimboar', { height: 2.35, glow: 0.55 });
  return {
    id: 'grimboar', object: body, pickables: [],
    layout(portrait) { place(body, portrait, [3.1, 0, 1.9], [0.95, 0, 1.6, 0.72]); },
  };
}

// How far the hand slides down (in card heights) to clear the view, and how fast it eases there.
const HAND_TUCK_DROP = 1.2;
const HAND_TUCK_RATE = 8;

/** The player's hand sits under the camera; it slides out of view while a `hideHand` prop is focused. */
function handProp(room, target) {
  const group = new Group();
  let tuckTarget = 0;
  let tuck = 0;
  const cards = [1100, 1200, 1300, 3000, 5100].map((id, i) => {
    const c = sprite(`cards/${id}`, { height: 1, glow: 0.7 });
    const k = i - 2;
    c.position.set(k * 0.36, -Math.abs(k) * 0.05, i * 0.01);
    c.rotation.z = -k * 0.13;
    c.userData.home = { p: c.position.clone(), r: c.rotation.z };
    group.add(c);
    return c;
  });
  const lead = cards[2];

  return {
    id: 'hand', spot: 'spot-hand', label: 'Your Deck', object: group, pickables: cards, lean: false, follow: true,
    anchor: (out) => lead.localToWorld(out.set(0, 0.86, 0)),
    layout(portrait, pose, stage) {
      const dist = portrait ? 3.1 : 2.6;
      const s = portrait ? 0.6 : 0.62;
      const dir = w1.copy(pose.look).sub(pose.pos).normalize();
      const at = v.copy(pose.pos).addScaledVector(dir, dist);
      at.y -= Math.tan((stage.camera.fov * Math.PI) / 360) * dist + (0.42 + tuck * HAND_TUCK_DROP) * s;
      group.position.copy(room.group.worldToLocal(at));
      group.scale.setScalar(s);
    },
    focusChanged(focused) { tuckTarget = focused?.hideHand ? 1 : 0; },
    update(dt) { tuck += (tuckTarget - tuck) * Math.min(1, dt * HAND_TUCK_RATE); },
    async play(seq, ctx) {
      const home = lead.userData.home;
      const tx = target.position.x;
      const hit = worldOf(target, 0, target.userData.size.h * 0.5, 0.2);
      const local = group.worldToLocal(hit.clone());
      await seq.tween(160, (k) => { lead.position.y = home.p.y + k * 0.3; }, ease.out);
      const start = lead.position.clone();
      await seq.tween(380, (k) => {
        lead.position.lerpVectors(start, local, k);
        lead.position.y += Math.sin(k * Math.PI) * 0.5;
        lead.rotation.z = home.r + k * Math.PI * 2;
        lead.scale.setScalar(1 - k * 0.6);
      }, ease.in);
      lead.visible = false;
      ctx.burst.emit(hit, { count: 46, color: 0xffa040, speed: 3.4, up: 1.2 });
      ctx.floaters.pop('-128', hit);
      ctx.shake(0.05);
      const m = target.material;
      await seq.tween(340, (k) => {
        target.position.x = tx + Math.sin(k * Math.PI * 5) * (1 - k) * 0.12;
        m.emissive.setRGB(1, 0.25 + 0.75 * k, 0.25 + 0.75 * k);
        m.emissiveIntensity = 0.55 + (1 - k) * 0.9;
      }, ease.linear);
      lead.visible = true;
      lead.scale.setScalar(1);
      lead.rotation.z = home.r;
      await seq.tween(280, (k) => { lead.position.set(home.p.x, home.p.y - 0.7 * (1 - k), home.p.z); }, ease.out);
    },
    reset() {
      tuckTarget = 0;
      tuck = 0;
      for (const c of cards) {
        c.position.copy(c.userData.home.p);
        c.rotation.z = c.userData.home.r;
        c.scale.setScalar(1);
        c.visible = true;
      }
    },
  };
}

const NIGHTFANG_SHATTER_MS = 1500;
const NIGHTFANG_EMBER_BURSTS = 14;

/** Clicking Nightfang breaks it into drifting ash while its loot drops, then it re-forms. */
function monsterProp() {
  const group = new Group();
  const body = sprite('monsters/nightfang', { height: 1.9, glow: 0.55 });
  group.add(body);
  const drops = [
    { name: 'loot/coin', h: 0.36, rarity: 'common', at: [1.3, 0.8] },
    { name: 'loot/potion-heal', h: 0.5, rarity: 'rare', at: [0.45, 1.35] },
    { name: 'loot/helmet', h: 0.34, rarity: 'epic', at: [-0.6, 1.1] },
    { name: 'cards/10500', h: 0.62, rarity: 'legendary', at: [2.1, 0.15] },
  ].map((d) => {
    const item = new Group();
    const art = sprite(d.name, { height: d.h, glow: 0.85 });
    const beam = lootBeam(BEAM[d.rarity], 2.6, 0.62);
    item.add(beam, art);
    item.visible = false;
    group.add(item);
    return { ...d, item, beam, landed: false };
  });

  const dropOne = async (seq, ctx, d, delay) => {
    await seq.wait(delay);
    const [x, z] = d.at;
    d.item.visible = true;
    d.beam.userData.material.opacity = 0;
    await seq.tween(330, (k) => {
      d.item.position.set(x * k, 0.9 * (1 - k) + Math.sin(k * Math.PI) * 0.9, z * k);
    }, ease.linear);
    d.landed = true;
    const at = worldOf(d.item, 0, 0.25, 0);
    ctx.burst.emit(at, { count: 18, color: BEAM[d.rarity], speed: 2, up: 2 });
    if (d.rarity === 'legendary') ctx.floaters.pop('LEGENDARY!', worldOf(d.item, 0, 1.0, 0), 'legend');
  };

  const shatter = new Shatter(body);
  const ember = new Vector3();
  const showBody = () => {
    shatter.mesh.visible = false;
    body.visible = true;
  };

  const prop = {
    id: 'monster', spot: 'spot-monster', label: 'Nightfang', object: group, pickables: [body], hideHand: true,
    anchor: (out) => body.localToWorld(out.set(0, 1.95, 0)),
    layout(portrait) { place(group, portrait, [-3.25, 0, 2.3], [-0.72, 0, 3.0, 0.56]); },
    async play(seq, ctx) {
      for (const d of drops) { d.item.visible = false; d.landed = false; }
      showBody();
      body.material.opacity = 1;
      await seq.tween(160, (k) => { prop.flash = k * 1.1; }, ease.out);
      ctx.shake(0.04);
      body.visible = false;
      shatter.mesh.visible = true;
      let emitted = 0;
      const death = seq.tween(NIGHTFANG_SHATTER_MS, (k) => {
        shatter.progress(k);
        prop.flash = 1.1 * (1 - k);
        const due = Math.floor(k * NIGHTFANG_EMBER_BURSTS);
        if (due - emitted > 2) emitted = due;
        for (; emitted < due; emitted++) {
          ctx.burst.emit(shatter.front(k, ember), {
            count: 5, color: emitted % 3 ? 0xd8ffb0 : 0x9fd0ff, speed: 0.9, up: 0.7, gravity: 0.6, life: 1.1,
          });
        }
      }, ease.linear);
      await seq.wait(NIGHTFANG_SHATTER_MS * 0.35);
      await Promise.all([death, ...drops.map((d, i) => dropOne(seq, ctx, d, i * 120))]);
      shatter.mesh.visible = false;
      prop.flash = 0;
      await seq.wait(500);
      body.visible = true;
      await seq.tween(420, (k) => {
        body.material.opacity = k;
        body.scale.setScalar(0.92 + 0.08 * k);
      }, ease.out);
    },
    update(dt, t) {
      for (const [i, d] of drops.entries()) {
        if (d.landed) d.beam.userData.material.opacity = 0.65 + 0.2 * Math.sin(t * 3 + i);
        d.beam.rotation.y += dt * 0.6;
      }
      if (body.visible) body.scale.y = body.scale.x * (1 + Math.sin(t * 2.2) * 0.012);
    },
    reset() {
      for (const d of drops) { d.item.visible = false; d.landed = false; }
      showBody();
      prop.flash = 0;
      body.material.opacity = 1;
      body.scale.setScalar(1);
    },
  };
  return prop;
}

// Share of the visible view height a loot item fills when it reaches the camera.
const LOOT_NEAR_SHARE = 0.17;
const LOOT_NEAR_DISTANCE = 1.9;
const LOOT_POCKET_DISTANCE = 1.7;
// Seconds at which a loot item passes the chest mouth, its fan slot, the camera and the pocket.
const LOOT_KEYS = [0, 0.34, 1.02, 1.5];
const LOOT_STAGGER = 110;
const CHEST_SQUASH_MS = 140;
const CHEST_RELEASE_MS = 360;

/**
 * Only the closed chest is shown. Clicking it squashes the chest, pops the lid open and bursts
 * the loot out in a fan; each item flies to the right side of the visible view, growing as it
 * nears the camera, then drops below the bottom edge as if slipped into the hero's right pocket.
 */
function lootPileProp() {
  const group = new Group();
  const chest = sprite('loot/chest', { height: 0.95, glow: 0.6 });
  group.add(chest);
  const names = ['torch', 'bandage', 'bomb', 'provision', 'escape', 'luck'];
  const mouth = new Vector3(0, 0.47, 0.05);
  const fan = names.map((_, i) => {
    const a = ((i + 0.5) / names.length) * Math.PI;
    return new Vector3(-Math.cos(a) * 0.75, 1.0 + Math.sin(a) * 0.45, 0.3);
  });
  const items = names.map((n) => {
    const s = sprite(`loot/${n}`, { height: 0.36, anchor: 'center', glow: 0.75 });
    s.visible = false;
    group.add(s);
    return s;
  });
  const hideItems = () => {
    for (const s of items) { s.visible = false; s.scale.setScalar(1); s.rotation.z = 0; }
  };

  // Screen targets are re-read every frame so they track the camera while it leans.
  const nearPoint = (ctx, spread, out) => {
    const { w, h } = ctx.viewArea();
    return group.worldToLocal(ctx.stage.rayPoint(w * (0.85 + spread * 0.1), h * (0.42 + spread * 0.24), LOOT_NEAR_DISTANCE, out));
  };
  const pocketPoint = (ctx, out) => {
    const { w, h } = ctx.viewArea();
    return group.worldToLocal(ctx.stage.rayPoint(w * 0.96, h * 1.3, LOOT_POCKET_DISTANCE, out));
  };
  const nearScale = (ctx, s) => {
    const { camera, height } = ctx.stage;
    const viewH = 2 * LOOT_NEAR_DISTANCE * Math.tan((camera.fov * Math.PI) / 360) * (ctx.viewArea().h / height);
    return (LOOT_NEAR_SHARE * viewH) / (s.userData.size.h * group.scale.x);
  };

  /** One unbroken flight through the keys (mouth, fan slot, near the camera, pocket). */
  async function flyOne(seq, ctx, s, i) {
    const spread = i / (items.length - 1) - 0.5;
    const keys = [mouth, fan[i], new Vector3(), new Vector3()];
    const big = nearScale(ctx, s);
    const sizes = [0.3, 1, big, big];
    const turns = [0, spread * 0.5, -0.1, -0.7];
    const end = LOOT_KEYS[LOOT_KEYS.length - 1];
    await seq.wait(i * LOOT_STAGGER);
    s.visible = true;
    await seq.tween(end * 1000, (k) => {
      const t = k * end;
      nearPoint(ctx, spread, keys[2]);
      pocketPoint(ctx, keys[3]);
      keyPoint(keys, LOOT_KEYS, t, s.position, 1.6, 1.3);
      s.scale.setScalar(keyValue(sizes, LOOT_KEYS, t));
      s.rotation.z = keyValue(turns, LOOT_KEYS, t);
    }, ease.linear);
    s.visible = false;
  }

  // k = 1 is fully squashed; the release overshoots below 0, stretching the chest as the lid pops.
  const squash = (k) => chest.scale.set(1 + k * 0.08, 1 - k * 0.1, 1);

  const prop = {
    id: 'loot', spot: 'spot-loot', label: 'Loot Pile', object: group, pickables: [chest],
    anchor: (out) => chest.localToWorld(out.set(0, 1.05, 0)),
    layout(portrait) { place(group, portrait, [2.45, 0, 3.4], [0.82, 0, 3.4, 0.6]); },
    async play(seq, ctx) {
      hideItems();
      setSpriteTexture(chest, tex('loot/chest'));
      prop.flash = 0.4;
      await seq.tween(CHEST_SQUASH_MS, squash, ease.out);
      setSpriteTexture(chest, tex('loot/chest-open'));
      ctx.burst.emit(worldOf(chest, 0, 0.5, 0.1), { count: 24, color: 0xffe08a, speed: 1.8, up: 2 });
      const release = seq.tween(CHEST_RELEASE_MS, (k) => squash(1 - k), ease.back).then(() => { prop.flash = 0; });
      await Promise.all([release, ...items.map((s, i) => flyOne(seq, ctx, s, i))]);
    },
    reset() {
      hideItems();
      setSpriteTexture(chest, tex('loot/chest'));
      chest.scale.setScalar(1);
      prop.flash = 0;
    },
  };
  return prop;
}

function decorateForest(room, { shaftColor = 0xffd8a0, shaftOpacity = 0.32 } = {}) {
  const { W } = room.size;
  addSprite(room, 'env/pillar', { height: 5.4, glow: 0.3 }, [-W / 2 + 0.55, 0, 1.3]);
  addSprite(room, 'env/pillar', { height: 5.4, glow: 0.3 }, [W / 2 - 0.55, 0, 1.3]);
  addSprite(room, 'env/grass', { height: 1.2, glow: 0.35 }, [-W / 2 + 1.4, 0, 0.45]);
  addSprite(room, 'env/grass2', { height: 1.05, glow: 0.35 }, [W / 2 - 1.5, 0, 0.4]);
  addSprite(room, 'env/grass', { height: 1.0, glow: 0.35 }, [-W / 2 + 0.6, 0, 5.6], Math.PI / 2);
  addSprite(room, 'env/grass2', { height: 1.1, glow: 0.35 }, [W / 2 - 0.6, 0, 6.2], -Math.PI / 2);
  addSprite(room, 'env/rock', { height: 0.95, glow: 0.35 }, [-W / 2 + 1.1, 0, 3.6]);
  lightShaft(room, 'env/light-2', [-2.3, 3.1, 0.7], 4.6, shaftColor, shaftOpacity);
  lightShaft(room, 'env/light-3', [2.4, 3.1, 0.9], 4.6, shaftColor, shaftOpacity * 0.85);
}

function decorateBattle(room) {
  decorateForest(room);
  // Corridor trap: spikes spring up and poison mist drifts while the camera passes.
  const spikes = [-0.35, 0.35].map((x) => {
    const s = sprite('env/spikes', { height: 0.55, glow: 0.4 });
    s.position.set(x, 0, -1.6);
    s.scale.y = 0.01;
    room.group.add(s);
    return s;
  });
  const mists = ['env/mist-0', 'env/mist-1'].map((n, i) => {
    const m = sprite(n, { height: 2.2, anchor: 'center', additive: true, color: 0x9dff7a, opacity: 0 });
    m.position.set(i ? 0.4 : -0.4, 1.1, -2.1 - i * 0.4);
    room.group.add(m);
    return m;
  });
  room.passage = {
    caption: document.querySelector('#battle .room__passage').textContent,
    update(k) {
      const rise = Math.min(1, Math.max(0, (k - 0.12) / 0.12));
      for (const s of spikes) s.scale.y = 0.01 + ease.back(rise) * 0.99;
      mists.forEach((m, i) => {
        m.material.opacity = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.55;
        m.position.x = (i ? 0.4 : -0.4) + Math.sin(k * 6 + i) * 0.3;
      });
    },
    reset() {
      for (const s of spikes) s.scale.y = 0.01;
      for (const m of mists) m.material.opacity = 0;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Room 2 — The Hall of Cards                                          */
/* ------------------------------------------------------------------ */

function altarProp() {
  const group = new Group();
  const base = pedestal();
  const circle = new Mesh(new PlaneGeometry(2.6, 2.6), new MeshBasicMaterial({
    map: runeCircle(), transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.7,
  }));
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.02;
  const column = lootBeam(0x7fc4ff, 3.6, 1.3);
  const flip = new Group();
  flip.position.y = 1.55;
  const back = sprite('cards/back', { height: 1.15, anchor: 'center', glow: 0.7 });
  const front = sprite('cards/10500', { height: 1.15, anchor: 'center', glow: 0.8 });
  front.rotation.y = Math.PI;
  flip.add(back, front);
  group.add(circle, base, column, flip);
  let flash = 0;
  const prop = {
    id: 'altar', spot: 'spot-altar', label: 'Summoning Altar', object: group, pickables: [back, front, base],
    anchor: (out) => flip.localToWorld(out.set(0, 0.75, 0)),
    layout(portrait) { place(group, portrait, [-3.3, 0, 2.3], [-0.95, 0, 2.6, 0.82]); },
    async play(seq, ctx) {
      const r0 = flip.rotation.y;
      const r1 = r0 + (Math.round(r0 / Math.PI) % 2 ? Math.PI * 4 : Math.PI * 3);
      await seq.tween(1050, (k) => {
        flip.rotation.y = r0 + (r1 - r0) * k;
        flash = Math.sin(k * Math.PI);
      }, ease.inOut);
      flash = 0;
      const at = worldOf(flip, 0, 0, 0.1);
      ctx.burst.emit(at, { count: 60, color: 0xffc040, speed: 3, up: 1.5, gravity: -2 });
      ctx.floaters.pop('LEGENDARY!', worldOf(flip, 0, 0.9, 0), 'legend');
      prop.flash = 0.8;
      await seq.tween(450, (k) => { prop.flash = 0.8 * (1 - k); }, ease.out);
    },
    update(dt, t) {
      circle.rotation.z += dt * 0.25;
      flip.position.y = 1.55 + Math.sin(t * 1.6) * 0.06;
      column.userData.material.opacity = 0.28 + 0.08 * Math.sin(t * 2) + flash * 0.6;
      circle.material.opacity = 0.6 + flash * 0.4;
    },
    reset() { flip.rotation.y = 0; flash = 0; },
  };
  return prop;
}

function galleryProp() {
  const group = new Group();
  const ids = [11800, 14100, 15500, 16500, 18700, 19000];
  const L = [[-5.0, 3.5], [-3.85, 3.5], [-2.7, 3.5], [2.7, 3.5], [3.85, 3.5], [5.0, 3.5]];
  const P = ids.map((_, i) => [-1.85 + i * 0.74, 4.3]);
  const items = ids.map((id) => {
    const card = sprite(`cards/${id}`, { height: 1.05, anchor: 'center', glow: 0.55 });
    const halo = glowQuad(1.7, 0xffd8a0, 0.22);
    halo.position.z = -0.02;
    const holder = new Group();
    holder.add(halo, card);
    group.add(holder);
    return { holder, card, halo };
  });
  let portraitMode = false;
  return {
    id: 'gallery', spot: 'spot-gallery', label: 'Card Gallery', object: group, pickables: items.map((i) => i.card),
    anchor: (out) => (portraitMode
      ? worldOf(group, 0, 4.3 + 0.7, 0.1, out)
      : items[4].card.localToWorld(out.set(0, 0.75, 0))),
    layout(portrait) {
      portraitMode = portrait;
      const pos = portrait ? P : L;
      const s = portrait ? 0.74 : 1;
      items.forEach((it, i) => { it.holder.position.set(pos[i][0], pos[i][1], 0.1); it.holder.scale.setScalar(s); });
    },
    async play(seq) {
      await Promise.all(items.map(async (it, i) => {
        await seq.wait(i * 110);
        await seq.tween(320, (k) => {
          const b = Math.sin(k * Math.PI);
          it.card.scale.setScalar(1 + b * 0.14);
          it.card.userData.flash = b * 0.9;
          it.halo.material.opacity = 0.22 + b * 0.6;
        }, ease.linear);
      }));
    },
    reset() {
      for (const it of items) { it.card.scale.setScalar(1); it.card.userData.flash = 0; it.halo.material.opacity = 0.22; }
    },
  };
}

function awakenProp() {
  const group = new Group();
  const base = pedestal();
  const card = sprite('cards/20400', { height: 1.15, anchor: 'center', glow: 0.6 });
  card.position.y = 1.55;
  const stars = [-0.34, 0, 0.34].map((x) => {
    const s = sprite('ui/star-empty', { height: 0.3, anchor: 'center', glow: 0.9 });
    s.position.set(x, 1.0, 0.06);
    return s;
  });
  const starCard = sprite('cards/1000000', { height: 0.62, anchor: 'center', glow: 0.75 });
  const home = new Vector3(1.0, 2.1, 0.12);
  starCard.position.copy(home);
  const aura = glowQuad(1.9, 0xc08cff, 0.3);
  aura.position.set(0, 1.55, -0.05);
  group.add(base, aura, card, ...stars, starCard);
  return {
    id: 'awaken', spot: 'spot-awaken', label: 'Awakening', object: group, pickables: [card, starCard, base],
    anchor: (out) => card.localToWorld(out.set(0, 0.75, 0)),
    layout(portrait) {
      place(group, portrait, [3.3, 0, 2.3], [0.95, 0, 2.6, 0.82]);
      home.set(portrait ? 0.15 : 1.0, portrait ? 2.95 : 2.1, 0.12);
      starCard.position.copy(home);
    },
    async play(seq, ctx) {
      for (const s of stars) setSpriteTexture(s, tex('ui/star-empty'));
      const from = starCard.position.clone();
      await seq.tween(460, (k) => {
        starCard.position.lerpVectors(from, card.position, k);
        starCard.scale.setScalar(1 - k * 0.7);
        starCard.material.opacity = 1 - k * 0.8;
        starCard.rotation.z = k * Math.PI;
      }, ease.in);
      starCard.visible = false;
      ctx.burst.emit(worldOf(card, 0, 0, 0.1), { count: 50, color: 0xc08cff, speed: 2.6, up: 1.2, gravity: -1.5 });
      await seq.tween(260, (k) => {
        card.userData.flash = (1 - k) * 1.6;
        aura.material.opacity = 0.3 + (1 - k) * 0.7;
      }, ease.out);
      for (const s of stars) {
        setSpriteTexture(s, tex('ui/star'));
        ctx.burst.emit(worldOf(s, 0, 0, 0.05), { count: 10, color: 0xffd040, speed: 1.4, up: 1 });
        await seq.tween(170, (k) => { s.scale.setScalar(0.4 + ease.back(k) * 0.6); }, ease.linear);
      }
      starCard.visible = true;
      starCard.position.copy(home);
      starCard.rotation.z = 0;
      starCard.scale.setScalar(1);
      await seq.tween(260, (k) => { starCard.material.opacity = k; }, ease.out);
    },
    update(dt, t) {
      card.position.y = 1.55 + Math.sin(t * 1.5 + 1) * 0.05;
      if (starCard.material.opacity >= 1 && starCard.visible) starCard.position.y = home.y + Math.sin(t * 2.1) * 0.07;
      aura.material.opacity = Math.max(aura.material.opacity * 0.98, 0.28 + 0.06 * Math.sin(t * 1.7));
    },
    reset() {
      for (const s of stars) { setSpriteTexture(s, tex('ui/star-empty')); s.scale.setScalar(1); }
      starCard.visible = true;
      starCard.position.copy(home);
      starCard.scale.setScalar(1);
      starCard.rotation.z = 0;
      starCard.material.opacity = 1;
      card.userData.flash = 0;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Room 3 — The Forge                                                   */
/* ------------------------------------------------------------------ */

function blacksmithProp() {
  const group = new Group();
  const body = sprite('forge/blacksmith-place', { height: 3.1, glow: 0.5 });
  group.add(body);
  const { w, h } = body.userData.size;
  const anvil = new Vector3(w * 0.08, h * 0.19, 0.2);
  const spark = glowQuad(1.1, 0xffb050, 0);
  spark.position.copy(anvil);
  const helmet = sprite('loot/helmet', { height: 0.5, anchor: 'center', glow: 1 });
  helmet.visible = false;
  group.add(spark, helmet);
  return {
    id: 'blacksmith', spot: 'spot-blacksmith', label: 'Blacksmith', object: group, pickables: [body],
    anchor: (out) => body.localToWorld(out.set(0, h * 0.98, 0)),
    layout(portrait) { place(group, portrait, [-3.35, 0, 1.9], [-0.9, 0, 2.2, 0.62]); },
    async play(seq, ctx) {
      for (let i = 0; i < 3; i++) {
        await seq.tween(110, (k) => { body.scale.y = 1 - Math.sin(k * Math.PI) * 0.018; }, ease.linear);
        ctx.burst.emit(worldOf(group, anvil.x, anvil.y + 0.1, anvil.z), { count: 26, color: 0xffb040, speed: 3.2, up: 2.4, gravity: -7, life: 0.7 });
        ctx.shake(0.025);
        await seq.tween(170, (k) => { spark.material.opacity = 1 - k; }, ease.out);
      }
      helmet.visible = true;
      await seq.tween(520, (k) => {
        helmet.position.set(anvil.x, anvil.y + 0.2 + k * 0.85, anvil.z + 0.1);
        helmet.scale.setScalar(0.3 + 0.9 * ease.back(k));
        helmet.userData.flash = 1 - k * 0.6;
      }, ease.out);
      await seq.wait(380);
      await seq.tween(260, (k) => { helmet.material.opacity = 1 - k; }, ease.in);
      helmet.visible = false;
      helmet.material.opacity = 1;
    },
    reset() { helmet.visible = false; helmet.material.opacity = 1; spark.material.opacity = 0; body.scale.y = 1; },
  };
}

function rackProp() {
  const group = new Group();
  const frameTex = slotTexture();
  const names = ['helmet', 'armour', 'shield', 'amulet', 'boots'];
  const slots = names.map((n) => {
    const holder = new Group();
    const frame = sprite(null, { map: frameTex, height: 0.72, anchor: 'center', glow: 0.6 });
    const item = sprite(`loot/${n}`, { height: 0.5, anchor: 'center', glow: 0.8 });
    item.position.z = 0.03;
    holder.add(frame, item);
    group.add(holder);
    return { holder, frame, item };
  });
  return {
    id: 'rack', spot: 'spot-rack', label: 'Equipment', object: group,
    pickables: slots.flatMap((s) => [s.frame, s.item]),
    anchor: (out) => worldOf(slots[2].holder, 0, 0.62, 0, out),
    /** Bottom edge of the slot frames. */
    base: (out) => worldOf(slots[2].holder, 0, -0.36, 0, out),
    layout(portrait) {
      const [y, step, s] = portrait ? [4.15, 0.66, 0.78] : [3.75, 0.86, 1];
      slots.forEach((sl, i) => { sl.holder.position.set((i - 2) * step, y, 0.1); sl.holder.scale.setScalar(s); });
    },
    async play(seq, ctx) {
      await Promise.all(slots.map(async (sl, i) => {
        sl.item.scale.setScalar(0.001);
        await seq.wait(i * 150);
        await seq.tween(320, (k) => {
          sl.item.position.y = (1 - k) * 0.7;
          sl.item.scale.setScalar(0.3 + 0.7 * ease.back(k));
        }, ease.out);
        ctx.burst.emit(worldOf(sl.holder, 0, 0, 0.1), { count: 14, color: 0xffd27a, speed: 1.6, up: 0.8, gravity: -2 });
        await seq.tween(240, (k) => { sl.frame.userData.flash = (1 - k) * 1.2; }, ease.out);
      }));
    },
    reset() {
      for (const sl of slots) { sl.item.position.y = 0; sl.item.scale.setScalar(1); sl.frame.userData.flash = 0; }
    },
  };
}

function apothecaryProp() {
  const group = new Group();
  const body = sprite('forge/apothecary-place', { height: 3.0, glow: 0.5 });
  group.add(body);
  const { h } = body.userData.size;
  const brew = new Vector3(-1.05, 1.45, 0.3);
  const ingredients = [1, 2, 3].map((i) => sprite(`forge/ingredient-${i}`, { height: 0.34, anchor: 'center', glow: 0.85 }));
  const potion = sprite('loot/potion-heal', { height: 0.6, anchor: 'center', glow: 1 });
  potion.visible = false;
  const halo = glowQuad(1.2, 0x7dff9a, 0);
  halo.position.copy(brew);
  group.add(halo, ...ingredients, potion);
  let radius = 1;
  let spin = 0;
  const showIngredients = (opacity) => {
    for (const s of ingredients) { s.visible = true; s.scale.setScalar(1); s.material.opacity = opacity; }
  };
  return {
    id: 'apothecary', spot: 'spot-apothecary', label: 'Apothecary', object: group, pickables: [body, ...ingredients],
    anchor: (out) => body.localToWorld(out.set(0, h * 0.98, 0)),
    layout(portrait) { place(group, portrait, [3.35, 0, 1.9], [0.88, 0, 2.2, 0.6]); },
    async play(seq, ctx) {
      await seq.tween(650, (k) => {
        radius = 1 - k;
        spin = k * Math.PI * 3;
        for (const s of ingredients) s.scale.setScalar(1 - k * 0.7);
        halo.material.opacity = k * 0.8;
      }, ease.in);
      for (const s of ingredients) s.visible = false;
      ctx.burst.emit(worldOf(group, brew.x, brew.y, brew.z), { count: 40, color: 0x7dff9a, speed: 1.6, up: 0.6, gravity: 1.2, life: 1.1 });
      potion.visible = true;
      await seq.tween(380, (k) => {
        potion.position.set(brew.x, brew.y + k * 0.25, brew.z + 0.05);
        potion.scale.setScalar(0.2 + 0.8 * ease.back(k));
        potion.userData.flash = 1 - k * 0.5;
      }, ease.out);
      await seq.wait(420);
      await seq.tween(280, (k) => {
        potion.material.opacity = 1 - k;
        halo.material.opacity = 0.8 * (1 - k);
      }, ease.in);
      potion.visible = false;
      potion.material.opacity = 1;
      radius = 1;
      spin = 0;
      showIngredients(0);
      await seq.tween(240, (k) => { for (const s of ingredients) s.material.opacity = k; }, ease.out);
    },
    update(dt, t) {
      ingredients.forEach((s, i) => {
        const a = spin + t * 0.9 + (i * Math.PI * 2) / 3;
        s.position.set(brew.x + Math.cos(a) * 0.36 * radius, brew.y + Math.sin(a) * 0.2 * radius, brew.z + i * 0.01);
      });
    },
    reset() {
      potion.visible = false;
      potion.material.opacity = 1;
      radius = 1;
      spin = 0;
      showIngredients(1);
      halo.material.opacity = 0;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Room 4 — Live Events                                                 */
/* ------------------------------------------------------------------ */

function bossProp() {
  const group = new Group();
  const aura = glowQuad(5, 0xff3a30, 0.22);
  aura.position.set(0, 2, -0.3);
  const body = sprite('monsters/worldboss', { height: 3.9, glow: 0.38 });
  group.add(aura, body);
  let roar = 0;
  let portraitMode = false;
  return {
    id: 'boss', spot: 'spot-boss', label: 'World Boss', object: group, pickables: [body],
    anchor: (out) => body.localToWorld(out.set(0, portraitMode ? 2.6 : 4.05, 0)),
    layout(portrait) {
      portraitMode = portrait;
      place(group, portrait, [-3.35, 0, 2.1], [-0.85, 0, 2.0, 0.56]);
    },
    async play(seq, ctx) {
      ctx.floaters.pop('ROAAAR!', worldOf(body, 0, 3.3, 0.3));
      ctx.shake(0.1);
      ctx.burst.emit(worldOf(group, 0, 0.15, 0.4), { count: 40, color: 0xc8a070, speed: 2.2, up: 0.6, gravity: -1.5 });
      const m = body.material;
      await seq.tween(700, (k) => {
        roar = Math.sin(k * Math.PI);
        const pulse = Math.abs(Math.sin(k * Math.PI * 2));
        body.scale.set(1 + pulse * 0.06, 1 + pulse * 0.08, 1);
        m.emissive.setRGB(1, 1 - roar * 0.7, 1 - roar * 0.7);
      }, ease.linear);
      roar = 0;
      m.emissive.setRGB(1, 1, 1);
      body.scale.set(1, 1, 1);
    },
    update(dt, t) {
      aura.material.opacity = 0.2 + 0.06 * Math.sin(t * 1.3) + roar * 0.6;
      aura.scale.setScalar(1 + roar * 0.2);
      if (!roar) body.scale.y = 1 + Math.sin(t * 1.4) * 0.01;
    },
    reset() { roar = 0; body.material.emissive.setRGB(1, 1, 1); body.scale.set(1, 1, 1); },
  };
}

function bannerProp(id, spot, label, icon, cloth, L, P) {
  const pivot = new Group();
  const banner = sprite(null, { map: bannerTexture(tex(icon), cloth), height: 1.9, anchor: 'center', glow: 0.55 });
  banner.position.y = -0.95;
  pivot.add(banner);
  return {
    id, spot, label, object: pivot, pickables: [banner],
    anchor: (out) => pivot.localToWorld(out.set(0, -1.25, 0.1)),
    layout(portrait) { place(pivot, portrait, L, P); },
    async play(seq, ctx) {
      ctx.burst.emit(worldOf(pivot, 0, -0.75, 0.15), { count: 24, color: 0xffd27a, speed: 1.6, up: 1, gravity: -1.5 });
      await seq.tween(950, (k) => {
        pivot.rotation.z = Math.sin(k * Math.PI * 3) * (1 - k) * 0.12;
        banner.userData.flash = Math.sin(k * Math.PI) * 0.9;
      }, ease.linear);
    },
    update(dt, t) { if (!banner.userData.flash) pivot.rotation.z = Math.sin(t * 0.9 + L[0]) * 0.012; },
    reset() { pivot.rotation.z = 0; banner.userData.flash = 0; },
  };
}

const HOPS = {
  L: [[0, 0], [-2.3, 0.7], [-4.7, -0.5], [-2.7, -1.7], [-1.1, 0.3]],
  P: [[0, 0], [-1.2, 0.6], [-2.4, -0.3], [-1.3, -1.4], [-0.5, 0.4]],
  restL: [-1.6, -2.7],
  restP: [-0.75, -2.3],
};
const CATCH_TAPS = 5;

function eggProp() {
  const group = new Group();
  const halo = glowQuad(2, 0xffe08a, 0.35);
  halo.position.set(0, 0.6, -0.08);
  const egg = sprite('pet/egg-1', { height: 1.3, glow: 0.6 });
  const pet = new Group();
  const ruffin = sprite('pet/ruffin', { height: 1.1, glow: 0.6 });
  pet.add(ruffin);
  pet.visible = false;
  const coin = sprite('pet/ruffin-coin', { height: 0.55, anchor: 'center', glow: 1 });
  coin.visible = false;
  group.add(halo, egg, pet, coin);
  let portraitMode = false;
  let burstFlash = 0;

  const spot = (i) => (portraitMode ? HOPS.P : HOPS.L)[i];
  const rest = () => (portraitMode ? HOPS.restP : HOPS.restL);

  const prop = {
    id: 'egg', spot: 'spot-egg', object: group, pickables: [egg, ruffin], phase: 'egg', taps: 0, deferVisit: true,
    get label() { return this.phase === 'egg' ? 'Mysterious Egg' : 'Ruffin'; },
    anchor: (out) => (prop.phase === 'egg'
      ? egg.localToWorld(out.set(0, 1.45, 0))
      : ruffin.localToWorld(out.set(0, 1.25, 0))),
    layout(portrait) {
      portraitMode = portrait;
      place(group, portrait, [3.2, 0, 3.3], [0.95, 0, 3.2, 0.7]);
      const [x, z] = prop.phase === 'joined' ? rest() : spot(Math.min(prop.taps, CATCH_TAPS - 1));
      pet.position.set(x, 0, z);
    },

    async hatch(seq, ctx) {
      const frames = ['pet/egg-1', 'pet/egg-2', 'pet/egg-3'];
      for (let i = 0; i < frames.length; i++) {
        setSpriteTexture(egg, tex(frames[i]));
        await seq.tween(i ? 300 : 420, (k) => { egg.rotation.z = Math.sin(k * Math.PI * (i ? 6 : 4)) * 0.14 * (1 - k * 0.5); }, ease.linear);
      }
      egg.rotation.z = 0;
      const at = worldOf(group, 0, 0.6, 0.2);
      ctx.burst.emit(at, { count: 70, color: 0xffe9a0, speed: 3, up: 1.4, gravity: -2 });
      await seq.tween(220, (k) => { burstFlash = k; halo.scale.setScalar(1 + k * 1.8); }, ease.out);
      egg.visible = false;
      pet.visible = true;
      pet.position.set(0, 0, 0);
      await seq.tween(320, (k) => {
        pet.scale.setScalar(0.2 + 0.8 * ease.back(k));
        burstFlash = 1 - k;
        halo.scale.setScalar(2.8 - k * 1.8);
      }, ease.out);
      burstFlash = 0;
      halo.material.opacity = 0;
    },

    async hop(seq, ctx, to) {
      const from = pet.position.clone();
      const [x, z] = to;
      ctx.burst.emit(worldOf(pet, 0, 0.1, 0), { count: 12, color: 0xd8b880, speed: 1.2, up: 0.5, gravity: -2 });
      await seq.tween(420, (k) => {
        pet.position.set(from.x + (x - from.x) * k, Math.sin(k * Math.PI) * 0.9, from.z + (z - from.z) * k);
        ruffin.scale.x = x < from.x ? -1 : 1;
      }, ease.sine);
      pet.position.y = 0;
    },

    async capture(seq, ctx) {
      coin.visible = true;
      const at = worldOf(pet, 0, 0.6, 0.2);
      ctx.burst.emit(at, { count: 60, color: 0xffd040, speed: 2.6, up: 1.5, gravity: -2 });
      ctx.floaters.pop('Captured!', worldOf(pet, 0, 1.6, 0), 'good');
      await seq.tween(420, (k) => {
        coin.position.set(pet.position.x, 1.5 + k * 0.4, pet.position.z + 0.2);
        coin.scale.setScalar(0.2 + 0.8 * ease.back(k));
        coin.rotation.y = k * Math.PI * 2;
      }, ease.out);
      await seq.wait(450);
      await seq.tween(260, (k) => { coin.material.opacity = 1 - k; }, ease.in);
      coin.visible = false;
      coin.material.opacity = 1;
      await prop.hop(seq, ctx, rest());
      ruffin.scale.x = 1;
    },

    update(dt, t) {
      if (prop.phase === 'egg') {
        halo.material.opacity = 0.3 + 0.12 * Math.sin(t * 2.4);
        egg.position.y = Math.abs(Math.sin(t * 1.3)) * 0.02;
      } else if (burstFlash) {
        halo.material.opacity = burstFlash;
      }
      if (prop.phase === 'joined' && pet.position.y === 0) ruffin.position.y = Math.abs(Math.sin(t * 2.6)) * 0.05;
    },

    reset() {
      prop.phase = 'egg';
      prop.taps = 0;
      setSpriteTexture(egg, tex('pet/egg-1'));
      egg.visible = true;
      egg.rotation.z = 0;
      pet.visible = false;
      pet.position.set(0, 0, 0);
      pet.scale.setScalar(1);
      ruffin.scale.x = 1;
      ruffin.position.y = 0;
      coin.visible = false;
      halo.scale.setScalar(1);
      halo.material.opacity = 0.35;
      burstFlash = 0;
    },

    /** The egg drives its own flow: hatch, then a five-tap catch, then the pet panel. */
    async click(ctx, el) {
      if (prop.phase === 'egg') {
        prop.phase = 'hatching';
        ctx.clearView();
        const article = document.getElementById('spot-egg');
        ctx.caption.show(`${article.querySelector('h3').textContent} ${article.querySelector('p').textContent}`);
        await ctx.run((seq) => prop.hatch(seq, ctx));
        prop.phase = 'catch';
        prop.taps = 0;
        ctx.catchMode(true, () => prop.finish(ctx));
        return;
      }
      if (prop.phase === 'catch') {
        prop.taps += 1;
        if (prop.taps >= CATCH_TAPS) { prop.finish(ctx); return; }
        ctx.catchProgress(prop.taps, CATCH_TAPS);
        await ctx.run((seq) => prop.hop(seq, ctx, spot(prop.taps)));
        return;
      }
      if (prop.phase === 'joined') {
        ctx.openSpot('spot-pet', prop, el);
        await ctx.run((seq) => prop.hop(seq, ctx, rest()));
      }
    },

    async finish(ctx) {
      if (prop.phase !== 'catch') return;
      prop.phase = 'joined';
      prop.taps = CATCH_TAPS;
      ctx.catchMode(false);
      ctx.petJoined(prop);
      await ctx.run((seq) => prop.capture(seq, ctx));
      ctx.openSpot('spot-pet', prop, null);
    },
  };
  return prop;
}

function decorateDesert(room) {
  const { W } = room.size;
  addSprite(room, 'env/desert-pillar', { height: 6.4, glow: 0.35 }, [-W / 2 + 0.55, 0, 1.4]);
  addSprite(room, 'env/desert-pillar', { height: 6.4, glow: 0.35 }, [W / 2 - 0.55, 0, 1.4]);
  addSprite(room, 'env/desert-sarcophagus', { height: 2.7, glow: 0.4 }, [-W / 2 + 1.5, 0, 0.45]);
  addSprite(room, 'env/desert-vase', { height: 1.2, glow: 0.4 }, [W / 2 - 1.5, 0, 0.6]);
  addSprite(room, 'env/desert-vase2', { height: 1.5, glow: 0.4 }, [W / 2 - 0.75, 0, 4.2], -Math.PI / 2);
  addSprite(room, 'env/desert-vase', { height: 1.0, glow: 0.4 }, [-W / 2 + 0.75, 0, 5.4], Math.PI / 2);
  for (const x of [-W / 2 + 1.6, W / 2 - 1.6]) {
    addSprite(room, 'env/desert-bowl', { height: 0.42, glow: 0.45 }, [x, 0, 6.5]);
    const fire = glowQuad(1.5, 0xff8a30, 0.7);
    fire.position.set(x, 0.7, 6.5);
    room.group.add(fire);
    room.updaters.push((dt, t) => {
      fire.material.opacity = 0.55 + 0.2 * Math.sin(t * 9 + x) + 0.1 * Math.sin(t * 23);
      fire.scale.y = 1 + 0.1 * Math.sin(t * 7 + x);
    });
  }
  lightShaft(room, 'env/light-1', [-2.6, 3.8, 0.8], 5.2, 0xffe2b0, 0.3);
  lightShaft(room, 'env/light-4', [2.8, 3.8, 0.8], 5.2, 0xffe2b0, 0.26);
}

/* ------------------------------------------------------------------ */
/* Room definitions                                                     */
/* ------------------------------------------------------------------ */

const FOREST = [
  'env/forest-wallfloor', 'env/forest-wallroom', 'env/door-frame', 'env/door-leaf', 'env/pillar', 'env/grass',
  'env/grass2', 'env/rock', 'env/light-2', 'env/light-3',
];

export const ROOMS = [
  {
    id: 'battle',
    theme: 'forest',
    size: { W: 12, H: 5.5, D: 12 },
    fit: { landscape: [13, 7.2], portrait: [4.6, 6] },
    eye: 1.75, look: 1.75, eyeP: 2.2, lookP: 2.2,
    door: 'door', doorSize: DOOR_SIZE, doorLabel: 'Go deeper',
    floorTint: 0xd8d0c8,
    motes: { count: 70, color: 0x9dffb0, size: 0.07, rise: 0.12, sway: 0.5, twinkle: true },
    lights: {
      keyL: [-4.4, 3.6, 3, 0xffa860, 30],
      keyR: [4.4, 3.6, 3, 0xff9a50, 30],
      accent: [0, 4.6, 6, 0x8fd8b0, 14],
      door: [0, 2.4, 1.3, 0xffc070, 16],
    },
    assets: [
      ...FOREST, 'monsters/nightfang', 'monsters/grimboar', 'cards/1100', 'cards/1200', 'cards/1300',
      'cards/3000', 'cards/5100', 'loot/coin', 'loot/potion-heal', 'loot/helmet', 'cards/10500', 'loot/chest', 'loot/chest-open',
      'loot/torch', 'loot/bandage', 'loot/bomb', 'loot/provision', 'loot/escape', 'loot/luck', 'env/spikes',
      'env/mist-0', 'env/mist-1',
    ],
    decorate: decorateBattle,
    props(room) {
      const boar = grimboarDecor();
      return [boar, monsterProp(), handProp(room, boar.object), lootPileProp()];
    },
    coach: 'hand',
  },
  {
    id: 'cards',
    theme: 'forest',
    size: { W: 12, H: 5.5, D: 12 },
    fit: { landscape: [13, 7.2], portrait: [4.6, 6] },
    eye: 1.75, look: 1.85, eyeP: 2.2, lookP: 2.3,
    door: 'door', doorSize: DOOR_SIZE, doorLabel: 'Go deeper',
    wallTint: 0xb8c0e0,
    floorTint: 0xb0b8d8,
    motes: { count: 90, color: 0x9fc8ff, size: 0.06, rise: 0.18, sway: 0.4, twinkle: true },
    lights: {
      keyL: [-4.4, 3.4, 3, 0x7fa8ff, 30],
      keyR: [4.4, 3.4, 3, 0xb486ff, 30],
      accent: [0, 4.4, 5, 0xffe0b0, 12],
      door: [0, 2.4, 1.3, 0xffc070, 16],
    },
    assets: [
      ...FOREST, 'cards/back', 'cards/10500', 'cards/11800', 'cards/14100', 'cards/15500', 'cards/16500',
      'cards/18700', 'cards/19000', 'cards/20400', 'cards/1000000', 'ui/star', 'ui/star-empty',
    ],
    decorate: (room) => decorateForest(room, { shaftColor: 0xa8c8ff, shaftOpacity: 0.36 }),
    props: () => [altarProp(), galleryProp(), awakenProp()],
  },
  {
    id: 'forge',
    theme: 'forest',
    size: { W: 12, H: 5.5, D: 12 },
    fit: { landscape: [13, 7.2], portrait: [4.6, 6] },
    eye: 1.75, look: 1.95, eyeP: 2.2, lookP: 2.3,
    // The room title drops below the equipment rack hanging over the door.
    titleBelow: 'rack',
    door: 'door', doorSize: DOOR_SIZE, doorLabel: 'Climb the stairs', rise: 1.2,
    wallTint: 0xe8d0c0,
    motes: { count: 80, color: 0xffa040, size: 0.06, rise: 0.5, sway: 0.2 },
    // Near-white keys so the painted characters keep their own colours.
    lights: {
      keyL: [-3.4, 2.4, 3.4, 0xffd6b0, 20],
      keyR: [3.6, 3.2, 3.2, 0xffe0c4, 17],
      accent: [4.2, 2.4, 2.4, 0xc8ecd0, 4],
      door: [0, 2.4, 1.3, 0xffc890, 12],
    },
    assets: [
      ...FOREST, 'forge/blacksmith-place', 'forge/apothecary-place', 'forge/ingredient-1', 'forge/ingredient-2', 'forge/ingredient-3', 'loot/potion-heal',
      'loot/helmet', 'loot/armour', 'loot/shield', 'loot/amulet', 'loot/boots',
    ],
    decorate: (room) => decorateForest(room, { shaftColor: 0xffc890, shaftOpacity: 0.3 }),
    props: () => [blacksmithProp(), rackProp(), apothecaryProp()],
  },
  {
    id: 'events',
    theme: 'desert',
    size: { W: 14, H: 6.5, D: 12 },
    fit: { landscape: [14.6, 7.8], portrait: [4.9, 6.4] },
    eye: 1.85, look: 2.0, eyeP: 2.3, lookP: 2.4,
    door: 'portal', doorSize: 3.7, doorLabel: 'Enter the portal',
    ceilingTint: 0x8a7a68,
    motes: { count: 70, color: 0xffd8a0, size: 0.05, rise: 0.08, sway: 0.6 },
    lights: {
      keyL: [-4.8, 4, 3.5, 0xffb070, 32],
      keyR: [4.8, 4, 3.5, 0xffb070, 32],
      accent: [0, 2.6, 1.6, 0xc8d8ff, 18],
      door: [-3.9, 2.6, 3.6, 0xff4a3a, 10],
    },
    assets: [
      'env/desert-wallfloor', 'env/desert-ceiling', 'env/home-portal-smoke', 'env/home-portal-swirl', 'env/home-portal-glow',
      'env/desert-pillar', 'env/desert-vase',
      'env/desert-vase2', 'env/desert-sarcophagus', 'env/desert-bowl', 'env/light-1', 'env/light-4',
      'env/forest-wallfloor', 'monsters/worldboss', 'events/dragon-tower', 'events/victory-stack', 'pet/egg-1',
      'pet/egg-2', 'pet/egg-3', 'pet/ruffin', 'pet/ruffin-coin',
    ],
    decorate: decorateDesert,
    props: () => [
      bossProp(),
      bannerProp('tower', 'spot-tower', 'Dragon Tower', 'events/dragon-tower', '#6b1424', [3.15, 4.3, 0.1], [-1.15, 5.7, 0.1, 0.72]),
      bannerProp('stack', 'spot-stack', 'Victory Stack', 'events/victory-stack', '#1c3f6b', [5.0, 4.3, 0.1], [1.15, 5.7, 0.1, 0.72]),
      eggProp(),
    ],
  },
];
