// Storybook thermometer in the overlay (screen space): cream frame, ink outline, red liquid that can rise or fall.
//   const th = new Thermometer(ctx, { at: [0.78, 0.42], height: 520 });  th.update(f, { from, to, level: 0..1 });
import type { Ctx } from "../film";

export class Thermometer {
  readonly el: HTMLDivElement;
  private liquid: SVGRectElement;
  private H: number;
  constructor(private ctx: Ctx, private o: { at: [number, number]; height?: number }) {
    const s = ctx.pxScale, H = (this.H = (o.height ?? 520) * s), W = H * 0.28;
    this.el = document.createElement("div");
    Object.assign(this.el.style, { position: "absolute", left: "0", top: "0", width: `${W}px`, height: `${H}px`, opacity: "0", transformOrigin: "50% 100%" });
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 100 360"); svg.setAttribute("width", String(W)); svg.setAttribute("height", String(H));
    svg.innerHTML = `
      <rect x="28" y="8" width="44" height="282" rx="22" fill="#fbf3e2" stroke="#3a2622" stroke-width="7"/>
      <circle cx="50" cy="306" r="42" fill="#fbf3e2" stroke="#3a2622" stroke-width="7"/>
      <circle cx="50" cy="306" r="31" fill="#d8402e"/>
      <g stroke="#3a2622" stroke-width="4" stroke-linecap="round">${Array.from({ length: 9 }, (_, i) => `<line x1="72" y1="${40 + i * 28}" x2="${i % 2 ? 82 : 88}" y2="${40 + i * 28}"/>`).join("")}</g>`;
    this.liquid = document.createElementNS(ns, "rect");
    this.liquid.setAttribute("x", "39"); this.liquid.setAttribute("width", "22"); this.liquid.setAttribute("rx", "11"); this.liquid.setAttribute("fill", "#d8402e");
    svg.appendChild(this.liquid);
    this.el.appendChild(svg);
    ctx.overlay.appendChild(this.el);
  }
  /** level 0 (cold, nearly empty) .. 1 (warm, nearly full); pops in over 8 frames */
  update(f: number, { from, to, level }: { from: number; to: number; level: number }) {
    const a = Math.min(1, Math.max(0, (f - from) / 8), Math.max(0, (to - f) / 6));
    this.el.style.opacity = String(a);
    if (a <= 0) return;
    const top = 30 + (1 - level) * 230, bottom = 300;
    this.liquid.setAttribute("y", String(top)); this.liquid.setAttribute("height", String(bottom - top));
    const x = this.o.at[0] * this.ctx.width - this.el.offsetWidth / 2, y = this.o.at[1] * this.ctx.height - this.H;
    const pop = a < 1 && f - from < 8 ? 0.7 + 0.3 * a : 1;
    this.el.style.transform = `translate(${x}px, ${y}px) scale(${pop})`;
  }
}
