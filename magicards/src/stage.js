import {
  WebGLRenderer, Scene, PerspectiveCamera, Fog, Color, Vector3, Vector2, Raycaster, HemisphereLight, PointLight,
} from 'three';
import { alphaAt } from './assets.js';
import { clamp, lerp } from './tween.js';

const BG = 0x07060c;
const ndc = new Vector2();
const tmp = new Vector3();

const idle = () => new Promise((resolve) => {
  if (window.requestIdleCallback) requestIdleCallback(resolve, { timeout: 200 });
  else setTimeout(resolve, 16);
});

/** Renderer, camera rig, light rig, frame loop and pointer picking. */
export class Stage {
  constructor(canvas) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(BG);
    this.scene = new Scene();
    this.scene.background = new Color(BG);
    this.scene.fog = new Fog(BG, 11, 27);
    this.camera = new PerspectiveCamera(48, 1, 0.08, 90);
    this.pose = { pos: new Vector3(0, 2.3, 8), look: new Vector3(0, 1.8, 0) };
    this.offset = { x: 0, y: 0 };
    this.shakeAmp = 0;
    this.updaters = new Set();
    this.onResize = new Set();
    this.raycaster = new Raycaster();
    this.running = false;
    this.loop = this.loop.bind(this);

    this.hemi = new HemisphereLight(0x8f86c8, 0x1c140c, 1.1);
    this.scene.add(this.hemi);
    // Fixed light count: moving these between rooms avoids shader recompiles.
    this.lights = {
      keyL: new PointLight(0xffffff, 0, 16, 1.4),
      keyR: new PointLight(0xffffff, 0, 16, 1.4),
      accent: new PointLight(0xffffff, 0, 14, 1.4),
      door: new PointLight(0xffffff, 0, 9, 1.6),
      carry: new PointLight(0xffd9a8, 0, 7, 1.5),
    };
    for (const l of Object.values(this.lights)) this.scene.add(l);

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  get width() { return this.renderer.domElement.clientWidth || innerWidth; }
  get height() { return this.renderer.domElement.clientHeight || innerHeight; }
  get aspect() { return this.width / this.height; }
  get portrait() { return this.aspect < 0.85; }

  fovFor(a) { return a >= 1 ? 48 : lerp(66, 50, clamp((a - 0.45) / 0.55, 0, 1)); }

  /** Distance from the back wall at which a fitWidth × fitHeight window fits the view. */
  distanceFor(fitWidth, fitHeight, maxDistance) {
    const half = Math.tan((this.camera.fov * Math.PI) / 360);
    const d = Math.max(fitWidth / 2 / (half * this.camera.aspect), fitHeight / 2 / half);
    return clamp(d, 5.4, maxDistance);
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, w < 900 ? 1.5 : 1.75));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = this.fovFor(w / h);
    this.camera.updateProjectionMatrix();
    for (const fn of this.onResize) fn();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  stop() { this.running = false; }

  /**
   * Compiles the shaders and uploads the textures of `object` before its first frame, one texture
   * per idle slot, so showing it later does not stall on GPU uploads.
   */
  async warm(object) {
    const shown = object.visible;
    object.visible = true;
    this.renderer.compile(object, this.camera, this.scene);
    object.visible = shown;
    const textures = new Set();
    object.traverse((o) => {
      if (o.material) for (const value of Object.values(o.material)) if (value?.isTexture) textures.add(value);
    });
    for (const texture of textures) {
      await idle();
      this.renderer.initTexture(texture);
    }
  }

  loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const t = now / 1000;
    for (const fn of this.updaters) fn(dt, t);
    this.applyCamera(t);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  }

  applyCamera(t) {
    const c = this.camera;
    c.position.copy(this.pose.pos);
    if (this.shakeAmp > 0.001) {
      c.position.x += Math.sin(t * 61) * this.shakeAmp;
      c.position.y += Math.cos(t * 47) * this.shakeAmp * 0.7;
      this.shakeAmp *= 0.9;
    }
    c.lookAt(this.pose.look);
    const { x, y } = this.offset;
    const w = this.width;
    const h = this.height;
    if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) c.setViewOffset(w, h, x, y, w, h);
    else if (c.view?.enabled) c.clearViewOffset();
    this.lights.carry.position.copy(c.position);
  }

  shake(amount) { this.shakeAmp = Math.max(this.shakeAmp, amount); }

  /** Screen position (CSS px) of a world point; z > 1 means behind the camera. */
  project(world, out = { x: 0, y: 0, visible: false }) {
    tmp.copy(world).project(this.camera);
    out.x = (tmp.x * 0.5 + 0.5) * this.width;
    out.y = (-tmp.y * 0.5 + 0.5) * this.height;
    out.visible = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
    return out;
  }

  /** World point `distance` along the camera ray through a screen position (CSS px). */
  rayPoint(x, y, distance, out = new Vector3()) {
    const c = this.camera;
    c.updateMatrixWorld();
    out.set((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1, 0.5).unproject(c);
    return out.sub(c.position).normalize().multiplyScalar(distance).add(c.position);
  }

  /** First mesh under the pointer whose texture is opaque at the hit point. */
  pick(clientX, clientY, meshes) {
    ndc.set((clientX / this.width) * 2 - 1, -(clientY / this.height) * 2 + 1);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(ndc, this.camera);
    for (const hit of this.raycaster.intersectObjects(meshes, false)) {
      const texture = hit.object.userData.texture;
      if (!texture || !hit.uv || alphaAt(texture, hit.uv.x, hit.uv.y) > 0.25) return hit.object;
    }
    return null;
  }
}
