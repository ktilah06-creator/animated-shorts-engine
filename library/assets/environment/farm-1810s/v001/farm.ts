// Farm set: farmhouse + barn, fence, summer crop field, trees, distant hills. Built once; reused across shots.
import * as THREE from "three";
import { rng } from "@engine/film";
import { lam } from "@engine/look/materials";
import { grassHD, rep } from "@engine/look/paint";
import { V, Batch, boxGeo } from "@engine/env/geo";
import { house, type HouseStyle } from "@engine/env/house";
import { addVeg } from "@engine/env/vegetation";
import { NOINK } from "@engine/post/ink";

const FARMHOUSE: HouseStyle = { wall: "#e9dcc0", shutter: "#3f5f7a", roof: "#8f97a8", timber: false };
const BARN: HouseStyle = { wall: "#a5482f", shutter: "#efe2c4", roof: "#6d6560" };

/** season "summer" (green crops) or "frost" (failed crops, frosted ground); built around `at` */
export function buildFarm(scene: THREE.Scene, { season = "summer", at = V(0, 0, 0) }: { season?: "summer" | "frost"; at?: THREE.Vector3 } = {}) {
  const b = new Batch(), r = rng(1816);
  const frost = season === "frost";
  b.add(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), frost ? lam("farmGrassFrost", () => ({ map: rep(grassHD(), 90, 90), color: "#c9d3d6" })) : lam("farmGrass", () => ({ map: rep(grassHD(), 90, 90) })));
  house(b, -3.5, -12, 0.12, 8, 6.5, 4.6, FARMHOUSE);
  house(b, 9, -20, -0.35, 9, 8, 5.5, BARN);
  // fence: posts + two rails
  const wood = lam("fenceWood", () => ({ color: "#8a6a4e" }));
  for (let x = -16; x <= 16; x += 2.2) b.add(boxGeo(V(x - 0.07, 0, -4.07), V(x + 0.07, 1.15, -3.93)), wood);
  for (const y of [0.45, 0.95]) b.add(boxGeo(V(-16, y, -4.03), V(16, y + 0.1, -3.97)), wood);
  // crop rows (summer green with golden tips), as small cone clumps
  const stalk = new THREE.ConeGeometry(0.09, 1, 5).translate(0, 0.5, 0);
  const cropA = frost ? lam("cropDead", () => ({ color: "#9c8a5e" })) : lam("cropA", () => ({ color: "#86a54a" }));
  const cropB = frost ? lam("cropFrost", () => ({ color: "#d9dfe2" })) : lam("cropB", () => ({ color: "#a7b45a" }));
  for (let z = -6; z > -40; z -= 0.9) for (let x = 3; x < 40; x += 0.75) {
    const h = (frost ? 0.45 + r() * 0.35 : 0.8 + r() * 0.4), m = new THREE.Matrix4().compose(V(x + r() * 0.3, 0, z + r() * 0.3), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), (r() - 0.5) * 0.15), V(1, h, 1));
    if (frost) m.multiply(new THREE.Matrix4().makeRotationZ((r() - 0.5) * 0.9)); // drooping, flattened stalks
    b.add(stalk, r() < 0.5 ? cropA : cropB, m);
  }
  for (let i = 0; i < 14; i++) addVeg(b, (["round", "fat", "tall", "round"] as const)[i % 4], -30 + r() * 22, 0, -8 - r() * 40, 4 + r() * 3, 77 + i);
  for (let i = 0; i < 8; i++) addVeg(b, "bush", -16 + i * 1.6 + r(), 0, -4.8 - r() * 0.6, 0.9 + r() * 0.4, 300 + i);
  // distant hills
  const hill = lam("hill", () => ({ color: "#6f9a58" }));
  for (let i = 0; i < 7; i++) {
    const g = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    b.add(g, hill, new THREE.Matrix4().compose(V(-160 + i * 55 + r() * 20, -2, -150 - r() * 60), new THREE.Quaternion(), V(60 + r() * 40, 18 + r() * 16, 40)));
  }
  const g = new THREE.Group(); g.position.copy(at); scene.add(g);
  b.build(g);
  return g;
}

/**
 * A dense patch of wheat around a point (for close shots): stalks with heads, summer gold-green or frost-killed
 * (brown, drooping, some flattened, frost-white tips). `clear` keeps a circle free around the centre (for a character).
 */
export function cropPatch(scene: THREE.Scene, center: THREE.Vector3, { w = 7, d = 7, frost = true, clear = 0.55, seed = 7, height = 0.55 } = {}) {
  const b = new Batch(), r = rng(seed);
  const stalk = new THREE.CylinderGeometry(0.006, 0.009, 1, 4).translate(0, 0.5, 0);
  const head = new THREE.SphereGeometry(1, 8, 6).scale(0.016, 0.055, 0.016);
  const awn = new THREE.CylinderGeometry(0.002, 0.002, 0.07, 3).translate(0, 0.035, 0);
  const leaf = new THREE.PlaneGeometry(0.03, 0.26).translate(0, 0.13, 0);
  const cS = lam(frost ? "wheatStalkDead" : "wheatStalk", () => ({ color: frost ? "#d2b77a" : "#9fb055" }));
  const cH = lam(frost ? "wheatHeadDead" : "wheatHead", () => ({ color: frost ? "#b8925a" : "#d9b45a" }));
  const cF = lam("wheatFrostTip", () => ({ color: "#e8eef2" }));
  const cL = lam(frost ? "wheatLeafDead" : "wheatLeaf", () => ({ color: frost ? "#8f8052" : "#7fa046", side: THREE.DoubleSide }));
  for (let z = -d / 2; z < d / 2; z += 0.1) for (let x = -w / 2; x < w / 2; x += 0.09) {
    const px = x + (r() - 0.5) * 0.1, pz = z + (r() - 0.5) * 0.1;
    if (Math.hypot(px, pz) < clear + r() * 0.15) continue;
    const h = (frost ? height : height + 0.3) + r() * 0.3;
    // dead wheat leans and droops; a few stalks lie almost flat
    const lean = frost ? (r() < 0.12 ? 1.25 : 0.15 + r() * 0.45) : r() * 0.12;
    const yaw = r() * Math.PI * 2;
    const base = new THREE.Matrix4().compose(V(center.x + px, center.y, center.z + pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, yaw, 0, "YXZ")), V(1, 1, 1));
    b.add(stalk, cS, base.clone().multiply(new THREE.Matrix4().makeScale(1, h, 1)));
    const droop = frost ? 0.9 + r() * 0.6 : 0.2;   // the head hangs over at the top
    const top = base.clone().multiply(new THREE.Matrix4().makeTranslation(0, h, 0)).multiply(new THREE.Matrix4().makeRotationX(droop)).multiply(new THREE.Matrix4().makeTranslation(0, 0.09, 0));
    b.add(head, cH, top);
    for (const ax of [-0.25, 0, 0.25]) b.add(awn, cH, top.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.045, 0)).multiply(new THREE.Matrix4().makeRotationZ(ax)));
    if (frost && r() < 0.5) b.add(head, cF, top.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.05, 0.012)).multiply(new THREE.Matrix4().makeScale(0.8, 0.45, 0.8)));
    if (r() < 0.6) b.add(leaf, cL, base.clone().multiply(new THREE.Matrix4().makeTranslation(0, h * (0.3 + r() * 0.3), 0)).multiply(new THREE.Matrix4().makeRotationZ((r() - 0.5) * 2.2)));
  }
  const g = new THREE.Group(); scene.add(g); b.build(g);
  // thin stalks would turn into a mass of ink lines: the patch opts out of world outlines
  g.traverse((o) => o.layers.set(NOINK));
  return g;
}
