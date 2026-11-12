// Engine self-test film: two short shots with a crossfade and a flash. Used by `cli selftest`; not a video.
import * as THREE from "three";
import { defineFilm, rng } from "@engine/film";

export default defineFilm({
  id: "_selftest",
  shots: [
    { id: "s1", a: 0, b: 20 },
    { id: "s2", a: 20, b: 40, xfade: 6 },
  ],
  flashes: [{ at: 12, len: 3 }],
  setup() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#5b8fd6");
    scene.add(new THREE.HemisphereLight("#dcecff", "#6b5a48", 1.2));
    const sun = new THREE.DirectionalLight("#fff1dc", 2.4);
    sun.position.set(6, 10, 4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: "#7fb069", roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const r = rng(7);
    for (let i = 0; i < 24; i++) {
      const h = 0.6 + r() * 2.4;
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, h, 1), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(r(), 0.5, 0.6) }));
      m.position.set((r() - 0.5) * 16, h / 2, -r() * 18); m.castShadow = true; scene.add(m);
    }
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.7, 48, 24), new THREE.MeshStandardMaterial({ color: "#f07862" }));
    ball.castShadow = true; scene.add(ball);
    return {
      scene,
      frame(f, shot, cam) {
        ball.position.set(Math.sin(f / 6) * 2, 0.7 + Math.abs(Math.sin(f / 4)) * 1.5, 0);
        if (shot.id === "s1") { cam.position.set(0, 2, 9 - f * 0.05); cam.lookAt(0, 1, 0); return { grade: "day" }; }
        cam.position.set(6, 5, 8); cam.lookAt(0, 1, -2);
        return { grade: "golden", cInf: 12, focus: ball.position };
      },
    };
  },
});
