// Adapted from github.com/mromidev/claude-animated-shorts @e3b817b templates/bridge/build.ts + world.ts (kit props; MIT).
// Model kits: GLB models from the asset library, placed scaled to a height with their base on the ground, either
// merged into a static Batch (cheap) or cloned as their own objects (to animate). Materials become two-tone and can
// be recoloured by material name; names in `asVeg` are drawn as stylised vegetation instead of the model.
import * as THREE from "three";
import type { Ctx } from "../film";
import { V, Batch } from "./geo";
import { twoToneObject, type Recolor } from "../look/materials";
import { addVeg, vegRad, type VegKind } from "./vegetation";
import { blocked, type Ray } from "./sight";

export type Kit = { models: Record<string, THREE.Object3D>; recolor: Recolor; asVeg: Record<string, VegKind>; key: string };

/** load models of one approved library version: files = { name: "file.glb" } */
export async function loadKit(ctx: Ctx, id: string, version: number, files: Record<string, string>, o: { recolor?: Recolor; asVeg?: Record<string, VegKind> } = {}): Promise<Kit> {
  const models: Record<string, THREE.Object3D> = {};
  await Promise.all(Object.entries(files).map(async ([name, file]) => { models[name] = await ctx.loadGLTF(ctx.lib(id, version, file)); }));
  return { models, recolor: o.recolor ?? {}, asVeg: o.asVeg ?? {}, key: `${id}@${version}` };
}

const boxes = new WeakMap<THREE.Object3D, THREE.Box3>();
const bbox = (o: THREE.Object3D) => { let b = boxes.get(o); if (!b) { b = new THREE.Box3().setFromObject(o); boxes.set(o, b); } return b; };

/** merge a kit model into a batch, base at y, height h (skipped if it blocks a sight line). Returns false if skipped. */
export function prop(b: Batch, kit: Kit, name: string, x: number, y: number, z: number, h: number, yaw = 0, sight: Ray[] = [], seed = 0) {
  const vk = kit.asVeg[name];
  if (vk) {
    const r = vegRad(vk, h);
    if (sight.length && blocked(sight, x - r, x + r, y, y + h, z - r, z + r, true)) return false;
    addVeg(b, vk, x, y, z, h, seed || x * 92.7 + z * 31.3 + yaw * 1000, 0);
    return true;
  }
  const o = kit.models[name];
  if (!o) throw new Error(`kit ${kit.key} has no model ${name}`);
  const box = bbox(o);
  const s = h / Math.max(0.01, box.max.y - box.min.y), r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * s * 0.5;
  if (sight.length && blocked(sight, x - r, x + r, y, y + h, z - r, z + r, true)) return false;
  b.addObject(o, new THREE.Matrix4().compose(V(x, y - box.min.y * s, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(s, s, s)), kit.recolor, kit.key);
  return true;
}

/** a kit model as its own object (base at y = 0, height h), for things that move or frame the lens */
export function kitClone(kit: Kit, name: string, h: number): THREE.Object3D {
  const vk = kit.asVeg[name];
  if (vk) {
    const vb = new Batch(), grp = new THREE.Group();
    addVeg(vb, vk, 0, 0, 0, h, name.length * 977 + h * 131, 0);
    vb.build(grp, false);
    grp.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = true; } });
    return grp;
  }
  const o = kit.models[name];
  if (!o) throw new Error(`kit ${kit.key} has no model ${name}`);
  const box = bbox(o), s = h / Math.max(0.01, box.max.y - box.min.y);
  const c = twoToneObject(o.clone(true), kit.recolor, kit.key);
  c.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  const g = new THREE.Group();
  c.position.y = -box.min.y * s; c.scale.setScalar(s);
  g.add(c);
  return g;
}
