// Cinematic light rig (engine-owned): physically based sky (three.js Sky), sun + sky fill, image-based lighting
// (PMREM of the sky, so PBR materials pick up sky colour and soft reflections), exponential aerial-perspective fog,
// and a sun position for god rays. Driven by presets; blendable for weather that changes within a shot.
//   const cine = new CineRig(scene, ctx.renderer);
//   const st = cine.apply("cine-summer", cam, { focus, radius });   // per frame; returns { sunWorld } for god rays
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { NOINK } from "../post/ink";

export type CinePreset = {
  sunEl: number; sunAz: number;            // degrees: elevation, azimuth (world, 0 = +z toward -x ... compass-like)
  turbidity: number; rayleigh: number; mie: number; mieG: number;
  sunI: number; sunCol: string;            // direct light
  hemiSky: string; hemiGround: string; hemiI: number;
  envI: number;                            // image-based light strength
  fog: string; fogDensity: number;         // FogExp2
  exposure: number;
  overcast?: number;                       // 0..1 flattens the sky toward grey and softens shadows
  skyTint?: string;
};

export const CINE: Record<string, CinePreset> = {
  "cine-summer": { sunEl: 28, sunAz: 140, turbidity: 3.2, rayleigh: 1.4, mie: 0.004, mieG: 0.82, sunI: 3.6, sunCol: "#fff1dc", hemiSky: "#bcd6ff", hemiGround: "#5a5a3c", hemiI: 0.45, envI: 0.55, fog: "#b9cde2", fogDensity: 0.0022, exposure: 0.9 },
  "cine-morning": { sunEl: 14, sunAz: 120, turbidity: 4.5, rayleigh: 2.2, mie: 0.006, mieG: 0.86, sunI: 3.4, sunCol: "#ffd2a0", hemiSky: "#a9c4ec", hemiGround: "#5b5040", hemiI: 0.4, envI: 0.5, fog: "#c9c3c0", fogDensity: 0.0028, exposure: 0.9 },
  "cine-overcast": { sunEl: 35, sunAz: 140, turbidity: 10, rayleigh: 0.6, mie: 0.02, mieG: 0.6, sunI: 0.7, sunCol: "#dfe5ee", hemiSky: "#c9d1dc", hemiGround: "#6d6f72", hemiI: 0.95, envI: 0.6, fog: "#b8bfc8", fogDensity: 0.0065, exposure: 0.95, overcast: 0.85, skyTint: "#aeb7c3" },
  "cine-snow": { sunEl: 30, sunAz: 140, turbidity: 12, rayleigh: 0.5, mie: 0.025, mieG: 0.6, sunI: 0.45, sunCol: "#e6ecf4", hemiSky: "#d5dce6", hemiGround: "#9aa0a8", hemiI: 1.0, envI: 0.6, fog: "#c8ced6", fogDensity: 0.009, exposure: 0.95, overcast: 0.95, skyTint: "#c1c8d2" },
  "cine-eruption": { sunEl: 9, sunAz: 250, turbidity: 9, rayleigh: 2.6, mie: 0.012, mieG: 0.9, sunI: 2.6, sunCol: "#ffb070", hemiSky: "#c69a8a", hemiGround: "#3a2c28", hemiI: 0.55, envI: 0.7, fog: "#c08f7a", fogDensity: 0.0007, exposure: 1.0 },
  "cine-ashfall": { sunEl: 9, sunAz: 250, turbidity: 18, rayleigh: 0.8, mie: 0.05, mieG: 0.7, sunI: 0.9, sunCol: "#ff9a5a", hemiSky: "#7e6a62", hemiGround: "#2a2220", hemiI: 0.6, envI: 0.5, fog: "#6e5a52", fogDensity: 0.0016, exposure: 1.05, overcast: 0.6, skyTint: "#6f5e58" },
};

export function mixCine(a: string | CinePreset, b: string | CinePreset, t: number): CinePreset {
  const A = typeof a === "string" ? CINE[a] : a, B = typeof b === "string" ? CINE[b] : b, k = Math.min(1, Math.max(0, t));
  const out: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const x = (A as Record<string, unknown>)[key], y = (B as Record<string, unknown>)[key];
    if (typeof x === "number" || typeof y === "number") out[key] = ((x as number) ?? 0) + (((y as number) ?? 0) - ((x as number) ?? 0)) * k;
    else if (typeof x === "string" || typeof y === "string") out[key] = "#" + new THREE.Color((x as string) ?? (y as string)).lerp(new THREE.Color((y as string) ?? (x as string)), k).getHexString();
  }
  return out as CinePreset;
}

export class CineRig {
  readonly root = new THREE.Group();
  readonly sun = new THREE.DirectionalLight("#fff", 3);
  readonly hemi = new THREE.HemisphereLight("#bcd6ff", "#555", 0.8);
  readonly sky = new Sky();
  readonly fog = new THREE.FogExp2("#b9cde2", 0.004);
  private pmrem: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private envSky = new Sky();
  private envKey = "";
  private envRT: THREE.WebGLRenderTarget | null = null;
  private tint = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: "#aab", side: THREE.BackSide, transparent: true, depthWrite: false, fog: false }));
  readonly sunDir = new THREE.Vector3();

  constructor(private scene: THREE.Scene, private renderer: THREE.WebGLRenderer, { shadowMap = 4096 } = {}) {
    this.sky.scale.setScalar(4000); this.sky.layers.set(NOINK); this.sky.frustumCulled = false;
    this.tint.scale.setScalar(3900); this.tint.layers.set(NOINK); this.tint.renderOrder = -0.5; this.tint.frustumCulled = false;
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(shadowMap, shadowMap); this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.02;
    this.root.add(this.sky, this.tint, this.sun, this.sun.target, this.hemi);
    scene.add(this.root);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envSky.scale.setScalar(100); this.envScene.add(this.envSky);
  }

  /** world direction toward the sun for a preset */
  static sunDirOf(p: CinePreset, out = new THREE.Vector3()) {
    const el = THREE.MathUtils.degToRad(p.sunEl), az = THREE.MathUtils.degToRad(p.sunAz);
    return out.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
  }

  apply(preset: string | CinePreset, cam: THREE.Camera, o: { focus?: THREE.Vector3; radius?: number; sunDir?: THREE.Vector3 } = {}) {
    const P = typeof preset === "string" ? CINE[preset] : preset;
    if (!P) throw new Error(`CineRig: unknown preset ${preset}`);
    const d = o.sunDir ? this.sunDir.copy(o.sunDir).normalize() : CineRig.sunDirOf(P, this.sunDir);
    const U = this.sky.material.uniforms;
    U.turbidity.value = P.turbidity; U.rayleigh.value = P.rayleigh; U.mieCoefficient.value = P.mie; U.mieDirectionalG.value = P.mieG;
    U.sunPosition.value.copy(d);
    this.sky.position.copy(cam.position); this.tint.position.copy(cam.position);
    // the sky shells must enclose everything visible, or they paint over distant geometry (they write no depth)
    const far = (cam as THREE.PerspectiveCamera).far ?? 5000;
    this.sky.scale.setScalar(far * 0.55); this.tint.scale.setScalar(far * 0.5);
    const ov = P.overcast ?? 0;
    (this.tint.material as THREE.MeshBasicMaterial).color.set(P.skyTint ?? P.fog); (this.tint.material as THREE.MeshBasicMaterial).opacity = ov;
    this.tint.visible = ov > 0.01;
    const focus = o.focus ?? new THREE.Vector3(), R = o.radius ?? 30;
    this.sun.color.set(P.sunCol); this.sun.intensity = P.sunI * (1 - 0.6 * ov);
    this.sun.position.copy(focus).addScaledVector(d, 300); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 50; sc.far = 700; sc.updateProjectionMatrix();
    this.sun.shadow.radius = 2 + ov * 10;
    this.hemi.color.set(P.hemiSky); this.hemi.groundColor.set(P.hemiGround); this.hemi.intensity = P.hemiI;
    this.fog.color.set(P.fog); this.fog.density = P.fogDensity;
    this.scene.fog = this.fog; this.scene.background = null;
    // image-based light from the same sky (re-baked only when the sky changes noticeably)
    const key = [P.turbidity, P.rayleigh, P.mie, d.x, d.y, d.z, ov].map((x) => x.toFixed(2)).join(",");
    if (key !== this.envKey) {
      const E = this.envSky.material.uniforms;
      E.turbidity.value = P.turbidity; E.rayleigh.value = P.rayleigh; E.mieCoefficient.value = P.mie; E.mieDirectionalG.value = P.mieG; E.sunPosition.value.copy(d);
      this.envRT?.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene as unknown as THREE.Scene, 0.04);
      this.envKey = key;
    }
    this.scene.environment = this.envRT!.texture;
    (this.scene as unknown as { environmentIntensity: number }).environmentIntensity = P.envI * (1 - 0.4 * ov);
    return { exposure: P.exposure, sunWorld: cam.position.clone().addScaledVector(d, 3000) };
  }
}
