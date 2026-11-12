// Character sheet for design review: lineup in the 3D world (day light, real shadows), and an expression grid.
import * as THREE from "three";
import { defineFilm } from "@engine/film";
import { LightRig } from "@engine/look/rig";
import { lam } from "@engine/look/materials";
import { grassHD, rep } from "@engine/look/paint";
import { Actor } from "@engine/chars/actor";
import { drawCharacter, CW, CH, type Expression } from "@engine/chars/toon";
import { idle } from "@engine/chars/clips";
import { applyCam } from "@engine/camera";
import { FARMER_WOMAN, FARMER_MAN, CHILD } from "../tambora-1816/cast";

export default defineFilm({
  id: "_charsheet",
  shots: [{ id: "lineup", a: 0, b: 2 }, { id: "golden", a: 2, b: 4 }, { id: "faces", a: 4, b: 6 }],
  post: { lens: false },
  setup(ctx) {
    const scene = new THREE.Scene();
    const rig = new LightRig(scene, { shadowMap: 4096 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), lam("g", () => ({ map: rep(grassHD(), 30, 30) })));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const cast = [new Actor(FARMER_MAN), new Actor(FARMER_WOMAN, 1.62), new Actor(CHILD)];
    cast.forEach((a, i) => { a.root.position.set(-0.78 + i * 0.74, 0, i === 1 ? -0.3 : 0); scene.add(a.root); });
    // expression grid (2D, overlay)
    const grid = document.createElement("div");
    Object.assign(grid.style, { position: "absolute", inset: "0", background: "#efe6d4", display: "none", gridTemplateColumns: "1fr 1fr 1fr", alignContent: "center", justifyItems: "center" });
    const ex: Expression[] = ["neutral", "happy", "surprised", "awe", "worried", "sad", "cold", "determined"];
    for (const [i, e] of ex.entries()) {
      const full = document.createElement("canvas"); full.width = CW; full.height = CH;
      drawCharacter(full.getContext("2d")!, i % 2 ? FARMER_WOMAN : FARMER_MAN, { expression: e, turn: i % 3 === 2 ? 0.45 : 0 });
      const c = document.createElement("canvas"); c.width = 320; c.height = 360;           // head crop
      c.getContext("2d")!.drawImage(full, CW / 2 - 160, 60, 320, 360, 0, 0, 320, 360);
      Object.assign(c.style, { width: `${ctx.width / 3.3}px`, height: `${(ctx.width / 3.3) * 1.125}px` });
      const cell = document.createElement("div");
      Object.assign(cell.style, { display: "flex", flexDirection: "column", alignItems: "center", font: `${Math.round(30 * ctx.pxScale)}px sans-serif`, color: "#3a2622" });
      cell.append(c, e);
      grid.appendChild(cell);
    }
    ctx.overlay.appendChild(grid);
    return {
      scene,
      frame(f, shot, c) {
        grid.style.display = shot.id === "faces" ? "grid" : "none";
        applyCam(c, { pos: [0.1, 1.15, 4.6], look: [0, 0.85, 0], fov: 36 });
        const L = shot.id === "golden" ? "golden" : "day";
        rig.apply(L, c, { focus: new THREE.Vector3(0, 0.8, 0), radius: 6, az: shot.id === "golden" ? -70 : -50, el: shot.id === "golden" ? 14 : 40 });
        cast.forEach((a, i) => a.update({ ...idle(10, i), expression: i === 2 ? "happy" : "neutral", turn: (i - 1) * 0.35 }, c, rig));
        return { grade: L };
      },
    };
  },
});
