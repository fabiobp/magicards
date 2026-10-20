import { Group, Mesh, PlaneGeometry, MeshLambertMaterial, Color, Vector3, Box3 } from 'three';
import { tex } from './assets.js';
import { Door, Portal } from './door.js';
import { Motes } from './fx.js';

export const CORRIDOR = 3;

// UV regions of the game's room atlas (read from the dungeon FBX).
const FLOOR = { u0: 0, u1: 1, v0: 0.422, v1: 0.994 };
const WALL = { u0: 0, u1: 1, v0: 0, v1: 0.417 };
const WALL_LEFT = { u0: 0, u1: 0.5, v0: 0, v1: 0.417 };
const WALL_RIGHT = { u0: 0.5, u1: 1, v0: 0, v1: 0.417 };
const VINES = { u0: 0, u1: 1, v0: 0.367, v1: 0.584 };

/** Plane whose UVs sample a sub-rectangle of an atlas. */
function regionPlane(w, h, r) {
  const g = new PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
  }
  return g;
}

/**
 * A wall spanning x ∈ [-W/2, W/2], y ∈ [0, H] with an optional rectangular hole.
 * Each piece maps its share of the region so the texture stays continuous.
 */
function wall(W, H, region, material, hole) {
  const group = new Group();
  const piece = (x0, x1, y0, y1) => {
    if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3) return;
    const g = new PlaneGeometry(x1 - x0, y1 - y0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getX(i) + W / 2) / W;
      const v = pos.getY(i) / H;
      uv.setXY(i, region.u0 + u * (region.u1 - region.u0), region.v0 + v * (region.v1 - region.v0));
    }
    group.add(new Mesh(g, material));
  };
  if (!hole) {
    piece(-W / 2, W / 2, 0, H);
  } else {
    piece(-W / 2, hole.x0, 0, H);
    piece(hole.x1, W / 2, 0, H);
    piece(hole.x0, hole.x1, hole.y1, H);
  }
  return group;
}

const lambert = (map, color = 0xffffff) => new MeshLambertMaterial({ map, color: new Color(color) });

/**
 * One dungeon room: floor, walls, ceiling, the door (or exit portal), the
 * corridor behind it, decoration and the interactive props from content.
 */
export class Room {
  constructor(def, index, origin) {
    this.def = def;
    this.index = index;
    this.group = new Group();
    this.group.position.copy(origin);
    this.props = [];
    this.updaters = [];
    this.built = false;
  }

  get size() { return this.def.size; }

  build(nextRise = 0, entryHole = null) {
    const { W, H, D } = this.def.size;
    const theme = this.def.theme;
    const atlas = tex(`env/${theme}-wallfloor`);
    const wallMat = lambert(atlas, this.def.wallTint ?? 0xffffff);
    const floorMat = lambert(atlas, this.def.floorTint ?? 0xffffff);

    const floor = new Mesh(regionPlane(W, D, FLOOR), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, D / 2);
    this.group.add(floor);

    this.door = this.def.door === 'portal' ? new Portal(this.def.doorSize) : new Door(this.def.doorSize);
    this.group.add(this.door.group);

    this.group.add(wall(W, H, WALL, wallMat, this.door.hole));

    const left = wall(D, H, WALL_LEFT, wallMat);
    left.rotation.y = Math.PI / 2;
    left.position.set(-W / 2, 0, D / 2);
    const right = wall(D, H, WALL_RIGHT, wallMat);
    right.rotation.y = -Math.PI / 2;
    right.position.set(W / 2, 0, D / 2);
    this.group.add(left, right);

    const ceilingMap = theme === 'desert' ? tex('env/desert-ceiling') : atlas;
    const ceiling = new Mesh(theme === 'desert' ? new PlaneGeometry(W, D) : regionPlane(W, D, WALL),
      lambert(ceilingMap, this.def.ceilingTint ?? 0x3a3440));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, H, D / 2);
    this.group.add(ceiling);

    if (entryHole) {
      const front = wall(W, H, WALL, wallMat, entryHole);
      front.position.z = D;
      this.group.add(front);
    }

    if (theme === 'forest') this.addVines(W, H, D);
    if (this.door.hole) this.addCorridor(wallMat, floorMat, nextRise);

    if (this.def.motes) {
      const m = this.def.motes;
      this.motes = new Motes({
        ...m,
        box: new Box3(new Vector3(-W / 2 + 0.5, 0.2, 0.5), new Vector3(W / 2 - 0.5, H - 0.3, D - 1)),
      });
      this.group.add(this.motes.points);
    }

    this.def.decorate?.(this);
    this.built = true;
  }

  addVines(W, H, D) {
    const map = tex('env/forest-wallroom');
    const material = new MeshLambertMaterial({ map, transparent: true, alphaTest: 0.1, color: 0xbfc9bf });
    const h = 1.6;
    const back = new Mesh(regionPlane(W, h, VINES), material);
    back.position.set(0, H - h / 2 + 0.05, 0.06);
    const left = new Mesh(regionPlane(D, h, { ...VINES, u1: 0.8 }), material);
    left.rotation.y = Math.PI / 2;
    left.position.set(-W / 2 + 0.06, H - h / 2 + 0.05, D / 2);
    const right = new Mesh(regionPlane(D, h, { ...VINES, u0: 0.2 }), material);
    right.rotation.y = -Math.PI / 2;
    right.position.set(W / 2 - 0.06, H - h / 2 + 0.05, D / 2);
    this.group.add(back, left, right);
  }

  /** Short tunnel behind the door; its floor ramps up when the next room is higher. */
  addCorridor(wallMat, floorMat, rise) {
    const { x0, x1, y1 } = this.door.hole;
    const w = x1 - x0 + 0.02;
    const cx = (x0 + x1) / 2;
    const h = y1 + Math.max(0, rise) + 0.1;
    const corridor = new Group();
    const slope = Math.hypot(CORRIDOR, rise);

    const floor = new Mesh(regionPlane(w, slope, { u0: 0.42, u1: 0.58, v0: 0.45, v1: 0.75 }), floorMat);
    floor.rotation.x = -Math.PI / 2 + Math.atan2(rise, CORRIDOR);
    floor.position.set(cx, rise / 2, -CORRIDOR / 2);

    const sideRegion = { u0: 0.3, u1: 0.55, v0: 0, v1: 0.417 };
    const l = new Mesh(regionPlane(CORRIDOR, h, sideRegion), wallMat);
    l.rotation.y = Math.PI / 2;
    l.position.set(x0, h / 2, -CORRIDOR / 2);
    const r = new Mesh(regionPlane(CORRIDOR, h, sideRegion), wallMat);
    r.rotation.y = -Math.PI / 2;
    r.position.set(x1, h / 2, -CORRIDOR / 2);
    const top = new Mesh(new PlaneGeometry(w, CORRIDOR), new MeshLambertMaterial({ color: 0x0c0a10 }));
    top.rotation.x = Math.PI / 2;
    top.position.set(cx, h, -CORRIDOR / 2);
    corridor.add(floor, l, r, top);
    this.corridor = corridor;
    this.group.add(corridor);
  }

  addProp(prop) {
    this.props.push(prop);
    this.group.add(prop.object);
    for (const mesh of prop.pickables) mesh.userData.prop = prop;
  }

  /** Camera pose that frames the room for the current viewport. */
  cameraPose(stage, out = { pos: new Vector3(), look: new Vector3() }) {
    const { D } = this.def.size;
    const portrait = stage.portrait;
    const [fitW, fitH] = portrait ? this.def.fit.portrait : this.def.fit.landscape;
    const d = stage.distanceFor(fitW, fitH, D - 0.6);
    const o = this.group.position;
    out.pos.set(0, o.y + (portrait ? this.def.eyeP : this.def.eye), o.z + d);
    out.look.set(0, o.y + (portrait ? this.def.lookP : this.def.look), o.z);
    return out;
  }

  layout(stage, pose) {
    for (const p of this.props) p.layout?.(stage.portrait, pose, stage);
  }

  /** Keeps camera-anchored props (the hand) in view while the camera leans. */
  follow(stage) {
    for (const p of this.props) if (p.follow) p.layout(stage.portrait, stage.pose, stage);
  }

  update(dt, t) {
    this.door?.update(dt, t);
    this.motes?.update(dt, t);
    for (const fn of this.updaters) fn(dt, t);
    for (const p of this.props) p.update?.(dt, t);
  }

  reset() {
    this.door?.reset();
    for (const p of this.props) p.reset?.();
  }
}
