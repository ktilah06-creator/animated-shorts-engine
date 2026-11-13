// On-screen labels in the overlay DOM (sharp text at any render size, above the 3D picture). A label is anchored to
// a 3D point (projected each frame) or to a screen position (0..1), pops in / fades out by frame, and stays inside
// the vertical-video safe area (Shorts UI: right-side buttons, bottom caption band).
//
//   await loadFont(ctx, "font/fredoka", 1, "Fredoka-Variable.ttf", "Fredoka");
//   const tag = new Label(ctx, "Mount Tambora", { sub: "April 1815", style: "tag" });
//   tag.update(f, { at: worldPoint, cam, from: 120, to: 300 });
import * as THREE from "three";
import type { Ctx } from "../film";

/** a font from the asset library; loadFontUrl takes any URL (e.g. a draft font in the film's public folder) */
export async function loadFont(ctx: Ctx, id: string, version: number, file: string, family: string) {
  return loadFontUrl(ctx.lib(id, version, file), family);
}
export async function loadFontUrl(url: string, family: string) {
  const ff = new FontFace(family, `url(${url})`, { weight: "100 900", stretch: "75% 125%" });
  await ff.load();
  document.fonts.add(ff);
  return family;
}

/** safe area of a 1080x1920 Shorts frame, in 0..1 screen units (keep text and faces inside) */
export const SAFE = { left: 0.06, right: 0.84, top: 0.09, bottom: 0.78 };

export type LabelStyle = "tag" | "title" | "year" | "plain" | "doc" | "cine-title" | "cine-sub";

export class Label {
  readonly el: HTMLDivElement;
  private v = new THREE.Vector3();
  constructor(private ctx: Ctx, text: string, o: { sub?: string; style?: LabelStyle; family?: string; color?: string; size?: number; accent?: string } = {}) {
    const px = (n: number) => `${Math.round(n * ctx.pxScale)}px`;
    const el = (this.el = document.createElement("div"));
    const family = o.family ?? "Fredoka, sans-serif";
    const st = o.style ?? "tag";
    const size = o.size ?? (st === "title" ? 92 : st === "year" ? 120 : st === "doc" ? 40 : 52);
    Object.assign(el.style, { position: "absolute", left: "0", top: "0", transformOrigin: "50% 100%", whiteSpace: "nowrap", fontFamily: family,
      fontWeight: st === "plain" ? "500" : "600", fontSize: px(size), lineHeight: "1.05", color: o.color ?? "#2b1f1c", textAlign: "center",
      opacity: "0", willChange: "transform" });
    if (st === "doc") Object.assign(el.style, { fontFamily: o.family ?? "Inter, sans-serif", fontWeight: "600", fontSize: px(o.size ?? 40), color: o.color ?? "#ffffff",
      background: "rgba(14,18,28,0.62)", borderLeft: `${px(6)} solid ${o.accent ?? "#f2b544"}`, padding: `${px(12)} ${px(22)}`, borderRadius: px(6), letterSpacing: "0.01em",
      backdropFilter: "blur(2px)" });
    if (st === "cine-title" || st === "cine-sub") Object.assign(el.style, { fontFamily: o.family ?? "Cinzel, serif", fontWeight: st === "cine-title" ? "700" : "500",
      fontSize: px(o.size ?? (st === "cine-title" ? 88 : 46)), color: o.color ?? "#fdf8ef", letterSpacing: st === "cine-title" ? "0.06em" : "0.3em",
      // a soft dark halo plus a crisp drop shadow keep the engraved serif readable on bright snow and sky
      textShadow: `0 0 ${px(34)} rgba(10,14,22,0.5), 0 ${px(4)} ${px(14)} rgba(0,0,0,0.6), 0 ${px(1)} ${px(2)} rgba(0,0,0,0.75)` });
    if (st === "cine-title") Object.assign(el.style, { padding: `${px(36)} ${px(60)}`,
      background: "radial-gradient(ellipse at center, rgba(12,16,24,0.22) 0%, rgba(12,16,24,0.1) 50%, rgba(12,16,24,0) 78%)" });
    if (st === "tag") Object.assign(el.style, { background: "#fbf3e2", border: `${px(5)} solid #3a2622`, borderRadius: px(26), padding: `${px(14)} ${px(30)} ${px(16)}`,
      boxShadow: `0 ${px(8)} 0 rgba(58,38,34,0.35)` });
    if (st === "plain") Object.assign(el.style, { fontWeight: "600", textShadow: (o.color ?? "#2b1f1c").toLowerCase() > "#888888"
      ? `0 ${px(3)} 0 rgba(43,31,28,0.85), ${px(2)} 0 0 rgba(43,31,28,0.85), -${px(2)} 0 0 rgba(43,31,28,0.85), 0 -${px(2)} 0 rgba(43,31,28,0.85)`
      : `0 ${px(3)} 0 rgba(255,250,240,0.85), ${px(2)} 0 0 rgba(255,250,240,0.85), -${px(2)} 0 0 rgba(255,250,240,0.85), 0 -${px(2)} 0 rgba(255,250,240,0.85)` });
    if (st === "title" || st === "year") Object.assign(el.style, { color: o.color ?? "#fbf3e2", textShadow: `0 ${px(6)} 0 #3a2622, ${px(4)} 0 0 #3a2622, -${px(4)} 0 0 #3a2622, 0 -${px(4)} 0 #3a2622` });
    el.textContent = text;
    if (text.includes("\n")) el.style.whiteSpace = "pre";     // explicit line breaks for long titles
    if (o.sub) {
      const s = document.createElement("div");
      Object.assign(s.style, { fontSize: px(size * 0.62), fontWeight: "500", opacity: "0.8", marginTop: px(4) });
      s.textContent = o.sub; el.appendChild(s);
    }
    ctx.overlay.appendChild(el);
  }
  /**
   * at: world point (needs cam) or [x, y] screen fraction; anchor point is the label's bottom centre (plus `lift` px up).
   * Visible in [from, to) frames with a 8-frame pop in and 6-frame fade out.
   */
  update(f: number, o: { at: THREE.Vector3 | [number, number]; cam?: THREE.Camera; from: number; to: number; lift?: number }) {
    const inT = Math.min(1, Math.max(0, (f - o.from) / 8)), outT = Math.min(1, Math.max(0, (o.to - f) / 6));
    const a = Math.min(inT, outT);
    if (a <= 0) { this.el.style.opacity = "0"; return; }
    let x: number, y: number;
    if (Array.isArray(o.at)) { x = o.at[0] * this.ctx.width; y = o.at[1] * this.ctx.height; }
    else {
      o.cam!.updateMatrixWorld();            // the camera may have moved since the last render
      this.v.copy(o.at).project(o.cam!);
      x = (this.v.x * 0.5 + 0.5) * this.ctx.width; y = (-this.v.y * 0.5 + 0.5) * this.ctx.height;
    }
    y -= (o.lift ?? 0) * this.ctx.pxScale;
    const w = this.el.offsetWidth, h = this.el.offsetHeight;
    // keep inside the safe area
    x = Math.min(Math.max(x, SAFE.left * this.ctx.width + w / 2), SAFE.right * this.ctx.width - w / 2);
    y = Math.min(Math.max(y, SAFE.top * this.ctx.height + h), SAFE.bottom * this.ctx.height);
    const pop = inT < 1 ? 0.6 + 0.4 * (1 - Math.pow(1 - inT, 3)) * (1 + 0.12 * Math.sin(inT * Math.PI)) : 1;
    this.el.style.opacity = String(a);
    this.el.style.transform = `translate(${x - w / 2}px, ${y - h}px) scale(${pop})`;
  }
}
