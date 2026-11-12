// Camera moves as pure functions of the frame number.
//
//   const path = camPath([
//     { f: 0,   pose: { pos: [0, 2, 9], look: [0, 1, 0], fov: 40 }, creep: 0.25 },        // hold with a slow push-in
//     { f: 45,  pose: { pos: [4, 3, 6], look: [0, 1, 0] }, glide: 30 },                  // eased glide over 30 frames
//     { f: 90,  pose: (f) => orbit([0, 1, 0], 7, 2.5, 20 + f * 0.3), cut: true },        // hard cut to an orbit
//   ], { kicks: [{ at: 120, amp: 0.06 }] });
//   applyCam(cam, path(f));
//
// Conventions: glides use smootherstep (no linear starts/stops); `creep` is a push-in toward the look point in
// percent of the distance per frame (0.15-0.35 reads as alive without being noticed); kicks are impact shakes whose
// sign flips every frame and which decay over `len` frames; roll is in degrees.
import * as THREE from "three";

export type V3 = [number, number, number];
export type CamPose = { pos: V3; look: V3; fov?: number; roll?: number };
export type CamKey = {
  f: number;                                 // frame where this key starts
  pose: CamPose | ((f: number) => CamPose);  // static pose or a moving one (f = absolute frame)
  glide?: number;                            // frames to ease in from the previous key's pose (default 0 = cut)
  cut?: boolean;                             // force a hard cut even if glide is set
  creep?: number;                            // push-in, % of the camera-to-look distance per frame
};
export type Kick = { at: number; amp: number; len?: number };

export const smoothstep = (t: number) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
export const smootherstep = (t: number) => { t = Math.min(1, Math.max(0, t)); return t * t * t * (t * (t * 6 - 15) + 10); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

const at = (k: CamKey, f: number) => (typeof k.pose === "function" ? k.pose(f) : k.pose);

function withCreep(p: CamPose, k: CamKey, f: number): CamPose {
  if (!k.creep) return p;
  const s = Math.min(0.6, (k.creep / 100) * Math.max(0, f - k.f));
  return { ...p, pos: lerp3(p.pos, p.look, s) };
}

export function camPath(keys: CamKey[], { kicks = [] as Kick[], fov = 40 } = {}) {
  const ks = keys.slice().sort((a, b) => a.f - b.f);
  return (f: number): CamPose => {
    let i = 0;
    while (i + 1 < ks.length && ks[i + 1].f <= f) i++;
    const k = ks[i];
    let p = withCreep(at(k, f), k, f);
    if (i > 0 && k.glide && !k.cut && f < k.f + k.glide) {
      const prev = ks[i - 1];
      const q = withCreep(at(prev, f), prev, f);
      const t = smootherstep((f - k.f) / k.glide);
      p = { pos: lerp3(q.pos, p.pos, t), look: lerp3(q.look, p.look, t), fov: lerp(q.fov ?? fov, p.fov ?? fov, t), roll: lerp(q.roll ?? 0, p.roll ?? 0, t) };
    }
    let shake = 0;
    for (const kk of kicks) {
      const len = kk.len ?? 7, d = f - kk.at;
      if (d >= 0 && d < len) shake += kk.amp * (d % 2 ? -1 : 1) * (1 - d / len);
    }
    if (shake) p = { ...p, look: [p.look[0], p.look[1] + shake, p.look[2]], roll: (p.roll ?? 0) + shake * 20 };
    return { fov, roll: 0, ...p };
  };
}

/** Circle around a point: radius, height above it, angle in degrees. */
export function orbit(center: V3, radius: number, height: number, deg: number): CamPose {
  const a = THREE.MathUtils.degToRad(deg);
  return { pos: [center[0] + Math.sin(a) * radius, center[1] + height, center[2] + Math.cos(a) * radius], look: center };
}

/** Straight move from a to b over [f0, f1] with smootherstep ease (look fixed or interpolated). */
export function dolly(f0: number, f1: number, a: CamPose, b: CamPose) {
  return (f: number): CamPose => {
    const t = smootherstep((f - f0) / Math.max(1, f1 - f0));
    return { pos: lerp3(a.pos, b.pos, t), look: lerp3(a.look, b.look, t), fov: lerp(a.fov ?? 40, b.fov ?? a.fov ?? 40, t), roll: lerp(a.roll ?? 0, b.roll ?? 0, t) };
  };
}

const up = new THREE.Vector3(0, 1, 0);
export function applyCam(cam: THREE.PerspectiveCamera, p: CamPose) {
  cam.position.set(...p.pos);
  cam.up.copy(up);
  cam.lookAt(p.look[0], p.look[1], p.look[2]);
  if (p.roll) cam.rotateZ(THREE.MathUtils.degToRad(p.roll));
  cam.fov = p.fov ?? cam.fov;
  cam.updateProjectionMatrix();
}
