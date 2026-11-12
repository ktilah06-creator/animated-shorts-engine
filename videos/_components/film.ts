// Engine component test: every ported visual system in one place (houses, vegetation, banner, strands, water,
// clouds, procedural textures, light rig, ink, DOF, grade). Not a video.
import * as THREE from "three";
import { defineFilm, rng } from "@engine/film";
import { LightRig } from "@engine/look/rig";
import { Water } from "@engine/look/water";
import { Clouds } from "@engine/look/clouds";
import { lam, phong } from "@engine/look/materials";
import { cobbleHD, grassHD, stoneHD, rep } from "@engine/look/paint";
import { V, Batch, boxGeo } from "@engine/env/geo";
import { house } from "@engine/env/house";
import { addVeg } from "@engine/env/vegetation";
import { banner } from "@engine/env/banner";
import { Strand } from "@engine/env/strand";
import { sightLines } from "@engine/env/sight";
import { camPath, applyCam } from "@engine/camera";

const shots = [
  { id: "quay-day", a: 0, b: 45, light: "day" },
  { id: "river-golden", a: 45, b: 90, light: "golden", xfade: 8 },
];
const cam = camPath([
  { f: 0, pose: { pos: [-3, 2.4, 11], look: [2, 2, 0], fov: 42 }, creep: 0.25 },
  { f: 45, pose: (f) => ({ pos: [-14 + (f - 45) * 0.06, 3.2, 16], look: [0, 1.5, 0], fov: 44 }), cut: true },
]);

export default defineFilm({
  id: "_components",
  shots,
  setup() {
    const scene = new THREE.Scene();
    const rig = new LightRig(scene, { shadowMap: 4096 });
    const clouds = new Clouds(); scene.add(clouds.root);
    const water = new Water({ x0: -300, x1: 300, z0: 6, z1: 60, y: -1.2, flow: [0.4, 0] });
    scene.add(water.mesh);
    const sight = sightLines(cam, shots.map((s) => [s.a, s.b] as [number, number]));
    const b = new Batch(), r = rng(5);
    // quay: cobbles on top, stone wall down to the water
    b.add(boxGeo(V(-300, -2, -80), V(300, 0, 6), 4), lam("cobble", () => ({ map: rep(cobbleHD(), 1, 1) })));
    b.add(boxGeo(V(-300, -2, 5.9), V(300, 0, 6), 4), lam("quayWall", () => ({ map: stoneHD("quayHD") })));
    b.add(boxGeo(V(-300, -1.4, 60), V(300, 1.5, 200), 6), lam("grass", () => ({ map: rep(grassHD(), 1, 1) })));
    for (let i = 0; i < 9; i++) house(b, -24 + i * 6.2, -9, 0, 5.4, 7, 6.5 + (i % 3) * 1.6, i, 0, sight);
    for (let i = 0; i < 14; i++) house(b, -60 + i * 9, 78, Math.PI, 7, 7, 6 + (i % 4), i + 3, 1.5, sight);
    for (let i = 0; i < 10; i++) addVeg(b, (["round", "fat", "tall", "cone", "bush"] as const)[i % 5], -20 + i * 4.5, 0, -3 + r() * 1.5, 2.5 + r() * 2, i * 17);
    banner(b, "#b8553a", 4, 0, 1.5, 4.2, 0.4);
    b.build(scene);
    // a rope sagging between two posts, and an iron chain
    const post = lam("post", () => ({ color: "#6e4b33" }));
    for (const x of [-6, 2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.6, 10), post); p.position.set(x, 0.8, 4.5); p.castShadow = true; scene.add(p); }
    const rope = new Strand(24, 0.06, 0.06, lam("rope", () => ({ color: "#c9a86a" })), 1); scene.add(rope.mesh);
    const chain = new Strand(24, 0.06, 0.06, phong("iron", () => ({ color: "#7a8490", specular: "#6c727b", shininess: 30 })), 1, true, true); scene.add(chain.mesh);
    const sag = (x0: number, x1: number, y: number, z: number, d: number, f: number) =>
      Array.from({ length: 24 }, (_, i) => { const u = i / 23; return V(x0 + (x1 - x0) * u, y - d * 4 * u * (1 - u) * (1 + 0.05 * Math.sin(f / 9)), z); });
    return {
      scene,
      frame(f, shot, c) {
        applyCam(c, cam(f));
        const L = shot.light as string;
        rig.apply(L, c, { focus: V(0, 1, 2), radius: 40 });
        water.apply(L, f / 30);
        clouds.apply(L, c);
        rope.set(sag(-6, 2, 1.55, 4.5, 0.45, f));
        chain.set(sag(-6, 2, 1.2, 4.5, 0.6, f + 20));
        return L === "golden" ? { grade: "golden", cInf: 8, focus: V(-2, 1.2, 4.5) } : { grade: "day" };
      },
    };
  },
});
