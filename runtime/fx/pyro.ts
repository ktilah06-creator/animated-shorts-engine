// Pyroclastic flows: billowing ash clouds that pour down the flanks of a volcano along radial paths, growing and
// slowing as they go. Deterministic sprites (shares the puff texture of fx/plume.ts).
import * as THREE from "three";
import { NOINK } from "../post/ink";
import { cloudTex } from "./column";

export class PyroFlows {
  readonly root = new THREE.Group();
  private sprites: THREE.Sprite[] = [];
  constructor(private o: { center: THREE.Vector3; rim: number; base: number; height: number; start: number; lanes?: number; perLane?: number; speed?: number; size?: [number, number]; seed?: number }) {
    const n = (o.lanes ?? 7) * (o.perLane ?? 26);
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex(i % 6), transparent: true, depthWrite: false, fog: true }));
      s.layers.set(NOINK); s.visible = false; this.sprites.push(s); this.root.add(s);
    }
  }
  /** profile: height of the slope at distance d from the centre */
  update(f: number, light = new THREE.Color(1, 1, 1), profile: (d: number) => number) {
    const o = this.o, lanes = o.lanes ?? 7, per = o.perLane ?? 26, sp = o.speed ?? 0.6, [s0, s1] = o.size ?? [40, 160];
    const hsh = (i: number, k: number) => { const v = Math.sin(i * 12.9898 + k * 78.233 + (o.seed ?? 3) * 37.7) * 43758.5453; return v - Math.floor(v); };
    let i = 0;
    for (let L = 0; L < lanes; L++) {
      const ang = (L / lanes) * Math.PI * 2 + hsh(L, 1) * 0.6;
      for (let k = 0; k < per; k++, i++) {
        const sp_ = this.sprites[i], born = o.start + k * 3 + hsh(i, 2) * 6, age = (f - born) / 30;
        if (age <= 0) { sp_.visible = false; continue; }
        const travel = Math.min(1, age * sp * (1 - 0.25 * Math.min(1, age * sp)));              // 0 rim .. 1 base
        const d = o.rim + (o.base - o.rim) * travel;
        const a = ang + (hsh(i, 3) - 0.5) * 0.25 * (0.3 + travel);
        const lift = (s0 + (s1 - s0) * travel) * (0.25 + 0.35 * hsh(i, 4));
        sp_.position.set(o.center.x + Math.cos(a) * d, o.center.y + profile(d) + lift, o.center.z + Math.sin(a) * d);
        const sz = s0 + (s1 - s0) * Math.sqrt(travel) * (0.7 + 0.6 * hsh(i, 5));
        sp_.scale.set(sz, sz * 0.85, 1);
        const m = sp_.material as THREE.SpriteMaterial;
        m.color.setRGB(0.55, 0.5, 0.47).multiply(light);
        m.opacity = Math.min(1, age * 2) * 0.95; m.rotation = hsh(i, 6) * 6;
        sp_.visible = true;
      }
    }
  }
}
