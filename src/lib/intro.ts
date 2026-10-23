// Intro (brand v9, Rei Ayanami): the heliocentric Solar System as it stands today, one exponential zoom into Earth
// landing exactly on the emblem's globe, a 700 ms dissolve, then the emblem's exponentials grow out of the base rule.
// Production rules: once per session, never with prefers-reduced-motion, the page stays usable underneath
// (the overlay takes no pointer events; click, key, wheel or touch skips to the landing).

import { DPR, cssVar, fit, palette, reducedMotion, rng, withAlpha, type Palette } from './canvas';
import { emblemGeometry, emblemView, globe, hasMask, setWingGrowth } from './emblem';

const D2R = Math.PI / 180;
const SEEN_KEY = 'tst:intro-seen';

/* JPL "Keplerian elements for approximate positions", J2000: a, e, L, dL/century, perihelion, d/century */
type Elements = [number, number, number, number, number, number];
const EL: Record<string, Elements> = {
  mercury: [0.38709927, 0.20563593, 252.2503235, 149472.67411175, 77.45779628, 0.16047689],
  venus: [0.72333566, 0.00677672, 181.9790995, 58517.81538729, 131.60246718, 0.00268329],
  earth: [1.00000261, 0.01671123, 100.46457166, 35999.37244981, 102.93768193, 0.32327364],
  mars: [1.52371034, 0.0933941, -4.55343205, 19140.30268499, -23.94362959, 0.44441088],
  jupiter: [5.202887, 0.04838624, 34.39644051, 3034.74612775, 14.72847983, 0.21252668],
  saturn: [9.53667594, 0.05386179, 49.95424423, 1222.49362201, 92.59887831, -0.41897216],
  uranus: [19.18916464, 0.04725744, 313.23810451, 428.48202785, 170.9542763, 0.40805281],
  neptune: [30.06992276, 0.00859048, -55.12002969, 218.45945325, 44.96476227, -0.32241464],
};

function helio(k: string, T: number): [number, number] {
  const [a, e, L0, Ld, w0, wd] = EL[k];
  const L = (L0 + Ld * T) * D2R;
  const w = (w0 + wd * T) * D2R;
  const M = ((((L - w) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
  let E = M;
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const x = a * (Math.cos(E) - e);
  const y = a * Math.sqrt(1 - e * e) * Math.sin(E);
  return [x * Math.cos(w) - y * Math.sin(w), x * Math.sin(w) + y * Math.cos(w)];
}

// Orbit inks come from --planet-<name> in brand.css (Earth uses --earth); the values here are fallbacks.
const PLAN: [string, string, string | null, number][] = [
  ['mercury', 'Mercury', '#8C8577', 1.6],
  ['venus', 'Venus', '#C29A2E', 2.3],
  ['earth', 'Earth', null, 2.6],
  ['mars', 'Mars', '#C2452D', 2],
  ['jupiter', 'Jupiter', '#A86B3C', 4.6],
  ['saturn', 'Saturn', '#8F7F45', 3.9],
  ['uranus', 'Uranus', '#3C8E92', 3.1],
  ['neptune', 'Neptune', '#3550A6', 3.1],
];
const SUN_FIRE = '#F0781E'; // fallback for --sun-glow
const FLAT = 0.5;
const ZOOM = 70;
const DUR = { sys: 1400, zoom: 3000, fade: 700, grow: 1600 };
const TZ = DUR.sys * 0.7 + DUR.zoom; // landing time

/** Distances drawn as sqrt(AU) so Mercury and Neptune share a page. */
const amap = (x: number, y: number): [number, number] => {
  const r = Math.hypot(x, y) || 1e-9;
  const q = Math.sqrt(r) / r;
  return [x * q, y * q];
};
function orbitPts(k: string, T: number): [number, number][] {
  const [a, e, , , w0, wd] = EL[k];
  const w = (w0 + wd * T) * D2R;
  const b = a * Math.sqrt(1 - e * e);
  const P: [number, number][] = [];
  for (let i = 0; i <= 480; i++) {
    const E = (i / 480) * 2 * Math.PI;
    const x = a * (Math.cos(E) - e);
    const y = b * Math.sin(E);
    P.push(amap(x * Math.cos(w) - y * Math.sin(w), x * Math.sin(w) + y * Math.cos(w)));
  }
  return P;
}
const easeIO = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
const ISTARS = (() => {
  const r = rng(7);
  const S: [number, number, number, number, number][] = [];
  for (let i = 0; i < 520; i++) S.push([r(), r(), 0.2 + 0.6 * r(), r() < 0.9 ? 1 : 1.5, r()]);
  return S;
})();

function engravedBall(c: CanvasRenderingContext2D, p: Palette, x: number, y: number, r: number) {
  c.save();
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = p.paper;
  c.fill();
  c.clip();
  c.strokeStyle = p.ink;
  for (let yy = y - r; yy < y + r; yy += 1.25) {
    c.beginPath();
    c.moveTo(x - r, yy);
    c.lineTo(x + r, yy);
    c.lineWidth = 0.25 + 0.55 * ((yy - (y - r)) / (2 * r));
    c.stroke();
  }
  c.restore();
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.lineWidth = 0.7;
  c.strokeStyle = p.ink;
  c.stroke();
}

function engravedSun(c: CanvasRenderingContext2D, p: Palette, x: number, y: number, r: number) {
  c.strokeStyle = p.ink;
  c.fillStyle = p.paper;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const a2 = a + Math.PI / 16;
    const len = r * (i % 2 ? 0.9 : 1.35);
    c.beginPath();
    c.moveTo(x + Math.cos(a - 0.17) * r, y + Math.sin(a - 0.17) * r);
    c.quadraticCurveTo(x + Math.cos(a + 0.25) * (r + len * 0.6), y + Math.sin(a + 0.25) * (r + len * 0.6), x + Math.cos(a2) * (r + len), y + Math.sin(a2) * (r + len));
    c.quadraticCurveTo(x + Math.cos(a + 0.05) * (r + len * 0.35), y + Math.sin(a + 0.05) * (r + len * 0.35), x + Math.cos(a + 0.2) * r, y + Math.sin(a + 0.2) * r);
    c.closePath();
    c.fill();
    c.lineWidth = 0.5;
    c.stroke();
  }
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.lineWidth = 0.9;
  c.stroke();
  for (let k = 1; k < 4; k++) {
    c.beginPath();
    c.arc(x, y, (r * k) / 4, 0, Math.PI * 2);
    c.lineWidth = 0.35;
    c.stroke();
  }
}

function seenThisSession(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* private mode: the intro may play again, which is fine */
  }
}

/** Should the intro play on this load? Once per session, never with reduced motion. */
export function shouldPlayIntro(): boolean {
  return !reducedMotion() && !seenThisSession() && emblemGeometry() !== null;
}

/**
 * Plays the intro on the overlay canvas (rendered hidden; shown only here). Resolves when the wings have grown.
 * `force` ignores the once-per-session rule (for reviews); reduced motion always skips it.
 */
export function playIntro(cv: HTMLCanvasElement, force = false): Promise<void> {
  if (reducedMotion() || (!force && !shouldPlayIntro())) {
    setWingGrowth(1);
    return Promise.resolve();
  }
  const ctx = cv.getContext('2d');
  if (!ctx) {
    setWingGrowth(1);
    return Promise.resolve();
  }
  markSeen();
  const c = ctx;
  const pal = palette();
  const body = cssVar('--f-body') || 'serif';
  const colors = PLAN.map(([k, , col]) => (col ? cssVar(`--planet-${k}`) || col : pal.earth));
  const sun = cssVar('--sun-glow') || SUN_FIRE;
  const fire = [withAlpha(sun, 0.35), withAlpha(sun, 0.08), withAlpha(sun, 0)];

  setWingGrowth(0);
  cv.hidden = false;
  cv.style.opacity = '1';
  let t0 = performance.now();
  let raf = 0;
  let growing = false;

  return new Promise<void>((resolve) => {
    const skip = () => {
      if (performance.now() - t0 < TZ) t0 = performance.now() - TZ;
    };
    const opts = { capture: true, passive: true } as const;
    addEventListener('pointerdown', skip, opts);
    addEventListener('keydown', skip, opts);
    addEventListener('wheel', skip, opts);
    addEventListener('touchstart', skip, opts);
    const cleanup = () => {
      removeEventListener('pointerdown', skip, opts);
      removeEventListener('keydown', skip, opts);
      removeEventListener('wheel', skip, opts);
      removeEventListener('touchstart', skip, opts);
    };

    const grow = () => {
      if (growing) return;
      growing = true;
      const start = performance.now() + 150;
      const step = (now: number) => {
        const u = clamp01((now - start) / DUR.grow);
        setWingGrowth(1 - Math.pow(1 - u, 3));
        if (u < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    };

    const end = () => {
      cancelAnimationFrame(raf);
      cv.hidden = true;
      cv.style.opacity = '0';
      cleanup();
      grow();
    };

    const frame = (now: number) => {
      const geo = emblemGeometry();
      if (!geo) return end();
      const t = now - t0;
      const [vw, vh] = fit(cv);
      c.setTransform(DPR, 0, 0, DPR, 0, 0);
      c.fillStyle = pal.paper;
      c.fillRect(0, 0, vw, vh);
      const appear = clamp01(t / DUR.sys);
      const ez = easeIO(clamp01((t - DUR.sys * 0.7) / DUR.zoom));
      const p = clamp01(t / TZ);
      const d = Date.now() / 86400000 + 2440587.5 - 2451545.0 - 160 * Math.pow(1 - p, 3); // time runs fast, then settles on today
      const T = d / 36525;
      const s0 = Math.min(vw * 0.45, (vh * 0.45) / FLAT) / Math.sqrt(31);
      const s = s0 * Math.pow(ZOOM, ez);
      const g = Math.pow(ZOOM, (ez * Math.log(geo.r / 2.6)) / Math.log(ZOOM)); // Earth grows from 2.6 px to the emblem globe
      const C0 = [vw / 2, vh / 2 + 8];
      const A = [geo.x, geo.y]; // the emblem globe's centre, read live
      const Em = amap(...helio('earth', T));
      const E0 = [C0[0] + Em[0] * s0, C0[1] - Em[1] * s0 * FLAT];
      const Es = [E0[0] + (A[0] - E0[0]) * ez, E0[1] + (A[1] - E0[1]) * ez];
      const S = [Es[0] - Em[0] * s, Es[1] + Em[1] * s * FLAT];
      const P = ([x, y]: [number, number]): [number, number] => [S[0] + x * s, S[1] - y * s * FLAT];

      // The sky, drifting a little against the zoom.
      c.fillStyle = pal.ink;
      for (const [x, y, a, z, tw] of ISTARS) {
        const sx = (((x * vw + (S[0] - C0[0]) * 0.04 * tw) % vw) + vw) % vw;
        const sy = (((y * vh + (S[1] - C0[1]) * 0.04 * tw) % vh) + vh) % vh;
        c.globalAlpha = a * appear * (1 - 0.5 * ez);
        c.fillRect(Math.round(sx), Math.round(sy), z, z);
      }
      c.globalAlpha = 1;
      const fadeOrb = 1 - clamp01((ez - 0.62) / 0.33);
      const label = appear * clamp01(1 - ez * 5);

      // Orbits draw themselves in, each one trailing behind its planet.
      const pos: [string, string, [number, number], number, number][] = [];
      PLAN.forEach(([k, name, , rad], i) => {
        const O = orbitPts(k, T);
        const q = amap(...helio(k, T));
        const pq = P(q);
        let j0 = 0;
        let best = 1e9;
        O.forEach(([x, y], j) => {
          const dd = (x - q[0]) ** 2 + (y - q[1]) ** 2;
          if (dd < best) {
            best = dd;
            j0 = j;
          }
        });
        const prog = clamp01(appear * 1.5 - i * 0.07);
        const n = Math.round(480 * easeIO(prog));
        if (n > 1 && (fadeOrb > 0 || k === 'earth')) {
          c.beginPath();
          for (let m = 0; m <= n; m++) {
            const [x, y] = P(O[(j0 - m + 480 * 4) % 480]);
            if (m) c.lineTo(x, y);
            else c.moveTo(x, y);
          }
          c.strokeStyle = colors[i];
          c.globalAlpha = k === 'earth' ? 0.9 * (1 - 0.6 * ez) : 0.8 * fadeOrb;
          c.lineWidth = k === 'earth' ? 1 : 0.75;
          c.stroke();
          c.globalAlpha = 1;
        }
        pos.push([k, name, pq, rad * g, prog]);
      });

      // The Sun, engraved, with a little fire.
      const sunR = 8 * g;
      if (S[0] > -sunR * 4 && S[0] < vw + sunR * 4 && S[1] > -sunR * 4 && S[1] < vh + sunR * 4) {
        c.globalAlpha = appear;
        const fg = c.createRadialGradient(S[0], S[1], sunR * 0.6, S[0], S[1], sunR * 3.2);
        fg.addColorStop(0, fire[0]);
        fg.addColorStop(0.5, fire[1]);
        fg.addColorStop(1, fire[2]);
        c.fillStyle = fg;
        c.beginPath();
        c.arc(S[0], S[1], sunR * 3.2, 0, Math.PI * 2);
        c.fill();
        engravedSun(c, pal, S[0], S[1], sunR);
        c.globalAlpha = 1;
      }
      const view = emblemView();
      for (const [k, name, [x, y], r, prog] of pos) {
        if (x < -r * 3 || x > vw + r * 3 || y < -r * 3 || y > vh + r * 3) continue;
        c.globalAlpha = clamp01(prog * 2);
        if (k === 'earth') {
          const gl = clamp01((r - 6) / 5);
          if (gl < 1) {
            c.globalAlpha *= 1 - gl;
            c.beginPath();
            c.arc(x, y, r, 0, Math.PI * 2);
            c.fillStyle = pal.earth;
            c.fill();
            c.globalAlpha = clamp01(prog * 2);
          }
          if (gl > 0 && hasMask()) {
            c.save();
            c.globalAlpha = gl;
            c.translate(x, y);
            c.fillStyle = pal.paper;
            c.beginPath();
            c.arc(0, 0, r, 0, Math.PI * 2);
            c.fill();
            globe(c, r, view.lon + (1 - ez) * 2.2, view.tilt, Math.max(1.6, r / 15), pal.earth);
            c.restore();
          }
        } else {
          engravedBall(c, pal, x, y, r);
          if (k === 'saturn') {
            c.beginPath();
            c.ellipse(x, y, r * 2, r * 0.6, -0.35, 0, Math.PI * 2);
            c.lineWidth = 0.7;
            c.strokeStyle = pal.ink;
            c.stroke();
          }
        }
        if (label > 0) {
          c.globalAlpha = label;
          c.font = `italic 11px ${body}`;
          c.fillStyle = pal.soft;
          c.fillText(name, x + r + 4, y - r - 2);
        }
        c.globalAlpha = 1;
      }
      if (label > 0) {
        c.globalAlpha = label;
        c.font = `italic 13px ${body}`;
        c.fillStyle = pal.soft;
        c.textAlign = 'center';
        c.fillText('The Solar System, as it stands today', vw / 2, vh - 28);
        c.textAlign = 'left';
        c.globalAlpha = 1;
      }

      // Land: the overlay dissolves into the page, where the emblem's Earth is already waiting.
      const f = clamp01((t - TZ) / DUR.fade);
      cv.style.opacity = String(1 - f);
      if (t > TZ) grow();
      if (f >= 1) return end();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  });
}
