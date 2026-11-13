// Village market street (1816): two rows of houses on a cobbled street, market stalls with awnings, crates, barrels,
// and a bread stall with a price board whose number can change per frame.
import * as THREE from "three";
import { rng } from "@engine/film";
import { lam } from "@engine/look/materials";
import { cobbleHD, rep, ctex } from "@engine/look/paint";
import { V, Batch, boxGeo } from "@engine/env/geo";
import { house, HOUSE_STYLES } from "@engine/env/house";
import { addVeg } from "@engine/env/vegetation";

export function buildVillage(scene: THREE.Scene, at: THREE.Vector3) {
  const b = new Batch(), r = rng(1817);
  b.add(boxGeo(V(-40, -1, -70), V(40, 0, 30), 4), lam("street", () => ({ map: rep(cobbleHD(), 1, 1) })));
  for (let i = 0; i < 9; i++) {
    house(b, -8.5, 6 - i * 7.2, Math.PI / 2, 6.6, 6, 5 + (i % 3) * 1.4, (i * 3) % HOUSE_STYLES.length);
    house(b, 8.5, 2.5 - i * 7.6, -Math.PI / 2, 7, 6, 5.5 + ((i + 1) % 3) * 1.2, (i * 5 + 2) % HOUSE_STYLES.length);
  }
  // stalls: counter + posts + striped awning
  const wood = lam("stallWood", () => ({ color: "#8a6446" }));
  const stall = (x: number, z: number, yaw: number, stripe: string) => {
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
    b.add(boxGeo(V(-1.3, 0, -0.5), V(1.3, 0.95, 0.5)), wood, m);
    for (const sx of [-1.25, 1.25]) for (const sz of [-0.45, 0.45]) b.add(boxGeo(V(sx - 0.05, 0, sz - 0.05), V(sx + 0.05, 2.3, sz + 0.05)), wood, m);
    const aw = lam("awning" + stripe, () => ({ map: ctex("awning" + stripe, 256, 64, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#f2e6cc" : stripe; g.fillRect(i * 32, 0, 32, 64); } }), side: THREE.DoubleSide }));
    const awg = new THREE.PlaneGeometry(2.9, 1.4).rotateX(-Math.PI / 2 + 0.35).translate(0, 2.35, 0.1);
    b.add(awg, aw, m);
    // goods: small round loaves / produce
    const good = lam("goods" + stripe, () => ({ color: stripe === "#b0583a" ? "#c98a4a" : "#a9b44a" }));
    for (let i = 0; i < 7; i++) b.add(new THREE.SphereGeometry(0.13, 10, 8).scale(1.3, 0.7, 1), good, m.clone().multiply(new THREE.Matrix4().makeTranslation(-1 + i * 0.33, 1.02, (r() - 0.5) * 0.4)));
  };
  stall(-4.6, -3, Math.PI / 2, "#b0583a"); stall(4.6, -9, -Math.PI / 2, "#3f6a8a"); stall(-4.6, -15, Math.PI / 2, "#4f7a4a");
  const barrel = lam("barrel", () => ({ color: "#7a5236" }));
  for (let i = 0; i < 6; i++) b.add(new THREE.CylinderGeometry(0.32, 0.36, 0.9, 14).translate(0, 0.45, 0), barrel, new THREE.Matrix4().makeTranslation(r() < 0.5 ? -5.9 : 5.9, 0, -r() * 30));
  for (let i = 0; i < 5; i++) { const s = 0.4 + r() * 0.2; b.add(boxGeo(V(-s, 0, -s), V(s, s * 1.4, s)), wood, new THREE.Matrix4().makeRotationY(r()).setPosition(r() < 0.5 ? -6 : 6, 0, -2 - r() * 30)); }
  for (let i = 0; i < 4; i++) addVeg(b, "round", (i % 2 ? 1 : -1) * 12, 0, -10 - i * 14, 6, 900 + i);
  const g = new THREE.Group(); g.position.copy(at); scene.add(g);
  b.build(g);
  return g;
}

/** price board for the bread stall: redraws when the number changes */
export class PriceBoard {
  readonly mesh: THREE.Mesh;
  private c = document.createElement("canvas");
  private t: THREE.CanvasTexture;
  private last = "";
  constructor() {
    this.c.width = 512; this.c.height = 320;
    this.t = new THREE.CanvasTexture(this.c); this.t.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.81), new THREE.MeshBasicMaterial({ map: this.t }));
  }
  set(top: string, price: string, color = "#2b1f1c") {
    const k = top + price + color; if (k === this.last) return; this.last = k;
    const g = this.c.getContext("2d")!;
    g.fillStyle = "#3a2a22"; g.fillRect(0, 0, 512, 320); g.fillStyle = "#f3e7cc"; g.fillRect(14, 14, 484, 292);
    g.fillStyle = "#2b1f1c"; g.textAlign = "center"; g.font = "600 64px Fredoka, sans-serif"; g.fillText(top, 256, 110);
    g.fillStyle = color; g.font = "700 120px Fredoka, sans-serif"; g.fillText(price, 256, 250);
    this.t.needsUpdate = true;
  }
}
