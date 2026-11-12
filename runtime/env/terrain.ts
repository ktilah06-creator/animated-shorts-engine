// Procedural terrain: volcano islands / mountains as radial height fields with painted vertex colours (two-tone lit).
import * as THREE from "three";
import { twoTone } from "../look/shade";

const hash = (x: number, y: number, s: number) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
function noise(x: number, y: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x: number, y: number, s = 0, oct = 5) => { let t = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { t += a * noise(x * f, y * f, s + i * 13); a *= 0.5; f *= 2; } return t; };

export type VolcanoOpts = { radius?: number; height?: number; crater?: number; craterDepth?: number; seed?: number; seg?: number;
  colors?: { beach: string; forest: string; scrub: string; rock: string; ash: string; crater: string } };

/** island volcano centred at the origin, sea level y = 0 (shore at `radius`), returns a two-tone mesh */
export function volcanoIsland(o: VolcanoOpts = {}) {
  const R = o.radius ?? 40, Hm = o.height ?? 14, cr = o.crater ?? 4.5, cd = o.craterDepth ?? 3, s = o.seed ?? 1, n = o.seg ?? 220;
  const C = o.colors ?? { beach: "#d9c48f", forest: "#4f8a3e", scrub: "#86904f", rock: "#8a7563", ash: "#a59a8f", crater: "#4a3a34" };
  const col = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, new THREE.Color(v)])) as Record<string, THREE.Color>;
  const size = R * 2.6;
  const geo = new THREE.PlaneGeometry(size, size, n, n).rotateX(-Math.PI / 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(p.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z);
    const ang = Math.atan2(z, x);
    const ridges = 1 + 0.18 * (fbm(Math.cos(ang) * 3 + 10, Math.sin(ang) * 3 + 10, s, 4) - 0.5) * 2;
    const t = d / (R * ridges);
    let h = Hm * Math.pow(Math.max(0, 1 - t), 1.65);                         // concave cone
    h -= Math.max(0, cd * (1 - (d / cr) ** 2));                              // caldera
    if (d < cr * 1.25) h = Math.max(h, Hm * Math.pow(1 - cr * 1.1 / R, 1.65) - cd * Math.max(0, 1 - (d / cr) ** 2));
    h += (fbm(x * 0.08, z * 0.08, s) - 0.5) * 2.2 * Math.min(1, t * 3) * Math.max(0, 1 - t * 0.9);
    h += (fbm(x * 0.35, z * 0.35, s + 5) - 0.5) * 0.5;                        // small bumps
    if (t > 1) h = -1.5 - (t - 1) * 6;                                        // sea floor
    p.setY(i, h);
    const k = h / Hm;
    if (d < cr) tmp.copy(col.crater);
    else if (h < 0.35) tmp.copy(col.beach);
    else if (k < 0.35) tmp.copy(col.forest).lerp(col.scrub, Math.max(0, (k - 0.2) / 0.15));
    else if (k < 0.6) tmp.copy(col.scrub).lerp(col.rock, (k - 0.35) / 0.25);
    else tmp.copy(col.rock).lerp(col.ash, (k - 0.6) / 0.4);
    tmp.offsetHSL(0, 0, (hash(x * 3.1, z * 2.7, s) - 0.5) * 0.04);
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, twoTone(new THREE.MeshLambertMaterial({ vertexColors: true })));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
