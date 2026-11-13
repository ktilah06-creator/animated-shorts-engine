// Diagram arrows in the 3D world (explainer graphics): flat extruded shapes that the ink pass outlines, drawn on
// progressively (progress 0..1 grows the arrow from its tail). Solid or hollow ("block") style.
//   const a = new Arrow(from, to, { color: "#e2553f", width: 0.35 });  scene.add(a.mesh);  a.progress = t;
import * as THREE from "three";

export type ArrowOpts = { color?: string; width?: number; head?: number; hollow?: boolean; depth?: number; normal?: THREE.Vector3 };

export class Arrow {
  readonly mesh = new THREE.Group();
  private body: THREE.Mesh;
  private len: number;
  constructor(public from: THREE.Vector3, public to: THREE.Vector3, private o: ArrowOpts = {}) {
    this.len = from.distanceTo(to);
    const w = o.width ?? 0.3, hl = (o.head ?? 2.4) * w, hw = 1.25 * w;
    const sh = new THREE.Shape();
    // arrow along +x from 0 to 1 (unit length; scaled per frame), shaft half-width w/2, head half-width hw
    sh.moveTo(0, -w / 2); sh.lineTo(1, -w / 2); sh.lineTo(1, -hw); sh.lineTo(1 + hl, 0); sh.lineTo(1, hw); sh.lineTo(1, w / 2); sh.lineTo(0, w / 2); sh.closePath();
    if (o.hollow) {
      const hole = new THREE.Path(), i = w * 0.22;
      hole.moveTo(i, -w / 2 + i); hole.lineTo(1, -w / 2 + i); hole.lineTo(1, -hw + i * 1.6); hole.lineTo(1 + hl - i * 2.2, 0); hole.lineTo(1, hw - i * 1.6); hole.lineTo(1, w / 2 - i); hole.lineTo(i, w / 2 - i); hole.closePath();
      sh.holes.push(hole);
    }
    this.headLen = hl;
    const geo = new THREE.ExtrudeGeometry(sh, { depth: o.depth ?? 0.08, bevelEnabled: false });
    this.body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: o.color ?? "#e2553f" }));
    this.mesh.add(this.body);
    this.place(1);
  }
  private headLen: number;
  private place(p: number) {
    const d = this.to.clone().sub(this.from), L = d.length();
    const shaft = Math.max(0.001, L * p - this.headLen);
    this.mesh.position.copy(this.from);
    const n = this.o.normal ?? new THREE.Vector3(0, 0, 1);
    const x = d.clone().normalize(), z = n.clone().normalize(), y = z.clone().cross(x).normalize();
    this.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z.clone().crossVectors(x, y)));
    // shaft scales along x; the head keeps its size (geometry has the head beyond x = 1, so move it via a scale trick)
    this.body.scale.set(shaft, 1, 1);
    const g = this.body.geometry as THREE.BufferGeometry, pos = g.attributes.position as THREE.BufferAttribute;
    if (!this.base) this.base = Float32Array.from(pos.array as Float32Array);
    for (let i = 0; i < pos.count; i++) {
      const bx = this.base[i * 3];
      pos.setX(i, bx > 1.0001 ? 1 + (bx - 1) / shaft : bx);   // head vertices: undo the scale beyond the shaft end
    }
    pos.needsUpdate = true;
    this.mesh.visible = p > 0.001;
  }
  private base?: Float32Array;
  set progress(p: number) { this.place(Math.min(1, Math.max(0, p))); }
}

/** dashed line between two points (boxes), e.g. a boundary in a diagram */
export function dashedLine(a: THREE.Vector3, b: THREE.Vector3, { dash = 0.6, gap = 0.4, width = 0.12, color = "#2b2230" } = {}) {
  const g = new THREE.Group(), d = b.clone().sub(a), L = d.length(), dir = d.clone().normalize();
  const m = new THREE.MeshBasicMaterial({ color });
  for (let t = 0; t < L; t += dash + gap) {
    const len = Math.min(dash, L - t);
    const box = new THREE.Mesh(new THREE.BoxGeometry(len, width, 0.04), m);
    box.position.copy(a).addScaledVector(dir, t + len / 2);
    box.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    g.add(box);
  }
  return g;
}
