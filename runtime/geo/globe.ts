// Stylised globe (engine-owned): Natural Earth land painted on an equirectangular canvas with paper grain and ink
// coastlines, soft day/night terminator, atmosphere rim, up to 4 highlightable regions, a northern / southern
// hemisphere tint, and an aerosol / haze veil that spreads from a source point. Reusable for any geography shot.
//
//   const globe = await Globe.create(ctx, { radius: 5, regions: { na: (p) => p.CONTINENT === "North America", ... } });
//   scene.add(globe.root);
//   globe.update({ sunDir, hi: { na: 1 }, north: 0.6, veil: { spread: 0.4, opacity: 0.8 } });
//   globe.at(lat, lon, alt)   -> world position on the surface (for labels, arcs, pins)
import * as THREE from "three";
import type { Ctx } from "../film";
import { NOINK } from "../post/ink";

type Props = Record<string, unknown>;
type Geo = { features: { properties: Props; geometry: { type: string; coordinates: number[][][] | number[][][][] } }[] };

export type GlobeOpts = {
  radius?: number;
  data?: [string, number];                         // library id + version of the Natural Earth data
  regions?: Record<string, (p: Props) => boolean>;  // up to 4, by country properties (CONTINENT, NAME, ISO_A3 ...)
  ocean?: [string, string];                         // deep, shallow
  land?: string; landShade?: string; ink?: string;
  hiColors?: string[];                              // highlight colour per region (in order)
  texW?: number;
};

const VERT = /* glsl */ `varying vec3 vN; varying vec2 vUv; varying vec3 vP;
void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const FRAG = /* glsl */ `uniform sampler2D map; uniform sampler2D mask; uniform vec3 sunDir; uniform vec4 hiAmt; uniform vec3 hi0, hi1, hi2, hi3;
uniform vec3 north; uniform float northAmt; uniform vec3 nightCol; uniform float ambient;
varying vec3 vN; varying vec2 vUv; varying vec3 vP;
void main(){
  vec3 c = texture2D(map, vUv).rgb;
  vec4 m = texture2D(mask, vUv);
  float land = step(0.5, m.a);
  c = mix(c, hi0 * (0.75 + 0.25 * c.g), hiAmt.x * m.r);
  c = mix(c, hi1 * (0.75 + 0.25 * c.g), hiAmt.y * m.g);
  c = mix(c, hi2 * (0.75 + 0.25 * c.g), hiAmt.z * m.b);
  float lat = asin(clamp(normalize(vP).y, -1.0, 1.0));
  float nh = smoothstep(-0.02, 0.06, lat);
  c = mix(c, c * north * 1.25, northAmt * nh);
  float l = dot(normalize(vN), normalize(sunDir));
  float lit = smoothstep(-0.12, 0.22, l);
  vec3 col = mix(c * nightCol, c * (ambient + (1.0 - ambient) * (0.55 + 0.45 * max(l, 0.0))), lit);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
const ATM_FRAG = /* glsl */ `uniform vec3 col; uniform vec3 sunDir; varying vec3 vN; varying vec3 vV;
void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.6);
  float day = 0.35 + 0.65 * smoothstep(-0.3, 0.4, dot(normalize(vN), normalize(sunDir)));
  gl_FragColor = vec4(col * f * day, f * day); }`;
const ATM_VERT = /* glsl */ `varying vec3 vN; varying vec3 vV;
void main(){ vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const VEIL_FRAG = /* glsl */ `uniform vec3 src; uniform float spread; uniform float opacity; uniform vec3 col; uniform float t;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h(i), h(i+vec3(1,0,0)), f.x), mix(h(i+vec3(0,1,0)), h(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h(i+vec3(0,0,1)), h(i+vec3(1,0,1)), f.x), mix(h(i+vec3(0,1,1)), h(i+vec3(1,1,1)), f.x), f.y), f.z); }
void main(){
  vec3 p = normalize(vP);
  float ang = acos(clamp(dot(p, normalize(src)), -1.0, 1.0));           // angular distance from the source
  // stratospheric winds carry it zonally first: stretch the reach along latitude bands
  float lat = asin(p.y), slat = asin(normalize(src).y);
  float zonal = ang * mix(1.0, 0.45, smoothstep(0.0, 0.5, 1.0 - abs(lat - slat)));
  float cover = 1.0 - smoothstep(spread * 3.3 - 0.35, spread * 3.3, zonal);
  float bands = 0.55 + 0.45 * n3(vec3(p.x * 3.0, p.y * 9.0 + t * 0.05, p.z * 3.0) + t * 0.02);
  float limb = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
  float a = opacity * cover * bands * (0.45 + 0.55 * limb);
  gl_FragColor = vec4(col, a);
}`;
const VEIL_VERT = /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){ vP = position; vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

export class Globe {
  readonly root = new THREE.Group();
  readonly body: THREE.Mesh;
  readonly regionNames: string[];
  private U: Record<string, THREE.IUniform>;
  private atmU: Record<string, THREE.IUniform>;
  private veilU: Record<string, THREE.IUniform>;
  private veil: THREE.Mesh;
  private constructor(public radius: number, map: THREE.Texture, mask: THREE.Texture, o: GlobeOpts, names: string[]) {
    this.regionNames = names;
    const hc = (o.hiColors ?? ["#f4b544", "#f07862", "#e2553f", "#35afa4"]).map((c) => new THREE.Color(c));
    this.U = { map: { value: map }, mask: { value: mask }, sunDir: { value: new THREE.Vector3(1, 0.3, 1) }, hiAmt: { value: new THREE.Vector4() },
      hi0: { value: hc[0] }, hi1: { value: hc[1] }, hi2: { value: hc[2] }, hi3: { value: hc[3] },
      north: { value: new THREE.Color("#9fc4ff") }, northAmt: { value: 0 }, nightCol: { value: new THREE.Color(0.16, 0.2, 0.36) }, ambient: { value: 0.35 } };
    this.body = new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 64), new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: VERT, fragmentShader: FRAG }));
    this.atmU = { col: { value: new THREE.Color("#8fc8ff") }, sunDir: this.U.sunDir };
    const atm = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.045, 96, 48), new THREE.ShaderMaterial({ uniforms: this.atmU, vertexShader: ATM_VERT, fragmentShader: ATM_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide }));
    this.veilU = { src: { value: new THREE.Vector3() }, spread: { value: 0 }, opacity: { value: 0 }, col: { value: new THREE.Color("#f3e3c4") }, t: { value: 0 } };
    this.veil = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.022, 128, 64), new THREE.ShaderMaterial({ uniforms: this.veilU, vertexShader: VEIL_VERT, fragmentShader: VEIL_FRAG,
      transparent: true, depthWrite: false }));
    for (const m of [this.body, atm, this.veil]) m.layers.set(NOINK);
    this.root.add(this.body, this.veil, atm);
  }

  static async create(ctx: Ctx, o: GlobeOpts = {}) {
    const [id, ver] = o.data ?? ["data/natural-earth", 1];
    const [land, countries] = await Promise.all(["ne_50m_land.geojson", "ne_110m_admin_0_countries.geojson"].map(async (f) => (await fetch(ctx.lib(id, ver, f))).json() as Promise<Geo>));
    const W = o.texW ?? 4096, H = W / 2;
    const P = (lon: number, lat: number, w: number, h: number): [number, number] => [((lon + 180) / 360) * w, ((90 - lat) / 180) * h];
    const polys = (g: Geo) => g.features.flatMap((f) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][])).map((poly) => ({ props: f.properties, poly })));
    // all polygons of a set as ONE Path2D (one fill / stroke call instead of thousands)
    const pathOf = (list: { poly: number[][][] }[], w: number, h: number) => {
      const p2 = new Path2D();
      for (const { poly } of list) for (const ring of poly) { ring.forEach(([lon, lat], i) => { const [x, y] = P(lon, lat, w, h); if (i) p2.lineTo(x, y); else p2.moveTo(x, y); }); p2.closePath(); }
      return p2;
    };
    // colour map: ocean gradient + graticule, land with paper grain, ink coast
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d", { willReadFrequently: true })!;  // CPU raster: far faster than SwiftShader GPU canvas
    const [deep, shallow] = o.ocean ?? ["#1f4f86", "#3f86b8"];
    const og = g.createLinearGradient(0, 0, 0, H); og.addColorStop(0, deep); og.addColorStop(0.5, shallow); og.addColorStop(1, deep);
    g.fillStyle = og; g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(255,255,255,0.10)"; g.lineWidth = W / 2048;
    for (let lon = -180; lon <= 180; lon += 15) { const [x] = P(lon, 0, W, H); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let lat = -75; lat <= 75; lat += 15) { const [, y] = P(0, lat, W, H); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const L = polys(land), LP = pathOf(L, W, H);
    // coastal shallows halo, then land
    g.strokeStyle = "rgba(160,215,230,0.35)"; g.lineWidth = W / 300; g.lineJoin = "round";
    g.stroke(LP);
    g.fillStyle = o.land ?? "#9fbf6a";
    g.fill(LP, "evenodd");
    // latitude tint: drier/yellower toward the tropics, cooler toward the poles (clipped to land)
    g.save(); g.globalCompositeOperation = "source-atop";
    const lg = g.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0, "rgba(235,240,245,0.85)"); lg.addColorStop(0.12, "rgba(160,170,140,0.25)"); lg.addColorStop(0.35, "rgba(0,0,0,0)");
    lg.addColorStop(0.43, "rgba(214,190,110,0.35)"); lg.addColorStop(0.5, "rgba(0,0,0,0)"); lg.addColorStop(0.57, "rgba(214,190,110,0.35)");
    lg.addColorStop(0.68, "rgba(0,0,0,0)"); lg.addColorStop(0.9, "rgba(235,240,245,0.85)");
    g.restore();
    const tint = document.createElement("canvas"); tint.width = W; tint.height = H;
    const tg = tint.getContext("2d", { willReadFrequently: true })!; tg.fillStyle = lg; tg.fillRect(0, 0, W, H);
    tg.globalCompositeOperation = "destination-in"; tg.fillStyle = "#000";
    tg.fill(LP, "evenodd");
    g.drawImage(tint, 0, 0);
    // paper grain (deterministic)
    let s = 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < W * 6; i++) { g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"; g.fillRect(r() * W, r() * H, 2 + r() * 4, 1 + r() * 2); }
    g.strokeStyle = o.ink ?? "#2b2230"; g.lineWidth = W / 1400;
    g.stroke(LP);
    // region mask: R,G,B = regions 0..2 (region 3 unused in the mask for now), A = land
    const names = Object.keys(o.regions ?? {}).slice(0, 3);
    const mw = W / 2, mh = H / 2;
    const mc = document.createElement("canvas"); mc.width = mw; mc.height = mh;
    const mg = mc.getContext("2d", { willReadFrequently: true })!;
    mg.fillStyle = "rgba(0,0,0,0)"; mg.clearRect(0, 0, mw, mh);
    mg.globalCompositeOperation = "lighter";
    const C = polys(countries);
    names.forEach((n, i) => {
      const test = o.regions![n];
      mg.fillStyle = ["rgba(255,0,0,1)", "rgba(0,255,0,1)", "rgba(0,0,255,1)"][i];
      mg.fill(pathOf(C.filter(({ props }) => test(props)), mw, mh), "evenodd");
    });
    mg.globalCompositeOperation = "source-over";
    const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    const mask = new THREE.CanvasTexture(mc); mask.colorSpace = THREE.NoColorSpace; mask.premultiplyAlpha = false;
    return new Globe(o.radius ?? 5, map, mask, o, names);
  }

  /** local -> world position of a point at (lat, lon) degrees, alt in globe radii above the surface */
  at(lat: number, lon: number, alt = 0, out = new THREE.Vector3()) {
    const la = THREE.MathUtils.degToRad(lat), ph = THREE.MathUtils.degToRad(lon + 180), r = this.radius * (1 + alt);
    out.set(-Math.cos(ph) * Math.cos(la) * r, Math.sin(la) * r, Math.sin(ph) * Math.cos(la) * r);
    return this.root.localToWorld(out);
  }
  /** world position of the globe centre */
  center(out = new THREE.Vector3()) { this.root.updateMatrixWorld(true); return this.root.getWorldPosition(out); }
  /** rotate the globe so (lat, lon) faces `toward` (world direction from the globe centre, e.g. to the camera),
   *  keeping north up on screen; tiltDeg tips the north pole toward the viewer */
  face(lat: number, lon: number, toward: THREE.Vector3, tiltDeg = 0) {
    const la = THREE.MathUtils.degToRad(lat), ph = THREE.MathUtils.degToRad(lon + 180);
    const local = new THREE.Vector3(-Math.cos(ph) * Math.cos(la), Math.sin(la), Math.sin(ph) * Math.cos(la));
    const T = toward.clone().normalize();
    const q1 = new THREE.Quaternion().setFromUnitVectors(local, T);
    const north = new THREE.Vector3(0, 1, 0).applyQuaternion(q1);
    const up = new THREE.Vector3(0, 1, 0);
    const proj = (v: THREE.Vector3) => v.clone().sub(T.clone().multiplyScalar(v.dot(T))).normalize();
    const a = proj(north), b = proj(up);
    let ang = Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
    if (new THREE.Vector3().crossVectors(a, b).dot(T) < 0) ang = -ang;
    const q2 = new THREE.Quaternion().setFromAxisAngle(T, ang);
    const q3 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().crossVectors(T, up).normalize(), THREE.MathUtils.degToRad(-tiltDeg));
    this.root.quaternion.copy(q3.multiply(q2.multiply(q1)));
    this.root.updateMatrixWorld(true);
  }
  /** great-circle arc (world points), lifted toward the middle by `lift` radii */
  arc(a: [number, number], b: [number, number], n = 64, lift = 0.12) {
    const C = this.center();
    const A = this.at(a[0], a[1]).sub(C).normalize(), B = this.at(b[0], b[1]).sub(C).normalize();
    const out: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, v = new THREE.Vector3().copy(A).lerp(B, t).normalize();
      out.push(v.multiplyScalar(this.radius * (1.01 + lift * Math.sin(Math.PI * t))).add(C));
    }
    return out;
  }

  update(o: { sunDir?: THREE.Vector3; hi?: Record<string, number>; north?: number; northColor?: string; veil?: { src?: [number, number]; spread: number; opacity: number }; t?: number }) {
    if (o.sunDir) this.U.sunDir.value.copy(o.sunDir).normalize();
    const v = this.U.hiAmt.value as THREE.Vector4;
    v.set(0, 0, 0, 0);
    this.regionNames.forEach((n, i) => v.setComponent(i, o.hi?.[n] ?? 0));
    this.U.northAmt.value = o.north ?? 0;
    if (o.northColor) this.U.north.value.set(o.northColor);
    if (o.veil) {
      if (o.veil.src) { const la = THREE.MathUtils.degToRad(o.veil.src[0]), ph = THREE.MathUtils.degToRad(o.veil.src[1] + 180); this.veilU.src.value.set(-Math.cos(ph) * Math.cos(la), Math.sin(la), Math.sin(ph) * Math.cos(la)); } // local (shader works in local space)
      this.veilU.spread.value = o.veil.spread; this.veilU.opacity.value = o.veil.opacity;
    } else this.veilU.opacity.value = 0;
    this.veilU.t.value = o.t ?? 0;
    this.veil.visible = this.veilU.opacity.value > 0.001;
  }
}

/** a star field on a large sphere (NOINK, no fog), deterministic */
export function starField(count = 2500, radius = 400, seed = 3) {
  let s = seed * 7919 + 1; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u);
    p[i * 3] = q * Math.cos(a) * radius; p[i * 3 + 1] = u * radius; p[i * 3 + 2] = q * Math.sin(a) * radius;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: "#e8eeff", size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
  pts.layers.set(NOINK); pts.frustumCulled = false;
  return pts;
}

/** a dashed arc drawn on progressively (instanced dots), plus helpers for a location pin */
export class GlobeArc {
  readonly mesh: THREE.InstancedMesh;
  private pts: THREE.Vector3[];
  constructor(points: THREE.Vector3[], { color = "#ffd36b", size = 0.07, every = 2 } = {}) {
    this.pts = points.filter((_, i) => i % every === 0);
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(size, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.4) }), this.pts.length);
    this.mesh.layers.set(NOINK);
    this.mesh.frustumCulled = false;
    this.progress = 0;
  }
  set progress(p: number) {
    const n = Math.round(this.pts.length * Math.min(1, Math.max(0, p))), m = new THREE.Matrix4();
    this.pts.forEach((v, i) => { m.makeScale(i < n ? 1 : 0, i < n ? 1 : 0, i < n ? 1 : 0).setPosition(v); this.mesh.setMatrixAt(i, m); });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** a map pin: a ring and a dot that can pulse (world position, facing outward from the globe centre) */
export function globePin(color = "#e2553f") {
  const g = new THREE.Group();
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.3) }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 32), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide }));
  g.add(dot, ring); g.traverse((o) => o.layers.set(NOINK));
  return {
    group: g,
    place(p: THREE.Vector3, center: THREE.Vector3) { g.position.copy(p); g.lookAt(p.clone().sub(center).multiplyScalar(2).add(center)); },
    pulse(t: number) { const k = (t % 1); ring.scale.setScalar(1 + k * 2.2); (ring.material as THREE.MeshBasicMaterial).opacity = 1 - k; },
  };
}
