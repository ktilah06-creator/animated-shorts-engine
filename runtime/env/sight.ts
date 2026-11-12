// Ported from github.com/mromidev/claude-animated-shorts @e3b817b templates/bridge/build.ts / world.ts (sight lines) (MIT, see THIRD_PARTY.md).
// Sight-line culling: scenery generators skip any piece that would stand between a camera and its subject.
// Build the rays once from the film's camera path (sightLines), then ask blocked(rays, box) before placing a piece.
import * as THREE from "three";
import type { CamPose } from "../camera";

/** a sight line from the lens toward the shot's subject, `len` along d; core = the centre ray */
export type Ray = { o: THREE.Vector3; d: THREE.Vector3; len: number; core: boolean };

/** rays for every `step` frames of the given frame ranges (centre + 4 ray fan inside a 9:16 frame) */
export function sightLines(cam: (f: number) => CamPose, ranges: [number, number][], { step = 2, pad = 8, aspect = 9 / 16 } = {}): Ray[] {
  const out: Ray[] = [];
  const V = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
  for (const [a, b] of ranges) for (let f = a - pad; f < b + pad; f += step) {
    const c = cam(Math.max(0, f)), o = V(c.pos), look = V(c.look);
    const fw = look.clone().sub(o), len = fw.length();
    fw.normalize();
    const rt = fw.clone().cross(new THREE.Vector3(0, 1, 0)).normalize(), up = rt.clone().cross(fw);
    const ty = Math.tan(((c.fov ?? 40) * Math.PI) / 360), tx = ty * aspect;
    for (const [sx, sy] of [[0, 0], [-0.6, 0], [0.6, 0], [0, 0.6], [0, -0.4]])
      out.push({ o, d: fw.clone().addScaledVector(rt, sx * tx).addScaledVector(up, sy * ty), len, core: sx === 0 && sy === 0 });
  }
  return out;
}

/** does any sight line pass through this box? (centre lines only for small props, so they can still frame a shot) */
export const blocked = (sight: Ray[], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, coreOnly = false) => {
  for (const { o, d, len, core } of sight) {
    if (coreOnly && !core) continue;
    let t0 = 0, t1 = len;
    for (const [oo, dd, a, b] of [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]]) {
      if (Math.abs(dd) < 1e-9) { if (oo < a || oo > b) t0 = Infinity; continue; }
      const ta = (a - oo) / dd, tb = (b - oo) / dd;
      t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb));
    }
    if (t0 <= t1) return true;
  }
  return false;
};
