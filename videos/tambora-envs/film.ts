// Environment review for "The Year Without a Summer": one still per set (not part of the video).
import * as THREE from "three";
import { defineFilm } from "@engine/film";
import { LightRig } from "@engine/look/rig";
import { Clouds } from "@engine/look/clouds";
import { Water } from "@engine/look/water";
import { Actor } from "@engine/chars/actor";
import { idle } from "@engine/chars/clips";
import { Fall } from "@engine/fx/particles";
import { Plume } from "@engine/fx/plume";
import { volcanoIsland } from "@engine/env/terrain";
import { Globe, starField } from "@engine/geo/globe";
import { Label, loadFont } from "@engine/overlay/label";
import { applyCam, type CamPose } from "@engine/camera";
import { V } from "@engine/env/geo";
import { FARMER_WOMAN, FARMER_MAN, CHILD } from "../tambora-1816/cast";
import { buildFarm, cropPatch } from "@lib/environment/farm-1810s@1";
import { buildAtmos, ATMOS_CAM } from "@lib/environment/atmosphere-cross-section@1";
import { buildVillage, PriceBoard } from "@lib/environment/village-market@1";
import type { Design } from "@engine/chars/toon";

const FARM2 = V(400, 0, 0), VIL = V(800, 0, 0), VOLC = V(-3000, 0, 0), GLOBE = V(0, -6000, 0), ATM = V(6000, 0, 0);
const TAMBORA: [number, number] = [-8.25, 118.0];

export default defineFilm({
  id: "tambora-envs",
  shots: ["farm-summer", "globe-1816", "tambora-eruption", "aerosol-veil", "farm-frost", "village-rain"].map((id, i) => ({ id, a: i, b: i + 1 })),
  camera: { far: 9000 },
  async setup(ctx) {
    await loadFont(ctx, "font/fredoka", 1, "Fredoka-Variable.ttf", "Fredoka");
    const scene = new THREE.Scene();
    const rig = new LightRig(scene, { shadowMap: 4096 });
    const clouds = new Clouds({ seed: 2 }); scene.add(clouds.root);
   
    buildFarm(scene); buildFarm(scene, { season: "frost", at: FARM2 }); buildVillage(scene, VIL);
    cropPatch(scene, FARM2.clone().add(V(0.2, 0, -0.6)), { w: 9, d: 5.4, frost: true, clear: 0.5, height: 0.42 });
    const atmos = buildAtmos(scene, ATM);
    // volcano + sea
    const isl = volcanoIsland({ radius: 40, height: 21, crater: 5.5, craterDepth: 3.5, seed: 4 }); isl.position.copy(VOLC); scene.add(isl);
    const sea = new Water({ x0: VOLC.x - 900, x1: VOLC.x + 900, z0: -900, z1: 900, y: 0, flow: [0.2, 0.1], tiles: [10, 50] }); scene.add(sea.mesh);
    const plume = new Plume({ vent: VOLC.clone().add(V(0, 18.5, 0)), rate: 11, rise: 2.6, life: 260, size: [6, 42], wind: [1.4, 0, 0.4], start: -400, seed: 2, color: ["#3b3433", "#a39a92"], max: 420, glow: "#ff8a2a" });
    scene.add(plume.root);
    // globe in space
    const space = new THREE.Group(); space.position.copy(GLOBE); scene.add(space);
    const globe = await Globe.create(ctx, { radius: 5, regions: {
      na: (p) => p.CONTINENT === "North America", eu: (p) => p.CONTINENT === "Europe", id: (p) => p.NAME === "Indonesia" } });
    space.add(globe.root);
    const stars = starField(); space.add(stars);
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
    const snow = new Fall({ count: 7000, area: [14, 8, 14], speed: 0.8, size: 0.085, seed: 3 }); scene.add(snow.points);
    const rain = new Fall({ count: 6000, area: [12, 8, 12], speed: 9, sway: 0.04, color: "#dfe7f2", seed: 5, streak: 1, opacity: 0.5 }); scene.add(rain.points);
    // sunlight arrows for the aerosol shot
    const arrows = new THREE.Group(); space.add(arrows);
    const arrow = (a: THREE.Vector3, b: THREE.Vector3, col: string) => {
      const d = b.clone().sub(a), len = d.length(), g = new THREE.Group();
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.6) });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len - 0.3, 10).translate(0, (len - 0.3) / 2, 0), m);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 14).translate(0, len - 0.16, 0), m);
      g.add(shaft, head); g.position.copy(a); g.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); arrows.add(g);
    };
    const labels = {
      year: new Label(ctx, "1816", { style: "year" }),
      na: new Label(ctx, "North America"), eu: new Label(ctx, "Europe"),
      tam: new Label(ctx, "Mount Tambora", { sub: "April 1815" }),
      aer: new Label(ctx, "sulfate aerosols"),
      strat: new Label(ctx, "Stratosphere", { style: "plain", color: "#fbf3e2", size: 50 }),
      trop: new Label(ctx, "Troposphere", { style: "plain", color: "#2b3a4a", size: 50 }),
      inc: new Label(ctx, "incoming sunlight", { style: "plain", color: "#fbf3e2", size: 40 }),
      refl: new Label(ctx, "reflected to space", { style: "plain", color: "#fbf3e2", size: 40 }),
      wind: new Label(ctx, "wind", { style: "plain", color: "#fbf3e2", size: 42 }),
      less: new Label(ctx, "less sunlight reaches the ground", { style: "plain", color: "#2b3a4a", size: 38 }),
    };
    const sunW = V(1, 0.35, 0.6).normalize();
    let arrowsBuilt = false;
    const globeSun = V(1, 0.35, 0.6).normalize();
    return {
      scene,
      frame(f, shot, c) {
        const id = shot.id;
        for (const l of Object.values(labels)) l.el.style.opacity = "0";
        const spaceShot = id === "globe-1816";
        rig.root.visible = !spaceShot; clouds.root.visible = !spaceShot; stars.visible = spaceShot;
        snow.amount = id === "farm-frost" ? 0.8 : 0; rain.amount = id === "village-rain" ? 1 : 0;
        arrows.visible = id === "aerosol-veil";
        const P = (pos: number[], look: number[], fov: number, o = V(0, 0, 0)): CamPose => ({ pos: [pos[0] + o.x, pos[1] + o.y, pos[2] + o.z], look: [look[0] + o.x, look[1] + o.y, look[2] + o.z], fov });
        let ret = {};
        if (id === "farm-summer") {
          applyCam(c, P([3.4, 1.5, 8.6], [-0.6, 1.9, -4], 44));
          rig.apply("summer", c, { focus: V(0, 1, -2), radius: 16, az: 125, el: 34 }); clouds.apply("summer", c);
          woman.update({ ...idle(10, 1), expression: "happy", armL: [150, 30], armR: [150, 30], turn: 0.1 }, c, rig);
          ret = { grade: "summer", cInf: 5, focus: V(0, 1.4, 0.6) };
        } else if (id === "farm-frost") {
          applyCam(c, P([1.5, 1.75, 4.9], [-0.1, 0.6, -0.6], 42, FARM2));
          rig.apply("overcast", c, { focus: FARM2.clone().add(V(0, 1, -2)), radius: 16 }); clouds.apply("overcast", c);
          man.update({ ...idle(10, 2), expression: "sad", kneel: 1, armR: [28, 70], armL: [14, 30], tilt: 6, look: [0.5, 0.8],
            hold: (g, h, side) => {
              if (side !== "R") return;   // a dead, drooping wheat stalk
              g.lineCap = "round"; g.strokeStyle = "#3a2622"; g.lineWidth = 12; g.beginPath(); g.moveTo(h.x, h.y + 10); g.quadraticCurveTo(h.x + 10, h.y - 110, h.x + 70, h.y - 120); g.stroke();
              g.strokeStyle = "#a8915a"; g.lineWidth = 6; g.stroke();
              g.save(); g.translate(h.x + 76, h.y - 112); g.rotate(1.1);
              for (let k = 0; k < 6; k++) { g.fillStyle = "#8f7a48"; g.strokeStyle = "#3a2622"; g.lineWidth = 3; g.beginPath(); g.ellipse(k * 9, (k % 2 ? 6 : -6), 9, 5, 0.3, 0, Math.PI * 2); g.fill(); g.stroke(); }
              g.restore();
            } }, c, rig);
          kid.update({ ...idle(10, 3), expression: "worried", turn: 0.4, look: [0.6, 0.6] }, c, rig);
          snow.update(40, c);
          ret = { grade: "cold", cInf: 7, focus: man.root.position.clone().add(V(0, 0.8, 0)) };
        } else if (id === "village-rain") {
          applyCam(c, P([1.2, 1.5, 4.2], [-3.0, 1.35, -3.2], 50, VIL));
          rig.apply("overcast", c, { focus: VIL.clone().add(V(-2, 1, -3)), radius: 18 }); clouds.apply("overcast", c);
          queue.forEach((a, i) => a.update({ ...idle(10, 10 + i), expression: (["worried", "worried", "sad", "sad"] as const)[i], turn: -0.5, look: [-0.8, 0] }, c, rig));
          board.set("Bread", "3×", "#b0302a");
          rain.update(30, c);
          // keep the whole queue sharp (child in front .. adults behind); only the street beyond blurs
          ret = { grade: "cold", cInf: 6, focus: queue[3].root.position.clone().add(V(0, 0.6, 0)), focusTo: queue[0].root.position.clone().add(V(0, 1.2, 0)) };
        } else if (id === "tambora-eruption") {
          applyCam(c, P([72, 3, 92], [0, 32, 0], 46, VOLC));
          rig.apply("golden", c, { focus: VOLC.clone().add(V(0, 8, 0)), radius: 80, az: 120, el: 16 }); clouds.apply("golden", c);
          sea.apply("golden", 4);
          plume.update(0, c, new THREE.Color(1.05, 0.92, 0.85));
          labels.tam.update(5, { at: [0.3, 0.74], from: 0, to: 100 });
          ret = { grade: "golden", exposure: 1 };
        } else if (id === "aerosol-veil") {
          applyCam(c, P(ATMOS_CAM.pos, ATMOS_CAM.look, ATMOS_CAM.fov, ATM));
          rig.apply("summer", c, { focus: ATM.clone().add(V(0, 4, 0)), radius: 30, az: 160, el: 40 });
          scene.fog = null;
          atmos.update(0, c, { spread: 1, rays: 1 });
          const L = labels, all = { cam: c, from: 0, to: 100 };
          L.strat.update(5, { at: atmos.anchors.strat, ...all }); L.trop.update(5, { at: atmos.anchors.trop, ...all });
          L.aer.update(5, { at: atmos.anchors.aerosols, ...all }); L.inc.update(5, { at: atmos.anchors.incoming, ...all });
          L.refl.update(5, { at: atmos.anchors.reflected, ...all }); L.wind.update(5, { at: atmos.anchors.wind, ...all });
          L.less.update(5, { at: atmos.anchors.ground, ...all });
          ret = { grade: "neutral", cInf: 0 };
        } else {
          scene.fog = null; scene.background = new THREE.Color("#05070f");
          if (id === "globe-1816") {
            applyCam(c, P([0, 0.3, 19], [0, 0.3, 0], 36, GLOBE));
            globe.face(42, -38, c.position.clone().sub(GLOBE), 0);  // North Atlantic toward the camera, north up
            globe.update({ sunDir: V(0.7, 0.4, 0.8), hi: { na: 1, eu: 1 }, north: 0 });
            labels.year.update(5, { at: [0.5, 0.17], from: 0, to: 100 });
            labels.na.update(5, { at: globe.at(45, -98, 0.05), cam: c, from: 0, to: 100 });
            labels.eu.update(5, { at: globe.at(50, 12, 0.05), cam: c, from: 0, to: 100 });
          } else {
            applyCam(c, P([-1.5, 1.2, 15], [0.9, 0.6, 0], 38, GLOBE));
            globe.face(-6, 104, c.position.clone().sub(GLOBE), 8);  // Tambora region facing us, west of centre
            if (!arrowsBuilt) {
              // sunlight from the upper left of the frame: parallel arrows; some stop at the haze and bounce back to
              // space, the rest reach the surface (fewer than before = less energy)
              arrowsBuilt = true;
              const right = V(0, 0, 0).setFromMatrixColumn(c.matrixWorld, 0), up = V(0, 0, 0).setFromMatrixColumn(c.matrixWorld, 1);
              const back = c.position.clone().sub(GLOBE).normalize();
              const toSun = right.clone().multiplyScalar(-0.85).addScaledVector(up, 0.45).addScaledVector(back, 0.3).normalize();
              globeSun.copy(toSun);
              const hitAt = (lat: number, lon: number, alt: number) => globe.at(lat, lon, alt).sub(GLOBE);
              for (const [lat, lon, bounce] of [[14, 98, true], [2, 101, false], [-10, 99, true], [-22, 104, false], [24, 108, true]] as const) {
                const end = bounce ? hitAt(lat, lon, 0.03) : hitAt(lat, lon, 0.004), from = end.clone().addScaledVector(toSun, 2.6);
                arrow(from, end, "#ffd36b");
                if (bounce) { // reflected: r = d - 2 (d.n) n, d = incoming direction
                  const n = end.clone().normalize(), d = toSun.clone().negate(), r = d.clone().addScaledVector(n, -2 * d.dot(n)).normalize();
                  arrow(end, end.clone().addScaledVector(r, 1.7), "#ffab45");
                }
              }
            }
            globe.update({ sunDir: globeSun, hi: {}, veil: { src: TAMBORA, spread: 0.55, opacity: 0.95 }, t: 3 });
            labels.aer.update(5, { at: globe.at(-2, 112, 0.08), cam: c, from: 0, to: 100, lift: 30 });
          }
          ret = { grade: "neutral", cInf: 0 };
        }
        return ret;
      },
    };
  },
});
