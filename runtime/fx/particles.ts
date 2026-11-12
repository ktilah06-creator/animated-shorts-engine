// Weather and atmosphere particles, deterministic per frame (positions are pure functions of f).
//   const snow = new Snow({ count: 2500, area: [24, 12, 24] });  scene.add(snow.points);
//   snow.update(f, cam);      // flakes fill a box that follows the camera, wrap around, sway as they fall
import * as THREE from "three";
import { NOINK } from "../post/ink";

const flakeTex = (soft: number) => {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(soft, "rgba(255,255,255,0.95)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};

type FallOpts = { count?: number; area?: [number, number, number]; speed?: number; sway?: number; size?: number; color?: string; seed?: number; streak?: number; opacity?: number };

/** falling particles (snow by default; rain = fast, thin, streak) */
export class Fall {
  readonly points: THREE.Points;
  private base: Float32Array;
  private pos: Float32Array;
  constructor(private o: FallOpts = {}) {
    const n = o.count ?? 2500, [w, h, d] = o.area ?? [24, 12, 24];
    this.base = new Float32Array(n * 4);
    let s = (o.seed ?? 1) * 9973 + 17;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < n; i++) { this.base[i * 4] = r() * w; this.base[i * 4 + 1] = r() * h; this.base[i * 4 + 2] = r() * d; this.base[i * 4 + 3] = 0.6 + r() * 0.8; }
    this.pos = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    const m = new THREE.PointsMaterial({ map: flakeTex(o.streak ? 0.2 : 0.45), size: o.size ?? 0.07, color: o.color ?? "#ffffff", transparent: true,
      opacity: o.opacity ?? 0.95, depthWrite: false, sizeAttenuation: true, fog: true });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.layers.set(NOINK);
  }
  update(f: number, cam: THREE.Camera, fps = 30) {
    const [w, h, d] = this.o.area ?? [24, 12, 24], t = f / fps, sp = this.o.speed ?? 0.9, sw = this.o.sway ?? 0.35;
    const cx = cam.position.x - w / 2, cy = cam.position.y - h * 0.55, cz = cam.position.z - d / 2;
    const n = this.pos.length / 3;
    const wrap = (v: number, m: number) => ((v % m) + m) % m;
    for (let i = 0; i < n; i++) {
      const bx = this.base[i * 4], by = this.base[i * 4 + 1], bz = this.base[i * 4 + 2], k = this.base[i * 4 + 3];
      this.pos[i * 3] = cx + wrap(bx - cx + Math.sin(t * 1.3 * k + i) * sw, w);
      this.pos[i * 3 + 1] = cy + wrap(by - t * sp * k - cy, h);
      this.pos[i * 3 + 2] = cz + wrap(bz - cz + Math.cos(t * 1.1 * k + i * 0.7) * sw, d);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
  set amount(a: number) { (this.points.material as THREE.PointsMaterial).opacity = (this.o.opacity ?? 0.95) * a; this.points.visible = a > 0.001; }
}
export const Snow = Fall;
