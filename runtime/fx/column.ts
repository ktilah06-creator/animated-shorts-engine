// Cinematic eruption column: a towering Plinian column of soft, noise-shaded ash puffs rising from a vent,
// widening with height and flattening into an umbrella cloud at the ceiling, with an incandescent base.
// Deterministic: every puff's position is a function of (frame, index).
//   const col = new EruptionColumn({ vent, height: 22000, base: 500, top: 3200, umbrella: 16000, start: 0 });
//   scene.add(col.root);  col.update(f, { grow: 0..1, light: Color });
import * as THREE from "three";
import { NOINK } from "../post/ink";

/** Soft cumulus puff: fbm-shaded density, lit from the upper left. Cached per variant. */
export const cloudTex = (() => {
  const cache = new Map<number, THREE.Texture>();
  const hash = (x: number, y: number, s: number) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
  const vn = (x: number, y: number, s: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x: number, y: number, s: number) => { let t = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { t += a * vn(x * f, y * f, s + i * 13); a *= 0.5; f *= 2.03; } return t; };
  return (k: number) => {
    let t = cache.get(k); if (t) return t;
    const N = 256, c = document.createElement("canvas"); c.width = c.height = N;
    const g = c.getContext("2d")!, img = g.createImageData(N, N);
    const dens = new Float32Array(N * N);
    // a few overlapping lobes give the cauliflower silhouette; fbm erodes the edge
    let s = 7 + k * 19; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const lobes = Array.from({ length: 7 }, () => { const a = r() * 6.283, d = r() * 0.28; return [0.5 + Math.cos(a) * d, 0.52 + Math.sin(a) * d * 0.8, 0.2 + r() * 0.14]; });
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      let m = 0;
      for (const [cx, cy, rad] of lobes) { const q = Math.hypot(u - cx, v - cy) / rad; m = Math.max(m, 1 - q * q); }
      const n = fbm(u * 5, v * 5, k * 3.1);
      dens[y * N + x] = Math.max(0, Math.min(1, (m + (n - 0.5) * 0.9) * 1.8));
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, d = dens[i];
      // march toward the light (upper left) and attenuate by the density crossed: soft self-shadowing
      let acc = 0;
      for (let k2 = 1; k2 <= 8; k2++) { const lx = x - k2 * 4, ly = y - k2 * 6; if (lx < 0 || ly < 0) break; acc += dens[ly * N + lx]; }
      const lit = 0.32 + 0.68 * Math.exp(-acc * 0.42);
      const detail = 0.9 + 0.2 * fbm(x / N * 12, y / N * 12, k + 50);
      const L = 255 * Math.min(1, lit * detail);
      const u = x / N - 0.5, v = y / N - 0.5, win = Math.max(0, 1 - Math.pow(Math.hypot(u, v) / 0.5, 4));
      img.data[i * 4] = L; img.data[i * 4 + 1] = L * 0.985; img.data[i * 4 + 2] = L * 0.97;
      img.data[i * 4 + 3] = 255 * Math.pow(d, 0.7) * win;
    }
    g.putImageData(img, 0, 0);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; cache.set(k, t); return t;
  };
})();

export type ColumnOpts = {
  vent: THREE.Vector3; height: number; base: number; top: number; umbrella: number;
  count?: number; umbrellaCount?: number; wind?: [number, number]; seed?: number;
  dark?: string; lit?: string; glow?: string;
};

export class EruptionColumn {
  readonly root = new THREE.Group();
  private col: THREE.Sprite[] = [];
  private umb: THREE.Sprite[] = [];
  private fire: THREE.Sprite[] = [];
  private dark: THREE.Color; private lit: THREE.Color; private glowC: THREE.Color;
  constructor(private o: ColumnOpts) {
    const mk = (i: number, add = false) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex(i % 6), transparent: true, depthWrite: false, fog: !add,
        blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
      s.layers.set(NOINK); this.root.add(s); return s;
    };
    for (let i = 0; i < (o.count ?? 520); i++) this.col.push(mk(i));
    for (let i = 0; i < (o.umbrellaCount ?? 460); i++) this.umb.push(mk(i + 3));
    for (let i = 0; i < 40; i++) this.fire.push(mk(i, true));
    this.dark = new THREE.Color(o.dark ?? "#3a3330"); this.lit = new THREE.Color(o.lit ?? "#b9aca2"); this.glowC = new THREE.Color(o.glow ?? "#ff6a1f");
  }
  /** grow: 0 = vent only, 1 = full column with umbrella. t: seconds (drives the churning). */
  update(t: number, { grow = 1, light = new THREE.Color(1, 1, 1), sunDir = new THREE.Vector3(0.5, 0.6, 0.3) } = {}) {
    const o = this.o, H = o.height, [wx, wz] = o.wind ?? [0.08, 0.03];
    const hs = (i: number, k: number) => { const v = Math.sin(i * 12.9898 + k * 78.233 + (o.seed ?? 1) * 37.7) * 43758.5453; return v - Math.floor(v); };
    const reach = H * Math.min(1, grow * 1.25);                 // column top grows first
    const umbGrow = Math.max(0, (grow - 0.55) / 0.45);          // then the umbrella spreads
    const tmp = new THREE.Color();
    const n = this.col.length;
    for (let i = 0; i < n; i++) {
      const sp = this.col[i];
      // puffs cycle upward: each has a phase so the column churns and rises continuously
      const ph = (hs(i, 1) + t * (0.025 + 0.02 * hs(i, 2))) % 1;
      const h = Math.pow(ph, 1.25) * H;                          // denser near the vent
      if (h > reach) { sp.visible = false; continue; }
      const k = h / H;
      const rad = o.base + (o.top - o.base) * Math.pow(k, 0.8);
      const a = hs(i, 3) * 6.283 + t * 0.15 * (hs(i, 4) - 0.5);
      const rr = rad * Math.sqrt(hs(i, 5)) * 0.75;
      sp.position.set(o.vent.x + Math.cos(a) * rr + wx * h, o.vent.y + h, o.vent.z + Math.sin(a) * rr + wz * h);
      const sz = rad * (1.2 + 0.9 * hs(i, 6));
      sp.scale.set(sz, sz, 1);
      const m = sp.material as THREE.SpriteMaterial;
      // the sun-facing side of the column is lighter; the base is dark and fire-lit
      const side = 0.5 + 0.5 * (Math.cos(a) * sunDir.x + Math.sin(a) * sunDir.z);
      tmp.copy(this.dark).lerp(this.lit, Math.min(1, 0.25 + side * 0.5 + k * 0.45));
      const heat = Math.max(0, 1 - k * 9);
      m.color.copy(tmp).multiply(light).lerp(this.glowC, heat * 0.55);
      m.opacity = Math.min(1, (reach - h) / (H * 0.04) + 0.1) * 0.95;
      m.rotation = hs(i, 7) * 6.283 + t * 0.05 * (hs(i, 8) - 0.5);
      sp.visible = true;
    }
    for (let i = 0; i < this.umb.length; i++) {
      const sp = this.umb[i];
      if (umbGrow <= 0) { sp.visible = false; continue; }
      // mushroom cap: a broad, flattened disc whose rim rolls over and droops; puffs concentrate toward the rim
      const a = hs(i, 11) * 6.283, q = Math.pow(hs(i, 12), 0.6), d = q * o.umbrella * umbGrow;
      const x = Math.cos(a) * d, z = Math.sin(a) * d * 0.85;
      const dome = Math.sqrt(Math.max(0, 1 - q * q));
      const y = H * 0.9 + H * 0.09 * dome + H * 0.03 * (hs(i, 13) - 0.5) - H * 0.05 * Math.pow(q, 3) + Math.sin(t * 0.3 + i) * 60;
      sp.position.set(o.vent.x + wx * H + x, o.vent.y + y, o.vent.z + wz * H + z);
      const sz = o.top * (0.7 + 0.7 * hs(i, 14)) * (0.8 + 0.5 * q);
      sp.scale.set(sz * 1.3, sz, 1);
      const m = sp.material as THREE.SpriteMaterial;
      const side = 0.5 + 0.5 * (Math.cos(a) * sunDir.x + Math.sin(a) * sunDir.z);
      tmp.copy(this.dark).lerp(this.lit, Math.min(1, 0.35 + 0.35 * side + 0.3 * dome + 0.15 * hs(i, 15)));
      m.color.copy(tmp).multiply(light);
      m.opacity = 0.92 * Math.min(1, umbGrow * 2.2 - q * 0.8);
      m.rotation = hs(i, 16) * 6.283;
      sp.visible = true;
    }
    // incandescent fountain at the vent
    for (let i = 0; i < this.fire.length; i++) {
      const sp = this.fire[i];
      const ph = (hs(i, 21) + t * 0.6) % 1, h = ph * o.base * 2.5;
      sp.position.set(o.vent.x + (hs(i, 22) - 0.5) * o.base * 1.4, o.vent.y + h, o.vent.z + (hs(i, 23) - 0.5) * o.base * 1.4);
      const sz = o.base * (0.5 + 0.6 * hs(i, 24)) * (1 - ph * 0.6);
      sp.scale.set(sz, sz, 1);
      const m = sp.material as THREE.SpriteMaterial;
      m.color.copy(this.glowC).multiplyScalar(1.6 * (1 - ph) * (grow > 0 ? 1 : 0));
      m.opacity = 0.7;
      sp.visible = grow > 0;
    }
  }
}
