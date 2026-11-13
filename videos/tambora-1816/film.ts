// "The Year Without a Summer" (Tambora 1815 -> 1816), cinematic documentary cut (review 4 style). ~79.7 s, 1080x1920, 30 fps.
// Voice-over: public/vo_tight.wav (the original read with long pauses shortened; no words changed). Every shot is laid
// on its sentence cues (cues.json); key words drive events (eruption, labels, scattering, prices, title).
// Previous cartoon cut: film_cartoon_v2.ts.txt (kept for reference).
import * as THREE from "three";
import { defineFilm, rng, type ShotDef, type FrameState } from "@engine/film";
import { makeCues } from "@engine/cues";
import { CineRig, mixCine, CINE, type CinePreset } from "@engine/look/cine";
import { pbrMaps } from "@engine/look/pbr";
import { V } from "@engine/env/geo";
import { heroLeaf, flakeTexture, wheatField, grassField } from "@engine/env/foliage";
import { volcanoIsland } from "@engine/env/terrain";
import { Fall } from "@engine/fx/particles";
import { EruptionColumn } from "@engine/fx/column";
import { PyroFlows } from "@engine/fx/pyro";
import { NOINK } from "@engine/post/ink";
import { Actor } from "@engine/chars/actor";
import { idle, blend, ease, shiver } from "@engine/chars/clips";
import { Label, loadFontUrl } from "@engine/overlay/label";
import { Inset, SO2_OXIDATION } from "@engine/overlay/inset";
import { Thermometer } from "@engine/overlay/thermometer";
import { Globe, GlobeArc, globePin, starField } from "@engine/geo/globe";
import { applyCam, smootherstep, type CamPose } from "@engine/camera";
import type { Pose } from "@engine/chars/toon";
import cueData from "./cues.json";
import { FARMER_WOMAN, FARMER_MAN, CHILD } from "./cast";
import { buildVillage2 } from "./village2";
import { buildScience } from "./science";

const FPS = 30;
const cues = makeCues(cueData, FPS);
const S = (i: number) => cues.sentence(i).a;
const W = (w: string, after: number) => cues.word(w, after);
const END = cues.frames + 40;                                   // ~1.3 s after the last word

// set locations (far apart in one world)
const LEAF = V(2.6, 0.95, 12.5), VOLC = V(-30000, 0, 0), SCI = V(9000, 0, 0), FIELD = V(3000, 0, 0), GLOBE = V(0, -60000, 0);
const SQ = V(-4.2, 0, -23);                                      // market corner of the village square
const TAMBORA: [number, number] = [-8.25, 118.0];

const T = {
  snow: W("snow", 0), y1816: S(2), na: W("North", S(2)), eu: W("Europe.", S(2)), away: S(3), tambora: S(4), mount: W("Mount", S(4)),
  unleashed: W("unleashed", S(4)), so2: S(5), sulfur: W("sulfur", S(5)), aero: S(6), transformed: W("transformed", S(6)),
  sulfate: W("sulfate", S(6)), spread: W("spread", S(6)), reflected: W("reflected", S(6)), less: S(7), temps: S(8), north: S(9),
  northern: W("Northern", S(9)), cold: S(10), rain: W("rain,", S(10)), snowfall: W("snowfall.", S(10)), crops: S(11),
  harvests: W("harvests", S(11)), hardship: S(12), prices: W("prices", S(12)), conseq: S(13), title: S(14), last: S(15),
};
const TITLE_AT = END - 85;                                       // closing title: last ~2.8 s, held to the final frame

const shots: ShotDef[] = [
  { id: "01-leaf", a: 0, b: 62, set: "village" },
  { id: "02-reveal", a: 62, b: T.y1816, set: "village" },
  { id: "03-globe", a: T.y1816, b: T.tambora, set: "globe", xfade: 10 },
  { id: "04-eruption", a: T.tambora, b: T.so2, set: "volcano", xfade: 10 },
  { id: "05-so2", a: T.so2, b: T.aero, set: "science", xfade: 10 },
  { id: "06-aerosols", a: T.aero, b: T.temps, set: "science" },
  { id: "07-cooling", a: T.temps, b: T.north, set: "village", xfade: 10 },
  { id: "08-north", a: T.north, b: T.cold, set: "globe", xfade: 10 },
  { id: "09-cold", a: T.cold, b: T.rain - 12, set: "village", xfade: 10 },
  { id: "10-rain", a: T.rain - 12, b: T.snowfall - 14, set: "village", xfade: 6 },
  { id: "11-summer-snow", a: T.snowfall - 14, b: T.crops, set: "village", xfade: 6 },
  { id: "12-harvest", a: T.crops, b: T.hardship, set: "field", xfade: 8 },
  { id: "13-prices", a: T.hardship, b: T.conseq, set: "village", xfade: 10 },
  { id: "14-far-beyond", a: T.conseq, b: T.title, set: "volcano", xfade: 12 },
  { id: "15-leaf-frozen", a: T.title, b: T.last, set: "village", xfade: 12 },
  { id: "16-closing", a: T.last, b: END, set: "village", xfade: 12 },
];

// ---------------------------------------------------------------- sound events (frames; rendered by sound.py)
const bed = (kind: string, a: number, b: number, gain = 1) => ({ f: a, kind, dur: (b - a) / FPS, gain });
const ev = (kind: string, f: number, gain = 1, extra: Record<string, unknown> = {}) => ({ f, kind, gain, ...extra });
const SOUND = [
  bed("birds", 0, T.snow + 6, 0.7), bed("breeze", 0, T.y1816, 0.55), bed("hush", 20, T.y1816 + 6, 0.7), ev("sparkle", 18, 0.55),
  ev("whoosh", T.y1816 - 6, 0.6), bed("space", T.y1816, T.tambora + 6, 0.6),
  ev("pop", W("1816,", T.y1816) - 2, 0.55), ev("pop", T.na - 2, 0.5, { pitch: 1.12 }), ev("pop", T.eu - 2, 0.5, { pitch: 1.25 }),
  ...Array.from({ length: 10 }, (_, i) => ev("tick", T.away + 30 + i * 5, 0.3, { pitch: 1 + i * 0.04 })),
  ev("whoosh", T.tambora - 6, 0.6), bed("waves", T.tambora, T.so2 + 6, 0.8), bed("rumble", T.tambora + 20, T.unleashed + 4, 0.4),
  ev("pop", T.mount - 4, 0.5), ev("boom", T.unleashed, 1.0), bed("rumble", T.unleashed, T.so2 + 30, 1.0),
  ev("whoosh", T.so2 - 6, 0.6), bed("rumble", T.so2, T.less, 0.3), ev("pop", T.sulfur - 4, 0.55),
  ev("airy", T.transformed, 0.55, { dur: 3 }), ev("pop", T.transformed - 2, 0.5), ev("pop", T.sulfate - 2, 0.5, { pitch: 1.15 }),
  ev("zip", T.reflected - 30, 0.45), ev("zip", T.reflected - 24, 0.45), ev("zip", T.reflected - 18, 0.45),
  ev("sparkle", T.reflected + 2, 0.4, { pitch: 0.9 }), ev("pop", T.reflected + 6, 0.4), ev("pop", T.less - 2, 0.45, { pitch: 0.85 }),
  ev("whoosh", T.temps - 6, 0.55), bed("wind", T.temps, T.north + 6, 0.6),
  ...Array.from({ length: 10 }, (_, i) => ev("tick", T.temps + 4 + i * 4, 0.3, { pitch: 1.3 - i * 0.05 })),
  ev("whoosh", T.north - 6, 0.55), bed("space", T.north, T.cold + 6, 0.6), ev("sparkle", T.northern, 0.45, { pitch: 0.8 }),
  ev("whoosh", T.cold - 6, 0.55), bed("wind", T.cold, T.crops, 0.8), bed("murmur", T.cold, T.rain - 12, 0.45),
  bed("rain", T.rain - 12, T.snowfall - 10, 1.0), bed("hush", T.snowfall - 14, T.hardship, 0.7),
  ev("thud", T.harvests + 6, 0.6),
  bed("murmur", T.hardship, T.conseq, 0.55), bed("wind", T.hardship, T.conseq + 6, 0.45), ev("clack", T.prices - 4, 0.6),
  ev("whoosh", T.conseq - 6, 0.55), bed("rumble", T.conseq, T.title, 0.35), bed("wind", T.conseq, T.title + 6, 0.5), ev("airy", T.conseq + 30, 0.45, { dur: 4 }),
  ev("whoosh", T.title - 6, 0.5), bed("hush", T.title, END, 0.75), bed("wind", T.title, END, 0.35), ev("sparkle", T.title + 10, 0.4, { pitch: 0.75 }),
  ev("chime", TITLE_AT + 4, 0.8),
];

const GLOBE_CAM: CamPose = { pos: [GLOBE.x, GLOBE.y + 0.3, GLOBE.z + 19], look: [GLOBE.x, GLOBE.y + 0.3, GLOBE.z], fov: 36 };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const k01 = (f: number, a: number, b: number) => Math.min(1, Math.max(0, (f - a) / (b - a)));
const ss = (f: number, a: number, b: number) => smootherstep(k01(f, a, b));

export default defineFilm({
  id: "tambora-1816",
  shots,
  flashes: [{ at: T.unleashed, len: 7, curve: [1, 0.85, 0.6, 0.4, 0.22, 0.1, 0.03] }],
  sound: SOUND,
  post: { ink: false, tone: "agx", godrays: true, grain: 0.07, vignette: 0.42, ca: 0.0007 },
  camera: { near: 0.01, far: 12000 },
  async setup(ctx) {
    await Promise.all([loadFontUrl(ctx.asset("fonts/Inter-Variable.ttf"), "Inter"), loadFontUrl(ctx.asset("fonts/Cinzel-Variable.ttf"), "Cinzel")]);
    const scene = new THREE.Scene();
    const cine = new CineRig(scene, ctx.renderer);
    const r = rng(9);

    // ---------------------------------------------------------------- village, leaf, meadow
    buildVillage2(scene, V(0, 0, 0), { snow: 0.25 });
    const meadow = grassField({ w: 18, d: 14, count: 34000, h: 0.34, seed: 8, frost: 0.55 }); meadow.position.set(0.6, 0, 27); scene.add(meadow);
    const leaf = heroLeaf({ length: 0.13 }); leaf.position.copy(LEAF); leaf.rotation.set(0.1, 0.35, 0.18); scene.add(leaf);
    // flakes that settle on the leaf over the opening (and are all there in the bookend shot)
    const landed: { m: THREE.Mesh; t: number }[] = [];
    for (let i = 0; i < 40; i++) {
      const fm = new THREE.MeshStandardMaterial({ map: flakeTexture(1 + (i % 4)), transparent: true, depthWrite: false, roughness: 0.4, emissive: new THREE.Color("#b8c6da"), emissiveIntensity: 0.5 });
      const sz = 0.007 + r() * 0.008, m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz).rotateX(-Math.PI / 2), fm);
      m.rotation.y = r() * 6; m.position.set(0.02 + r() * 0.095, 0.0012, (r() - 0.5) * 0.026); leaf.add(m);
      landed.push({ m, t: i < 18 ? 14 + i * 2.4 : 999 });                  // first 18 land during the opening shot
    }
    const flakeMats = [1, 2, 3, 4].map((s) => new THREE.SpriteMaterial({ map: flakeTexture(s), transparent: true, depthWrite: false }));
    const macro: { s: THREE.Sprite; p: THREE.Vector3; v: number }[] = [];
    for (let i = 0; i < 40; i++) { const s = new THREE.Sprite(flakeMats[i % 4]); s.scale.setScalar(0.006 + r() * 0.006); s.layers.set(NOINK); scene.add(s); macro.push({ s, p: LEAF.clone().add(V(-0.25 + r() * 0.5, -0.05 + r() * 0.3, -0.3 + r() * 0.5)), v: 0.02 + r() * 0.02 }); }
    const snow = new Fall({ count: 14000, area: [26, 14, 26], speed: 0.7, size: 0.09, seed: 3, opacity: 0.9 }); scene.add(snow.points);
    const rain = new Fall({ count: 12000, area: [16, 10, 16], speed: 9, sway: 0.04, color: "#e6edf6", seed: 5, streak: 1, opacity: 0.7 }); scene.add(rain.points);

    // village people
    const woman = new Actor(FARMER_WOMAN, 1.62); woman.root.position.set(0.7, 0.064, 4.2); scene.add(woman.root);
    const top = 0.064;
    const sqW = new Actor(FARMER_WOMAN, 1.62), sqW2 = new Actor(FARMER_WOMAN, 1.6), sqKid = new Actor(CHILD, 2.5);
    sqW.root.position.copy(SQ).add(V(1.55, top, 2.9)); sqW2.root.position.copy(SQ).add(V(2.25, top, 2.0)); sqKid.root.position.copy(SQ).add(V(0.45, top, 3.3));
    scene.add(sqW.root, sqW2.root, sqKid.root);
    for (const a of [woman, sqW, sqW2, sqKid]) { a.ao = 0.4; a.contact = 0.75; }
    // bread board: the up-arrow is chalked on at "rising prices"
    const cb = document.createElement("canvas"); cb.width = 512; cb.height = 640;
    const cg = cb.getContext("2d")!;
    const chalkBase = () => {
      cg.globalAlpha = 1; cg.fillStyle = "#5a4330"; cg.fillRect(0, 0, 512, 640); cg.fillStyle = "#23282a"; cg.fillRect(22, 22, 468, 596);
      let s2 = 5; const r2 = () => { s2 = (s2 * 16807) % 2147483647; return s2 / 2147483647; };
      for (let i = 0; i < 1600; i++) { cg.fillStyle = `rgba(255,255,255,${0.02 + r2() * 0.03})`; cg.fillRect(r2() * 512, r2() * 640, 2 + r2() * 6, 1); }
      cg.fillStyle = "#f1eee6"; cg.textAlign = "center"; cg.font = "600 86px Cinzel, serif"; cg.fillText("BREAD", 256, 170);
      cg.font = "500 40px Inter, sans-serif"; cg.fillText("one loaf", 256, 228);
      cg.font = "700 64px Cinzel, serif"; cg.fillText("PRICE", 256, 580);
    };
    const chalkArrow = (k: number) => {          // k 0..1: the arrow is drawn upward from its base
      if (k <= 0) return;
      cg.save(); cg.beginPath(); cg.rect(0, 500 - 240 * k, 512, 240 * k + 2); cg.clip();
      cg.fillStyle = "#e8674a"; cg.strokeStyle = "#f6d2c4"; cg.lineWidth = 5; cg.lineJoin = "round";
      cg.beginPath(); cg.moveTo(256, 268); cg.lineTo(366, 388); cg.lineTo(300, 388); cg.lineTo(300, 500); cg.lineTo(212, 500); cg.lineTo(212, 388); cg.lineTo(146, 388); cg.closePath();
      cg.fill(); cg.stroke(); cg.restore();
    };
    const cbt = new THREE.CanvasTexture(cb); cbt.colorSpace = THREE.SRGBColorSpace;
    let boardK = -1;
    const setBoard = (k: number) => { const q = Math.round(k * 24) / 24; if (q === boardK) return; boardK = q; chalkBase(); chalkArrow(q); cbt.needsUpdate = true; };
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.9), new THREE.MeshStandardMaterial({ map: cbt, roughness: 0.85 }));
    board.position.copy(SQ).add(V(0.75, 1.56, 0.55)); board.rotation.set(-0.12, 0.35, 0); scene.add(board);

    // ---------------------------------------------------------------- volcano (1 unit = 1 m)
    const ISC = 115;
    const isl = volcanoIsland({ radius: 40, height: 25, crater: 4.2, craterDepth: 3, seed: 4, seg: 260,
      colors: { beach: "#8a7c66", forest: "#35562a", scrub: "#56593e", rock: "#4b4039", ash: "#5c544d", crater: "#221b1a" } });
    const vn = pbrMaps("volcanic").normalMap.clone(); vn.repeat.set(30, 30); vn.needsUpdate = true;
    isl.material = new THREE.MeshStandardMaterial({ vertexColors: true, color: "#9a9a9a", roughness: 0.95, normalMap: vn, normalScale: new THREE.Vector2(1.4, 1.4) });
    isl.scale.setScalar(ISC); isl.position.copy(VOLC); isl.castShadow = isl.receiveShadow = true; scene.add(isl);
    const wave = pbrMaps("waves").normalMap.clone(); wave.repeat.set(900, 900); wave.needsUpdate = true;
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(240000, 240000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#1d3a4c", roughness: 0.42, metalness: 0, envMapIntensity: 0.3, normalMap: wave, normalScale: new THREE.Vector2(0.5, 0.5) }));
    sea.position.copy(VOLC).add(V(0, 75, 0)); sea.receiveShadow = true; scene.add(sea);
    const vent = VOLC.clone().add(V(0, 2300, 0));
    const column = new EruptionColumn({ vent, height: 22000, base: 520, top: 3200, umbrella: 9500, umbrellaCount: 640, count: 560, wind: [0.04, -0.01], seed: 2, dark: "#2c2624", lit: "#e2d6ca" });
    const veil = new EruptionColumn({ vent, height: 22000, base: 520, top: 5200, umbrella: 60000, umbrellaCount: 900, count: 420, wind: [0.06, -0.02], seed: 6, dark: "#3a3230", lit: "#d9c6b8" });
    scene.add(column.root, veil.root);
    const prof = (d: number) => ISC * 25 * Math.pow(Math.max(0, 1 - d / (40 * ISC)), 1.65);
    const flows = new PyroFlows({ center: VOLC, rim: 600, base: 4100, height: 2900, start: T.unleashed + 60, lanes: 12, perLane: 30, speed: 0.12, size: [180, 750], seed: 5 });
    scene.add(flows.root);
    const volcSet = [isl, sea, column.root, veil.root, flows.root];

    // ---------------------------------------------------------------- science diorama, frozen field
    const sci = buildScience(scene, SCI);
    const field = new THREE.Group(); field.position.copy(FIELD); scene.add(field);
    const fm = pbrMaps("frost"); const ft = { map: fm.map.clone(), normalMap: fm.normalMap.clone(), roughnessMap: fm.roughnessMap.clone() };
    for (const x of Object.values(ft)) { x.repeat.set(120, 120); x.needsUpdate = true; }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial(ft)); ground.receiveShadow = true; field.add(ground);
    field.add(wheatField({ w: 14, d: 10, count: 30000, h: 0.95, frost: 0.4, clear: [[0.4, 0.78, 0.74], [1.4, 2.6, 0.9]] }));
    const man = new Actor(FARMER_MAN, 1.75); man.root.position.copy(FIELD).add(V(0.4, 0, 0.8)); scene.add(man.root);
    man.ao = 0.55; man.contact = 0.85;

    // ---------------------------------------------------------------- globe in space
    const space = new THREE.Group(); space.position.copy(GLOBE); scene.add(space);
    const globe = await Globe.create(ctx, { radius: 5, regions: { na: (p) => p.CONTINENT === "North America", eu: (p) => p.CONTINENT === "Europe", id: (p) => p.NAME === "Indonesia" } });
    space.add(globe.root, starField());
    scene.updateMatrixWorld(true);
    const toLocal = (p: THREE.Vector3) => globe.root.worldToLocal(p.clone());
    const arcs = [[47, -95], [50, 8]].map((dst) => { const arc = new GlobeArc(globe.arc(TAMBORA, dst as [number, number], 120, 0.2).map(toLocal), { size: 0.12, color: "#ffd36b" }); globe.root.add(arc.mesh); return arc; });
    const pin = globePin(); globe.root.add(pin.group);
    { const p = toLocal(globe.at(TAMBORA[0], TAMBORA[1], 0.012)); pin.group.position.copy(p); pin.group.quaternion.setFromUnitVectors(V(0, 0, 1), p.clone().normalize()); }
    const faceBetween = (a: [number, number], b: [number, number], t: number, tilt = 0) => {
      let dl = b[1] - a[1]; if (dl > 180) dl -= 360; if (dl < -180) dl += 360;
      globe.face(a[0] + (b[0] - a[0]) * t, a[1] + dl * t, V(...GLOBE_CAM.pos).sub(GLOBE), tilt);
    };

    // ---------------------------------------------------------------- overlay
    const D = (text: string, accent: string, o: Record<string, unknown> = {}) => new Label(ctx, text, { style: "doc", size: 42, accent, ...o });
    const L = {
      y1816: new Label(ctx, "1816", { style: "cine-sub", size: 64 }), na: D("North America", "#9cc6ff", { size: 36 }), eu: D("Europe", "#9cc6ff", { size: 36 }),
      far: D("Thousands of kilometres away", "#ffd36b", { size: 36 }),
      tam: D("Mount Tambora", "#e2553f", { sub: "Sumbawa, Indonesia · April 1815", size: 46 }),
      so2: D("Sulfur dioxide gas (SO₂)", "#f2d34f"), aer: D("Sulfate aerosols", "#cfe0ff"),
      strat: D("STRATOSPHERE", "#6fa2d8", { size: 32 }), trop: D("TROPOSPHERE", "#9cc3e6", { size: 32 }),
      cone: D("Mount Tambora", "#e2553f", { size: 30 }), ground: D("Ground", "#4c8a36", { size: 30 }),
      inc: D("Incoming sunlight", "#ffc94a"), refl: D("Some is scattered\nback to space", "#ffc94a"), less: D("Less sunlight\nreaches the surface", "#e2553f"),
      nh: D("Northern Hemisphere", "#9cc6ff", { size: 44 }), y1816b: new Label(ctx, "1816", { style: "cine-sub", size: 64 }),
      title: new Label(ctx, "THE YEAR\nWITHOUT A SUMMER", { style: "cine-title", size: 64 }), year: new Label(ctx, "1816", { style: "cine-sub", size: 52 }),
    };
    const inset = new Inset(ctx, SO2_OXIDATION, "SO₂ is oxidised to sulfuric acid,<br>which forms sulfate aerosol droplets", { at: [0.64, 0.28], size: 480 });
    const thermo = new Thermometer(ctx, { at: [0.8, 0.42], height: 460 });

    return {
      scene,
      frame(f, shot, c): FrameState {
        for (const l of Object.values(L)) l.el.style.opacity = "0";
        inset.el.style.opacity = "0"; thermo.el.style.opacity = "0";
        const set = shot.set as string, id = shot.id, u = (f - shot.a) / (shot.b - shot.a);
        const lt = (from: number, to: number) => ({ cam: c, from, to });
        c.near = 0.1; c.far = 2000;
        snow.amount = 0; rain.amount = 0;
        for (const o of volcSet) o.visible = set === "volcano";
        space.visible = set === "globe"; cine.root.visible = set !== "globe";
        pin.group.visible = false; for (const a of arcs) a.mesh.visible = false;
        for (const m of macro) m.s.visible = id === "01-leaf" || id === "15-leaf-frozen";
        const done = (st: { exposure: number }, extra: Partial<FrameState>): FrameState => { c.updateProjectionMatrix(); return { exposure: st.exposure, ...extra }; };

        // ============================================================ globe
        if (set === "globe") {
          scene.fog = null; scene.background = new THREE.Color("#05070f"); scene.environment = null;
          c.near = 1; c.far = 200; c.updateProjectionMatrix();
          applyCam(c, { ...GLOBE_CAM, pos: [GLOBE_CAM.pos[0], GLOBE_CAM.pos[1], GLOBE_CAM.pos[2] - (f - shot.a) * 0.006] });
          const sun = V(0.75, 0.35, 0.8);
          if (id === "03-globe") {
            // North America and Europe in 1816 -> turn to Indonesia, "thousands of kilometres away"
            const t = f < T.away ? 0.25 * ss(f, T.y1816, T.away) : 0.25 + 0.75 * ss(f, T.away, T.away + 75);
            faceBetween([30, -55], [-4, 102], t);
            globe.update({ sunDir: sun, hi: { na: ease((f - T.na + 4) / 10), eu: ease((f - T.eu + 4) / 10), id: ease((f - T.away - 50) / 15) } });
            L.y1816.update(f, { at: [0.5, 0.16], from: W("1816,", T.y1816) - 2, to: T.away + 4 });
            L.na.update(f, { at: globe.at(45, -98, 0.05), ...lt(T.na - 2, T.away + 4) });
            L.eu.update(f, { at: globe.at(50, 12, 0.05), ...lt(T.eu - 2, T.away + 4) });
            if (f >= T.away) {
              pin.group.visible = true; pin.pulse((f - T.away) / 30);
              arcs.forEach((a) => { a.mesh.visible = true; a.progress = ease((f - T.away - 30) / 55); });
              L.far.update(f, { at: [0.5, 0.17], from: W("thousands", T.away) - 2, to: T.tambora + 6 });
            }
          } else {
            // Northern Hemisphere: seen from above the Atlantic, the cooling veil over the north
            faceBetween([30, -20], [40, 20], u, 22);
            globe.update({ sunDir: sun, hi: {}, north: ease((f - T.northern + 6) / 18), northColor: "#9cc6ff", veil: { src: TAMBORA, spread: 1, opacity: 0.45 }, t: f / FPS });
            L.nh.update(f, { at: [0.5, 0.17], from: T.northern - 2, to: T.cold + 6 });
          }
          return { exposure: 1, grade: "neutral" };
        }

        // ============================================================ volcano
        if (set === "volcano") {
          c.near = 30; c.far = 160000;
          if (id === "04-eruption") {
            // the camera rises from just above the sea as the column climbs
            const rise = ss(f, T.unleashed - 20, shot.b + 40);
            const Dd = lerp(29000, 33000, rise), CY = lerp(260, 1900, rise), dir = V(0.55, 0, 0.83).normalize();
            const el = lerp(0.2, 0.29, rise);
            applyCam(c, { pos: [VOLC.x + dir.x * Dd, CY, VOLC.z + dir.z * Dd], look: [VOLC.x, CY + Dd * Math.tan(el), VOLC.z], fov: 56 });
            const d = f - T.unleashed;
            if (d >= 0 && d < 14) { c.position.y += (d % 2 ? -1 : 1) * 60 * (1 - d / 14); c.updateMatrixWorld(); }
            const P = { ...mixCine("cine-eruption", "cine-ashfall", 0.3 * ease((f - T.unleashed) / 90)), fogDensity: 0.000014, sunAz: 305, sunEl: 13, overcast: 0.45 * ease((f - T.unleashed + 30) / 120), skyTint: "#8d7c72", sunI: 2.4, hemiI: 0.35, envI: 0.4 };
            const st = cine.apply(P, c, { focus: VOLC.clone().add(V(0, 6000, 0)), radius: 30000 });
            const grow = f < T.unleashed ? 0.035 : 0.035 + 0.965 * ease((f - T.unleashed) / 160);
            column.update(f / FPS, { grow, light: new THREE.Color(1.1, 0.95, 0.85), sunDir: CineRig.sunDirOf(P) });
            veil.root.visible = false;
            flows.update(f, new THREE.Color(1.1, 0.95, 0.85), prof);
            L.tam.update(f, { at: [0.5, 0.16], from: T.mount - 4, to: T.so2 + 4 });
            return done(st, { grade: "cine", cInf: 0, focus: vent, sun: st.sunWorld, godrays: 0.6 });
          }
          // 14: far beyond its birthplace: high above the sea, the ash veil spreads across the whole sky
          const Dd = lerp(52000, 44000, u), CY = 7000;
          const dir = V(0.35, 0, 0.94).normalize();
          applyCam(c, { pos: [VOLC.x + dir.x * Dd, CY, VOLC.z + dir.z * Dd], look: [VOLC.x, 13000 + 1500 * u, VOLC.z], fov: 62 });
          const P = { ...mixCine("cine-eruption", "cine-ashfall", 0.55), fogDensity: 0.000008, sunAz: 265, sunEl: 6, overcast: 0.4, skyTint: "#7d6a60", sunI: 2.0 };
          const st = cine.apply(P, c, { focus: VOLC.clone().add(V(0, 8000, 0)), radius: 60000 });
          column.root.visible = false; flows.root.visible = false;
          veil.update(f / FPS, { grow: 0.9 + 0.1 * u, light: new THREE.Color(1.05, 0.88, 0.78), sunDir: CineRig.sunDirOf(P) });
          return done(st, { grade: "cine", cInf: 0, sun: st.sunWorld, godrays: 0.8 });
        }

        // ============================================================ science
        if (set === "science") {
          c.far = 2000;
          const push = (f - T.so2) / (T.temps - T.so2);
          applyCam(c, { pos: [SCI.x + 7 - 1.5 * push, SCI.y + 13.2 + 0.6 * push, SCI.z + 46 - 4 * push], look: [SCI.x + 0.5, SCI.y + 13.2 + 0.4 * push, SCI.z], fov: 50 });
          const st = cine.apply("cine-summer", c, { focus: SCI.clone().add(V(0, 3, 0)), radius: 30 });
          scene.fog = null;
          const gas = ease((f - T.so2 - 6) / 110), convert = ease((f - T.transformed) / 50), spread = ease((f - T.spread + 10) / 70);
          const rays = ease((f - (T.reflected - 36)) / 70);
          sci.update({ gas, convert, spread, rays, t: f / FPS });
          const A = sci.anchors, end = T.temps + 4;
          L.strat.update(f, { at: A.strat, ...lt(T.so2 + 6, end) }); L.trop.update(f, { at: A.trop, ...lt(T.so2 + 12, end) });
          L.cone.update(f, { at: A.cone, ...lt(T.so2 + 4, end) }); L.ground.update(f, { at: A.ground, ...lt(T.so2 + 10, end) });
          L.so2.update(f, { at: A.so2, ...lt(T.sulfur - 4, T.transformed + 6) });
          inset.update(f, { from: T.transformed - 4, to: T.reflected - 40 });
          L.aer.update(f, { at: A.aer, ...lt(T.sulfate - 2, end) });
          L.inc.update(f, { at: A.inc, ...lt(T.reflected - 30, end) });
          L.refl.update(f, { at: A.refl, ...lt(T.reflected + 8, end) });
          L.less.update(f, { at: A.less, ...lt(T.less - 2, end) });
          return done(st, { grade: "cine" });
        }

        // ============================================================ frozen field
        if (set === "field") {
          const p = (f - T.crops) / (T.hardship - T.crops);
          applyCam(c, { pos: [FIELD.x + 2.9 - 0.4 * p, 1.6 - 0.15 * p, FIELD.z + 6.2 - 0.8 * p], look: [FIELD.x + 0.55, 0.7, FIELD.z + 0.8], fov: 34 });
          const HARV = { ...mixCine("cine-snow", "cine-overcast", 0.45), sunAz: 215, sunEl: 26 };
          const st = cine.apply(HARV, c, { focus: FIELD.clone().add(V(0, 0.5, 0)), radius: 8 });
          snow.amount = 0.9; snow.update(f, c);
          const sd = CineRig.sunDirOf(HARV);
          const lit = man.light("#aab3c0", sd, c, "rgb(52,58,78)", 0.42);
          const stalk: Pose["hold"] = (g, h, side) => {
            if (side !== "R") return;
            g.lineCap = "round"; g.strokeStyle = "#3a2622"; g.lineWidth = 12; g.beginPath(); g.moveTo(h.x, h.y + 10); g.quadraticCurveTo(h.x + 10, h.y - 110, h.x + 70, h.y - 120); g.stroke();
            g.strokeStyle = "#c9ad72"; g.lineWidth = 6; g.stroke();
            g.save(); g.translate(h.x + 76, h.y - 112); g.rotate(1.1);
            for (let k = 0; k < 6; k++) { g.fillStyle = "#b8925a"; g.strokeStyle = "#3a2622"; g.lineWidth = 3; g.beginPath(); g.ellipse(k * 9, k % 2 ? 6 : -6, 9, 5, 0.3, 0, Math.PI * 2); g.fill(); g.stroke(); }
            g.restore();
          };
          // he looks over the frozen crop, then sinks to one knee on "harvests failed" and lifts a dead stalk
          const kneel = f >= T.harvests ? 1 : 0, dip = ease((f - (T.harvests - 7)) / 7);
          const stand: Pose = { ...idle(f, 2), expression: dip > 0.3 ? "sad" : "worried", turn: 0.3, look: [0.6, 0.4 + dip * 0.5], bob: -70 * dip, lean: 4 * dip, light: lit };
          const down: Pose = { ...idle(f, 2), expression: "sad", kneel: 1, armR: [28, 70], armL: [14, 30], tilt: 6, look: [0.5, 0.8], hold: stalk, light: lit };
          man.update(kneel ? blend({ ...down, armR: [8, 6] }, down, (f - T.harvests - 4) / 16) : stand, c, undefined, sd);
          return done(st, { grade: "cine-cold", cInf: 14, focus: man.root.position.clone().add(V(0, 0.7, 0)) });
        }

        // ============================================================ village (leaf, reveal, cooling, cold, rain, summer snow, prices, ending)
        let P: CinePreset = mixCine("cine-morning", "cine-snow", 0.45);
        let out: Partial<FrameState> = { grade: "cine", cInf: 3, focus: V(0, 2, -6) };
        const people = (ex: Pose["expression"][], cold: number, lit: THREE.ColorRepresentation, sd: THREE.Vector3) => {
          ([[sqW, 0.6], [sqW2, 0], [sqKid, 0.4]] as [Actor, number][]).forEach(([a, sh], i) => {
            const l = a.light(lit, sd, c, "rgb(60,66,88)", 0.36);
            a.update({ ...idle(f, 3 + i), ...(cold * (sh || 0.5) ? shiver(f + i * 7, cold * (sh || 0.6)) : {}), expression: ex[i], turn: -0.4, look: [-0.6, 0], light: l }, c, undefined, sd);
          });
        };
        if (id === "01-leaf" || id === "15-leaf-frozen") {
          const frozen = id === "15-leaf-frozen";
          // macro on the leaf; in the opening the focus pulls from the leaf to the village street behind it
          const pull = frozen ? 0 : ss(f, 34, 62);
          applyCam(c, { pos: [LEAF.x + 0.05, LEAF.y + 0.085 + 0.01 * u, LEAF.z + 0.34 - 0.03 * u], look: [LEAF.x + 0.05, LEAF.y - 0.03, LEAF.z - 1], fov: 40 });
          c.near = 0.005;
          P = frozen ? mixCine("cine-snow", "cine-overcast", 0.3) : mixCine("cine-morning", "cine-overcast", 0.25 * ss(f, 0, 50));
          snow.amount = frozen ? 1 : ease((f - 6) / 20);
          for (const l of landed) l.m.visible = frozen || f >= l.t;
          macro.forEach((m, i) => { m.s.position.copy(m.p).add(V(Math.sin(f * 0.05 + i) * 0.01, -((f * m.v / FPS * 6) % 0.35), 0)); });
          out = { grade: frozen ? "cine-cold" : "cine", cInf: 24, focus: pull > 0.5 ? V(1, 1.4, -2) : LEAF.clone().add(V(0.06, 0, 0)), godrays: frozen ? 0 : 0.6 };
          if (pull > 0 && pull < 1) out.focus = LEAF.clone().add(V(0.06, 0, 0)).lerp(V(1, 1.4, -2), pull);
        } else if (id === "02-reveal") {
          // crane up from the garden over the snowy street
          const k = ss(f, shot.a, shot.b + 20);
          applyCam(c, { pos: [lerp(2.2, 0.4, k), lerp(1.4, 7.5, k), lerp(14, 21, k)], look: [lerp(0.6, -1, k), lerp(1.6, 2.4, k), -24], fov: 42 });
          P = { ...mixCine("cine-morning", "cine-snow", 0.45), hemiSky: "#cfd2d6" };
          snow.amount = 1;
          out = { grade: "cine", cInf: 3, focus: V(0, 2, -6), godrays: 0.35 };
        } else if (id === "07-cooling") {
          // a woman in the street looks up at the dimmed sky; the thermometer falls on "Temperatures fell"
          applyCam(c, { pos: [1.7 - 0.2 * u, 1.45, 9.6 - 0.7 * u], look: [0.1, 1.65 + 0.25 * u, -4], fov: 44 });
          P = mixCine("cine-morning", "cine-overcast", 0.5 + 0.4 * u);
          const sd = CineRig.sunDirOf(P);
          const coldK = ease((f - T.temps - 12) / 40);
          const l = woman.light("#c3c9d2", sd, c, "rgb(60,66,88)", 0.36);
          woman.update(blend({ ...idle(f, 1), expression: "worried", look: [0.2, -0.9], tilt: -4, turn: 0.15, light: l }, { ...idle(f, 1), ...shiver(f, 1), look: [0.4, 0.2], turn: 0.2, light: l }, coldK), c, undefined, sd);
          thermo.update(f, { from: T.temps - 2, to: T.north + 4, level: 0.82 - 0.55 * ease((f - T.temps - 4) / 50) });
          out = { grade: "cine-cold", cInf: 5, focus: woman.root.position.clone().add(V(0, 1.3, 0)) };
        } else if (id === "09-cold") {
          // the square: villagers shivering; a low, wide view from the side of the stalls
          applyCam(c, { pos: [SQ.x + 4.6 - 0.4 * u, 1.3, SQ.z + 8.6 - 0.4 * u], look: [SQ.x + 1.2, 1.1, SQ.z + 2.3], fov: 46 });
          P = mixCine("cine-overcast", "cine-snow", 0.4);
          snow.amount = 0.35;
          people(["worried", "sad", "sad"], 1, "#c3cad4", CineRig.sunDirOf(P));
          L.y1816b.update(f, { at: [0.5, 0.15], from: W("1816,", T.cold) - 2, to: T.cold + 70 });
          out = { grade: "cine-cold", cInf: 6, focus: sqW.root.position.clone().add(V(0, 1.2, 0)), focusTo: sqKid.root.position.clone().add(V(0, 1, 0)) };
        } else if (id === "10-rain") {
          applyCam(c, { pos: [0.6, 3.2 - 0.6 * u, 15 - 1.5 * u], look: [-0.8, 1.6, -18], fov: 46 });
          P = { ...mixCine("cine-overcast", "cine-ashfall", 0.25), sunI: 0.3 };
          rain.amount = 1;
          out = { grade: "cine-cold", cInf: 3, focus: V(0, 1.6, -4) };
        } else if (id === "11-summer-snow") {
          // summer green under snow: low in the garden, flowers of grass and leafy trees, snow falling
          applyCam(c, { pos: [2.6 + 0.3 * u, 0.42, 23.5 - 0.4 * u], look: [1.2, 1.5, 10], fov: 40 });
          P = mixCine("cine-snow", "cine-morning", 0.3);
          snow.amount = 1;
          out = { grade: "cine", cInf: 8, focus: V(2.4, 0.4, 21.5), focusTo: V(1.5, 1, 12) };
        } else if (id === "13-prices") {
          // wide on the villagers, then a push toward the board as the arrow goes up on "rising prices"
          const k = ss(f, T.prices - 50, T.prices + 30);
          applyCam(c, { pos: [SQ.x + lerp(1.3, 1.0, k), lerp(1.45, 1.55, k), SQ.z + lerp(8.6, 3.4, k)], look: [SQ.x + lerp(1.15, 0.8, k), lerp(1.1, 1.45, k), SQ.z + lerp(1.5, 0.5, k)], fov: lerp(44, 38, k) });
          P = mixCine("cine-overcast", "cine-snow", 0.3);
          snow.amount = 0.5;
          setBoard(ease((f - T.prices + 6) / 20));
          people(["worried", "sad", "sad"], 0.5, "#c3cad4", CineRig.sunDirOf(P));
          out = { grade: "cine-cold", cInf: lerp(6, 10, k), focus: k < 0.5 ? sqW.root.position.clone().add(V(0, 1.2, 0)) : board.position.clone(), focusTo: k < 0.5 ? board.position.clone() : undefined };
        } else if (id === "16-closing") {
          applyCam(c, { pos: [0.6, 2.0 + 0.5 * u, 34 + 2.5 * u], look: [-0.5, 3.6 + 0.3 * u, -20], fov: 44 });
          P = mixCine("cine-snow", "cine-morning", 0.25);
          snow.amount = 1;
          L.title.update(f, { at: [0.5, 0.32], from: TITLE_AT, to: END + 100 });
          L.year.update(f, { at: [0.5, 0.4], from: TITLE_AT + 10, to: END + 100 });
          out = { grade: "cine", cInf: 4, focus: V(0, 2, -10), godrays: 0.4 };
        }
        if (id !== "13-prices") setBoard(id === "16-closing" || id === "15-leaf-frozen" ? 1 : 0);
        const st = cine.apply(P, c, { focus: V(0, 2, -6), radius: 40 });
        snow.update(f, c); rain.update(f, c);
        if (id !== "07-cooling") woman.root.visible = false; else woman.root.visible = true;
        const sqVisible = id === "09-cold" || id === "13-prices";
        for (const a of [sqW, sqW2, sqKid]) a.root.visible = sqVisible;
        return done(st, { sun: st.sunWorld, ...out });
      },
    };
  },
});
