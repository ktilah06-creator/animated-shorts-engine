// Engine runtime (runs in the headless browser). A film module (videos/<id>/film.ts) exports defineFilm({...});
// the bundler wraps it with boot(), and engine/render.mjs drives it frame by frame through window.__engine.
//
// Determinism: a frame depends only on its frame number. Films must not read clocks or Math.random (use rng()).
// Render chain per layer: scene -> [ink (world outlines)] -> [lens blur pre + main] -> bloom + tone map + grade.
// Crossfades: the outgoing shot is rendered first and copied to a 2D canvas under the WebGL canvas, which is then
// drawn with the incoming shot at partial opacity; the page screenshot captures the composite (and any overlay DOM).
import * as THREE from "three";
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, BlendFunction } from "postprocessing";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { InkPass, noInkFallback, NOINK, type InkOptions } from "./post/ink";
import { LensBlur } from "./post/lensblur";
import { HalfResDof } from "./post/dof";
import { GradeEffect, GRADES, type GradeParams } from "./post/grade";

export { NOINK };

export type ShotDef = {
  id: string;
  a: number;               // first frame (inclusive)
  b: number;               // last frame (exclusive)
  xfade?: number;          // frames at the start of this shot that crossfade from the previous shot
  [k: string]: unknown;    // film-specific fields (light, location, ...)
};

/** What a stage returns for each frame (all optional). */
export type FrameState = {
  focus?: number | THREE.Vector3;   // focus distance (m) or a world point to focus on; default = no DOF
  focusTo?: number | THREE.Vector3; // optional far end of an in-focus RANGE (keeps a whole group sharp; half-res DOF only)
  cInf?: number;                    // blur radius (px at 1080x1920) at infinity; 0 = sharp
  grade?: string | GradeParams;     // preset name in GRADES or explicit params
  gradeAmount?: number;
  exposure?: number;
  ink?: boolean;                    // world outlines on/off for this frame
};

export type Stage = {
  scene: THREE.Scene;
  /** Pose everything for frame f of the given shot (camera included). */
  frame(f: number, shot: ShotDef, cam: THREE.PerspectiveCamera, ctx: Ctx): FrameState | void;
};

export type PostOptions = {
  ink: boolean | InkOptions;
  lens: boolean | "half" | "full";  // depth of field: "half" (default, ~4x cheaper) or "full" resolution
  bloom: boolean | { intensity?: number; threshold?: number; radius?: number };
  grade: boolean;
  multisampling: number;            // MSAA samples of the main buffer (4 final; previews may use 0)
};

export type FilmDef = {
  id: string;
  fps?: number;
  width?: number;
  height?: number;
  background?: string;               // page colour behind everything (visible only if a layer is transparent)
  shots: ShotDef[];
  flashes?: { at: number; len: number; color?: string; curve?: number[] }[];
  /** sound events in frames (picked up by the film's sound script via `cli timeline` / `cli sound`) */
  sound?: SoundEvent[];
  post?: Partial<PostOptions>;
  camera?: { fov?: number; near?: number; far?: number };
  setup(ctx: Ctx): Promise<Stage> | Stage;
};

export type SoundEvent = { f: number; kind: string; gain?: number; pan?: number; dur?: number; [k: string]: unknown };
export const defineFilm = (f: FilmDef): FilmDef => f;

/** Everything a film can use during setup and per frame. */
export type Ctx = {
  renderer: THREE.WebGLRenderer;
  width: number; height: number;    // render size in px (after preview scaling)
  scale: number;                    // render size / nominal size (0.5 for half-size previews)
  pxScale: number;                  // render height / 1920: multiply any pixel-sized parameter by this
  fps: number;
  overlay: HTMLDivElement;          // DOM layer above the 3D picture (labels, diagrams), sized to the frame
  /** URL of a file in videos/<id>/public/ */
  asset(file: string): string;
  /** URL of a file of an approved library version, e.g. lib("model/lantern", 1, "lantern.glb") */
  lib(id: string, version: number, file: string): string;
  loadGLTF(url: string): Promise<THREE.Group>;
  loadTexture(url: string): Promise<THREE.Texture>;
};

// ---------------------------------------------------------------- deterministic helpers
/** Seeded PRNG (mulberry32). Same seed, same sequence, every render. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- boot
type Meta = { id: string; fps: number; width: number; height: number; frames: number; shots: ShotDef[]; flashes: { at: number; len: number }[]; sound: SoundEvent[] };

declare global {
  interface Window {
    __engine?: { ready: Promise<Meta>; frame(f: number): Promise<void>; meta?: Meta; error?: string };
  }
}

function q(name: string): string | null { return new URLSearchParams(location.search).get(name); }

export function boot(film: FilmDef) {
  const ready = start(film).catch((e) => {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    window.__engine!.error = msg;
    throw e;
  });
  window.__engine = { ready: ready.then((r) => r.meta), frame: async (f) => (await ready).frame(f) };
}

async function start(film: FilmDef) {
  const fps = film.fps ?? 30, W0 = film.width ?? 1080, H0 = film.height ?? 1920;
  const scale = Number(q("scale") ?? 1);
  const width = Math.round(W0 * scale), height = Math.round(H0 * scale);
  const postOverride = q("post") ? (JSON.parse(q("post")!) as Partial<PostOptions>) : {};
  const post: PostOptions = { ink: true, lens: true, bloom: true, grade: true, multisampling: 4, ...film.post, ...postOverride };

  // page: [snapshot 2D canvas] [WebGL canvas] [overlay DOM] [flash]
  document.body.style.background = film.background ?? "#000";
  const frameEl = document.createElement("div");
  Object.assign(frameEl.style, { position: "relative", width: `${width}px`, height: `${height}px`, overflow: "hidden", background: film.background ?? "#000" });
  frameEl.id = "frame";
  document.body.appendChild(frameEl);
  const abs = (el: HTMLElement) => { Object.assign(el.style, { position: "absolute", left: "0", top: "0", width: `${width}px`, height: `${height}px` }); return el; };
  const snap = abs(document.createElement("canvas")); snap.width = width; snap.height = height; snap.style.display = "none";
  const renderer = new THREE.WebGLRenderer({ antialias: false, stencil: false, depth: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // tone mapping happens in the post chain
  const gl = abs(renderer.domElement);
  const overlay = abs(document.createElement("div")) as HTMLDivElement; overlay.style.pointerEvents = "none";
  const flash = abs(document.createElement("div")); flash.style.opacity = "0";
  frameEl.append(snap, gl, overlay, flash);

  const gltf = new GLTFLoader();
  const texLoader = new THREE.TextureLoader();
  const ctx: Ctx = {
    renderer, width, height, scale, pxScale: height / 1920, fps, overlay,
    asset: (file) => `/film/${file}`,
    lib: (id, version, file) => `/lib/${id}/v${String(version).padStart(3, "0")}/${file}`,
    loadGLTF: async (url) => (await gltf.loadAsync(url)).scene,
    loadTexture: async (url) => { const t = await texLoader.loadAsync(url); t.colorSpace = THREE.SRGBColorSpace; return t; },
  };
  await document.fonts.ready;

  const cam = new THREE.PerspectiveCamera(film.camera?.fov ?? 40, width / height, film.camera?.near ?? 0.2, film.camera?.far ?? 1500);
  const stage = await film.setup(ctx);
  const scene = stage.scene;

  // ---- post chain
  const composer = new EffectComposer(renderer, { multisampling: post.multisampling, frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, cam));
  const ink = post.ink ? new InkPass(scene, cam, typeof post.ink === "object" ? post.ink : {}) : null;
  if (ink) composer.addPass(ink);
  else cam.layers.enable(NOINK);
  // depth of field; its passes are switched off on frames without blur (cInf 0), which skips their cost entirely
  let lens: { focus: number; cInf: number; focusFar?: number } | null = null;
  let lensPasses: { enabled: boolean }[] = [];
  if (post.lens === "full") {
    const lb = new LensBlur({ maxCoC: 24, nearScale: 1.2 });
    lensPasses = [new EffectPass(cam, lb.pre), new EffectPass(cam, lb.main)];
    lens = lb as unknown as { focus: number; cInf: number };
  } else if (post.lens) {
    const d = new HalfResDof(cam, { maxCoC: 24, nearScale: 1.2 });
    lensPasses = [d];
    lens = d as unknown as { focus: number; cInf: number };
  }
  for (const p of lensPasses) composer.addPass(p as never);
  const finals = [];
  if (post.bloom) {
    const o = typeof post.bloom === "object" ? post.bloom : {};
    const bloom = new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: o.intensity ?? 0.5, luminanceThreshold: o.threshold ?? 1.0,
      luminanceSmoothing: 0.2, mipmapBlur: true, levels: 6, radius: o.radius ?? 0.6 });
    // the MIP chain always starts at 1920 px tall, so a glow has the same size relative to the frame at any render size
    const mip = (bloom as unknown as { mipmapBlurPass: { setSize(w: number, h: number): void } }).mipmapBlurPass;
    const setSize = mip.setSize.bind(mip);
    mip.setSize = (w: number, h: number) => setSize(Math.round((1920 * w) / Math.max(h, 1)), 1920);
    finals.push(bloom);
  }
  finals.push(new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }));
  const grade = post.grade ? new GradeEffect(GRADES.neutral, 1) : null;
  if (grade) finals.push(grade);
  composer.addPass(new EffectPass(cam, ...finals));

  const shots = film.shots.slice().sort((x, y) => x.a - y.a);
  const frames = shots.length ? shots[shots.length - 1].b : 0;
  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
  let gradeKey: unknown = null;

  const renderLayer = (f: number, shot: ShotDef) => {
    const st = (stage.frame(f, shot, cam, ctx) ?? {}) as FrameState;
    cam.aspect = width / height;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    if (ink) { ink.enabled = st.ink !== false; noInkFallback(scene); }
    if (lens) {
      const cInf = st.cInf ?? 0;
      lens.cInf = cInf;
      for (const p of lensPasses) p.enabled = cInf >= 0.25;
      if (cInf > 0) {
        let d = 10;
        if (typeof st.focus === "number") d = st.focus;
        else if (st.focus) { cam.getWorldDirection(fwd); d = tmp.copy(st.focus).sub(cam.position).dot(fwd); }
        d = Math.max(0.3, d);
        let d2 = 0;
        if (typeof st.focusTo === "number") d2 = st.focusTo;
        else if (st.focusTo) { cam.getWorldDirection(fwd); d2 = Math.max(0.3, tmp.copy(st.focusTo).sub(cam.position).dot(fwd)); }
        lens.focus = d2 ? Math.min(d, d2) : d;          // (lens.focus is write-only: work with local distances)
        if ("focusFar" in lens) lens.focusFar = d2 ? Math.max(d, d2) : 0;
      }
    }
    if (grade) {
      const g = st.grade ?? "neutral";
      const gk = typeof g === "string" ? g : JSON.stringify(g);
      if (gk !== gradeKey) { grade.set(typeof g === "string" ? (GRADES[g] ?? GRADES.neutral) : g); gradeKey = gk; }
      grade.amount = st.gradeAmount ?? 1;
    }
    renderer.toneMappingExposure = st.exposure ?? 1;
    composer.render(1 / fps);
  };

  const shotAt = (f: number) => {
    let i = shots.findIndex((s) => f >= s.a && f < s.b);
    if (i < 0) i = f < 0 ? 0 : shots.length - 1;
    return i;
  };

  const frame = async (f: number) => {
    const i = shotAt(f), s = shots[i];
    const xf = s.xfade ?? 0;
    if (i > 0 && xf > 0 && f < s.a + xf) {
      renderLayer(f, shots[i - 1]);
      const c2 = snap.getContext("2d")!;
      c2.drawImage(gl, 0, 0);
      snap.style.display = "block";
      renderLayer(f, s);
      gl.style.opacity = String((f - s.a + 1) / (xf + 1));
    } else {
      snap.style.display = "none";
      gl.style.opacity = "1";
      renderLayer(f, s);
    }
    let fl = 0, flc = "#ffffff";
    for (const x of film.flashes ?? []) {
      if (f >= x.at && f < x.at + x.len) {
        const curve = x.curve ?? Array.from({ length: x.len }, (_, k) => 1 - k / x.len);
        fl = curve[f - x.at] ?? 0; flc = x.color ?? "#ffffff";
      }
    }
    flash.style.background = flc;
    flash.style.opacity = String(fl);
    // make sure the GL commands finished before the screenshot is taken
    renderer.getContext().finish();
  };

  const meta: Meta = { id: film.id, fps, width, height, frames, shots, flashes: (film.flashes ?? []).map((x) => ({ at: x.at, len: x.len })), sound: (film.sound ?? []).slice().sort((a, b) => a.f - b.f) };
  window.__engine!.meta = meta;
  return { meta, frame };
}
