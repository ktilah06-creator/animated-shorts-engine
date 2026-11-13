// Ported from github.com/mromidev/claude-animated-shorts @e3b817b templates/bridge/world.ts (clouds; MIT, see THIRD_PARTY.md).
// Painted cloud cards on a ring far out (no ink, no fog), turned toward the camera every frame, palette per preset.
import * as THREE from "three";
import { NOINK } from "../post/ink";
import { cloudHD } from "./paint";
import { LOOK } from "./lights";

type Pal = { lit: string; mid: string; shade: string };

export class Clouds {
  readonly root = new THREE.Group();
  private cards: THREE.Mesh[] = [];
  private maps = new Map<string, THREE.Texture[]>();
  constructor({ count = 9, dist = 620, height = 120, size = 130, seed = 0 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.3 + seed, d = dist + (i % 3) * 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
      const w = size + (i % 4) * 30;
      m.position.set(Math.cos(a) * d, height + (i % 4) * 38, Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.layers.set(NOINK);
      this.cards.push(m); this.root.add(m);
    }
  }
  private pal(p: Pal) {
    // blended presets give a new colour every frame: snap to 16 levels per channel so only a few textures are painted
    const q = (h: string) => "#" + new THREE.Color(h).toArray().map((v) => Math.round(Math.round(v * 15) / 15 * 255).toString(16).padStart(2, "0")).join("");
    p = { lit: q(p.lit), mid: q(p.mid), shade: q(p.shade) };
    const k = p.lit + p.mid + p.shade;
    let t = this.maps.get(k);
    if (!t) { t = [0, 1, 2, 3].map((s) => cloudHD(s, p)); this.maps.set(k, t); }
    return t;
  }
  /** preset name of look/lights LOOK or an explicit palette; clouds follow the camera horizontally (infinitely far) */
  apply(look: string | Pal, cam: THREE.Camera) {
    const p = typeof look === "string" ? LOOK[look as keyof typeof LOOK]?.cloud : look;
    if (!p) throw new Error(`Clouds: unknown look ${look}`);
    const maps = this.pal(p);
    this.root.position.set(cam.position.x, 0, cam.position.z);
    this.cards.forEach((m, i) => {
      (m.material as THREE.MeshBasicMaterial).map = maps[i % 4];
      m.lookAt(cam.position.x, m.getWorldPosition(new THREE.Vector3()).y, cam.position.z);
    });
  }
}
