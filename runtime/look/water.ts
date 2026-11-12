// Ported from github.com/mromidev/claude-animated-shorts @e3b817b templates/bridge/world.ts (river; MIT, see THIRD_PARTY.md).
// Stylised water surface: colour by view-ray depression angle (near / mid / far, so it reads deep up close and
// mirrors the sky at the horizon), drifting painted crest / trough / glint marks in two tile sizes, and the sun's
// real shadow on it. Colours are on-screen targets under the neutral tone map (untone), set per frame from a preset.
//
//   const water = new Water({ x0: -400, x1: 400, z0: -30, z1: 30, y: -1, flow: [0.35, 0] });
//   scene.add(water.mesh);
//   water.apply("day", f / fps);            // every frame (preset name of look/lights LOOK, or explicit colours)
import * as THREE from "three";
import { LFB, untone } from "./shade";
import { LOOK, type WorldLook } from "./lights";
import { waterNear, waterFar } from "./paint";

const DECL = `#include <common>
varying vec3 vWP;
uniform vec3 wNearC, wMidC, wFarC, wCrest, wTrough, wGlint, wShade;
uniform sampler2D wNearTex, wFarTex;
uniform float wTime; uniform vec2 wFlow; uniform vec2 wTiles;`;
const COL = `
  vec3 wV = vWP - cameraPosition;
  float wd = length(wV);
  float wDep = asin(clamp(-wV.y / wd, 0.0, 1.0));       // depression angle of the view ray
  float wf = 1.0 - smoothstep(0.0, 0.42, wDep);         // 1 at the horizon .. 0 at 24 deg down
  vec3 wc = mix(mix(wNearC, wMidC, smoothstep(0.0, 0.55, wf)), wFarC, smoothstep(0.55, 1.0, wf));
  vec2 wp = vWP.xz + wFlow * wTime;                      // drift along the flow (m/s)
  vec4 mk = mix(texture2D(wNearTex, wp / wTiles.x), texture2D(wFarTex, wp / wTiles.y + 0.37), smoothstep(25.0, 90.0, wd));
  wc = mix(wc, wTrough, mk.g * 0.6);
  wc = mix(wc, wCrest, mk.r * 0.7);
  wc = mix(wc, wGlint, mk.b * (0.3 + 0.5 * wf));
  diffuseColor.rgb = wc;`;

export type WaterLook = WorldLook["water"];

export class Water {
  readonly mesh: THREE.Mesh;
  private U: Record<string, THREE.IUniform>;
  constructor({ x0 = -200, x1 = 200, z0 = -30, z1 = 30, y = 0, flow = [0.35, 0] as [number, number], tiles = [8, 40] as [number, number], geometry }:
    { x0?: number; x1?: number; z0?: number; z1?: number; y?: number; flow?: [number, number]; tiles?: [number, number]; geometry?: THREE.BufferGeometry } = {}) {
    const near = waterNear(), far = waterFar();
    for (const t of [near, far]) { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 16; t.needsUpdate = true; }
    this.U = {
      wNearC: { value: new THREE.Color() }, wMidC: { value: new THREE.Color() }, wFarC: { value: new THREE.Color() },
      wCrest: { value: new THREE.Color() }, wTrough: { value: new THREE.Color() }, wGlint: { value: new THREE.Color() },
      wShade: { value: new THREE.Vector3(0.5, 0.56, 0.72) }, wNearTex: { value: near }, wFarTex: { value: far }, wTime: { value: 0 },
      wFlow: { value: new THREE.Vector2(...flow) }, wTiles: { value: new THREE.Vector2(...tiles) },
    };
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", DECL)
        .replace("#include <map_fragment>", COL)
        .replace("#include <lights_fragment_begin>", "float sunVis = 1.0;\n" + LFB)
        .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n  reflectedLight.directDiffuse = diffuseColor.rgb * mix(wShade, vec3(1.0), sunVis);\n  reflectedLight.indirectDiffuse = vec3(0.0);");
    };
    m.customProgramCacheKey = () => "water2";
    const g = geometry ?? new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.receiveShadow = true;
  }
  /** preset name (LOOK) or explicit colours; t in seconds drives the drift */
  apply(look: string | WaterLook, t: number) {
    const wc = typeof look === "string" ? LOOK[look as keyof typeof LOOK]?.water : look;
    if (!wc) throw new Error(`Water: unknown look ${look}`);
    const W = this.U;
    untone(wc.near, W.wNearC.value); untone(wc.mid, W.wMidC.value); untone(wc.far, W.wFarC.value);
    untone(wc.crest, W.wCrest.value); untone(wc.trough, W.wTrough.value); untone(wc.glint, W.wGlint.value);
    W.wShade.value.set(...wc.shade); W.wTime.value = t;
  }
}
