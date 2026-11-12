// Ported from github.com/mromidev/claude-animated-shorts @e3b817b templates/bridge/build.ts (materials) (MIT, see THIRD_PARTY.md).
// Shared, cached two-tone materials, and conversion of imported (GLB) materials to the same lighting model so the
// whole world shades consistently. Recolouring by material name lets one kit serve many palettes.
import * as THREE from "three";
import { twoTone } from "./shade";

const mats = new Map<string, THREE.Material>();
/** cached two-tone Lambert material by key (make() runs once per key) */
export const lam = (key: string, make: () => THREE.MeshLambertMaterialParameters) => {
  let m = mats.get(key) as THREE.MeshLambertMaterial | undefined;
  if (!m) { m = twoTone(new THREE.MeshLambertMaterial(make())); mats.set(key, m); }
  return m;
};
/** cached two-tone Phong (keeps a soft specular, masked by the shadow): painted metal, glazed tiles */
export const phong = (key: string, make: () => THREE.MeshPhongMaterialParameters) => {
  let m = mats.get(key) as THREE.MeshPhongMaterial | undefined;
  if (!m) { m = twoTone(new THREE.MeshPhongMaterial(make())); mats.set(key, m); }
  return m;
};

/** material name -> colour, or a list of colours used in turn (variety across instances) */
export type Recolor = Record<string, string | string[]>;
const conv = new Map<string, THREE.MeshLambertMaterial>();
let turn = 0;
/** imported material -> two-tone Lambert (cached per source material and palette) */
export const toTwoTone = (m: THREE.Material, recolor: Recolor = {}, paletteKey = "") => {
  const key = m.uuid + "|" + paletteKey;
  let l = conv.get(key);
  if (!l) {
    const s = m as THREE.MeshStandardMaterial;
    const rc = recolor[m.name];
    const col = Array.isArray(rc) ? rc[turn++ % rc.length] : rc;
    l = twoTone(new THREE.MeshLambertMaterial({ color: col ? new THREE.Color(col) : s.color?.clone() ?? new THREE.Color("#ffffff"),
      map: s.map ?? null, side: s.side, alphaTest: s.alphaTest, transparent: s.transparent, opacity: s.opacity }));
    l.name = m.name;
    conv.set(key, l);
  }
  return l;
};

/** convert every mesh material of an object in place (returns the object) */
export const twoToneObject = <T extends THREE.Object3D>(o: T, recolor: Recolor = {}, paletteKey = "") => {
  o.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((x) => toTwoTone(x, recolor, paletteKey)) : toTwoTone(mesh.material, recolor, paletteKey);
  });
  return o;
};
