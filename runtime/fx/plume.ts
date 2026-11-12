// Eruption / smoke plume: billboarded painted puffs born at a vent, rising, widening and drifting with the wind;
// deterministic per frame. Plus a hot vent glow (HDR colour, picked up by bloom).
//   const plume = new Plume({ vent, rate: 6, rise: 2.2, wind: [0.6, 0, 0], start: 120 });
//   scene.add(plume.root);  plume.update(f, cam, rig?);
import * as THREE from "three";
import { NOINK } from "../post/ink";

const puffTex = (() => {
  const cache = new Map<number, THREE.Texture>();
  return (k: number) => {
    let t = cache.get(k); if (t) return t;
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d")!;
    let s = 99 + k * 31; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    // cauliflower puff: a cluster of lobes; each lobe lit from the upper left with a cool shaded belly, a thin warm-dark
    // rim on the lower edge (storybook ink feel) and a soft outer fade
    const lobes: [number, number, number][] = [];
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 62, rad = 26 + r() * 30;
      lobes.push([128 + Math.cos(a) * d, 132 + Math.sin(a) * d * 0.85 - (1 - d / 62) * 8, rad]);
    }
    lobes.sort((p, q) => q[1] - p[1]);                       // draw lower lobes first: upper ones overlap them
    for (const [x, y, rad] of lobes) {
      g.fillStyle = "rgba(60,48,46,0.55)"; g.beginPath(); g.arc(x + 2, y + 4, rad + 3, 0, Math.PI * 2); g.fill();   // rim
      const gr = g.createRadialGradient(x - rad * 0.35, y - rad * 0.45, rad * 0.1, x, y, rad);
      gr.addColorStop(0, "rgb(255,255,255)"); gr.addColorStop(0.55, "rgb(222,220,224)"); gr.addColorStop(1, "rgb(150,150,164)");
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    // soft outer edge
    g.globalCompositeOperation = "destination-in";
    const edge = g.createRadialGradient(128, 128, 70, 128, 128, 128);
    edge.addColorStop(0, "rgba(0,0,0,1)"); edge.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = edge; g.fillRect(0, 0, 256, 256);
    g.globalCompositeOperation = "source-over";
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; cache.set(k, t); return t;
  };
})();

export type PlumeOpts = { vent: THREE.Vector3; start?: number; rate?: number; life?: number; rise?: number; spread?: number; wind?: [number, number, number];
  size?: [number, number]; color?: [string, string]; seed?: number; max?: number; glow?: string };

export class Plume {
  readonly root = new THREE.Group();
  private puffs: THREE.Sprite[] = [];
  private glow: THREE.Sprite;
  private c0: THREE.Color; private c1: THREE.Color;
  constructor(private o: PlumeOpts) {
    const max = o.max ?? 260;
    this.c0 = new THREE.Color(o.color?.[0] ?? "#4a4040"); this.c1 = new THREE.Color(o.color?.[1] ?? "#b9b2ab");
    for (let i = 0; i < max; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex(i % 4), transparent: true, depthWrite: false, fog: true }));
      s.layers.set(NOINK); s.visible = false; this.puffs.push(s); this.root.add(s);
    }
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex(9), color: new THREE.Color(o.glow ?? "#ff7a2a").multiplyScalar(4), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.glow.layers.set(NOINK); this.glow.position.copy(o.vent); this.root.add(this.glow);
  }
  update(f: number, cam: THREE.Camera, light = new THREE.Color(1, 1, 1), fps = 30) {
    const o = this.o, start = o.start ?? 0, rate = o.rate ?? 6, life = o.life ?? 150, rise = o.rise ?? 2, spread = o.spread ?? 0.35;
    const [w0, w1] = o.size ?? [3, 16], wind = o.wind ?? [0.5, 0, 0];
    const hsh = (i: number, k: number) => { const v = Math.sin(i * 12.9898 + k * 78.233 + (o.seed ?? 1) * 37.7) * 43758.5453; return v - Math.floor(v); };
    let used = 0;
    const born = Math.floor((f - start) * rate / fps);
    for (let i = Math.max(0, born - Math.ceil(life * rate / fps)); i <= born && used < this.puffs.length; i++) {
      const tb = start + (i * fps) / rate, age = f - tb;
      if (age < 0 || age > life) continue;
      const u = age / life, t = age / fps;
      const sp = this.puffs[used++];
      const a = hsh(i, 1) * Math.PI * 2, rr = hsh(i, 2) * spread * (1 + u * 4);
      // fast at first, slowing (buoyant column), then mushrooming out
      const up = rise * (t - 0.25 * t * t / (life / fps)) * (0.8 + 0.4 * hsh(i, 3)) * 8;
      sp.position.set(o.vent.x + Math.cos(a) * rr * 8 + wind[0] * t * t * 0.6, o.vent.y + up, o.vent.z + Math.sin(a) * rr * 8 + wind[2] * t * t * 0.6);
      const sz = w0 + (w1 - w0) * Math.sqrt(u) * (0.7 + 0.6 * hsh(i, 4));
      sp.scale.set(sz, sz, 1);
      const m = sp.material as THREE.SpriteMaterial;
      m.color.copy(this.c0).lerp(this.c1, Math.min(1, u * 1.6 + hsh(i, 5) * 0.2)).multiply(light);
      m.opacity = Math.min(1, age / 6) * (1 - Math.pow(u, 3));
      m.rotation = hsh(i, 6) * 6.28 + t * 0.1 * (hsh(i, 7) - 0.5);
      sp.visible = true;
    }
    for (let i = used; i < this.puffs.length; i++) this.puffs[i].visible = false;
    const on = f >= start;
    this.glow.visible = on;
    const fl = 0.85 + 0.15 * Math.sin(f * 0.9) * Math.sin(f * 0.37);
    this.glow.scale.setScalar((o.size?.[0] ?? 3) * 2.2 * fl);
  }
}
