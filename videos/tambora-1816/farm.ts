// Farm set: farmhouse + barn, fence, summer crop field, trees, distant hills. Built once; reused across shots.
import * as THREE from "three";
import { rng } from "@engine/film";
import { lam } from "@engine/look/materials";
import { grassHD, rep } from "@engine/look/paint";
import { V, Batch, boxGeo } from "@engine/env/geo";
import { house, type HouseStyle } from "@engine/env/house";
import { addVeg } from "@engine/env/vegetation";

const FARMHOUSE: HouseStyle = { wall: "#e9dcc0", shutter: "#3f5f7a", roof: "#8f97a8", timber: false };
const BARN: HouseStyle = { wall: "#a5482f", shutter: "#efe2c4", roof: "#6d6560" };

export function buildFarm(scene: THREE.Scene) {
  const b = new Batch(), r = rng(1816);
  b.add(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), lam("farmGrass", () => ({ map: rep(grassHD(), 90, 90) })));
  house(b, -3.5, -12, 0.12, 8, 6.5, 4.6, FARMHOUSE);
  house(b, 9, -20, -0.35, 9, 8, 5.5, BARN);
  // fence: posts + two rails
  const wood = lam("fenceWood", () => ({ color: "#8a6a4e" }));
  for (let x = -16; x <= 16; x += 2.2) b.add(boxGeo(V(x - 0.07, 0, -4.07), V(x + 0.07, 1.15, -3.93)), wood);
  for (const y of [0.45, 0.95]) b.add(boxGeo(V(-16, y, -4.03), V(16, y + 0.1, -3.97)), wood);
  // crop rows (summer green with golden tips), as small cone clumps
  const stalk = new THREE.ConeGeometry(0.09, 1, 5).translate(0, 0.5, 0);
  const cropA = lam("cropA", () => ({ color: "#86a54a" })), cropB = lam("cropB", () => ({ color: "#a7b45a" }));
  for (let z = -6; z > -40; z -= 0.9) for (let x = 3; x < 40; x += 0.75) {
    const h = 0.8 + r() * 0.4, m = new THREE.Matrix4().compose(V(x + r() * 0.3, 0, z + r() * 0.3), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), (r() - 0.5) * 0.15), V(1, h, 1));
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
  b.build(scene);
}
