// Reusable light rig: sky dome, sun (+ shadow fit), hemisphere fill, fog, optional sun disc and halo, and the
// two-tone uniforms (look/shade.ts) - all driven by one preset name per frame. Generalised from the source
// repository's world.ts light code (MIT, see THIRD_PARTY.md); nothing here is tied to a particular film.
//
//   const rig = new LightRig(scene);                     // once, in setup
//   rig.apply("day", cam, { focus, radius });             // every frame (pure function of its inputs)
//
// Sun direction: camera-relative by default (az degrees from the camera's forward axis toward screen right, el =
// elevation), which keeps lighting readable whatever the shot. Pass `sunDir` (world vector) to pin it in the world,
// e.g. computed once per shot with sunForShot() so it does not swing during a camera move.
import * as THREE from "three";
import { NOINK } from "../post/ink";
import { TONE, untone } from "./shade";
import { LIGHTS, LOOK, type LightPreset, type WorldLook } from "./lights";

export type RigPreset = { light: LightPreset; look: WorldLook; showSun: boolean };
export const RIG_PRESETS: Record<string, RigPreset> = {
  day: { light: LIGHTS.day, look: LOOK.day, showSun: false },
  golden: { light: LIGHTS.golden, look: LOOK.golden, showSun: true },
};

const tex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};
const discTex = () => tex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 58, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const haloTex = () => tex(256, 256, (g) => {
  const im = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = Math.hypot(x - 127.5, y - 127.5) / 128;
    const a = (0.55 * Math.exp(-((u / 0.25) ** 2)) + 0.35 * Math.exp(-((u / 0.6) ** 2))) * (1 - Math.min(1, Math.max(0, (u - 0.8) / 0.2)));
    const i = (y * 256 + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.round(255 * Math.min(1, a));
  }
  g.putImageData(im, 0, 0);
});

/** World-space sun direction for a camera looking along `forward`, az/el in degrees (az + = screen right). */
export function sunFromView(forward: THREE.Vector3, azDeg: number, elDeg: number, out = new THREE.Vector3()) {
  let fx = forward.x, fz = forward.z; const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
  const az = THREE.MathUtils.degToRad(azDeg), el = THREE.MathUtils.degToRad(elDeg);
  const hx = fx * Math.cos(az) - fz * Math.sin(az), hz = fz * Math.cos(az) + fx * Math.sin(az);
  return out.set(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
}

/** Sun frozen for a whole shot: the average horizontal view direction of the shot's camera path. */
export function sunForShot(samples: { pos: THREE.Vector3; look: THREE.Vector3 }[], azDeg: number, elDeg: number) {
  const f = new THREE.Vector3();
  for (const s of samples) f.add(new THREE.Vector3().subVectors(s.look, s.pos).setY(0).normalize());
  return sunFromView(f.lengthSq() > 0 ? f : new THREE.Vector3(0, 0, -1), azDeg, elDeg);
}

export class LightRig {
  readonly root = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fog = new THREE.Fog("#bccbec", 25, 420);
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private disc: THREE.Sprite;
  private halo: THREE.Sprite;
  /** preset applied last (water / clouds / films can follow it) */
  current: RigPreset = RIG_PRESETS.day;
  private dir = new THREE.Vector3();
  private fwd = new THREE.Vector3();

  constructor(private scene: THREE.Scene, { shadowMap = 2048 } = {}) {
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
        c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el));
          c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el));
          c = mix(c, c4, smoothstep(e.z, e.w, el));
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK);
    this.disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex(), color: new THREE.Color(6.0, 4.4, 2.4), fog: false, depthWrite: false }));
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    this.disc.renderOrder = -0.5; this.halo.renderOrder = 5;
    for (const m of [this.disc, this.halo]) { m.frustumCulled = false; m.layers.set(NOINK); }
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowMap, shadowMap);
    this.root.add(this.sky, this.disc, this.halo, this.hemi, this.sun, this.sun.target);
    scene.add(this.root);
  }

  /**
   * Applies a preset for this frame. focus/radius fit the shadow camera around what is on screen (smaller radius =
   * sharper shadows). sunDir (world, toward the sun) overrides the camera-relative az/el of the preset.
   */
  apply(name: string | RigPreset, cam: THREE.PerspectiveCamera, o: { focus?: THREE.Vector3; radius?: number; sunDir?: THREE.Vector3; az?: number; el?: number; showSun?: boolean } = {}) {
    const P = typeof name === "string" ? RIG_PRESETS[name] : name;
    if (!P) throw new Error(`LightRig: unknown preset ${name}`);
    const L = P.light, K = P.look;
    this.current = P;
    cam.layers.enable(NOINK);
    cam.getWorldDirection(this.fwd);
    const sunDir = o.sunDir ? this.dir.copy(o.sunDir).normalize() : sunFromView(this.fwd, o.az ?? L.az, o.el ?? L.el, this.dir);
    const focus = o.focus ?? cam.position.clone().addScaledVector(this.fwd, 10);
    const R = o.radius ?? 25;
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    this.sun.position.copy(focus).addScaledVector(sunDir, 220); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 20; sc.far = 480; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (R / 12);
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term;
    TONE.uBounce.value.set(...K.bounce); TONE.uSat.value = K.sat;
    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.sky.position.copy(cam.position);
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear; this.fog.far = L.fogFar;
    this.scene.fog = this.fog; this.scene.background = null;
    const show = o.showSun ?? P.showSun;
    this.disc.visible = this.halo.visible = show;
    if (show) {
      this.disc.position.copy(cam.position).addScaledVector(sunDir, 900);
      this.disc.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(1.7)));
      this.halo.position.copy(this.disc.position); this.halo.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(24)));
      (this.halo.material as THREE.SpriteMaterial).color.set(L.sunDisc).multiplyScalar(1.3);
    }
    return sunDir;
  }
}
