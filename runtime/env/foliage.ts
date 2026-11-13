// Foliage (engine-owned): instanced grass blades for close shots, leafy trees (bark trunk + clustered leaf cards),
// and a hero leaf for macro shots (curved blade with midrib and veins, PBR + soft backlight translucency).
import * as THREE from "three";
import { pbr } from "../look/pbr";

const rnd = (s: number) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

/** instanced grass blades over a rectangle (local x,z); colour varies per blade; optional frost / snow on the tips */
export function grassField({ w = 10, d = 10, count = 20000, h = 0.28, seed = 1, colors = ["#4f7a2e", "#6b9139", "#7f9c45", "#5d8a33"], frost = 0 } = {}) {
  const r = rnd(seed);
  const blade = new THREE.PlaneGeometry(0.035, 1, 1, 4);
  const p = blade.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 0.5; p.setY(i, y); p.setX(i, p.getX(i) * (1 - y * 0.9)); p.setZ(i, y * y * 0.25); }
  blade.computeVertexNormals();
  // per-vertex: darker at the root, frost / snow white toward the tip
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 0.45 + 0.55 * y, f = frost * Math.max(0, (y - 0.55) / 0.45); col.set([k + f * (1.8 - k), k + f * (1.8 - k), k + f * (1.9 - k)], i * 3); }
  blade.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const inst = new THREE.InstancedMesh(blade, m, count);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const s = h * (0.6 + r() * 0.8);
    q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.5, r() * Math.PI * 2, (r() - 0.5) * 0.5));
    M.compose(new THREE.Vector3((r() - 0.5) * w, 0, (r() - 0.5) * d), q, new THREE.Vector3(1, s, 1));
    inst.setMatrixAt(i, M);
    inst.setColorAt(i, c.set(colors[Math.floor(r() * colors.length)]).offsetHSL(0, 0, (r() - 0.5) * 0.06));
  }
  inst.receiveShadow = true;
  return inst;
}

const leafCardTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    const r = rnd(5);
    // a cluster of small leaves (alpha cut-out), lit from above
    for (let i = 0; i < 26; i++) {
      const x = 128 + (r() - 0.5) * 170, y = 128 + (r() - 0.5) * 170, a = r() * Math.PI * 2, L = 26 + r() * 22;
      g.save(); g.translate(x, y); g.rotate(a);
      const gr = g.createLinearGradient(0, -L, 0, L); gr.addColorStop(0, "#8fb357"); gr.addColorStop(1, "#3f6a26");
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, L * 0.42, L, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(30,50,20,0.5)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -L); g.lineTo(0, L); g.stroke();
      g.restore();
    }
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
})();

/** a leafy tree: bark trunk with a few branches and a crown of crossed leaf-cluster cards (alpha-tested) */
export function tree({ h = 7, seed = 1, crown = 2.6, tint = "#ffffff" } = {}) {
  const r = rnd(seed * 97 + 3), g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * h / 7, 0.28 * h / 7, h * 0.6, 10).translate(0, h * 0.3, 0), pbr("bark", [1, 3]));
  trunk.castShadow = true; trunk.receiveShadow = true; g.add(trunk);
  const leafMat = new THREE.MeshStandardMaterial({ map: leafCardTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, color: tint });
  const card = new THREE.PlaneGeometry(1.6, 1.6);
  const n = 90, inst = new THREE.InstancedMesh(card, leafMat, n), M = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const u = r(), v = r(), th = u * Math.PI * 2, ph = Math.acos(2 * v - 1), rr = crown * (0.55 + 0.45 * Math.cbrt(r()));
    const p = new THREE.Vector3(Math.sin(ph) * Math.cos(th) * rr, h * 0.68 + Math.cos(ph) * rr * 0.8, Math.sin(ph) * Math.sin(th) * rr);
    M.compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3)), new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + r() * 0.6));
    inst.setMatrixAt(i, M);
  }
  inst.castShadow = true; inst.receiveShadow = true;
  inst.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafCardTex(), alphaTest: 0.5 });
  g.add(inst);
  return g;
}

/** hero leaf for macro shots (about 12 cm long, tip toward +x), with veins, curvature and a soft translucent glow */
export function heroLeaf({ length = 0.12, seed = 2 } = {}) {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 512;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  const r = rnd(seed);
  const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, "#5f9a34"); gr.addColorStop(0.5, "#78b043"); gr.addColorStop(1, "#4d8a2a");
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "255,255,200" : "20,60,10"},0.05)`; g.fillRect(r() * 1024, r() * 512, 3, 3); }
  // midrib, then side veins that leave it at a shallow angle and curve toward the tip (subtle, like a real leaf)
  g.strokeStyle = "rgba(215,235,160,0.6)"; g.lineWidth = 7; g.beginPath(); g.moveTo(0, 256); g.lineTo(1024, 256); g.stroke();
  g.lineWidth = 2.2; g.strokeStyle = "rgba(205,228,150,0.35)";
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]) { const x = 40 + i * 105; g.beginPath(); g.moveTo(x, 256); g.bezierCurveTo(x + 70, 256 + s * 60, x + 150, 256 + s * 150, x + 250, 256 + s * 230); g.stroke(); }
  g.lineWidth = 1; g.strokeStyle = "rgba(225,240,170,0.3)";
  for (let i = 0; i < 260; i++) { const x = r() * 1024, y = r() * 512; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 40); g.stroke(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  // blade: elliptic outline along x, curved down at the edges and along the length
  const W = 60, Hs = 30, geo = new THREE.PlaneGeometry(1, 1, W, Hs);
  const p = geo.attributes.position as THREE.BufferAttribute, uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const u = uv.getX(i), v = uv.getY(i) * 2 - 1;
    const half = Math.sin(Math.PI * Math.pow(u, 0.75)) * 0.5 * (1 - 0.15 * u);       // leaf outline (pointed tip)
    const x = u * length, y = v * half * length * 0.85;
    const z = -Math.pow(Math.abs(v), 1.6) * length * 0.06 - Math.sin(u * Math.PI) * length * 0.04 + u * u * length * 0.05;
    p.setXYZ(i, x, z, -y);
  }
  geo.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, side: THREE.DoubleSide, emissive: new THREE.Color("#2f5a12"), emissiveIntensity: 0.25,
    alphaTest: 0.5, transparent: false });
  // cut the outline: alpha from the uv outline
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <alphatest_fragment>", `
      float lu = vMapUv.x, lv = vMapUv.y * 2.0 - 1.0;
      float halfW = sin(3.14159 * pow(lu, 0.75)) * 0.5 * (1.0 - 0.15 * lu) * 2.0;
      if (abs(lv) > halfW) discard;`);
  };
  const leaf = new THREE.Mesh(geo, m);
  leaf.castShadow = true; leaf.receiveShadow = true;
  // stem
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0018, length * 0.35, 8).rotateZ(Math.PI / 2).translate(-length * 0.17, 0, 0), new THREE.MeshStandardMaterial({ color: "#5b7d2c", roughness: 0.6 }));
  const g2 = new THREE.Group(); g2.add(leaf, stem);
  return g2;
}

/** detailed snowflake crystal sprites (6-fold dendrites), for close-ups */
export function flakeTexture(seed = 1) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d", { willReadFrequently: true })!, r = rnd(seed);
  g.translate(64, 64); g.strokeStyle = "rgba(255,255,255,0.95)"; g.lineCap = "round";
  const arms = [0.3 + r() * 0.3, 0.5 + r() * 0.3, 0.7 + r() * 0.2];
  for (let k = 0; k < 6; k++) {
    g.save(); g.rotate(k * Math.PI / 3);
    g.lineWidth = 4; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -56); g.stroke();
    g.lineWidth = 2.5;
    for (const a of arms) { const y = -56 * a, L = 18 * (1 - a * 0.6); for (const s of [-1, 1]) { g.beginPath(); g.moveTo(0, y); g.lineTo(s * L, y - L * 0.8); g.stroke(); } }
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** instanced wheat (stalk + head + awns): golden summer or frost-killed (brown, drooping, white frost on the heads) */
export function wheatField({ w = 8, d = 6, count = 9000, h = 0.9, frost = 0, seed = 7, clear = [] as [number, number, number][] } = {}) {
  const r = rnd(seed), g = new THREE.Group();
  const stalkG = new THREE.CylinderGeometry(0.0035, 0.005, 1, 5).translate(0, 0.5, 0);
  const headG = new THREE.SphereGeometry(1, 8, 6).scale(0.011, 0.045, 0.011).translate(0, 0.045, 0);
  const awnG = new THREE.CylinderGeometry(0.0006, 0.0006, 0.06, 3).translate(0, 0.075, 0);
  const sc = frost ? "#b29a68" : "#c9a64e", hc = frost ? "#8f7448" : "#d8b45a";
  const stalks = new THREE.InstancedMesh(stalkG, new THREE.MeshStandardMaterial({ color: sc, roughness: 0.75 }), count);
  const heads = new THREE.InstancedMesh(headG, new THREE.MeshStandardMaterial({ color: hc, roughness: 0.7 }), count);
  const awns = new THREE.InstancedMesh(awnG, new THREE.MeshStandardMaterial({ color: hc, roughness: 0.7 }), count * 2);
  const frostM = frost ? new THREE.InstancedMesh(headG, new THREE.MeshStandardMaterial({ color: "#eef3f6", roughness: 0.4, transparent: true, opacity: 0.85 }), count) : null;
  const M = new THREE.Matrix4(), T = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  let n = 0;
  for (let i = 0; i < count; i++) {
    const x = (r() - 0.5) * w, z = (r() - 0.5) * d;
    if (clear.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr)) continue;
    const hh = h * (0.75 + r() * 0.4) * (frost ? 0.8 : 1);
    const lean = frost ? (r() < 0.15 ? 1.1 : 0.12 + r() * 0.4) : r() * 0.12, yaw = r() * Math.PI * 2;
    q.setFromEuler(e.set(lean, yaw, 0, "YXZ"));
    M.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, hh, 1)); stalks.setMatrixAt(n, M);
    const droop = frost ? 1.0 + r() * 0.7 : 0.15 + r() * 0.2;
    T.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(0, hh, 0)).multiply(new THREE.Matrix4().makeRotationX(droop));
    heads.setMatrixAt(n, T);
    awns.setMatrixAt(n * 2, T.clone().multiply(new THREE.Matrix4().makeRotationZ(0.25)));
    awns.setMatrixAt(n * 2 + 1, T.clone().multiply(new THREE.Matrix4().makeRotationZ(-0.25)));
    if (frostM) frostM.setMatrixAt(n, T.clone().multiply(new THREE.Matrix4().makeTranslation(0.002, 0.012, 0.004)).multiply(new THREE.Matrix4().makeScale(1.12, 0.7, 1.12)));
    n++;
  }
  for (const m of [stalks, heads, awns, frostM]) if (m) { m.count = m === awns ? n * 2 : n; m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
}
