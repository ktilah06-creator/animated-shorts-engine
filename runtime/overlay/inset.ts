// Magnifier inset in the overlay: a circular "zoomed-in" view with an SVG drawing and a caption, popping in and out.
// Used for things too small to see in the scene (molecules, cells, mechanisms).
import type { Ctx } from "../film";

export class Inset {
  readonly el: HTMLDivElement;
  constructor(private ctx: Ctx, svg: string, caption: string, private o: { at: [number, number]; size?: number }) {
    const s = ctx.pxScale, D = (o.size ?? 430) * s;
    this.el = document.createElement("div");
    Object.assign(this.el.style, { position: "absolute", left: "0", top: "0", width: `${D}px`, opacity: "0", display: "flex", flexDirection: "column", alignItems: "center",
      fontFamily: "Fredoka, sans-serif", fontWeight: "600", fontSize: `${Math.round(34 * s)}px`, color: "#fbf3e2", textAlign: "center", lineHeight: "1.15",
      textShadow: `0 ${3 * s}px 0 rgba(20,24,40,0.85), ${2 * s}px 0 0 rgba(20,24,40,0.85), -${2 * s}px 0 0 rgba(20,24,40,0.85)` });
    const disc = document.createElement("div");
    Object.assign(disc.style, { width: `${D}px`, height: `${D}px`, borderRadius: "50%", overflow: "hidden", border: `${6 * s}px solid #fbf3e2`,
      boxShadow: `0 ${10 * s}px ${30 * s}px rgba(0,0,0,0.45)`, background: "radial-gradient(circle at 40% 35%, #3d6aa3, #1d355e)" });
    disc.innerHTML = svg;
    const cap = document.createElement("div"); cap.style.marginTop = `${14 * s}px`; cap.innerHTML = caption;
    this.el.append(disc, cap);
    ctx.overlay.appendChild(this.el);
  }
  update(f: number, { from, to }: { from: number; to: number }) {
    const a = Math.min(1, Math.max(0, (f - from) / 10), Math.max(0, (to - f) / 8));
    this.el.style.opacity = String(a);
    if (a <= 0) return;
    const x = this.o.at[0] * this.ctx.width - this.el.offsetWidth / 2, y = this.o.at[1] * this.ctx.height - this.el.offsetHeight / 2;
    this.el.style.transform = `translate(${x}px, ${y}px) scale(${0.75 + 0.25 * Math.min(1, (f - from) / 10)})`;
  }
}

/** SVG for the inset: SO2 molecules + water molecules -> a sulfate aerosol droplet (progress 0..1 is set by CSS var) */
export const SO2_TO_AEROSOL = `
<svg viewBox="0 0 400 400" width="100%" height="100%">
  <defs><radialGradient id="drop" cx="40%" cy="35%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#bcd3ee"/></radialGradient></defs>
  <g font-family="Fredoka, sans-serif" font-weight="600" text-anchor="middle">
    <g transform="translate(105,125)">
      <circle r="30" fill="#f2d34f" stroke="#2b2230" stroke-width="5"/><text y="11" font-size="30" fill="#2b2230">S</text>
      <circle cx="-44" cy="22" r="21" fill="#e2553f" stroke="#2b2230" stroke-width="5"/><text x="-44" y="31" font-size="22" fill="#fff">O</text>
      <circle cx="44" cy="22" r="21" fill="#e2553f" stroke="#2b2230" stroke-width="5"/><text x="44" y="31" font-size="22" fill="#fff">O</text>
      <text y="-46" font-size="30" fill="#fbf3e2">SO₂</text>
    </g>
    <text x="105" y="212" font-size="44" fill="#fbf3e2">+</text>
    <g transform="translate(105,262)">
      <circle r="24" fill="#e2553f" stroke="#2b2230" stroke-width="5"/><text y="9" font-size="22" fill="#fff">O</text>
      <circle cx="-34" cy="-18" r="14" fill="#f4f1ea" stroke="#2b2230" stroke-width="4"/><circle cx="34" cy="-18" r="14" fill="#f4f1ea" stroke="#2b2230" stroke-width="4"/>
      <text y="50" font-size="28" fill="#fbf3e2">H₂O</text>
    </g>
    <path d="M168 200 L228 200" stroke="#fbf3e2" stroke-width="9" stroke-linecap="round"/><path d="M220 184 L244 200 L220 216" fill="none" stroke="#fbf3e2" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <g transform="translate(300,200)">
      <circle r="62" fill="url(#drop)" stroke="#2b2230" stroke-width="5"/>
      <circle cx="-22" cy="-24" r="12" fill="#ffffff" opacity="0.9"/>
      <text y="96" font-size="28" fill="#fbf3e2">droplet</text>
    </g>
  </g>
</svg>`;
