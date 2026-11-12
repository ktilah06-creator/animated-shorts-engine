// Engine look test: light rig presets, two-tone shading, ink, DOF, camera module. Not a video.
import * as THREE from "three";
import { defineFilm, rng } from "@engine/film";
import { LightRig } from "@engine/look/rig";
import { twoTone } from "@engine/look/shade";
import { camPath, applyCam, orbit } from "@engine/camera";

const mat = (c: string) => twoTone(new THREE.MeshLambertMaterial({ color: c }));

export default defineFilm({
  id: "_looktest",
  shots: [
    { id: "day", a: 0, b: 60, light: "day" },
    { id: "golden", a: 60, b: 120, light: "golden", xfade: 8 },
  ],
  setup() {
    const scene = new THREE.Scene();
    const rig = new LightRig(scene);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat("#8fb36a"));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const r = rng(11);
    const walls = ["#c9a27e", "#e3d3b4", "#d8a65a", "#b9614a", "#9fb4c4"];
    for (let i = 0; i < 40; i++) {
      const w = 2 + r() * 2, h = 3 + r() * 6, d = 2 + r() * 2;
      const house = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(walls[i % walls.length]));
      body.position.y = h / 2;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 2, 4), mat("#7a3b2e"));
      roof.position.y = h + 1; roof.rotation.y = Math.PI / 4;
      house.add(body, roof);
      const ang = r() * Math.PI * 2, rad = 10 + r() * 40;
      house.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
      house.rotation.y = r() * Math.PI;
      house.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(house);
    }
    for (let i = 0; i < 30; i++) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.6, 8), mat("#6b4a2f")); trunk.position.y = 0.8;
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1 + r() * 0.6, 2), mat("#4e8a3c")); crown.position.y = 2.3;
      tree.add(trunk, crown);
      tree.position.set((r() - 0.5) * 60, 0, (r() - 0.5) * 60);
      if (tree.position.length() < 6) tree.position.multiplyScalar(3);
      tree.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(tree);
    }
    const hero = new THREE.Mesh(new THREE.SphereGeometry(0.8, 48, 24), mat("#f07862"));
    hero.position.set(0, 0.8, 0); hero.castShadow = true; scene.add(hero);
    const cam = camPath([
      { f: 0, pose: { pos: [0, 2.2, 9], look: [0, 1, 0], fov: 40 }, creep: 0.3 },
      { f: 30, pose: { pos: [6, 4, 8], look: [0, 1, 0], fov: 40 }, glide: 24 },
      { f: 60, pose: (f) => orbit([0, 1, 0], 9, 1.6, 200 + (f - 60) * 0.5), cut: true },
    ]);
    return {
      scene,
      frame(f, shot, c) {
        applyCam(c, cam(f));
        rig.apply(shot.light as string, c, { focus: hero.position, radius: 30 });
        return shot.id === "golden" ? { grade: "golden", cInf: 12, focus: hero.position } : { grade: "day" };
      },
    };
  },
});
