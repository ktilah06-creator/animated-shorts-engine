// Village 1816 (cinematic version, draft until approved): a curving cobbled street with stone and plaster houses,
// gardens and trees, a small market square with stalls, barrels and crates, fences and distant hills.
// Local coordinates: the street runs along -z from the origin; the market square is around (0, 0, -26).
import * as THREE from "three";
import { rng } from "@engine/film";
import { V, Batch, boxGeo } from "@engine/env/geo";
import { pbr } from "@engine/look/pbr";
import { building, stall, barrel, crate } from "@engine/env/buildings";
import { tree, grassField } from "@engine/env/foliage";

export function buildVillage2(scene: THREE.Scene, at: THREE.Vector3, { snow = 0 } = {}) {
  const root = new THREE.Group(); root.position.copy(at); scene.add(root);
  const b = new Batch(), r = rng(1816);
  // ground: grass everywhere, cobbled street and square
  b.add(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), pbr("ground", [180, 180]));
  b.add(boxGeo(V(-3.2, 0, -60), V(3.2, 0.06, 12)), pbr(snow > 0.1 ? "cobble-snow" : "cobble", [2.2, 26]));
  b.add(new THREE.CylinderGeometry(9, 9, 0.06, 40).translate(0, 0.03, -26), pbr(snow > 0.1 ? "cobble-snow" : "cobble", [6, 6]));
  // houses on both sides, slightly irregular
  const walls: ("plaster" | "stone")[] = ["plaster", "stone", "plaster", "plaster", "stone"];
  const tints = ["#efe6d6", "#e8dcc4", "#f1e9dc", "#e6d6bd", "#ddd2c0"];
  for (let i = 0; i < 7; i++) {
    for (const side of [-1, 1]) {
      const z = 6 - i * 9.5 + side * 2.2 + (r() - 0.5) * 1.5;
      if (Math.abs(z + 26) < 8) continue;                                  // leave the square open
      const w = 6 + r() * 2.5, h = 4.8 + r() * 2.8;
      building(b, { x: side * (3.4 + 3.2 + r() * 0.6), z, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2, w, d: 6, h, wall: walls[(i + (side > 0 ? 2 : 0)) % 5],
        roof: r() < 0.6 ? "slate" : "tiles", seed: i * 2 + (side > 0 ? 1 : 0), wallTint: tints[(i * 3 + (side > 0 ? 1 : 0)) % 5], floors: h > 6 ? 2 : 1, lit: 0.6 });
    }
  }
  // houses framing the square
  for (const [x, z, yaw] of [[-11, -32, 0.5], [11, -33, -0.5], [0, -38, 0]] as [number, number, number][])
    building(b, { x, z, yaw, w: 8, d: 6, h: 7, wall: "stone", roof: "tiles", seed: 40 + x, floors: 2, lit: 0.6 });
  // market: stalls, barrels, crates
  stall(b, -4.2, -23, 0.35, "#b35a3c", "bread", 1); stall(b, 4.4, -24.5, -0.4, "#3f6a8a", "veg", 2); stall(b, -1.5, -30, 0.05, "#4e7a4a", "empty", 3);
  for (let i = 0; i < 7; i++) barrel(b, (r() < 0.5 ? -1 : 1) * (6 + r() * 2), -20 - r() * 12, 0.9 + r() * 0.2);
  for (let i = 0; i < 6; i++) crate(b, (r() < 0.5 ? -1 : 1) * (5 + r() * 2.5), -18 - r() * 14, r() * 3);
  if (snow > 0.1) {   // large-scale wear on the snowy street: two cart ruts, slush patches and footprints (reads from afar)
    const c = document.createElement("canvas"); c.width = 512; c.height = 4096;
    const g = c.getContext("2d")!; let sd = 41; const r = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    for (const x0 of [196, 316]) for (let y = 0; y < 4096; y += 6) {
      const x = x0 + Math.sin(y * 0.004) * 14 + (r() - 0.5) * 3;
      g.fillStyle = `rgba(74,66,58,${0.35 + r() * 0.3})`; g.fillRect(x - 9 - r() * 4, y, 18 + r() * 8, 7);
    }
    for (let i = 0; i < 70; i++) {
      const x = r() * 512, y = r() * 4096, rad = 20 + r() * 70;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, "rgba(90,80,70,0.38)"); gr.addColorStop(1, "rgba(90,80,70,0)");
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rad * 0.7, rad * 1.4, 0, 0, 6.3); g.fill();
    }
    for (let i = 0; i < 260; i++) {
      const x = 120 + r() * 280, y = r() * 4096; g.fillStyle = "rgba(70,64,60,0.4)";
      g.beginPath(); g.ellipse(x, y, 5, 10, 0, 0, 6.3); g.fill(); g.beginPath(); g.ellipse(x + 16, y + 26, 5, 10, 0, 0, 6.3); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const wear = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 72).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4 }));
    wear.position.set(at.x, at.y + 0.064, at.z - 24); wear.receiveShadow = true; scene.add(wear);
  }
  // garden fences along the street front
  const post = pbr("wood", [0.2, 1], { color: "#9c8468" });
  for (const side of [-1, 1]) for (let z = 10; z > -14; z -= 1.6) {
    b.add(boxGeo(V(-0.05, 0, -0.05), V(0.05, 1.0, 0.05)), post, new THREE.Matrix4().makeTranslation(side * 3.6, 0, z));
    b.add(boxGeo(V(-0.03, 0.55, -0.8), V(0.03, 0.65, 0.8)), post, new THREE.Matrix4().makeTranslation(side * 3.6, 0, z - 0.8));
  }
  // distant hills (fog does the depth)
  const hill = new THREE.MeshStandardMaterial({ color: "#5d7a45", roughness: 1 });
  for (let i = 0; i < 9; i++) b.add(new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), hill,
    new THREE.Matrix4().compose(V(-260 + i * 65 + r() * 30, -4, -180 - r() * 120), new THREE.Quaternion(), V(70 + r() * 50, 22 + r() * 22, 45)));
  b.build(root);
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  // trees in the gardens
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1, t = tree({ h: 6 + r() * 4, seed: i + 3, crown: 2.2 + r() * 1.4 });
    t.position.set(side * (12 + r() * 10), 0, 8 - i * 4.5 - r() * 3); t.rotation.y = r() * 6; root.add(t);
  }
  // front gardens: small trees and shrubs between the fences and the houses (summer green in the street view)
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1, t = tree({ h: 3.2 + r() * 1.6, seed: 60 + i, crown: 1.2 + r() * 0.6 });
    t.position.set(side * (4.6 + r() * 0.8), 0, 9 - i * 2.6); root.add(t);
  }
  // close grass where the camera starts (the leaf shot looks along the street from the garden edge)
  const grass = grassField({ w: 14, d: 10, count: 26000, h: 0.32, seed: 4, frost: snow });
  grass.position.set(5.5, 0, 9); root.add(grass);
  return root;
}
