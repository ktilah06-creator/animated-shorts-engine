// Atmosphere cross-section (side view, explainer): volcano and ash column on the left, the gas cloud rising into the
// stratosphere and drifting downwind as a thin sulfate-aerosol layer, the tropopause as a dashed line, and sunlight
// arrows: some reflected by the layer back to space, fewer reaching the ground. Original diagram in the channel's
// storybook style. Everything is laid out in the picture plane z = 0 of a group placed at `at`.
//
// The frame (9:16) spans x -9..9, y 0..32 when viewed with ATMOS_CAM.
import * as THREE from "three";
import { lam } from "@engine/look/materials";
import { V } from "@engine/env/geo";
import { Plume, puffTex } from "@engine/fx/plume";
import { Arrow, dashedLine } from "@engine/fx/arrow";
import { NOINK } from "@engine/post/ink";
import { ease } from "@engine/chars/clips";

export const ATMOS_CAM = { pos: [0, 16, 82] as [number, number, number], look: [0, 16, 0] as [number, number, number], fov: 22.5 };
export const TROPOPAUSE = 17;

export function buildAtmos(scene: THREE.Scene, at: THREE.Vector3) {
  const root = new THREE.Group(); root.position.copy(at); scene.add(root);
  // sky bands (flat, unlit)
  const band = (y0: number, y1: number, top: string, bottom: string) => {
    const g = new THREE.PlaneGeometry(40, y1 - y0, 1, 1).translate(0, (y0 + y1) / 2, -6);
    const c = g.attributes.position.count, col = new Float32Array(c * 3), t = new THREE.Color(top), b = new THREE.Color(bottom);
    for (let i = 0; i < c; i++) { const k = g.attributes.position.getY(i) > (y0 + y1) / 2 ? t : b; col.set([k.r, k.g, k.b], i * 3); }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    m.layers.set(NOINK); root.add(m);
  };
  band(TROPOPAUSE, 40, "#3f78b8", "#6aa3d6");     // stratosphere: deeper blue
  band(-2, TROPOPAUSE, "#a9cdea", "#d7e9f6");     // troposphere: pale
  root.add(dashedLine(V(-20, TROPOPAUSE, -5), V(20, TROPOPAUSE, -5), { dash: 0.9, gap: 0.55, width: 0.14 }));
  // ground: rolling hills + the volcano, as cut-paper extrusions (ink outlines them)
  const hills = new THREE.Shape();
  hills.moveTo(-22, -3); hills.lineTo(-22, 1.2);
  for (let x = -22; x <= 22; x += 0.5) hills.lineTo(x, 1.4 + Math.sin(x * 0.45) * 0.45 + Math.sin(x * 1.3 + 1) * 0.18);
  hills.lineTo(22, -3); hills.closePath();
  const green = lam("atmosHill", () => ({ color: "#4fa36a" }));
  root.add(new THREE.Mesh(new THREE.ExtrudeGeometry(hills, { depth: 1, bevelEnabled: false }).translate(0, 0, -2), green));
  const volc = new THREE.Shape();
  volc.moveTo(-14, 1); volc.quadraticCurveTo(-9, 1.6, -7.2, 5.4); volc.lineTo(-6.6, 6.2); volc.lineTo(-5.4, 6.2); volc.lineTo(-4.8, 5.4);
  volc.quadraticCurveTo(-3, 1.6, 2, 1); volc.closePath();
  root.add(new THREE.Mesh(new THREE.ExtrudeGeometry(volc, { depth: 1.2, bevelEnabled: false }).translate(0, 0, -1.2), lam("atmosVolc", () => ({ color: "#6f8f4f" }))));
  // ash column (rises from the vent to the stratosphere)
  const column = new Plume({ vent: at.clone().add(V(-6, 6.2, 0)), rate: 30, rise: 1.6, life: 170, spread: 0.035, size: [1.7, 3.6], wind: [0, 0, 0],
    color: ["#4a4442", "#8e8782"], seed: 4, max: 420, glow: "#ff8a2a", ceiling: at.y + 19.0, ceilingSpread: 0.06 });
  root.parent!.add(column.root);
  // ash cloud at the top + the aerosol layer drifting downwind (sprites revealed from left to right)
  const cloud: THREE.Sprite[] = [], layer: { s: THREE.Sprite; x: number }[] = [];
  let seed = 11; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex(i % 4), color: new THREE.Color("#7d7672"), transparent: true, depthWrite: false, fog: false }));
    s.position.set(-6 + (r() - 0.5) * 6, 19.3 + (r() - 0.5) * 3, 1 + r()); const k = 2.6 + r() * 2; s.scale.set(k, k * 0.85, 1);
    s.layers.set(NOINK); root.add(s); cloud.push(s);
  }
  for (let i = 0; i < 70; i++) {
    const x = -4 + i * 0.36 + r() * 0.3;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex(i % 4), color: new THREE.Color("#e7e4df"), transparent: true, depthWrite: false, fog: false }));
    s.position.set(x, 19.2 + (r() - 0.5) * 0.9 - (x > 4 ? (x - 4) * 0.02 : 0), 0.5 + r() * 0.4);
    const k = 2.1 + r() * 0.9; s.scale.set(k * 1.5, k * 0.62, 1);
    s.layers.set(NOINK); root.add(s); layer.push({ s, x });
  }
  // sunlight: three incoming, one reflected, two passing through (fewer, thinner = less energy reaching the ground)
  const A = (a: number[], b: number[], o: ConstructorParameters<typeof Arrow>[2]) => { const ar = new Arrow(V(a[0], a[1], 2.2), V(b[0], b[1], 2.2), o); root.add(ar.mesh); return ar; };
  // (all inside the Shorts safe area: x -7.4..6.6, y 6.5..29.5 in this framing)
  const inc = [A([-1.4, 27.2], [0.6, 20.6], { color: "#e2553f", width: 0.34 }), A([0.2, 27.2], [2.2, 20.6], { color: "#e2553f", width: 0.34 }), A([1.8, 27.2], [3.8, 20.6], { color: "#e2553f", width: 0.34 })];
  const refl = A([4.3, 20.9], [5.9, 26.0], { color: "#2b2230", width: 0.3 });
  const thru = [A([1.4, 18.0], [3.6, 10.6], { color: "#e2553f", width: 0.22 }), A([2.9, 18.0], [5.1, 10.6], { color: "#e2553f", width: 0.22 })];
  const wind = A([-8.3, 23.2], [-5.6, 23.2], { color: "#fbf3e2", width: 0.5, hollow: true, head: 1.6 });
  return {
    root, column, anchors: {
      strat: at.clone().add(V(-3.6, 25.4, 3)), trop: at.clone().add(V(-1.6, 13.2, 3)), aerosols: at.clone().add(V(4.3, 16.1, 3)),
      incoming: at.clone().add(V(-0.6, 28.6, 3)), reflected: at.clone().add(V(5.0, 27.4, 3)), wind: at.clone().add(V(-7.0, 24.6, 3)), ground: at.clone().add(V(3.4, 8.6, 3)),
    },
    /**
     * spread 0..1 moves the aerosol front downwind; rays 0..1 draws the arrows; columnAge = frames since the eruption
     * column started (it grows up from the vent); cloud 0..1 fades in the ash cloud at the top of the column
     */
    update(f: number, cam: THREE.Camera, { spread = 1, rays = 1, columnAge = 400, cloud: cloudK = 1 } = {}) {
      column.update(columnAge, cam);
      for (const s of cloud) { (s.material as THREE.SpriteMaterial).opacity = cloudK; s.visible = cloudK > 0.01; }
      const front = -4 + spread * 26;
      for (const { s, x } of layer) { const v = ease((front - x) / 2.5); (s.material as THREE.SpriteMaterial).opacity = v * 0.95; s.visible = v > 0.01; }
      inc.forEach((a, i) => (a.progress = ease(rays * 3 - i * 0.25)));
      refl.progress = ease(rays * 3 - 1.1);
      thru.forEach((a, i) => (a.progress = ease(rays * 3 - 1.5 - i * 0.2)));
      wind.progress = 1;
    },
  };
}
