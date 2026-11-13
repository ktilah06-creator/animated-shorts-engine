// "The Year Without a Summer" (Tambora 1815 -> 1816). 81.7 s, 1080x1920, 30 fps.
// Every shot is laid on the voice-over's sentence cues (cues.json); key words drive events (eruption, labels, prices).
// Sets, characters and fonts come from the asset library (pinned versions); approved in reviews 1-2.
import * as THREE from "three";
import { defineFilm, type ShotDef, type FrameState } from "@engine/film";
import { makeCues } from "@engine/cues";
import { LightRig, mixPreset } from "@engine/look/rig";
import { Clouds } from "@engine/look/clouds";
import { Water } from "@engine/look/water";
import { Actor } from "@engine/chars/actor";
import { idle, blend, ease, shiver } from "@engine/chars/clips";
import { Fall } from "@engine/fx/particles";
import { Plume } from "@engine/fx/plume";
import { volcanoIsland } from "@engine/env/terrain";
import { Globe, GlobeArc, globePin, starField } from "@engine/geo/globe";
import { Label, loadFont } from "@engine/overlay/label";
import { GRADES, mixGrade } from "@engine/post/grade";
import { Thermometer } from "@engine/overlay/thermometer";
import { camPath, applyCam, smootherstep, type CamPose } from "@engine/camera";
import { V } from "@engine/env/geo";
import type { Design, Pose } from "@engine/chars/toon";
import { buildFarm, cropPatch } from "@lib/environment/farm-1810s@1";
import { buildVillage, PriceBoard } from "@lib/environment/village-market@1";
import { buildAtmos, ATMOS_CAM } from "@lib/environment/atmosphere-cross-section@2";
import cueData from "./cues.json";
import { FARMER_WOMAN, FARMER_MAN, CHILD } from "./cast";

const FPS = 30;
const cues = makeCues(cueData, FPS);
const S = (i: number) => cues.sentence(i).a;
const W = (w: string, after: number) => cues.word(w, after);
const END = cues.frames;                                       // 2451

// set locations (far apart in one world)
const FARM = V(0, 0, 0), FARM2 = V(400, 0, 0), VIL = V(800, 0, 0), VOLC = V(-3000, 0, 0), GLOBE = V(0, -6000, 0), ATM = V(6000, 0, 0);
const TAMBORA: [number, number] = [-8.25, 118.0];
const ATLANTIC: [number, number] = [42, -38];

// ---------------------------------------------------------------- shots (frame ranges from the voice-over)
const T = {
  snow: S(1), y1816: S(2), away: S(3), tambora: S(4), unleashed: W("unleashed", S(4)), so2: S(5), aerosols: S(6),
  transformed: W("transformed", S(6)), reflected: W("reflected", S(6)), less: S(7), temps: S(8), north: S(9),
  cold: S(10), rain: W("rain,", S(10)), snowfall: W("snowfall.", S(10)), crops: S(11), harvests: W("harvests", S(11)),
  hardship: S(12), prices: W("prices", S(12)), conseq: S(13), birthplace: W("birthplace.", S(13)), title: S(14), last: S(15),
};
const shots: ShotDef[] = [
  { id: "01-morning", a: 0, b: T.snow, set: "farm" },
  { id: "02-snow", a: T.snow, b: T.y1816, set: "farm" },
  { id: "03-globe-1816", a: T.y1816, b: T.away, set: "globe", xfade: 10 },
  { id: "04-far-away", a: T.away, b: T.tambora, set: "globe" },
  { id: "05-tambora", a: T.tambora, b: T.so2, set: "volcano", xfade: 10 },
  { id: "06-so2", a: T.so2, b: T.aerosols, set: "atmos", xfade: 10 },
  { id: "07-aerosols", a: T.aerosols, b: T.less, set: "atmos" },
  { id: "08-dimming", a: T.less, b: T.north, set: "farm", xfade: 10 },
  { id: "09-north", a: T.north, b: T.cold, set: "globe", xfade: 10 },
  { id: "10a-cold", a: T.cold, b: T.rain - 6, set: "village", xfade: 10 },
  { id: "10b-rain", a: T.rain - 6, b: T.snowfall - 14, set: "village", xfade: 8 },
  { id: "10c-summer-snow", a: T.snowfall - 14, b: T.crops, set: "farm", xfade: 8 },
  { id: "11-harvest", a: T.crops, b: T.hardship, set: "frost", xfade: 8 },
  { id: "12-prices", a: T.hardship, b: T.conseq, set: "village", xfade: 10 },
  { id: "13-far-beyond", a: T.conseq, b: T.title, set: "globe", xfade: 10 },
  { id: "14-title", a: T.title, b: T.last, set: "farm", xfade: 10 },
  { id: "15-reminder", a: T.last, b: END, set: "globe", xfade: 12 },
];

// ---------------------------------------------------------------- cameras (relative to each set)
const rel = (o: THREE.Vector3, p: CamPose): CamPose => ({ ...p, pos: [p.pos[0] + o.x, p.pos[1] + o.y, p.pos[2] + o.z], look: [p.look[0] + o.x, p.look[1] + o.y, p.look[2] + o.z] });
const cam = camPath([
  { f: 0, pose: { pos: [3.4, 1.5, 8.6], look: [-0.6, 1.9, -4], fov: 44 }, creep: 0.3 },
  { f: T.snow, pose: { pos: [1.1, 0.55, 3.6], look: [-0.2, 2.3, -1.5], fov: 46 }, cut: true, creep: 0.25 },
  { f: T.tambora, pose: (f) => rel(VOLC, { pos: [78 - (f - T.tambora) * 0.025, 3.4, 98 - (f - T.tambora) * 0.035], look: [0, 30, 0], fov: 46 }), cut: true },
  { f: T.so2, pose: (f) => rel(ATM, { pos: [ATMOS_CAM.pos[0], ATMOS_CAM.pos[1], ATMOS_CAM.pos[2] - (f - T.so2) * 0.004], look: ATMOS_CAM.look, fov: ATMOS_CAM.fov }), cut: true },
  { f: T.less, pose: { pos: [2.2, 1.2, 5.4], look: [-0.2, 1.9, -2], fov: 44 }, cut: true, creep: 0.2 },
  { f: T.cold, pose: (f) => rel(VIL, { pos: [1.4 - (f - T.cold) * 0.004, 1.55, 4.6], look: [-2.6, 1.35, -2.8], fov: 48 }), cut: true },
  { f: T.rain - 6, pose: (f) => rel(VIL, { pos: [3.2, 2.6 - (f - T.rain) * 0.003, 9], look: [-1, 1.6, -6], fov: 46 }), cut: true },
  { f: T.snowfall - 14, pose: { pos: [4.5, 1.1, 2.2], look: [8, 1.1, -10], fov: 42 }, cut: true, creep: 0.4 },
  { f: T.crops, pose: (f) => rel(FARM2, { pos: [1.5, 1.75 - (f - T.crops) * 0.0015, 4.9 - (f - T.crops) * 0.006], look: [-0.1, 0.6, -0.6], fov: 42 }), cut: true },
  { f: T.hardship, pose: (f) => rel(VIL, { pos: [1.2 + (f - T.hardship) * 0.002, 1.5, 4.2 - (f - T.hardship) * 0.004], look: [-3.0, 1.35, -3.2], fov: 50 }), cut: true },
  { f: T.title, pose: (f) => ({ pos: [2.6, 1.0 + (f - T.title) * 0.004, 7.5], look: [-0.4, 2.6 + (f - T.title) * 0.006, -4], fov: 46 }), cut: true },
]);
// ---------------------------------------------------------------- sound events (frames; rendered by sound.py)
const bed = (kind: string, a: number, b: number, gain = 1) => ({ f: a, kind, dur: (b - a) / FPS, gain });
const ev = (kind: string, f: number, gain = 1, extra: Record<string, unknown> = {}) => ({ f, kind, gain, ...extra });
const SOUND = [
  bed("birds", 0, T.snow + 10, 0.8), bed("breeze", 0, T.y1816, 0.6), bed("hush", T.snow, T.y1816 + 6, 0.8), ev("sparkle", T.snow + 4, 0.7),
  ev("whoosh", T.y1816 - 6, 0.7), bed("space", T.y1816, T.tambora + 6, 0.7),
  ev("pop", W("1816,", T.y1816) - 2, 0.7), ev("pop", W("North", T.y1816) - 2, 0.6, { pitch: 1.12 }), ev("pop", W("Europe", T.y1816) - 2, 0.6, { pitch: 1.25 }),
  ev("whoosh", T.away, 0.6, { dur: 1.6 }), ev("pop", T.away + 6, 0.6, { pitch: 0.8 }),
  ...Array.from({ length: 11 }, (_, i) => ev("tick", T.away + 25 + i * 5, 0.35, { pitch: 1 + i * 0.04 })),
  ev("whoosh", T.tambora - 6, 0.7), bed("waves", T.tambora, T.so2 + 6, 0.8), bed("rumble", T.tambora + 30, T.unleashed + 4, 0.35),
  ev("pop", W("Mount", T.tambora) - 4, 0.6), ev("boom", T.unleashed, 1.0), bed("rumble", T.unleashed, T.so2 + 30, 1.0),
  ev("whoosh", T.so2 - 6, 0.7), bed("rumble", T.so2, T.less, 0.35),
  ev("pop", T.so2 + 8, 0.45), ev("pop", T.so2 + 14, 0.45, { pitch: 0.9 }), ev("pop", W("sulfur", T.so2) - 4, 0.6),
  ev("pop", W("sulfate", T.aerosols) - 2, 0.6, { pitch: 1.15 }), ev("airy", T.transformed, 0.6, { dur: 3.5 }), ev("pop", T.transformed + 10, 0.4),
  ev("zip", T.reflected - 38, 0.5), ev("zip", T.reflected - 32, 0.5), ev("zip", T.reflected - 26, 0.5), ev("pop", T.reflected - 36, 0.4),
  ev("zip", T.reflected - 14, 0.55, { up: 1 }), ev("ting", T.reflected - 2, 0.5), ev("pop", T.reflected + 4, 0.45),
  ev("zip", T.reflected - 6, 0.35), ev("zip", T.reflected, 0.35), ev("pop", T.reflected + 40, 0.4, { pitch: 0.85 }),
  ev("whoosh", T.less - 6, 0.6), bed("wind", T.less, T.north + 6, 0.55),
  ...Array.from({ length: 12 }, (_, i) => ev("tick", T.temps - 4 + i * 4, 0.35, { pitch: 1.3 - i * 0.05 })),
  ev("whoosh", T.north - 6, 0.6), bed("space", T.north, T.cold + 6, 0.7), ev("sparkle", W("Northern", T.north), 0.5, { pitch: 0.8 }), ev("pop", W("Northern", T.north) - 2, 0.6),
  ev("whoosh", T.cold - 6, 0.6), bed("wind", T.cold, T.hardship, 0.8), bed("murmur", T.cold, T.rain, 0.5), ev("pop", T.cold + 4, 0.6),
  bed("rain", T.rain - 6, T.snowfall - 10, 1.0), bed("hush", T.snowfall - 14, T.hardship, 0.7),
  ev("thud", T.harvests + 6, 0.6),
  bed("rain", T.hardship, T.conseq + 6, 0.55), bed("murmur", T.hardship, T.conseq, 0.55), ev("clack", T.prices - 40, 0.6), ev("clack", T.prices + 8, 0.7),
  ev("whoosh", T.conseq - 6, 0.6), bed("space", T.conseq, T.title + 6, 0.7), ev("pop", T.conseq + 8, 0.5, { pitch: 0.8 }),
  ...Array.from({ length: 14 }, (_, i) => ev("tick", T.conseq + 12 + i * 6, 0.3, { pitch: 1 + i * 0.03 })), ev("airy", T.conseq + 30, 0.5, { dur: 4 }),
  ev("whoosh", T.title - 6, 0.6), bed("hush", T.title, T.last + 6, 0.8), bed("wind", T.title, T.last + 6, 0.4), ev("chime", T.title + 4, 0.8), ev("pop", T.title + 14, 0.5),
  ev("whoosh", T.last - 8, 0.5), bed("space", T.last, END, 0.7),
];

// globe shots: camera fixed, the globe turns
const GLOBE_CAM: CamPose = rel(GLOBE, { pos: [0, 0.3, 19], look: [0, 0.3, 0], fov: 36 });

export default defineFilm({
  id: "tambora-1816",
  shots,
  flashes: [{ at: T.unleashed, len: 7, curve: [1, 0.85, 0.6, 0.4, 0.22, 0.1, 0.03] }, { at: END - 14, len: 14, color: "#05070f", curve: Array.from({ length: 14 }, (_, k) => smootherstep((k + 1) / 14)) }],
  sound: SOUND,
  camera: { far: 9000 },
  async setup(ctx) {
    await loadFont(ctx, "font/fredoka", 1, "Fredoka-Variable.ttf", "Fredoka");
    const scene = new THREE.Scene();
    const rig = new LightRig(scene, { shadowMap: 4096 });
    const clouds = new Clouds({ seed: 2 }); scene.add(clouds.root);
    buildFarm(scene, { at: FARM }); buildFarm(scene, { season: "frost", at: FARM2 }); buildVillage(scene, VIL);
    cropPatch(scene, FARM2.clone().add(V(0.2, 0, -0.6)), { w: 9, d: 5.4, frost: true, clear: 0.5, height: 0.42 });
    const atmos = buildAtmos(scene, ATM);
    // volcano + sea
    const isl = volcanoIsland({ radius: 40, height: 21, crater: 5.5, craterDepth: 3.5, seed: 4 }); isl.position.copy(VOLC); scene.add(isl);
    const sea = new Water({ x0: VOLC.x - 900, x1: VOLC.x + 900, z0: -900, z1: 900, y: 0, flow: [0.2, 0.1], tiles: [10, 50] }); scene.add(sea.mesh);
    const vent = VOLC.clone().add(V(0, 18.5, 0));
    const steam = new Plume({ vent, rate: 5, rise: 0.45, life: 150, size: [2.5, 8], spread: 0.15, wind: [0.5, 0, 0.2], start: T.tambora - 300, seed: 9, color: ["#cfcac4", "#f1eeea"], max: 90, glow: "#000000" });
    const plume = new Plume({ vent, rate: 18, rise: 5.2, life: 230, size: [9, 50], wind: [1.4, 0, 0.4], start: T.unleashed, seed: 2, color: ["#3b3433", "#a39a92"], max: 520, glow: "#ff8a2a" });
    scene.add(steam.root, plume.root);
    // globe in space
    const space = new THREE.Group(); space.position.copy(GLOBE); scene.add(space);
    const globe = await Globe.create(ctx, { radius: 5, regions: { na: (p) => p.CONTINENT === "North America", eu: (p) => p.CONTINENT === "Europe", id: (p) => p.NAME === "Indonesia" } });
    space.add(globe.root, starField());
    // arcs + pin live on the globe (local coordinates), so they turn with it; built once
    scene.updateMatrixWorld(true);
    const toLocal = (p: THREE.Vector3) => globe.root.worldToLocal(p.clone());
    const arcs = [[47, -95], [50, 8]].map((dst) => { const arc = new GlobeArc(globe.arc(TAMBORA, dst as [number, number], 120, 0.2).map(toLocal), { size: 0.12, color: "#ffd36b" }); globe.root.add(arc.mesh); return arc; });
    const pin = globePin(); globe.root.add(pin.group);
    { const p = toLocal(globe.at(TAMBORA[0], TAMBORA[1], 0.012)); pin.group.position.copy(p); pin.group.quaternion.setFromUnitVectors(V(0, 0, 1), p.clone().normalize()); }
    // cast
    const ext = (d: Design, id: string, o: Partial<Design>): Design => ({ ...d, ...o, id });
    const woman = new Actor(FARMER_WOMAN, 1.62); woman.root.position.set(0, 0, 0.6); scene.add(woman.root);
    const man = new Actor(FARMER_MAN, 1.75); man.root.position.copy(FARM2).add(V(0.2, 0, 1)); scene.add(man.root);
    const kid = new Actor(CHILD, 1.7); kid.root.position.copy(FARM2).add(V(-1.3, 0, 0.2)); scene.add(kid.root);
    const queue = [
      new Actor(FARMER_WOMAN, 1.62), new Actor(ext(FARMER_MAN, "villager-a", { vest: "#6a4a6a", hat: { kind: "brim", color: "#3a3a40", band: "#222" }, beard: undefined }), 1.72),
      new Actor(ext(FARMER_WOMAN, "villager-b", { top: { kind: "dress", color: "#7a5a7a", collar: "#f4ead6" }, bottom: { kind: "skirt", color: "#7a5a7a" }, shawl: "#5a6a4a" }), 1.6),
      new Actor(CHILD, 1.7),
    ];
    queue.forEach((a, i) => { a.root.position.copy(VIL).add(V(-3.0 + i * 0.95, 0, -2.0 + i * 0.85)); scene.add(a.root); });
    const board = new PriceBoard(); board.mesh.position.copy(VIL).add(V(-3.7, 1.45, -2.2)); board.mesh.rotation.y = 0.9; board.mesh.scale.setScalar(1.25); scene.add(board.mesh);
    // weather
    const snow = new Fall({ count: 7000, area: [14, 8, 14], speed: 0.8, size: 0.085, seed: 3 }); scene.add(snow.points);
    const rain = new Fall({ count: 6000, area: [12, 8, 12], speed: 9, sway: 0.04, color: "#dfe7f2", seed: 5, streak: 1, opacity: 0.5 }); scene.add(rain.points);
    // overlay
    const L = {
      year: new Label(ctx, "1816", { style: "year" }), na: new Label(ctx, "North America"), eu: new Label(ctx, "Europe"),
      tam: new Label(ctx, "Mount Tambora", { sub: "April 1815 · Indonesia" }),
      so2: new Label(ctx, "sulfur dioxide"), aer: new Label(ctx, "sulfate aerosols"),
      strat: new Label(ctx, "Stratosphere", { style: "plain", color: "#fbf3e2", size: 50 }), trop: new Label(ctx, "Troposphere", { style: "plain", color: "#2b3a4a", size: 50 }),
      inc: new Label(ctx, "incoming sunlight", { style: "plain", color: "#fbf3e2", size: 40 }), refl: new Label(ctx, "reflected to space", { style: "plain", color: "#fbf3e2", size: 40 }),
      wind: new Label(ctx, "wind", { style: "plain", color: "#fbf3e2", size: 42 }), less: new Label(ctx, "less sunlight reaches the ground", { style: "plain", color: "#2b3a4a", size: 38 }),
      nh: new Label(ctx, "Northern Hemisphere"), y2: new Label(ctx, "1816", { style: "year" }),
      title1: new Label(ctx, "1816", { style: "year", size: 110 }), title2: new Label(ctx, "The Year\nWithout a Summer", { style: "title", size: 96 }),
    };
    const thermo = new Thermometer(ctx, { at: [0.76, 0.5], height: 520 });

    /** globe orientation: lat/lon facing the camera, interpolated between two views */
    const faceBetween = (a: [number, number], b: [number, number], t: number, tilt = 0) => {
      let dl = b[1] - a[1]; if (dl > 180) dl -= 360; if (dl < -180) dl += 360;
      globe.face(a[0] + (b[0] - a[0]) * t, a[1] + dl * t, V(...GLOBE_CAM.pos).sub(GLOBE), tilt);
    };

    return {
      scene,
      frame(f, shot, c): FrameState {
        const set = shot.set as string;
        for (const l of Object.values(L)) l.el.style.opacity = "0";
        thermo.el.style.opacity = "0";
        const spaceSet = set === "globe";
        rig.root.visible = !spaceSet; clouds.root.visible = !spaceSet;
        snow.amount = 0; rain.amount = 0; pin.group.visible = false;
        for (const a of arcs) a.mesh.visible = false;
        const lt = (from: number, to: number) => ({ cam: c, from, to });

        // ------------------------------------------------ farm (summer, dimming, summer snow, title)
        if (set === "farm") {
          const id = shot.id;
          applyCam(c, cam(f));
          let P = mixPreset("summer", "overcast", 0), wom: Pose = { ...idle(f, 1) };
          if (id === "01-morning") {
            const m = { ...idle(f, 1), expression: "happy" as const, armL: [150, 30] as [number, number], armR: [150, 30] as [number, number], turn: 0.1 };
            wom = blend(m, { ...m, armL: [12, 6], armR: [12, 6] }, (f - 50) / 25);
          } else if (id === "02-snow") {
            const k = ease((f - T.snow) / 30) * 0.9; P = mixPreset("summer", "overcast", k);
            snow.amount = ease((f - T.snow + 6) / 24);
            const from = { ...idle(f, 1), expression: "surprised" as const, armL: [12, 6] as [number, number], armR: [12, 6] as [number, number], turn: 0.1 };
            wom = blend(from, { ...idle(f, 1), expression: "awe", look: [0.1, -1], tilt: -6, armR: [38, 78], armL: [-14, 112], turn: 0.2 }, (f - T.snow - 8) / 20);
          } else if (id === "08-dimming") {
            // the sun fades behind a haze; at "Temperatures" the thermometer drops and she starts to shiver
            const k = ease((f - T.less) / 70); P = mixPreset("summer", "overcast", 0.15 + 0.75 * k);
            const cold = ease((f - T.temps - 10) / 40);
            wom = blend({ ...idle(f, 1), expression: "worried", look: [0.2, -0.9], tilt: -4, turn: 0.15 }, { ...idle(f, 1), ...shiver(f, 1), look: [0.4, 0.2], turn: 0.2 }, cold);
            thermo.update(f, { from: T.temps - 4, to: T.north, level: 0.82 - 0.55 * ease((f - T.temps - 4) / 50) });
          } else if (id === "10c-summer-snow") {
            P = mixPreset("summer", "overcast", 0.9); snow.amount = 1;
          } else if (id === "14-title") {
            P = mixPreset("summer", "overcast", 0.95); snow.amount = 0.9;
            wom = { ...idle(f, 1), ...shiver(f, 0.6), expression: "sad", look: [0.2, -1], tilt: -5, turn: 0.1 };
            L.title1.update(f, { at: [0.5, 0.2], from: T.title + 4, to: T.last + 12 });
            L.title2.update(f, { at: [0.5, 0.36], from: T.title + 14, to: T.last + 12 });
          }
          rig.apply(P, c, { focus: V(0, 1, -2), radius: 16, az: 125, el: 34 }); clouds.apply(P.look.cloud, c);
          snow.update(f, c);
          woman.update(wom, c, rig);
          const focus = id === "10c-summer-snow" ? V(8, 0.8, -8) : V(0, 1.4, 0.6);
          const coldK = Math.min(1, Math.max(0, (0.86 - P.look.sat) / (0.86 - 0.72)));   // follows the summer -> overcast blend
          return { grade: mixGrade(GRADES.summer, GRADES.cold, coldK), cInf: id === "02-snow" ? 9 : 5, focus };
        }

        // ------------------------------------------------ frost farm: failed harvest
        if (set === "frost") {
          applyCam(c, cam(f));
          rig.apply("overcast", c, { focus: FARM2.clone().add(V(0, 1, -2)), radius: 16 }); clouds.apply("overcast", c);
          snow.amount = 0.8; snow.update(f, c);
          const stalk: Pose["hold"] = (g, h, side) => {
            if (side !== "R") return;
            g.lineCap = "round"; g.strokeStyle = "#3a2622"; g.lineWidth = 12; g.beginPath(); g.moveTo(h.x, h.y + 10); g.quadraticCurveTo(h.x + 10, h.y - 110, h.x + 70, h.y - 120); g.stroke();
            g.strokeStyle = "#c9ad72"; g.lineWidth = 6; g.stroke();
            g.save(); g.translate(h.x + 76, h.y - 112); g.rotate(1.1);
            for (let k = 0; k < 6; k++) { g.fillStyle = "#b8925a"; g.strokeStyle = "#3a2622"; g.lineWidth = 3; g.beginPath(); g.ellipse(k * 9, k % 2 ? 6 : -6, 9, 5, 0.3, 0, Math.PI * 2); g.fill(); g.stroke(); }
            g.restore();
          };
          // he looks out over the field, then sinks to one knee on "harvests failed" and lifts a dead stalk
          const kneel = f >= T.harvests ? 1 : 0;
          const dip = ease((f - (T.harvests - 7)) / 7);                    // sinks a little before the knee goes down
          const stand: Pose = { ...idle(f, 2), expression: dip > 0.3 ? "sad" : "worried", turn: 0.3, look: [0.6, 0.4 + dip * 0.5], bob: -70 * dip, lean: 4 * dip };
          const down: Pose = { ...idle(f, 2), expression: "sad", kneel: 1, armR: [28, 70], armL: [14, 30], tilt: 6, look: [0.5, 0.8], hold: stalk };
          man.update(kneel ? blend({ ...down, armR: [8, 6] }, down, (f - T.harvests - 4) / 16) : stand, c, rig);
          kid.update({ ...idle(f, 3), expression: "worried", turn: 0.4, look: [0.6, 0.6] }, c, rig);
          return { grade: "cold", cInf: 7, focus: man.root.position.clone().add(V(0, 0.8, 0)) };
        }

        // ------------------------------------------------ village: cold, rain, prices
        if (set === "village") {
          applyCam(c, cam(f));
          const id = shot.id;
          rig.apply("overcast", c, { focus: VIL.clone().add(V(-2, 1, -3)), radius: 18 }); clouds.apply("overcast", c);
          rain.amount = id === "10a-cold" ? 0 : id === "10b-rain" ? 1 : 0.55; rain.update(f, c);
          const ex: Pose["expression"][] = ["worried", "worried", "sad", "sad"];
          queue.forEach((a, i) => {
            const base: Pose = { ...idle(f, 10 + i), expression: ex[i], turn: -0.5, look: [-0.8, 0] };
            a.update(id === "10a-cold" ? { ...base, ...shiver(f + i * 7, 1) } : base, c, rig);
          });
          // bread price ticks up: 1x -> 2x -> 3x around "rising prices"
          const step = f < T.prices - 40 ? 1 : f < T.prices + 8 ? 2 : 3;
          board.set("Bread", `${step}×`, step === 3 ? "#b0302a" : "#2b1f1c");
          if (id === "10a-cold") L.y2.update(f, { at: [0.5, 0.16], from: T.cold + 4, to: T.rain - 10 });
          return { grade: "cold", cInf: 6, focus: queue[3].root.position.clone().add(V(0, 0.6, 0)), focusTo: queue[0].root.position.clone().add(V(0, 1.2, 0)) };
        }

        // ------------------------------------------------ volcano
        if (set === "volcano") {
          applyCam(c, cam(f));
          rig.apply("golden", c, { focus: VOLC.clone().add(V(0, 8, 0)), radius: 80, az: 120, el: 16 }); clouds.apply("golden", c);
          sea.apply("golden", f / FPS);
          steam.root.visible = f < T.unleashed + 20; steam.update(f, c); plume.update(f, c, new THREE.Color(1.05, 0.92, 0.85));
          // impact shake on the eruption
          const d = f - T.unleashed;
          if (d >= 0 && d < 12) { c.position.y += (d % 2 ? -1 : 1) * 0.35 * (1 - d / 12); c.updateMatrixWorld(); }
          L.tam.update(f, { at: [0.3, 0.74], from: W("Mount", T.tambora) - 4, to: T.so2 - 6 });
          return { grade: "golden" };
        }

        // ------------------------------------------------ atmosphere cross-section
        if (set === "atmos") {
          applyCam(c, cam(f));
          rig.apply("summer", c, { focus: ATM.clone().add(V(0, 4, 0)), radius: 30, az: 160, el: 40 });
          scene.fog = null;
          const spread = ease((f - T.transformed) / 110), rays = ease((f - (T.reflected - 40)) / 70);
          atmos.update(f, c, { columnAge: f - T.so2 + 20, cloud: ease((f - T.so2 - 70) / 30), spread, rays });
          const A = atmos.anchors, end = T.less + 6;
          L.strat.update(f, { at: A.strat, ...lt(T.so2 + 8, end) }); L.trop.update(f, { at: A.trop, ...lt(T.so2 + 14, end) });
          L.so2.update(f, { at: ATM.clone().add(V(-2.2, 8.6, 3)), ...lt(W("sulfur", T.so2) - 4, T.aerosols + 4) });
          L.aer.update(f, { at: A.aerosols, ...lt(W("sulfate", T.aerosols) - 2, end) });
          L.wind.update(f, { at: A.wind, ...lt(T.transformed + 10, end) });
          L.inc.update(f, { at: A.incoming, ...lt(T.reflected - 36, end) });
          L.refl.update(f, { at: A.reflected, ...lt(T.reflected + 4, end) });
          L.less.update(f, { at: A.ground, ...lt(T.reflected + 40, end) });
          return { grade: "neutral" };
        }

        // ------------------------------------------------ globe
        scene.fog = null; scene.background = new THREE.Color("#05070f");
        applyCam(c, { ...GLOBE_CAM, pos: [GLOBE_CAM.pos[0], GLOBE_CAM.pos[1], GLOBE_CAM.pos[2] - (f - shot.a) * 0.006] });   // slow push-in
        const id = shot.id;
        const sun = V(0.75, 0.35, 0.8);
        if (id === "03-globe-1816") {
          faceBetween([25, -72], [42, -30], smootherstep((f - shot.a) / (shot.b - shot.a + 30)));   // keeps turning all shot long
          const nf = W("North", T.y1816), ef = W("Europe", T.y1816);
          globe.update({ sunDir: sun, hi: { na: ease((f - nf + 4) / 10), eu: ease((f - ef + 4) / 10) } });
          L.year.update(f, { at: [0.5, 0.17], from: W("1816,", T.y1816) - 2, to: T.away + 6 });
          L.na.update(f, { at: globe.at(45, -98, 0.05), ...lt(nf - 2, T.away + 6) });
          L.eu.update(f, { at: globe.at(50, 12, 0.05), ...lt(ef - 2, T.away + 6) });
        } else if (id === "04-far-away") {
          const t = smootherstep((f - T.away) / 70) * 0.94 + 0.06 * (f - T.away) / (T.tambora - T.away);
          faceBetween([42, -30], [-4, 102], t, 0);
          globe.update({ sunDir: sun, hi: { na: 1, eu: 1, id: ease((f - T.away - 40) / 15) } });
          pin.group.visible = true; pin.pulse((f - T.away) / 30);
          arcs.forEach((a) => { a.mesh.visible = true; a.progress = ease((f - T.away - 25) / 55); });
        } else if (id === "09-north") {
          faceBetween([26, -8], [34, 24], (f - shot.a) / (shot.b - shot.a), 18);
          globe.update({ sunDir: sun, hi: {}, north: ease((f - W("Northern", T.north) + 6) / 18), northColor: "#9cc6ff" });
          L.nh.update(f, { at: [0.5, 0.2], from: W("Northern", T.north) - 2, to: T.cold + 6 });
        } else if (id === "13-far-beyond") {
          const t = smootherstep((f - T.conseq) / (T.title - T.conseq + 20));
          faceBetween([5, 90], [30, 14], t, 6);
          globe.update({ sunDir: sun, hi: { na: ease((f - T.conseq - 60) / 20), eu: ease((f - T.conseq - 60) / 20), id: 1 }, veil: { src: TAMBORA, spread: 0.15 + 0.85 * ease((f - T.conseq) / 150), opacity: 0.85 }, t: f / FPS });
          arcs.forEach((a) => { a.mesh.visible = true; a.progress = ease((f - T.conseq - 10) / 80); });
          pin.group.visible = true; pin.pulse((f - T.conseq) / 30);
        } else {
          // 15: slow turn with the veil wrapped around the world; fade to night at the end
          faceBetween([20, 40], [25, -10], (f - T.last) / (END - T.last), 10);
          globe.update({ sunDir: sun, hi: {}, veil: { src: TAMBORA, spread: 1, opacity: 0.6 }, t: f / FPS });
        }
        return { grade: "neutral" };
      },
    };
  },
});
