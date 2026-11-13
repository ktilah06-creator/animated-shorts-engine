// Procedural PBR materials (engine-owned): albedo + normal + roughness maps generated on CPU canvases from noise and
// simple layouts, so realistic-looking surfaces exist without downloading texture sets. Deterministic, cached by key.
//   const m = pbr("cobble");  // MeshStandardMaterial with maps; repeat with m.map!.repeat.set(...)
import * as THREE from "three";

const hash = (x: number, y: number, s: number) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
function vnoise(x: number, y: number, s: number, period: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const P = (a: number) => ((a % period) + period) % period;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(P(xi), P(yi), s), b = hash(P(xi + 1), P(yi), s), c = hash(P(xi), P(yi + 1), s), d = hash(P(xi + 1), P(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** tileable fBm on a [0,1) square */
export function fbm2(u: number, v: number, s = 0, oct = 5, base = 8) {
  let t = 0, a = 0.5, f = base;
  for (let i = 0; i < oct; i++) { t += a * vnoise(u * f, v * f, s + i * 17, f); a *= 0.5; f *= 2; }
  return t;
}

type Maps = { albedo: Float32Array; height: Float32Array; rough: Float32Array };
type Recipe = (u: number, v: number, x: number, y: number) => { c: [number, number, number]; h: number; r: number };

function bake(size: number, recipe: Recipe): Maps {
  const albedo = new Float32Array(size * size * 3), height = new Float32Array(size * size), rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = recipe(x / size, y / size, x, y), i = y * size + x;
    albedo[i * 3] = o.c[0]; albedo[i * 3 + 1] = o.c[1]; albedo[i * 3 + 2] = o.c[2]; height[i] = o.h; rough[i] = o.r;
  }
  return { albedo, height, rough };
}

function toTextures(m: Maps, size: number, normalStrength: number) {
  const mk = (fill: (d: Uint8ClampedArray) => void, srgb: boolean) => {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d", { willReadFrequently: true })!, im = g.createImageData(size, size);
    fill(im.data); g.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  };
  const map = mk((d) => { for (let i = 0; i < size * size; i++) { d[i * 4] = m.albedo[i * 3] * 255; d[i * 4 + 1] = m.albedo[i * 3 + 1] * 255; d[i * 4 + 2] = m.albedo[i * 3 + 2] * 255; d[i * 4 + 3] = 255; } }, true);
  const H = (x: number, y: number) => m.height[((y + size) % size) * size + ((x + size) % size)];
  const normalMap = mk((d) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * normalStrength, dy = (H(x, y + 1) - H(x, y - 1)) * normalStrength;
      const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }, false);
  const roughnessMap = mk((d) => { for (let i = 0; i < size * size; i++) { const r = m.rough[i] * 255; d[i * 4] = r; d[i * 4 + 1] = r; d[i * 4 + 2] = r; d[i * 4 + 3] = 255; } }, false);
  return { map, normalMap, roughnessMap };
}

const mix3 = (a: number[], b: number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (h: string) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };   // linear values of an sRGB hex
const srgb = (h: string) => { const c = new THREE.Color(h).convertLinearToSRGB(); return [c.r, c.g, c.b]; };
const sm = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** recipes: each returns sRGB albedo 0..1, height 0..1, roughness 0..1 */
const cobbleF = (snow: number) => (u: number, v: number) => {
    // irregular setts: rows of varying height, stones of varying width, rounded tops, dark gritty joints
    const N = 12, rowF = v * N, row = Math.floor(rowF), rh = 0.75 + 0.5 * hash(row, 9, 1);
    const off = hash(row, 3, 4), cu = u * N * (0.8 + 0.4 * hash(row, 5, 2)) + off * 3, col = Math.floor(cu);
    const fx = cu - col - 0.5, fy = rowF - row - 0.5, id = col * 31 + row * 7;
    const jit = (fbm2(u, v, 3, 3, 24) - 0.5) * 0.22;
    const d = Math.pow(Math.pow(Math.abs(fx) * (1.0 + 0.2 * hash(id, 4, 4)), 3) + Math.pow(Math.abs(fy) * rh, 3), 1 / 3) + jit;
    const stone = 1 - sm(0.36, 0.46, d);
    const tone = 0.8 + 0.4 * hash(id, 1, 7), n = fbm2(u, v, 9, 4, 32);
    const c = mix3(srgb("#2f2b28"), mix3(srgb("#6e665c"), srgb("#8e8272"), hash(id, 3, 2)).map((x) => x * tone * (0.8 + 0.35 * n)) as number[], stone);
    if (!snow) return { c, h: stone * (0.55 + 0.45 * (1 - d * 2)) + n * 0.12, r: 0.78 + 0.2 * (1 - stone) };
    // fresh snow: packed into the joints, dusting the stone tops in drifts
    const dust = sm(0.42, 0.72, fbm2(u, v, 21, 4, 10)) * 0.85, cover = (1 - stone) * 0.95 + stone * dust;
    const cs = mix3(c as number[], srgb("#e9eef3"), cover * snow) as [number, number, number];
    return { c: cs, h: stone * (0.55 + 0.45 * (1 - d * 2)) * (1 - 0.5 * dust) + n * 0.12 + (1 - stone) * 0.45 * snow, r: 0.86 };
  };


export const RECIPES: Record<string, { size: number; normal: number; f: Recipe }> = {
  // irregular cobblestones with mortar gaps
  cobble: { size: 1024, normal: 7, f: cobbleF(0) },
  "cobble-snow": { size: 1024, normal: 6, f: cobbleF(1) },
  // rough lime plaster with stains
  plaster: { size: 512, normal: 2.5, f: (u, v) => {
    const n = fbm2(u, v, 1, 6, 8), stain = sm(0.55, 0.75, fbm2(u * 0.5, v, 4, 3, 4)) * sm(0.2, 1, 1 - v);
    const c = mix3(srgb("#d8cdb8"), srgb("#a8977c"), stain * 0.6).map((x) => x * (0.9 + 0.2 * n)) as [number, number, number];
    return { c, h: n, r: 0.9 };
  } },
  // coursed stone wall
  stone: { size: 512, normal: 5, f: (u, v) => {
    const rows = 9, r = Math.floor(v * rows), cu = u * 5 + (r % 2) * 0.5 + hash(r, 1, 3) * 0.3, fx = cu - Math.floor(cu), fy = v * rows - r;
    const id = Math.floor(cu) * 13 + r, edge = Math.min(fx, 1 - fx, fy * 1.6, (1 - fy) * 1.6);
    const block = sm(0.02, 0.08, edge), n = fbm2(u, v, 5, 5, 16);
    const base = mix3(srgb("#9a8f80"), srgb("#7d7266"), hash(id, 2, 5));
    const c = mix3(srgb("#3f3a35"), base.map((x) => x * (0.85 + 0.3 * n)) as number[], block);
    return { c, h: block * (0.7 + 0.3 * n), r: 0.75 + 0.2 * (1 - block) };
  } },
  // weathered wood planks
  wood: { size: 512, normal: 3, f: (u, v) => {
    const P = 6, p = Math.floor(u * P), fx = u * P - p, grain = fbm2(u * 0.2 + p * 0.13, v * 3, 8 + p, 4, 8);
    const gap = sm(0.0, 0.04, Math.min(fx, 1 - fx));
    const c = mix3(srgb("#2a1f17"), mix3(srgb("#6e5340"), srgb("#8a6c52"), grain).map((x) => x * (0.8 + 0.3 * hash(p, 1, 2))) as number[], gap);
    return { c, h: gap * (0.6 + 0.4 * grain), r: 0.8 };
  } },
  // slate roof tiles
  slate: { size: 512, normal: 5, f: (u, v) => {
    const rows = 10, r = Math.floor(v * rows), cu = u * 8 + (r % 2) * 0.5, fx = cu - Math.floor(cu), fy = v * rows - r, id = Math.floor(cu) * 7 + r;
    const lip = sm(0.0, 0.12, fy) * sm(0, 0.05, Math.min(fx, 1 - fx));
    const c = srgb(["#4b4f57", "#565a62", "#41454c"][Math.floor(hash(id, 1, 1) * 3)]).map((x) => x * (0.8 + 0.35 * fbm2(u, v, 2, 3, 32))) as [number, number, number];
    return { c, h: lip * (0.6 + fy * 0.4), r: 0.6 };
  } },
  // red clay roof tiles
  tiles: { size: 512, normal: 5, f: (u, v) => {
    const rows = 12, r = Math.floor(v * rows), cu = u * 10, fx = cu - Math.floor(cu), fy = v * rows - r, id = Math.floor(cu) * 5 + r;
    const bump = Math.sin(fx * Math.PI) * (0.6 + 0.4 * fy);
    const c = srgb(["#9c4a34", "#a85a3e", "#8a3f2e"][Math.floor(hash(id, 3, 1) * 3)]).map((x) => x * (0.75 + 0.35 * bump) * (0.9 + 0.2 * fbm2(u, v, 6, 3, 32))) as [number, number, number];
    return { c, h: bump * sm(0, 0.1, fy), r: 0.7 };
  } },
  // grassy ground with soil patches
  ground: { size: 512, normal: 3, f: (u, v) => {
    const n = fbm2(u, v, 11, 6, 8), soil = sm(0.58, 0.72, fbm2(u, v, 21, 4, 4)), blade = hash(Math.floor(u * 512), Math.floor(v * 512), 3);
    const c = mix3(mix3(srgb("#3f5e2a"), srgb("#6f8a3e"), n), srgb("#5a4632"), soil * 0.8).map((x) => x * (0.85 + 0.3 * blade)) as [number, number, number];
    return { c, h: n * 0.6 + blade * 0.4, r: 0.95 };
  } },
  // frozen soil with frost
  frost: { size: 512, normal: 3, f: (u, v) => {
    const n = fbm2(u, v, 12, 6, 8), fr = sm(0.35, 0.7, fbm2(u, v, 31, 5, 16)), sp = hash(Math.floor(u * 512), Math.floor(v * 512), 9);
    const c = mix3(mix3(srgb("#4c4234"), srgb("#6e6448"), n), srgb("#dfe6ea"), fr * 0.85).map((x) => x * (0.9 + 0.2 * sp)) as [number, number, number];
    return { c, h: n * 0.5 + fr * 0.4, r: 0.6 + 0.35 * (1 - fr) };
  } },
  // bark
  bark: { size: 256, normal: 6, f: (u, v) => {
    const n = fbm2(u * 4, v * 0.6, 7, 5, 8), ridge = Math.abs(Math.sin((u * 14 + n * 2) * Math.PI));
    const c = mix3(srgb("#2e231b"), srgb("#5c4a3a"), ridge * 0.7 + n * 0.3);
    return { c, h: ridge, r: 0.95 };
  } },
  // open-sea wave normals (tileable sum of directional swells + noise), use with a dark glossy material
  waves: { size: 512, normal: 2.2, f: (u, v) => {
    const T = Math.PI * 2;
    const h = 0.35 * Math.sin(T * (u * 3 + v * 2)) + 0.25 * Math.sin(T * (u * -5 + v * 4) + 1.3) + 0.15 * Math.sin(T * (u * 9 - v * 7) + 2.1) + 0.5 * fbm2(u, v, 77, 5, 8);
    return { c: srgb("#1d3a52"), h: h * 0.5 + 0.5, r: 0.12 };
  } },
  // volcanic rock / ash slopes
  volcanic: { size: 512, normal: 5, f: (u, v) => {
    const n = fbm2(u, v, 41, 6, 8), cr = sm(0.45, 0.5, Math.abs(fbm2(u, v, 43, 4, 16) - 0.5) * 2);
    const c = mix3(srgb("#3b3532"), srgb("#6d635a"), n).map((x) => x * (0.75 + 0.3 * cr)) as [number, number, number];
    return { c, h: n * 0.7 + cr * 0.3, r: 0.92 };
  } },
};

const cache = new Map<string, THREE.MeshStandardMaterial>();
/** cached MeshStandardMaterial for a recipe; repeat = texture tiling, extra = material overrides */
export function pbr(name: keyof typeof RECIPES | string, repeat: [number, number] = [1, 1], extra: THREE.MeshStandardMaterialParameters = {}) {
  const key = `${name}|${repeat}|${JSON.stringify(extra)}`;
  let m = cache.get(key);
  if (m) return m;
  const R = RECIPES[name];
  if (!R) throw new Error(`pbr: unknown recipe ${name}`);
  const base = pbrMaps(name as string);
  const t = { map: base.map.clone(), normalMap: base.normalMap.clone(), roughnessMap: base.roughnessMap.clone() };
  for (const x of Object.values(t)) { x.repeat.set(repeat[0], repeat[1]); x.anisotropy = 8; x.needsUpdate = true; }
  m = new THREE.MeshStandardMaterial({ ...t, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(1, 1), ...extra });
  cache.set(key, m);
  return m;
}
const maps = new Map<string, ReturnType<typeof toTextures>>();
export function pbrMaps(name: string) {
  let t = maps.get(name);
  if (!t) { const R = RECIPES[name]; t = toTextures(bake(R.size, R.f), R.size, R.normal); maps.set(name, t); }
  return t;
}
