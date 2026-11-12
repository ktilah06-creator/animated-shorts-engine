// "The Year Without a Summer" (Tambora 1815 -> 1816). Shots are laid on the voice-over's sentence cues.
import * as THREE from "three";
import { defineFilm } from "@engine/film";
import { makeCues } from "@engine/cues";
import { LightRig, mixPreset } from "@engine/look/rig";
import { Clouds } from "@engine/look/clouds";
import { Actor } from "@engine/chars/actor";
import { idle, blend, ease } from "@engine/chars/clips";
import { Fall } from "@engine/fx/particles";
import { camPath, applyCam } from "@engine/camera";
import { V } from "@engine/env/geo";
import cueData from "./cues.json";
import { FARMER_WOMAN } from "./cast";
import { buildFarm } from "./farm";

const cues = makeCues(cueData, 30);
const S = (i: number) => cues.sentence(i);
const shots = [
  { id: "01-july-morning", a: 0, b: S(1).a, scene: "farm" },
  { id: "02-snow", a: S(1).a, b: S(2).a, scene: "farm" },
];

const cam = camPath([
  { f: 0, pose: { pos: [3.4, 1.5, 8.6], look: [-0.6, 1.9, -4], fov: 44 }, creep: 0.3 },
  { f: S(1).a, pose: { pos: [1.1, 0.55, 3.6], look: [-0.2, 2.3, -1.5], fov: 46 }, cut: true, creep: 0.25 },
]);

export default defineFilm({
  id: "tambora-1816",
  shots,
  setup() {
    const scene = new THREE.Scene();
    const rig = new LightRig(scene, { shadowMap: 4096 });
    const clouds = new Clouds({ seed: 2 }); scene.add(clouds.root);
    buildFarm(scene);
    const woman = new Actor(FARMER_WOMAN, 1.62);
    woman.root.position.set(0, 0, 0.6); scene.add(woman.root);
    const snow = new Fall({ count: 7000, area: [14, 8, 14], speed: 0.8, size: 0.085, seed: 3 });
    scene.add(snow.points);
    return {
      scene,
      frame(f, shot, c) {
        applyCam(c, cam(f));
        const s2 = S(1).a;
        // the weather turns over the first second of shot 2
        const k = shot.id === "01-july-morning" ? 0 : ease((f - s2) / 30) * 0.9;
        const P = mixPreset("summer", "overcast", k);
        rig.apply(P, c, { focus: V(0, 1, -2), radius: 16, az: 125, el: 34 });
        clouds.apply(P.look.cloud, c);
        snow.amount = shot.id === "02-snow" ? ease((f - s2 + 6) / 24) : 0;
        snow.update(f, c);
        const morning = { ...idle(f, 1), expression: "happy" as const, armL: [150, 30] as [number, number], armR: [150, 30] as [number, number], turn: 0.1 };
        const look = { ...idle(f, 1), expression: "awe" as const, look: [0.1, -1] as [number, number], tilt: -6, armR: [38, 78] as [number, number], armL: [-14, 112] as [number, number], turn: 0.2 };
        const pose = shot.id === "01-july-morning" ? blend(morning, { ...morning, armL: [12, 6], armR: [12, 6] }, (f - 50) / 25) : blend({ ...morning, armL: [12, 6], armR: [12, 6], expression: "surprised" }, look, (f - s2 - 8) / 20);
        woman.update(pose, c, rig);
        return { grade: k > 0.5 ? "cold" : "summer", gradeAmount: 1, cInf: shot.id === "02-snow" ? 9 : 5, focus: V(0, 1.4, 0.6) };
      },
    };
  },
});
