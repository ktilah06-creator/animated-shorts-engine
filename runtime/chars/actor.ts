// A character in the 3D world: the 2D drawing (chars/toon.ts) on a camera-facing card, with
//  - its own outline (the card is on the NOINK layer, so world ink never double-outlines it),
//  - scene light: the card is tinted by the light preset's lit colour, and a shade band is painted on the side
//    facing away from the sun as seen from the camera (consistent with the two-tone world),
//  - a real cast shadow (alpha-tested depth material) plus a soft contact blob at the feet.
// Cards turn around the vertical axis only (they never tip over with camera height).
import * as THREE from "three";
import { NOINK } from "../post/ink";
import { CW, CH, GROUND, drawCharacter, type Design, type Pose } from "./toon";
import type { LightRig } from "../look/rig";

const blobTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d")!, gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, "rgba(30,20,40,0.55)"); gr.addColorStop(1, "rgba(30,20,40,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return (t = new THREE.CanvasTexture(c));
  };
})();

export class Actor {
  readonly root = new THREE.Group();
  readonly card: THREE.Mesh;
  private canvas = document.createElement("canvas");
  private g: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private mat: THREE.MeshBasicMaterial;
  private blob: THREE.Mesh;
  private shadowCard: THREE.Mesh;
  private v = new THREE.Vector3(); private w = new THREE.Vector3();
  /** height: metres from sole to head top for an adult design (scale applies on top) */
  constructor(public design: Design, public height = 1.7) {
    this.canvas.width = CW; this.canvas.height = CH;
    this.g = this.canvas.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide, fog: true });
    const px = height / 880;                         // metres per canvas px (880 px = adult height)
    // canvas row GROUND (the soles) sits at the card origin, so the card scales about the feet
    const geo = new THREE.PlaneGeometry(CW * px, CH * px).translate(0, (GROUND - CH / 2) * px, 0);
    this.card = new THREE.Mesh(geo, this.mat);
    this.card.layers.set(NOINK);
    // the visible card faces the camera; a second, invisible card faces the sun and casts the shadow, so the
    // shadow keeps the figure's full silhouette whatever the camera angle
    // (three.js copies map + alphaTest from the object's own material into the shadow pass, so it carries them too)
    this.shadowCard = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide, colorWrite: false, depthWrite: false }));
    this.shadowCard.castShadow = true;
    this.shadowCard.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide });
    this.shadowCard.layers.set(NOINK);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = 0.012; this.blob.scale.set(height * 0.42, height * 0.18, 1);
    this.blob.layers.set(NOINK); this.blob.renderOrder = 1;
    this.root.add(this.card, this.shadowCard, this.blob);
  }

  /** draw the pose and face the camera; rig (optional) supplies light colour and sun side */
  update(pose: Pose, cam: THREE.Camera, rig?: LightRig, sunDir?: THREE.Vector3) {
    const s = this.design.scale ?? 1;
    this.root.updateMatrixWorld();
    // face the camera around Y
    this.root.getWorldPosition(this.v);
    const yaw = Math.atan2(cam.position.x - this.v.x, cam.position.z - this.v.z);
    this.card.rotation.set(0, yaw - this.root.rotation.y, 0);
    let light = pose.light;
    if (rig && !light) {
      const L = rig.current.light;
      this.mat.color.setRGB(L.lit[0], L.lit[1], L.lit[2]);
      // sun side on screen: project sun direction onto the camera's right vector
      const sd = sunDir ?? rig.sun.position.clone().sub(rig.sun.target.position).normalize();
      this.w.setFromMatrixColumn(cam.matrixWorld, 0);
      const side = this.w.dot(sd) >= 0 ? -1 : 1;                   // shade on the side away from the sun
      const facing = new THREE.Vector3().subVectors(cam.position, this.v).setY(0).normalize().dot(sd.clone().setY(0).normalize());
      const amount = 0.28 + 0.32 * Math.max(0, -facing);           // backlit: more of the figure in shade
      const sh = new THREE.Color(L.shade[0] / Math.max(L.lit[0], 1e-3), L.shade[1] / Math.max(L.lit[1], 1e-3), L.shade[2] / Math.max(L.lit[2], 1e-3));
      light = { side, amount, shade: `rgb(${Math.round(Math.min(1, sh.r * 0.55) * 255)},${Math.round(Math.min(1, sh.g * 0.55) * 255)},${Math.round(Math.min(1, sh.b * 0.6) * 255)})` };
    }
    drawCharacter(this.g, this.design, { ...pose, light });
    this.tex.needsUpdate = true;
    this.card.scale.setScalar(s);
    this.shadowCard.scale.setScalar(s);
    if (rig) {
      const sd = sunDir ?? rig.sun.position.clone().sub(rig.sun.target.position).normalize();
      this.shadowCard.rotation.set(0, Math.atan2(sd.x, sd.z) - this.root.rotation.y, 0);
    }
    this.blob.scale.set(this.height * 0.42 * s, this.height * 0.18 * s, 1);
  }
}
