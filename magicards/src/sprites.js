import {
  Mesh, PlaneGeometry, MeshLambertMaterial, MeshBasicMaterial, AdditiveBlending, NormalBlending, DoubleSide, Color,
} from 'three';
import { tex } from './assets.js';

const WHITE = new Color(0xffffff);

/**
 * A flat 2.5D sprite facing +Z, sized from the texture aspect.
 * Lit sprites keep part of their own colour as emission so the art stays
 * readable in dark rooms; `glow` is that base emission and drives highlights.
 * `unlit` sprites ignore the room lights and blend normally (light art that must not wash out).
 */
export function sprite(name, {
  height, width, anchor = 'bottom', glow = 0.5, additive = false, unlit = false, opacity = 1,
  color = WHITE, map = null, doubleSide = false, depthWrite,
} = {}) {
  const texture = map ?? tex(name);
  const aspect = texture.image.width / texture.image.height;
  const h = height ?? width / aspect;
  const w = width ?? h * aspect;
  const geometry = new PlaneGeometry(w, h);
  if (anchor === 'bottom') geometry.translate(0, h / 2, 0);

  const material = additive || unlit
    ? new MeshBasicMaterial({
      map: texture, color, transparent: true, opacity, depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    })
    : new MeshLambertMaterial({
      map: texture, color, transparent: true, opacity, alphaTest: 0.04,
      emissive: WHITE, emissiveMap: texture, emissiveIntensity: glow, depthWrite: depthWrite ?? true,
    });
  if (doubleSide) material.side = DoubleSide;

  const mesh = new Mesh(geometry, material);
  mesh.userData.texture = texture;
  mesh.userData.size = { w, h };
  mesh.userData.baseGlow = glow;
  return mesh;
}

/** Swaps the art of a lit sprite while keeping its height. */
export function setSpriteTexture(mesh, texture) {
  const m = mesh.material;
  m.map = texture;
  if (m.emissiveMap) m.emissiveMap = texture;
  m.needsUpdate = true;
  mesh.userData.texture = texture;
}

export function setOpacity(object, value) {
  object.traverse((o) => { if (o.material) o.material.opacity = value; });
}
