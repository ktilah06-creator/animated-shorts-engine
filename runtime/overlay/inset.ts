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

/** SVG for the inset, chemically complete: SO2 is oxidised (by OH radicals) to sulfuric acid, which condenses with water
 *  into sulfate aerosol droplets. */
export const SO2_OXIDATION = `
<svg viewBox="0 0 400 400" width="100%" height="100%">
  <defs><radialGradient id="drop2" cx="40%" cy="35%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#bcd3ee"/></radialGradient>
    <marker id="ah" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#fbf3e2"/></marker></defs>
  <g font-family="Inter, sans-serif" font-weight="700" text-anchor="middle">
    <g transform="translate(92,150)">
      <circle r="24" fill="#f2d34f" stroke="#2b2230" stroke-width="4"/><text y="9" font-size="24" fill="#2b2230">S</text>
      <circle cx="-34" cy="18" r="16" fill="#e2553f" stroke="#2b2230" stroke-width="4"/><circle cx="34" cy="18" r="16" fill="#e2553f" stroke="#2b2230" stroke-width="4"/>
      <text y="-38" font-size="26" fill="#fbf3e2">SO₂</text>
    </g>
    <path d="M150 150 L222 150" stroke="#fbf3e2" stroke-width="7" stroke-linecap="round" marker-end="url(#ah)"/>
    <text x="188" y="132" font-size="21" fill="#ffd27a">+ OH</text>
    <text x="188" y="182" font-size="17" fill="#ffd27a" font-weight="600">oxidation</text>
    <g transform="translate(300,150)">
      <circle cx="-30" cy="-22" r="13" fill="#e2553f" stroke="#2b2230" stroke-width="3.5"/><circle cx="30" cy="-22" r="13" fill="#e2553f" stroke="#2b2230" stroke-width="3.5"/>
      <circle cx="-30" cy="22" r="13" fill="#e2553f" stroke="#2b2230" stroke-width="3.5"/><circle cx="30" cy="22" r="13" fill="#e2553f" stroke="#2b2230" stroke-width="3.5"/>
      <circle cx="-48" cy="38" r="8" fill="#f4f1ea" stroke="#2b2230" stroke-width="3"/><circle cx="48" cy="38" r="8" fill="#f4f1ea" stroke="#2b2230" stroke-width="3"/>
      <circle r="20" fill="#f2d34f" stroke="#2b2230" stroke-width="4"/><text y="7" font-size="19" fill="#2b2230">S</text>
      <text y="-44" font-size="24" fill="#fbf3e2">H₂SO₄</text>
    </g>
    <path d="M292 206 Q285 248 250 270" fill="none" stroke="#fbf3e2" stroke-width="7" stroke-linecap="round" marker-end="url(#ah)"/>
    <text x="318" y="262" font-size="17" fill="#ffd27a" font-weight="600">+ H₂O</text>
    <g transform="translate(192,298)">
      <circle r="44" fill="url(#drop2)" stroke="#2b2230" stroke-width="4"/>
      <circle cx="-15" cy="-17" r="9" fill="#ffffff" opacity="0.9"/>
      <text y="72" font-size="20" fill="#fbf3e2">sulfate aerosol</text>
    </g>
  </g>
</svg>`;
