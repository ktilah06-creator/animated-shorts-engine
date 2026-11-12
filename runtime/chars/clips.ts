// Reusable motion for characters: all pure functions of the frame number (and a seed for variety).
import type { Pose } from "./toon";

const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export const ease = (t: number) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

/** eyelid 0..1: a 5-frame blink every 2.5-4.5 s, offset per seed */
export function blinkAt(f: number, seed = 0, fps = 30) {
  let t = Math.floor(hash(seed) * 60);
  for (let k = 0; t <= f + 6; k++) {
    const d = f - t;
    if (d >= 0 && d < 5) return [0.5, 1, 1, 0.6, 0.2][d];
    t += Math.round(fps * (2.5 + 2 * hash(seed * 31 + k)));
  }
  return 0;
}

/** idle: breathing bob and a slow weight shift */
export function idle(f: number, seed = 0): Partial<Pose> {
  const ph = f / 30 * 2 * Math.PI / 3.6 + seed;
  return { bob: Math.sin(ph) * 3, lean: Math.sin(ph * 0.5) * 1.5, blink: blinkAt(f, seed) };
}

/** walk cycle: phase in cycles (1 = two steps) */
export function walk(phase: number): Partial<Pose> {
  const a = Math.sin(phase * Math.PI * 2);
  return {
    legL: [a * 16, Math.max(0, -a) * 22], legR: [-a * 16, Math.max(0, a) * 22],
    armL: [6 - a * 12, 10], armR: [6 + a * 12, 10],
    bob: Math.abs(Math.cos(phase * Math.PI * 2)) * 8,
  };
}

/** cold shiver: small fast jitter with arms hugged */
export function shiver(f: number, amount = 1): Partial<Pose> {
  return { shiver: Math.sin(f * 2.7) * amount, armL: [-28, 120], armR: [-28, 120], expression: "cold" };
}

/** blend two poses (numbers interpolate, discrete fields switch at the midpoint) */
export function blend(a: Pose, b: Pose, t: number): Pose {
  const out: Record<string, unknown> = { ...a };
  const k = ease(t);
  for (const [key, vb] of Object.entries(b)) {
    const va = (a as Record<string, unknown>)[key];
    if (typeof vb === "number" && typeof va === "number") out[key] = va + (vb - va) * k;
    else if (Array.isArray(vb) && Array.isArray(va)) out[key] = vb.map((x: number, i: number) => (va[i] ?? x) + (x - (va[i] ?? x)) * k);
    else out[key] = k < 0.5 && va !== undefined ? va : vb;
  }
  return out as Pose;
}
