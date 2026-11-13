// Style frames for the cinematic revision of "The Year Without a Summer" (review 4). Not part of the video.
import * as THREE from "three";
import { defineFilm, rng, type FrameState } from "@engine/film";
import { CineRig, mixCine, CINE } from "@engine/look/cine";
import { pbrMaps } from "@engine/look/pbr";
import { V } from "@engine/env/geo";
import { heroLeaf, flakeTexture, wheatField, grassField } from "@engine/env/foliage";
import { volcanoIsland } from "@engine/env/terrain";
import { Fall } from "@engine/fx/particles";
import { EruptionColumn } from "@engine/fx/column";
import { PyroFlows } from "@engine/fx/pyro";
import { NOINK } from "@engine/post/ink";
import { Actor } from "@engine/chars/actor";
import { idle, shiver } from "@engine/chars/clips";
import { Label, loadFontUrl } from "@engine/overlay/label";
import { Inset, SO2_TO_AEROSOL } from "@engine/overlay/inset";
import { applyCam } from "@engine/camera";
import { FARMER_WOMAN, FARMER_MAN, CHILD } from "../tambora-1816/cast";
import { buildVillage2 } from "../tambora-1816/village2";
import { buildScience } from "../tambora-1816/science";

const VIL = V(0, 0, 0), LEAF = V(2.6, 0.95, 12.5), VOLC = V(-30000, 0, 0), SCI = V(9000, 0, 0), FIELD = V(3000, 0, 0);
const FRAMES = ["leaf", "reveal", "eruption", "science-gas", "science-light", "harvest", "market", "title"];

export default defineFilm({
  id: "tambora-v2-frames",
  shots: FRAMES.map((id, i) => ({ id, a: i, b: i + 1 })),
  post: { ink: false, tone: "agx", godrays: true, grain: 0.07, vignette: 0.42, ca: 0.0007 },
  camera: { near: 0.01, far: 12000 },
  async setup(ctx) {
    await Promise.all([loadFontUrl(ctx.asset("fonts/Inter-Variable.ttf"), "Inter"), loadFontUrl(ctx.asset("fonts/Cinzel-Variable.ttf"), "Cinzel")]);
    const scene = new THREE.Scene();
    const cine = new CineRig(scene, ctx.renderer);
    const r = rng(9);
    // ---- village + leaf
    buildVillage2(scene, VIL, { snow: 0.25 });
    const leaf = heroLeaf({ length: 0.13 }); leaf.position.copy(LEAF); leaf.rotation.set(0.1, 0.35, 0.18); scene.add(leaf);
    const flakeMats = [1, 2, 3, 4].map((s) => new THREE.SpriteMaterial({ map: flakeTexture(s), transparent: true, depthWrite: false }));
    for (let i = 0; i < 40; i++) { const s = new THREE.Sprite(flakeMats[i % 4]); s.scale.setScalar(0.006 + r() * 0.006); s.layers.set(NOINK); s.position.copy(LEAF).add(V(-0.25 + r() * 0.5, -0.05 + r() * 0.3, -0.3 + r() * 0.5)); scene.add(s); }
    // flakes resting on the leaf: flat crystals lying on the blade, a few beginning to melt into droplets
    for (let i = 0; i < 18; i++) {
      const fm = new THREE.MeshStandardMaterial({ map: flakeTexture(1 + (i % 4)), transparent: true, depthWrite: false, roughness: 0.4, emissive: new THREE.Color("#b8c6da"), emissiveIntensity: 0.5 });
      const sz = 0.007 + r() * 0.008, m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz).rotateX(-Math.PI / 2), fm);
      m.rotation.y = r() * 6; m.position.set(0.02 + r() * 0.095, 0.0012, (r() - 0.5) * 0.026); leaf.add(m);
    }
    const snow = new Fall({ count: 14000, area: [26, 14, 26], speed: 0.7, size: 0.09, seed: 3, opacity: 0.9 }); scene.add(snow.points);
    const meadow = grassField({ w: 18, d: 14, count: 34000, h: 0.34, seed: 8, frost: 0.55 }); meadow.position.set(0.6, 0, 27); scene.add(meadow);
    // ---- volcano (1 unit = 1 m): island ~9 km across, summit ~2.9 km, column to ~23 km
    const ISC = 115;
    const isl = volcanoIsland({ radius: 40, height: 25, crater: 4.2, craterDepth: 3, seed: 4, seg: 260,
      colors: { beach: "#5e5548", forest: "#26381f", scrub: "#3f4233", rock: "#3a322d", ash: "#4a433e", crater: "#221b1a" } });
    const vmaps = pbrMaps("volcanic"); const vn = vmaps.normalMap.clone(); vn.repeat.set(30, 30); vn.needsUpdate = true;
    isl.material = new THREE.MeshStandardMaterial({ vertexColors: true, color: "#6c6c6c", roughness: 0.95, normalMap: vn, normalScale: new THREE.Vector2(1.4, 1.4) });
    isl.scale.setScalar(ISC); isl.position.copy(VOLC); isl.castShadow = isl.receiveShadow = true; scene.add(isl);
    const wave = pbrMaps("waves").normalMap.clone(); wave.repeat.set(900, 900); wave.needsUpdate = true;
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(240000, 240000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#0b1a24", roughness: 0.55, metalness: 0, envMapIntensity: 0.12, normalMap: wave, normalScale: new THREE.Vector2(0.5, 0.5) }));
    sea.position.copy(VOLC).add(V(0, 2, 0)); sea.receiveShadow = true; scene.add(sea);
    const vent = VOLC.clone().add(V(0, 2300, 0));
    const column = new EruptionColumn({ vent, height: 21000, base: 520, top: 3600, umbrella: 15000, wind: [0.1, -0.02], seed: 2, dark: "#2c2624", lit: "#ddd0c4" });
    scene.add(column.root);
    const prof = (d: number) => ISC * 25 * Math.pow(Math.max(0, 1 - d / (40 * ISC)), 1.65);
    const flows = new PyroFlows({ center: VOLC, rim: 600, base: 4100, height: 2900, start: -200, lanes: 12, perLane: 30, speed: 0.12, size: [180, 750], seed: 5 });
    scene.add(flows.root);
    // ---- science diorama
    const sci = buildScience(scene, SCI);
    // ---- frozen field + market people
    const field = new THREE.Group(); field.position.copy(FIELD); scene.add(field);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ ...(() => { const m = pbrMaps("frost"); const t = { map: m.map.clone(), normalMap: m.normalMap.clone(), roughnessMap: m.roughnessMap.clone() }; for (const x of Object.values(t)) { x.repeat.set(120, 120); x.needsUpdate = true; } return t; })() }));
    ground.receiveShadow = true; field.add(ground);
    field.add(wheatField({ w: 14, d: 10, count: 30000, h: 0.95, frost: 0.4, clear: [[0.4, 0.8, 0.85], [1.4, 2.6, 0.9]] }));
    const man = new Actor(FARMER_MAN, 1.75); man.root.position.copy(FIELD).add(V(0.4, 0, 0.8)); scene.add(man.root);
    const woman = new Actor(FARMER_WOMAN, 1.62), w2 = new Actor(FARMER_WOMAN, 1.6), kid = new Actor(CHILD, 2.5);
    const sq = V(-4.2, 0, -23);
    const top = 0.064;   // the square is a raised cobbled disc: stand on it, not in it
    woman.root.position.copy(sq).add(V(1.55, top, 2.9)); w2.root.position.copy(sq).add(V(2.25, top, 2.0)); kid.root.position.copy(sq).add(V(0.45, top, 3.3));
    scene.add(woman.root, w2.root, kid.root);
    // chalkboard at the bread stall
    const cb = document.createElement("canvas"); cb.width = 512; cb.height = 640;
    const cg = cb.getContext("2d")!;
    cg.fillStyle = "#5a4330"; cg.fillRect(0, 0, 512, 640); cg.fillStyle = "#23282a"; cg.fillRect(22, 22, 468, 596);
    for (let i = 0; i < 1600; i++) { cg.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.03})`; cg.fillRect(r() * 512, r() * 640, 2 + r() * 6, 1); }
    cg.fillStyle = "#f1eee6"; cg.textAlign = "center"; cg.font = "600 86px Cinzel, serif"; cg.fillText("BREAD", 256, 170);
    cg.font = "500 40px Inter, sans-serif"; cg.fillText("one loaf", 256, 240);
    // a rising price, drawn as a chalk arrow (the script says "rising prices"; no invented figures)
    cg.strokeStyle = "#f3d9c7"; cg.lineWidth = 16; cg.lineCap = "round"; cg.lineJoin = "round";
    cg.beginPath(); cg.moveTo(130, 470); cg.lineTo(215, 400); cg.lineTo(275, 430); cg.lineTo(375, 300); cg.stroke();
    cg.beginPath(); cg.moveTo(318, 300); cg.lineTo(380, 292); cg.lineTo(378, 356); cg.stroke();
    cg.font = "600 52px Cinzel, serif"; cg.fillStyle = "#f1eee6"; cg.fillText("PRICE", 256, 560);
    const cbt = new THREE.CanvasTexture(cb); cbt.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.75), new THREE.MeshStandardMaterial({ map: cbt, roughness: 0.85 }));
    board.position.copy(sq).add(V(0.75, 1.42, 0.55)); board.rotation.set(-0.12, 0.35, 0); scene.add(board);
    // labels / insets
    const L = {
      so2: new Label(ctx, "Sulfur dioxide gas (SO₂)", { style: "doc", accent: "#f2d34f" }),
      aer: new Label(ctx, "Sulfate aerosols", { style: "doc", accent: "#cfe0ff" }),
      strat: new Label(ctx, "STRATOSPHERE", { style: "doc", size: 32, accent: "#6fa2d8" }), trop: new Label(ctx, "TROPOSPHERE", { style: "doc", size: 32, accent: "#9cc3e6" }),
      inc: new Label(ctx, "Incoming sunlight", { style: "doc", accent: "#ffc94a" }), refl: new Label(ctx, "Reflected back to space", { style: "doc", accent: "#ffc94a" }),
      less: new Label(ctx, "Less sunlight reaches the surface", { style: "doc", accent: "#e2553f" }),
      tam: new Label(ctx, "Mount Tambora", { style: "doc", sub: "Sumbawa, Indonesia · April 1815", size: 46, accent: "#e2553f" }),
      title: new Label(ctx, "THE YEAR\nWITHOUT A SUMMER", { style: "cine-title", size: 64 }), year: new Label(ctx, "1816", { style: "cine-sub", size: 52 }),
    };
    const inset = new Inset(ctx, SO2_TO_AEROSOL, "SO₂ + water vapour → tiny sulfate aerosol droplets", { at: [0.66, 0.3], size: 400 });
    const hide = () => { for (const l of Object.values(L)) l.el.style.opacity = "0"; inset.el.style.opacity = "0"; };
    const lt = (c: THREE.Camera) => ({ cam: c, from: 0, to: 100 });

    return {
      scene,
      frame(f, shot, c): FrameState {
        hide();
        c.near = 0.1; snow.amount = 0; column.root.visible = flows.root.visible = false;
        sea.visible = isl.visible = shot.id === "eruption";
        if (shot.id === "leaf") {
          applyCam(c, { pos: [LEAF.x + 0.05, LEAF.y + 0.085, LEAF.z + 0.34], look: [LEAF.x + 0.05, LEAF.y - 0.03, LEAF.z - 1], fov: 40 });
          c.near = 0.005; c.updateProjectionMatrix();
          const st = cine.apply(mixCine("cine-morning", "cine-overcast", 0.25), c, { focus: LEAF, radius: 6 });
          snow.amount = 1; snow.update(30, c);
          return { exposure: st.exposure, grade: "cine", cInf: 24, focus: LEAF.clone().add(V(0.06, 0, 0)), sun: st.sunWorld, godrays: 0.6 };
        }
        if (shot.id === "reveal") {
          applyCam(c, { pos: [0.4, 7.5, 21], look: [-1, 2.4, -24], fov: 42 });
          const st = cine.apply({ ...mixCine("cine-morning", "cine-snow", 0.45), hemiSky: "#cfd2d6" }, c, { focus: V(0, 2, -6), radius: 40 });
          snow.amount = 1; snow.update(30, c);
          return { exposure: st.exposure, grade: "cine", cInf: 3, focus: V(0, 2, -6), sun: st.sunWorld, godrays: 0.35 };
        }
        if (shot.id === "eruption") {
          const D = 25000, dir = V(0.55, 0, 0.83).normalize();
          applyCam(c, { pos: [VOLC.x + dir.x * D, 320, VOLC.z + dir.z * D], look: [VOLC.x, 320 + D * Math.tan(0.36), VOLC.z], fov: 50 });
          c.near = 30; c.far = 150000; c.updateProjectionMatrix();
          const ERUPT = { ...mixCine("cine-eruption", "cine-ashfall", 0.3), fogDensity: 0.000014, sunAz: 305, sunEl: 13, overcast: 0.45, skyTint: "#8d7c72", sunI: 2.4, hemiI: 0.35, envI: 0.4 };
          const st = cine.apply(ERUPT, c, { focus: VOLC.clone().add(V(0, 6000, 0)), radius: 30000 });
          column.root.visible = flows.root.visible = true;
          const warm = new THREE.Color(1.1, 0.95, 0.85);
          column.update(12, { grow: 1, light: warm, sunDir: CineRig.sunDirOf(ERUPT) }); flows.update(60, warm, prof);
          L.tam.update(5, { at: [0.5, 0.16], from: 0, to: 100 });
          return { exposure: st.exposure, grade: "cine", cInf: 0, focus: vent, sun: st.sunWorld, godrays: 0.7 };
        }
        if (shot.id === "science-gas" || shot.id === "science-light") {
          applyCam(c, { pos: [SCI.x + 7, SCI.y + 16.5, SCI.z + 44], look: [SCI.x + 0.5, SCI.y + 16.5, SCI.z], fov: 44 });
          c.far = 2000; c.updateProjectionMatrix();
          const st = cine.apply("cine-summer", c, { focus: SCI.clone().add(V(0, 3, 0)), radius: 30 });
          scene.fog = null;
          const gas = shot.id === "science-gas";
          sci.update(gas ? { gas: 0.92, convert: 0.12, spread: 0, rays: 0, t: 3 } : { gas: 1, convert: 1, spread: 1, rays: 1, t: 6 });
          const A = sci.anchors;
          L.strat.update(5, { at: A.strat, ...lt(c) }); L.trop.update(5, { at: A.trop, ...lt(c) });
          if (gas) { L.so2.update(5, { at: A.so2, ...lt(c) }); inset.update(30, { from: 0, to: 100 }); }
          else { L.aer.update(5, { at: A.aer, ...lt(c) }); L.inc.update(5, { at: A.inc, ...lt(c) }); L.refl.update(5, { at: A.refl, ...lt(c) }); L.less.update(5, { at: A.less, ...lt(c) }); }
          return { exposure: st.exposure, grade: "cine" };
        }
        if (shot.id === "harvest") {
          applyCam(c, { pos: [FIELD.x + 2.6, 1.45, FIELD.z + 5.6], look: [FIELD.x + 0.55, 0.7, FIELD.z + 0.8], fov: 34 });
          const st = cine.apply("cine-snow", c, { focus: FIELD.clone().add(V(0, 0.5, 0)), radius: 10 });
          snow.amount = 0.9; snow.update(30, c);
          const sd = CineRig.sunDirOf(CINE["cine-snow"]);
          const lt2 = man.light("#c9d1dc", sd, c, "rgb(70,78,100)", 0.3);
          man.update({ ...idle(10, 2), expression: "sad", kneel: 1, armR: [28, 70], armL: [14, 30], tilt: 6, look: [0.5, 0.8], light: lt2,
            hold: (g, h, side) => {
              if (side !== "R") return;
              g.lineCap = "round"; g.strokeStyle = "#3a2622"; g.lineWidth = 12; g.beginPath(); g.moveTo(h.x, h.y + 10); g.quadraticCurveTo(h.x + 10, h.y - 110, h.x + 70, h.y - 120); g.stroke();
              g.strokeStyle = "#c9ad72"; g.lineWidth = 6; g.stroke();
              g.save(); g.translate(h.x + 76, h.y - 112); g.rotate(1.1);
              for (let k = 0; k < 6; k++) { g.fillStyle = "#b8925a"; g.strokeStyle = "#3a2622"; g.lineWidth = 3; g.beginPath(); g.ellipse(k * 9, k % 2 ? 6 : -6, 9, 5, 0.3, 0, Math.PI * 2); g.fill(); g.stroke(); }
              g.restore();
            } }, c);
          return { exposure: st.exposure, grade: "cine-cold", cInf: 10, focus: man.root.position.clone().add(V(0, 0.7, 0)) };
        }
        if (shot.id === "market") {
          applyCam(c, { pos: [sq.x + 1.3, 1.45, sq.z + 8.6], look: [sq.x + 1.15, 1.1, sq.z + 1.5], fov: 44 });
          const st = cine.apply("cine-overcast", c, { focus: sq, radius: 12 });
          snow.amount = 0.5; snow.update(30, c);
          const sd = CineRig.sunDirOf(CINE["cine-overcast"]);
          for (const [a, ex, sh] of [[woman, "worried", 0.6], [w2, "sad", 0], [kid, "sad", 0.4]] as [Actor, "worried" | "sad", number][]) {
            const l = a.light("#c3cad4", sd, c, "rgb(70,78,100)", 0.3);
            a.update({ ...idle(10, 3), ...(sh ? shiver(10, sh) : {}), expression: ex, turn: -0.4, look: [-0.6, 0], light: l }, c);
          }
          return { exposure: st.exposure, grade: "cine-cold", cInf: 6, focus: woman.root.position.clone().add(V(0, 1.2, 0)), focusTo: board.position.clone() };
        }
        // title: snowy summer meadow, the village far away, title on screen
        applyCam(c, { pos: [0.6, 2.0, 34], look: [-0.5, 3.6, -20], fov: 44 });
        const st = cine.apply(mixCine("cine-snow", "cine-morning", 0.25), c, { focus: V(0, 2, 0), radius: 40 });
        snow.amount = 1; snow.update(30, c);
        L.title.update(20, { at: [0.5, 0.32], from: 0, to: 100 }); L.year.update(20, { at: [0.5, 0.4], from: 0, to: 100 });
        return { exposure: st.exposure, grade: "cine", cInf: 4, focus: V(0, 2, -10), sun: st.sunWorld, godrays: 0.4 };
      },
    };
  },
});
