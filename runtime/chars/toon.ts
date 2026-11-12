// Character drawing system (engine-owned design language): "storybook paper-cutout" figures drawn on a 2D canvas
// every frame from a Design (who they are) and a Pose (what they do now). Characters are ~4.6 heads tall, rounded-square
// heads (large), oval eyes with one highlight, short thick brows, rosy cheeks, warm brown outline, mitten hands. Drawing is
// deterministic (no clocks, no randomness), so a pose fully defines a frame.
//
// Card space: canvas CW x CH px, feet centre at (CW/2, GROUND); +x screen right, +y down. Angles in degrees.
// Arms: 0 = hanging down, + = raised outward (away from the body). Elbow + = forearm turns further outward/up.
// Legs: hip + = leg swings outward/forward in the picture plane, knee + = bends. Mirror with pose.flip.

export const CW = 640, CH = 1000, GROUND = 975;
const HP = 880;                 // drawn height of an adult in px (head top to sole)
const U = HP / 4.6;             // head unit (figures are ~4.6 heads tall)
const HEAD = 1.18;              // head drawing scale
const INK = "#3a2622";

export type Expression = "neutral" | "happy" | "surprised" | "worried" | "sad" | "cold" | "determined" | "awe";
export type Mouth = "smile" | "grin" | "flat" | "o" | "frown" | "open" | "teeth" | "small";

export type Design = {
  id: string;
  skin: string; cheek?: string;
  hair: { color: string; style: "bun" | "short" | "tied" | "bald" | "long" };
  hat?: { kind: "bonnet" | "brim" | "cap" | "none"; color: string; band?: string };
  top: { color: string; shade?: string; kind: "dress" | "shirt"; collar?: string };
  vest?: string;                 // waistcoat colour (over shirt)
  shawl?: string;                // shawl over the shoulders
  apron?: string;
  bottom: { kind: "skirt" | "trousers"; color: string };
  boots: string;
  stockings?: string;            // legs under a skirt
  eyes?: string;
  scale?: number;                // 1 = adult; children ~0.72
  build?: number;                // shoulder width factor (1 = default)
  beard?: string;
};

export type Pose = {
  expression?: Expression;
  mouth?: Mouth;                 // overrides the expression's mouth (e.g. talking)
  blink?: number;                // 0 open .. 1 closed
  look?: [number, number];       // pupil offset -1..1
  turn?: number;                 // -1 .. 1 face turn (3/4 views)
  tilt?: number;                 // head tilt
  lean?: number;                 // body lean
  bob?: number;                  // vertical body offset (px, + up)
  armL?: [number, number];       // screen-left arm: [shoulder, elbow]
  armR?: [number, number];
  legL?: [number, number];       // [hip, knee]
  legR?: [number, number];
  flip?: boolean;
  kneel?: number;                // 0 standing .. 1 kneeling on both knees (body drops by the shin length)
  shiver?: number;               // 0..1 cold shiver (tiny horizontal jitter, frame-driven by caller)
  hold?: (g: CanvasRenderingContext2D, hand: { x: number; y: number; a: number }, side: "L" | "R") => void;
  light?: { side: number; shade: string; amount: number }; // side -1/1 = which screen side is in shade
};

const EXPR: Record<Expression, { brow: [number, number]; mouth: Mouth; lid: number; pupil: number }> = {
  neutral: { brow: [0, 0], mouth: "small", lid: 0, pupil: 1 },
  happy: { brow: [-6, 6], mouth: "smile", lid: 0.15, pupil: 1 },
  surprised: { brow: [-22, 0], mouth: "o", lid: -0.15, pupil: 0.8 },
  worried: { brow: [-18, -2], mouth: "frown", lid: 0.05, pupil: 1 },
  sad: { brow: [-20, 6], mouth: "frown", lid: 0.35, pupil: 1 },
  cold: { brow: [-14, 2], mouth: "teeth", lid: 0.25, pupil: 1 },
  determined: { brow: [6, 14], mouth: "flat", lid: 0.2, pupil: 1 },
  awe: { brow: [-16, -4], mouth: "open", lid: -0.1, pupil: 0.9 },
};

const rad = (d: number) => (d * Math.PI) / 180;

function shape(g: CanvasRenderingContext2D, fill: string, draw: () => void, lw = 7) {
  g.beginPath(); draw(); g.fillStyle = fill; g.fill();
  g.lineWidth = lw; g.strokeStyle = INK; g.lineJoin = "round"; g.lineCap = "round"; g.stroke();
}

/** continuous limb through three points (hip/shoulder, knee/elbow, end) with tapering width */
function limbPts(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, w1: number, w2: number, col: string) {
  const seg = (ax: number, ay: number, bx: number, by: number, wa: number, wb: number) => {
    const ang = Math.atan2(by - ay, bx - ax), nx = -Math.sin(ang), ny = Math.cos(ang);
    g.moveTo(ax + nx * wa, ay + ny * wa); g.lineTo(bx + nx * wb, by + ny * wb);
    g.arc(bx, by, wb, ang + Math.PI / 2, ang - Math.PI / 2, true);
    g.lineTo(ax - nx * wa, ay - ny * wa); g.arc(ax, ay, wa, ang - Math.PI / 2, ang + Math.PI / 2, true); g.closePath();
  };
  const path = () => { g.beginPath(); seg(x0, y0, x1, y1, w1, (w1 + w2) / 2); seg(x1, y1, x2, y2, (w1 + w2) / 2, w2); };
  path(); g.lineWidth = 14; g.strokeStyle = INK; g.lineJoin = "round"; g.stroke();
  path(); g.fillStyle = col; g.fill("nonzero");
}

/** limb from (x,y) along angle a (deg from straight down, + toward `out`), two segments; returns end + angle */
function limb(g: CanvasRenderingContext2D, x: number, y: number, a1: number, a2: number, l1: number, l2: number, w1: number, w2: number, out: number, col: string) {
  const A1 = rad(a1) * out, A2 = rad(a1 + a2) * out;
  const ex = x - Math.sin(-A1) * l1 * 1, ey = y + Math.cos(A1) * l1;
  const hx = ex + Math.sin(A2) * l2, hy = ey + Math.cos(A2) * l2;
  // one continuous limb: both segments are outlined first (double width) and then filled on top, so the outline
  // runs only around the outside and there is no line at the elbow / knee
  const seg = (ax: number, ay: number, bx: number, by: number, wa: number, wb: number) => {
    const ang = Math.atan2(by - ay, bx - ax), nx = -Math.sin(ang), ny = Math.cos(ang);
    g.moveTo(ax + nx * wa, ay + ny * wa);
    g.lineTo(bx + nx * wb, by + ny * wb);
    g.arc(bx, by, wb, ang + Math.PI / 2, ang - Math.PI / 2, true);
    g.lineTo(ax - nx * wa, ay - ny * wa);
    g.arc(ax, ay, wa, ang - Math.PI / 2, ang + Math.PI / 2, true);
    g.closePath();
  };
  const path = () => { g.beginPath(); seg(x, y, ex, ey, w1, (w1 + w2) / 2); seg(ex, ey, hx, hy, (w1 + w2) / 2, w2); };
  path(); g.lineWidth = 14; g.strokeStyle = INK; g.lineJoin = "round"; g.stroke();
  path(); g.fillStyle = col; g.fill("nonzero");
  return { x: hx, y: hy, a: A2 };
}

function hand(g: CanvasRenderingContext2D, x: number, y: number, a: number, skin: string) {
  g.save(); g.translate(x, y); g.rotate(-a);
  shape(g, skin, () => { g.ellipse(0, 14, 19, 23, 0, 0, Math.PI * 2); });
  shape(g, skin, () => { g.ellipse(-15, 6, 7, 11, -0.6, 0, Math.PI * 2); }, 5);  // thumb
  g.restore();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function face(g: CanvasRenderingContext2D, d: Design, p: Pose, cx: number, cy: number) {
  const e = EXPR[p.expression ?? "neutral"];
  const turn = p.turn ?? 0, fx = cx + turn * 22;
  const blink = Math.min(1, Math.max(0, (p.blink ?? 0) + e.lid));
  const [lx, ly] = p.look ?? [0, 0];
  // eyes
  for (const s of [-1, 1]) {
    const ex = fx + s * 30 + (s === Math.sign(turn) ? turn * 4 : turn * 2), ey = cy - 2;
    const sx = s === -Math.sign(turn) ? 1 - Math.abs(turn) * 0.25 : 1;
    const h = 19 * (1 - blink);
    if (h > 3) {
      shape(g, "#fffaf2", () => g.ellipse(ex, ey, 12 * sx, h, 0, 0, Math.PI * 2), 4);
      g.save(); g.beginPath(); g.ellipse(ex, ey, 12 * sx, h, 0, 0, Math.PI * 2); g.clip();
      g.fillStyle = d.eyes ?? "#3b2a26";
      g.beginPath(); g.ellipse(ex + lx * 5, ey + ly * 6 + 2, 8 * sx * e.pupil, 11 * e.pupil, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#ffffff"; g.beginPath(); g.arc(ex + lx * 5 + 3, ey + ly * 6 - 4, 3.2, 0, Math.PI * 2); g.fill();
      g.restore();
    } else {
      g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.moveTo(ex - 11, ey + 2); g.quadraticCurveTo(ex, ey + 7, ex + 11, ey + 2); g.stroke();
    }
    // brows: [raise inner(-)/lower(+), raise outer(-)...] as y offsets of inner / outer ends
    const [bi, bo] = e.brow;
    g.strokeStyle = INK; g.lineWidth = 8; g.lineCap = "round";
    g.beginPath(); g.moveTo(ex - s * 11, ey - 30 + bi * 0.55); g.lineTo(ex + s * 11, ey - 30 + bo * 0.55); g.stroke();
  }
  // cheeks
  g.fillStyle = d.cheek ?? "rgba(226,110,96,0.32)";
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(fx + s * 44, cy + 26, 14, 9, 0, 0, Math.PI * 2); g.fill(); }
  // nose: small half disc, darker skin
  g.fillStyle = "rgba(120,60,40,0.35)"; g.beginPath(); g.ellipse(fx + turn * 10, cy + 20, 9, 7, 0, 0, Math.PI); g.fill();
  // beard (under mouth)
  if (d.beard) shape(g, d.beard, () => { g.moveTo(fx - 70, cy + 6); g.quadraticCurveTo(fx - 64, cy + 86, fx, cy + 90); g.quadraticCurveTo(fx + 64, cy + 86, fx + 70, cy + 6); g.quadraticCurveTo(fx + 56, cy + 52, fx + 28, cy + 62); g.quadraticCurveTo(fx, cy + 58, fx - 28, cy + 62); g.quadraticCurveTo(fx - 56, cy + 52, fx - 70, cy + 6); g.closePath(); }, 5);
  // mouth
  const m = p.mouth ?? e.mouth, my = cy + 44, mx = fx + turn * 8;
  g.lineWidth = 5; g.strokeStyle = INK; g.lineCap = "round";
  const dark = "#6b2a2a";
  switch (m) {
    case "smile": g.beginPath(); g.moveTo(mx - 16, my - 3); g.quadraticCurveTo(mx, my + 12, mx + 16, my - 3); g.stroke(); break;
    case "grin": shape(g, dark, () => { g.moveTo(mx - 20, my - 5); g.quadraticCurveTo(mx, my + 22, mx + 20, my - 5); g.closePath(); }, 5); break;
    case "flat": g.beginPath(); g.moveTo(mx - 12, my + 2); g.lineTo(mx + 12, my + 2); g.stroke(); break;
    case "small": g.beginPath(); g.moveTo(mx - 9, my); g.quadraticCurveTo(mx, my + 5, mx + 9, my); g.stroke(); break;
    case "o": shape(g, dark, () => g.ellipse(mx, my + 4, 9, 12, 0, 0, Math.PI * 2), 5); break;
    case "open": shape(g, dark, () => g.ellipse(mx, my + 3, 13, 9, 0, 0, Math.PI * 2), 5); break;
    case "frown": g.beginPath(); g.moveTo(mx - 15, my + 6); g.quadraticCurveTo(mx, my - 5, mx + 15, my + 6); g.stroke(); break;
    case "teeth":
      shape(g, "#fffaf2", () => roundRect(g, mx - 16, my - 4, 32, 14, 5), 5);
      g.beginPath(); g.moveTo(mx - 14, my + 3); g.lineTo(mx + 14, my + 3); g.lineWidth = 3; g.stroke(); break;
  }
}

function headShape(g: CanvasRenderingContext2D, cx: number, cy: number) {
  // rounded square, a little wider at the cheeks than the crown
  const w = 76, top = cy - 92, bot = cy + 80;
  g.moveTo(cx - w + 10, top + 30);
  g.quadraticCurveTo(cx - w + 6, top, cx, top - 2);
  g.quadraticCurveTo(cx + w - 6, top, cx + w - 10, top + 30);
  g.quadraticCurveTo(cx + w + 6, cy + 30, cx + w - 18, bot - 18);
  g.quadraticCurveTo(cx, bot + 6, cx - w + 18, bot - 18);
  g.quadraticCurveTo(cx - w - 6, cy + 30, cx - w + 10, top + 30);
  g.closePath();
}

function hairBack(g: CanvasRenderingContext2D, d: Design, cx: number, cy: number) {
  const c = d.hair.color;
  if (d.hair.style === "long") shape(g, c, () => { g.moveTo(cx - 86, cy - 40); g.quadraticCurveTo(cx - 100, cy + 120, cx - 60, cy + 150); g.lineTo(cx + 60, cy + 150); g.quadraticCurveTo(cx + 100, cy + 120, cx + 86, cy - 40); g.closePath(); });
  if (d.hair.style === "bun" && d.hat?.kind !== "bonnet") shape(g, c, () => g.ellipse(cx + 8, cy - 100, 34, 28, 0, 0, Math.PI * 2));
}

function hairFront(g: CanvasRenderingContext2D, d: Design, cx: number, cy: number, turn: number) {
  const c = d.hair.color, o = turn * 10;
  if (d.hair.style === "bald") return;
  shape(g, c, () => {
    g.moveTo(cx - 80, cy - 20);
    g.quadraticCurveTo(cx - 86, cy - 104, cx + o, cy - 98);
    g.quadraticCurveTo(cx + 86, cy - 104, cx + 80, cy - 20);
    if (d.hair.style === "short") { g.quadraticCurveTo(cx + 60, cy - 56, cx + 10 + o, cy - 60); g.quadraticCurveTo(cx - 40 + o, cy - 70, cx - 80, cy - 20); }
    else { g.quadraticCurveTo(cx + 40, cy - 74, cx + o, cy - 64); g.quadraticCurveTo(cx - 40, cy - 74, cx - 80, cy - 20); }
    g.closePath();
  });
}

function hat(g: CanvasRenderingContext2D, d: Design, cx: number, cy: number) {
  const h = d.hat;
  if (!h || h.kind === "none") return;
  if (h.kind === "bonnet") {
    shape(g, h.color, () => { g.moveTo(cx - 100, cy + 10); g.quadraticCurveTo(cx - 112, cy - 132, cx, cy - 128); g.quadraticCurveTo(cx + 112, cy - 132, cx + 100, cy + 10); g.quadraticCurveTo(cx + 86, cy - 74, cx, cy - 80); g.quadraticCurveTo(cx - 86, cy - 74, cx - 100, cy + 10); g.closePath(); });
    if (h.band) { // ribbon band across the bonnet and a small bow under the chin
      g.strokeStyle = h.band; g.lineWidth = 9; g.beginPath(); g.moveTo(cx - 98, cy - 6); g.quadraticCurveTo(cx, cy - 92, cx + 98, cy - 6); g.stroke();
      for (const sgn of [-1, 1]) shape(g, h.band, () => { g.moveTo(cx, cy + 88); g.quadraticCurveTo(cx + sgn * 26, cy + 70, cx + sgn * 30, cy + 92); g.quadraticCurveTo(cx + sgn * 20, cy + 104, cx, cy + 88); g.closePath(); }, 4);
    }
  } else if (h.kind === "brim") {
    shape(g, h.color, () => g.ellipse(cx, cy - 74, 118, 20, 0, 0, Math.PI * 2));
    shape(g, h.color, () => roundRect(g, cx - 66, cy - 150, 132, 80, 18));
    if (h.band) { g.fillStyle = h.band; g.fillRect(cx - 63, cy - 92, 126, 14); }
  } else if (h.kind === "cap") {
    shape(g, h.color, () => { g.moveTo(cx - 82, cy - 50); g.quadraticCurveTo(cx - 80, cy - 128, cx, cy - 124); g.quadraticCurveTo(cx + 80, cy - 128, cx + 82, cy - 50); g.closePath(); });
  }
}

/** Draws one character into g (a CW x CH canvas). */
export function drawCharacter(g: CanvasRenderingContext2D, d: Design, p: Pose) {
  g.save();
  g.clearRect(0, 0, CW, CH);
  const s = d.scale ?? 1, bw = d.build ?? 1;
  g.translate(CW / 2, GROUND);
  if (p.flip) g.scale(-1, 1);
  g.scale(s, s);
  g.translate((p.shiver ?? 0) * 3, -(p.bob ?? 0));
  g.rotate(rad(p.lean ?? 0) * 0.3);
  const hipY = -HP + U * 2.75, shY = -HP + U * 1.3, waistY = -HP + U * 2.1;
  const shX = 82 * bw;
  const legLen = -hipY - 24, thigh = legLen * 0.51, shin = legLen * 0.49;
  const female = d.bottom.kind === "skirt";
  // ---- legs / skirt
  const legW = 30;
  const kn = Math.min(1, Math.max(0, p.kneel ?? 0));
  if (kn > 0) g.translate(0, shin * kn);                          // the whole figure drops by the shin length
  const legs = (side: number, lp: [number, number] | undefined) => {
    const [a, k] = lp ?? [0, 0];
    if (kn > 0.5) {
      // kneeling on one knee, seen from the front: the screen-left knee is on the ground (boot sole behind it), the
      // screen-right leg is raised: thigh out to the side, shin straight down to a planted boot
      const gy = -shin * kn - 4;                                        // ground line after the drop
      const col = d.bottom.kind === "trousers" ? d.bottom.color : d.stockings ?? "#5b4b45";
      if (side < 0) {
        g.save(); g.translate(-78, gy - 8);
        shape(g, d.boots, () => { g.moveTo(22, -14); g.lineTo(-20, -20); g.quadraticCurveTo(-36, -4, -20, 10); g.lineTo(22, 10); g.closePath(); });
        g.restore();
        limbPts(g, -32, hipY, -40, (hipY + gy) / 2, -44, gy - 10, legW, legW - 2, col);
        return { x: -44, y: gy, a: 0 };
      }
      const kx = 32 + thigh * 0.78, ky = hipY + thigh * 0.38;
      limbPts(g, 32, hipY, kx, ky, kx + 6, gy - 20, legW, legW - 4, col);
      g.save(); g.translate(kx + 6, gy - 20);
      shape(g, d.boots, () => { g.moveTo(-22, -14); g.lineTo(-22, 20); g.quadraticCurveTo(40, 32, 44, 14); g.quadraticCurveTo(30, -8, 22, -14); g.closePath(); });
      g.restore();
      return { x: kx, y: gy, a: 0 };
    }
    const e = limb(g, side * 32, hipY, a, -k, thigh, shin, legW, legW - 4, side, d.bottom.kind === "trousers" ? d.bottom.color : d.stockings ?? "#5b4b45");
    // boot
    if (kn > 0.5) return e;
    g.save(); g.translate(e.x, e.y); g.rotate(-e.a * 0.6);
    shape(g, d.boots, () => { g.moveTo(-22, -34); g.lineTo(-22, 2); g.quadraticCurveTo(side * 40, 14, side * 44, -4); g.quadraticCurveTo(side * 30, -26, 22, -34); g.closePath(); });
    g.restore();
  };
  legs(-1, p.legL); legs(1, p.legR);
  if (female) {
    const sw = Math.max(Math.abs((p.legL ?? [0])[0]), Math.abs((p.legR ?? [0])[0])) * 1.6;
    shape(g, d.bottom.color, () => {
      g.moveTo(-shX * 0.72, waistY); g.lineTo(shX * 0.72, waistY);
      g.quadraticCurveTo(shX * 1.3 + sw, -120, shX * 1.25 + sw, -54);
      g.quadraticCurveTo(0, -36, -shX * 1.25 - sw, -54);
      g.quadraticCurveTo(-shX * 1.3 - sw, -120, -shX * 0.72, waistY);
      g.closePath();
    });
    // skirt folds
    g.strokeStyle = "rgba(58,38,34,0.35)"; g.lineWidth = 4;
    for (const fx of [-0.55, 0, 0.55]) { g.beginPath(); g.moveTo(fx * shX * 0.7, waistY + 40); g.quadraticCurveTo(fx * shX * 1.1, -200, fx * shX * 1.3, -60); g.stroke(); }
  }
  // ---- torso
  const tb = female ? waistY + 6 : hipY + 12;
  shape(g, d.top.color, () => {
    g.moveTo(-shX, shY + 22); g.quadraticCurveTo(-shX, shY - 8, -shX + 34, shY - 10);
    g.lineTo(shX - 34, shY - 10); g.quadraticCurveTo(shX, shY - 8, shX, shY + 22);
    g.quadraticCurveTo(shX * 1.04, (shY + tb) / 2, shX * 0.84, tb); g.lineTo(-shX * 0.84, tb);
    g.quadraticCurveTo(-shX * 1.04, (shY + tb) / 2, -shX, shY + 22); g.closePath();
  });
  if (d.vest) shape(g, d.vest, () => { g.moveTo(-shX + 18, shY + 4); g.lineTo(-18, shY + 4); g.lineTo(0, shY + 80); g.lineTo(18, shY + 4); g.lineTo(shX - 18, shY + 4); g.lineTo(shX * 0.8, hipY + 10); g.lineTo(-shX * 0.8, hipY + 10); g.closePath(); });
  if (d.vest) { g.fillStyle = INK; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(12, shY + 110 + i * 34, 4, 0, Math.PI * 2); g.fill(); } }
  if (d.apron) shape(g, d.apron, () => { g.moveTo(-shX * 0.6, waistY + 4); g.lineTo(shX * 0.6, waistY + 4); g.lineTo(shX * 0.85, -110); g.quadraticCurveTo(0, -96, -shX * 0.85, -110); g.closePath(); });
  if (d.top.collar) shape(g, d.top.collar, () => { g.moveTo(-34, shY - 8); g.lineTo(0, shY + 30); g.lineTo(34, shY - 8); g.quadraticCurveTo(0, shY + 4, -34, shY - 8); g.closePath(); }, 5);
  if (!female) { g.fillStyle = INK; g.fillRect(-shX * 0.8, hipY - 2, shX * 1.6, 12); }
  // ---- arms (over torso)
  const handL = limb(g, -shX + 16, shY + 20, ...(p.armL ?? [8, 6]), 148, 132, 27, 23, -1, d.top.color);
  const handR = limb(g, shX - 16, shY + 20, ...(p.armR ?? [8, 6]), 148, 132, 27, 23, 1, d.top.color);
  hand(g, handL.x, handL.y, handL.a, d.skin); hand(g, handR.x, handR.y, handR.a, d.skin);
  p.hold?.(g, handL, "L"); p.hold?.(g, handR, "R");
  if (d.shawl) shape(g, d.shawl, () => { g.moveTo(-shX - 6, shY + 30); g.quadraticCurveTo(-shX + 10, shY - 16, 0, shY - 10); g.quadraticCurveTo(shX - 10, shY - 16, shX + 6, shY + 30); g.quadraticCurveTo(shX * 0.4, shY + 70, 0, shY + 120); g.quadraticCurveTo(-shX * 0.4, shY + 70, -shX - 6, shY + 30); g.closePath(); });
  // ---- neck + head
  const hx = (p.turn ?? 0) * 4, hy = -HP + 92 * HEAD + 4;
  shape(g, d.skin, () => roundRect(g, -21, shY - 50, 42, 56, 12), 6);
  g.save(); g.translate(hx, hy); g.rotate(rad(p.tilt ?? 0)); g.scale(HEAD, HEAD); g.translate(-hx, -hy);
  hairBack(g, d, hx, hy);
  shape(g, d.skin, () => headShape(g, hx, hy));
  for (const sgn of [-1, 1]) shape(g, d.skin, () => g.ellipse(hx + sgn * 78, hy + 6, 11, 17, 0, 0, Math.PI * 2), 5); // ears
  face(g, d, p, hx, hy);
  hairFront(g, d, hx, hy, p.turn ?? 0);
  hat(g, d, hx, hy);
  g.restore();
  g.restore();
  // ---- light: shade band on the side away from the sun, clipped to the figure
  const L = p.light;
  if (L && L.amount > 0) {
    g.save();
    g.globalCompositeOperation = "source-atop";
    // band on the outer side of the figure away from the sun (keeps the face readable)
    const gr = g.createLinearGradient(L.side < 0 ? CW * 0.5 : CW * 0.5, 0, L.side < 0 ? CW * 0.33 : CW * 0.67, 0);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.55, L.shade); gr.addColorStop(1, L.shade);
    g.globalAlpha = L.amount; g.fillStyle = gr; g.fillRect(0, 0, CW, CH);
    g.restore();
  }
}
