// Science diorama (cinematic draft until approved): a cutaway slice of land and atmosphere seen at a slight angle.
//  1. SO2 gas (yellow particles) rises from the volcano into the stratosphere
//  2. it transforms into sulfate aerosols (white droplets) - shown with a magnified inset (overlay)
//  3. the aerosols spread downwind into a thin layer
//  4. sunlight pulses travel down: part is reflected back to space by the layer, less reaches the ground
// Local frame: x -12..12, altitude y 0..34 (stylised), slice depth z -3..3; viewed from +z.
import * as THREE from "three";
import { V } from "@engine/env/geo";
import { pbr } from "@engine/look/pbr";
import { NOINK } from "@engine/post/ink";
import { dashedLine } from "@engine/fx/arrow";
import { ease } from "@engine/chars/clips";

const sq = (v: number) => v * v;
export const TROPO = 15, LAYER = 21;

const dotTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d")!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,0.9)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (t = new THREE.CanvasTexture(c));
  };
})();

export function buildScience(scene: THREE.Scene, at: THREE.Vector3) {
  const root = new THREE.Group(); root.position.copy(at); scene.add(root);
  // atmosphere backdrop: pale troposphere -> blue stratosphere -> dark space
  const bg = new THREE.PlaneGeometry(80, 60, 1, 30).translate(0, 26, -6);
  const pc = bg.attributes.position as THREE.BufferAttribute, col = new Float32Array(pc.count * 3), c = new THREE.Color();
  for (let i = 0; i < pc.count; i++) {
    const y = pc.getY(i);
    if (y < TROPO) c.set("#c3dcef").lerp(new THREE.Color("#9cc3e6"), y / TROPO);
    else if (y < 32) c.set("#6fa2d8").lerp(new THREE.Color("#2b4f86"), (y - TROPO) / (32 - TROPO));
    else c.set("#2b4f86").lerp(new THREE.Color("#0b1022"), Math.min(1, (y - 32) / 10));
    col.set([c.r, c.g, c.b], i * 3);
  }
  bg.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const bgm = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  bgm.layers.set(NOINK); root.add(bgm);
  root.add(dashedLine(V(-30, TROPO, 3.2), V(30, TROPO, 3.2), { dash: 0.9, gap: 0.5, width: 0.12, color: "#22324a" }));
  // land slice: terrain on top of a cut face with soil and rock layers
  const prof = (x: number) => 1.6 + 0.4 * Math.sin(x * 0.5) + 0.2 * Math.sin(x * 1.7) + 7.6 * Math.exp(-sq((x + 6) / 2.5)) - 0.9 * Math.exp(-sq((x + 6) / 0.4));
  const top = new THREE.Shape(); top.moveTo(-40, -2);
  for (let x = -40; x <= 40; x += 0.25) top.lineTo(x, prof(x));
  top.lineTo(40, -2); top.closePath();
  const slab = new THREE.ExtrudeGeometry(top, { depth: 6, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -3);
  // vertex colour: green surface, brown soil, grey rock by depth below the surface; dark volcanic cone
  const sp = slab.attributes.position as THREE.BufferAttribute, sc = new Float32Array(sp.count * 3);
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), y = sp.getY(i), depth = prof(x) - y, cone = Math.exp(-sq((x + 6) / 2.6));
    if (depth < 0.15) c.set("#4f8a3a").lerp(new THREE.Color("#5a4c44"), Math.min(1, cone * 1.6)); else if (depth < 1.2) c.set("#6b4f36"); else c.set("#5d5a57");
    sc.set([c.r, c.g, c.b], i * 3);
  }
  slab.setAttribute("color", new THREE.BufferAttribute(sc, 3));
  const land = new THREE.Mesh(slab, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, normalMap: pbr("ground").normalMap, normalScale: new THREE.Vector2(0.6, 0.6) }));
  land.castShadow = true; land.receiveShadow = true; root.add(land);
  const vent = V(-6, prof(-6) + 0.2, 0);
  // cut face drawn as a geological cross-section: grass, soil and rock bands; a dark volcanic cone with its conduit
  // running down to the magma chamber (makes "land" and "volcano" unmistakable)
  const band = (f: (x: number) => number, g: (x: number) => number, color: string, z: number, x0 = -40, x1 = 40) => {
    const sh = new THREE.Shape(); sh.moveTo(x0, f(x0));
    for (let x = x0; x <= x1 + 1e-6; x += 0.2) sh.lineTo(x, f(x));
    for (let x = x1; x >= x0 - 1e-6; x -= 0.2) sh.lineTo(x, g(x));
    sh.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
    m.position.z = z; root.add(m); return m;
  };
  const coneW = (x: number) => Math.exp(-sq((x + 6) / 2.5));
  const FZ = 3.01, BOT = -9;
  band(prof, (x) => prof(x) - 0.22, "#4c8a36", FZ);                                   // grass
  band((x) => prof(x) - 0.22, (x) => prof(x) - 1.6, "#7a5634", FZ);                 // soil
  band((x) => prof(x) - 1.6, () => BOT, "#6d6964", FZ);                             // bedrock
  band((x) => prof(x) - 0.25 * (1 - Math.min(1, coneW(x) * 1.4)), (x) => prof(x) - 0.25 - 6.5 * Math.min(1, coneW(x) * 1.4), "#3b302c", FZ + 0.005, -13, 1);   // volcanic rock of the cone, fading into the layers
  const chamber = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.22, 0.04), fog: false }));
  chamber.scale.set(2.2, 0.9, 1); chamber.position.set(-6, -3.3, FZ + 0.01); root.add(chamber);
  band((x) => -3.0, (x) => prof(-6) - 0.9, "#000", FZ + 0.012, -6.18, -5.82).material = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.3, 0.05), fog: false });
  // a few trees on the land so it reads as countryside at a glance
  const treeMat = new THREE.MeshStandardMaterial({ color: "#2f6b2a", roughness: 0.9 }), trunkMat = new THREE.MeshStandardMaterial({ color: "#5a3d26" });
  for (const x of [3.2, 4.1, 7.6, 8.4, 12.5, 13.3, 16.8, -16.5, -15.6]) {
    const y = prof(x), t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 6), trunkMat); trunk.position.y = 0.25;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.2, 8), treeMat); crown.position.y = 1.0;
    t.add(trunk, crown); t.position.set(x, y - 0.05, 1.8 - (x % 2) * 0.6); t.scale.setScalar(0.9 + (Math.abs(x) % 1) * 0.4); root.add(t);
  }
  // particles: SO2 gas (yellow) and sulfate aerosol droplets (white); the same particle changes from one to the other
  const N = 1400, pos = new Float32Array(N * 3), colr = new Float32Array(N * 3);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(colr, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.42, map: dotTex(), vertexColors: true, transparent: true, depthWrite: false, fog: false, sizeAttenuation: true }));
  pts.layers.set(NOINK); pts.frustumCulled = false; root.add(pts);
  const h = (i: number, k: number) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const so2 = new THREE.Color("#f2d34f"), aer = new THREE.Color("#eef4ff");
  // sunlight: 5 beams from the upper right; pulses travel along them
  const sunDir = V(-0.42, -1, 0).normalize();
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.25, 0.55), transparent: true, opacity: 0.85, depthWrite: false, fog: false });
  const beams: { a: THREE.Vector3; b: THREE.Vector3; refl: boolean; mesh: THREE.Mesh; down?: THREE.Mesh; pulses: THREE.Sprite[] }[] = [];
  const tube = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
    const d = b.clone().sub(a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10, 1, true).translate(0, 0.5, 0), beamMat);
    m.position.copy(a); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().normalize()); m.scale.set(1, d.length(), 1); m.layers.set(NOINK); root.add(m); return m;
  };
  const pulseMat = new THREE.SpriteMaterial({ map: dotTex(), color: new THREE.Color(2.2, 1.8, 0.8), transparent: true, depthWrite: false, fog: false });
  // Each beam enters the aerosol layer and is partly scattered: thin rays spray out in many directions (some back up
  // toward space), and a dimmer, thinner beam continues to the ground. Scattering, not a mirror.
  const downMat = beamMat.clone(); downMat.opacity = 0.42;
  const scatMat = beamMat.clone(); scatMat.opacity = 0.5;
  for (let k = 0; k < 5; k++) {
    const hit = V(-1 + k * 2.6, LAYER + 0.3 + (k % 2) * 0.5, 1.2), a = hit.clone().addScaledVector(sunDir, -14);
    const mesh = tube(a, hit, 0.09);
    const gx = hit.x + (prof(hit.x) - hit.y) * (sunDir.x / sunDir.y);
    const b = V(gx, prof(gx), 1.2);
    const down = tube(hit, b, 0.04); down.material = downMat;
    const scat: { m: THREE.Mesh; len: number; dir: THREE.Vector3 }[] = [];
    for (let j = 0; j < 7; j++) {
      // directions spread over the full circle, biased forward (Mie scattering by droplets is forward-peaked),
      // with a share going upward: that is the light sent back toward space
      const ang = (j / 7) * Math.PI * 2 + k * 0.7, dir = V(Math.cos(ang), Math.sin(ang), 0).lerp(sunDir, 0.25).normalize();
      const len = 2.2 + 2.6 * h(k * 7 + j, 9) * (dir.y > 0 ? 1.15 : 0.8);
      const m = tube(hit, hit.clone().addScaledVector(dir, len), 0.028); m.material = scatMat;
      scat.push({ m, len, dir });
    }
    const pulses = Array.from({ length: 4 }, () => { const sp = new THREE.Sprite(pulseMat); sp.scale.setScalar(0.55); sp.layers.set(NOINK); root.add(sp); return sp; });
    beams.push({ a, b: hit, refl: false, mesh, down, pulses, scat } as never);
    (down as unknown as { userData: { end: THREE.Vector3 } }).userData.end = b;
  }
  return {
    root, vent: vent.clone().add(at),
    anchors: {
      so2: at.clone().add(V(-2.2, 11, 2)), aer: at.clone().add(V(4.2, LAYER + 2.4, 2)), strat: at.clone().add(V(-7.5, 16.6, 2)), trop: at.clone().add(V(-7.2, 13.4, 2)),
      inc: at.clone().add(V(8.4, 31.2, 2)), refl: at.clone().add(V(-5.5, 25.4, 2)), less: at.clone().add(V(6.5, 8.6, 2)),
      volc: at.clone().add(V(-6, -7.8, 3.2)), cone: at.clone().add(V(-12.5, 5.4, 3.2)), ground: at.clone().add(V(9.5, 0.2, 3.2)),
    },
    /** gas 0..1 (column rising), convert 0..1 (gas -> droplets), spread 0..1 (layer downwind), rays 0..1 (sunlight on), t seconds */
    update({ gas = 1, convert = 1, spread = 1, rays = 1, t = 0 }) {
      for (let i = 0; i < N; i++) {
        const u = h(i, 1);                                                 // each particle's place in the column (0 low .. 1 top)
        // the gas column grows from the vent to the stratosphere; then everything gathers into the layer and spreads
        let fr = Math.min(1, u * gas * 1.08);
        if (gas <= 0 || fr <= 0.002) { pos.set([0, -99, 0], i * 3); continue; }
        fr = fr + (1 - fr) * spread;
        const yCol = vent.y + (LAYER - vent.y) * fr;
        const lateral = spread * (h(i, 2) * 18 - 2) * Math.min(1, Math.max(0, (yCol - TROPO) / (LAYER - TROPO)));
        const wob = Math.sin(t * 0.8 + i) * 0.25;
        const x = vent.x + (h(i, 3) - 0.5) * (0.6 + (yCol - vent.y) * 0.12) + lateral + wob;
        const y = yCol + (h(i, 4) - 0.5) * (1.0 + spread * 1.6) + (yCol >= LAYER - 0.1 ? Math.sin(t + i * 0.3) * 0.15 : 0);
        const z = (h(i, 5) - 0.5) * 4.5;
        pos.set([x, y, z], i * 3);
        const k = Math.min(1, convert * (y > TROPO ? 1 : 0.3));
        c.copy(so2).lerp(aer, k);
        colr.set([c.r, c.g, c.b], i * 3);
      }
      g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
      (pts.material as THREE.PointsMaterial).size = 0.42 - 0.12 * convert;
      beams.forEach((bm, k) => {
        const on = ease(rays * 3 - k * 0.3);
        bm.mesh.visible = on > 0.01; bm.mesh.scale.y = bm.a.distanceTo(bm.b) * on;
        const end = (bm.down as unknown as { userData: { end: THREE.Vector3 } }).userData.end;
        const on2 = ease(rays * 3 - k * 0.3 - 0.9);
        bm.down!.visible = on2 > 0.01; bm.down!.scale.y = bm.b.distanceTo(end) * on2;
        for (const sc of (bm as unknown as { scat?: { m: THREE.Mesh; len: number }[] }).scat ?? []) { sc.m.visible = on2 > 0.01; sc.m.scale.y = sc.len * on2; }
        bm.pulses.forEach((p, j) => {
          const ph = ((t * 0.55 + j / bm.pulses.length + k * 0.13) % 1);
          const seg1 = ph < 0.5, q = seg1 ? ph * 2 : (ph - 0.5) * 2;
          const P = seg1 ? bm.a.clone().lerp(bm.b, q) : bm.b.clone().lerp(end, q);
          p.position.copy(P); p.visible = (seg1 ? on : on2) > 0.95;
          p.scale.setScalar(seg1 ? 0.55 : 0.3);
        });
      });
    },
  };
}
