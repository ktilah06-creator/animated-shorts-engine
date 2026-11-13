// Realistic stylised buildings (engine-owned, PBR): walls (plaster or stone), stone plinth, gable roof with overhang and
// thickness (slate or clay tiles), chimney, recessed windows with frames, glass and shutters, a door with a frame and a
// step, timber corner boards. Everything goes into a Batch (one draw call per material).
//   building(batch, { x, z, yaw, w, d, h, wall: "plaster", roof: "slate", seed })
import * as THREE from "three";
import { V, Batch, boxGeo } from "./geo";
import { pbr } from "../look/pbr";

export type BuildingOpts = {
  x: number; z: number; y?: number; yaw?: number; w: number; d: number; h: number;
  wall?: "plaster" | "stone"; roof?: "slate" | "tiles"; seed?: number;
  wallTint?: string; shutter?: string; windowsPerFloor?: number; floors?: number; lit?: number;
};

const rnd = (s: number) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

export function building(b: Batch, o: BuildingOpts) {
  const r = rnd((o.seed ?? 1) * 7919 + 13);
  const y0 = o.y ?? 0, W = o.w, D = o.d, H = o.h, floors = o.floors ?? Math.max(1, Math.round(H / 3)), wpf = o.windowsPerFloor ?? Math.max(1, Math.round(W / 2.4));
  const M = new THREE.Matrix4().makeRotationY(o.yaw ?? 0).setPosition(o.x, y0, o.z);
  const add = (g: THREE.BufferGeometry, m: THREE.Material, local = new THREE.Matrix4()) => b.add(g, m, M.clone().multiply(local));
  const wallMat = pbr(o.wall ?? "plaster", [W / 3, H / 3], o.wallTint ? { color: o.wallTint } : {});
  const stoneMat = pbr("stone", [W / 2.5, 0.5]);
  const roofMat = pbr(o.roof ?? "slate", [W / 2.2, D / 2.6]);
  const wood = pbr("wood", [1, 1], { color: "#c9b8a4" });
  const trimWood = pbr("wood", [0.3, 2], { color: "#7a6a5a" });
  const shutter = pbr("wood", [0.5, 1], { color: o.shutter ?? ["#3f5a6e", "#4e6b45", "#7a3d2e", "#5a5560"][Math.floor(r() * 4)] });
  const glass = new THREE.MeshStandardMaterial({ color: "#1c2630", roughness: 0.08, metalness: 0.0, emissive: new THREE.Color("#ffb46a"), emissiveIntensity: (o.lit ?? 0) * (r() < 0.5 ? 1 : 0.2) });
  // plinth + walls
  add(boxGeo(V(-W / 2 - 0.08, 0, -D / 2 - 0.08), V(W / 2 + 0.08, 0.6, D / 2 + 0.08)), stoneMat);
  add(boxGeo(V(-W / 2, 0.6, -D / 2), V(W / 2, H, D / 2)), wallMat);
  // corner boards
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(boxGeo(V(-0.09, 0.6, -0.09), V(0.09, H, 0.09)), trimWood, new THREE.Matrix4().makeTranslation(sx * W / 2, 0, sz * D / 2));
  // gable roof: two slabs with thickness and overhang, plus gable wall triangles
  const pitch = 0.62, ov = 0.45, rise = (D / 2) * Math.tan(pitch), slabL = (D / 2 + ov) / Math.cos(pitch);
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(W + 2 * ov, 0.18, slabL);
    const m = new THREE.Matrix4().makeTranslation(0, H + rise / 2 - Math.sin(pitch) * ov / 2 + 0.05, s * (D / 4 - ov / 2 * Math.cos(pitch) * 0 + 0) + s * (-ov / 2) + s * (ov / 2))
      .multiply(new THREE.Matrix4().makeRotationX(s * pitch))
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, s * (slabL / 2 - (D / 2 + ov) / Math.cos(pitch) / 2)));
    add(g, roofMat, new THREE.Matrix4().makeTranslation(0, 0, s * (D / 4)).multiply(new THREE.Matrix4().makeTranslation(0, H + rise / 2 + 0.06, 0)).multiply(new THREE.Matrix4().makeRotationX(s * pitch)));
    void m;
  }
  const tri = new THREE.Shape(); tri.moveTo(-D / 2, 0); tri.lineTo(D / 2, 0); tri.lineTo(0, rise); tri.closePath();
  const gable = new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: false });
  for (const sx of [-1, 1]) add(gable, wallMat, new THREE.Matrix4().makeTranslation(sx * (W / 2 - 0.1), H, 0).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)).multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.1)));
  // ridge beam
  add(boxGeo(V(-W / 2 - ov, H + rise - 0.02, -0.12), V(W / 2 + ov, H + rise + 0.16, 0.12)), roofMat);
  // chimney
  const cx = (r() - 0.5) * W * 0.6;
  add(boxGeo(V(cx - 0.35, H + rise * 0.4, -0.35 + D * 0.12), V(cx + 0.35, H + rise + 1.1, 0.35 + D * 0.12)), pbr("stone", [0.4, 0.8], { color: "#a5847a" }));
  add(boxGeo(V(cx - 0.42, H + rise + 1.1, -0.42 + D * 0.12), V(cx + 0.42, H + rise + 1.22, 0.42 + D * 0.12)), stoneMat);
  // windows on the front (+z) and back, per floor; door on the ground floor front
  const doorAt = Math.floor(r() * wpf);
  for (const face of [1, -1]) for (let fl = 0; fl < floors; fl++) for (let i = 0; i < wpf; i++) {
    const wx = -W / 2 + (i + 0.5) * (W / wpf), fy = 0.6 + fl * ((H - 0.6) / floors);
    if (face === 1 && fl === 0 && i === doorAt) {
      // door: frame, recessed planks, step
      add(boxGeo(V(wx - 0.62, fy, D / 2 - 0.02), V(wx + 0.62, fy + 2.35, D / 2 + 0.08)), trimWood);
      add(boxGeo(V(wx - 0.5, fy, D / 2 - 0.06), V(wx + 0.5, fy + 2.2, D / 2 + 0.02)), pbr("wood", [0.6, 1.2], { color: "#8a5a3a" }));
      add(boxGeo(V(wx - 0.8, 0, D / 2 + 0.05), V(wx + 0.8, fy, D / 2 + 0.55)), stoneMat);
      continue;
    }
    const wy = fy + ((H - 0.6) / floors) * 0.32, ww = 0.9, wh = 1.25, z = face * D / 2;
    const T = (lx: number, ly: number, lz: number) => new THREE.Matrix4().makeTranslation(wx + lx, wy + ly, z + face * lz);
    add(new THREE.BoxGeometry(ww + 0.24, wh + 0.24, 0.1), trimWood, T(0, wh / 2, 0.03));                 // frame
    add(new THREE.BoxGeometry(ww, wh, 0.06), glass, T(0, wh / 2, 0.02));                                    // glass (recessed)
    add(new THREE.BoxGeometry(0.06, wh, 0.08), trimWood, T(0, wh / 2, 0.06));                              // mullion
    add(new THREE.BoxGeometry(ww, 0.06, 0.08), trimWood, T(0, wh * 0.55, 0.06));                           // transom
    add(new THREE.BoxGeometry(ww + 0.4, 0.1, 0.22), stoneMat, T(0, -0.05, 0.1));                            // sill
    if (r() < 0.75) for (const sx of [-1, 1]) {                                                              // shutters, open
      add(new THREE.BoxGeometry(ww * 0.52, wh + 0.1, 0.05), shutter, T(sx * (ww * 0.5 + 0.12 + ww * 0.26), wh / 2, 0.08));
    }
  }
}

/** a wooden market stall with a canvas awning, table and goods; returns the table-top centre (local to the batch) */
export function stall(b: Batch, x: number, z: number, yaw: number, cloth: string, goods: "bread" | "veg" | "empty" = "bread", seed = 1) {
  const r = rnd(seed * 31 + 7);
  const M = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
  const add = (g: THREE.BufferGeometry, m: THREE.Material, l = new THREE.Matrix4()) => b.add(g, m, M.clone().multiply(l));
  const wood = pbr("wood", [1, 1], { color: "#b99a7c" });
  add(boxGeo(V(-1.4, 0.88, -0.6), V(1.4, 0.96, 0.6)), wood);
  for (const sx of [-1.3, 1.3]) for (const sz of [-0.5, 0.5]) add(boxGeo(V(sx - 0.05, 0, sz - 0.05), V(sx + 0.05, 2.4, sz + 0.05)), wood);
  const awning = new THREE.MeshStandardMaterial({ color: cloth, roughness: 0.95, side: THREE.DoubleSide });
  add(new THREE.PlaneGeometry(3.1, 1.6, 8, 4).rotateX(-Math.PI / 2 + 0.32), awning, new THREE.Matrix4().makeTranslation(0, 2.45, 0.12));
  if (goods === "bread") {
    const crust = new THREE.MeshStandardMaterial({ color: "#a8692e", roughness: 0.7 });
    const loaf = new THREE.SphereGeometry(0.16, 16, 10).scale(1.4, 0.7, 0.9);
    for (let i = 0; i < 5; i++) add(loaf, crust, new THREE.Matrix4().makeTranslation(-0.9 + i * 0.42, 1.05, (r() - 0.5) * 0.3).multiply(new THREE.Matrix4().makeRotationY(r())));
    add(new THREE.CylinderGeometry(0.35, 0.3, 0.12, 20), pbr("wood", [0.5, 0.5], { color: "#c2a27a" }), new THREE.Matrix4().makeTranslation(0.95, 1.02, 0.15));
  } else if (goods === "veg") {
    const cols = ["#7a8b3a", "#a4562e", "#c9a14a"];
    for (let i = 0; i < 14; i++) add(new THREE.SphereGeometry(0.09 + r() * 0.04, 10, 8), new THREE.MeshStandardMaterial({ color: cols[i % 3], roughness: 0.6 }),
      new THREE.Matrix4().makeTranslation(-1.1 + (i % 7) * 0.36, 1.05, -0.2 + Math.floor(i / 7) * 0.35));
  }
  return M;
}

/** a barrel; a crate */
export function barrel(b: Batch, x: number, z: number, s = 1) {
  b.add(new THREE.CylinderGeometry(0.33 * s, 0.37 * s, 0.95 * s, 18).translate(0, 0.475 * s, 0), pbr("wood", [1.5, 0.5], { color: "#9a7652" }), new THREE.Matrix4().makeTranslation(x, 0, z));
  const hoop = new THREE.MeshStandardMaterial({ color: "#3a3532", roughness: 0.5, metalness: 0.6 });
  for (const hy of [0.18, 0.77]) b.add(new THREE.TorusGeometry(0.36 * s, 0.018, 6, 24).rotateX(Math.PI / 2).translate(0, hy * s, 0), hoop, new THREE.Matrix4().makeTranslation(x, 0, z));
}
export function crate(b: Batch, x: number, z: number, yaw = 0, s = 0.55) {
  b.add(boxGeo(V(-s, 0, -s), V(s, s * 1.3, s)), pbr("wood", [0.6, 0.6], { color: "#b08f68" }), new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z));
}
