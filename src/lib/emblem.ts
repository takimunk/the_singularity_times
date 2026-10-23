// The masthead emblem, variant "exp" with the "contour" texture (brand v8, see branding/HANDOFF.md):
// an engraved blue Earth inside a guilloche ring with a tick bezel. The ring sits on a base rule that rises
// on both sides as y = e^x; the wings are filled with contour lines and the open sky between the wing tips
// holds sparse pixel stars. A red ember marks the visitor's place (guessed from the time zone). Drag to rotate.
//
// Pixel alignment: the base rule is drawn on whole device pixels, and its row and thickness are published to the
// masthead row as --emh (ear height) and --rule-w (ear bottom border), so the ears' bottom border lands on the
// same device rows as the rule.
//
// Hook for the intro animation: setWingGrowth(p) grows the exponentials out of the base rule (0 = flat, 1 = full).

import { cssVar, deviceScale, onRelayout, palette, reducedMotion, rng, withAlpha, type Palette } from './canvas';

const SH = 100; // canvas height, CSS px
const BASE = SH - 6.5; // where the base rule's centre should sit, CSS px from the canvas top (v9)
const RULE_W = 1; // base rule, CSS px (v9: a single 1 px rule)
const RO = 34; // guilloche ring radius
const ROUT = RO + 2.6; // outer ring, tangent to the base rule
const MAX_W = 520;
const EAR_MIN = 200;
const GAP = 20;
const D2R = Math.PI / 180;
const FRAME_MS = 50; // at most ~20 fps
const EMBER_FALLBACK = '#e8301f'; // until brand.css defines --ember

/* Visitor's place, guessed from the time zone (no location permission needed). */
const PLACES: Record<string, [number, number]> = {
  'Europe/Moscow': [55.75, 37.62], 'Europe/London': [51.5, -0.12], 'Europe/Berlin': [52.52, 13.4], 'Europe/Paris': [48.86, 2.35],
  'Europe/Kiev': [50.45, 30.52], 'Europe/Kyiv': [50.45, 30.52], 'Europe/Istanbul': [41, 28.97], 'Europe/Madrid': [40.42, -3.7],
  'Europe/Rome': [41.9, 12.5], 'Europe/Amsterdam': [52.37, 4.9], 'Europe/Warsaw': [52.23, 21.01],
  'Asia/Tbilisi': [41.7, 44.8], 'Asia/Yerevan': [40.18, 44.5], 'Asia/Almaty': [43.24, 76.9], 'Asia/Dubai': [25.2, 55.27],
  'Asia/Kolkata': [19.07, 72.88], 'Asia/Shanghai': [31.23, 121.47], 'Asia/Tokyo': [35.68, 139.69], 'Asia/Singapore': [1.35, 103.82],
  'Asia/Bangkok': [13.75, 100.5], 'Asia/Jerusalem': [31.77, 35.21],
  'America/New_York': [40.71, -74], 'America/Chicago': [41.88, -87.63], 'America/Denver': [39.74, -104.99],
  'America/Los_Angeles': [34.05, -118.24], 'America/Sao_Paulo': [-23.55, -46.63], 'America/Mexico_City': [19.43, -99.13],
  'America/Toronto': [43.65, -79.38], 'Australia/Sydney': [-33.87, 151.21], 'Africa/Cairo': [30.04, 31.24], 'Africa/Lagos': [6.52, 3.38],
};

function guessHere(): [number, number] {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && PLACES[tz]) return PLACES[tz];
  } catch {
    /* fall through */
  }
  return [45, (-new Date().getTimezoneOffset() / 60) * 15];
}

/* ---------- Earth mask: 1024x512, land = 255, ocean = distance to coast x3 ---------- */
const MW = 1024;
const MH = 512;
let mask: Uint8Array | null = null;

function loadMask(onReady: () => void) {
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    const cv = document.createElement('canvas');
    cv.width = MW;
    cv.height = MH;
    const c = cv.getContext('2d', { willReadFrequently: true });
    if (!c) return;
    c.drawImage(img, 0, 0, MW, MH);
    const d = c.getImageData(0, 0, MW, MH).data;
    const m = new Uint8Array(MW * MH);
    for (let i = 0; i < MW * MH; i++) m[i] = d[i * 4];
    mask = m;
    onReady();
  };
  img.src = '/earth.png';
}

/** Engraved globe: horizontal hatching whose weight follows land, coast distance and light. */
export function globe(c: CanvasRenderingContext2D, R: number, lon: number, tilt: number, sp: number, earth: string) {
  if (!mask) return;
  const step = Math.max(0.8, R / 110);
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const L = [-0.55, 0.62, 0.56];
  const ln = Math.hypot(L[0], L[1], L[2]);
  const top: number[] = [];
  const bot: number[] = [];
  c.fillStyle = earth;
  for (let y = -R + sp / 2; y < R; y += sp) {
    const half = Math.sqrt(R * R - y * y);
    top.length = 0;
    bot.length = 0;
    for (let x = -half; x <= half; x += step) {
      const nx = x / R;
      const ny = -y / R;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const yy = ny * ct + nz * st;
      const zz = -ny * st + nz * ct;
      const lat = Math.asin(Math.max(-1, Math.min(1, yy)));
      const u = ((((Math.atan2(nx, zz) + lon) / (2 * Math.PI) + 0.5) % 1) + 1) % 1;
      const v = Math.min(MH - 1, Math.max(0, ((0.5 - lat / Math.PI) * MH) | 0));
      const m = mask[v * MW + ((u * MW) | 0)];
      const shade = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / ln);
      let d: number;
      if (m === 255) d = 0.12 + 0.22 * (1 - shade);
      else {
        d = 0.45 + 0.5 * (1 - shade);
        if (m <= 9) d = 1;
        else if (m < 120 && (m / 3) % 7 < 1.6) d = Math.min(1, d + 0.38 * (1 - m / 120));
      }
      const limb = Math.min(1, (half - Math.abs(x)) / (R * 0.06));
      const w = sp * 0.5 * d * (0.4 + 0.6 * limb);
      top.push(x, y - w);
      bot.push(x, y + w);
    }
    if (top.length < 4) continue;
    c.beginPath();
    c.moveTo(top[0], top[1]);
    for (let i = 2; i < top.length; i += 2) c.lineTo(top[i], top[i + 1]);
    for (let i = bot.length - 2; i >= 0; i -= 2) c.lineTo(bot[i], bot[i + 1]);
    c.closePath();
    c.fill();
  }
  c.beginPath();
  c.arc(0, 0, R, 0, Math.PI * 2);
  c.lineWidth = 0.9;
  c.strokeStyle = earth;
  c.stroke();
}

const ring = (c: CanvasRenderingContext2D, r: number, w: number) => {
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.lineWidth = w;
  c.stroke();
};

/* ---------- State ---------- */
interface Geometry {
  dpr: number;
  SW: number; // canvas CSS width
  cx: number; // ring centre, CSS px from the canvas's top left
  cy: number;
  baseY: number; // centre of the base rule, CSS px
  ruleRow: number; // first device row of the base rule
  ruleRows: number; // its thickness in device rows
  x1: number; // half-span of the wings
}

let canvas: HTMLCanvasElement | null = null;
let mast: HTMLElement | null = null;
let layer: HTMLCanvasElement | null = null; // static part: stars, wings, base rule, ring and bezel
let geo: Geometry | null = null;
let pal: Palette | null = null;
let ember = EMBER_FALLBACK;
let growth = 1;
const HERE = guessHere();
let lon = HERE[1] * D2R;
let tilt = Math.max(-1, Math.min(1, HERE[0] * D2R));

/** Device-pixel layout of the canvas and the base rule. */
function measure(): Geometry {
  const dpr = deviceScale();
  const avail = mast?.clientWidth ?? MAX_W;
  const narrow = matchMedia('(max-width: 980px)').matches;
  const SW = 2 * Math.floor(Math.max(160, Math.min(MAX_W, narrow ? avail : avail - 2 * (EAR_MIN + GAP))) / 2); // even: centre on a whole px
  const ruleRows = Math.max(1, Math.round(RULE_W * dpr));
  const ruleRow = Math.round(BASE * dpr - ruleRows / 2);
  const baseY = (ruleRow + ruleRows / 2) / dpr;
  return { dpr, SW, cx: SW / 2, cy: baseY - ROUT, baseY, ruleRow, ruleRows, x1: SW / 2 - 4 };
}

/**
 * Wing curve, centred on the ring: y rises from the base rule as e^x out to side*x1.
 * Growth p (0..1) draws the curve out from the ring toward the tip, as in the v9 prototype's `grow`.
 */
function wingCurve(g: Geometry, side: number, p: number): [number, number][] {
  const base = ROUT;
  const k = 3.6;
  const hMax = base + g.cy - 4;
  const P: [number, number][] = [];
  for (let i = 0; i <= 260 * p; i++) {
    const s = i / 260;
    P.push([side * s * g.x1, base - (hMax * (Math.exp(k * s) - 1)) / (Math.exp(k) - 1)]);
  }
  if (P.length < 2) P.push([side * 0.5, base]);
  return P;
}

function wingPath(c: CanvasRenderingContext2D, P: [number, number][], side: number, x1: number) {
  c.moveTo(0, ROUT);
  for (const [x, y] of P) c.lineTo(x, y);
  c.lineTo(side * x1, ROUT);
  c.closePath();
}

function drawLayer() {
  if (!canvas || !geo || !pal) return;
  const g = geo;
  const { ink, paper } = pal;
  layer ??= document.createElement('canvas');
  layer.width = canvas.width;
  layer.height = canvas.height;
  const c = layer.getContext('2d');
  if (!c) return;
  c.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  c.clearRect(0, 0, g.SW, SH);
  c.save();
  c.translate(g.cx, g.cy);
  const [L, Rt] = [wingCurve(g, -1, growth), wingCurve(g, 1, growth)];
  const top = -g.cy; // canvas top

  // The open sky: sparse pixel stars only inside the bowl, i.e. above both curves (1.5 px clear of them),
  // between the curves' ends (never past the wing tips), below the canvas top, outside the medallion.
  c.save();
  c.beginPath();
  c.moveTo(L[L.length - 1][0], top);
  for (let i = L.length - 1; i >= 0; i--) c.lineTo(L[i][0], L[i][1] - 1.5);
  for (const [x, y] of Rt) c.lineTo(x, y - 1.5);
  c.lineTo(Rt[Rt.length - 1][0], top);
  c.closePath();
  c.clip();
  c.beginPath();
  c.rect(-g.x1, top, 2 * g.x1, ROUT - top);
  c.moveTo(ROUT + 3, 0);
  c.arc(0, 0, ROUT + 3, 0, Math.PI * 2);
  c.clip('evenodd');
  c.fillStyle = ink;
  const r = rng(2026);
  for (let i = 0; i < 260; i++) {
    const x = (r() - 0.5) * g.SW;
    const y = top + Math.pow(r(), 0.75) * SH;
    c.globalAlpha = (0.35 + 0.65 * r()) * growth;
    const big = r() >= 0.9;
    c.fillRect(Math.round(x), Math.round(y + g.cy) - g.cy, big ? 1.5 : 1, big ? 1.5 : 1); // whole CSS px
  }
  c.globalAlpha = 1;
  c.restore();

  // Wings: contour lines inside each curve, the curve itself, and a vertical at its end. No secondary hairline.
  c.strokeStyle = ink;
  [L, Rt].forEach((P, i) => {
    const side = i ? 1 : -1;
    const end = P[P.length - 1];
    const hMax = ROUT - end[1];
    if (hMax > 0.01) {
      c.save();
      c.beginPath();
      wingPath(c, P, side, g.x1);
      c.clip();
      c.lineWidth = 0.42;
      for (let off = 2.4; off < hMax + 6; off += 2.4) {
        c.beginPath();
        P.forEach(([x, y], j) => {
          const yy = Math.min(ROUT, y + off);
          if (j) c.lineTo(x, yy);
          else c.moveTo(x, yy);
        });
        c.stroke();
      }
      c.restore();
    }
    c.beginPath();
    P.forEach(([x, y], j) => (j ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.lineWidth = 1.3;
    c.stroke();
    c.beginPath();
    c.moveTo(end[0], end[1]);
    c.lineTo(end[0], ROUT);
    c.lineWidth = 1;
    c.stroke();
  });
  c.restore();

  // Base rule: whole device rows, the same rows as the ears' bottom border.
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = ink;
  c.fillRect(0, g.ruleRow, Math.round(g.SW * g.dpr), g.ruleRows); // full emblem width, as in v9
  c.restore();

  // Medallion: paper disc over the wings, guilloche, rings and the tick bezel.
  c.save();
  c.translate(g.cx, g.cy);
  const R = RO * 0.72;
  c.fillStyle = paper;
  c.beginPath();
  c.arc(0, 0, ROUT + 1.5, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = ink;
  const gIn = RO * 0.86;
  const gOut = RO * 0.985;
  c.lineWidth = 0.42;
  for (let i = 0; i < 8; i++) {
    c.beginPath();
    for (let j = 0; j <= 540; j++) {
      const th = (j / 540) * Math.PI * 2;
      const rr = gIn + (gOut - gIn) * (0.5 + 0.5 * Math.sin(13 * th + (i * 2 * Math.PI) / 8));
      const x = rr * Math.cos(th);
      const y = rr * Math.sin(th);
      if (j) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.closePath();
    c.stroke();
  }
  ring(c, RO, 0.45);
  ring(c, ROUT, 1.3);
  ring(c, gIn - 1.5, 0.6);
  const tIn = R + 4;
  const tOut = gIn - 3.5;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const long = i % 6 === 0;
    const r0 = long ? tIn : tIn + (tOut - tIn) * 0.45;
    c.beginPath();
    c.moveTo(r0 * Math.cos(a), r0 * Math.sin(a));
    c.lineTo(tOut * Math.cos(a), tOut * Math.sin(a));
    c.lineWidth = long ? 0.9 : 0.42;
    c.stroke();
  }
  ring(c, tOut, 0.6);
  ring(c, R + 2.5, 1.2);
  c.fillStyle = paper;
  c.beginPath();
  c.arc(0, 0, R, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** One frame: the static layer, the globe at the current rotation and the ember. */
function drawFrame(t = 0) {
  if (!canvas || !geo || !pal || !layer) return;
  const c = canvas.getContext('2d');
  if (!c) return;
  const g = geo;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.drawImage(layer, 0, 0);
  c.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  c.save();
  c.translate(g.cx, g.cy);
  const R = RO * 0.72;
  globe(c, R, lon, tilt, Math.max(1.6, R / 15), pal.earth);
  // You are here: a small ember with a soft glow and a barely visible pulse.
  const ph = HERE[0] * D2R;
  const dl = HERE[1] * D2R - lon;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const yy = Math.sin(ph);
  const xx = Math.cos(ph) * Math.sin(dl);
  const zz = Math.cos(ph) * Math.cos(dl);
  const ny = yy * ct - zz * st;
  const nz = yy * st + zz * ct;
  if (nz > 0) {
    const px = xx * R;
    const py = -ny * R;
    const pulse = reducedMotion() ? 0 : 0.5 + 0.5 * Math.sin(t * 0.0021);
    const glow = c.createRadialGradient(px, py, 0, px, py, 6 + pulse * 0.8);
    glow.addColorStop(0, withAlpha(ember, 0.55));
    glow.addColorStop(0.45, withAlpha(ember, 0.18));
    glow.addColorStop(1, withAlpha(ember, 0));
    c.fillStyle = glow;
    c.beginPath();
    c.arc(px, py, 7, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(px, py, 3.2 + pulse * 0.35, 0, Math.PI * 2);
    c.lineWidth = 0.4;
    c.strokeStyle = withAlpha(ember, 0.35 + 0.15 * pulse);
    c.stroke();
    c.beginPath();
    c.arc(px, py, 1.5, 0, Math.PI * 2);
    c.fillStyle = ember;
    c.fill();
  }
  c.restore();
}

function layout() {
  if (!canvas || !mast) return;
  pal = palette();
  ember = cssVar('--ember') || EMBER_FALLBACK;
  geo = measure();
  canvas.style.width = `${geo.SW}px`;
  canvas.style.height = `${SH}px`;
  canvas.width = Math.round(geo.SW * geo.dpr);
  canvas.height = Math.round(SH * geo.dpr);
  // The ears end exactly where the base rule ends: same device rows, same thickness.
  mast.style.setProperty('--emh', `${(geo.ruleRow + geo.ruleRows) / geo.dpr}px`);
  mast.style.setProperty('--rule-w', `${geo.ruleRows / geo.dpr}px`);
  drawLayer();
  drawFrame(performance.now());
}

/* ---------- Public API ---------- */

/**
 * Intro hook: how far the exponential wings have grown out of the base rule, 0 (flat) to 1 (full, the default).
 * Cheap enough to call every animation frame.
 */
export function setWingGrowth(p: number) {
  growth = Math.max(0, Math.min(1, p));
  drawLayer();
  drawFrame(performance.now());
}

export function getWingGrowth(): number {
  return growth;
}

/** True once the Earth mask has loaded (globe() draws nothing before that). */
export function hasMask(): boolean {
  return mask !== null;
}

/** The emblem globe's current rotation, so the intro's Earth can land on exactly the same view. */
export function emblemView(): { lon: number; tilt: number } {
  return { lon, tilt };
}

/** Where the Earth sits, in CSS px relative to the viewport, for an intro that lands a planet in the emblem. */
export function emblemGeometry(): { x: number; y: number; r: number; ringR: number; baseY: number } | null {
  if (!canvas || !geo) return null;
  const rc = canvas.getBoundingClientRect();
  return { x: rc.left + geo.cx, y: rc.top + geo.cy, r: RO * 0.72, ringR: ROUT, baseY: rc.top + geo.baseY };
}

/** Mounts the emblem on its canvas; mastEl receives --emh and --rule-w for the ears. */
export function mountEmblem(cv: HTMLCanvasElement, mastEl: HTMLElement) {
  canvas = cv;
  mast = mastEl;
  layout();
  loadMask(() => drawFrame(performance.now()));
  onRelayout(layout);

  // Drag to rotate.
  let drag: { x: number; y: number; lon: number; tilt: number } | null = null;
  let pending = false;
  const redraw = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame((t) => {
      pending = false;
      drawFrame(t);
    });
  };
  cv.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, lon, tilt };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    lon = drag.lon - (e.clientX - drag.x) / 28;
    tilt = Math.max(-1.2, Math.min(1.2, drag.tilt + (e.clientY - drag.y) / 28));
    redraw();
  });
  const endDrag = () => {
    drag = null;
  };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // The pulse: at most ~20 fps, only while the emblem is on screen and the tab is visible, never with reduced motion.
  let visible = true;
  let raf = 0;
  let last = 0;
  const frame = (t: number) => {
    raf = 0;
    if (!running()) return;
    if (!drag && t - last >= FRAME_MS) {
      last = t;
      drawFrame(t);
    }
    raf = requestAnimationFrame(frame);
  };
  const running = () => visible && !document.hidden && !reducedMotion();
  const kick = () => {
    if (running() && !raf) raf = requestAnimationFrame(frame);
    else if (!running()) drawFrame(0);
  };
  new IntersectionObserver((entries) => {
    visible = entries.some((en) => en.isIntersecting);
    kick();
  }).observe(cv);
  document.addEventListener('visibilitychange', kick);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', kick);
  kick();
}
